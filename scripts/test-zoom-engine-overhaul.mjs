import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json")), ts = require("typescript");

function loader(mocks = {}) {
  const cache = new Map();
  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) filename += ".ts";
    const key = path.relative(root, filename).replaceAll("\\", "/");
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} }; cache.set(filename, loadedModule);
    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(filename).href));
    const localRequire = specifier => Object.hasOwn(mocks, specifier) ? mocks[specifier] : specifier.startsWith("@/") ? load(specifier.slice(2)) : specifier.startsWith(".") ? load(path.relative(root, path.resolve(path.dirname(filename), specifier))) : require(specifier);
    vm.runInNewContext(source, { exports: loadedModule.exports, module: loadedModule, require: localRequire, console, process, URL, Buffer, Math, crypto, setTimeout, clearTimeout });
    return loadedModule.exports;
  }
  return load;
}

const load = loader();
const { zoomTransform } = load('app/lib/editor/zoom');
const { rippleCut } = load('app/lib/editor/rippleCut');
const { createProject } = load('app/lib/editor/model');
const { addTrack, addAsset, addClip } = load('app/lib/editor/operations');

function createSampleProject() {
  let p = createProject({ title: 'Zoom Test' });
  p = addTrack(p, 'video', 'Main Video');
  const trackId = p.trackOrder[0];
  p = addAsset(p, {
    kind: 'video',
    name: 'Interview.mp4',
    duration: 30,
    width: 1080,
    height: 1920,
    fps: 30,
  });
  const assetId = Object.keys(p.assets)[0];
  p = addClip(p, assetId, trackId, 0, 30);
  return { project: p, clipId: Object.keys(p.clips)[0] };
}

function makeClip(zoom) {
  return {
    id: 'c1',
    trackId: 't1',
    startTime: 0,
    duration: 30,
    sourceStart: 0,
    speed: 1,
    transform: { scale: 1, x: 0, y: 0, rotation: 0, opacity: 1 },
    zooms: [zoom]
  };
}

test('punch-in zoom holds flat for >= 2.0s and resets via 0ms hard cut without rubber-band bounce', () => {
  const z = {
    sourceStart: 5.0,
    sourceEnd: 8.0,
    fromScale: 1.0,
    toScale: 1.20,
    returnToStart: true,
    easing: 'smooth',
    focusX: 0,
    focusY: -0.14,
    style: 'punch-in',
  };
  const clip = makeClip(z);

  // Before zoom start: neutral 1.0x
  const pre = zoomTransform(clip, 4.9);
  assert.equal(pre.scale, 1.0);

  // Exactly at zoom start (0ms step): jumps immediately to 1.20x
  const start = zoomTransform(clip, 5.0);
  assert.equal(start.scale, 1.20);

  // Middle of duration (1.5s in): strictly flat hold at 1.20x (NO bounce, NO decay)
  const mid = zoomTransform(clip, 6.5);
  assert.equal(mid.scale, 1.20);

  // Just before zoom end: still strictly 1.20x
  const justBeforeEnd = zoomTransform(clip, 7.999);
  assert.equal(justBeforeEnd.scale, 1.20);

  // Exactly at sourceEnd: 0ms hard cut reset back to 1.0x
  const reset = zoomTransform(clip, 8.0);
  assert.equal(reset.scale, 1.0);
});

test('snap-in zoom whips over 0.22s with zero overshoot above target scale and hard cuts back', () => {
  const z = {
    sourceStart: 2.0,
    sourceEnd: 5.0,
    fromScale: 1.0,
    toScale: 1.20,
    returnToStart: true,
    easing: 'smooth',
    focusX: 0,
    focusY: -0.14,
    style: 'snap-in',
  };
  const clip = makeClip(z);

  // At start: 1.0x
  assert.equal(zoomTransform(clip, 2.0).scale, 1.0);

  // During whip (0.11s in, half way through 0.22s whip duration)
  const duringWhip = zoomTransform(clip, 2.11);
  assert.ok(duringWhip.scale > 1.0, `Expected scale > 1.0, got ${duringWhip.scale}`);
  assert.ok(duringWhip.scale < 1.20, `Expected scale < 1.20, got ${duringWhip.scale}`);

  // After 0.22s whip (e.g. 2.25s): locked at 1.20x with ZERO overshoot
  const afterWhip = zoomTransform(clip, 2.25);
  assert.equal(afterWhip.scale, 1.20);

  // Hold flat during 3.5s
  const mid = zoomTransform(clip, 3.5);
  assert.equal(mid.scale, 1.20);

  // Hard cut at 5.0s
  assert.equal(zoomTransform(clip, 5.0).scale, 1.0);
});

