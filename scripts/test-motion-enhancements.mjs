import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');

function loader(mocks = {}) {
  const cache = new Map();
  function load(relative) {
    let file = path.resolve(root, relative);
    if (!path.extname(file)) file += '.ts';
    const key = path.relative(root, file).replaceAll('\\', '/');
    if (key in mocks) return mocks[key];
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} };
    cache.set(file, mod);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText;
    new vm.Script('(function(require,module,exports){' + code + '\n})', { filename: file }).runInThisContext()(
      s => s.startsWith('@/') ? load(s.slice(2)) : s.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(file), s))) : require(s),
      mod,
      mod.exports
    );
    return mod.exports;
  }
  return load;
}

const load = loader();
const model = load('app/lib/editor/model');
const op = load('app/lib/editor/operations');
const mediaAnim = load('app/lib/editor/mediaAnimation');
const kenBurns = load('app/lib/editor/kenBurns');
const kineticStickers = load('app/lib/editor/kineticStickers');
const editingIntent = load('app/lib/editor/editingIntent');
const reconciler = load('app/lib/editor/inPlaceReconciler');
const sequential = load('app/lib/editor/sequentialEdit');

function createSampleProject() {
  let p = model.createProject('motion-test');
  // Add video track with footage
  p = op.addAsset(p, {
    id: 'asset-main',
    name: 'MainFootage.mp4',
    kind: 'video',
    mime: 'video/mp4',
    duration: 30,
    width: 1920,
    height: 1080,
    size: 1000
  });
  p = op.addClip(p, 'asset-main', 'track-video', 0, {
    id: 'clip-main',
    duration: 30,
    sourceStart: 0,
    sourceEnd: 30,
    volume: 1
  });

  // Add B-roll asset on overlay track
  p = op.addAsset(p, {
    id: 'asset-broll-1',
    name: 'BrollTech.mp4',
    kind: 'video',
    mime: 'video/mp4',
    duration: 8,
    width: 1920,
    height: 1080,
    size: 500,
    stockKey: 'broll:tech-1'
  });
  p = op.addClip(p, 'asset-broll-1', 'track-overlay', 4, {
    id: 'clip-broll-1',
    duration: 5,
    sourceStart: 0,
    sourceEnd: 5,
    volume: 0
  });

  p = op.addAsset(p, {
    id: 'asset-broll-2',
    name: 'BrollFinance.mp4',
    kind: 'video',
    mime: 'video/mp4',
    duration: 10,
    width: 1920,
    height: 1080,
    size: 500,
    stockKey: 'broll:finance-1'
  });
  p = op.addClip(p, 'asset-broll-2', 'track-overlay', 12, {
    id: 'clip-broll-2',
    duration: 6,
    sourceStart: 0,
    sourceEnd: 6,
    volume: 0
  });

  // Add caption clip with timed words for keyword detection
  const words = [
    { word: 'Hello', start: 0.5, end: 0.9 },
    { word: 'welcome', start: 1.0, end: 1.4 },
    { word: 'to', start: 1.5, end: 1.7 },
    { word: 'our', start: 1.8, end: 2.0 },
    { word: 'rocket', start: 2.1, end: 2.6 },   // Keyword 1: rocket 🚀
    { word: 'launch', start: 2.7, end: 3.2 },   // Keyword 2: launch (rocket)
    { word: 'today', start: 3.3, end: 3.6 },
    { word: 'we', start: 5.0, end: 5.2 },
    { word: 'made', start: 5.3, end: 5.6 },
    { word: 'insane', start: 5.7, end: 6.2 },   // Keyword 3: insane (fire 🔥)
    { word: 'money', start: 6.3, end: 6.8 },    // Keyword 4: money 💰
    { word: 'and', start: 8.0, end: 8.2 },
    { word: 'massive', start: 8.3, end: 8.7 },
    { word: 'growth', start: 8.8, end: 9.4 },   // Keyword 5: growth 📈
    { word: 'without', start: 11.0, end: 11.4 },
    { word: 'any', start: 11.5, end: 11.8 },
    { word: 'warning', start: 11.9, end: 12.5 } // Keyword 6: warning ⚠️
  ];

  p = op.addCaption(p, words.map(w => w.word).join(' '), 0.5, 12.5, {}, words);
  return p;
}

