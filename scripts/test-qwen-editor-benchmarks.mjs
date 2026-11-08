import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');
const sharp = require('sharp');

function loader(mocks = {}, extra = {}) {
  const cache = new Map();
  const defaultMocks = {
    'app/lib/supabase.ts': {
      supabase: {
        auth: { getSession: async () => ({ data: { session: null } }) },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) })
      }
    },
    ...mocks
  };

  const context = vm.createContext({
    console,
    URL,
    Headers,
    Response,
    Buffer,
    Error,
    AbortSignal,
    AbortController,
    Uint8Array,
    crypto: globalThis.crypto,
    setTimeout,
    clearTimeout,
    fetch: globalThis.fetch,
    process: { env: { EDITOR_AI_PRIMARY_PROVIDER: 'groq' } },
    ...extra
  });

  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) filename += '.ts';
    const key = path.relative(root, filename).replaceAll('\\', '/');
    if (Object.hasOwn(defaultMocks, key)) return defaultMocks[key];
    if (cache.has(filename)) return cache.get(filename);
    const exports = {};
    cache.set(filename, exports);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(filename).href));

    const localRequire = specifier =>
      specifier.startsWith('@/')
        ? load(specifier.slice(2))
        : specifier.startsWith('.')
        ? load(path.relative(root, path.resolve(path.dirname(filename), specifier)))
        : require(specifier);

    new vm.Script(`(function(require,module,exports){${code}\n})`, { filename }).runInContext(context)(
      localRequire,
      { exports },
      exports
    );
    return exports;
  }
  return load;
}

const PRIMARY_MODEL = 'qwen/qwen3.8-27b';

async function makeTestImage(color = '#224488', width = 120, height = 80) {
  return (await sharp({
    create: { width, height, channels: 3, background: color }
  }).jpeg().toBuffer()).toString('base64');
}

function makeMockCanvas() {
  const drawCalls = [];
  const mockCtx = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'measureText') return (text) => ({ width: text.length * 10 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return (...args) => {
          drawCalls.push([prop, ...args]);
          return { addColorStop: (...stopArgs) => drawCalls.push(['addColorStop', ...stopArgs]) };
        };
      }
      return (...args) => drawCalls.push([prop, ...args]);
    },
    set: (_t, prop, val) => {
      drawCalls.push([prop, val]);
      return true;
    }
  });
  return { canvas: { width: 720, height: 1280, getContext: () => mockCtx }, drawCalls };
}

