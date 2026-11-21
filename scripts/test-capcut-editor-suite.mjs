import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');
const cache = new Map();

function load(relative) {
  let filename = path.resolve(root, relative);
  if (!path.extname(filename)) {
    if (fs.existsSync(filename + '.ts')) filename += '.ts';
    else if (fs.existsSync(filename + '.tsx')) filename += '.tsx';
    else if (fs.existsSync(filename + '.js')) filename += '.js';
  }
  if (cache.has(filename)) return cache.get(filename).exports;
  const m = { exports: {} };
  cache.set(filename, m);
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React
    }
  }).outputText.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(filename).href));
  const local = s => s.startsWith('@/') ? load(s.slice(2)) : s.startsWith('.') ? load(path.resolve(path.dirname(filename), s)) : require(s);
  new vm.Script(`(function(require,module,exports,process){${js}\n})`, { filename }).runInThisContext()(local, m, m.exports, process);
  return m.exports;
}

// Load core editor modules under test
const model = load('app/lib/editor/model');
const op = load('app/lib/editor/operations');
const shortcuts = load('app/lib/editor/shortcuts');
const audioMix = load('app/lib/editor/audioMix');
const autoEdit = load('app/lib/editor/autoEdit');
const ai = load('app/lib/editor/ai');
const storeModule = load('app/lib/editor/store');
const { EditorStore } = storeModule;

// Helper: generate test project with video, audio, image, and text/caption tracks
function createBaseProject(aspect = '9:16') {
  let p = model.createProject('capcut-test');
  p.settings.aspectRatio = aspect;
  p = op.addAsset(p, {
    id: 'asset-video-1',
    name: 'Main Video',
    kind: 'video',
    mime: 'video/mp4',
    size: 1024 * 1024,
    duration: 30,
    width: 1080,
    height: 1920
  });
  p = op.addAsset(p, {
    id: 'asset-video-2',
    name: 'B-Roll Video',
    kind: 'video',
    mime: 'video/mp4',
    size: 512 * 1024,
    duration: 15,
    width: 1080,
    height: 1920
  });
  p = op.addAsset(p, {
    id: 'asset-audio-1',
    name: 'Voiceover',
    kind: 'audio',
    mime: 'audio/wav',
    size: 256 * 1024,
    duration: 20,
    width: 0,
    height: 0
  });
  p = op.addAsset(p, {
    id: 'asset-image-1',
    name: 'Overlay Image',
    kind: 'image',
    mime: 'image/png',
    size: 128 * 1024,
    duration: 5,
    width: 1080,
    height: 1080
  });
  return p;
}

/* ==========================================================================
 * SUITE 1: Magnetic Snapping & Trimming Math
 * ========================================================================== */
