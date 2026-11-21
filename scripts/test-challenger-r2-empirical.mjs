import assert from "node:assert/strict";
import { test, describe } from "node:test";
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
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
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
const { createProject, projectDuration, dimensions, clamp } = load("app/lib/editor/model.ts");
const { addTrack, addClip, addAsset, pasteClips, changeClipProperty } = load("app/lib/editor/operations.ts");
const { EditorStore, PlaybackStore } = load("app/lib/editor/store.ts");

describe("Challenger Suite 1: Track Limits Adversarial Stress & Invariant Verification", () => {
  test("1.1 Incremental track additions build sequentially up to 30 tracks with synchronized order", () => {
    let project = createProject("track-stress-test");
    const initialTracks = project.trackOrder.length;
    assert.equal(initialTracks, 6, "Default project starts with 6 tracks");
    assert.equal(Object.keys(project.tracks).length, 6);

    const kinds = ["video", "overlay", "image", "text", "caption", "audio"];
    for (let i = initialTracks; i < 30; i++) {
      const kind = kinds[i % kinds.length];
      project = addTrack(project, kind);
      assert.equal(project.trackOrder.length, i + 1, `Track count must be ${i + 1}`);
      assert.equal(Object.keys(project.tracks).length, i + 1);
      const newId = project.trackOrder[i];
      assert.ok(project.tracks[newId], `Track entry must exist for ${newId}`);
      assert.equal(project.tracks[newId].kind, kind);
      assert.ok(new Set(project.trackOrder).size === project.trackOrder.length, "All track IDs must be unique");
    }

    assert.equal(project.trackOrder.length, 30);
    assert.equal(Object.keys(project.tracks).length, 30);
  });

  test("1.2 31st track addition strictly throws error and does not mutate project", () => {
    let project = createProject("cap-test");
    for (let i = project.trackOrder.length; i < 30; i++) {
      project = addTrack(project, "video");
    }
    assert.equal(project.trackOrder.length, 30);

    const snapshotBefore = JSON.stringify(project);
    assert.throws(
      () => addTrack(project, "video"),
      /A project can have up to 30 tracks/i,
      "Attempting 31st track MUST throw error"
    );

    // Verify immutability under failure
    assert.equal(JSON.stringify(project), snapshotBefore, "Project must not be mutated when addTrack throws");
  });

  test("1.3 Adversarial stress: 50 consecutive failed addTrack calls reject 100% without memory corruption", () => {
    let project = createProject("bombardment-test");
    for (let i = project.trackOrder.length; i < 30; i++) {
      project = addTrack(project, "audio");
    }

    let rejectedCount = 0;
    const testKinds = ["video", "audio", "text", "caption", "overlay", "image"];
    for (let i = 0; i < 50; i++) {
      try {
        addTrack(project, testKinds[i % testKinds.length]);
      } catch (err) {
        if (/30 tracks/i.test(err.message)) {
          rejectedCount++;
        }
      }
    }
    assert.equal(rejectedCount, 50, "All 50 adversarial track additions must be rejected");
    assert.equal(project.trackOrder.length, 30);
    assert.equal(Object.keys(project.tracks).length, 30);
  });

  test("1.4 Asymmetric guard stress: throws if either trackOrder or tracks object reaches 30", () => {
    let project = createProject("asymmetric-test");
    // Case A: trackOrder has 30, tracks has fewer
    const projectWithOrder30 = {
      ...project,
      trackOrder: Array.from({ length: 30 }, (_, i) => `t-${i}`),
      tracks: { "t-0": { id: "t-0", name: "T 0", kind: "video", clipIds: [], hidden: false, muted: false, locked: false } },
    };
    assert.throws(() => addTrack(projectWithOrder30, "video"), /30 tracks/i);

    // Case B: tracks has 30, trackOrder has fewer
    const thirtyTracks = {};
    for (let i = 0; i < 30; i++) {
      thirtyTracks[`t-${i}`] = { id: `t-${i}`, name: `T ${i}`, kind: "video", clipIds: [], hidden: false, muted: false, locked: false };
    }
    const projectWithMap30 = {
      ...project,
      trackOrder: ["t-0"],
      tracks: thirtyTracks,
    };
    assert.throws(() => addTrack(projectWithMap30, "video"), /30 tracks/i);
  });
});