// -------------------------------------------------------------
// Benchmark 1: Talking-Head Video
// -------------------------------------------------------------
test('Benchmark 1: Talking-head video - Qwen plans captions, speech zooms, and callout graphics with valid execution', async () => {
  const seenModels = [];
  const load = loader({
    'app/lib/server/providerRegistry.ts': {
      getProviderCredential: async () => 'TEST_GROQ_KEY',
      recordProviderUsage: async () => {}
    },
    'app/lib/server/editorAiCatalog.ts': { loadAiCatalog: async () => [] },
    'app/lib/server/editorStyleReferences.ts': { editorStyleReferenceContext: () => ({ references: [], images: [], selectedIds: [] }) }
  }, {
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body);
      seenModels.push(body.model);
      const isVision = body.messages[0].content.includes('visual observation assistant');
      if (isVision) {
        return Response.json({
          model: PRIMARY_MODEL,
          choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ observations: [{ panel: 1, description: 'Speaker centered in talking-head framing with clear bottom margin.', confidence: 0.95, subjectRegion: 'center', clearRegions: ['lower-center'] }] }) } }],
          usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 }
        });
      }
      return Response.json({
        model: PRIMARY_MODEL,
        choices: [{
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              summary: 'Engaging talking-head edit with signature captions, speech-emphasis zoom, and callout graphic',
              decisions: [
                { op: 'addCaption', text: 'Welcome to this deep dive', startTime: 0.5, duration: 2.0, templateId: 'signature-poppins', words: [{ word: 'Welcome', start: 0, end: 0.5 }, { word: 'to', start: 0.5, end: 0.7 }, { word: 'this', start: 0.7, end: 1.0 }, { word: 'deep', start: 1.0, end: 1.4 }, { word: 'dive', start: 1.4, end: 2.0 }] },
                { op: 'addZoom', clipId: 'clip-speaker', startTime: 1.0, endTime: 2.2, fromScale: 1.0, toScale: 1.12, easing: 'smooth', returnToStart: true, focusX: 0, focusY: 0 },
                { op: 'addGraphic', kind: 'callout', text: 'KEY TAKEAWAY', startTime: 0.8, duration: 1.5, motion: 'pop' }
              ],
              toolRequests: []
            })
          }
        }],
        usage: { prompt_tokens: 450, completion_tokens: 120, total_tokens: 570 }
      });
    }
  });

  const modelMod = load('app/lib/editor/model.ts');
  const opsMod = load('app/lib/editor/operations.ts');
  const editorAi = load('app/lib/server/editorAi.ts');
  const aiMod = load('app/lib/editor/ai.ts');
  const { Compositor } = load('app/lib/editor/compositor.ts');

  let project = modelMod.createProject('proj-talking-head', 'Talking Head Video');
  project.settings.aspectRatio = '9:16';
  project = opsMod.addAsset(project, { id: 'asset-speaker', kind: 'video', name: 'speaker.mp4', duration: 10, width: 720, height: 1280, mime: 'video/mp4', size: 500000 });
  project = opsMod.addClip(project, 'asset-speaker', 'track-video', 0, { id: 'clip-speaker', duration: 10, sourceStart: 0, sourceEnd: 10 });

  const testFrame = await makeTestImage('#112233');
  const result = await editorAi.planAiEdit(
    project,
    'Add animated captions, speech-emphasis zooms and a callout graphic for my talking-head video.',
    ['clip-speaker'],
    'user-1',
    new AbortController().signal,
    0,
    { footageFrames: [{ clipId: 'clip-speaker', sourceTime: 1, timelineTime: 1, width: 720, height: 1280, data: testFrame }] }
  );

  assert.equal(result.planner.provider, 'groq');
  assert.equal(result.planner.model, PRIMARY_MODEL);
  assert.equal(result.planner.visionModel, PRIMARY_MODEL);
  assert.ok(seenModels.every(m => m === PRIMARY_MODEL), 'All requests must use Qwen 27B');
  assert.equal(result.list.decisions.length, 3);

  // Execute operations on project
  const updatedProject = aiMod.applyEditDecisionList(project, result.list);
  assert.ok(updatedProject.clips['clip-speaker'].zooms.length > 0, 'Zoom must be applied to clip');
  assert.ok(Object.keys(updatedProject.captions).length > 0, 'Caption must be created');

  // Verify Remotion Compositor can render at t=1.2s
  const { canvas } = makeMockCanvas();
  const compositor = new Compositor({});
  compositor.setFrame('clip-speaker', {}, 720, 1280);
  const bounds = compositor.render(canvas, updatedProject, 1.2);
  assert.ok(bounds.length >= 2, 'Compositor rendered speaker video and captions');
  compositor.dispose();
});