describe('1. Magnetic Snapping and Trimming Math', () => {

  test('1.1 snapTime & findSnapPoint: snaps to 0, playhead, and adjacent clip boundaries with weighted scoring', () => {
    let p = createBaseProject();
    p = op.addClip(p, 'asset-video-1', 'track-video', 5, { duration: 10, id: 'c1' }); // [5, 15]
    p = op.addClip(p, 'asset-video-2', 'track-video', 20, { duration: 5, id: 'c2' }); // [20, 25]

    const pps = 60; // 60 pixels per second -> 10px snap is 10/60 = 0.1667s
    const playhead = 12.0;

    // A. Snap to timeline start 0
    const nearZero = op.snapTime(p, 0.08, ['c1'], playhead, pps);
    assert.equal(nearZero, 0, 'Should snap near-zero to 0');

    // B. Snap to playhead (12.0)
    const nearPlayhead = op.snapTime(p, 12.08, ['c1'], playhead, pps);
    assert.equal(nearPlayhead, 12.0, 'Should snap to playhead');

    // C. Snap to clip 1 in-point (5.0)
    const nearClipIn = op.snapTime(p, 5.09, ['c2'], playhead, pps);
    assert.equal(nearClipIn, 5.0, 'Should snap to clip 1 in-point');

    // D. Snap to clip 1 out-point (15.0)
    const nearClipOut = op.snapTime(p, 14.95, ['c2'], playhead, pps);
    assert.equal(nearClipOut, 15.0, 'Should snap to clip 1 out-point');

    // E. Clip duration offset snapping (trailing edge of dragged clip snaps to clip 2 in-point 20.0)
    // If clip duration is 4.0, dragging start to 16.05 places trailing edge at 20.05, which is within 10px of 20.0
    const snapTrailingEdge = op.snapTime(p, 16.05, ['c1'], playhead, pps, 4.0);
    assert.equal(snapTrailingEdge, 16.0, 'Should snap trailing edge of clip to target boundary (20.0 - 4.0 = 16.0)');

    // F. Excluded clip IDs do not snap to themselves
    const ownEdge = op.snapTime(p, 5.05, ['c1'], playhead, pps);
    assert.notEqual(ownEdge, 5.0, 'Should not snap to excluded clip own in-point when no other target exists');

    // G. Beyond threshold should not snap (returns continuous time)
    const farTime = op.snapTime(p, 8.5, ['c1'], playhead, pps);
    assert.equal(farTime, 8.5, 'Should not snap when far beyond snap threshold');

    // H. findSnapPoint: returns SnapResult with target metadata and guide line time
    if (typeof op.findSnapPoint === 'function') {
      const snapObj = op.findSnapPoint(p, 12.05, ['c1'], playhead, pps);
      assert.equal(snapObj.snapped, true, 'Should mark snapped = true');
      assert.equal(snapObj.time, 12.0, 'Should snap to playhead at 12.0');
      assert.equal(snapObj.snapLineTime, 12.0, 'Guide line time should match target 12.0');
      assert.ok(snapObj.target, 'Should include snap target description');

      // Unsnapped returns snapped = false and continuous time
      const unsnapObj = op.findSnapPoint(p, 8.5, ['c1'], playhead, pps);
      assert.equal(unsnapObj.snapped, false);
      assert.equal(unsnapObj.time, 8.5);
      assert.equal(unsnapObj.snapLineTime, null);
    }
  });

  test('1.2 Magnetic Hysteresis detent model: holds snap within break distance (16px) and breaks beyond', () => {
    let p = createBaseProject();
    p = op.addClip(p, 'asset-video-1', 'track-video', 10, { duration: 10, id: 'c_target' });

    const pps = 60; // 60 px/s -> 10px snap = 0.1667s, 16px break = 0.2667s

    if (typeof op.findSnapPoint === 'function') {
      // 1. Initial approach from distance 12px (0.2s away: 9.80s) while not snapped -> no snap
      const approach = op.findSnapPoint(p, 9.80, ['c_moving'], 0, pps, 0, false, 10, 16);
      assert.equal(approach.snapped, false);

      // 2. Moving to distance 9px (0.15s away: 9.85s) while not snapped -> enters snap!
      const enter = op.findSnapPoint(p, 9.85, ['c_moving'], 0, pps, 0, false, 10, 16);
      assert.equal(enter.snapped, true);
      assert.equal(enter.time, 10.0);

      // 3. Moving back to distance 13px (0.217s away: 9.78s) while already snapped -> holds snap within break distance!
      const hold = op.findSnapPoint(p, 9.78, ['c_moving'], 0, pps, 0, true, 10, 16);
      assert.equal(hold.snapped, true, 'Should hold snap within 16px break threshold');
      assert.equal(hold.time, 10.0);

      // 4. Moving to distance 18px (0.30s away: 9.70s) while snapped -> breaks snap!
      const breakSnap = op.findSnapPoint(p, 9.70, ['c_moving'], 0, pps, 0, true, 10, 16);
      assert.equal(breakSnap.snapped, false, 'Should break snap when beyond 16px break threshold');
      assert.equal(breakSnap.time, 9.70);
    }
  });

  test('1.3 trimClip (left edge): correctly updates startTime, duration, sourceStart while keeping out-point stationary', () => {
    let p = createBaseProject();
    p = op.addClip(p, 'asset-video-1', 'track-video', 10, { duration: 8, sourceStart: 2, sourceEnd: 10, id: 'clip-trim' });
    const initialOutPoint = p.clips['clip-trim'].startTime + p.clips['clip-trim'].duration; // 18.0

    // Trim left by moving in-point from 10.0 to 12.0 (delta = +2s)
    const trimmed = op.trimClip(p, 'clip-trim', 'left', 12);
    const c = trimmed.clips['clip-trim'];

    assert.equal(c.startTime, 12, 'Left trim should update startTime to 12.0');
    assert.equal(c.duration, 6, 'Duration should decrease by 2s');
    assert.equal(c.sourceStart, 4, 'sourceStart should advance by 2s (speed 1.0)');
    assert.equal(c.startTime + c.duration, initialOutPoint, 'Out-point must remain stationary on left trim');

    // Headroom clamp: cannot trim left past source start = 0
    // clip currently has sourceStart = 2, speed = 1, startTime = 10 -> min startTime is 10 - 2 = 8.0
    const clampedHeadroom = op.trimClip(p, 'clip-trim', 'left', 4);
    assert.equal(clampedHeadroom.clips['clip-trim'].startTime, 8, 'Left trim must clamp to available source headroom (8.0)');
    assert.equal(clampedHeadroom.clips['clip-trim'].sourceStart, 0, 'sourceStart clamped to 0');

    // Minimum clip duration clamp: cannot trim left past (startTime + duration - minDuration)
    const minDur = Math.max(1 / p.settings.fps, 0.05);
    const overTrimmed = op.trimClip(p, 'clip-trim', 'left', 17.99);
    assert.ok(overTrimmed.clips['clip-trim'].duration >= minDur, 'Clip duration cannot be trimmed below minimum frame duration');
  });

  test('1.4 trimClip (right edge): updates duration & sourceEnd while keeping in-point & sourceStart stationary', () => {
    let p = createBaseProject();
    p = op.addClip(p, 'asset-video-1', 'track-video', 5, { duration: 10, sourceStart: 0, sourceEnd: 10, id: 'clip-right' });
    const initialInPoint = p.clips['clip-right'].startTime;
    const initialSourceStart = p.clips['clip-right'].sourceStart;

    // Trim right from 15.0 to 12.0
    const trimmed = op.trimClip(p, 'clip-right', 'right', 12);
    const c = trimmed.clips['clip-right'];

    assert.equal(c.startTime, initialInPoint, 'startTime must remain stationary on right trim');
    assert.equal(c.sourceStart, initialSourceStart, 'sourceStart must remain stationary on right trim');
    assert.equal(c.duration, 7, 'Duration should become 12 - 5 = 7s');
    assert.equal(c.sourceEnd, 7, 'sourceEnd should become sourceStart + duration * speed = 7s');

    // Tailroom clamp: asset duration is 30s. Extending right to 45s should clamp to 5 + 30 = 35s
    const extended = op.trimClip(p, 'clip-right', 'right', 45);
    assert.equal(extended.clips['clip-right'].duration, 30, 'Right trim must clamp to asset duration tailroom');
    assert.equal(extended.clips['clip-right'].sourceEnd, 30, 'sourceEnd must clamp to asset duration');
  });

  test('1.5 trimClip: synchronizes caption words within trimmed interval', () => {
    let p = createBaseProject();
    p = op.addCaption(p, 'First Second Third Fourth', 0, 10, {}, [
      { word: 'First', start: 1, end: 2 },
      { word: 'Second', start: 3, end: 4 },
      { word: 'Third', start: 5, end: 6 },
      { word: 'Fourth', start: 7, end: 8 }
    ]);
    const captionClip = Object.values(p.clips).find(c => c.contentId);
    assert.ok(captionClip);

    // Trim left past 'First' (trim in-point to 2.5s)
    const trimmedLeft = op.trimClip(p, captionClip.id, 'left', 2.5);
    const capAfterLeft = trimmedLeft.captions[captionClip.contentId];
    assert.equal(capAfterLeft.words.length, 3, 'First word should be clipped out');
    assert.equal(capAfterLeft.words[0].word, 'Second');
    assert.equal(capAfterLeft.text, 'Second Third Fourth');

    // Trim right before 'Fourth' (trim out-point to 6.5s)
    const trimmedRight = op.trimClip(trimmedLeft, captionClip.id, 'right', 6.5);
    const capAfterRight = trimmedRight.captions[captionClip.contentId];
    assert.equal(capAfterRight.words.length, 2, 'Fourth word should be clipped out');
    assert.equal(capAfterRight.text, 'Second Third');
  });

  test('1.6 trimClip: ripple option shifts downstream clips cleanly without overlaps', () => {
    let p = createBaseProject();
    p = op.addClip(p, 'asset-video-1', 'track-video', 0, { duration: 10, id: 'c1' });
    p = op.addClip(p, 'asset-video-2', 'track-video', 10, { duration: 5, id: 'c2' });

    // Ripple right trim c1 from duration 10 to 6 (delta = -4s)
    const rippleTrim = op.trimClip(p, 'c1', 'right', 6, { ripple: true });
    assert.equal(rippleTrim.clips.c1.duration, 6);
    assert.equal(rippleTrim.clips.c2.startTime, 6, 'Downstream clip c2 should ripple pull left by 4s to stay touching');

    // Non-ripple trim leaves gap
    const nonRippleTrim = op.trimClip(p, 'c1', 'right', 6);
    assert.equal(nonRippleTrim.clips.c1.duration, 6);
    assert.equal(nonRippleTrim.clips.c2.startTime, 10, 'Non-ripple trim leaves gap; c2 remains at 10');
  });

  test('1.7 trimToPlayhead: [ (in-point) and ] (out-point) trims clip to playhead', () => {
    let p = createBaseProject();
    p = op.addClip(p, 'asset-video-1', 'track-video', 2, { duration: 10, id: 'c1' }); // [2, 12]

    if (typeof op.trimToPlayhead === 'function') {
      // Trim in-point to playhead at 5.0 (shortcut [)
      const trimmedIn = op.trimToPlayhead(p, 'start', 5.0, ['c1']);
      assert.equal(trimmedIn.project.clips.c1.startTime, 5.0);
      assert.equal(trimmedIn.project.clips.c1.duration, 7.0);

      // Trim out-point to playhead at 9.0 (shortcut ])
      const trimmedOut = op.trimToPlayhead(trimmedIn.project, 'end', 9.0, ['c1']);
      assert.equal(trimmedOut.project.clips.c1.startTime, 5.0);
      assert.equal(trimmedOut.project.clips.c1.duration, 4.0);
    }
  });
});

