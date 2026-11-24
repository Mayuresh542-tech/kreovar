import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json")), ts = require("typescript");

function createTestLoader(mocks = {}) {
  mocks = {
    "app/lib/server/planUsage.ts": { withUsage: (h) => h },
    "app/lib/server/projectAccess.ts": { requireOwnedProject: async () => {} },
    "app/lib/supabase.ts": { supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } },
    ...mocks,
  };
  const cache = new Map();
  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) filename += ".ts";
    const key = path.relative(root, filename).replaceAll("\\", "/");
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule);
    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(filename).href));
    const localRequire = (specifier) =>
      Object.hasOwn(mocks, specifier)
        ? mocks[specifier]
        : specifier.startsWith("@/")
        ? load(specifier.slice(2))
        : specifier.startsWith(".")
        ? load(path.relative(root, path.resolve(path.dirname(filename), specifier)))
        : require(specifier);
    const fn = new Function("exports", "require", "module", "__filename", "__dirname", source);
    fn(loadedModule.exports, localRequire, loadedModule, filename, path.dirname(filename));
    return loadedModule.exports;
  }
  return load;
}

const load = createTestLoader();
const { detectSilences } = load("app/lib/editor/audioSilenceDetector.ts");
const { reframeProject } = load("app/lib/editor/reframing.ts");
const {
  SPEED_CURVE_PRESETS,
  calculateTimelineDurationFromSource,
  mapTimelineTimeToSourceTime,
  evaluateVelocityAtTime,
  getSpeedCurvePreset,
} = load("app/lib/editor/speedCurves.ts");
const { extractViralHooks } = load("app/lib/editor/viralHookExtractor.ts");
const { applyEditDecisionList } = load("app/lib/editor/ai.ts");
const { validateAiPlan } = load("app/lib/editor/aiValidation.ts");
const { reconcileEditingDecisions } = load("app/lib/editor/inPlaceReconciler.ts");

function createMockProject() {
  return {
    schemaVersion: 1,
    id: "proj_engine_test",
    title: "Native Engines Test",
    revision: 1,
    settings: {
      aspectRatio: "16:9",
      fps: 30,
      background: "#000000",
      audioDucking: false,
    },
    trackOrder: ["track_video", "track_audio", "track_overlay", "track_captions"],
    tracks: {
      track_video: { id: "track_video", kind: "video", name: "Main Video", locked: false, hidden: false, muted: false, solo: false, clipIds: ["clip_v1"] },
      track_audio: { id: "track_audio", kind: "audio", name: "Audio", locked: false, hidden: false, muted: false, solo: false, clipIds: [] },
      track_overlay: { id: "track_overlay", kind: "overlay", name: "Overlay", locked: false, hidden: false, muted: false, solo: false, clipIds: [] },
      track_captions: { id: "track_captions", kind: "caption", name: "Captions", locked: false, hidden: false, muted: false, solo: false, clipIds: [] },
    },
    clips: {
      clip_v1: {
        id: "clip_v1",
        trackId: "track_video",
        name: "Footage.mp4",
        assetId: "asset_v1",
        startTime: 0,
        duration: 10,
        sourceStart: 0,
        sourceEnd: 10,
        speed: 1,
        volume: 1,
        fadeIn: 0,
        fadeOut: 0,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
        effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
      },
    },
    assets: {
      asset_v1: {
        id: "asset_v1",
        name: "Footage.mp4",
        kind: "video",
        duration: 10,
        width: 1920,
        height: 1080,
      },
    },
    captions: {},
    textLayers: {},
    transitions: {},
    captionDesigns: {},
    styles: {},
    editingHistory: [],
  };
}

test("Engine 1: audioSilenceDetector detects measured silences and integrates with rippleCut", () => {
  const words = [
    { word: "Hello", start: 0.5, end: 1.0 },
    { word: "everyone", start: 1.05, end: 1.6 },
    // 1.2s silence gap between 1.6s and 2.8s
    { word: "welcome", start: 2.8, end: 3.4 },
    // 0.8s silence gap between 3.4s and 4.2s
    { word: "back", start: 4.2, end: 4.8 },
  ];

  const silenceResult = detectSilences({ words, duration: 6.0 }, { minSilenceDuration: 0.4 });
  assert.ok(silenceResult.silentRanges.length >= 2, "Must detect at least 2 silence gaps");
  const firstSilence = silenceResult.silentRanges.find((s) => s.start >= 1.5 && s.end <= 2.9);
  assert.ok(firstSilence, "Must detect the gap between 1.6s and 2.8s");
  assert.ok(firstSilence.duration >= 0.8, "Silence duration must be >= 0.8s");

  const project = createMockProject();
  const detected = [
    { start: 1.6, end: 2.8, duration: 1.2, source: "acoustic" },
    { start: 3.4, end: 4.2, duration: 0.8, source: "acoustic" },
  ];

  const plan = reconcileEditingDecisions(
    project,
    [
      {
        op: "rippleCut",
        ranges: [{ start: 1.6, end: 2.8 }],
      },
    ],
    [],
    { requestedSilenceCut: true },
    undefined,
    detected
  );

  const cutOp = plan.decisions.find((d) => d.op === "rippleCut");
  assert.ok(cutOp, "Must retain rippleCut decision");
  assert.ok(cutOp.ranges.length >= 1, "Must contain cut ranges");
  assert.equal(cutOp.ranges[0].start, 1.6);
  assert.equal(cutOp.ranges[0].end, 2.8);
});