// -------------------------------------------------------------
// Benchmark 2: Podcast Video
// -------------------------------------------------------------
test('Benchmark 2: Podcast video - Multi-speaker dialogue, subtitle timing and audio ducking', async () => {
  const seenModels = [];
  const load = loader({
    'app/lib/server/providerRegistry.ts': {
      getProviderCredential: async () => 'TEST_GROQ_KEY',
      recordProviderUsage: async () => {}
    },
    'app/lib/server/editorAiCatalog.ts': { loadAiCatalog: async () => [] },
    'app/lib/server/editorStyleReferences.ts': { editorStyleReferenceContext: () => ({ references: [], images: [], selectedIds: [] }) }
  }, {
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body);
      seenModels.push(body.model);
      return Response.json({
        model: PRIMARY_MODEL,
        choices: [{
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              summary: 'Clean podcast layout with conversational captions and automatic audio ducking',
              decisions: [
                { op: 'addCaption', text: 'Welcome back to the podcast', startTime: 0.0, duration: 2.5, templateId: 'clean-sub', words: [{ word: 'Welcome', start: 0, end: 0.5 }, { word: 'back', start: 0.5, end: 1.0 }, { word: 'to', start: 1.0, end: 1.3 }, { word: 'the', start: 1.3, end: 1.6 }, { word: 'podcast', start: 1.6, end: 2.5 }] },
                { op: 'addCaption', text: 'Today we discuss AI video editing', startTime: 2.8, duration: 2.2, templateId: 'clean-sub', words: [{ word: 'Today', start: 0, end: 0.4 }, { word: 'we', start: 0.4, end: 0.7 }, { word: 'discuss', start: 0.7, end: 1.2 }, { word: 'AI', start: 1.2, end: 1.5 }, { word: 'video', start: 1.5, end: 1.8 }, { word: 'editing', start: 1.8, end: 2.2 }] },
                { op: 'setAudioDucking', enabled: true }
              ],
              toolRequests: []
            })
          }
        }],
        usage: { prompt_tokens: 380, completion_tokens: 140, total_tokens: 520 }
      });
    }
  });

  const modelMod = load('app/lib/editor/model.ts');
  const opsMod = load('app/lib/editor/operations.ts');
  const editorAi = load('app/lib/server/editorAi.ts');
  const aiMod = load('app/lib/editor/ai.ts');

  let project = modelMod.createProject('proj-podcast', 'Podcast Episode');
  project = opsMod.addAsset(project, { id: 'asset-dialogue', kind: 'audio', name: 'interview.mp3', duration: 30, width: 0, height: 0, mime: 'audio/mp3', size: 1000000 });
  project = opsMod.addClip(project, 'asset-dialogue', 'track-audio', 0, { id: 'clip-dialogue', duration: 30, sourceStart: 0, sourceEnd: 30, audioRole: 'speech' });

  const result = await editorAi.planAiEdit(
    project,
    'Create clean conversation subtitles and enable audio ducking for background sound in this podcast.',
    ['clip-dialogue'],
    'user-podcast',
    new AbortController().signal
  );

  assert.equal(result.planner.model, PRIMARY_MODEL);
  assert.equal(result.list.decisions.length, 3);

  const updatedProject = aiMod.applyEditDecisionList(project, result.list);
  assert.equal(updatedProject.settings.audioDucking, true, 'Audio ducking must be enabled');
  assert.equal(Object.keys(updatedProject.captions).length, 2, 'Two captions added');
});

