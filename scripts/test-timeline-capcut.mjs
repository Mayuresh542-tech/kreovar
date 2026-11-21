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

const { createProject } = load("app/lib/editor/model.ts");
const {
  addAsset,
  addClip,
  addTrack,
  trimClip,
  splitClip,
  splitAtPlayhead,
  trimToPlayhead,
  rippleDeleteClips,
  findSnapPoint,
  snapPlayhead,
  snapTime,
  toggleTrackLock,
  toggleTrackMute,
  toggleTrackHidden,
  removeTrack,
} = load("app/lib/editor/operations.ts");
const { resolveShortcutAction } = load("app/lib/editor/shortcuts.ts");

function createTestProject() {
  let p = createProject("test-project", "CapCut Timeline Test");
  p = addAsset(p, {
    id: "asset-1",
    name: "Video 1",
    kind: "video",
    mime: "video/mp4",
    size: 1024,
    duration: 10,
    width: 1920,
    height: 1080,
  });
  p = addAsset(p, {
    id: "asset-2",
    name: "Video 2",
    kind: "video",
    mime: "video/mp4",
    size: 1024,
    duration: 10,
    width: 1920,
    height: 1080,
  });
  p = addClip(p, "asset-1", "track-video", 0, { id: "clip-1", duration: 5 });
  p = addClip(p, "asset-2", "track-video", 5, { id: "clip-2", duration: 4 });
  return p;
}

test("1. Magnetic snapping with hysteresis detent model and visual guide line", () => {
  const p = createTestProject();
  const pps = 60; // 60 px per second -> 10px snap = 0.1667s, 16px break = 0.2667s

  // Candidate edge: clip-1 ends at 5.0s, clip-2 starts at 5.0s
  // Case A: Moving clip near 5.0s from 4.88s (distance = 0.12s * 60 = 7.2px <= 10px snapThreshold)
  const snapResult1 = findSnapPoint(p, 4.88, ["clip-test"], 0, pps, 0, false, 10, 16);
  assert.equal(snapResult1.snapped, true, "Should snap when within 10px radius");
  assert.equal(snapResult1.time, 5.0, "Should snap exactly to 5.0s edge");
  assert.equal(snapResult1.snapLineTime, 5.0, "Guide line must be positioned at 5.0s target");

  // Case B: Hysteresis resistance well: while currently snapped, dragging away to 4.80s (distance = 12px > 10px but < 16px breakThreshold)
  const snapResult2 = findSnapPoint(p, 4.80, ["clip-test"], 0, pps, 0, true, 10, 16);
  assert.equal(snapResult2.snapped, true, "Hysteresis must hold snap detent until 16px break threshold");
  assert.equal(snapResult2.time, 5.0, "Time remains locked to target during detent hold");

  // Case C: Breaking snap detent: dragging further to 4.65s (distance = 21px > 16px)
  const snapResult3 = findSnapPoint(p, 4.65, ["clip-test"], 0, pps, 0, true, 10, 16);
  assert.equal(snapResult3.snapped, false, "Must release snap when breaking distance exceeds 16px");
  assert.equal(snapResult3.snapLineTime, null, "Guide line must disappear when not snapped");

  // Case D: Snapping trailing edge of a moving clip
  // Clip of duration 3.0 moved such that trailing edge is near 5.0s (start at 2.05s -> trailing edge 5.05s, dist = 3px)
  const snapResultTrail = findSnapPoint(p, 2.05, ["clip-moving"], 0, pps, 3.0, false, 10, 16);
  assert.equal(snapResultTrail.snapped, true, "Trailing edge should snap to target edge");
  assert.equal(snapResultTrail.time, 2.0, "Start time should adjust so trailing edge hits 5.0s (5.0 - 3.0 = 2.0)");
  assert.equal(snapResultTrail.snapLineTime, 5.0, "Guide line is drawn at target edge 5.0s");

  // Case E: Playhead snapping during scrub
  const playheadSnap = snapPlayhead(p, 4.90, pps, false, 10, 16);
  assert.equal(playheadSnap.snapped, true, "Playhead scrubber snaps to clip edges");
  assert.equal(playheadSnap.time, 5.0);
  assert.equal(playheadSnap.snapLineTime, 5.0);
});

test("2. Smooth edge trimming with drag bounds and ripple support", () => {
  let p = createTestProject();
  // clip-1: [0..5s], asset duration 10s. clip-2: [5..9s]

  // A. In-point (left edge) trimming without ripple:
  // Trim left edge to 1.5s
  let trimmed = trimClip(p, "clip-1", "left", 1.5);
  const c1 = trimmed.clips["clip-1"];
  assert.equal(c1.startTime, 1.5, "New startTime is 1.5s");
  assert.equal(c1.duration, 3.5, "New duration is 3.5s");
  assert.equal(c1.sourceStart, 1.5, "Source start shifted by 1.5s");
  assert.equal(trimmed.clips["clip-2"].startTime, 5.0, "Without ripple, clip-2 stays at 5.0s");

  // B. In-point trimming cannot exceed asset media headroom
  let boundedHeadroom = trimClip(p, "clip-1", "left", -2.0);
  assert.equal(boundedHeadroom.clips["clip-1"].startTime, 0, "Cannot trim past source media start 0");

  // C. Out-point (right edge) trimming with ripple:
  // clip-1 is [0..5s], trim right edge to 3.0s with ripple: true
  let rippleTrimmed = trimClip(p, "clip-1", "right", 3.0, { ripple: true });
  assert.equal(rippleTrimmed.clips["clip-1"].duration, 3.0, "Clip 1 duration trimmed to 3.0s");
  // Downstream clip-2 was at 5.0s, duration changed by -2.0s -> clip-2 shifted left to 3.0s
  assert.equal(rippleTrimmed.clips["clip-2"].startTime, 3.0, "Ripple trimming closes the downstream gap");
});

