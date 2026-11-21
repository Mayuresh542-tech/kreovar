import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const root = process.cwd();
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');
const {NextRequest} = require('next/server');

function loader(mocks = {}, globals = {}) {
  const cache = new Map();
  const context = vm.createContext({
    console,
    URL,
    Headers,
    Response,
    Request,
    NextRequest,
    Buffer,
    Blob,
    File,
    Error,
    AbortSignal,
    AbortController,
    ReadableStream,
    Uint8Array,
    TextEncoder,
    TextDecoder,
    crypto: globalThis.crypto,
    setTimeout,
    clearTimeout,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co' } },
    ...globals,
  });

  function load(rel) {
    let f = path.resolve(root, rel);
    if (!path.extname(f)) f += '.ts';
    const key = path.relative(root, f).replaceAll('\\', '/');
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (cache.has(f)) return cache.get(f);
    const exports = {};
    cache.set(f, exports);
    const code = ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText;
    new vm.Script(`(function(require,module,exports){\n${code}\n})`).runInContext(context)(
      s => s.startsWith('@/') ? load(s.slice(2)) : s.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(f), s))) : require(s),
      { exports },
      exports
    );
    return exports;
  }
  return load;
}

test('Area 1: changeText preserves/remaps words and studioData without violating aiValidation', () => {
  const load = loader();
  const ops = load('app/lib/editor/operations.ts');
  const {aiProjectSnapshot} = load('app/lib/editor/aiValidation.ts');

  let project = {
    schemaVersion: 1,
    id: 'proj-1',
    title: 'Test',
    revision: 1,
    trackOrder: ['track-caption'],
    tracks: {
      'track-caption': { id: 'track-caption', name: 'Captions', kind: 'caption', clipIds: [], hidden: false, muted: false, locked: false }
    },
    clips: {},
    assets: {},
    textLayers: {},
    captions: {},
    transitions: {},
    settings: { aspectRatio: '9:16', fps: 30, background: '#000000' }
  };

  project = ops.addCaption(project, 'first second third', 1, 3, {}, [
    { word: 'first', start: 0, end: 1 },
    { word: 'second', start: 1, end: 2 },
    { word: 'third', start: 2, end: 3 }
  ]);
  const clipId = project.tracks['track-caption'].clipIds[0];
  const contentId = project.clips[clipId].contentId;

  // Add studioData with emphasizedWords and wordStyles
  project.captions[contentId].studioData = {
    templateId: 'clean-sub',
    emphasizedWords: [1], // 'second'
    wordStyles: { '1': { spotlight: true } }
  };

  // Change text to 4 words
  const updated = ops.changeText(project, clipId, 'new first second third');
  const caption = updated.captions[contentId];

  assert.equal(caption.text, 'new first second third');
  assert.equal(caption.words.length, 4);
  assert.equal(caption.words.map(w => w.word).join(' '), 'new first second third');
  assert.ok(caption.studioData, 'studioData must be preserved');
  assert.ok(Array.isArray(caption.studioData.emphasizedWords));
  assert.ok(caption.studioData.wordStyles);

  // aiValidation snapshot must accept it without error
  assert.doesNotThrow(() => aiProjectSnapshot(updated));
});

test('Area 1: splitClip slices caption words and text at playhead split time', () => {
  const load = loader();
  const ops = load('app/lib/editor/operations.ts');
  const {aiProjectSnapshot} = load('app/lib/editor/aiValidation.ts');

  let project = {
    schemaVersion: 1,
    id: 'proj-1',
    title: 'Test',
    revision: 1,
    trackOrder: ['track-caption'],
    tracks: {
      'track-caption': { id: 'track-caption', name: 'Captions', kind: 'caption', clipIds: [], hidden: false, muted: false, locked: false }
    },
    clips: {},
    assets: {},
    textLayers: {},
    captions: {},
    transitions: {},
    settings: { aspectRatio: '9:16', fps: 30, background: '#000000' }
  };

  project = ops.addCaption(project, 'alpha beta gamma delta', 0, 4, {}, [
    { word: 'alpha', start: 0, end: 1 },
    { word: 'beta', start: 1, end: 2 },
    { word: 'gamma', start: 2, end: 3 },
    { word: 'delta', start: 3, end: 4 }
  ]);
  const clipId = project.tracks['track-caption'].clipIds[0];

  // Split at time = 2.0 (source = 2.0)
  const split = ops.splitClip(project, clipId, 2.0);
  const leftClip = split.clips[clipId];
  const rightClipId = split.tracks['track-caption'].clipIds.find(id => id !== clipId);
  const rightClip = split.clips[rightClipId];

  const leftCaption = split.captions[leftClip.contentId];
  const rightCaption = split.captions[rightClip.contentId];

  assert.equal(leftCaption.text, 'alpha beta');
  assert.equal(leftCaption.words.length, 2);
  assert.equal(leftCaption.words[0].word, 'alpha');
  assert.equal(leftCaption.words[1].word, 'beta');

  assert.equal(rightCaption.text, 'gamma delta');
  assert.equal(rightCaption.words.length, 2);
  assert.equal(rightCaption.words[0].word, 'gamma');
  assert.equal(rightCaption.words[1].word, 'delta');

  assert.doesNotThrow(() => aiProjectSnapshot(split));
});