// -------------------------------------------------------------
// Benchmark 3: Real-Estate Video
// -------------------------------------------------------------
test('Benchmark 3: Real-estate video - Landscape-to-portrait framing, architectural titles and transitions', async () => {
  const load = loader({
    'app/lib/server/providerRegistry.ts': {
      getProviderCredential: async () => 'TEST_GROQ_KEY',
      recordProviderUsage: async () => {}
    },
    'app/lib/server/editorAiCatalog.ts': { loadAiCatalog: async () => [] },
    'app/lib/server/editorStyleReferences.ts': { editorStyleReferenceContext: () => ({ references: [], images: [], selectedIds: [] }) }
  }, {
    fetch: async () => {
      return Response.json({
        model: PRIMARY_MODEL,
        choices: [{
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              summary: 'Real estate showcase in 9:16 with property lower-third, subtle zoom and smooth dissolve transition',
              decisions: [
                { op: 'setAspectRatio', aspectRatio: '9:16' },
                { op: 'addGraphic', kind: 'lower-third', text: '4 BED · 3 BATH · MODERN VILLA', startTime: 0.5, duration: 3.0, motion: 'slide-up', accent: '#d4af37' },
                { op: 'addZoom', clipId: 'clip-living-room', startTime: 0.0, endTime: 4.0, fromScale: 1.0, toScale: 1.08, easing: 'smooth', returnToStart: false, focusX: 0, focusY: 0 },
                { op: 'addTransition', fromClipId: 'clip-living-room', toClipId: 'clip-kitchen', kind: 'dissolve', duration: 0.8 }
              ],
              toolRequests: []
            })
          }
        }],
        usage: { prompt_tokens: 300, completion_tokens: 110, total_tokens: 410 }
      });
    }
  });

  const modelMod = load('app/lib/editor/model.ts');
  const opsMod = load('app/lib/editor/operations.ts');
  const editorAi = load('app/lib/server/editorAi.ts');
  const aiMod = load('app/lib/editor/ai.ts');

  let project = modelMod.createProject('proj-real-estate', 'Luxury Villa Tour');
  project = opsMod.addAsset(project, { id: 'asset-lr', kind: 'video', name: 'living_room.mp4', duration: 4, width: 1920, height: 1080, mime: 'video/mp4', size: 1000000 });
  project = opsMod.addAsset(project, { id: 'asset-k', kind: 'video', name: 'kitchen.mp4', duration: 4, width: 1920, height: 1080, mime: 'video/mp4', size: 1000000 });
  project = opsMod.addClip(project, 'asset-lr', 'track-video', 0, { id: 'clip-living-room', duration: 4, sourceStart: 0, sourceEnd: 4 });
  project = opsMod.addClip(project, 'asset-k', 'track-video', 4, { id: 'clip-kitchen', duration: 4, sourceStart: 0, sourceEnd: 4 });

  const result = await editorAi.planAiEdit(
    project,
    'Format for 9:16 Reels with property lower-third spec title, slow pan zoom, and smooth dissolve to kitchen.',
    ['clip-living-room', 'clip-kitchen'],
    'user-realtor',
    new AbortController().signal
  );

  assert.equal(result.planner.model, PRIMARY_MODEL);
  assert.equal(result.list.decisions[0].op, 'setAspectRatio');
  assert.equal(result.list.decisions[0].aspectRatio, '9:16');

  const updatedProject = aiMod.applyEditDecisionList(project, result.list);
  assert.equal(updatedProject.settings.aspectRatio, '9:16');
  assert.ok(Object.keys(updatedProject.transitions).length > 0, 'Transition applied between adjacent clips');
});

// -------------------------------------------------------------
// Benchmark 4: Video with Background Music
// -------------------------------------------------------------
test('Benchmark 4: Background music - Sound effect placement and audio balance', async () => {
  const load = loader({
    'app/lib/server/providerRegistry.ts': {
      getProviderCredential: async () => 'TEST_GROQ_KEY',
      recordProviderUsage: async () => {}
    },
    'app/lib/server/editorAiCatalog.ts': { loadAiCatalog: async () => [] },
    'app/lib/server/editorStyleReferences.ts': { editorStyleReferenceContext: () => ({ references: [], images: [], selectedIds: [] }) }
  }, {
    fetch: async () => {
      return Response.json({
        model: PRIMARY_MODEL,
        choices: [{
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              summary: 'Balanced audio track with subtle whoosh sound effect and reduced music volume',
              decisions: [
                { op: 'changeClipProperty', clipId: 'clip-bgm', changes: { volume: 0.25, ducking: true } }
              ],
              toolRequests: [
                { type: 'sfx', soundId: 'soft-whoosh', trackId: 'track-audio', startTime: 1.0, volume: 0.15 }
              ]
            })
          }
        }],
        usage: { prompt_tokens: 280, completion_tokens: 80, total_tokens: 360 }
      });
    }
  });

  const modelMod = load('app/lib/editor/model.ts');
  const opsMod = load('app/lib/editor/operations.ts');
  const editorAi = load('app/lib/server/editorAi.ts');

  let project = modelMod.createProject('proj-music', 'Music Video Balance');
  project = opsMod.addAsset(project, { id: 'asset-bgm', kind: 'audio', name: 'upbeat_synth.mp3', duration: 15, width: 0, height: 0, mime: 'audio/mp3', size: 800000 });
  project = opsMod.addClip(project, 'asset-bgm', 'track-audio', 0, { id: 'clip-bgm', duration: 15, sourceStart: 0, sourceEnd: 15, volume: 1.0, audioRole: 'background' });

  const result = await editorAi.planAiEdit(
    project,
    'Lower background music to 25% and add a subtle fast whoosh sound effect at the beginning transition.',
    ['clip-bgm'],
    'user-producer',
    new AbortController().signal
  );

  assert.equal(result.planner.model, PRIMARY_MODEL);
  assert.equal(result.toolRequests.length, 1);
  assert.equal(result.toolRequests[0].type, 'sfx');
  assert.equal(result.toolRequests[0].soundId, 'soft-whoosh');
});

