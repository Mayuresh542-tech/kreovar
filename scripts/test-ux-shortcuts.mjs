import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const ts = require("typescript");

function loader(mocks = {}) {
  const cache = new Map();
  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) {
      if (fs.existsSync(filename + ".ts")) filename += ".ts";
      else if (fs.existsSync(filename + ".tsx")) filename += ".tsx";
      else if (fs.existsSync(filename + ".js")) filename += ".js";
    }
    const key = path.relative(root, filename).replaceAll("\\", "/");
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule);
    const source = ts
      .transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.React,
        },
      })
      .outputText.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(filename).href));
    const localRequire = (specifier) => {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith("@/")) return load(specifier.slice(2));
      if (specifier.startsWith(".")) {
        return load(path.relative(root, path.resolve(path.dirname(filename), specifier)));
      }
      return require(specifier);
    };
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

const load = loader();

const {
  resolveShortcutAction,
  getShuttleNextState,
  isTypingOrEditingTarget,
  splitTopmostUnmutedClipAtPlayhead,
  deleteOrRippleDeleteClips,
  toggleSelectedTrackMute,
  SHORTCUT_DEFINITIONS,
} = load("app/lib/editor/shortcuts.ts");

const {
  createDemoProject,
  isDemoProject,
  loadDemoProjectIntoStore,
  DEMO_PROJECT_ID,
  DEMO_PROJECT_TITLE,
} = load("app/lib/editor/demoProject.ts");

const { EditorStore, PlaybackStore } = load("app/lib/editor/store.ts");
const { playbackTime } = load("app/lib/editor/playbackClock.ts");
const { projectDuration } = load("app/lib/editor/model.ts");
const { speechContext } = load("app/lib/editor/speechContext.ts");
const { addClip } = load("app/lib/editor/operations.ts");

test("NLE shortcuts action resolution maps all essential editing keys", () => {
  // 1. Play / Pause
  assert.equal(resolveShortcutAction({ key: " ", code: "Space" }), "toggle-play");

  // 2. J / K / L Shuttle Suite
  assert.equal(resolveShortcutAction({ key: "j" }), "shuttle-backward");
  assert.equal(resolveShortcutAction({ key: "J" }), "shuttle-backward");
  assert.equal(resolveShortcutAction({ key: "k" }), "shuttle-pause");
  assert.equal(resolveShortcutAction({ key: "K" }), "shuttle-pause");
  assert.equal(resolveShortcutAction({ key: "l" }), "shuttle-forward");
  assert.equal(resolveShortcutAction({ key: "L" }), "shuttle-forward");

  // 3. Split
  assert.equal(resolveShortcutAction({ key: "s" }), "split-clip");
  assert.equal(resolveShortcutAction({ key: "S" }), "split-clip");

  // 4. Delete & Ripple Delete
  assert.equal(resolveShortcutAction({ key: "Delete" }), "delete-clip");
  assert.equal(resolveShortcutAction({ key: "Backspace" }), "delete-clip");
  assert.equal(resolveShortcutAction({ key: "Delete", shiftKey: true }), "ripple-delete-clip");
  assert.equal(resolveShortcutAction({ key: "Backspace", shiftKey: true }), "ripple-delete-clip");

  // 5. Undo / Redo
  assert.equal(resolveShortcutAction({ key: "z", ctrlKey: true }), "undo");
  assert.equal(resolveShortcutAction({ key: "z", metaKey: true }), "undo");
  assert.equal(resolveShortcutAction({ key: "z", ctrlKey: true, shiftKey: true }), "redo");
  assert.equal(resolveShortcutAction({ key: "z", metaKey: true, shiftKey: true }), "redo");
  assert.equal(resolveShortcutAction({ key: "y", ctrlKey: true }), "redo");

  // 6. Track Mute
  assert.equal(resolveShortcutAction({ key: "m" }), "toggle-mute");
  assert.equal(resolveShortcutAction({ key: "M" }), "toggle-mute");

  // 7. Escape
  assert.equal(resolveShortcutAction({ key: "Escape" }), "escape");

  // 8. Shortcuts Help Modal (?)
  assert.equal(resolveShortcutAction({ key: "?" }), "toggle-shortcuts-modal");
  assert.equal(resolveShortcutAction({ key: "/", shiftKey: true }), "toggle-shortcuts-modal");

  // 9. Frame Step & Nudge
  assert.equal(resolveShortcutAction({ key: "ArrowLeft" }), "step-backward");
  assert.equal(resolveShortcutAction({ key: "ArrowRight" }), "step-forward");
  assert.equal(resolveShortcutAction({ key: "ArrowLeft", altKey: true }), "nudge-left");
  assert.equal(resolveShortcutAction({ key: "ArrowRight", altKey: true }), "nudge-right");

  // 10. Selection & Clipboard
  assert.equal(resolveShortcutAction({ key: "a", ctrlKey: true }), "select-all");
  assert.equal(resolveShortcutAction({ key: "c", ctrlKey: true }), "copy-clips");
  assert.equal(resolveShortcutAction({ key: "v", ctrlKey: true }), "paste-clips");
  assert.equal(resolveShortcutAction({ key: "d", ctrlKey: true }), "duplicate-clip");

  // 11. Timeline View
  assert.equal(resolveShortcutAction({ key: "n" }), "toggle-snapping");
  assert.equal(resolveShortcutAction({ key: "f" }), "fit-timeline");
  assert.equal(resolveShortcutAction({ key: "+" }), "zoom-in");
  assert.equal(resolveShortcutAction({ key: "=" }), "zoom-in");
  assert.equal(resolveShortcutAction({ key: "-" }), "zoom-out");
});

