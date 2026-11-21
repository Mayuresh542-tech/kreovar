import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const ts = require("typescript");

function createModuleLoader(mocks = {}) {
  const cache = new Map();
  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) {
      if (fs.existsSync(filename + ".ts")) filename += ".ts";
      else if (fs.existsSync(filename + ".tsx")) filename += ".tsx";
      else if (fs.existsSync(path.join(filename, "index.ts"))) filename = path.join(filename, "index.ts");
    }
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
    new vm.Script(`(function(require,module,exports,process){${source}\n})`, { filename }).runInThisContext()(
      localRequire,
      loadedModule,
      loadedModule.exports,
      process
    );
    return loadedModule.exports;
  }
  return load;
}

const load = createModuleLoader();
const { createProject } = load("app/lib/editor/model.ts");
const operations = load("app/lib/editor/operations.ts");
const { addTrack, addClip, addAsset, pasteClips } = operations;
const { ALL_CAPTION_TEMPLATES } = load("app/lib/captions/referenceTemplates.ts");

test("R2.2 Forensic: addTrack enforces strict 30-track maximum limit", () => {
  let project = createProject("test-proj");
  const initialTrackCount = project.trackOrder.length;
  assert.ok(initialTrackCount < 30, "Initial project should have fewer than 30 tracks");

  // Add tracks until exactly 30
  for (let i = initialTrackCount; i < 30; i++) {
    project = addTrack(project, "video");
  }
  assert.equal(project.trackOrder.length, 30, "Project now has exactly 30 tracks");
  assert.equal(Object.keys(project.tracks).length, 30);

  // Adding the 31st track MUST throw an error
  assert.throws(
    () => addTrack(project, "audio"),
    /A project can have up to 30 tracks/i,
    "addTrack must throw an error when exceeding 30 tracks"
  );
});

test("R2.3 Forensic: CanvasStage 2D Euclidean math and loop ref check", () => {
  const canvasStageSrc = fs.readFileSync(path.join(root, "app/components/editor/CanvasStage.tsx"), "utf8");

  // Verify isLooping is NOT in useEffect dependency array
  assert.ok(
    !canvasStageSrc.match(/},\s*\[store,\s*playback,\s*repository,\s*notify,\s*isLooping\]\);/),
    "isLooping must not be in Compositor useEffect dependency array"
  );
  assert.ok(
    canvasStageSrc.includes("const isLoopingRef = useRef(isLooping);"),
    "isLoopingRef must be created via useRef"
  );
  assert.ok(
    canvasStageSrc.includes("isLoopingRef.current = isLooping;"),
    "isLoopingRef must be updated via useEffect"
  );

  // Verify 2D Euclidean math Math.hypot and Math.atan2 in handleGesture
  assert.ok(
    canvasStageSrc.includes("Math.hypot(startX - centerX, startY - centerY)"),
    "Handle gesture must use Math.hypot for start radial distance"
  );
  assert.ok(
    canvasStageSrc.includes("Math.hypot(e.clientX - centerX, e.clientY - centerY)"),
    "Handle gesture must use Math.hypot for current radial distance"
  );
  assert.ok(
    canvasStageSrc.includes("Math.atan2(startY - centerY, startX - centerX)"),
    "Handle gesture must use Math.atan2 for start angle"
  );
  assert.ok(
    canvasStageSrc.includes("Math.atan2(e.clientY - centerY, e.clientX - centerX)"),
    "Handle gesture must use Math.atan2 for current angle"
  );

  // Verify dynamic Safe Area Overlays for all 4 aspect ratios
  assert.ok(canvasStageSrc.includes('aspectRatio === "9:16"'), "Must handle 9:16 safe areas");
  assert.ok(canvasStageSrc.includes('aspectRatio === "4:5"'), "Must handle 4:5 safe areas");
  assert.ok(canvasStageSrc.includes('aspectRatio === "1:1"'), "Must handle 1:1 safe areas");
  assert.ok(canvasStageSrc.includes('aspectRatio === "16:9"'), "Must handle 16:9 safe areas");
  assert.ok(canvasStageSrc.includes("overflow-auto p-4"), "Zoom > 1 must enable overflow-auto for panning");
});