// -------------------------------------------------------------
// Benchmark 5: Video with Poor or Noisy Audio
// -------------------------------------------------------------
test('Benchmark 5: Poor or noisy audio - Graceful handling without speech fabrication', async () => {
  const load = loader({
    'app/lib/server/providerRegistry.ts': {
      getProviderCredential: async () => 'TEST_GROQ_KEY',
      recordProviderUsage: async () => {}
    },
    'app/lib/server/editorAiCatalog.ts': { loadAiCatalog: async () => [] },
    'app/lib/server/editorStyleReferences.ts': { editorStyleReferenceContext: () => ({ references: [], images: [], selectedIds: [] }) }
  }, {
    fetch: async () => {
      return Response.json({
        model: PRIMARY_MODEL,
        choices: [{
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              summary: 'No transcription context was detected. To avoid fabricating dialogue, request automatic captions first.',
              intent: { goal: 'Clarify dialogue', preserve: ['original-audio'], questions: ['Would you like to transcribe this audio first?'] },
              decisions: [],
              toolRequests: []
            })
          }
        }],
        usage: { prompt_tokens: 220, completion_tokens: 60, total_tokens: 280 }
      });
    }
  });

  const modelMod = load('app/lib/editor/model.ts');
  const opsMod = load('app/lib/editor/operations.ts');
  const editorAi = load('app/lib/server/editorAi.ts');

  let project = modelMod.createProject('proj-noisy', 'Wind Noise Clip');
  project = opsMod.addAsset(project, { id: 'asset-wind', kind: 'video', name: 'outdoor_gopro.mp4', duration: 10, width: 1920, height: 1080, mime: 'video/mp4', size: 1000000 });
  project = opsMod.addClip(project, 'asset-wind', 'track-video', 0, { id: 'clip-wind', duration: 10, sourceStart: 0, sourceEnd: 10 });

  const result = await editorAi.planAiEdit(
    project,
    'Add captions to whatever is being said in this windy recording.',
    ['clip-wind'],
    'user-outdoor',
    new AbortController().signal
  );

  assert.equal(result.planner.model, PRIMARY_MODEL);
  assert.equal(result.list.decisions.length, 0, 'No decisions fabricated when speech context is absent');
  assert.ok(result.summary.includes('transcription') || result.summary.includes('transcribe'), 'Model honestly asks for transcription first');
});