test("Shortcuts are strictly suppressed when user is typing in inputs or AI chat", () => {
  // Mock element hierarchy for typing target
  class FakeElement {
    constructor(selectors) {
      this.selectors = selectors;
    }
    closest(sel) {
      return this.selectors.some((s) => sel.includes(s)) ? this : null;
    }
  }
  globalThis.HTMLElement = FakeElement;

  const mockInput = new FakeElement(["input"]);
  const mockTextarea = new FakeElement(["textarea"]);
  const mockAiChat = new FakeElement([".ai-chat-prompt"]);
  const mockTimelineCanvas = new FakeElement(["canvas"]);

  assert.equal(isTypingOrEditingTarget(mockInput), true);
  assert.equal(isTypingOrEditingTarget(mockTextarea), true);
  assert.equal(isTypingOrEditingTarget(mockAiChat), true);
  assert.equal(isTypingOrEditingTarget(mockTimelineCanvas), false);

  // Shortcuts return null when typing target is active (except Escape)
  assert.equal(resolveShortcutAction({ key: " ", code: "Space", target: mockInput }), null);
  assert.equal(resolveShortcutAction({ key: "j", target: mockTextarea }), null);
  assert.equal(resolveShortcutAction({ key: "s", target: mockAiChat }), null);
  assert.equal(resolveShortcutAction({ key: "m", target: mockInput }), null);

  // Escape still resolves to allow canceling / blurring dialogs
  assert.equal(resolveShortcutAction({ key: "Escape", target: mockInput }), "escape");
});

test("J / K / L shuttle speeds transition correctly (1x, 2x, -1x, -2x, pause)", () => {
  // Start from paused
  let state = getShuttleNextState(1, false, "forward");
  assert.deepEqual(state, { playing: true, speed: 1 });

  // Pressing L again accelerates to 2x fast-forward
  state = getShuttleNextState(state.speed, state.playing, "forward");
  assert.deepEqual(state, { playing: true, speed: 2 });

  // Pressing K halts shuttle
  state = getShuttleNextState(state.speed, state.playing, "pause");
  assert.deepEqual(state, { playing: false, speed: 1 });

  // Pressing J reverses at -1x
  state = getShuttleNextState(state.speed, state.playing, "backward");
  assert.deepEqual(state, { playing: true, speed: -1 });

  // Pressing J again accelerates to -2x reverse shuttle
  state = getShuttleNextState(state.speed, state.playing, "backward");
  assert.deepEqual(state, { playing: true, speed: -2 });

  // Pressing L while shuttling in reverse transitions forward cleanly
  state = getShuttleNextState(state.speed, state.playing, "forward");
  assert.deepEqual(state, { playing: true, speed: 1 });

  // Pressing K pauses again
  state = getShuttleNextState(state.speed, state.playing, "pause");
  assert.deepEqual(state, { playing: false, speed: 1 });
});