test("3. Split at playhead (S key) with ripple handling and trim to playhead ([ and ])", () => {
  let p = createTestProject();
  // clip-1 is [0..5s], clip-2 is [5..9s]

  // A. Split selected clip at playhead 2.5s
  const splitRes1 = splitAtPlayhead(p, 2.5, ["clip-1"]);
  assert.equal(splitRes1.wasFallback, false, "Should split selected clip");
  assert.equal(splitRes1.splitClipIds.length, 1, "One new clip created");
  const leftClip = splitRes1.project.clips["clip-1"];
  const newRightClipId = splitRes1.splitClipIds[0];
  const rightClip = splitRes1.project.clips[newRightClipId];
  assert.equal(leftClip.startTime, 0);
  assert.equal(leftClip.duration, 2.5);
  assert.equal(rightClip.startTime, 2.5);
  assert.equal(rightClip.duration, 2.5);

  // B. Fallback split: when nothing is selected, splits topmost unmuted clip under playhead
  const splitFallback = splitAtPlayhead(p, 6.5, []);
  assert.equal(splitFallback.wasFallback, true, "Should use fallback to topmost unmuted clip");
  assert.equal(splitFallback.splitClipIds.length, 1);
  const c2Left = splitFallback.project.clips["clip-2"];
  assert.equal(c2Left.startTime, 5.0);
  assert.equal(c2Left.duration, 1.5); // 6.5 - 5.0 = 1.5

  // C. Trim Start to Playhead (`[`)
  // clip-1 is [0..5s]. Playhead at 2.0s. Trim start to 2.0s with ripple
  const trimStartRes = trimToPlayhead(p, "start", 2.0, ["clip-1"], { ripple: true });
  assert.equal(trimStartRes.modifiedClipIds.length, 1);
  assert.equal(trimStartRes.project.clips["clip-1"].duration, 3.0);

  // D. Trim End to Playhead (`]`)
  // clip-1 is [0..5s]. Playhead at 3.5s. Trim end to 3.5s
  const trimEndRes = trimToPlayhead(p, "end", 3.5, ["clip-1"]);
  assert.equal(trimEndRes.modifiedClipIds.length, 1);
  assert.equal(trimEndRes.project.clips["clip-1"].duration, 3.5);

  // E. Ripple delete clips: closes downstream gap
  const rippleDelProject = rippleDeleteClips(p, ["clip-1"]);
  assert.equal(rippleDelProject.clips["clip-1"], undefined, "Clip 1 removed");
  assert.equal(rippleDelProject.clips["clip-2"].startTime, 0, "Downstream clip-2 pulled left to 0");
});

test("4. Track lane controls: lock, mute, hide and safe removal", () => {
  let p = createTestProject();
  const trackId = "track-video";

  // A. Lock toggle
  assert.equal(p.tracks[trackId].locked, false);
  p = toggleTrackLock(p, trackId);
  assert.equal(p.tracks[trackId].locked, true, "Track is now locked");

  // Edits on locked track must be rejected
  assert.throws(() => trimClip(p, "clip-1", "right", 4.0), /Unlock this track before editing/);

  // Unlock
  p = toggleTrackLock(p, trackId);
  assert.equal(p.tracks[trackId].locked, false, "Track unlocked");

  // B. Mute toggle
  assert.equal(p.tracks[trackId].muted, false);
  p = toggleTrackMute(p, trackId);
  assert.equal(p.tracks[trackId].muted, true, "Track muted");

  // Muted track excluded from split fallback
  const splitMuted = splitAtPlayhead(p, 2.5, []);
  assert.equal(splitMuted.splitClipIds.length, 0, "Muted track skipped for fallback split");

  p = toggleTrackMute(p, trackId);
  assert.equal(p.tracks[trackId].muted, false);

  // C. Hide toggle
  assert.equal(p.tracks[trackId].hidden, false);
  p = toggleTrackHidden(p, trackId);
  assert.equal(p.tracks[trackId].hidden, true, "Track hidden");

  // D. Safe track removal
  p = addTrack(p, "audio");
  const audioTrackId = p.trackOrder[p.trackOrder.length - 1];
  assert.equal(p.tracks[audioTrackId] !== undefined, true);
  p = removeTrack(p, audioTrackId);
  assert.equal(p.tracks[audioTrackId], undefined, "Track removed safely");
});

test("5. Essential keyboard shortcuts mapping (Space, S, Delete, Ctrl+D, [, ])", () => {
  assert.equal(resolveShortcutAction({ code: "Space", key: " " }), "toggle-play");
  assert.equal(resolveShortcutAction({ key: "s" }), "split-clip");
  assert.equal(resolveShortcutAction({ key: "S" }), "split-clip");
  assert.equal(resolveShortcutAction({ key: "Delete" }), "delete-clip");
  assert.equal(resolveShortcutAction({ key: "Delete", shiftKey: true }), "ripple-delete-clip");
  assert.equal(resolveShortcutAction({ key: "d", ctrlKey: true }), "duplicate-clip");
  assert.equal(resolveShortcutAction({ key: "[" }), "trim-start-to-playhead");
  assert.equal(resolveShortcutAction({ key: "q" }), "trim-start-to-playhead");
  assert.equal(resolveShortcutAction({ key: "]" }), "trim-end-to-playhead");
  assert.equal(resolveShortcutAction({ key: "w" }), "trim-end-to-playhead");
});
