import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
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
  const context = vm.createContext({
    console,
    URL,
    URLSearchParams,
    Headers,
    Request,
    Response,
    Buffer,
    Error,
    structuredClone,
    TextEncoder,
    AbortSignal,
    AbortController,
    Uint8Array,
    crypto: globalThis.crypto,
    setTimeout,
    clearTimeout,
    fetch: globalThis.fetch,
    document: { fonts: { ready: Promise.resolve() }, createElement: () => ({}) },
    navigator: {},
    process: { env: { ...process.env } }
  });

  const baseMocks = {
    'app/lib/supabase.ts': {
      supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) } }
    },
    ...mocks
  };

  function load(filePath) {
    const rel = path.relative(root, filePath).replace(/\\/g, '/');
    if (baseMocks[rel]) return baseMocks[rel];
    if (cache.has(rel)) return cache.get(rel);

    const code = fs.readFileSync(filePath, 'utf8');
    const transpiled = ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true
      }
    }).outputText;

    const moduleObj = { exports: {} };
    cache.set(rel, moduleObj.exports);

    const fn = vm.runInContext(
      `(function(require, module, exports, __dirname, __filename) { ${transpiled}\n})`,
      context
    );

    function customRequire(id) {
      if (id.startsWith('@/')) {
        const target = path.join(root, id.replace(/^@\//, ''));
        return resolveFile(target);
      }
      if (id.startsWith('.')) {
        const target = path.resolve(path.dirname(filePath), id);
        return resolveFile(target);
      }
      return require(id);
    }

    function resolveFile(target) {
      const candidates = [
        target,
        target + '.ts',
        target + '.tsx',
        target + '.js',
        path.join(target, 'index.ts'),
        path.join(target, 'index.js')
      ];
      for (const c of candidates) {
        if (fs.existsSync(c) && !fs.statSync(c).isDirectory()) {
          return load(c);
        }
      }
      throw new Error(`Cannot resolve ${target} from ${filePath}`);
    }

    fn(customRequire, moduleObj, moduleObj.exports, path.dirname(filePath), filePath);
    cache.set(rel, moduleObj.exports);
    return moduleObj.exports;
  }

  return { load };
}