test('Area 1: trimClip slices words inside the active clip bounds', () => {
  const load = loader();
  const ops = load('app/lib/editor/operations.ts');
  const {aiProjectSnapshot} = load('app/lib/editor/aiValidation.ts');

  let project = {
    schemaVersion: 1,
    id: 'proj-1',
    title: 'Test',
    revision: 1,
    trackOrder: ['track-caption'],
    tracks: {
      'track-caption': { id: 'track-caption', name: 'Captions', kind: 'caption', clipIds: [], hidden: false, muted: false, locked: false }
    },
    clips: {},
    assets: {},
    textLayers: {},
    captions: {},
    transitions: {},
    settings: { aspectRatio: '9:16', fps: 30, background: '#000000' }
  };

  project = ops.addCaption(project, 'one two three four', 0, 4, {}, [
    { word: 'one', start: 0, end: 1 },
    { word: 'two', start: 1, end: 2 },
    { word: 'three', start: 2, end: 3 },
    { word: 'four', start: 3, end: 4 }
  ]);
  const clipId = project.tracks['track-caption'].clipIds[0];

  // Trim left edge to time 1.0 (sourceStart becomes 1.0)
  const trimmed = ops.trimClip(project, clipId, 'left', 1.0);
  const caption = trimmed.captions[trimmed.clips[clipId].contentId];

  assert.equal(caption.text, 'two three four');
  assert.equal(caption.words.length, 3);
  assert.equal(caption.words[0].word, 'two');
  assert.equal(caption.words[2].word, 'four');
  assert.doesNotThrow(() => aiProjectSnapshot(trimmed));
});

test('Area 1: mergeCaptions calculates sourceEnd accurately and preserves words', () => {
  const load = loader();
  const ops = load('app/lib/editor/operations.ts');
  const {aiProjectSnapshot} = load('app/lib/editor/aiValidation.ts');

  let project = {
    schemaVersion: 1,
    id: 'proj-1',
    title: 'Test',
    revision: 1,
    trackOrder: ['track-caption'],
    tracks: {
      'track-caption': { id: 'track-caption', name: 'Captions', kind: 'caption', clipIds: [], hidden: false, muted: false, locked: false }
    },
    clips: {},
    assets: {},
    textLayers: {},
    captions: {},
    transitions: {},
    settings: { aspectRatio: '9:16', fps: 30, background: '#000000' }
  };

  project = ops.addCaption(project, 'part one', 0, 2, {}, [
    { word: 'part', start: 0, end: 1 },
    { word: 'one', start: 1, end: 2 }
  ]);
  project = ops.addCaption(project, 'part two', 2, 2, {}, [
    { word: 'part', start: 0, end: 1 },
    { word: 'two', start: 1, end: 2 }
  ]);

  const clipIds = project.tracks['track-caption'].clipIds;
  const merged = ops.mergeCaptions(project, clipIds);
  const remainingClip = merged.clips[clipIds[0]];
  const caption = merged.captions[remainingClip.contentId];

  assert.equal(remainingClip.duration, 4);
  assert.equal(remainingClip.sourceEnd, 4);
  assert.equal(caption.text, 'part one part two');
  assert.equal(caption.words.length, 4);
  assert.doesNotThrow(() => aiProjectSnapshot(merged));
});