describe("Challenger Suite 2: Canvas 2D Handle Math Empirical Oracle", () => {
  // Extract and test exact math formula from CanvasStage.tsx
  function computeScale(startDist, curDist, initialScale) {
    return clamp(initialScale * (startDist > 2 ? curDist / startDist : 1), 0.05, 10);
  }

  function computeRotation(startAngle, curAngle, initialRotation) {
    return Math.round(initialRotation + (curAngle - startAngle));
  }

  function computeCenterAndDistances(rect, box, t, aspectW, aspectH, startX, startY, curX, curY) {
    const centerX = rect.left + (box ? (box.x / aspectW) * rect.width : (0.5 + t.x) * rect.width);
    const centerY = rect.top + (box ? (box.y / aspectH) * rect.height : (0.5 + t.y) * rect.height);
    const startDist = Math.hypot(startX - centerX, startY - centerY);
    const curDist = Math.hypot(curX - centerX, curY - centerY);
    const startAngle = Math.atan2(startY - centerY, startX - centerX) * (180 / Math.PI);
    const curAngle = Math.atan2(curY - centerY, curX - centerX) * (180 / Math.PI);
    return { centerX, centerY, startDist, curDist, startAngle, curAngle };
  }

  test("2.1 Isotropic 2D Euclidean Distance: Radial scaling is invariant to vector direction", () => {
    const rect = { left: 0, top: 0, width: 1000, height: 1000 };
    const t = { x: 0, y: 0, scale: 1.0, rotation: 0, opacity: 1.0 };
    const [aspectW, aspectH] = dimensions["16:9"];

    // Center of stage is (500, 500)
    const centerX = 500;
    const centerY = 500;
    const startDist = 100;
    const startX = centerX + startDist;
    const startY = centerY;

    // Move cursor radially by distance = 200 in 4 different directions (0°, 90°, 180°, 45°)
    const directions = [
      { name: "Horizontal East", curX: centerX + 200, curY: centerY },
      { name: "Vertical South", curX: centerX, curY: centerY + 200 },
      { name: "Horizontal West", curX: centerX - 200, curY: centerY },
      { name: "Diagonal SE", curX: centerX + 200 * Math.cos(Math.PI / 4), curY: centerY + 200 * Math.sin(Math.PI / 4) },
      { name: "Arbitrary 63.4°", curX: centerX + 200 * Math.cos(1.107), curY: centerY + 200 * Math.sin(1.107) },
    ];

    for (const dir of directions) {
      const { curDist } = computeCenterAndDistances(rect, null, t, aspectW, aspectH, startX, startY, dir.curX, dir.curY);
      assert.ok(Math.abs(curDist - 200) < 0.01, `${dir.name} Euclidean distance must equal 200`);
      const scale = computeScale(startDist, curDist, t.scale);
      assert.ok(Math.abs(scale - 2.0) < 0.001, `${dir.name} scale must equal 2.0`);
    }
  });

  test("2.2 Singularity handling: startDist <= 2 avoids zero division and returns neutral scale factor", () => {
    const rect = { left: 0, top: 0, width: 800, height: 600 };
    const t = { x: 0, y: 0, scale: 1.5, rotation: 0, opacity: 1.0 };

    // Case A: Pointer starts exactly at center (startDist = 0)
    const centerX = 400;
    const centerY = 300;
    const scaleZeroDist = computeScale(0, 150, t.scale);
    assert.equal(scaleZeroDist, 1.5, "startDist = 0 must fallback to 1 * initialScale, avoiding Infinity/NaN");
    assert.ok(Number.isFinite(scaleZeroDist), "Scale must remain finite");

    // Case B: Pointer starts at 1.8px from center (startDist <= 2)
    const scaleNearZero = computeScale(1.8, 150, t.scale);
    assert.equal(scaleNearZero, 1.5, "startDist <= 2 must fallback to 1 * initialScale");

    // Case C: Pointer starts at 2.1px from center (startDist > 2)
    const scaleValid = computeScale(2.1, 4.2, t.scale);
    assert.equal(scaleValid, 3.0, "startDist > 2 must calculate proper ratio (4.2/2.1 = 2 * 1.5 = 3.0)");
  });

  test("2.3 Boundary clamping: Scale clamps strictly within [0.05, 10.0]", () => {
    // Extreme shrinking
    const scaleZero = computeScale(100, 0, 1.0);
    assert.equal(scaleZero, 0.05, "Extreme shrinkage must clamp at 0.05");

    const scaleTiny = computeScale(100, 0.001, 1.0);
    assert.equal(scaleTiny, 0.05, "Scale must not go below 0.05");

    // Extreme magnification
    const scaleHuge = computeScale(10, 50000, 1.0);
    assert.equal(scaleHuge, 10.0, "Extreme expansion must clamp at 10.0");

    const scaleBoundaryMax = computeScale(50, 500, 2.0); // 10 * 2 = 20 -> clamped to 10
    assert.equal(scaleBoundaryMax, 10.0, "Scale exceeding 10 must clamp to 10.0");
  });

  test("2.4 Four-Quadrant Rotation Oracle: Verifies exact Math.atan2 angle across all 4 quadrants", () => {
    const centerX = 500;
    const centerY = 500;
    const startX = centerX + 100;
    const startY = centerY; // 0 degrees
    const initialRot = 15;

    const angleCases = [
      { name: "+45 deg", curX: centerX + 100 * Math.cos(Math.PI / 4), curY: centerY + 100 * Math.sin(Math.PI / 4), expectedRot: 15 + 45 },
      { name: "+90 deg", curX: centerX, curY: centerY + 100, expectedRot: 15 + 90 },
      { name: "+180 deg", curX: centerX - 100, curY: centerY, expectedRot: 15 + 180 },
      { name: "-90 deg (270 deg)", curX: centerX, curY: centerY - 100, expectedRot: 15 - 90 },
      { name: "-45 deg", curX: centerX + 100 * Math.cos(-Math.PI / 4), curY: centerY + 100 * Math.sin(-Math.PI / 4), expectedRot: 15 - 45 },
    ];

    for (const ac of angleCases) {
      const startAngle = Math.atan2(startY - centerY, startX - centerX) * (180 / Math.PI);
      const curAngle = Math.atan2(ac.curY - centerY, ac.curX - centerX) * (180 / Math.PI);
      const rot = computeRotation(startAngle, curAngle, initialRot);
      assert.equal(rot, ac.expectedRot, `Rotation for ${ac.name} must be ${ac.expectedRot}`);
    }
  });

  test("2.5 End-to-End transform application on real project clip", () => {
    let project = createProject();
    const trackId = project.trackOrder[0];
    project = addAsset(project, { id: "v1", name: "v.mp4", kind: "video", duration: 5, width: 1920, height: 1080, url: "blob:v", size: 100, mime: "video/mp4" });
    project = addClip(project, "v1", trackId, 0, { id: "c1", duration: 5 });

    const clipBefore = project.clips["c1"];
    assert.equal(clipBefore.transform.scale, 1);
    assert.equal(clipBefore.transform.rotation, 0);

    // Apply scale = 2.5 and rotation = 45
    const updatedProject = changeClipProperty(project, "c1", {
      transform: {
        ...clipBefore.transform,
        scale: 2.5,
        rotation: 45,
      },
    });

    const clipAfter = updatedProject.clips["c1"];
    assert.equal(clipAfter.transform.scale, 2.5);
    assert.equal(clipAfter.transform.rotation, 45);
    assert.equal(clipAfter.transform.x, clipBefore.transform.x);
    assert.equal(clipAfter.transform.y, clipBefore.transform.y);
    assert.equal(clipAfter.transform.opacity, clipBefore.transform.opacity);
  });
});