// -------------------------------------------------------------------------------------------------
// 1. Ken Burns Preset & Transform Verification
// -------------------------------------------------------------------------------------------------

test('Ken Burns push: subtle zoom-in 1.00x -> 1.08x over clip duration without aspect ratio distortion', () => {
  const p0 = kenBurns.calculateKenBurnsFrame('ken-burns-push', 0, 'linear');
  assert.equal(p0.scale, 1.00, 'Start scale must be 1.00x');
  assert.equal(p0.x, 0);
  assert.equal(p0.y, 0);

  const pMid = kenBurns.calculateKenBurnsFrame('ken-burns-push', 0.5, 'linear');
  assert.equal(Math.round(pMid.scale * 1000) / 1000, 1.04, 'Mid scale must be 1.04x');

  const pEnd = kenBurns.calculateKenBurnsFrame('ken-burns-push', 1.0, 'linear');
  assert.equal(Math.round(pEnd.scale * 100) / 100, 1.08, 'End scale must be 1.08x');

  // Verify smooth easing version is also strictly bounded in [1.00, 1.08]
  for (let i = 0; i <= 20; i++) {
    const frame = kenBurns.calculateKenBurnsFrame('ken-burns-push', i / 20, 'smooth');
    assert.ok(frame.scale >= 0.999 && frame.scale <= 1.081, `Scale out of bounds: ${frame.scale}`);
    assert.equal(frame.x, 0);
    assert.equal(frame.y, 0);
  }
});

test('Ken Burns pull: subtle zoom-out 1.08x -> 1.00x over clip duration without aspect ratio distortion', () => {
  const p0 = kenBurns.calculateKenBurnsFrame('ken-burns-pull', 0, 'linear');
  assert.equal(p0.scale, 1.08, 'Start scale must be 1.08x');

  const pMid = kenBurns.calculateKenBurnsFrame('ken-burns-pull', 0.5, 'linear');
  assert.equal(Math.round(pMid.scale * 1000) / 1000, 1.04, 'Mid scale must be 1.04x');

  const pEnd = kenBurns.calculateKenBurnsFrame('ken-burns-pull', 1.0, 'linear');
  assert.equal(Math.round(pEnd.scale * 100) / 100, 1.00, 'End scale must be 1.00x');

  for (let i = 0; i <= 20; i++) {
    const frame = kenBurns.calculateKenBurnsFrame('ken-burns-pull', i / 20, 'smooth');
    assert.ok(frame.scale >= 0.999 && frame.scale <= 1.081);
    assert.equal(frame.x, 0);
    assert.equal(frame.y, 0);
  }
});

test('Ken Burns pan-left & pan-right: gentle horizontal drift with 1.05x buffer ensuring edge coverage', () => {
  // Pan Left: drifts from +0.025 to -0.025
  const leftStart = kenBurns.calculateKenBurnsFrame('ken-burns-pan-left', 0, 'linear');
  assert.equal(leftStart.scale, 1.05);
  assert.equal(Math.round(leftStart.x * 1000) / 1000, 0.025);

  const leftEnd = kenBurns.calculateKenBurnsFrame('ken-burns-pan-left', 1.0, 'linear');
  assert.equal(leftEnd.scale, 1.05);
  assert.equal(Math.round(leftEnd.x * 1000) / 1000, -0.025);

  // Pan Right: drifts from -0.025 to +0.025
  const rightStart = kenBurns.calculateKenBurnsFrame('ken-burns-pan-right', 0, 'linear');
  assert.equal(rightStart.scale, 1.05);
  assert.equal(Math.round(rightStart.x * 1000) / 1000, -0.025);

  const rightEnd = kenBurns.calculateKenBurnsFrame('ken-burns-pan-right', 1.0, 'linear');
  assert.equal(rightEnd.scale, 1.05);
  assert.equal(Math.round(rightEnd.x * 1000) / 1000, 0.025);
});