test('Area 1: rippleCut re-indexes studioData.emphasizedWords and wordStyles and preserves visual treatment', () => {
  const load = loader();
  const {defaultStyle} = load('app/lib/editor/model.ts');
  const {rippleCut} = load('app/lib/editor/rippleCut.ts');
  const {aiProjectSnapshot} = load('app/lib/editor/aiValidation.ts');

  let project = {
    schemaVersion: 1,
    id: 'proj-1',
    title: 'Test',
    revision: 1,
    trackOrder: ['track-cap', 'track-vid'],
    tracks: {
      'track-cap': { id: 'track-cap', name: 'Captions', kind: 'caption', clipIds: ['clip-cap'], hidden: false, muted: false, locked: false },
      'track-vid': { id: 'track-vid', name: 'Video', kind: 'video', clipIds: ['clip-vid'], hidden: false, muted: false, locked: false },
    },
    clips: {
      'clip-cap': {
        id: 'clip-cap', contentId: 'cap-1', trackId: 'track-cap', name: 'Words', startTime: 0, duration: 6, sourceStart: 0, sourceEnd: 6,
        transform: { x: 0, y: 0.35, scale: 1, rotation: 0, opacity: 1 }, effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
        volume: 0, speed: 1, fadeIn: 0, fadeOut: 0
      },
      'clip-vid': {
        id: 'clip-vid', assetId: 'asset-1', trackId: 'track-vid', name: 'Video', startTime: 0, duration: 6, sourceStart: 0, sourceEnd: 6,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
        volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
        visualTreatment: { entrance: { sourceDuration: 0.5, opacity: 0 } }
      }
    },
    assets: {
      'asset-1': { id: 'asset-1', name: 'video.mp4', kind: 'video', duration: 10, width: 1920, height: 1080 }
    },
    textLayers: {},
    captions: {
      'cap-1': {
        id: 'cap-1',
        text: 'word0 word1 word2 word3 word4',
        style: { ...defaultStyle },
        words: [
          { word: 'word0', start: 0, end: 1 },
          { word: 'word1', start: 1, end: 2 },
          { word: 'word2', start: 2, end: 3 },
          { word: 'word3', start: 3, end: 4 },
          { word: 'word4', start: 4, end: 5 },
        ],
        studioData: {
          templateId: 'clean-sub',
          emphasizedWords: [3], // word3
          wordStyles: { '3': { spotlight: true } }
        }
      }
    },
    transitions: {},
    settings: { aspectRatio: '9:16', fps: 30, background: '#000000' }
  };

  // Cut interval [1.0, 2.5] which deletes word1 and part of word2
  const cutProject = rippleCut(project, [{ start: 1.0, end: 2.5 }]);

  // Check visual treatment on cut video clip has entrance sourceTime anchored
  const survivingVidClips = Object.values(cutProject.clips).filter(c => c.trackId === 'track-vid');
  assert.ok(survivingVidClips.length > 0);
  assert.ok(survivingVidClips[0].visualTreatment?.entrance?.sourceTime !== undefined);

  // Check surviving captions have reindexed emphasizedWords and wordStyles
  const survivingCapClips = Object.values(cutProject.clips).filter(c => c.trackId === 'track-cap');
  assert.ok(survivingCapClips.length > 0);
  const secondCapClip = survivingCapClips[survivingCapClips.length - 1];
  const secondCaption = cutProject.captions[secondCapClip.contentId];
  if (secondCaption?.words?.some(w => w.word === 'word3')) {
    const word3Idx = secondCaption.words.findIndex(w => w.word === 'word3');
    assert.ok(secondCaption.studioData?.emphasizedWords?.includes(word3Idx));
    assert.ok(secondCaption.studioData?.wordStyles?.[String(word3Idx)]);
  }

  assert.doesNotThrow(() => aiProjectSnapshot(cutProject));
});