test("PlaybackStore and playbackClock handle bidirectional shuttle speeds", () => {
  const store = new PlaybackStore();
  assert.deepEqual(store.getSnapshot(), { time: 0, playing: false, speed: 1 });

  store.set(5.0, true, 2);
  assert.deepEqual(store.getSnapshot(), { time: 5.0, playing: true, speed: 2 });

  // Forward at 2x: delta of 0.5s advances by 1.0s
  let nextTime = playbackTime(store.getSnapshot().time, true, false, 0.5, 15.0, 2);
  assert.equal(nextTime, 6.0);

  // Reverse at -2x: delta of 0.5s rewinds by 1.0s
  nextTime = playbackTime(6.0, true, false, 0.5, 15.0, -2);
  assert.equal(nextTime, 5.0);

  // Reverse at -1x: delta of 1.0s rewinds by 1.0s
  nextTime = playbackTime(5.0, true, false, 1.0, 15.0, -1);
  assert.equal(nextTime, 4.0);

  // Buffering halts advancement regardless of speed
  nextTime = playbackTime(4.0, true, true, 1.0, 15.0, 2);
  assert.equal(nextTime, 4.0);
});

test("S key splits selected clip or falls back to topmost unmuted clip at playhead", () => {
  const demo = createDemoProject();

  // Playhead at 6.0s (intersects both main video on track-video and b-roll on track-overlay)
  const time = 6.0;

  // Scenario A: When clip is selected, split that specific clip
  const mainClipId = "clip-demo-main-video";
  const resultSelected = splitTopmostUnmutedClipAtPlayhead(demo, time, [mainClipId]);
  assert.equal(resultSelected.splitClipId, mainClipId);
  assert.equal(resultSelected.wasTopmostFallback, false);
  // Verify main track has 2 clips now
  assert.equal(resultSelected.nextProject.tracks["track-video"].clipIds.length, 2);

  // Scenario B: When NO clip is selected, falls back to topmost unmuted clip (track-overlay has priority 1 over video priority 3)
  const resultFallback = splitTopmostUnmutedClipAtPlayhead(demo, time, []);
  assert.equal(resultFallback.splitClipId, "clip-demo-broll");
  assert.equal(resultFallback.wasTopmostFallback, true);
  // Verify track-overlay has 2 clips now
  assert.equal(resultFallback.nextProject.tracks["track-overlay"].clipIds.length, 2);

  // Scenario C: If track-overlay is muted, fallback skips it and splits unmuted track-video
  const demoWithMutedOverlay = {
    ...demo,
    tracks: {
      ...demo.tracks,
      "track-overlay": { ...demo.tracks["track-overlay"], muted: true },
    },
  };
  const resultMuted = splitTopmostUnmutedClipAtPlayhead(demoWithMutedOverlay, time, []);
  assert.equal(resultMuted.splitClipId, mainClipId);
  assert.equal(resultMuted.wasTopmostFallback, true);

  // Scenario D: Playhead outside all clips produces no split
  const resultOutside = splitTopmostUnmutedClipAtPlayhead(demo, 99.0, []);
  assert.equal(resultOutside.splitClipId, null);
  assert.equal(resultOutside.nextProject, demo);
});

test("Delete removes clip; Shift+Delete (ripple delete) shifts downstream clips on track to close gap", () => {
  const demo = createDemoProject();

  // Add 3 consecutive clips on track-video: [0..4], [4..8], [8..12]
  let proj = demo;
  const assetId = "asset-demo-creator-video";
  proj = {
    ...proj,
    clips: {},
    tracks: {
      ...proj.tracks,
      "track-video": { ...proj.tracks["track-video"], clipIds: [] },
    },
  };
  proj = addClip(proj, assetId, "track-video", 0, { id: "clip-a", duration: 4.0 });
  proj = addClip(proj, assetId, "track-video", 4.0, { id: "clip-b", duration: 4.0 });
  proj = addClip(proj, assetId, "track-video", 8.0, { id: "clip-c", duration: 4.0 });

  // Verify initial layout
  assert.equal(proj.clips["clip-a"].startTime, 0);
  assert.equal(proj.clips["clip-b"].startTime, 4.0);
  assert.equal(proj.clips["clip-c"].startTime, 8.0);

  // 1. Regular delete of clip-b (leaves gap between 4.0 and 8.0)
  const regularDelete = deleteOrRippleDeleteClips(proj, ["clip-b"], { ripple: false });
  assert.equal(regularDelete.clips["clip-b"], undefined);
  assert.equal(regularDelete.clips["clip-a"].startTime, 0);
  assert.equal(regularDelete.clips["clip-c"].startTime, 8.0); // unchanged start time, gap remains

  // 2. Ripple delete of clip-b (shifts clip-c left by 4.0s from 8.0 to 4.0)
  const rippleDelete = deleteOrRippleDeleteClips(proj, ["clip-b"], { ripple: true });
  assert.equal(rippleDelete.clips["clip-b"], undefined);
  assert.equal(rippleDelete.clips["clip-a"].startTime, 0);
  assert.equal(rippleDelete.clips["clip-c"].startTime, 4.0); // gap closed seamlessly!
});