test('mediaAnimationFrame evaluates Ken Burns presets over clip duration seamlessly', () => {
  let p = createSampleProject();
  p = kenBurns.applyKenBurnsPreset(p, 'clip-broll-1', 'ken-burns-push');

  const clip = p.clips['clip-broll-1'];
  assert.equal(clip.duration, 5);
  assert.equal(clip.startTime, 4);

  // At startTime (t=4s)
  const poseStart = mediaAnim.mediaAnimationFrame(clip, 4);
  assert.ok(Math.abs(poseStart.scale - 1.00) < 0.01, `Expected start scale ~1.00, got ${poseStart.scale}`);

  // At midpoint (t=6.5s)
  const poseMid = mediaAnim.mediaAnimationFrame(clip, 6.5);
  assert.ok(poseMid.scale > 1.02 && poseMid.scale < 1.06, `Expected mid scale ~1.04, got ${poseMid.scale}`);

  // At endTime (t=9s)
  const poseEnd = mediaAnim.mediaAnimationFrame(clip, 9);
  assert.ok(Math.abs(poseEnd.scale - 1.08) < 0.01, `Expected end scale ~1.08, got ${poseEnd.scale}`);

  // ScaleX and ScaleY remain strictly 1.0 (no aspect ratio skewing)
  assert.equal(poseStart.scaleX, 1);
  assert.equal(poseStart.scaleY, 1);
  assert.equal(poseEnd.scaleX, 1);
  assert.equal(poseEnd.scaleY, 1);
});

test('autoApplyKenBurnsToBroll distributes alternating push/pan/pull presets to all B-roll clips', () => {
  const p = createSampleProject();
  const { project: next, modifiedClipIds } = kenBurns.autoApplyKenBurnsToBroll(p);

  assert.equal(modifiedClipIds.length, 2);
  assert.ok(modifiedClipIds.includes('clip-broll-1'));
  assert.ok(modifiedClipIds.includes('clip-broll-2'));

  const c1 = next.clips['clip-broll-1'];
  const c2 = next.clips['clip-broll-2'];

  assert.equal(c1.mediaAnimation.kenBurns, 'ken-burns-push');
  assert.equal(c2.mediaAnimation.kenBurns, 'ken-burns-pull');
});

test('kenBurnsToKeyframes creates valid source-clock TransformKeyframe array', () => {
  const p = createSampleProject();
  const clip = p.clips['clip-broll-1'];
  const frames = kenBurns.kenBurnsToKeyframes(clip, 'ken-burns-push');

  assert.equal(frames.length, 3);
  assert.equal(frames[0].sourceTime, clip.sourceStart);
  assert.equal(frames[2].sourceTime, clip.sourceEnd);
  assert.ok(frames[0].value.scale < frames[2].value.scale);
  assert.equal(Math.round(frames[2].value.scale * 100) / 100, 1.08);
});

// -------------------------------------------------------------------------------------------------
// 2. Animated Kinetic Emojis & Keyword Stickers
// -------------------------------------------------------------------------------------------------

test('Kinetic sticker dictionary covers all 10 required punch categories with valid SVGs and emojis', () => {
  const requiredCategories = [
    'money',    // 💸/💰
    'fire',     // 🔥
    'rocket',   // 🚀
    'warning',  // ⚠️
    'growth',   // 📈
    'skull',    // 💀
    'heart',    // ❤️
    'star',     // ⭐
    'target',   // 🎯
    'idea'      // 💡
  ];

  for (const cat of requiredCategories) {
    const def = kineticStickers.KINETIC_STICKERS_DICTIONARY[cat];
    assert.ok(def, `Missing required category: ${cat}`);
    assert.ok(def.emoji && typeof def.emoji === 'string', `Category ${cat} missing emoji`);
    assert.ok(Array.isArray(def.keywords) && def.keywords.length >= 5, `Category ${cat} keywords too few`);
    assert.ok(def.accentColor.startsWith('#'), `Category ${cat} invalid accentColor`);
    assert.ok(def.svg.includes('<svg') && def.svg.includes('</svg>'), `Category ${cat} invalid SVG`);
  }
});