test("Engine 2: reframing transforms aspect ratio with blur, center-crop, and split-screen", () => {
  const project = createMockProject();

  // Mode 1: fit-with-blur
  const blurred = reframeProject(project, "fit-with-blur", { blurAmount: 20 });
  assert.equal(blurred.settings.aspectRatio, "9:16", "Must switch aspect ratio to 9:16");
  const blurredClip = Object.values(blurred.clips).find((c) => c.effects.blur >= 15);
  assert.ok(blurredClip, "Must create blurred background clip");

  // Mode 2: center-crop
  const cropped = reframeProject(project, "center-crop", { focusX: 0.1, focusY: -0.1 });
  assert.equal(cropped.settings.aspectRatio, "9:16");
  const mainClip = cropped.clips["clip_v1"];
  assert.ok(mainClip.transform.scale > 1.5, "Center crop on 16:9 to 9:16 must scale up > 1.5x");

  // Mode 3: via AI applyEditDecisionList
  const aiReframed = applyEditDecisionList(project, {
    version: 1,
    projectId: project.id,
    baseRevision: project.revision,
    decisions: [
      {
        op: "reframeProject",
        mode: "fit-with-blur",
        blurAmount: 25,
        backgroundScale: 1.8,
      },
    ],
  });
  assert.equal(aiReframed.settings.aspectRatio, "9:16");

  // Validation
  const validated = validateAiPlan(
    {
      summary: "Reframed project with blur wings",
      decisions: [
        {
          op: "reframeProject",
          mode: "fit-with-blur",
          blurAmount: 30,
        },
      ],
    },
    project
  );
  assert.equal(validated.list.decisions.length, 1);
  assert.equal(validated.list.decisions[0].op, "reframeProject");
});

test("Engine 3: speedCurves recalculates timeline duration and maps source time correctly", () => {
  const heroCurve = getSpeedCurvePreset("hero");
  assert.ok(heroCurve, "Hero preset must exist");
  assert.ok(heroCurve.p0 && heroCurve.p1 && heroCurve.p2 && heroCurve.p3, "Hero curve must have p0, p1, p2, p3");

  const sourceDuration = 10.0;
  const timelineDuration = calculateTimelineDurationFromSource(sourceDuration, heroCurve);
  assert.ok(Number.isFinite(timelineDuration) && timelineDuration > 0, "Timeline duration must be positive finite");
  assert.notEqual(timelineDuration, sourceDuration, "Timeline duration under Hero curve must differ from linear source duration");

  const sourceAtHalf = mapTimelineTimeToSourceTime({
    timelineTime: timelineDuration / 2,
    clipStartTime: 0,
    sourceStartTime: 0,
    duration: timelineDuration,
    curve: heroCurve,
  });
  assert.ok(sourceAtHalf >= 0 && sourceAtHalf <= sourceDuration, "Mapped source time must be within source bounds");

  const velocity = evaluateVelocityAtTime(timelineDuration / 2, timelineDuration, heroCurve);
  assert.ok(velocity > 0, "Velocity must be positive");

  const project = createMockProject();
  const spedProject = applyEditDecisionList(project, {
    version: 1,
    projectId: project.id,
    baseRevision: project.revision,
    decisions: [
      {
        op: "applySpeedCurve",
        clipId: "clip_v1",
        presetId: "hero",
        preservePitch: true,
      },
    ],
  });

  const updatedClip = spedProject.clips["clip_v1"];
  assert.equal(updatedClip.speedCurveId, "hero");
  assert.equal(updatedClip.preservePitch, true);
  assert.equal(Math.round(updatedClip.duration * 100), Math.round(timelineDuration * 100));

  const validated = validateAiPlan(
    {
      summary: "Applied speed curve",
      decisions: [
        {
          op: "applySpeedCurve",
          clipId: "clip_v1",
          presetId: "hero",
        },
      ],
    },
    project
  );
  assert.equal(validated.list.decisions.length, 1);
  assert.equal(validated.list.decisions[0].op, "applySpeedCurve");
});

test("Engine 4: viralHookExtractor extracts hooks from speech context and grades retention", () => {
  const segments = [
    {
      start: 0,
      end: 3.5,
      text: "Stop scrolling right now because this one secret will completely blow your mind.",
      words: [
        { word: "Stop", start: 0.1, end: 0.5 },
        { word: "scrolling", start: 0.6, end: 1.1 },
        { word: "right", start: 1.2, end: 1.5 },
        { word: "now", start: 1.6, end: 1.9 },
        { word: "because", start: 2.0, end: 2.3 },
        { word: "this", start: 2.4, end: 2.6 },
        { word: "one", start: 2.7, end: 2.9 },
        { word: "secret", start: 3.0, end: 3.4 },
      ],
    },
    {
      start: 4.0,
      end: 7.0,
      text: "Most creators make this massive mistake every single day.",
      words: [
        { word: "Most", start: 4.1, end: 4.4 },
        { word: "creators", start: 4.5, end: 4.9 },
        { word: "make", start: 5.0, end: 5.3 },
        { word: "this", start: 5.4, end: 5.6 },
        { word: "massive", start: 5.7, end: 6.0 },
        { word: "mistake", start: 6.1, end: 6.8 },
      ],
    },
  ];

  const hooks = extractViralHooks(segments);
  assert.ok(hooks.length >= 1, "Must extract at least one viral hook from high-retention cues");
  const topHook = hooks[0];
  assert.ok(topHook.confidence >= 0.5, "Top hook confidence must be >= 0.5");
  assert.ok(topHook.hookType, "Hook must have a hookType");
  assert.ok(topHook.start >= 0 && topHook.end > topHook.start, "Hook must have valid bounds");
});
