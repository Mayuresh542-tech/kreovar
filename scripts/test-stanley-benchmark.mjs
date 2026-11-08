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
    'app/lib/server/planUsage.ts': {
      withUsage: (h) => h,
      reserveUsage: async () => ({ reservationId: 'test-usage' }),
      finishUsage: async () => {},
      PlanLimitError: class extends Error {},
      usageError: () => new Response('{}', { status: 503 })
    },
    'app/lib/server/speechDuration.ts': { speechDuration: async () => 16.55 },
    'app/lib/server/providerRegistry.ts': {
      getProviderCredential: async () => 'test-key',
      recordProviderUsage: async () => {}
    },
    'app/lib/server/editorTokenBudget.ts': {
      reserveEditorTokens: async () => 'test-budget-lease',
      settleEditorTokens: async () => {},
      worstCaseTokens: () => 1000
    },
    'app/lib/assets/client.ts': { linkAsset: async () => {} },
    'app/lib/editor/footageFramesClient.ts': {
      captureFootageEvidence: async () => ({ footageFrames: [], fallbackFootageFrames: [] })
    },
    'app/lib/editor/recovery.ts': { saveCheckpoint: async () => {} },
    'app/lib/editor/compositor.ts': {
      Compositor: class { sync() { return true; } render() {} dispose() {} }
    },
    'app/lib/server/editorAiCatalog.ts': { loadAiCatalog: async () => [] },
    'app/lib/server/editorStyleReferences.ts': { editorStyleReferenceContext: () => ({ references: [], images: [], selectedIds: [] }) },
    'app/lib/server/radoxConfig.ts': { EDITOR_AI_MAX_TOKENS: 4096 },
    ...mocks
  };

  function load(relative) {
    let file = path.resolve(root, relative);
    if (!path.extname(file)) file += '.ts';
    const key = path.relative(root, file).replaceAll('\\', '/');
    if (key in baseMocks) return baseMocks[key];
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

function createSampleProject() {
  let p = model.createProject('sample-benchmark');
  p = ops.addAsset(p, { id: 'source-v', kind: 'video', name: 'main.mp4', duration: 25, width: 1080, height: 1920, mime: 'video/mp4', size: 5000 });
  p = ops.addClip(p, 'source-v', 'track-video', 0, { id: 'clip-main', duration: 25, sourceEnd: 25, volume: 1 });
  // Add speech captions with word timings
  p = ops.addCaption(p, 'Welcome to the podcast everybody', 0.5, 4.0, {}, [
    { word: 'Welcome', start: 0.0, end: 0.5 },
    { word: 'to', start: 0.6, end: 0.8 },
    { word: 'the', start: 0.9, end: 1.1 },
    { word: 'podcast', start: 1.2, end: 2.0 },
    { word: 'everybody', start: 2.1, end: 3.0 }
  ]);
  p = ops.addCaption(p, 'The secret to success is continuous execution', 5.0, 5.0, {}, [
    { word: 'The', start: 0.0, end: 0.3 },
    { word: 'secret', start: 0.4, end: 1.0 },
    { word: 'to', start: 1.1, end: 1.3 },
    { word: 'success', start: 1.4, end: 2.2 },
    { word: 'is', start: 2.3, end: 2.5 },
    { word: 'continuous', start: 2.6, end: 3.5 },
    { word: 'execution', start: 3.6, end: 4.5 }
  ]);
  return p;
}

describe('Stanley vs Kreovar Intelligence Benchmark Suite', () => {
  test('Benchmark Case 06: Caption-only refinement updates existing captions in-place without duplicate layers', async () => {
    const project = createSampleProject();
    const existingCaptionCount = Object.keys(project.captions).length;
    assert.equal(existingCaptionCount, 2);

    let planResponse = {
      summary: 'Updating captions to yellow Ali Abdaal style',
      intent: { goal: 'Caption restyling', preserve: ['audio', 'cuts', 'video'], questions: [] },
      decisions: [
        // Naive model attempt proposing addCaption
        { op: 'addCaption', text: 'Welcome to the podcast everybody', startTime: 0.5, duration: 4.0, templateId: 'study-ali-abdaal' },
        { op: 'addCaption', text: 'The secret to success is continuous execution', startTime: 5.0, duration: 5.0, templateId: 'study-ali-abdaal' }
      ],
      toolRequests: []
    };

    const testLoader = loader({
      'app/lib/server/editorProvider.ts': {
        generateEditPlanJson: async () => ({
          attempts: 1,
          provider: 'groq',
          model: 'qwen',
          value: planResponse
        }),
        editorProviderSummary: s => s
      }
    });

    const editorAi = testLoader('app/lib/server/editorAi');
    const result = await editorAi.planAiEdit(project, 'Only change the caption style to study-ali-abdaal and yellow. Do not touch any cuts or audio.', [], 'test-user', new AbortController().signal, 0, { pipelineStage: 'applyRequestedEdits' });

    // Result must have zero addCaption decisions (no duplicates!)
    assert.equal(result.list.decisions.some(d => d.op === 'addCaption'), false, 'Must not duplicate caption clips');
    // Result must have applyCaptionTemplate targeting existing clips
    const applyDec = result.list.decisions.find(d => d.op === 'applyCaptionTemplate');
    assert.ok(applyDec, 'Must have applyCaptionTemplate');
    assert.equal(applyDec.templateId, 'study-ali-abdaal');
  });

  test('Benchmark Case 11: Absolute negative constraint strictly strips audio and SFX operations', async () => {
    const project = createSampleProject();

    let planResponse = {
      summary: 'Added zoom and captions',
      intent: { goal: 'Visual polish', preserve: ['audio'], questions: [] },
      decisions: [
        { op: 'addZoom', clipId: 'clip-main', startTime: 2, endTime: 4, fromScale: 1, toScale: 1.12, returnToStart: true, easing: 'smooth' },
        // Model hallucinates an audio ducking and SFX addition
        { op: 'setAudioDucking', enabled: true },
        { op: 'addClip', assetId: 'sfx-1', trackId: 'track-audio', startTime: 2, duration: 1, volume: 0.2, audioRole: 'sfx' }
      ],
      toolRequests: [
        { type: 'sfx', soundId: 'whoosh', trackId: 'track-audio', startTime: 2 }
      ]
    };

    const testLoader = loader({
      'app/lib/server/editorProvider.ts': {
        generateEditPlanJson: async () => ({
          attempts: 1,
          provider: 'groq',
          model: 'qwen',
          value: planResponse
        }),
        editorProviderSummary: s => s
      }
    });

    const editorAi = testLoader('app/lib/server/editorAi');
    const result = await editorAi.planAiEdit(project, 'Add zooms but ABSOLUTELY DO NOT add any music, sound effects, or audio changes.', [], 'test-user', new AbortController().signal, 0, { pipelineStage: 'applyRequestedEdits' });

    assert.equal(result.list.decisions.some(d => d.op === 'setAudioDucking'), false, 'Audio ducking must be stripped');
    assert.equal(result.list.decisions.some(d => d.op === 'addClip' && d.trackId === 'track-audio'), false, 'Audio clip addition must be stripped');
    assert.equal(result.toolRequests.length, 0, 'SFX tool requests must be stripped');
    assert.equal(result.list.decisions.some(d => d.op === 'addZoom'), true, 'Zoom must be preserved');
  });

  test('Benchmark Case 10: Temporal bounds protection strictly excludes mutations in first 10 seconds', async () => {
    const project = createSampleProject();

    let planResponse = {
      summary: 'Added zooms',
      intent: { goal: 'Zoom emphasis', preserve: ['first 10 seconds'], questions: [] },
      decisions: [
        { op: 'addZoom', clipId: 'clip-main', startTime: 3, endTime: 5, fromScale: 1, toScale: 1.1, returnToStart: true, easing: 'smooth' },
        { op: 'addZoom', clipId: 'clip-main', startTime: 15, endTime: 17, fromScale: 1, toScale: 1.1, returnToStart: true, easing: 'smooth' }
      ],
      toolRequests: []
    };

    const testLoader = loader({
      'app/lib/server/editorProvider.ts': {
        generateEditPlanJson: async () => ({
          attempts: 1,
          provider: 'groq',
          model: 'qwen',
          value: planResponse
        }),
        editorProviderSummary: s => s
      }
    });

    const editorAi = testLoader('app/lib/server/editorAi');
    const result = await editorAi.planAiEdit(project, 'Keep first 10 seconds untouched. Add zooms to the rest.', [], 'test-user', new AbortController().signal, 0, { pipelineStage: 'applyRequestedEdits' });

    // Zoom at t=3 must be stripped because it falls in [0, 10s]
    assert.equal(result.list.decisions.some(d => d.op === 'addZoom' && d.startTime < 10), false, 'Protected range [0, 10s] must have zero zooms');
    assert.equal(result.list.decisions.some(d => d.op === 'addZoom' && d.startTime === 15), true, 'Zoom at t=15 must be kept');
  });

  test('Benchmark Case 13: Selective element removal adds clearZooms without touching captions', async () => {
    let project = createSampleProject();
    project.clips['clip-main'].zooms = [
      { sourceStart: 2, sourceEnd: 4, fromScale: 1, toScale: 1.15, returnToStart: true, easing: 'smooth' }
    ];

    let planResponse = {
      summary: 'Removing zooms',
      intent: { goal: 'Remove zooms', preserve: ['captions'], questions: [] },
      decisions: [],
      toolRequests: []
    };

    const testLoader = loader({
      'app/lib/server/editorProvider.ts': {
        generateEditPlanJson: async () => ({
          attempts: 1,
          provider: 'groq',
          model: 'qwen',
          value: planResponse
        }),
        editorProviderSummary: s => s
      }
    });

    const editorAi = testLoader('app/lib/server/editorAi');
    const result = await editorAi.planAiEdit(project, 'Remove the zooms but keep captions and audio intact.', [], 'test-user', new AbortController().signal, 0, { pipelineStage: 'applyRequestedEdits' });

    const clearDec = result.list.decisions.find(d => d.op === 'clearZooms');
    assert.ok(clearDec, 'Must have clearZooms decision');
    assert.equal(clearDec.clipId, 'clip-main');
  });

  test('Benchmark Case 18: Semantic phrase quotes snap zoom timestamps to exact Whisper words', async () => {
    const project = createSampleProject();

    let planResponse = {
      summary: 'Emphasis zoom on key phrase',
      intent: { goal: 'Zoom emphasis', preserve: [], questions: [] },
      decisions: [
        // Model proposed approximate or generic timestamp [5.0, 7.0]
        { op: 'addZoom', clipId: 'clip-main', startTime: 4.5, endTime: 6.5, fromScale: 1, toScale: 1.14, returnToStart: true, easing: 'smooth' }
      ],
      toolRequests: []
    };

    const testLoader = loader({
      'app/lib/server/editorProvider.ts': {
        generateEditPlanJson: async () => ({
          attempts: 1,
          provider: 'groq',
          model: 'qwen',
          value: planResponse
        }),
        editorProviderSummary: s => s
      }
    });

    const editorAi = testLoader('app/lib/server/editorAi');
    const result = await editorAi.planAiEdit(project, "When I say 'the secret to success', punch in for emphasis", [], 'test-user', new AbortController().signal, 0, { pipelineStage: 'applyRequestedEdits' });

    const zoom = result.list.decisions.find(d => d.op === 'addZoom');
    assert.ok(zoom);
    // Whisper word timings for 'The secret to success': start 5.0, end 7.2
    assert.equal(zoom.startTime, 5.0);
    assert.equal(zoom.endTime, 7.2);
  });

  test('Benchmark Case 22: Hinglish negative constraints prevent audio mutations', async () => {
    const project = createSampleProject();

    let planResponse = {
      summary: 'Added captions',
      intent: { goal: 'Captions', preserve: ['audio'], questions: [] },
      decisions: [
        { op: 'setAudioDucking', enabled: true }
      ],
      toolRequests: [
        { type: 'sfx', soundId: 'pop', trackId: 'track-audio', startTime: 1 }
      ]
    };

    const testLoader = loader({
      'app/lib/server/editorProvider.ts': {
        generateEditPlanJson: async () => ({
          attempts: 1,
          provider: 'groq',
          model: 'qwen',
          value: planResponse
        }),
        editorProviderSummary: s => s
      }
    });

    const editorAi = testLoader('app/lib/server/editorAi');
    const result = await editorAi.planAiEdit(project, 'Captions add kar do, but audio mat change karna aur koi music mat lagana.', [], 'test-user', new AbortController().signal, 0, { pipelineStage: 'applyRequestedEdits' });

    assert.equal(result.list.decisions.some(d => d.op === 'setAudioDucking'), false);
    assert.equal(result.toolRequests.length, 0);
  });
});