test('lookupSticker matches keywords with case-insensitivity and punctuation stripping', () => {
  assert.equal(kineticStickers.lookupSticker('Money!')?.id, 'money');
  assert.equal(kineticStickers.lookupSticker('$cash')?.id, 'money');
  assert.equal(kineticStickers.lookupSticker('FIRE')?.id, 'fire');
  assert.equal(kineticStickers.lookupSticker('trending,')?.id, 'fire');
  assert.equal(kineticStickers.lookupSticker('Rocket')?.id, 'rocket');
  assert.equal(kineticStickers.lookupSticker('Warning')?.id, 'warning');
  assert.equal(kineticStickers.lookupSticker('growth')?.id, 'growth');
  assert.equal(kineticStickers.lookupSticker('killed')?.id, 'skull');
  assert.equal(kineticStickers.lookupSticker('love')?.id, 'heart');
  assert.equal(kineticStickers.lookupSticker('champion')?.id, 'star');
  assert.equal(kineticStickers.lookupSticker('target')?.id, 'target');
  assert.equal(kineticStickers.lookupSticker('idea')?.id, 'idea');
  assert.equal(kineticStickers.lookupSticker('the'), undefined);
});

test('detectKeywordMoments extracts punch moments from timed words with interval cooldown', () => {
  const words = [
    { word: 'our', start: 1.0, end: 1.2 },
    { word: 'rocket', start: 1.3, end: 1.8 },   // Punch 1
    { word: 'launch', start: 1.9, end: 2.3 },   // Skipped (inside 1.4s cooldown)
    { word: 'was', start: 2.4, end: 2.6 },
    { word: 'insane', start: 3.5, end: 4.0 },   // Punch 2
    { word: 'money', start: 5.5, end: 6.0 }     // Punch 3
  ];

  const moments = kineticStickers.detectKeywordMoments(words, { minInterval: 1.4 });
  assert.equal(moments.length, 3);
  assert.equal(moments[0].sticker.id, 'rocket');
  assert.equal(moments[1].sticker.id, 'fire');
  assert.equal(moments[2].sticker.id, 'money');

  // Verify tight start timing anchored to spoken word utterance
  assert.ok(moments[0].startTime <= 1.3 && moments[0].startTime >= 1.2);
  assert.ok(moments[0].duration >= 0.9 && moments[0].duration <= 1.6);
});

test('detectAndApplyKineticStickers places animated kinetic stickers on project timeline', () => {
  const p = createSampleProject();
  const { project: next, placedCount, moments } = kineticStickers.detectAndApplyKineticStickers(p);

  assert.ok(placedCount >= 3, `Expected at least 3 stickers placed, got ${placedCount}`);
  assert.equal(placedCount, moments.length);

  // Check text layers or clips placed
  const stickerClips = Object.values(next.clips).filter(c => c.name.startsWith('Sticker:'));
  assert.equal(stickerClips.length, placedCount);

  for (const clip of stickerClips) {
    // Verified pop motion preset applied
    assert.ok(clip.keyframes && clip.keyframes.length > 0, 'Clip should have keyframes from motion preset');
    // Verified text layer contains emoji
    const textLayer = next.textLayers[clip.contentId];
    assert.ok(textLayer && textLayer.text.length > 0, 'Sticker text layer must have emoji text');
  }

  // Also verify svg-callout mode creates valid SVG overlay clips
  const svgResult = kineticStickers.applyKineticStickers(p, moments, { mode: 'svg-callout', motion: 'pop' });
  assert.equal(svgResult.placedClipIds.length, moments.length);
  for (const clipId of svgResult.placedClipIds) {
    const c = svgResult.project.clips[clipId];
    assert.ok(c.assetId);
    const asset = svgResult.project.assets[c.assetId];
    assert.equal(asset.mime, 'image/svg+xml');
    assert.ok(asset.url.startsWith('data:image/svg+xml'));
  }
});