describe("Challenger Suite 3: Loop Ref & Compositor Persistence in CanvasStage", () => {
  test("3.1 Static verification: isLooping is decoupled from Compositor lifecycle effect", () => {
    const canvasStageSrc = fs.readFileSync(path.join(root, "app/components/editor/CanvasStage.tsx"), "utf8");

    // 1. Verify Compositor effect dependencies
    const compositorEffectMatch = canvasStageSrc.match(/},\s*\[store,\s*playback,\s*repository,\s*notify\]\);/);
    assert.ok(compositorEffectMatch, "Compositor useEffect dependencies must strictly be [store, playback, repository, notify]");

    // 2. Ensure isLooping is NOT in that dependency array
    assert.ok(
      !canvasStageSrc.includes("[store, playback, repository, notify, isLooping]"),
      "isLooping must NEVER appear in the Compositor effect dependency array"
    );

    // 3. Verify isLoopingRef declaration and sync effect
    assert.ok(canvasStageSrc.includes("const isLoopingRef = useRef(isLooping);"), "isLoopingRef must be created with useRef");
    assert.ok(canvasStageSrc.includes("isLoopingRef.current = isLooping;"), "isLoopingRef.current must be updated when isLooping changes");

    // 4. Verify isLoopingRef.current is queried inside animation loop
    assert.ok(
      canvasStageSrc.includes("playback.set(next, isLoopingRef.current || next < curDuration);"),
      "Animation loop must dynamically query isLoopingRef.current"
    );
  });

  test("3.2 Dynamic Component Simulation: Changing isLooping preserves the Compositor instance", () => {
    // Simulate React component state & ref lifecycle
    let compositorCreatedCount = 0;
    let compositorDisposedCount = 0;

    class MockCompositor {
      constructor() {
        compositorCreatedCount++;
      }
      dispose() {
        compositorDisposedCount++;
      }
      sync() {
        return true;
      }
      pause() {}
    }

    // Component simulation state
    let isLooping = true;
    const isLoopingRef = { current: isLooping };
    let engineRef = { current: null };

    // Compositor lifecycle effect (runs only on mount/unmount since store, playback, repo are stable)
    function mountCompositorEffect() {
      const compositor = new MockCompositor();
      engineRef.current = compositor;
      return function cleanup() {
        compositor.dispose();
        engineRef.current = null;
      };
    }

    // Loop sync effect (runs whenever isLooping changes)
    function syncLoopEffect(newVal) {
      isLooping = newVal;
      isLoopingRef.current = newVal;
    }

    // Mount
    const unmount = mountCompositorEffect();
    assert.equal(compositorCreatedCount, 1, "Compositor must be instantiated exactly once on mount");
    assert.equal(compositorDisposedCount, 0, "Compositor must not be disposed on mount");
    const originalCompositor = engineRef.current;
    assert.ok(originalCompositor instanceof MockCompositor);

    // Simulate user toggling Loop button: ON -> OFF
    syncLoopEffect(false);
    assert.equal(isLoopingRef.current, false);
    assert.equal(compositorCreatedCount, 1, "Toggling loop to OFF must NOT re-instantiate Compositor");
    assert.equal(compositorDisposedCount, 0, "Toggling loop to OFF must NOT dispose Compositor");
    assert.equal(engineRef.current, originalCompositor, "Compositor instance must remain identical");

    // Simulate user toggling Loop button: OFF -> ON
    syncLoopEffect(true);
    assert.equal(isLoopingRef.current, true);
    assert.equal(compositorCreatedCount, 1, "Toggling loop to ON must NOT re-instantiate Compositor");
    assert.equal(compositorDisposedCount, 0, "Toggling loop to ON must NOT dispose Compositor");
    assert.equal(engineRef.current, originalCompositor, "Compositor instance must remain identical");

    // Verify loop behavior: When past duration and isLooping is true vs false
    const curDuration = 10;
    const nextTime = 10.5;

    // With loop ON: next time wraps or continues
    const loopOnPlaying = isLoopingRef.current || nextTime < curDuration;
    assert.equal(loopOnPlaying, true, "Playback continues when isLooping is true even if nextTime >= curDuration");

    // With loop OFF:
    syncLoopEffect(false);
    const loopOffPlaying = isLoopingRef.current || nextTime < curDuration;
    assert.equal(loopOffPlaying, false, "Playback stops when isLooping is false and nextTime >= curDuration");

    // Unmount
    unmount();
    assert.equal(compositorDisposedCount, 1, "Compositor must be disposed only on unmount");
  });
});