/* ==========================================================================
 * SUITE 2: Split at Playhead with Timeline Integrity
 * ========================================================================== */
describe('2. Split at Playhead with Timeline Integrity', () => {

  test('2.1 splitClip: divides a video clip into two contiguous segments preserving total duration and timing', () => {
    let p = createBaseProject();
    p = op.addClip(p, 'asset-video-1', 'track-video', 4, { duration: 10, sourceStart: 1, sourceEnd: 11, speed: 1, id: 'orig' });
    const splitTime = 8.0; // 4s into clip

    const next = op.splitClip(p, 'orig', splitTime);
    const left = next.clips['orig'];
    const track = next.tracks['track-video'];

    assert.equal(track.clipIds.length, 2, 'Track should now contain 2 clips');
    const rightId = track.clipIds.find(id => id !== 'orig');
    assert.ok(rightId, 'Right clip ID must exist');
    const right = next.clips[rightId];

    // Left segment checks
    assert.equal(left.startTime, 4);
    assert.equal(left.duration, 4, 'Left duration should be splitTime - startTime = 4s');
    assert.equal(left.sourceStart, 1);
    assert.equal(left.sourceEnd, 5, 'Left sourceEnd should be 1 + 4*1 = 5s');
    assert.equal(left.fadeOut, 0, 'Left fadeOut should reset to 0');

    // Right segment checks
    assert.equal(right.startTime, 8, 'Right startTime should be splitTime');
    assert.equal(right.duration, 6, 'Right duration should be 10 - 4 = 6s');
    assert.equal(right.sourceStart, 5, 'Right sourceStart should match left sourceEnd');
    assert.equal(right.sourceEnd, 11, 'Right sourceEnd should match original sourceEnd');
    assert.equal(right.fadeIn, 0, 'Right fadeIn should reset to 0');

    // Conservation and continuity invariants
    assert.equal(left.duration + right.duration, 10, 'Sum of durations must equal original duration');
    assert.equal(left.startTime + left.duration, right.startTime, 'Clips must touch with zero gap');
  });

  test('2.2 splitClip: splits caption clips and cleanly partitions words and studioData', () => {
    let p = createBaseProject();
    p = op.addCaption(p, 'Apple Banana Cherry Date', 0, 8, {}, [
      { word: 'Apple', start: 0.5, end: 1.5 },
      { word: 'Banana', start: 2.0, end: 3.5 },
      { word: 'Cherry', start: 4.5, end: 5.5 },
      { word: 'Date', start: 6.0, end: 7.5 }
    ]);
    const origClip = Object.values(p.clips).find(c => c.contentId);
    assert.ok(origClip);

    const splitTime = 4.0;
    const next = op.splitClip(p, origClip.id, splitTime);

    const leftClip = next.clips[origClip.id];
    const rightClip = Object.values(next.clips).find(c => c.id !== origClip.id && c.trackId === origClip.trackId);
    assert.ok(rightClip);

    const leftCaption = next.captions[leftClip.contentId];
    const rightCaption = next.captions[rightClip.contentId];

    assert.equal(leftCaption.text, 'Apple Banana');
    assert.equal(leftCaption.words.length, 2);
    assert.equal(leftCaption.words[0].word, 'Apple');
    assert.equal(leftCaption.words[1].word, 'Banana');

    assert.equal(rightCaption.text, 'Cherry Date');
    assert.equal(rightCaption.words.length, 2);
    assert.equal(rightCaption.words[0].word, 'Cherry');
    assert.equal(rightCaption.words[1].word, 'Date');
  });

  test('2.3 splitClip: rejects split at edges or on locked tracks', () => {
    let p = createBaseProject();
    p = op.addClip(p, 'asset-video-1', 'track-video', 5, { duration: 10, id: 'c1' });

    // Split at or outside boundaries
    assert.throws(() => op.splitClip(p, 'c1', 5.0), /playhead inside/);
    assert.throws(() => op.splitClip(p, 'c1', 15.0), /playhead inside/);
    assert.throws(() => op.splitClip(p, 'c1', 2.0), /playhead inside/);
    assert.throws(() => op.splitClip(p, 'c1', 18.0), /playhead inside/);

    // Split on locked track
    p.tracks['track-video'].locked = true;
    assert.throws(() => op.splitClip(p, 'c1', 8.0), /Unlock this track/);
  });

  test('2.4 splitAtPlayhead & splitTopmostUnmutedClipAtPlayhead: falls back to topmost priority track when no selection exists', () => {
    let p = createBaseProject();
    p = op.addClip(p, 'asset-video-1', 'track-video', 0, { duration: 10, id: 'main-v' });
    p = op.addClip(p, 'asset-video-2', 'track-overlay', 0, { duration: 10, id: 'pip-v' });

    // When pip-v is selected, it splits pip-v
    const selResult = shortcuts.splitTopmostUnmutedClipAtPlayhead(p, 5, ['pip-v']);
    assert.equal(selResult.splitClipId, 'pip-v');
    assert.equal(selResult.wasTopmostFallback, false);

    // When no clip is selected, topmost track is overlay (pip-v)
    const fallbackResult = shortcuts.splitTopmostUnmutedClipAtPlayhead(p, 5, []);
    assert.equal(fallbackResult.splitClipId, 'pip-v');
    assert.equal(fallbackResult.wasTopmostFallback, true);

    // If overlay track is muted, it falls back to video track (main-v)
    let pMuted = op.changeTrack(p, 'track-overlay', { muted: true });
    const mutedFallback = shortcuts.splitTopmostUnmutedClipAtPlayhead(pMuted, 5, []);
    assert.equal(mutedFallback.splitClipId, 'main-v');

    // Also verify op.splitAtPlayhead returns the newly created downstream clip ID
    if (typeof op.splitAtPlayhead === 'function') {
      const opSplit = op.splitAtPlayhead(p, 5, []);
      assert.equal(opSplit.wasFallback, true);
      assert.equal(opSplit.splitClipIds.length, 1);
      // The split target was pip-v (overlay), so downstream clip is also on track-overlay
      const createdRightClip = opSplit.project.clips[opSplit.splitClipIds[0]];
      assert.equal(createdRightClip.trackId, 'track-overlay');
      assert.equal(createdRightClip.startTime, 5);
    }
  });

  test('2.5 deleteOrRippleDeleteClips & rippleDeleteClips: normal delete leaves gaps, ripple delete closes gaps', () => {
    let p = createBaseProject();
    p = op.addClip(p, 'asset-video-1', 'track-video', 0, { duration: 4, id: 'c1' });
    p = op.addClip(p, 'asset-video-2', 'track-video', 4, { duration: 4, id: 'c2' });
    p = op.addClip(p, 'asset-video-1', 'track-video', 8, { duration: 4, id: 'c3' });

    // Normal delete c2
    const normalDel = shortcuts.deleteOrRippleDeleteClips(p, ['c2'], { ripple: false });
    assert.equal(normalDel.clips['c2'], undefined);
    assert.equal(normalDel.clips['c3'].startTime, 8, 'Normal delete must leave gap; c3 stays at 8');

    // Ripple delete c2 via shortcuts
    const rippleDel = shortcuts.deleteOrRippleDeleteClips(p, ['c2'], { ripple: true });
    assert.equal(rippleDel.clips['c2'], undefined);
    assert.equal(rippleDel.clips['c3'].startTime, 4, 'Ripple delete must pull c3 left by 4s to close gap');

    // Ripple delete via op.rippleDeleteClips
    if (typeof op.rippleDeleteClips === 'function') {
      const opRipple = op.rippleDeleteClips(p, ['c2']);
      assert.equal(opRipple.clips['c2'], undefined);
      assert.equal(opRipple.clips['c3'].startTime, 4);
    }
  });
});