describe('Kreovar AI Instruction Understanding & Execution Engine', () => {
  const { load } = loader();
  const model = load(path.join(root, 'app/lib/editor/model.ts'));
  const intent = load(path.join(root, 'app/lib/editor/editingIntent.ts'));
  const reconciler = load(path.join(root, 'app/lib/editor/inPlaceReconciler.ts'));
  const sequential = load(path.join(root, 'app/lib/editor/sequentialEdit.ts'));

  test('1. Silence Cutting: detects silence request and generates consolidated rippleCut for speech gaps >0.6s', () => {
    const prompt = 'Cut the silences and tighten the pacing';
    const constraints = intent.extractEditingConstraints(prompt);
    assert.equal(constraints.requestedSilenceCut, true, 'Must detect silence cut request');

    const project = model.createProject('test-p-silence', 'Silence Test');
    project.tracks['track-video'] = { id: 'track-video', kind: 'video', name: 'Video', clipIds: ['v1'], hidden: false, muted: false, locked: false };
    project.clips['v1'] = {
      id: 'v1', assetId: 'a1', trackId: 'track-video', name: 'Main',
      startTime: 0, duration: 20, sourceStart: 0, sourceEnd: 20,
      transform: model.defaultTransform, volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }
    };
    project.assets['a1'] = { id: 'a1', name: 'v.mp4', kind: 'video', mime: 'video/mp4', size: 100, duration: 20, width: 1080, height: 1920 };

    // Speech context with 2 long gaps (>0.6s): 2.0 -> 3.5 (1.5s gap), and 8.0 -> 9.0 (1.0s gap)
    const speech = [
      { text: 'Phrase one', start: 0.5, end: 2.0, words: [{ word: 'Phrase', start: 0.5, end: 1.0 }, { word: 'one', start: 1.1, end: 2.0 }] },
      { text: 'Phrase two', start: 3.5, end: 8.0, words: [{ word: 'Phrase', start: 3.5, end: 4.5 }, { word: 'two', start: 4.6, end: 8.0 }] },
      { text: 'Phrase three', start: 9.0, end: 12.0, words: [{ word: 'Phrase', start: 9.0, end: 10.0 }, { word: 'three', start: 10.1, end: 12.0 }] }
    ];

    const result = reconciler.reconcileEditingDecisions(project, [], [], constraints, speech);
    const cutOp = result.decisions.find(d => d.op === 'rippleCut');
    assert.ok(cutOp, 'Must emit rippleCut operation');
    assert.equal(cutOp.ranges.length, 2, 'Must cut both >0.6s gaps');
    assert.equal(Math.round(cutOp.ranges[0].start * 10) / 10, 2.0);
    assert.equal(Math.round(cutOp.ranges[0].end * 10) / 10, 3.5);
    assert.equal(Math.round(cutOp.ranges[1].start * 10) / 10, 8.0);
    assert.equal(Math.round(cutOp.ranges[1].end * 10) / 10, 9.0);
    assert.ok(result.summaryNotes.some(n => n.includes('awkward speech pause')), 'Must include silence trimming summary note');
  });

  test('2. Caption Styling: detects custom color, weight, and position instructions and applies composeCaption', () => {
    const prompt = 'Make captions bold yellow and place them at top';
    const constraints = intent.extractEditingConstraints(prompt);
    assert.ok(constraints.requestedCaptionStyling, 'Must extract caption styling directive');
    assert.equal(constraints.requestedCaptionStyling.textColor, '#facc15');
    assert.equal(constraints.requestedCaptionStyling.fontWeight, 800);
    assert.equal(constraints.requestedCaptionStyling.yPercent, 18);

    const project = model.createProject('test-p-style', 'Style Test');
    project.tracks['track-caption'] = { id: 'track-caption', kind: 'caption', name: 'Captions', clipIds: ['c1'], hidden: false, muted: false, locked: false };
    project.clips['c1'] = {
      id: 'c1', contentId: 'cap1', trackId: 'track-caption', name: 'Subtitles',
      startTime: 0, duration: 5, sourceStart: 0, sourceEnd: 5,
      transform: model.defaultTransform, volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }
    };
    project.captions['cap1'] = { id: 'cap1', text: 'Hello world', style: model.defaultStyle };

    const result = reconciler.reconcileEditingDecisions(project, [], [], constraints);
    const compose = result.decisions.find(d => d.op === 'composeCaption');
    assert.ok(compose, 'Must generate composeCaption decision');
    assert.equal(compose.clipId, 'c1');
    assert.equal(compose.presentation.textColor, '#facc15');
    assert.equal(compose.presentation.fontWeight, 800);
    assert.equal(compose.presentation.yPercent, 18);
  });

  test('3. Selective Removal: detects removal of sound effects and B-roll', () => {
    const prompt = 'Remove sound effects and delete all b-roll';
    const constraints = intent.extractEditingConstraints(prompt);
    assert.equal(constraints.removeSfx, true, 'Must detect removeSfx');
    assert.equal(constraints.removeBroll, true, 'Must detect removeBroll');

    const project = model.createProject('test-p-rem', 'Removal Test');
    project.tracks['track-audio'] = { id: 'track-audio', kind: 'audio', name: 'Audio', clipIds: ['sfx1'], hidden: false, muted: false, locked: false };
    project.clips['sfx1'] = {
      id: 'sfx1', assetId: 'a_sfx', trackId: 'track-audio', name: 'Whoosh', audioRole: 'sfx',
      startTime: 2, duration: 1, sourceStart: 0, sourceEnd: 1,
      transform: model.defaultTransform, volume: 0.2, speed: 1, fadeIn: 0, fadeOut: 0,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }
    };
    project.tracks['track-overlay'] = { id: 'track-overlay', kind: 'overlay', name: 'B-Roll', clipIds: ['b1'], hidden: false, muted: false, locked: false };
    project.clips['b1'] = {
      id: 'b1', assetId: 'a_broll', trackId: 'track-overlay', name: 'Stock Clip',
      startTime: 3, duration: 2, sourceStart: 0, sourceEnd: 2,
      transform: model.defaultTransform, volume: 0, speed: 1, fadeIn: 0, fadeOut: 0,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }
    };

    // Propose an addClip sfx decision which should be stripped
    const proposed = [
      { op: 'addClip', assetId: 'sfx_new', trackId: 'track-audio', startTime: 4, audioRole: 'sfx' }
    ];

    const result = reconciler.reconcileEditingDecisions(project, proposed, [], constraints);
    assert.equal(result.decisions.some(d => d.op === 'addClip'), false, 'New SFX addition must be stripped');
    assert.ok(result.decisions.some(d => d.op === 'removeClip' && d.clipId === 'sfx1'), 'Existing SFX clip must be removed');
    assert.ok(result.decisions.some(d => d.op === 'removeClip' && d.clipId === 'b1'), 'Existing B-roll clip must be removed');
  });

  test('4. Audio Ducking & Aspect Ratio: detects audio ducking and 9:16 aspect ratio request', () => {
    const prompt = 'Enable audio ducking and make it 9:16 vertical video';
    const constraints = intent.extractEditingConstraints(prompt);
    assert.equal(constraints.requestedAudioDucking, true);
    assert.equal(constraints.requestedAspectRatio, '9:16');

    const project = model.createProject('test-p-asp', 'Aspect Test');
    const result = reconciler.reconcileEditingDecisions(project, [], [], constraints);
    assert.ok(result.decisions.some(d => d.op === 'setAudioDucking' && d.enabled === true));
    assert.ok(result.decisions.some(d => d.op === 'setAspectRatio' && d.aspectRatio === '9:16'));
  });

  test('5. Spoken Phrase Punch-in Zoom: captures unquoted keyword and anchors addZoom to spoken timestamp', () => {
    const prompt = 'Zoom in when I say secret';
    const constraints = intent.extractEditingConstraints(prompt);
    assert.ok(constraints.phraseQuotes.includes('secret'), 'Must extract unquoted keyword "secret"');

    const project = model.createProject('test-p-zoom', 'Zoom Test');
    project.tracks['track-video'] = { id: 'track-video', kind: 'video', name: 'Video', clipIds: ['v1'], hidden: false, muted: false, locked: false };
    project.clips['v1'] = {
      id: 'v1', assetId: 'a1', trackId: 'track-video', name: 'Main',
      startTime: 0, duration: 15, sourceStart: 0, sourceEnd: 15,
      transform: model.defaultTransform, volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }
    };
    const speech = [
      { text: 'Here is the big secret of productivity', start: 1.0, end: 6.0, words: [
        { word: 'Here', start: 1.0, end: 1.4 },
        { word: 'is', start: 1.5, end: 1.8 },
        { word: 'the', start: 1.9, end: 2.1 },
        { word: 'big', start: 2.2, end: 2.7 },
        { word: 'secret', start: 2.8, end: 3.4 },
        { word: 'of', start: 3.5, end: 3.8 },
        { word: 'productivity', start: 3.9, end: 5.2 }
      ]}
    ];

    const result = reconciler.reconcileEditingDecisions(project, [], [], constraints, speech);
    const zoom = result.decisions.find(d => d.op === 'addZoom');
    assert.ok(zoom, 'Must anchor zoom to spoken phrase "secret"');
    assert.equal(zoom.clipId, 'v1');
    assert.equal(Math.round(zoom.startTime * 10) / 10, 2.8, 'Zoom must start at the exact spoken word timestamp');
  });

  test('6. Conversational Chat Mode: creates requestedEdits job that preserves requestedEdits stage', () => {
    const project = model.createProject('test-p-chat', 'Chat Pipeline Test');
    const job = sequential.createEditingJob(project, 'Make captions yellow and cut silences', []);
    assert.equal(job.presetId, undefined, 'Conversational job must not force hardcoded presetId');
    assert.deepEqual([...job.stages.map(s => s.id)], ['analyzeFootage', 'applyRequestedEdits', 'validateEdit'], 'Must configure 3-stage custom pipeline');
  });
});