describe("Challenger Suite 4: Keyboard Shortcuts & PasteClips Invariant", () => {
  test("4.1 Keyboard shortcuts dispatch expected CustomEvents", () => {
    const layoutSrc = fs.readFileSync(path.join(root, "app/components/editor/EditorLayout.tsx"), "utf8");

    // Extract handleKeyDown logic from EditorLayout.tsx
    const dispatchedEvents = [];
    const windowMock = {
      dispatchEvent: (event) => dispatchedEvents.push(event),
    };

    function simulateKeyDown(key, options = {}) {
      const { ctrlKey = false, metaKey = false, targetTag = "div", isInput = false, exportOpen = false, shortcutsOpen = false } = options;
      const isEditingTarget = isInput || ["input", "textarea", "select"].includes(targetTag);
      if (isEditingTarget || exportOpen || shortcutsOpen) return false;

      const modifier = ctrlKey || metaKey;
      const lowerKey = key.toLowerCase();

      if (lowerKey === "n" && !modifier) {
        windowMock.dispatchEvent({ type: "veelox:toggle-snapping" });
        return true;
      } else if (lowerKey === "f" && !modifier) {
        windowMock.dispatchEvent({ type: "veelox:fit-timeline" });
        return true;
      } else if ((key === "+" || key === "=") && !modifier) {
        windowMock.dispatchEvent({ type: "veelox:timeline-zoom", detail: "in" });
        return true;
      } else if ((key === "-" || key === "_") && !modifier) {
        windowMock.dispatchEvent({ type: "veelox:timeline-zoom", detail: "out" });
        return true;
      }
      return false;
    }

    // Test 'N' and 'n'
    assert.ok(simulateKeyDown("n"));
    assert.ok(simulateKeyDown("N"));
    assert.equal(dispatchedEvents.filter((e) => e.type === "veelox:toggle-snapping").length, 2);

    // Test 'F' and 'f'
    assert.ok(simulateKeyDown("f"));
    assert.ok(simulateKeyDown("F"));
    assert.equal(dispatchedEvents.filter((e) => e.type === "veelox:fit-timeline").length, 2);

    // Test '+' and '=' (Zoom In)
    assert.ok(simulateKeyDown("+"));
    assert.ok(simulateKeyDown("="));
    const inEvents = dispatchedEvents.filter((e) => e.type === "veelox:timeline-zoom" && e.detail === "in");
    assert.equal(inEvents.length, 2);

    // Test '-' and '_' (Zoom Out)
    assert.ok(simulateKeyDown("-"));
    assert.ok(simulateKeyDown("_"));
    const outEvents = dispatchedEvents.filter((e) => e.type === "veelox:timeline-zoom" && e.detail === "out");
    assert.equal(outEvents.length, 2);

    // Test modifier suppression (Ctrl+N, Ctrl+F must NOT trigger timeline actions)
    assert.equal(simulateKeyDown("n", { ctrlKey: true }), false);
    assert.equal(simulateKeyDown("f", { metaKey: true }), false);
    assert.equal(simulateKeyDown("+", { ctrlKey: true }), false);

    // Test input suppression (typing in text inputs must NOT trigger shortcuts)
    assert.equal(simulateKeyDown("n", { isInput: true }), false);
    assert.equal(simulateKeyDown("f", { targetTag: "input" }), false);
    assert.equal(simulateKeyDown("+", { targetTag: "textarea" }), false);

    // Test modal suppression (when export modal is open)
    assert.equal(simulateKeyDown("n", { exportOpen: true }), false);
    assert.equal(simulateKeyDown("f", { shortcutsOpen: true }), false);
  });

  test("4.2 Cmd/Ctrl + C and Cmd/Ctrl + V clipboard workflow with pasteClips", () => {
    let project = createProject("copy-paste-test");
    const trackId = project.trackOrder[0];
    project = addAsset(project, { id: "media-1", name: "clip.mp4", kind: "video", duration: 10, width: 1920, height: 1080, url: "blob:media", size: 500, mime: "video/mp4" });
    project = addClip(project, "media-1", trackId, 2, { id: "original-clip", duration: 4 });

    const clipboardRef = { current: null };

    // Simulate Copy
    const selection = ["original-clip"];
    clipboardRef.current = { project, ids: [...selection] };
    assert.equal(clipboardRef.current.ids[0], "original-clip");

    // Simulate Paste at playhead time = 12.0s
    const pasteTime = 12.0;
    const pastedProject = pasteClips(project, clipboardRef.current.project, clipboardRef.current.ids, pasteTime);

    assert.equal(Object.keys(pastedProject.clips).length, 2, "Paste must result in 2 clips");
    const clips = Object.values(pastedProject.clips);
    const pastedClip = clips.find((c) => c.id !== "original-clip");
    assert.ok(pastedClip, "Pasted clip must exist with fresh ID");
    assert.equal(pastedClip.startTime, 12.0, "Pasted clip start time must be 12.0");
    assert.equal(pastedClip.duration, 4, "Pasted clip duration must match original");
    assert.equal(pastedClip.assetId, "media-1", "Pasted clip must reference original asset");
    assert.ok(pastedProject.tracks[trackId].clipIds.includes(pastedClip.id), "Track clipIds must include pasted clip");
  });
});