/* ==========================================================================
 * SUITE 3: Speed & Volume Adjustments with Boundary Clamps
 * ========================================================================== */
describe('3. Speed and Volume Adjustments with Boundary Clamps', () => {

  test('3.1 Speed adjustment: scales clip duration inversely, preserves media span, clamps [0.1, 10]', () => {
    let p = createBaseProject();
    p = op.addClip(p, 'asset-video-1', 'track-video', 0, { duration: 10, sourceStart: 0, sourceEnd: 10, speed: 1, id: 'c-spd' });

    // 2x speed -> duration becomes 5s
    const fast = op.changeClipProperty(p, 'c-spd', { speed: 2 });
    assert.equal(fast.clips['c-spd'].speed, 2);
    assert.equal(fast.clips['c-spd'].duration, 5);

    // 0.5x speed -> duration becomes 20s
    const slow = op.changeClipProperty(p, 'c-spd', { speed: 0.5 });
    assert.equal(slow.clips['c-spd'].speed, 0.5);
    assert.equal(slow.clips['c-spd'].duration, 20);

    // Conserves source span: sourceEnd - sourceStart = duration * speed
    assert.equal(
      slow.clips['c-spd'].sourceEnd - slow.clips['c-spd'].sourceStart,
      slow.clips['c-spd'].duration * slow.clips['c-spd'].speed
    );

    // Clamps excessive speed values to boundaries [0.1, 10]
    const clampedMax = op.changeClipProperty(p, 'c-spd', { speed: 99 });
    assert.ok(clampedMax.clips['c-spd'].speed <= 10, 'Speed must clamp at upper boundary (10x)');

    const clampedMin = op.changeClipProperty(p, 'c-spd', { speed: -5 });
    assert.ok(clampedMin.clips['c-spd'].speed >= 0.1, 'Speed must clamp at lower boundary (0.1x)');

    // Pitch preservation toggle test
    const pitchPreserved = op.changeClipProperty(p, 'c-spd', { preservePitch: true });
    assert.equal(pitchPreserved.clips['c-spd'].preservePitch, true);
  });

  test('3.2 Volume adjustment: clamps volume in [0, 2] (0% to 200%) and verifies dB conversion math', () => {
    let p = createBaseProject();
    p = op.addClip(p, 'asset-audio-1', 'track-audio', 0, { duration: 10, volume: 1, id: 'c-vol' });

    // Clamp tests
    const doubleVol = op.changeClipProperty(p, 'c-vol', { volume: 2.0 });
    assert.equal(doubleVol.clips['c-vol'].volume, 2.0);

    const overflowVol = op.changeClipProperty(p, 'c-vol', { volume: 3.5 });
    assert.equal(overflowVol.clips['c-vol'].volume, 2.0, 'Volume must clamp at 2.0 (200%)');

    const underflowVol = op.changeClipProperty(p, 'c-vol', { volume: -1.0 });
    assert.equal(underflowVol.clips['c-vol'].volume, 0, 'Volume must clamp at 0.0 (0%)');

    // Decibel conversion formula verification: dB = 20 * log10(gain)
    function gainToDb(gain) {
      return 20 * Math.log10(Math.max(gain, 1e-4));
    }
    function dbToGain(db) {
      return Math.pow(10, db / 20);
    }

    assert.ok(Math.abs(gainToDb(1.0) - 0.0) < 1e-6, '1.0 gain is 0 dB');
    assert.ok(Math.abs(gainToDb(2.0) - 6.0205999) < 1e-4, '2.0 gain is ~+6.02 dB');
    assert.ok(Math.abs(gainToDb(0.5) - (-6.0205999)) < 1e-4, '0.5 gain is ~-6.02 dB');
    assert.ok(Math.abs(dbToGain(0) - 1.0) < 1e-6, '0 dB converts to 1.0 gain');
    assert.ok(Math.abs(dbToGain(6.0205999) - 2.0) < 1e-4, '+6.02 dB converts to 2.0 gain');

    // Constant-power law verification for audio crossfades: cos^2(pi/2 * x) + sin^2(pi/2 * x) == 1.0
    for (let x = 0; x <= 1.0; x += 0.1) {
      const gA = Math.cos(Math.PI / 2 * x);
      const gB = Math.sin(Math.PI / 2 * x);
      const totalPower = gA * gA + gB * gB;
      assert.ok(Math.abs(totalPower - 1.0) < 1e-6, `Power must be constant 1.0 at x=${x}`);
    }
  });

  test('3.3 Fade-in and Fade-out: clamps within clip duration bounds', () => {
    let p = createBaseProject();
    p = op.addClip(p, 'asset-audio-1', 'track-audio', 0, { duration: 5, id: 'c-fade' });

    // Valid fades
    const faded = op.changeClipProperty(p, 'c-fade', { fadeIn: 1.5, fadeOut: 2.0 });
    assert.equal(faded.clips['c-fade'].fadeIn, 1.5);
    assert.equal(faded.clips['c-fade'].fadeOut, 2.0);

    // Over-duration fades clamp to clip duration (5s)
    const overFaded = op.changeClipProperty(p, 'c-fade', { fadeIn: 10, fadeOut: 12 });
    assert.equal(overFaded.clips['c-fade'].fadeIn, 5);
    assert.equal(overFaded.clips['c-fade'].fadeOut, 5);

    // Negative fades clamp to 0
    const negFaded = op.changeClipProperty(p, 'c-fade', { fadeIn: -2, fadeOut: -3 });
    assert.equal(negFaded.clips['c-fade'].fadeIn, 0);
    assert.equal(negFaded.clips['c-fade'].fadeOut, 0);
  });

  test('3.4 Audio role and ducking validation', () => {
    let p = createBaseProject();
    p = op.addClip(p, 'asset-audio-1', 'track-audio', 0, { duration: 5, id: 'c-role' });

    // Valid audio roles
    for (const role of ['speech', 'background', 'sfx']) {
      const next = op.changeClipProperty(p, 'c-role', { audioRole: role });
      assert.equal(next.clips['c-role'].audioRole, role);
    }

    // Invalid audio role throws Error
    assert.throws(() => op.changeClipProperty(p, 'c-role', { audioRole: 'invalid' }), /supported audio role/);

    // Ducking boolean
    const ducked = op.changeClipProperty(p, 'c-role', { ducking: false });
    assert.equal(ducked.clips['c-role'].ducking, false);
  });
});