// -------------------------------------------------------------------------------------------------
// 3. Conversational Commands & Reconciler Wiring
// -------------------------------------------------------------------------------------------------

test('sequentialEdit explicitOperations routes keyword stickers to motionGraphics and ken burns to broll', () => {
  // Command 1: "add kinetic stickers for keywords"
  const ops1 = sequential.explicitOperations('add kinetic stickers for keywords');
  assert.deepEqual(ops1, ['motionGraphics'], 'Should resolve to motionGraphics');

  // Command 2: "add ken burns to b-roll"
  const ops2 = sequential.explicitOperations('add ken burns to b-roll');
  assert.deepEqual(ops2, ['broll'], 'Should resolve to broll');

  // Combined command
  const ops3 = sequential.explicitOperations('add kinetic stickers for keywords and ken burns to b-roll');
  assert.deepEqual(ops3, ['motionGraphics', 'broll'], 'Should resolve to both motionGraphics and broll');
});

test('editingIntent parses requestedKenBurns and requestedKineticStickers constraints', () => {
  const intent1 = editingIntent.extractEditingConstraints('add ken burns to b-roll');
  assert.equal(intent1.requestedKenBurns, true);

  const intentPush = editingIntent.extractEditingConstraints('apply ken burns push to b-roll');
  assert.equal(intentPush.requestedKenBurns, 'push');

  const intentPan = editingIntent.extractEditingConstraints('add ken burns pan left to broll');
  assert.equal(intentPan.requestedKenBurns, 'pan-left');

  const intentStickers = editingIntent.extractEditingConstraints('add kinetic stickers for keywords');
  assert.equal(intentStickers.requestedKineticStickers, true);
});

test('inPlaceReconciler executes Ken Burns and kinetic sticker mutations in-place', () => {
  const p = createSampleProject();
  const speech = [{
    start: 0,
    end: 15,
    text: 'our rocket made insane money with massive growth',
    words: [
      { word: 'rocket', start: 2.0, end: 2.5 },
      { word: 'insane', start: 5.0, end: 5.5 },
      { word: 'money', start: 7.5, end: 8.0 },
      { word: 'growth', start: 10.0, end: 10.5 }
    ]
  }];

  const constraints = {
    disallowedAudio: false,
    disallowedSfx: false,
    disallowedCuts: false,
    disallowedBroll: false,
    disallowedZooms: false,
    removeZooms: false,
    removeSfx: false,
    removeBroll: false,
    protectedIntervals: [],
    phraseQuotes: [],
    requestedKenBurns: true,
    requestedKineticStickers: true
  };

  const result = reconciler.reconcileEditingDecisions(p, [], [], constraints, speech);

  // Check Ken Burns decisions
  const kbDecisions = result.decisions.filter(d =>
    d.op === 'changeClipProperty' && d.changes?.mediaAnimation?.kenBurns
  );
  assert.equal(kbDecisions.length, 2, 'Should apply Ken Burns to both B-roll clips');

  // Check sticker decisions
  const stickerDecisions = result.decisions.filter(d =>
    d.op === 'addGraphic' && d.kind === 'callout'
  );
  assert.ok(stickerDecisions.length >= 3, `Expected at least 3 sticker callouts, got ${stickerDecisions.length}`);

  // Check summary notes
  assert.ok(result.summaryNotes.some(s => s.includes('Ken Burns motion presets')));
  assert.ok(result.summaryNotes.some(s => s.includes('animated kinetic keyword sticker')));
});
