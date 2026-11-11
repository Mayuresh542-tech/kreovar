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

describe('Kreovar Caption Guardrail — Strict Template Enforcement & Zero-Hallucinated Text', () => {
  const { load } = loader();
  const model = load(path.join(root, 'app/lib/editor/model.ts'));
  const intent = load(path.join(root, 'app/lib/editor/editingIntent.ts'));
  const reconciler = load(path.join(root, 'app/lib/editor/inPlaceReconciler.ts'));
  const sequential = load(path.join(root, 'app/lib/editor/sequentialEdit.ts'));
  const prompts = load(path.join(root, 'app/lib/editor/prompts.ts'));
  const canvasCaptions = load(path.join(root, 'app/lib/captions/canvasCaptions.ts'));

  test('Requirement 1: Template Registry Whitelist contains 47+ curated presets & types', () => {
    assert.ok(Array.isArray(model.VALID_CAPTION_PRESETS), 'VALID_CAPTION_PRESETS must be an array');
    assert.ok(model.VALID_CAPTION_PRESETS.length >= 47, `Expected at least 47 presets, found ${model.VALID_CAPTION_PRESETS.length}`);
    
    // Core curated styles must exist
    const essential = [
      'study-hormozi-style',
      'study-ali-abdaal',
      'study-thora-cinematic',
      'study-liquid-glass',
      'study-mota',
      'study-deep-glow',
      'viral-hinglish-pop',
      'edit-blueprint'
    ];
    for (const id of essential) {
      assert.ok(model.VALID_CAPTION_PRESETS.includes(id), `Missing required preset: ${id}`);
    }

    // Exported from canvasCaptions.ts as well
    assert.ok(canvasCaptions.VALID_CAPTION_PRESETS, 'canvasCaptions must re-export VALID_CAPTION_PRESETS');
    assert.equal(canvasCaptions.VALID_CAPTION_PRESETS.length, model.VALID_CAPTION_PRESETS.length);

    // Normalization helper
    assert.equal(model.normalizeCaptionPresetId('ali-abdaal'), 'study-ali-abdaal');
    assert.equal(model.normalizeCaptionPresetId('hormozi'), 'study-hormozi-style');
    assert.equal(model.normalizeCaptionPresetId('thora-cinematic'), 'study-thora-cinematic');
    assert.equal(model.normalizeCaptionPresetId('unknown-junk-preset'), 'study-hormozi-style');
  });

  test('Requirement 2: Zero Arbitrary Text Rule blocks floating summary text and applies transcript captions', () => {
    const prompt = 'Add catchy text in the middle explaining the video';
    const constraints = intent.extractEditingConstraints(prompt);
    
    assert.equal(constraints.requestedFloatingSummaryText, true, 'Must detect request for floating summary text');

    // Create a mock project with speech and an existing caption track
    const project = model.createProject('test-p', 'Guardrail Test');
    project.tracks['track-video'] = { id: 'track-video', kind: 'video', name: 'Video 1', clipIds: ['clip-v1'], hidden: false, muted: false, locked: false };
    project.clips['clip-v1'] = {
      id: 'clip-v1', assetId: 'a1', trackId: 'track-video', name: 'Raw footage',
      startTime: 0, duration: 10, sourceStart: 0, sourceEnd: 10,
      transform: model.defaultTransform, volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }
    };
    project.assets['a1'] = { id: 'a1', name: 'video.mp4', kind: 'video', mime: 'video/mp4', size: 1000, duration: 10, width: 1080, height: 1920 };

    // Existing caption clip
    project.tracks['track-caption'] = { id: 'track-caption', kind: 'caption', name: 'Captions', clipIds: ['clip-c1'], hidden: false, muted: false, locked: false };
    project.clips['clip-c1'] = {
      id: 'clip-c1', contentId: 'cap1', trackId: 'track-caption', name: 'Captions',
      startTime: 0, duration: 5, sourceStart: 0, sourceEnd: 5,
      transform: model.defaultTransform, volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }
    };
    project.captions['cap1'] = {
      id: 'cap1', text: 'This is real speech', templateId: 'study-clean-motion',
      style: model.defaultStyle, words: [
        { word: 'This', start: 0.1, end: 0.5 },
        { word: 'is', start: 0.6, end: 0.9 },
        { word: 'real', start: 1.0, end: 1.5 },
        { word: 'speech', start: 1.6, end: 2.2 }
      ]
    };

    // If model proposed arbitrary addText:
    const hallucinatedDecisions = [
      { op: 'addText', text: 'WATCH THIS AMAZING VIDEO SUMMARY', startTime: 2.0, placementId: 'title-center' }
    ];

    const result = reconciler.reconcileEditingDecisions(project, hallucinatedDecisions, [], constraints);

    // Arbitrary text must be stripped
    assert.equal(result.decisions.some(d => d.op === 'addText'), false, 'Arbitrary text must be blocked');
    // Spoken transcript must be restyled with study-hormozi-style
    const applyTpl = result.decisions.find(d => d.op === 'applyCaptionTemplate');
    assert.ok(applyTpl, 'Must apply engaging caption template to existing speech captions');
    assert.equal(applyTpl.templateId, 'study-hormozi-style');
    // Notice must be recorded
    assert.ok(result.summaryNotes.some(n => n.includes('Zero-hallucination guardrail active')), 'Must log zero-hallucination note');
  });

  test('Requirement 2b: Switching styles via chat updates presetId without altering timestamps or duplicating tracks', () => {
    const prompt = 'Switch to Ali Abdaal style and make it look clean';
    const constraints = intent.extractEditingConstraints(prompt);
    assert.equal(constraints.requestedCaptionPreset, 'study-ali-abdaal');

    const project = model.createProject('test-p2', 'Style Switch Test');
    project.tracks['track-caption'] = { id: 'track-caption', kind: 'caption', name: 'Captions', clipIds: ['clip-c1'], hidden: false, muted: false, locked: false };
    project.clips['clip-c1'] = {
      id: 'clip-c1', contentId: 'cap1', trackId: 'track-caption', name: 'Captions',
      startTime: 0, duration: 4, sourceStart: 0, sourceEnd: 4,
      transform: model.defaultTransform, volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }
    };
    const originalWords = [
      { word: 'Productivity', start: 0.2, end: 0.9 },
      { word: 'secrets', start: 1.0, end: 1.8 }
    ];
    project.captions['cap1'] = {
      id: 'cap1', text: 'Productivity secrets', templateId: 'study-hormozi-style',
      style: model.defaultStyle, words: structuredClone(originalWords)
    };

    // Simulate model proposing redundant addCaption or style edits
    const proposed = [
      { op: 'addCaption', text: 'Productivity secrets', startTime: 0, duration: 4, templateId: 'study-ali-abdaal' }
    ];

    const result = reconciler.reconcileEditingDecisions(project, proposed, [], constraints);

    // No duplicate addCaption
    assert.equal(result.decisions.some(d => d.op === 'addCaption'), false, 'Must not duplicate caption tracks');
    const applyTpl = result.decisions.find(d => d.op === 'applyCaptionTemplate');
    assert.ok(applyTpl, 'Must emit applyCaptionTemplate');
    assert.equal(applyTpl.templateId, 'study-ali-abdaal');
    assert.deepEqual([...applyTpl.clipIds], ['clip-c1']);

    // Execute decision on project
    const updated = sequential.buildStageProject(project, { summary: 'Update template', decisions: result.decisions });
    assert.equal(Object.keys(updated.clips).length, 1, 'Track count/clip count must not duplicate');
    assert.equal(updated.captions['cap1'].templateId, 'study-ali-abdaal', 'Must update templateId to study-ali-abdaal');
    assert.deepEqual(updated.captions['cap1'].words, originalWords, 'Word timestamps must be strictly preserved');
  });

  test('Requirement 3: validateCompletedJob enforces valid presetId and blocks arbitrary floating text on text track', () => {
    const project = model.createProject('test-p3', 'Validator Test');
    project.revision = 2;
    project.tracks['track-video'] = { id: 'track-video', kind: 'video', name: 'Video', clipIds: ['v1'], hidden: false, muted: false, locked: false };
    project.clips['v1'] = {
      id: 'v1', assetId: 'a1', trackId: 'track-video', name: 'Raw footage',
      startTime: 0, duration: 10, sourceStart: 0, sourceEnd: 10,
      transform: model.defaultTransform, volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }
    };
    project.assets['a1'] = { id: 'a1', name: 'v.mp4', kind: 'video', mime: 'video/mp4', size: 100, duration: 10, width: 1080, height: 1920 };

    // Caption clip with UNKNOWN custom-injected template
    project.tracks['track-caption'] = { id: 'track-caption', kind: 'caption', name: 'Captions', clipIds: ['c1'], hidden: false, muted: false, locked: false };
    project.clips['c1'] = {
      id: 'c1', contentId: 'cap1', trackId: 'track-caption', name: 'Captions',
      startTime: 0, duration: 5, sourceStart: 0, sourceEnd: 5,
      transform: model.defaultTransform, volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }
    };
    project.captions['cap1'] = {
      id: 'cap1', text: 'Valid speech', templateId: 'illegal-hallucinated-font-style-xyz',
      style: model.defaultStyle, words: [{ word: 'Valid', start: 0, end: 1 }, { word: 'speech', start: 1, end: 2 }]
    };

    // Arbitrary text layer without standard lower-third preset
    project.tracks['track-text'] = { id: 'track-text', kind: 'text', name: 'Titles', clipIds: ['t1'], hidden: false, muted: false, locked: false };
    project.clips['t1'] = {
      id: 't1', contentId: 'txt1', trackId: 'track-text', name: 'Floating Title',
      startTime: 1, duration: 3, sourceStart: 0, sourceEnd: 3,
      transform: model.defaultTransform, volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }
    };
    project.textLayers['txt1'] = { id: 'txt1', text: 'RANDOM HALLUCINATED SUMMARY', style: model.defaultStyle };

    const mockJob = {
      id: 'job-test',
      initialRevision: 1,
      appliedOperations: ['captions', 'requestedEdits'],
      completedStages: ['analyzeFootage', 'applyCaptions', 'applyRequestedEdits'],
      degradationNotices: [],
      stages: [
        { id: 'analyzeFootage', status: 'completed', output: { summary: 'ok' } },
        { id: 'applyCaptions', status: 'completed', output: { summary: 'ok' } },
        { id: 'applyRequestedEdits', status: 'completed', output: { summary: 'ok' } }
      ]
    };

    const report = sequential.validateCompletedJob(project, mockJob);

    // 1. Caption clip templateId must fallback to valid preset (study-hormozi-style)
    assert.equal(project.captions['cap1'].templateId, 'study-hormozi-style', 'Unknown caption template must fallback to study-hormozi-style');

    // 2. Arbitrary floating text clip must be removed from track and project
    assert.equal(project.clips['t1'], undefined, 'Arbitrary text clip must be blocked/removed');
    assert.equal(project.tracks['track-text'].clipIds.includes('t1'), false, 'Arbitrary text clip ID must be removed from track');
    assert.ok(mockJob.degradationNotices.some(n => n.reason.includes('Blocked arbitrary floating text')), 'Notice must be logged for blocked floating text');
  });

  test('Requirement 4: Strict negative constraint prompt is defined and injected', () => {
    assert.ok(prompts.STRICT_CAPTION_CONSTRAINT_PROMPT, 'STRICT_CAPTION_CONSTRAINT_PROMPT must be exported');
    assert.ok(prompts.STRICT_CAPTION_CONSTRAINT_PROMPT.includes('NEVER invent, generate, or hallucinate custom text layers'), 'Must contain negative instruction');
    assert.ok(prompts.STRICT_CAPTION_CONSTRAINT_PROMPT.includes('VALID_CAPTION_PRESETS'), 'Must reference VALID_CAPTION_PRESETS whitelist');
  });
});