test("M key toggles track mute on selected clip or primary audio track", () => {
  const demo = createDemoProject();

  // 1. With clip selected on track-video: toggles mute on track-video
  const resultSelected = toggleSelectedTrackMute(demo, ["clip-demo-main-video"]);
  assert.equal(resultSelected.trackId, "track-video");
  assert.equal(resultSelected.muted, true);
  assert.equal(resultSelected.project.tracks["track-video"].muted, true);

  // Unmute again
  const resultUnmute = toggleSelectedTrackMute(resultSelected.project, ["clip-demo-main-video"]);
  assert.equal(resultUnmute.trackId, "track-video");
  assert.equal(resultUnmute.muted, false);
  assert.equal(resultUnmute.project.tracks["track-video"].muted, false);

  // 2. With no selection: defaults to primary audio track
  const resultNoSelection = toggleSelectedTrackMute(demo, []);
  assert.equal(resultNoSelection.trackId, "track-audio");
  assert.equal(resultNoSelection.muted, true);
  assert.equal(resultNoSelection.project.tracks["track-audio"].muted, true);
});

test("Preloaded demo project meets all creator starter requirements", () => {
  const demo = createDemoProject();

  // 1. Project metadata & settings
  assert.equal(demo.id, DEMO_PROJECT_ID);
  assert.equal(demo.title, DEMO_PROJECT_TITLE);
  assert.equal(demo.settings.aspectRatio, "9:16");
  assert.equal(demo.settings.fps, 30);
  assert.equal(demo.settings.audioDucking, true);

  // 2. Exact 15-second duration
  const dur = projectDuration(demo);
  assert.equal(dur, 15.0);

  // 3. Track structure
  assert.ok(demo.tracks["track-video"]);
  assert.ok(demo.tracks["track-overlay"]);
  assert.ok(demo.tracks["track-caption"]);
  assert.ok(demo.tracks["track-audio"]);

  // 4. Clips & Assets
  assert.equal(demo.clips["clip-demo-main-video"].duration, 15.0);
  assert.equal(demo.clips["clip-demo-broll"].startTime, 5.0);
  assert.equal(demo.clips["clip-demo-broll"].duration, 4.0);

  // 5. Timed speech transcript & captions
  const speech = speechContext(demo);
  assert.equal(speech.length, 3);
  assert.ok(speech.every((s) => s.words && s.words.length > 0));
  assert.equal(speech[0].text, "Welcome to Kreovar the AI video editor");
  assert.equal(speech[1].text, "Watch dynamic B-roll and kinetic captions sync");
  assert.equal(speech[2].text, "Edit with keyboard shortcuts or AI chat commands");

  // Total words timed
  const totalWords = speech.flatMap((s) => s.words || []);
  assert.equal(totalWords.length, 22);

  // 6. Identifier check
  assert.equal(isDemoProject("demo_creator_starter"), true);
  assert.equal(isDemoProject("demo_project"), true);
  assert.equal(isDemoProject("demo"), true);
  assert.equal(isDemoProject("my_project_123"), false);
  assert.equal(isDemoProject(null), false);

  // 7. Store loading
  const store = new EditorStore(demo);
  assert.equal(store.getSnapshot().title, DEMO_PROJECT_TITLE);
  const loaded = loadDemoProjectIntoStore(store);
  assert.equal(loaded.id, DEMO_PROJECT_ID);
  assert.equal(store.getSnapshot().id, DEMO_PROJECT_ID);
});

test("SHORTCUT_DEFINITIONS contains complete documentation for all standard operations", () => {
  assert.ok(SHORTCUT_DEFINITIONS.length >= 12);
  const requiredIds = [
    "toggle-play",
    "shuttle-forward",
    "shuttle-backward",
    "shuttle-pause",
    "split-clip",
    "delete-clip",
    "ripple-delete-clip",
    "toggle-mute",
    "escape",
    "undo-redo",
  ];
  for (const id of requiredIds) {
    const found = SHORTCUT_DEFINITIONS.find((d) => d.id === id);
    assert.ok(found, `Missing shortcut definition for ${id}`);
    assert.ok(found.label.length > 0);
    assert.ok(found.keys.length > 0);
  }
});