test('Area 2: compositor sorts visual layers by project.trackOrder', () => {
  const load = loader({ 'app/lib/editor/waveform.ts': {}, 'app/lib/editor/media.ts': {} });
  const {visibleLayers} = load('app/lib/editor/compositor.ts');

  // Create project where overlay track comes before video track in trackOrder
  const project = {
    schemaVersion: 1,
    id: 'proj-1',
    title: 'Test',
    revision: 1,
    trackOrder: ['track-overlay', 'track-video'],
    tracks: {
      'track-overlay': { id: 'track-overlay', name: 'Overlay', kind: 'overlay', clipIds: ['c-overlay'], hidden: false, muted: false, locked: false },
      'track-video': { id: 'track-video', name: 'Video', kind: 'video', clipIds: ['c-video'], hidden: false, muted: false, locked: false },
    },
    clips: {
      'c-overlay': { id: 'c-overlay', trackId: 'track-overlay', name: 'Overlay Clip', startTime: 0, duration: 5, sourceStart: 0, sourceEnd: 5, transform: { opacity: 1 }, speed: 1 },
      'c-video': { id: 'c-video', trackId: 'track-video', name: 'Video Clip', startTime: 0, duration: 5, sourceStart: 0, sourceEnd: 5, transform: { opacity: 1 }, speed: 1 },
    },
    transitions: {}
  };

  const layers = visibleLayers(project, 1.0);
  assert.equal(layers.length, 2);
  assert.equal(layers[0].track.id, 'track-overlay', 'Overlay track should be first according to trackOrder');
  assert.equal(layers[1].track.id, 'track-video', 'Video track should be second according to trackOrder');
});

test('Area 2: aiValidation skips setVisualTreatment on locked tracks without crashing', () => {
  const load = loader();
  const {aiProjectSnapshot} = load('app/lib/editor/aiValidation.ts');

  const project = {
    schemaVersion: 1,
    id: 'proj-1',
    title: 'Test',
    revision: 1,
    trackOrder: ['track-locked'],
    tracks: {
      'track-locked': { id: 'track-locked', name: 'Locked Track', kind: 'video', clipIds: ['clip-1'], hidden: false, muted: false, locked: true },
    },
    clips: {
      'clip-1': {
        id: 'clip-1', assetId: 'asset-1', trackId: 'track-locked', name: 'Video', startTime: 0, duration: 5, sourceStart: 0, sourceEnd: 5,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
        volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
        visualTreatment: { entrance: { sourceDuration: 0.5, sourceTime: 0, opacity: 0 } }
      }
    },
    assets: {
      'asset-1': { id: 'asset-1', name: 'video.mp4', kind: 'video', duration: 10, width: 1920, height: 1080 }
    },
    textLayers: {},
    captions: {},
    transitions: {},
    settings: { aspectRatio: '16:9', fps: 30, background: '#000000' }
  };

  // If locked track was not skipped, setVisualTreatment would throw 'Select an unlocked video or image clip.'
  assert.doesNotThrow(() => aiProjectSnapshot(project));
});

test('Area 3: withUsage does NOT refund ai_edits when usageConsumed is true (broll-choice)', async () => {
  const calls = [];
  const db = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'kreovar_reserve_usage') return { data: { allowed: true, reservationId: 'lease' }, error: null };
      return { data: true, error: null };
    }
  };
  const load = loader({
    'app/lib/server/adminAuth.ts': { getAdminClient: () => db, getAuthenticatedUserId: async () => 'user-1' }
  });
  const {withUsage} = load('app/lib/server/planUsage.ts');

  // Handler returns empty decisions, but has usageConsumed: true
  const handler = async () => Response.json({ video: { id: 'v1' }, reason: 'chosen', usageConsumed: true });
  const req = new NextRequest('http://local/api/test', { method: 'POST', body: JSON.stringify({}) });

  const res = await withUsage(handler, 'ai')(req);
  assert.equal(res.status, 200);

  const finishCall = calls.find(c => c.name === 'kreovar_finish_usage');
  assert.ok(finishCall, 'finishUsage must be called');
  assert.equal(finishCall.args.p_success, true, 'credit must be consumed (not refunded)');
});

test('Area 3: generate-image checks IMAGE_GENERATION_ENABLED before rate limit count increment', async () => {
  const load = loader({
    'app/lib/server/adminAuth.ts': {
      getAdminClient: () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'test-user' } }, error: null }) }
      })
    },
    'app/lib/server/geminiService.ts': { getGeminiApiKey: async () => null }
  });

  const route = load('app/api/editor/generate-image/route.ts');

  // Test when IMAGE_GENERATION_ENABLED !== 'true'
  process.env.IMAGE_GENERATION_ENABLED = 'false';
  for (let i = 0; i < 5; i++) {
    const req = new NextRequest('http://local/api/editor/generate-image', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'A test image' })
    });
    const res = await route.POST(req);
    // Should return 503 every time, NOT 429 rate limit!
    assert.equal(res.status, 503, `Call ${i + 1} should be 503, not 429`);
  }
});
