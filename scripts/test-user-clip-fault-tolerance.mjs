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

const userClipPath = 'C:/Users/Admin/.gemini/antigravity/brain/16c83238-f069-4d57-8756-fcce52e88e98/.user_uploaded/media_1795005808998_b40ad2a3.mp4';
const userClipDuration = 15.04;
const userClipWidth = 720;
const userClipHeight = 1280;

assert(fs.existsSync(userClipPath), `User video clip must exist at ${userClipPath}`);

if (!globalThis.document) {
  globalThis.document = {
    fonts: { ready: Promise.resolve() },
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => {} })
    })
  };
}

function loader(mocks = {}) {
  const cache = new Map();
  const baseMocks = {
    'app/lib/server/planUsage.ts': {
      withUsage: (h) => h,
      reserveUsage: async () => ({ reservationId: 'test-usage' }),
      finishUsage: async () => {},
      PlanLimitError: class extends Error {},
      usageError: () => new Response('{}', { status: 503 })
    },
    'app/lib/server/speechDuration.ts': {
      speechDuration: async () => userClipDuration
    },
    'app/lib/supabase.ts': {
      supabase: {
        auth: {
          getSession: async () => ({ data: { session: { access_token: 'test-token' } } })
        }
      }
    },
    'app/lib/assets/client.ts': {
      linkAsset: async () => {}
    },
    'app/lib/editor/recovery.ts': {
      saveCheckpoint: async () => {}
    },
    'app/lib/editor/footageFramesClient.ts': {
      captureFootageEvidence: async () => ({ footageFrames: [], fallbackFootageFrames: [] })
    },
    'app/lib/editor/compositor.ts': {
      Compositor: class { sync() { return true; } render() {} dispose() {} }
    },
    ...mocks
  };

  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) filename += '.ts';
    const key = path.relative(root, filename).replaceAll('\\', '/');
    if (Object.hasOwn(baseMocks, key)) return baseMocks[key];
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule);
    const raw = fs.readFileSync(filename, 'utf8');
    const source = ts.transpileModule(raw, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(filename).href));
    const localRequire = (specifier) =>
      specifier.startsWith('@/')
        ? load(specifier.slice(2))
        : specifier.startsWith('.')
        ? load(path.relative(root, path.resolve(path.dirname(filename), specifier)))
        : require(specifier);
    new vm.Script(`(function(require,module,exports){${source}\n})`, { filename }).runInThisContext()(
      localRequire,
      loadedModule,
      loadedModule.exports
    );
    return loadedModule.exports;
  }
  return load;
}

const load = loader();
const model = load('app/lib/editor/model.ts');
const ops = load('app/lib/editor/operations.ts');
const pipeline = load('app/lib/editor/sequentialEdit.ts');
const { EditorStore } = load('app/lib/editor/store.ts');
const client = load('app/lib/editor/sequentialEditClient.ts');

function createPodcastProject(projectId = 'podcast-project') {
  let p = model.createProject(projectId);
  p.settings.aspectRatio = '9:16';
  p.settings.fps = 30;

  p = ops.addAsset(p, {
    id: 'podcast-asset',
    kind: 'video',
    name: 'Entrepreneurs_having_podcast_con…_d798d2d4.mp4',
    duration: userClipDuration,
    width: userClipWidth,
    height: userClipHeight,
    mime: 'video/mp4',
    size: 5641767,
    url: userClipPath
  });

  p = ops.addClip(p, 'podcast-asset', 'track-video', 0, {
    id: 'podcast-clip',
    name: 'Entrepreneurs Podcast Footage',
    duration: userClipDuration,
    sourceStart: 0,
    sourceEnd: userClipDuration,
    volume: 1
  });

  return p;
}

function makeRuntime(project, handler) {
  let p = structuredClone(project);
  const saved = [];
  return {
    getProject: () => p,
    interacting: () => false,
    persist: async (next, job) => {
      job.timelineRevision = p.revision + 1;
      p = { ...next, revision: job.timelineRevision, editingJob: structuredClone(job) };
      saved.push(structuredClone(p));
    },
    execute: async (...args) => handler(...args),
    saved
  };
}

const signal = () => new AbortController().signal;