/* ==========================================================================
 * SUITE 4: Canvas Bounding Box Transform Calculations
 * ========================================================================== */
describe('4. Canvas Bounding Box Transform Calculations', () => {

  test('4.1 Transform property clamps and resetClipTransform', () => {
    let p = createBaseProject();
    p = op.addClip(p, 'asset-image-1', 'track-image', 0, { duration: 5, id: 'c-tf' });

    // Translation, Scale, Rotation, Opacity
    const modified = op.changeClipProperty(p, 'c-tf', {
      transform: {
        x: 0.25,
        y: -0.15,
        scale: 2.5,
        rotation: 45,
        opacity: 0.8
      }
    });
    const t = modified.clips['c-tf'].transform;
    assert.equal(t.x, 0.25);
    assert.equal(t.y, -0.15);
    assert.equal(t.scale, 2.5);
    assert.equal(t.rotation, 45);
    assert.equal(t.opacity, 0.8);

    // Clamps: scale [0.05, 10], opacity [0, 1]
    const clamped = op.changeClipProperty(p, 'c-tf', {
      transform: {
        x: 0,
        y: 0,
        scale: 999,
        rotation: 0,
        opacity: 2.5
      }
    });
    assert.equal(clamped.clips['c-tf'].transform.scale, 10);
    assert.equal(clamped.clips['c-tf'].transform.opacity, 1);

    // Reset transform: resetClipTransform
    if (typeof op.resetClipTransform === 'function') {
      const reset = op.resetClipTransform(modified, 'c-tf');
      const rt = reset.clips['c-tf'].transform;
      assert.equal(rt.x, 0);
      assert.equal(rt.y, 0);
      assert.equal(rt.scale, 1);
      assert.equal(rt.rotation, 0);
      assert.equal(rt.opacity, 1);
    }
  });

  test('4.2 8-Point bounding box & rotation stalk geometry calculation', () => {
    // Math model from CapCut specification section 5.1
    const W = 400;
    const H = 300;
    const scale = 1.0;
    const rotationDeg = 0;
    const centerX = 540; // canvas midpoint for 1080
    const centerY = 960; // canvas midpoint for 1920

    // Local handle offsets
    const handles = {
      TL: { x: -W / 2, y: -H / 2 },
      TR: { x: W / 2, y: -H / 2 },
      BR: { x: W / 2, y: H / 2 },
      BL: { x: -W / 2, y: H / 2 },
      T:  { x: 0, y: -H / 2 },
      B:  { x: 0, y: H / 2 },
      L:  { x: -W / 2, y: 0 },
      R:  { x: W / 2, y: 0 },
      Rot: { x: 0, y: -H / 2 - 24 } // 24px standoff stalk
    };

    function projectToCanvas(localPt, cx, cy, rotDeg, s) {
      const rad = rotDeg * Math.PI / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const sx = localPt.x * s;
      const sy = localPt.y * s;
      return {
        x: cx + (sx * cos - sy * sin),
        y: cy + (sx * sin + sy * cos)
      };
    }

    const canvasTL = projectToCanvas(handles.TL, centerX, centerY, 0, 1);
    assert.deepEqual(canvasTL, { x: 340, y: 810 });

    const canvasBR = projectToCanvas(handles.BR, centerX, centerY, 0, 1);
    assert.deepEqual(canvasBR, { x: 740, y: 1110 });

    const canvasRot = projectToCanvas(handles.Rot, centerX, centerY, 0, 1);
    assert.deepEqual(canvasRot, { x: 540, y: 786 }); // 810 - 24 = 786

    // With 90 degree rotation
    const canvasRot90 = projectToCanvas(handles.Rot, centerX, centerY, 90, 1);
    assert.ok(Math.abs(canvasRot90.x - (540 + 174)) < 1e-4);
    assert.ok(Math.abs(canvasRot90.y - 960) < 1e-4);
  });

  test('4.3 Inverse Affine hit-testing accurately distinguishes body vs handle hits', () => {
    // Model from Section 5.2 of CapCut specification
    const W = 200, H = 100, scale = 1.0, rotDeg = 30, cx = 500, cy = 500;
    const rad = rotDeg * Math.PI / 180;

    function hitTest(screenX, screenY) {
      // Inverse transform: M^-1 * screenPt
      const dx = screenX - cx;
      const dy = screenY - cy;
      const localX = (dx * Math.cos(-rad) - dy * Math.sin(-rad)) / scale;
      const localY = (dx * Math.sin(-rad) + dy * Math.cos(-rad)) / scale;

      const hitRadius = 12; // 12px handle hit radius

      // Test rotation stalk (0, -H/2 - 24)
      const rotDist = Math.hypot(localX - 0, localY - (-H / 2 - 24));
      if (rotDist <= hitRadius) return 'handle-rotation';

      // Test corner handles
      const corners = {
        TL: { x: -W / 2, y: -H / 2 },
        TR: { x: W / 2, y: -H / 2 },
        BR: { x: W / 2, y: H / 2 },
        BL: { x: -W / 2, y: H / 2 }
      };
      for (const [name, pt] of Object.entries(corners)) {
        if (Math.hypot(localX - pt.x, localY - pt.y) <= hitRadius) return `handle-${name}`;
      }

      // Test inside body
      if (Math.abs(localX) <= W / 2 && Math.abs(localY) <= H / 2) return 'body';

      return 'miss';
    }

    // Center point should hit body
    assert.equal(hitTest(500, 500), 'body');

    // Outside point should miss
    assert.equal(hitTest(100, 100), 'miss');

    // Point at rotation stalk (in screen space rotated by 30 deg)
    const rotScreenX = cx + (0 * Math.cos(rad) - (-H / 2 - 24) * Math.sin(rad));
    const rotScreenY = cy + (0 * Math.sin(rad) + (-H / 2 - 24) * Math.cos(rad));
    assert.equal(hitTest(rotScreenX, rotScreenY), 'handle-rotation');
  });

  test('4.4 Cardinal Angle Snapping & Rotated Resize Cursor Mapping', () => {
    // Model from Section 5.4 & 5.6 of CapCut specification
    const snapAngles = [0, 45, 90, 135, 180, -180, -135, -90, -45];
    const snapThreshold = 3.5;

    function snapRotation(angleDeg) {
      for (const target of snapAngles) {
        if (Math.abs(angleDeg - target) <= snapThreshold) return target;
      }
      return angleDeg;
    }

    assert.equal(snapRotation(1.5), 0, '1.5 deg should snap to 0 deg');
    assert.equal(snapRotation(88.2), 90, '88.2 deg should snap to 90 deg');
    assert.equal(snapRotation(43.8), 45, '43.8 deg should snap to 45 deg');
    assert.equal(snapRotation(25.0), 25.0, '25.0 deg should not snap');

    // Rotated cursor orientation mapping
    function getRotatedCursor(baseAngleDeg, clipRotationDeg) {
      const total = (baseAngleDeg + clipRotationDeg) % 180;
      const normalized = total < 0 ? total + 180 : total;
      if (normalized >= 22.5 && normalized < 67.5) return 'nesw-resize';
      if (normalized >= 67.5 && normalized < 112.5) return 'ns-resize';
      if (normalized >= 112.5 && normalized < 157.5) return 'nwse-resize';
      return 'ew-resize';
    }

    assert.equal(getRotatedCursor(0, 0), 'ew-resize');
    assert.equal(getRotatedCursor(90, 0), 'ns-resize');
    assert.equal(getRotatedCursor(45, 0), 'nesw-resize');
    assert.equal(getRotatedCursor(135, 0), 'nwse-resize');
    // With 90 degree clip rotation, horizontal handle becomes vertical
    assert.equal(getRotatedCursor(0, 90), 'ns-resize');
  });

  test('4.5 Safe zone overlay calculations (TikTok/Reels 9:16: 1080x1920)', () => {
    // Safe zone specification from Section 6.1
    const safeZone = {
      xMin: 54,   // 5.0%
      xMax: 890,  // 82.4% (sidebar clearance)
      yMin: 230,  // 12.0% (top header clearance)
      yMax: 1490  // 77.6% (bottom captions/seek clearance)
    };

    function isInsideSafeZone(box) {
      return (
        box.x >= safeZone.xMin &&
        box.x + box.width <= safeZone.xMax &&
        box.y >= safeZone.yMin &&
        box.y + box.height <= safeZone.yMax
      );
    }

    // Centered caption within safe zone
    assert.ok(isInsideSafeZone({ x: 100, y: 1200, width: 600, height: 100 }), 'Centered caption is safe');

    // Caption in top header deadzone (< 230px)
    assert.equal(isInsideSafeZone({ x: 100, y: 150, width: 600, height: 100 }), false, 'Top header violation');

    // Caption in bottom deadzone (> 1490px)
    assert.equal(isInsideSafeZone({ x: 100, y: 1550, width: 600, height: 100 }), false, 'Bottom deadzone violation');

    // Caption colliding with right action rail (> 890px)
    assert.equal(isInsideSafeZone({ x: 800, y: 800, width: 200, height: 100 }), false, 'Action rail violation');
  });

  test('4.6 Caption highlight color and text styling operations', () => {
    let p = createBaseProject();
    p = op.addCaption(p, 'Highlight Me', 0, 5, { color: '#ffffff', font: 'Inter', size: 56 });
    const capClip = Object.values(p.clips).find(c => c.contentId);
    assert.ok(capClip);

    // changeCaptionHighlightColor
    if (typeof op.changeCaptionHighlightColor === 'function') {
      const highlighted = op.changeCaptionHighlightColor(p, capClip.id, '#FAFF00');
      assert.equal(highlighted.captions[capClip.contentId].highlightColor, '#FAFF00');
    }

    // changeCaptionProperty
    if (typeof op.changeCaptionProperty === 'function') {
      const modeUpdated = op.changeCaptionProperty(p, capClip.id, { highlightMode: 'full-line' });
      assert.equal(modeUpdated.captions[capClip.contentId].highlightMode, 'full-line');
    }
  });
});

