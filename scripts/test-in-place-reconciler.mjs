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

  function load(relative) {
    let file = path.resolve(root, relative);
    if (!path.extname(file)) file += '.ts';
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const raw = fs.readFileSync(file, 'utf8');
    const code = ts.transpileModule(raw, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true
      }
    }).outputText;

    new vm.Script('(function(require,module,exports){\n' + code + '\n})', { filename: file }).runInContext(context)(
      (s) => s.startsWith('@/') ? load(s.slice(2)) : s.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(file), s))) : require(s),
      { exports },
      exports
    );
    return exports;
  }
  return load;
}

const load = loader();
const model = load('app/lib/editor/model');
const ops = load('app/lib/editor/operations');

function createProjectWithCaptions() {
  let p = model.createProject('test-p');
  p = ops.addAsset(p, { id: 'v1', kind: 'video', name: 'video.mp4', duration: 15, width: 1080, height: 1920, mime: 'video/mp4', size: 1000 });
  p = ops.addClip(p, 'v1', 'track-video', 0, { id: 'clip-v1', duration: 15, sourceEnd: 15 });
  p = ops.addCaption(p, 'Hello world', 0, 3);
  p = ops.addCaption(p, 'Welcome to the podcast', 3, 3);
  return p;
}

describe('In-Place Mutation & Constraint Reconciler (inPlaceReconciler.ts)', () => {
  const { reconcileEditingDecisions } = load('app/lib/editor/inPlaceReconciler');

  test('reconciles duplicate addCaption into in-place applyCaptionTemplate when captions exist', () => {
    const project = createProjectWithCaptions();
    const existingCaptionClipIds = Object.values(project.clips).filter(c => c.contentId && project.captions[c.contentId]).map(c => c.id);
    assert.equal(existingCaptionClipIds.length, 2);

    const rawDecisions = [
      { op: 'addCaption', text: 'Hello world', startTime: 0, duration: 3, templateId: 'study-hormozi-style' },
      { op: 'addCaption', text: 'Welcome to the podcast', startTime: 3, duration: 3, templateId: 'study-hormozi-style' }
    ];

    const result = reconcileEditingDecisions(project, rawDecisions, []);
    // Should NOT have addCaption decisions
    assert.equal(result.decisions.some(d => d.op === 'addCaption'), false, 'Should convert redundant addCaption into in-place update');
    // Should have applyCaptionTemplate for existing clip IDs
    const applyDec = result.decisions.find(d => d.op === 'applyCaptionTemplate');
    assert.ok(applyDec);
    assert.equal(applyDec.templateId, 'study-hormozi-style');
    assert.equal(JSON.stringify(applyDec.clipIds), JSON.stringify(existingCaptionClipIds));
  });

  test('enforces negative audio constraints by stripping audio additions and sfx tools', () => {
    const project = createProjectWithCaptions();
    const rawDecisions = [
      { op: 'addZoom', clipId: 'clip-v1', startTime: 1, endTime: 3, fromScale: 1, toScale: 1.1 },
      { op: 'setAudioDucking', enabled: true },
      { op: 'addClip', assetId: 'sfx-1', trackId: 'track-audio', startTime: 1, duration: 1, audioRole: 'sfx', volume: 0.2 }
    ];
    const rawTools = [
      { type: 'sfx', soundId: 'whoosh', trackId: 'track-audio', startTime: 1 }
    ];
    const constraints = {
      disallowedAudio: true,
      disallowedSfx: true,
      disallowedCuts: false,
      disallowedBroll: false,
      disallowedZooms: false,
      removeZooms: false,
      protectedIntervals: [],
      phraseQuotes: []
    };

    const result = reconcileEditingDecisions(project, rawDecisions, rawTools, constraints);
    // Audio decisions stripped
    assert.equal(result.decisions.some(d => d.op === 'setAudioDucking'), false);
    assert.equal(result.decisions.some(d => d.op === 'addClip' && d.trackId === 'track-audio'), false);
    // Zoom preserved
    assert.equal(result.decisions.some(d => d.op === 'addZoom'), true);
    // SFX tool stripped
    assert.equal(result.toolRequests.length, 0);
  });

  test('adds clearZooms when removeZooms constraint is active', () => {
    let project = createProjectWithCaptions();
    // Add a zoom to clip-v1
    project.clips['clip-v1'].zooms = [
      { sourceStart: 1, sourceEnd: 3, fromScale: 1, toScale: 1.15, returnToStart: true, easing: 'smooth' }
    ];

    const constraints = {
      disallowedAudio: false,
      disallowedSfx: false,
      disallowedCuts: false,
      disallowedBroll: false,
      disallowedZooms: true,
      removeZooms: true,
      protectedIntervals: [],
      phraseQuotes: []
    };

    const result = reconcileEditingDecisions(project, [], [], constraints);
    const clearDec = result.decisions.find(d => d.op === 'clearZooms');
    assert.ok(clearDec, 'Must add clearZooms decision for clip with zooms');
    assert.equal(clearDec.clipId, 'clip-v1');
  });

  test('filters out decisions occurring inside protected temporal intervals', () => {
    const project = createProjectWithCaptions();
    const rawDecisions = [
      { op: 'addZoom', clipId: 'clip-v1', startTime: 2, endTime: 4, fromScale: 1, toScale: 1.1 },
      { op: 'addZoom', clipId: 'clip-v1', startTime: 11, endTime: 13, fromScale: 1, toScale: 1.1 }
    ];
    const constraints = {
      disallowedAudio: false,
      disallowedSfx: false,
      disallowedCuts: false,
      disallowedBroll: false,
      disallowedZooms: false,
      removeZooms: false,
      protectedIntervals: [{ start: 0, end: 10 }],
      phraseQuotes: []
    };

    const result = reconcileEditingDecisions(project, rawDecisions, [], constraints);
    assert.equal(result.decisions.length, 1);
    assert.equal(result.decisions[0].startTime, 11);
  });
});