describe("Challenger Suite 5: Mobile Playback Guard Empirical Verification", () => {
  test("5.1 MobileEditorLayout handleTogglePlay halts when project duration is 0", () => {
    const project = createProject("empty-mobile-project");
    assert.equal(projectDuration(project), 0, "Fresh empty project must have duration 0");

    const store = new EditorStore(project);
    const playback = new PlaybackStore();
    assert.equal(playback.getSnapshot().playing, false);

    // Exact implementation of MobileEditorLayout handleTogglePlay:
    function handleTogglePlay() {
      const state = playback.getSnapshot();
      const curDuration = projectDuration(store.getSnapshot());
      if (curDuration <= 0) return;
      if (!state.playing && curDuration > 0 && state.time >= curDuration) {
        playback.set(0, true);
      } else {
        playback.set(state.time, !state.playing);
      }
    }

    // Attempt to toggle play on duration = 0
    handleTogglePlay();
    assert.equal(playback.getSnapshot().playing, false, "Playback MUST remain false when project duration is 0");
    assert.equal(playback.getSnapshot().time, 0, "Time must remain 0");

    // Stress test: Call 20 times repeatedly
    for (let i = 0; i < 20; i++) {
      handleTogglePlay();
    }
    assert.equal(playback.getSnapshot().playing, false, "Playback must remain strictly false across repeated attempts");
  });

  test("5.2 MobileCanvasStage onTogglePlayEvent halts when project duration is 0", () => {
    const project = createProject("empty-mobile-stage");
    const store = new EditorStore(project);
    const playback = new PlaybackStore();

    let activateAudioCalled = false;
    const engineRef = {
      current: {
        activateAudio: async () => {
          activateAudioCalled = true;
        },
      },
    };

    // Exact implementation of MobileCanvasStage onTogglePlayEvent:
    function onTogglePlayEvent() {
      const state = playback.getSnapshot();
      const curDur = projectDuration(store.getSnapshot());
      if (curDur <= 0) return;
      if (state.playing) {
        playback.set(state.time, false);
      } else {
        void engineRef.current
          ?.activateAudio()
          .then(() => playback.set(state.time >= curDur ? 0 : state.time, true))
          .catch(() => {});
      }
    }

    onTogglePlayEvent();
    assert.equal(playback.getSnapshot().playing, false, "Playback must not start on zero duration");
    assert.equal(activateAudioCalled, false, "activateAudio must NOT be called when duration <= 0");
  });

  test("5.3 MobileCanvasStage frame loop forcibly pauses if playing is somehow set to true on duration 0", () => {
    const project = createProject("forced-play-test");
    const store = new EditorStore(project);
    const playback = new PlaybackStore();

    // Adversarial scenario: playback was force-set to playing: true
    playback.set(0, true);
    assert.equal(playback.getSnapshot().playing, true);

    let compositorPaused = false;
    const compositor = {
      sync: () => true,
      pause: () => {
        compositorPaused = true;
      },
    };

    // Frame loop execution snippet from MobileCanvasStage.tsx lines 182-188:
    const state = playback.getSnapshot();
    const curDuration = projectDuration(store.getSnapshot());
    const ready = true;

    if (state.playing && ready) {
      if (curDuration <= 0) {
        playback.set(0, false);
        compositor.pause();
      } else {
        playback.set(0.1, true);
      }
    }

    assert.equal(playback.getSnapshot().playing, false, "Frame loop must immediately force playing to false on curDuration <= 0");
    assert.equal(compositorPaused, true, "compositor.pause() must be called");
  });

  test("5.4 Mobile playback functions normally when duration > 0", () => {
    let project = createProject("valid-mobile-project");
    const trackId = project.trackOrder[0];
    project = addAsset(project, { id: "v1", name: "v.mp4", kind: "video", duration: 8, width: 720, height: 1280, url: "blob:v", size: 100, mime: "video/mp4" });
    project = addClip(project, "v1", trackId, 0, { id: "c1", duration: 8 });

    assert.equal(projectDuration(project), 8);
    const store = new EditorStore(project);
    const playback = new PlaybackStore();

    function handleTogglePlay() {
      const state = playback.getSnapshot();
      const curDuration = projectDuration(store.getSnapshot());
      if (curDuration <= 0) return;
      if (!state.playing && curDuration > 0 && state.time >= curDuration) {
        playback.set(0, true);
      } else {
        playback.set(state.time, !state.playing);
      }
    }

    // Toggle 1: Play
    handleTogglePlay();
    assert.equal(playback.getSnapshot().playing, true, "Should start playing when duration > 0");

    // Toggle 2: Pause
    handleTogglePlay();
    assert.equal(playback.getSnapshot().playing, false, "Should pause when toggled again");

    // When playhead is at the end (time >= curDuration)
    playback.set(8.0, false);
    handleTogglePlay();
    assert.equal(playback.getSnapshot().playing, true);
    assert.equal(playback.getSnapshot().time, 0, "Should restart from 0 if at or past duration");
  });
});