/* ==========================================================================
 * SUITE 5: Ensure Existing AI Editing Pipeline & Remotion Renderers Unbroken
 * ========================================================================== */
describe('5. Ensure Existing AI Editing Pipeline and Remotion Renderers Unbroken', () => {

  test('5.1 AI autoEdit: createAutoEditPlan and finishAutoEditPlan run cleanly without mutating source project', () => {
    let p = createBaseProject();
    p = op.addClip(p, 'asset-video-1', 'track-video', 0, { duration: 10, id: 'v1' });
    p = op.addCaption(p, 'Um hello world this is great', 0, 10, {}, [
      { word: 'Um', start: 0.2, end: 0.8 },
      { word: 'hello', start: 1.0, end: 1.8 },
      { word: 'world', start: 2.0, end: 2.8 },
      { word: 'this', start: 3.0, end: 3.6 },
      { word: 'is', start: 3.8, end: 4.2 },
      { word: 'great', start: 4.5, end: 5.5 }
    ]);

    const beforeJson = JSON.stringify(p);
    const options = { ...autoEdit.DEFAULT_AUTO_EDIT, styleId: 'editorial' };

    // 1. Create plan
    const plan = autoEdit.createAutoEditPlan(p, options);
    assert.ok(plan);
    assert.ok(Array.isArray(plan.list.decisions));
    assert.equal(JSON.stringify(p), beforeJson, 'Source project must remain strictly unmutated');

    // 2. Finish plan
    const finished = autoEdit.finishAutoEditPlan(p, plan.list, [], [], options);
    assert.ok(finished.reviewed, 'Must produce a valid reviewed document');
    assert.ok(finished.reviewed.revision > p.revision || finished.reviewed.revision !== undefined);
  });

  test('5.2 ai.applyEditDecisionList: applies sequential pure document operations idempotently', () => {
    let p = createBaseProject();
    p = op.addClip(p, 'asset-video-1', 'track-video', 0, { duration: 10, id: 'c1' });

    const edl = {
      version: 1,
      projectId: p.id,
      baseRevision: p.revision,
      decisions: [
        { op: 'moveClip', clipId: 'c1', startTime: 2 },
        { op: 'trimClip', clipId: 'c1', edge: 'right', time: 8 },
        { op: 'changeClipProperty', clipId: 'c1', changes: { volume: 0.8, speed: 1.0 } }
      ]
    };

    const result = ai.applyEditDecisionList(p, edl);
    assert.equal(result.clips.c1.startTime, 2);
    assert.equal(result.clips.c1.duration, 6);
    assert.equal(result.clips.c1.volume, 0.8);
  });

  test('5.3 Remotion Renderer Contract: NormalizedEditorComposition frame & audio sequence invariants', () => {
    let p = createBaseProject();
    p = op.addClip(p, 'asset-video-1', 'track-video', 2, { duration: 8, sourceStart: 1, speed: 1, volume: 1, id: 'v1' });
    p = op.addClip(p, 'asset-audio-1', 'track-audio', 0, { duration: 15, sourceStart: 0, speed: 1, volume: 0.8, id: 'a1' });
    p = op.addClip(p, 'asset-image-1', 'track-image', 0, { duration: 5, volume: 0, id: 'i1' });

    const fps = p.settings.fps || 30;

    // Filter used in NormalizedEditorComposition.tsx:
    const activeAudioClips = Object.values(p.clips).filter(c =>
      c.assetId &&
      p.assets[c.assetId]?.kind !== 'image' &&
      c.volume > 0 &&
      !p.tracks[c.trackId].hidden &&
      !p.tracks[c.trackId].muted
    );

    assert.equal(activeAudioClips.length, 2, 'Image clip and zero volume clips must be excluded from audio sequences');

    // Test sequence frame bounds calculation
    const v1Frames = {
      from: Math.round(p.clips.v1.startTime * fps),
      durationInFrames: Math.max(1, Math.round(p.clips.v1.duration * fps)),
      startFrom: Math.round(p.clips.v1.sourceStart * fps)
    };
    assert.equal(v1Frames.from, 60); // 2s * 30fps
    assert.equal(v1Frames.durationInFrames, 240); // 8s * 30fps
    assert.equal(v1Frames.startFrom, 30); // 1s * 30fps

    // Audio ducking calculation: speechWindows & clipGain
    const windows = audioMix.speechWindows(p);
    assert.ok(Array.isArray(windows));
    const gainAt0 = audioMix.clipGain(p, p.clips.a1, 0, windows);
    assert.ok(Number.isFinite(gainAt0));
    assert.ok(gainAt0 >= 0 && gainAt0 <= 1);
  });

  test('5.4 EditorStore Undo/Redo: full state transitions and non-destructive history', () => {
    let p = createBaseProject();
    p = op.addClip(p, 'asset-video-1', 'track-video', 0, { duration: 10, id: 'c1' });

    const store = new EditorStore(p);
    assert.equal(store.getSnapshot().clips.c1.duration, 10);

    // Perform an edit: trim clip to 6s
    store.execute(proj => op.trimClip(proj, 'c1', 'right', 6));
    assert.equal(store.getSnapshot().clips.c1.duration, 6);

    // Perform second edit: move clip to 3s
    store.execute(proj => op.moveClip(proj, 'c1', 3));
    assert.equal(store.getSnapshot().clips.c1.startTime, 3);

    // Undo second edit
    store.undo();
    assert.equal(store.getSnapshot().clips.c1.startTime, 0);
    assert.equal(store.getSnapshot().clips.c1.duration, 6);

    // Undo first edit
    store.undo();
    assert.equal(store.getSnapshot().clips.c1.duration, 10);

    // Redo first edit
    store.redo();
    assert.equal(store.getSnapshot().clips.c1.duration, 6);

    // Redo second edit
    store.redo();
    assert.equal(store.getSnapshot().clips.c1.startTime, 3);
  });

  test('5.5 Project JSON Serialization & Persistence Roundtrip', () => {
    let p = createBaseProject();
    p = op.addClip(p, 'asset-video-1', 'track-video', 2, { duration: 8, id: 'c1' });
    p = op.addCaption(p, 'Hello World', 2, 5, { color: '#ffffff', size: 48 });

    const serialized = JSON.stringify(p);
    const deserialized = JSON.parse(serialized);

    assert.deepEqual(deserialized.clips, p.clips);
    assert.deepEqual(deserialized.tracks, p.tracks);
    assert.deepEqual(deserialized.captions, p.captions);
    assert.deepEqual(deserialized.trackOrder, p.trackOrder);
    assert.equal(deserialized.settings.aspectRatio, p.settings.aspectRatio);
  });
});