// -------------------------------------------------------------
// Benchmark 6: Complex Custom Editing Instructions
// -------------------------------------------------------------
test('Benchmark 6: Complex custom editing instructions - Multi-step transform, color grading and keyframes', async () => {
  const load = loader({
    'app/lib/server/providerRegistry.ts': {
      getProviderCredential: async () => 'TEST_GROQ_KEY',
      recordProviderUsage: async () => {}
    },
    'app/lib/server/editorAiCatalog.ts': { loadAiCatalog: async () => [] },
    'app/lib/server/editorStyleReferences.ts': { editorStyleReferenceContext: () => ({ references: [], images: [], selectedIds: [] }) }
  }, {
    fetch: async () => {
      return Response.json({
        model: PRIMARY_MODEL,
        choices: [{
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              summary: 'Cinematic grading with retro paper texture, contrast bump, and subtle motion keyframes',
              decisions: [
                { op: 'changeClipProperty', clipId: 'clip-film', changes: { surface: 'retro', effects: { brightness: -5, contrast: 15, saturation: -10, blur: 0 } } },
                { op: 'keyframes', clipId: 'clip-film', frames: [
                  { sourceTime: 0.0, value: { x: 0, y: 0, scale: 1.0, rotation: 0, opacity: 1.0 }, easing: 'smooth' },
                  { sourceTime: 3.0, value: { x: 0.02, y: -0.01, scale: 1.05, rotation: 0.5, opacity: 1.0 }, easing: 'smooth' }
                ]}
              ],
              toolRequests: []
            })
          }
        }],
        usage: { prompt_tokens: 350, completion_tokens: 150, total_tokens: 500 }
      });
    }
  });

  const modelMod = load('app/lib/editor/model.ts');
  const opsMod = load('app/lib/editor/operations.ts');
  const editorAi = load('app/lib/server/editorAi.ts');
  const aiMod = load('app/lib/editor/ai.ts');

  let project = modelMod.createProject('proj-complex', 'Indie Film Scene');
  project = opsMod.addAsset(project, { id: 'asset-film', kind: 'video', name: 'scene1.mp4', duration: 8, width: 1920, height: 1080, mime: 'video/mp4', size: 2000000 });
  project = opsMod.addClip(project, 'asset-film', 'track-video', 0, { id: 'clip-film', duration: 8, sourceStart: 0, sourceEnd: 8 });

  const result = await editorAi.planAiEdit(
    project,
    'Apply a cinematic retro texture with enhanced contrast, slightly desaturated colors, and a gentle slow camera drift.',
    ['clip-film'],
    'user-director',
    new AbortController().signal
  );

  assert.equal(result.planner.model, PRIMARY_MODEL);
  assert.equal(result.list.decisions.length, 2);

  const updatedProject = aiMod.applyEditDecisionList(project, result.list);
  const clip = updatedProject.clips['clip-film'];
  assert.equal(clip.surface, 'retro');
  assert.equal(clip.effects.contrast, 15);
  assert.equal(clip.keyframes.length, 2);
});

// -------------------------------------------------------------
// Benchmark 7: Malformed Output & Retry Handling
// -------------------------------------------------------------
test('Benchmark 7: Recovery from invalid output - Bounded self-correction with Qwen 27B', async () => {
  let attempt = 0;
  const load = loader({
    'app/lib/server/providerRegistry.ts': {
      getProviderCredential: async () => 'TEST_GROQ_KEY',
      recordProviderUsage: async () => {}
    },
    'app/lib/server/editorAiCatalog.ts': { loadAiCatalog: async () => [] },
    'app/lib/server/editorStyleReferences.ts': { editorStyleReferenceContext: () => ({ references: [], images: [], selectedIds: [] }) }
  }, {
    fetch: async () => {
      attempt++;
      if (attempt === 1) {
        // Return invalid plan with non-existent clip ID
        return Response.json({
          model: PRIMARY_MODEL,
          choices: [{
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                summary: 'Faulty plan with missing clip ID',
                decisions: [{ op: 'removeClip', clipId: 'non-existent-id' }],
                toolRequests: []
              })
            }
          }],
          usage: { prompt_tokens: 300, completion_tokens: 40, total_tokens: 340 }
        });
      }
      // On retry with feedback, return valid plan
      return Response.json({
        model: PRIMARY_MODEL,
        choices: [{
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              summary: 'Corrected plan with valid timeline adjustment',
              decisions: [{ op: 'setAspectRatio', aspectRatio: '1:1' }],
              toolRequests: []
            })
          }
        }],
        usage: { prompt_tokens: 420, completion_tokens: 50, total_tokens: 470 }
      });
    }
  });

  const modelMod = load('app/lib/editor/model.ts');
  const editorAi = load('app/lib/server/editorAi.ts');

  const project = modelMod.createProject('proj-retry', 'Square Format Request');
  const result = await editorAi.planAiEdit(
    project,
    'Make this 1:1 square for Instagram.',
    [],
    'user-retry',
    new AbortController().signal
  );

  assert.equal(attempt, 2, 'Must perform one bounded correction attempt');
  assert.equal(result.modelRequests, 2);
  assert.equal(result.planner.model, PRIMARY_MODEL);
  assert.equal(result.list.decisions[0].op, 'setAspectRatio');
  assert.equal(result.list.decisions[0].aspectRatio, '1:1');
});