test("R2.3 Forensic: EditorLayout shortcuts and pasteClips operation", () => {
  const layoutSrc = fs.readFileSync(path.join(root, "app/components/editor/EditorLayout.tsx"), "utf8");

  // Verify keyboard shortcuts
  assert.ok(layoutSrc.includes('"veelox:toggle-snapping"'), "Must dispatch toggle-snapping event on 'N'");
  assert.ok(layoutSrc.includes('"veelox:fit-timeline"'), "Must dispatch fit-timeline event on 'F'");
  assert.ok(layoutSrc.includes('"veelox:timeline-zoom"'), "Must dispatch timeline-zoom event on +/-");
  assert.ok(layoutSrc.includes("pasteClips(p, clipboardRef.current!.project"), "Must call pasteClips on Cmd/Ctrl+V");

  // Verify pasteClips operation functionally
  let project = createProject("test-paste");
  const trackId = project.trackOrder[0];
  const assetId = "test-asset";
  project = addAsset(project, {
    id: assetId,
    name: "Test Asset",
    kind: "video",
    duration: 10,
    width: 1920,
    height: 1080,
    url: "blob:test",
    size: 1000,
    mime: "video/mp4",
  });
  project = addClip(project, assetId, trackId, 2, { id: "clip-1", duration: 4 });

  const pastedProject = pasteClips(project, project, ["clip-1"], 10);
  assert.equal(Object.keys(pastedProject.clips).length, 2, "Paste should create a second clip");
  const newClip = Object.values(pastedProject.clips).find((c) => c.id !== "clip-1");
  assert.ok(newClip, "New clip must exist");
  assert.equal(newClip.startTime, 10, "Pasted clip should be positioned at playhead time (10)");
  assert.equal(newClip.duration, 4, "Pasted clip should have original duration (4)");
});

test("R2.2 Forensic: TimelinePanel shrink-0, DND payload, and shortcut listeners", () => {
  const timelineSrc = fs.readFileSync(path.join(root, "app/components/editor/TimelinePanel.tsx"), "utf8");

  assert.ok(
    timelineSrc.includes('className="h-[56px] shrink-0 px-2.5 flex items-center justify-between'),
    "Track header row must include shrink-0 to prevent vertical scroll desync"
  );
  assert.ok(
    timelineSrc.includes('window.addEventListener("veelox:toggle-snapping"'),
    "TimelinePanel must listen to veelox:toggle-snapping"
  );
  assert.ok(
    timelineSrc.includes('window.addEventListener("veelox:fit-timeline"'),
    "TimelinePanel must listen to veelox:fit-timeline"
  );
  assert.ok(
    timelineSrc.includes('window.addEventListener("veelox:timeline-zoom"'),
    "TimelinePanel must listen to veelox:timeline-zoom"
  );
  assert.ok(
    timelineSrc.includes("JSON.parse(raw)"),
    "handleDropAsset must support structured JSON application/veelox-asset payload"
  );
});

test("R2.4 Forensic: Mobile UI Polish (zero-duration guard, hidden tracks, multi-track trim handles)", () => {
  const mobileCanvasSrc = fs.readFileSync(path.join(root, "app/components/editor/mobile/MobileCanvasStage.tsx"), "utf8");
  const mobileLayoutSrc = fs.readFileSync(path.join(root, "app/components/editor/mobile/MobileEditorLayout.tsx"), "utf8");
  const mobileTimelineSrc = fs.readFileSync(path.join(root, "app/components/editor/mobile/MobileTimeline.tsx"), "utf8");

  // Zero duration guards
  assert.ok(mobileCanvasSrc.includes("if (curDuration <= 0)"), "MobileCanvasStage must guard against duration <= 0 in frame loop");
  assert.ok(mobileCanvasSrc.includes("if (curDur <= 0) return;"), "MobileCanvasStage must guard against duration <= 0 in onTogglePlayEvent");
  assert.ok(mobileLayoutSrc.includes("if (curDuration <= 0) return;"), "MobileEditorLayout must guard against duration <= 0 in handleTogglePlay");

  // Hidden tracks unhide bar
  assert.ok(mobileTimelineSrc.includes("hiddenTracks.length > 0"), "MobileTimeline must render unhide bar when hiddenTracks exist");
  assert.ok(mobileTimelineSrc.includes("Unhide All"), "MobileTimeline must provide Unhide All action");
  assert.ok(mobileTimelineSrc.includes("changeTrack(next, t.id, { hidden: false })"), "MobileTimeline must unhide tracks via canonical changeTrack");

  // Multi-track trim handles
  assert.ok(mobileTimelineSrc.includes('handleTrimClip(e, clip, "left")'), "MobileTimeline must have left trim handle");
  assert.ok(mobileTimelineSrc.includes('handleTrimClip(e, clip, "right")'), "MobileTimeline must have right trim handle");
  const trimOccurrences = (mobileTimelineSrc.match(/handleTrimClip\(e, clip, "left"\)/g) || []).length;
  assert.ok(trimOccurrences >= 3, `Expected at least 3 trim handle sections (got ${trimOccurrences})`);
});

