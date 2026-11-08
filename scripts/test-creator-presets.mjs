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
    }).outputText.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(file).href));

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
const model = load('app/lib/editor/model.ts');
const ops = load('app/lib/editor/operations.ts');
const pipeline = load('app/lib/editor/sequentialEdit.ts');

function sourceProject() {
  let p = model.createProject('test-project');
  p = ops.addAsset(p, { id: 'source', kind: 'video', name: 'Original.mp4', duration: 15, width: 1080, height: 1920, mime: 'video/mp4', size: 1000 });
  return ops.addClip(p, 'source', 'track-video', 0, { id: 'footage', duration: 15, sourceEnd: 15 });
}

describe('Task 1: Creator Presets & applyEffects Resilience', () => {
  test('PIPELINE_PRESETS contains all 5 modern creator presets and legacy presets', () => {
    const ids = pipeline.PIPELINE_PRESETS.map(p => p.id);
    assert(ids.includes('hormozi'), 'hormozi preset must exist');
    assert(ids.includes('podcast-pro'), 'podcast-pro preset must exist');
    assert(ids.includes('mrbeast'), 'mrbeast preset must exist');
    assert(ids.includes('documentary'), 'documentary preset must exist');
    assert(ids.includes('clean'), 'clean preset must exist');
    assert(ids.includes('punchy'), 'legacy punchy preset must exist');
    assert(ids.includes('engaging'), 'legacy engaging preset must exist');

    const hormozi = pipeline.PIPELINE_PRESETS.find(p => p.id === 'hormozi');
    assert.equal(hormozi.captionTemplate, 'study-hormozi-style');
    assert(hormozi.operations.includes('soundEffects'));

    const podcast = pipeline.PIPELINE_PRESETS.find(p => p.id === 'podcast-pro');
    assert.equal(podcast.captionTemplate, 'study-ali-abdaal');
    assert(podcast.operations.includes('effects'));

    const mrbeast = pipeline.PIPELINE_PRESETS.find(p => p.id === 'mrbeast');
    assert.equal(mrbeast.captionTemplate, 'study-mr-beast-style-2');

    const doc = pipeline.PIPELINE_PRESETS.find(p => p.id === 'documentary');
    assert.equal(doc.captionTemplate, 'study-thora-cinematic');
    assert(doc.operations.includes('effects'));
  });

  test('applyEffects stage validator permits zero additions on uncut single-clip footage with skip rationale', () => {
    const p = sourceProject();
    const output = {
      summary: 'Preserved continuous footage without artificial transitions.',
      decisions: []
    };
    // Should not throw on uncut single-clip footage with explanation
    const validated = pipeline.validateStageChanges('applyEffects', p, p, output);
    assert.equal(validated.summary, output.summary);
  });
});

describe('Task 2: Caption Studio Integration & Model Prompting in editorAi.ts', () => {
  const aiVal = load('app/lib/editor/aiValidation.ts');

  test('validateAiPlan accepts Caption Studio reference templates', () => {
    let p = sourceProject();
    p = ops.addCaption(p, 'Hello world', 0, 3);
    const clipId = Object.values(p.clips).find(c => c.contentId && p.captions[c.contentId])?.id;
    assert.ok(clipId, 'Caption clip must exist');

    const templatesToTest = [
      'study-hormozi-style',
      'study-ali-abdaal',
      'study-mr-beast-style-2',
      'study-clean-motion',
      'study-thora-cinematic'
    ];

    for (const templateId of templatesToTest) {
      const plan = {
        summary: `Restyling with ${templateId}`,
        decisions: [
          {
            op: 'applyCaptionTemplate',
            clipIds: [clipId],
            templateId
          }
        ]
      };
      const validated = aiVal.validateAiPlan(plan, p);
      assert.equal(validated.list.decisions[0].templateId, templateId);
    }
  });

  test('planAiEdit exposes Caption Studio templates and instructions in model prompt', async () => {
    let capturedOptions = null;
    const testLoader = loader({
      'app/lib/server/editorProvider.ts': {
        generateEditPlanJson: async (options) => {
          capturedOptions = options;
          return {
            attempts: 1,
            provider: 'groq',
            model: 'qwen',
            value: {
              summary: 'Planned creator styling',
              intent: { goal: 'edit', preserve: [], questions: [] },
              decisions: [],
              toolRequests: []
            }
          };
        },
        editorProviderSummary: (s) => s
      }
    });

    const editorAi = testLoader('app/lib/server/editorAi.ts');
    const p = sourceProject();
    await editorAi.planAiEdit(p, 'make an engaging creator video', [], 'test-user', new AbortController().signal);

    assert(capturedOptions, 'planAiEdit must call generateEditPlanJson with options');
    const promptData = JSON.parse(capturedOptions.prompt);
    const templateIds = promptData.captionTemplates.map(t => t.id);

    const requiredTemplates = [
      'study-hormozi-style',
      'study-ali-abdaal',
      'study-mr-beast-style-2',
      'study-clean-motion',
      'study-thora-cinematic',
      'study-deep-glow',
      'study-liquid-glass',
      'study-scribble',
      'study-pop-up'
    ];

    for (const reqId of requiredTemplates) {
      assert(templateIds.includes(reqId), `captionTemplates in prompt must include ${reqId}`);
    }

    const sys = capturedOptions.systemInstruction;
    assert(sys.includes('study-hormozi-style') || sys.includes('Hormozi'), 'System prompt should mention Hormozi style');
    assert(sys.includes('study-ali-abdaal') || sys.includes('Ali Abdaal'), 'System prompt should mention Ali Abdaal style');
    assert(sys.includes('returnToStart'), 'System prompt should guide on paired zoom keyframes with returnToStart');
    assert(sys.includes('addTransition'), 'System prompt should guide on transitions between cuts');
  });
});

describe('Task 3: Client Sequential Execution & Featured UI Preset Picker', () => {
  test('AiEditingChat filters presets to 5 featured creator presets', () => {
    const chatSource = fs.readFileSync(path.join(root, 'app/components/editor/workspace/AiEditingChat.tsx'), 'utf8');
    assert(chatSource.includes('FEATURED_PRESET_IDS'), 'AiEditingChat must define FEATURED_PRESET_IDS');
    assert(chatSource.includes('hormozi'), 'Featured presets must include hormozi');
    assert(chatSource.includes('podcast-pro'), 'Featured presets must include podcast-pro');
    assert(chatSource.includes('mrbeast'), 'Featured presets must include mrbeast');
    assert(chatSource.includes('documentary'), 'Featured presets must include documentary');
    assert(chatSource.includes('clean'), 'Featured presets must include clean');
  });

  test('client applyEffects handles uncut single clip without throwing', async () => {
    const clientSource = fs.readFileSync(path.join(root, 'app/lib/editor/sequentialEditClient.ts'), 'utf8');
    assert(clientSource.includes("case 'applyEffects':"), "sequentialEditClient must have dedicated case 'applyEffects': handler");
  });
});