test('smooth-push creeps slowly and hard cuts at end', () => {
  const z = {
    sourceStart: 1.0,
    sourceEnd: 5.0,
    fromScale: 1.0,
    toScale: 1.10,
    returnToStart: true,
    easing: 'smooth',
    focusX: 0,
    focusY: -0.14,
    style: 'smooth-push',
  };
  const clip = makeClip(z);

  assert.equal(zoomTransform(clip, 1.0).scale, 1.0);
  const mid = zoomTransform(clip, 3.0);
  assert.ok(mid.scale > 1.0 && mid.scale < 1.10);
  const nearEnd = zoomTransform(clip, 4.99);
  assert.ok(nearEnd.scale > 1.09 && nearEnd.scale <= 1.10);
  assert.equal(zoomTransform(clip, 5.0).scale, 1.0);
});

test('eye-line upper-third offset translates Y down by (scale - 1) * 0.14 to lock eyes at 0.36', () => {
  const z = {
    sourceStart: 0,
    sourceEnd: 5,
    fromScale: 1.0,
    toScale: 1.20,
    returnToStart: true,
    easing: 'smooth',
    focusX: 0,
    focusY: -0.14,
    style: 'punch-in',
  };
  const clip = makeClip(z);

  const transform = zoomTransform(clip, 2.5);
  assert.equal(transform.scale, 1.20);
  // translateY = -focusY * (multiplier - 1) = -(-0.14) * (1.20 - 1) = +0.028
  assert.ok(Math.abs(transform.y - 0.028) < 1e-6, `Expected y ≈ 0.028, got ${transform.y}`);
});

test('rippleCut with alternateCadence splits speech and alternates Segment A (1.00x) and Segment B (1.15x punch-in)', () => {
  const { project } = createSampleProject();
  
  // Cut silence between 4.0s-4.6s and 10.0s-10.7s (>0.40s silence)
  const cutRanges = [
    { start: 4.0, end: 4.6 },
    { start: 10.0, end: 10.7 }
  ];

  const updatedProject = rippleCut(project, cutRanges, { alternateCadence: true });
  const videoTrack = updatedProject.tracks[updatedProject.trackOrder[0]];
  const clips = videoTrack.clipIds.map(id => updatedProject.clips[id]).sort((a, b) => a.startTime - b.startTime);

  // We should have 3 segments
  assert.equal(clips.length, 3);
  
  // Segment A (index 0): 1.00x base framing (no zoom)
  assert.ok(!clips[0].zooms || clips[0].zooms.length === 0);

  // Segment B (index 1): 1.15x punch-in zoom with focusY = -0.14
  assert.ok(clips[1].zooms && clips[1].zooms.length === 1);
  assert.equal(clips[1].zooms[0].style, 'punch-in');
  assert.equal(clips[1].zooms[0].toScale, 1.15);
  assert.equal(clips[1].zooms[0].focusY, -0.14);

  // Segment C (index 2): 1.00x base framing (no zoom)
  assert.ok(!clips[2].zooms || clips[2].zooms.length === 0);
});

test('reconcileEditingDecisions enforces 2.2s cooldown and pairs snap-in with whoosh SFX', () => {
  const { reconcileEditingDecisions } = load('app/lib/editor/inPlaceReconciler');
  const { project, clipId } = createSampleProject();

  const rawDecisions = [
    // Zoom 1: snap-in at 2.0s to 5.0s
    { op: 'addZoom', clipId, startTime: 2.0, endTime: 5.0, fromScale: 1.0, toScale: 1.20, style: 'snap-in' },
    // Zoom 2: jittery zoom at 3.0s (< 2.2s cooldown from previous zoom end/start)
    { op: 'addZoom', clipId, startTime: 3.0, endTime: 4.5, fromScale: 1.0, toScale: 1.18, style: 'punch-in' },
    // Zoom 3: valid zoom at 7.5s (> 2.2s after zoom 1 ends at 5.0s)
    { op: 'addZoom', clipId, startTime: 7.5, endTime: 10.0, fromScale: 1.0, toScale: 1.18, style: 'punch-in' }
  ];

  const result = reconcileEditingDecisions(project, rawDecisions, []);
  const zoomDecisions = result.decisions.filter(d => d.op === 'addZoom');

  // Zoom 2 should have been dropped due to the 2.2s cooldown
  assert.equal(zoomDecisions.length, 2);
  assert.equal(zoomDecisions[0].startTime, 2.0);
  assert.equal(zoomDecisions[0].style, 'snap-in');
  assert.equal(zoomDecisions[1].startTime, 7.5);
  assert.equal(zoomDecisions[1].style, 'punch-in');

  // snap-in should have generated a whoosh SFX tool request or decision
  const hasWhooshSfx = result.toolRequests.some(t => t.type === 'sfx' && (t.soundId === 'whoosh' || t.soundId === 'fast-swish'));
  assert.ok(hasWhooshSfx, 'snap-in zoom must pair with subtle whoosh SFX');
});