test("R2.1 Forensic: AssetDrawer Inspector controls and canonical mutations", () => {
  const drawerSrc = fs.readFileSync(path.join(root, "app/components/editor/AssetDrawer.tsx"), "utf8");

  // Check canonical operation imports
  assert.ok(drawerSrc.includes("changeClipProperty"), "Must use changeClipProperty");
  assert.ok(drawerSrc.includes("moveClip"), "Must use moveClip");
  assert.ok(drawerSrc.includes("trimClip"), "Must use trimClip");
  assert.ok(drawerSrc.includes("frameClip"), "Must use frameClip");
  assert.ok(drawerSrc.includes("setVisualTreatment"), "Must use setVisualTreatment");
  assert.ok(drawerSrc.includes("applyCaptionTemplate"), "Must use applyCaptionTemplate");
  assert.ok(drawerSrc.includes("changeText"), "Must use changeText");

  // Check Inspector controls in UI
  assert.ok(drawerSrc.includes("Position X (%)"), "Must have Position X control");
  assert.ok(drawerSrc.includes("Position Y (%)"), "Must have Position Y control");
  assert.ok(drawerSrc.includes("Scale (%)"), "Must have Scale control");
  assert.ok(drawerSrc.includes("Rotation (°)"), "Must have Rotation control");
  assert.ok(drawerSrc.includes("Opacity"), "Must have Opacity slider");
  assert.ok(drawerSrc.includes("Speed (×)"), "Must have Speed control");
  assert.ok(drawerSrc.includes("Fade In (s)"), "Must have Fade In control");
  assert.ok(drawerSrc.includes("Fade Out (s)"), "Must have Fade Out control");
  assert.ok(drawerSrc.includes("Fit Frame"), "Must have Fit Frame button");
  assert.ok(drawerSrc.includes("Fill Frame"), "Must have Fill Frame button");
  assert.ok(drawerSrc.includes("Chromatic RGB Offset"), "Must have Chromatic RGB Offset control");
  assert.ok(drawerSrc.includes("MediaAnimationControls"), "Must include MediaAnimationControls");
  assert.ok(drawerSrc.includes("Audio Role"), "Must have Audio Role selector");
  assert.ok(drawerSrc.includes("Soften under speech (Audio Ducking)"), "Must have ducking toggle");

  // Check B-Roll & Transitions
  assert.ok(drawerSrc.includes('fetch("/api/editor/broll-choice"'), "B-roll must call /api/editor/broll-choice");
  assert.ok(drawerSrc.includes("addTransition(p, from.id, to.id, kind, 0.5)"), "Must call addTransition with canonical TransitionKind");

  // Check Caption Templates count and Hinglish toggle revert
  assert.ok(drawerSrc.includes("ALL_CAPTION_TEMPLATES"), "Must use ALL_CAPTION_TEMPLATES");
  assert.ok(drawerSrc.includes("previousCaptionTemplateRef.current"), "Must track previous template for Hinglish revert");
  assert.ok(ALL_CAPTION_TEMPLATES.length >= 47, `ALL_CAPTION_TEMPLATES must have at least 47 presets (found ${ALL_CAPTION_TEMPLATES.length})`);
});