const sampleCaptionOutput = {
  summary: 'Timed speech captions for podcast clip',
  decisions: [
    {
      op: 'addCaption',
      text: 'Building a sustainable startup takes resilience and focus',
      startTime: 1.0,
      duration: 3.5,
      templateId: 'study-hormozi-style',
      words: [
        { word: 'Building', start: 0, end: 0.5 },
        { word: 'a', start: 0.5, end: 0.7 },
        { word: 'sustainable', start: 0.7, end: 1.5 },
        { word: 'startup', start: 1.5, end: 2.2 },
        { word: 'takes', start: 2.2, end: 2.6 },
        { word: 'resilience', start: 2.6, end: 3.1 },
        { word: 'and', start: 3.1, end: 3.2 },
        { word: 'focus', start: 3.2, end: 3.5 }
      ]
    }
  ]
};

const sampleBrollAsset = {
  id: 'broll-asset-1',
  libraryId: 'broll-tech',
  kind: 'video',
  name: 'Startup_Office_Broll.mp4',
  duration: 4,
  width: 720,
  height: 1280,
  mime: 'video/mp4',
  size: 2048
};

describe('AI Video Editor Assistant Fault Tolerance on User Clip (Entrepreneurs Podcast)', () => {
  test('Scenario 1: Captions failure leaves/skips captions, continues to graphics, broll, zooms, and completes', async () => {
    const project = createPodcastProject('test-captions-fail');
    const seen = [];
    const job = pipeline.createEditingJob(
      project,
      'Add animated captions, motion graphics, relevant B-roll and subtle zoom effects.',
      [],
      pipeline.PIPELINE_PRESETS.find(p => p.id === 'engaging')
    );

    const runtime = makeRuntime(project, async (stage, proj, j) => {
      seen.push(stage);
      switch (stage) {
        case 'analyzeFootage':
          return { summary: '15.04s podcast video analyzed', operations: ['captions', 'motionGraphics', 'broll', 'zooms'] };
        case 'applyCaptions':
          throw new Error('Transcription API connection refused / timeout');
        case 'planMotionGraphics':
          return {
            summary: 'Emphasis stat graphic',
            decisions: [{ op: 'addGraphic', kind: 'callout', text: '10X GROWTH', startTime: 4.5, duration: 1.8, motion: 'pop' }]
          };
        case 'applyMotionGraphics':
          return j.stages.find(s => s.id === 'planMotionGraphics').output;
        case 'findBroll':
          return {
            summary: 'Tech office B-roll',
            assets: [sampleBrollAsset],
            decisions: [{ op: 'addClip', assetId: 'broll-asset-1', trackId: 'track-overlay', startTime: 6.0, duration: 3.0, volume: 0 }]
          };
        case 'applyBroll':
          return j.stages.find(s => s.id === 'findBroll').output;
        case 'applyZooms':
          return {
            summary: 'Subtle speaker punch zoom',
            decisions: [{ op: 'addZoom', clipId: 'podcast-clip', startTime: 2.0, endTime: 4.2, fromScale: 1.0, toScale: 1.15, returnToStart: true, easing: 'smooth' }]
          };
        case 'validateEdit':
          return pipeline.validateCompletedJob(proj, j);
        default:
          throw new Error(`Unexpected stage: ${stage}`);
      }
    });

    const result = await pipeline.runEditingJob(runtime, job, signal());

    assert.equal(result.status, 'completed', 'AI assistant must complete the job without stopping on captions failure');
    assert.ok(seen.includes('planMotionGraphics'), 'Must continue to planMotionGraphics');
    assert.ok(seen.includes('findBroll'), 'Must continue to findBroll');
    assert.ok(seen.includes('applyZooms'), 'Must continue to applyZooms');
    assert.ok(seen.includes('validateEdit'), 'Must reach validateEdit');

    const captionsNotice = result.degradationNotices?.find(n => n.stage === 'applyCaptions');
    assert.ok(captionsNotice, 'Must record degradation notice for applyCaptions');
    assert.equal(captionsNotice.status, 'skipped');

    const finalProject = runtime.getProject();
    assert.ok(Object.values(finalProject.clips).some(c => c.graphic), 'Motion graphics must be applied');
    assert.ok(Object.values(finalProject.clips).some(c => c.assetId === 'broll-asset-1'), 'B-roll clip must be applied');
    assert.equal(finalProject.clips['podcast-clip'].zooms?.length, 1, 'Zoom must be applied');

    const sourceClip = finalProject.clips['podcast-clip'];
    assert.equal(sourceClip.duration, userClipDuration, 'Original clip duration must remain untouched');
    assert.equal(sourceClip.sourceStart, 0, 'Original clip sourceStart must remain 0');
    assert.equal(sourceClip.sourceEnd, userClipDuration, 'Original clip sourceEnd must remain untouched');
    assert.equal(sourceClip.volume, 1, 'Original clip audio volume must remain 1');
  });

  test('Scenario 2: B-Roll search failure leaves/skips B-roll, continues to zooms, and completes', async () => {
    const project = createPodcastProject('test-broll-fail');
    const seen = [];
    const job = pipeline.createEditingJob(
      project,
      'Add captions, B-roll cutaways, and punch zooms.',
      [],
      pipeline.PIPELINE_PRESETS.find(p => p.id === 'mrbeast')
    );

    const runtime = makeRuntime(project, async (stage, proj, j) => {
      seen.push(stage);
      switch (stage) {
        case 'analyzeFootage':
          return { summary: '15.04s podcast video analyzed', operations: ['captions', 'broll', 'zooms'] };
        case 'applyCaptions':
          return sampleCaptionOutput;
        case 'findBroll':
          throw new Error('Stock footage provider returned 429 Too Many Requests');
        case 'applyBroll':
          return { summary: 'B-roll skipped', decisions: [], skipRationale: 'B-roll provider unavailable' };
        case 'applyZooms':
          return {
            summary: 'Emphasis punch zoom',
            decisions: [{ op: 'addZoom', clipId: 'podcast-clip', startTime: 3.0, endTime: 5.5, fromScale: 1.0, toScale: 1.18, returnToStart: true, easing: 'smooth' }]
          };
        case 'validateEdit':
          return pipeline.validateCompletedJob(proj, j);
        default:
          throw new Error(`Unexpected stage: ${stage}`);
      }
    });

    const result = await pipeline.runEditingJob(runtime, job, signal());
    assert.equal(result.status, 'completed', 'AI assistant must complete the job without stopping on B-roll failure');
    assert.ok(seen.includes('applyZooms'), 'Must continue to applyZooms after B-roll failure');
    assert.ok(result.degradationNotices?.some(n => n.stage === 'findBroll' || n.stage === 'applyBroll'), 'Must record B-roll degradation notice');

    const finalProject = runtime.getProject();
    assert.equal(Object.keys(finalProject.captions).length, 1, 'Captions must be applied');
    assert.equal(finalProject.clips['podcast-clip'].zooms?.length, 1, 'Zoom must be applied');
    assert.equal(finalProject.clips['podcast-clip'].duration, userClipDuration);
  });

  test('Scenario 3: Zoom stage error leaves/skips zooms, commits captions and completes', async () => {
    const project = createPodcastProject('test-zoom-fail');
    const seen = [];
    const job = pipeline.createEditingJob(
      project,
      'Add captions and zooms to highlight key points.',
      [],
      pipeline.PIPELINE_PRESETS.find(p => p.id === 'podcast-pro')
    );

    const runtime = makeRuntime(project, async (stage, proj, j) => {
      seen.push(stage);
      switch (stage) {
        case 'analyzeFootage':
          return { summary: '15.04s podcast footage', operations: ['captions', 'zooms'] };
        case 'applyCaptions':
          return sampleCaptionOutput;
        case 'applyZooms':
          throw new Error('Zoom computation failed: facial tracking bounding box lost');
        case 'validateEdit':
          return pipeline.validateCompletedJob(proj, j);
        default:
          throw new Error(`Unexpected stage: ${stage}`);
      }
    });

    const result = await pipeline.runEditingJob(runtime, job, signal());
    assert.equal(result.status, 'completed', 'Job must complete even when zooms fail');
    assert.ok(seen.includes('validateEdit'), 'Must continue to validateEdit');
    assert.ok(result.degradationNotices?.some(n => n.stage === 'applyZooms'), 'Must record zoom degradation notice');
    const finalProject = runtime.getProject();
    assert.equal(Object.keys(finalProject.captions).length, 1, 'Captions were successfully committed');
    assert.equal(finalProject.clips['podcast-clip'].duration, userClipDuration);
  });

  test('Scenario 4: Zoom stage validation failure degrades cleanly and keeps baseline timeline', async () => {
    const project = createPodcastProject('test-zoom-val-fail');
    const seen = [];
    const job = pipeline.createEditingJob(
      project,
      'Add captions and zooms to highlight key points.',
      [],
      pipeline.PIPELINE_PRESETS.find(p => p.id === 'podcast-pro')
    );

    const runtime = makeRuntime(project, async (stage, proj, j) => {
      seen.push(stage);
      switch (stage) {
        case 'analyzeFootage':
          return { summary: '15.04s podcast footage', operations: ['captions', 'zooms'] };
        case 'applyCaptions':
          return sampleCaptionOutput;
        case 'applyZooms':
          // Return invalid zoom beyond the clip duration (endTime: 25.0s on a 15.04s clip)
          return {
            summary: 'Invalid zoom outside clip',
            decisions: [{ op: 'addZoom', clipId: 'podcast-clip', startTime: 12.0, endTime: 25.0, fromScale: 1.0, toScale: 1.20 }]
          };
        case 'validateEdit':
          return pipeline.validateCompletedJob(proj, j);
        default:
          throw new Error(`Unexpected stage: ${stage}`);
      }
    });

    const result = await pipeline.runEditingJob(runtime, job, signal());
    assert.equal(result.status, 'completed', 'Job must complete even when zooms fail validation');
    assert.ok(seen.includes('validateEdit'), 'Must continue to validateEdit');
    assert.ok(result.degradationNotices?.some(n => n.stage === 'applyZooms'), 'Must record zoom degradation notice on validation error');
    const finalProject = runtime.getProject();
    assert.equal(Object.keys(finalProject.captions).length, 1, 'Captions were successfully committed');
    assert.equal(finalProject.clips['podcast-clip'].zooms?.length || 0, 0, 'Invalid zoom must be discarded, keeping baseline');
    assert.equal(finalProject.clips['podcast-clip'].duration, userClipDuration);
  });

  test('Scenario 5: Conversational edit (requestedEdits) tool failure skips step without aborting entire process', async () => {
    const project = createPodcastProject('test-conversational-fail');
    const seen = [];
    const job = pipeline.createEditingJob(
      project,
      'Apply dynamic podcast editing with audio sweetening and highlight zooms',
      []
    );
    assert.equal(job.presetId, undefined, 'Must be a conversational / custom edit');

    const runtime = makeRuntime(project, async (stage, proj, j) => {
      seen.push(stage);
      switch (stage) {
        case 'analyzeFootage':
          return { summary: 'Analyzed podcast clip', operations: ['requestedEdits'] };
        case 'applyRequestedEdits':
          throw new Error('LLM provider rate limit exceeded on requested edit tool');
        case 'validateEdit':
          return pipeline.validateCompletedJob(proj, j);
        default:
          throw new Error(`Unexpected stage: ${stage}`);
      }
    });

    const result = await pipeline.runEditingJob(runtime, job, signal());

    assert.equal(result.status, 'completed', 'Conversational edit must not crash/halt on stage failure');
    assert.ok(seen.includes('validateEdit'), 'Must proceed through to validateEdit');
    assert.ok(result.degradationNotices?.some(n => n.stage === 'applyRequestedEdits'), 'Must record degradation notice for applyRequestedEdits');
    const finalProject = runtime.getProject();
    assert.equal(finalProject.clips['podcast-clip'].duration, userClipDuration);
    assert.equal(finalProject.clips['podcast-clip'].volume, 1);
  });

  test('Scenario 6: Multiple step failures (Captions AND B-roll AND SFX) allows remaining step (Zooms) to complete', async () => {
    const project = createPodcastProject('test-multi-fail');
    const seen = [];
    const comboPreset = {
      id: 'custom-combo',
      name: 'All Stages Combo',
      instruction: 'Add captions, B-roll, zooms and sound effects.',
      operations: ['captions', 'broll', 'zooms', 'soundEffects'],
      captionTemplate: 'study-hormozi-style'
    };
    const job = pipeline.createEditingJob(project, comboPreset.instruction, [], comboPreset);

    const runtime = makeRuntime(project, async (stage, proj, j) => {
      seen.push(stage);
      switch (stage) {
        case 'analyzeFootage':
          return { summary: '15.04s footage', operations: ['captions', 'broll', 'zooms', 'soundEffects'] };
        case 'applyCaptions':
          throw new Error('Whisper speech transcription unavailable');
        case 'findBroll':
          throw new Error('Pexels API quota reached');
        case 'applyBroll':
          return { summary: 'B-roll skipped', decisions: [], skipRationale: 'Provider error' };
        case 'applyZooms':
          return {
            summary: 'Emphasis zoom at key moment',
            decisions: [{ op: 'addZoom', clipId: 'podcast-clip', startTime: 1.5, endTime: 4.0, fromScale: 1.0, toScale: 1.20, returnToStart: true, easing: 'smooth' }]
          };
        case 'applySoundEffects':
          throw new Error('SFX asset library file missing');
        case 'validateEdit':
          return pipeline.validateCompletedJob(proj, j);
        default:
          throw new Error(`Unexpected stage: ${stage}`);
      }
    });

    const result = await pipeline.runEditingJob(runtime, job, signal());

    assert.equal(result.status, 'completed', 'Job must complete despite multiple stage failures');
    assert.ok(seen.includes('applyZooms'), 'Must execute applyZooms');
    assert.ok(seen.includes('validateEdit'), 'Must execute validateEdit');
    assert.equal(result.failedStages.length, 0, 'No stages should be left marked failed');

    assert.ok(result.degradationNotices?.some(n => n.stage === 'applyCaptions'), 'Captions notice must exist');
    assert.ok(result.degradationNotices?.some(n => n.stage === 'findBroll' || n.stage === 'applyBroll'), 'B-roll notice must exist');
    assert.ok(result.degradationNotices?.some(n => n.stage === 'applySoundEffects'), 'SFX notice must exist');

    const finalProject = runtime.getProject();
    assert.equal(finalProject.clips['podcast-clip'].zooms?.length, 1, 'Zoom was applied to the timeline');
    assert.equal(finalProject.clips['podcast-clip'].duration, userClipDuration);
    assert.equal(finalProject.clips['podcast-clip'].volume, 1);
  });

  test('Scenario 7: When ALL editing stages fail, pipeline completes with degradations rather than crashing', async () => {
    const project = createPodcastProject('test-all-fail');
    const job = pipeline.createEditingJob(
      project,
      'Add captions and zooms',
      [],
      pipeline.PIPELINE_PRESETS.find(p => p.id === 'clean')
    );

    const runtime = makeRuntime(project, async (stage, proj, j) => {
      switch (stage) {
        case 'analyzeFootage':
          return { summary: 'Analyzed footage', operations: ['captions'] };
        case 'applyCaptions':
          throw new Error('All speech transcription services unavailable');
        case 'validateEdit':
          return pipeline.validateCompletedJob(proj, j);
        default:
          throw new Error(`Unexpected stage: ${stage}`);
      }
    });

    const result = await pipeline.runEditingJob(runtime, job, signal());

    assert.equal(result.status, 'completed', 'Pipeline must complete with degradation instead of unhandled crash');
    assert.ok(result.degradationNotices?.some(n => n.stage === 'applyCaptions'));
    assert.ok(result.skippedNotes && result.skippedNotes.length > 0);
    const finalProject = runtime.getProject();
    assert.equal(finalProject.clips['podcast-clip'].duration, userClipDuration);
  });

  test('Scenario 8: SequentialEditClient runs full store checkpointing on user clip with failed captions', async () => {
    const project = createPodcastProject('test-client-store');
    const store = new EditorStore(project);

    // Mock fetch for /api/editor/ai-edit and repository
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      if (typeof url === 'string' && url.includes('/api/editor/ai-edit')) {
        const body = JSON.parse(opts.body);
        if (body.pipelineStage === 'applyCaptions') {
          return new Response(JSON.stringify({ error: 'Speech provider offline' }), { status: 500 });
        }
        if (body.pipelineStage === 'applyZooms') {
          return new Response(JSON.stringify({
            summary: 'Applied zoom',
            list: {
              projectId: project.id,
              baseRevision: store.getSnapshot().revision,
              decisions: [{ op: 'addZoom', clipId: 'podcast-clip', startTime: 1.0, endTime: 3.5, fromScale: 1.0, toScale: 1.15, returnToStart: true, easing: 'smooth' }]
            },
            toolRequests: []
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };

    const mockRepo = {
      resolve: async () => userClipPath
    };

    try {
      const job = pipeline.createEditingJob(
        project,
        'Add captions and zooms',
        ['podcast-clip'],
        pipeline.PIPELINE_PRESETS.find(p => p.id === 'podcast-pro')
      );

      const result = await client.runSequentialEdit(
        store,
        mockRepo,
        'test-scope',
        job,
        signal(),
        'mock-auth-token'
      );
      assert.equal(result.status, 'completed', 'Client run must finish with completed status');
      const snap = store.getSnapshot();
      assert.ok(snap.clips['podcast-clip'], 'Original podcast clip must exist in store');
      assert.equal(snap.clips['podcast-clip'].duration, userClipDuration);
      assert.equal(snap.clips['podcast-clip'].zooms?.length, 1, 'Zoom must be committed to the store');
      assert.ok(snap.editingJob?.degradationNotices?.some(n => n.stage === 'applyCaptions'), 'Captions degradation notice must be recorded in store');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
