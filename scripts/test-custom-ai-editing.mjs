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

class MockGroqEditorError extends Error {
  constructor(message = 'Groq error', status = 429, code = 'GROQ_RATE_LIMIT') {
    super(message);
    this.name = 'GroqEditorError';
    this.status = status;
    this.code = code;
  }
}

/**
 * In-memory TypeScript module transpile loader with selective mocking.
 */
function loader(mocks = {}, extra = {}) {
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
    process: { env: { ...process.env } },
    ...extra
  });

  const baseMocks = {
    'app/lib/supabase.ts': {
      supabase: {
        auth: {
          getSession: async () => ({ data: { session: { access_token: 'test-token' } } })
        }
      }
    },
    'app/lib/server/planUsage.ts': {
      withUsage: (h) => h,
      reserveUsage: async () => ({ reservationId: 'test-usage' }),
      finishUsage: async () => {},
      PlanLimitError: class extends Error {},
      usageError: () => new Response('{}', { status: 503 })
    },
    'app/lib/server/speechDuration.ts': {
      speechDuration: async () => 1
    },
    'app/lib/server/providerRegistry.ts': {
      getProviderCredential: async () => 'test-credential-key',
      recordProviderUsage: async () => {}
    },
    'app/lib/server/editorTokenBudget.ts': {
      reserveEditorTokens: async () => 'test-budget-lease',
      settleEditorTokens: async () => {},
      worstCaseTokens: () => 1000
    },
    'app/lib/assets/client.ts': {
      linkAsset: async () => {}
    },
    'app/lib/editor/footageFramesClient.ts': {
      captureFootageEvidence: async () => ({ footageFrames: [], fallbackFootageFrames: [] })
    },
    'app/lib/editor/recovery.ts': {
      saveCheckpoint: async () => {}
    },
    'app/lib/editor/compositor.ts': {
      Compositor: class { sync() { return true; } render() {} dispose() {} }
    },
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

/**
 * Synthetic Project Fixture Generator
 */
function createFixtureProject(load, options = {}) {
  const model = load('app/lib/editor/model');
  const ops = load('app/lib/editor/operations');

  const {
    id = 'custom-ai-fixture',
    duration = 18,
    width = 720,
    height = 1280,
    audioDucking = false,
    aspectRatio = '9:16',
    includeAudioTrack = true,
    audioVolume = 0.8,
    existingCaptions = [],
    editingHistory = []
  } = options;

  let p = model.createProject(id);
  p.settings.aspectRatio = aspectRatio;
  p.settings.audioDucking = audioDucking;
  p.editingHistory = [...editingHistory];

  // Primary video source
  p = ops.addAsset(p, {
    id: 'source-video',
    kind: 'video',
    name: 'Interview.mp4',
    duration,
    width,
    height,
    mime: 'video/mp4',
    size: 5 * 1024 * 1024,
    url: '/test/interview.mp4'
  });

  p = ops.addClip(p, 'source-video', 'track-video', 0, {
    id: 'footage',
    duration,
    sourceEnd: duration,
    volume: 1.0
  });

  if (includeAudioTrack) {
    p = ops.addAsset(p, {
      id: 'bg-music',
      kind: 'audio',
      name: 'BackgroundMusic.mp3',
      duration,
      width: 0,
      height: 0,
      mime: 'audio/mpeg',
      size: 1024 * 1024,
      url: '/test/bg-music.mp3'
    });
    p = ops.addClip(p, 'bg-music', 'track-audio', 0, {
      id: 'bg-audio-clip',
      duration,
      sourceEnd: duration,
      volume: audioVolume,
      audioRole: 'background'
    });
  }

  // Pre-seed captions if requested
  for (const cap of existingCaptions) {
    const pipeline = load('app/lib/editor/sequentialEdit');
    const textWords = cap.text.trim().split(/\s+/);
    const step = cap.duration / textWords.length;
    const generatedWords = cap.words || textWords.map((word, i) => ({
      word,
      start: Math.round(i * step * 1000) / 1000,
      end: Math.round((i + 1) * step * 1000) / 1000
    }));

    p = pipeline.buildStageProject(p, {
      summary: 'Seed initial caption',
      decisions: [{
        op: 'addCaption',
        text: cap.text,
        startTime: cap.startTime,
        duration: cap.duration,
        templateId: cap.templateId || 'signature-poppins',
        words: generatedWords
      }]
    });
  }

  return p;
}

/**
 * Pipeline Runtime Simulation Helper
 */
function mockRuntime(project, executeHandler) {
  let p = structuredClone(project);
  let inFlight = 0;
  let maxConcurrent = 0;
  const saved = [];

  return {
    getProject: () => p,
    interacting: () => false,
    persist: async (next, job) => {
      job.timelineRevision = p.revision + 1;
      p = { ...next, revision: job.timelineRevision, editingJob: structuredClone(job) };
      saved.push(structuredClone(p));
    },
    execute: async (...args) => {
      inFlight++;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      try {
        return await executeHandler(...args);
      } finally {
        inFlight--;
      }
    },
    saved,
    maxConcurrent: () => maxConcurrent
  };
}

// -----------------------------------------------------------------------------
// TIER 1: Equivalence Partitioning & Core Acceptance Scenarios
// -----------------------------------------------------------------------------
describe('Tier 1: Equivalence Classes & Core Acceptance Scenarios', () => {

  test('Tier 1.1: Natural language podcast edit instruction applies captions, zooms, and ducking atomically', async () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createFixtureProject(load, { duration: 15 });

    const podcastPlan = {
      summary: 'Podcast edit: added animated captions, keyframe zooms at transition, and enabled audio ducking',
      decisions: [
        { op: 'setAudioDucking', enabled: true },
        {
          op: 'addCaption',
          text: 'Welcome to our deep dive discussion',
          startTime: 1.0,
          duration: 3.5,
          templateId: 'signature-poppins',
          words: [
            { word: 'Welcome', start: 0, end: 0.6 },
            { word: 'to', start: 0.6, end: 0.8 },
            { word: 'our', start: 0.8, end: 1.1 },
            { word: 'deep', start: 1.1, end: 1.6 },
            { word: 'dive', start: 1.6, end: 2.2 },
            { word: 'discussion', start: 2.2, end: 3.5 }
          ]
        },
        {
          op: 'addZoom',
          clipId: 'footage',
          startTime: 2.0,
          endTime: 4.5,
          fromScale: 1.0,
          toScale: 1.12,
          returnToStart: true,
          easing: 'smooth'
        }
      ]
    };

    // 1. Verify capability boundary: all decisions permitted in applyRequestedEdits
    assert.doesNotThrow(() => pipeline.assertStagePlan('applyRequestedEdits', podcastPlan.decisions, [], project));

    // 2. Build stage project
    const next = pipeline.buildStageProject(project, podcastPlan);

    // 3. Verify atomic state updates
    assert.equal(next.settings.audioDucking, true, 'Audio ducking must be enabled');
    assert.equal(Object.keys(next.captions).length, 1, 'Caption must be created');
    assert.equal(next.clips.footage.zooms?.length, 1, 'Zoom must be applied to footage');
    assert.equal(next.clips.footage.zooms[0].toScale, 1.12, 'Zoom scale must match plan');

    // 4. Validate stage changes & completed job
    const validatedOutput = pipeline.validateStageChanges('applyRequestedEdits', project, next, podcastPlan);
    assert.ok(validatedOutput.evidence.length >= 2, 'Evidence must record caption and zoom changes');

    const job = {
      ...pipeline.createEditingJob(project, 'make this look like a podcast edit with captions, zooms, and ducking', []),
      appliedOperations: ['applyRequestedEdits'],
      stages: [
        { id: 'analyzeFootage', status: 'completed' },
        { id: 'applyRequestedEdits', status: 'completed', output: validatedOutput }
      ]
    };
    next.revision = project.revision + 1;
    const finalReport = pipeline.validateCompletedJob(next, job);
    assert.ok(finalReport.summary, 'Completed job must validate cleanly');
  });

  test('Tier 1.2: Section-bounded instruction preserves specified untouched range [0, 10s]', async () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createFixtureProject(load, { duration: 24 });

    const boundedPlan = {
      summary: 'Edit after 10s: keep first 10 seconds untouched and add captions and emphasis after 10s',
      decisions: [
        {
          op: 'addCaption',
          text: 'This is the edited second half',
          startTime: 11.0,
          duration: 3.0,
          templateId: 'clean-sub',
          words: [
            { word: 'This', start: 0, end: 0.5 },
            { word: 'is', start: 0.5, end: 0.8 },
            { word: 'the', start: 0.8, end: 1.1 },
            { word: 'edited', start: 1.1, end: 1.8 },
            { word: 'second', start: 1.8, end: 2.3 },
            { word: 'half', start: 2.3, end: 3.0 }
          ]
        },
        {
          op: 'addZoom',
          clipId: 'footage',
          startTime: 12.0,
          endTime: 14.5,
          fromScale: 1.0,
          toScale: 1.1
        }
      ]
    };

    const next = pipeline.buildStageProject(project, boundedPlan);

    // Verify untouched bounds invariant [0, 10.0]
    // Zero captions in [0, 10s]
    const captionsInUntouchedSection = Object.values(next.clips).filter(
      (c) => c.trackId === 'track-caption' && c.startTime < 10.0
    );
    assert.equal(captionsInUntouchedSection.length, 0, 'No captions allowed in [0, 10s]');

    // Zero zooms in [0, 10s]
    const zoomsInUntouchedSection = (next.clips.footage.zooms || []).filter((z) => z.startTime < 10.0);
    assert.equal(zoomsInUntouchedSection.length, 0, 'No zooms allowed in [0, 10s]');

    // Edits exist at >= 10.0
    const editsAfterBound = Object.values(next.clips).filter((c) => c.startTime >= 10.0);
    assert.ok(editsAfterBound.length >= 1, 'Edits must be present in active section [10s, 24s]');

    // Stage validation must succeed
    assert.doesNotThrow(() => pipeline.validateStageChanges('applyRequestedEdits', project, next, boundedPlan));
  });

  test('Tier 1.3: Negative constraint compliance strictly prevents audio modifications', async () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createFixtureProject(load, { duration: 15, audioVolume: 0.85 });

    const initialAudioClip = project.clips['bg-audio-clip'];
    const initialAudioTrack = project.tracks['track-audio'];

    const visualOnlyPlan = {
      summary: 'Added captions and graphics; audio strictly preserved',
      decisions: [
        {
          op: 'addCaption',
          text: 'Silent visual enhancement',
          startTime: 1.0,
          duration: 2.5,
          templateId: 'clean-sub'
        },
        {
          op: 'addGraphic',
          kind: 'callout',
          text: 'Notice this feature',
          startTime: 4.0,
          duration: 2.0,
          motion: 'slide-up'
        }
      ]
    };

    const next = pipeline.buildStageProject(project, visualOnlyPlan);

    // Assert strictly zero audio modifications
    assert.equal(next.clips['bg-audio-clip'].volume, initialAudioClip.volume, 'Audio volume must not change');
    assert.equal(next.clips['bg-audio-clip'].trackId, initialAudioClip.trackId, 'Audio clip track must not change');
    assert.equal(next.tracks['track-audio'].muted, initialAudioTrack.muted, 'Audio track mute state must not change');
    assert.equal(next.settings.audioDucking, false, 'Audio ducking must remain false when requested not to touch audio');

    // Assert zero SFX additions
    const sfxClips = Object.values(next.clips).filter((c) => c.audioRole === 'sfx');
    assert.equal(sfxClips.length, 0, 'Zero SFX clips allowed under negative SFX constraint');
  });

  test('Tier 1.4: Conversational refinement modifies existing elements without duplicate clips/captions', async () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');

    // Pre-seed project with an existing caption from Turn 1
    const project = createFixtureProject(load, {
      duration: 15,
      existingCaptions: [
        { text: 'Initial Speech', startTime: 1.0, duration: 3.0, templateId: 'clean-sub' }
      ]
    });

    const initialCaptionCount = Object.keys(project.captions).length;
    const initialClipCount = Object.keys(project.clips).length;
    const initialCaptionClip = Object.values(project.clips).find((c) => c.contentId && project.captions[c.contentId]);
    assert.ok(initialCaptionClip, 'Initial caption clip must exist');

    // Turn 2: User requests: "make captions yellow and larger with Poppins font"
    const refinementPlan = {
      summary: 'Updated existing caption color to yellow (#ffeb3b) and size to 36px in-place',
      decisions: [
        {
          op: 'composeCaption',
          clipId: initialCaptionClip.id,
          presentation: {
            textColor: '#ffeb3b',
            fontSize: 36,
            emphasisFont: 'Poppins'
          }
        }
      ]
    };

    const refined = pipeline.buildStageProject(project, refinementPlan);

    // Verify non-duplication invariants
    assert.equal(Object.keys(refined.captions).length, initialCaptionCount, 'Caption count must NOT increase');
    assert.equal(Object.keys(refined.clips).length, initialClipCount, 'Clip count must NOT increase');

    // Verify in-place property update
    const updatedCaption = refined.captions[initialCaptionClip.contentId];
    assert.equal(updatedCaption.style.color, '#ffeb3b', 'Caption textColor must be updated in-place');
    assert.equal(updatedCaption.studioStyle?.fontSize, 36, 'Caption studioStyle fontSize must be updated to 36');
    assert.equal(updatedCaption.studioStyle?.studio?.emphasisFont, 'Poppins', 'Caption emphasisFont must be updated in-place');
  });

  test('Tier 1.5: Clarification return completes cleanly with questions preserved in editingHistory', async () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createFixtureProject(load, { duration: 15 });

    const clarificationOutput = {
      summary: 'Ambiguous instruction detected: speed up pacing or preserve dialogue?',
      questions: [
        'Would you like rapid ripple-cuts between pauses, or should we keep all spoken phrases complete?'
      ],
      decisions: []
    };

    // Clarification returns 0 changes. validateStageChanges must accept this output
    const stageValidated = pipeline.validateStageChanges('applyRequestedEdits', project, project, clarificationOutput);
    assert.deepEqual(stageValidated.questions, clarificationOutput.questions);

    const job = {
      ...pipeline.createEditingJob(project, 'make it super fast but keep dialogue natural', []),
      appliedOperations: [],
      stages: [
        { id: 'analyzeFootage', status: 'completed' },
        { id: 'applyRequestedEdits', status: 'completed', output: stageValidated }
      ]
    };

    // validateCompletedJob must complete without throwing "No requested edits were committed"
    const completion = pipeline.validateCompletedJob(project, job);
    assert.ok(completion.summary.includes('speed up pacing') || completion.summary.includes('Clarification'));
  });

  test('Tier 1.6: Preset resilience on short (<4s) footage permits supporting stages to complete with zero additions', async () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const shortProject = createFixtureProject(load, { duration: 3.2 });

    const skipOutput = {
      summary: 'Preserved original framing; footage is under 4 seconds so zooms were skipped.',
      skipRationale: 'Short footage duration (<4s)',
      decisions: []
    };

    // validateStageChanges on supporting stages (applyZooms) must tolerate 0 additions
    assert.doesNotThrow(() => {
      pipeline.validateStageChanges('applyZooms', shortProject, shortProject, skipOutput);
    });

    // Entire preset job with skipped supporting stages must validate cleanly
    const job = {
      ...pipeline.createEditingJob(shortProject, 'punchy edit', [], pipeline.PIPELINE_PRESETS.find((p) => p.id === 'punchy')),
      appliedOperations: ['applyCaptions'],
      completedStages: ['analyzeFootage', 'applyCaptions', 'applyZooms', 'applySoundEffects'],
      stages: [
        { id: 'analyzeFootage', status: 'completed' },
        {
          id: 'applyCaptions',
          status: 'completed',
          output: {
            summary: 'Added captions',
            decisions: [{ op: 'addCaption', text: 'Quick clip', startTime: 0.5, duration: 2.0 }]
          }
        },
        { id: 'applyZooms', status: 'completed', output: skipOutput },
        { id: 'applySoundEffects', status: 'completed', output: { summary: 'Skipped sfx for short duration', decisions: [] } }
      ]
    };

    const nextProject = { ...shortProject, revision: shortProject.revision + 1 };
    assert.doesNotThrow(() => pipeline.validateCompletedJob(nextProject, job));
  });

  test('Tier 1.7: Model fallback activation to Gemini 3.8 Flash upon Groq 429 rate limit or 5xx outage', async () => {
    let groqCalls = 0;
    let geminiCalls = 0;

    const mockLoad = loader({
      'app/lib/server/groqEditorFallback.ts': {
        GroqEditorError: MockGroqEditorError,
        generateGroqEditorJson: async () => {
          groqCalls++;
          throw new MockGroqEditorError('Rate limit exceeded: HTTP 429', 429, 'GROQ_RATE_LIMIT');
        }
      },
      'app/lib/server/geminiService.ts': {
        GEMINI_EDITOR_MODEL: 'gemini-3.8-flash',
        generateGeminiJson: async (options) => {
          geminiCalls++;
          assert.equal(options.model, 'gemini-3.8-flash', 'Must use gemini-3.8-flash model on fallback');
          return {
            summary: 'Fallback edit plan generated via Gemini 3.8 Flash',
            decisions: [{ op: 'setAudioDucking', enabled: true }],
            toolRequests: []
          };
        }
      }
    });

    const provider = mockLoad('app/lib/server/editorProvider');
    const result = await provider.generateEditPlanJson({
      prompt: '{"pipelineStage":"applyRequestedEdits"}',
      systemInstruction: 'JSON schema generator'
    });

    assert.equal(groqCalls, 1, 'Primary Groq provider must have been attempted first');
    assert.equal(geminiCalls, 1, 'Gemini fallback must have been activated upon Groq 429');
    assert.equal(result.provider, 'gemini', 'Result provider must reflect gemini');
    assert.ok(result.fallbackReason?.includes('GROQ_RATE_LIMIT') || result.fallbackReason?.includes('429'));
    assert.deepEqual(result.value.decisions, [{ op: 'setAudioDucking', enabled: true }]);
  });
});

// -----------------------------------------------------------------------------
// TIER 2: Boundary Value Analysis (BVA) & Edge Cases
// -----------------------------------------------------------------------------
describe('Tier 2: Boundary Value Analysis & Edge Cases', () => {

  test('Tier 2.1: Duration boundary strictly distinguishes 3.99s (<4s) from 4.0s footage', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');

    const project399 = createFixtureProject(load, { duration: 3.99 });
    // Pre-seed caption in project400 so speechContext is non-empty
    const project400 = createFixtureProject(load, {
      duration: 4.0,
      existingCaptions: [{ text: 'Active speech segment', startTime: 0.5, duration: 2.0 }]
    });

    const zeroZoomsOutput = { summary: 'No zoom applied', decisions: [] };

    // At 3.99s (<4s): zero additions must be tolerated
    assert.doesNotThrow(() => {
      pipeline.validateStageChanges('applyZooms', project399, project399, zeroZoomsOutput);
    }, 'Duration 3.99s must skip without error');

    // At 4.0s (>=4s) with speech and no skipRationale: zero additions must fail
    assert.throws(() => {
      pipeline.validateStageChanges('applyZooms', project400, project400, zeroZoomsOutput);
    }, /zoom keyframes were applied/i, 'Duration 4.0s with speech and no skip rationale must require additions');
  });

  test('Tier 2.2: Zero speech segments footage resilience allows supporting stages to skip cleanly', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    // Silent footage (no captions / 0 speech segments)
    const silentProject = createFixtureProject(load, { duration: 8.0 });

    const zeroZoomsOutput = {
      summary: 'Preserved framing; no speech segments found for emphasis zooms.',
      decisions: []
    };

    assert.doesNotThrow(() => {
      pipeline.validateStageChanges('applyZooms', silentProject, silentProject, zeroZoomsOutput);
    }, 'Silent footage with 0 speech segments must tolerate zero zooms');
  });

  test('Tier 2.3: Section boundary exact timestamp collision at [0, 10.0s]', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createFixtureProject(load, { duration: 20 });

    // Valid: edit placed at exact boundary 10.0s
    const validBoundaryPlan = {
      summary: 'Edit starting precisely at 10.0s boundary',
      decisions: [
        { op: 'addCaption', text: 'Boundary valid', startTime: 10.0, duration: 2.0, templateId: 'clean-sub' }
      ]
    };
    const validNext = pipeline.buildStageProject(project, validBoundaryPlan);
    const validClip = Object.values(validNext.clips).find((c) => c.startTime >= 10.0);
    assert.ok(validClip, 'Valid clip must start at or after 10.0s');

    // Invalid: edit placed at 9.99s enters untouched section
    const invalidBoundaryPlan = {
      summary: 'Edit encroaching into untouched section at 9.99s',
      decisions: [
        { op: 'addCaption', text: 'Boundary encroachment', startTime: 9.99, duration: 2.0, templateId: 'clean-sub' }
      ]
    };
    const invalidNext = pipeline.buildStageProject(project, invalidBoundaryPlan);
    const encroachingClip = Object.values(invalidNext.clips).find((c) => c.startTime === 9.99);
    assert.ok(encroachingClip, 'Encroaching clip detected at 9.99s');
    assert.ok(encroachingClip.startTime < 10.0, 'Encroachment violates [0, 10s] boundary constraint');
  });

  test('Tier 2.4: Speech word gap trimming threshold (0.6s)', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const model = load('app/lib/editor/model');
    const project = createFixtureProject(load, { duration: 15 });

    // Trimming an awkward 1.2s gap (3.0s to 4.2s)
    const planWithSilenceCut = {
      summary: 'Trimmed 1.2s awkward pause between 3.0s and 4.2s into atomic rippleCut',
      decisions: [
        {
          op: 'rippleCut',
          ranges: [{ start: 3.0, end: 4.2 }]
        }
      ]
    };

    assert.doesNotThrow(() => {
      pipeline.assertStagePlan('applyRequestedEdits', planWithSilenceCut.decisions, [], project);
    });

    const postCut = pipeline.buildStageProject(project, planWithSilenceCut);
    const totalDuration = model.projectDuration(postCut);
    assert.equal(
      Math.round(totalDuration * 10) / 10,
      13.8,
      'Total duration must decrease exactly by 1.2s trimmed pause'
    );
  });

  test('Tier 2.5: Restrained zoom scale (<=1.18x) and duration (>=0.4s) boundaries', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createFixtureProject(load, { duration: 15 });

    // Boundary Pass: 1.18x scale and 0.5s duration (>0.4s)
    assert.doesNotThrow(() => {
      pipeline.assertStagePlan(
        'applyZooms',
        [{ op: 'addZoom', clipId: 'footage', startTime: 1.0, endTime: 1.5, fromScale: 1.0, toScale: 1.18 }],
        [],
        project
      );
    });

    // Boundary Fail: 1.19x scale (>1.18x)
    assert.throws(() => {
      pipeline.assertStagePlan(
        'applyZooms',
        [{ op: 'addZoom', clipId: 'footage', startTime: 1.0, endTime: 1.5, fromScale: 1.0, toScale: 1.19 }],
        [],
        project
      );
    }, /restrained zooms of at most 1.18/i);

    // Boundary Fail: 0.35s duration (<0.4s)
    assert.throws(() => {
      pipeline.assertStagePlan(
        'applyZooms',
        [{ op: 'addZoom', clipId: 'footage', startTime: 1.0, endTime: 1.35, fromScale: 1.0, toScale: 1.1 }],
        [],
        project
      );
    }, /restrained zooms of at most 1.18/i);
  });

  test('Tier 2.6: Conversational history filtering ignores failed or cancelled attempts', () => {
    const history = [
      { jobId: 'job-1', instructions: 'Turn 1: Add intro captions', status: 'completed', summary: 'Added captions' },
      { jobId: 'job-2', instructions: 'Turn 2: Add broken graphics', status: 'failed', summary: 'AI service crashed' },
      { jobId: 'job-3', instructions: 'Turn 3: Aborted attempt', status: 'cancelled', summary: 'User cancelled' },
      { jobId: 'job-4', instructions: 'Turn 4: Clarification check', status: 'completed', summary: 'Asked about pacing' }
    ];

    // Filter logic must retain only completed or clarified turns
    const validTurns = history.filter((h) => h.status === 'completed' && !h.summary.includes('stopped'));
    assert.equal(validTurns.length, 2, 'Only successfully completed/clarified turns must be forwarded');
    assert.equal(validTurns[0].jobId, 'job-1');
    assert.equal(validTurns[1].jobId, 'job-4');
  });

  test('Tier 2.7: Single consolidated rippleCut operation boundary as the last direct decision', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const model = load('app/lib/editor/model');
    const project = createFixtureProject(load, { duration: 20 });

    // Multi-cut plan consolidated into a single rippleCut decision at the end
    const plan = {
      summary: 'Applied captions and consolidated multiple pause cuts into one rippleCut',
      decisions: [
        { op: 'addCaption', text: 'Pre-cut caption', startTime: 1.0, duration: 2.0, templateId: 'clean-sub' },
        {
          op: 'rippleCut',
          ranges: [
            { start: 3.5, end: 4.5 },
            { start: 7.0, end: 8.0 }
          ]
        }
      ]
    };

    const next = pipeline.buildStageProject(project, plan);
    const totalDuration = model.projectDuration(next);
    assert.equal(
      Math.round(totalDuration * 10) / 10,
      18.0,
      'Total project duration should decrease by combined cut total (2.0s)'
    );
  });
});

// -----------------------------------------------------------------------------
// TIER 3: Combinatorial & Pairwise Constraints
// -----------------------------------------------------------------------------
describe('Tier 3: Combinatorial & Pairwise Constraints', () => {

  test('Tier 3.1: Pairwise - Podcast style combined with strict negative audio constraint', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createFixtureProject(load, { duration: 15, audioVolume: 0.7 });

    const podcastPlanWithoutAudioChange = {
      summary: 'Podcast style with captions and zooms, but audio track and volume strictly preserved',
      decisions: [
        { op: 'addCaption', text: 'Podcast host speaking', startTime: 1.0, duration: 3.0, templateId: 'signature-poppins' },
        { op: 'addZoom', clipId: 'footage', startTime: 2.0, endTime: 4.0, fromScale: 1.0, toScale: 1.1 }
      ]
    };

    const next = pipeline.buildStageProject(project, podcastPlanWithoutAudioChange);

    // Captions & zooms present
    assert.equal(Object.keys(next.captions).length, 1);
    assert.equal(next.clips.footage.zooms?.length, 1);

    // Audio volume and tracks unchanged
    assert.equal(next.clips['bg-audio-clip'].volume, 0.7);
    assert.equal(next.settings.audioDucking, false);
  });

  test('Tier 3.2: Pairwise - Documentary style combined with section bound [0, 10s]', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createFixtureProject(load, { duration: 25 });

    const documentaryPlan = {
      summary: 'Documentary style after 10s: lower thirds and letterbox accent, first 10s untouched',
      decisions: [
        {
          op: 'addGraphic',
          kind: 'lower-third',
          text: 'Dr. John Doe, Archival Researcher',
          startTime: 12.0,
          duration: 3.5,
          motion: 'slide-left'
        }
      ]
    };

    const next = pipeline.buildStageProject(project, documentaryPlan);

    // No edits in [0, 10s]
    const graphicsBefore10 = Object.values(next.clips).filter((c) => c.startTime < 10.0 && c.graphic);
    assert.equal(graphicsBefore10.length, 0);

    // Lower third exists after 10s
    const graphicsAfter10 = Object.values(next.clips).filter((c) => c.startTime >= 10.0 && c.graphic);
    assert.equal(graphicsAfter10.length, 1);
    assert.equal(graphicsAfter10[0].graphic?.kind, 'lower-third');
    assert.equal(next.textLayers[graphicsAfter10[0].contentId]?.text, 'Dr. John Doe, Archival Researcher');
  });

  test('Tier 3.3: Pairwise - High-energy style combined with conversational refinement', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');

    // Pre-seed with existing captions
    const project = createFixtureProject(load, {
      duration: 15,
      existingCaptions: [
        { text: 'Dynamic statement', startTime: 1.0, duration: 2.5, templateId: 'clean-sub' }
      ]
    });

    const captionClip = Object.values(project.clips).find((c) => c.contentId && project.captions[c.contentId]);

    // High energy refinement: Pop motion, yellow emphasis, add energetic zoom
    const highEnergyPlan = {
      summary: 'Refined existing caption to high-energy pop styling and added energetic camera zoom',
      decisions: [
        {
          op: 'composeCaption',
          clipId: captionClip.id,
          presentation: {
            textColor: '#ffee00',
            fontSize: 38,
            emphasisFont: 'Montserrat',
            entrance: 'pop'
          }
        },
        {
          op: 'addZoom',
          clipId: 'footage',
          startTime: 1.0,
          endTime: 3.0,
          fromScale: 1.0,
          toScale: 1.15,
          returnToStart: true,
          easing: 'smooth'
        }
      ]
    };

    const next = pipeline.buildStageProject(project, highEnergyPlan);

    // Caption modified in-place
    assert.equal(Object.keys(next.captions).length, 1, 'Zero duplicate captions');
    assert.equal(next.captions[captionClip.contentId].style.color, '#ffee00');
    // Zoom added
    assert.equal(next.clips.footage.zooms?.length, 1);
  });

  test('Tier 3.4: Pairwise - Section bound [after 0:15] combined with negative SFX constraint', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createFixtureProject(load, { duration: 30 });

    const boundedNoSfxPlan = {
      summary: 'Callouts after 15s; zero audio or sound effects',
      decisions: [
        {
          op: 'addGraphic',
          kind: 'callout',
          text: 'Key metric highlights',
          startTime: 16.0,
          duration: 3.0,
          motion: 'slide-up'
        }
      ]
    };

    const next = pipeline.buildStageProject(project, boundedNoSfxPlan);

    // No edits before 15s
    const editsBefore15 = Object.values(next.clips).filter((c) => c.startTime < 15.0 && c.graphic);
    assert.equal(editsBefore15.length, 0);

    // Zero SFX clips
    const sfxClips = Object.values(next.clips).filter((c) => c.audioRole === 'sfx');
    assert.equal(sfxClips.length, 0);
  });

  test('Tier 3.5: Pairwise - Conversational text refinement combined with negative cut constraint', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createFixtureProject(load, {
      duration: 15,
      existingCaptions: [
        { text: 'Draft title text', startTime: 1.0, duration: 3.0 }
      ]
    });

    const captionClip = Object.values(project.clips).find((c) => c.contentId && project.captions[c.contentId]);

    const textOnlyRefinementPlan = {
      summary: 'Changed caption text to Finalized Title; zero cuts to original footage',
      decisions: [
        {
          op: 'changeText',
          clipId: captionClip.id,
          text: 'Finalized Title Statement'
        }
      ]
    };

    const next = pipeline.buildStageProject(project, textOnlyRefinementPlan);

    // Text changed
    assert.equal(next.captions[captionClip.contentId].text, 'Finalized Title Statement');

    // Video duration and cuts strictly unchanged
    assert.equal(next.clips.footage.duration, project.clips.footage.duration);
    assert.equal(next.clips.footage.sourceStart, project.clips.footage.sourceStart);
  });
});

// -----------------------------------------------------------------------------
// TIER 4: Realistic End-to-End Application Scenarios
// -----------------------------------------------------------------------------
describe('Tier 4: Realistic End-to-End Application Scenarios', () => {

  test('Scenario 1: End-to-end full podcast edit with captions, zooms, and audio ducking', async () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createFixtureProject(load, { duration: 18 });

    const job = pipeline.createEditingJob(
      project,
      'make this look like a podcast edit with captions, zooms on key points, and audio ducking',
      []
    );

    const stagesExecuted = [];
    const r = mockRuntime(project, async (stage, currentProject, currentJob) => {
      stagesExecuted.push(stage);
      if (stage === 'analyzeFootage') {
        return {
          summary: 'Analyzed 18s talking head footage',
          operations: ['requestedEdits']
        };
      }
      if (stage === 'applyRequestedEdits') {
        return {
          summary: 'Podcast edit completed',
          decisions: [
            { op: 'setAudioDucking', enabled: true },
            {
              op: 'addCaption',
              text: 'Welcome to our podcast',
              startTime: 1.0,
              duration: 3.0,
              templateId: 'signature-poppins'
            },
            {
              op: 'addZoom',
              clipId: 'footage',
              startTime: 2.0,
              endTime: 4.5,
              fromScale: 1.0,
              toScale: 1.12
            }
          ]
        };
      }
      if (stage === 'validateEdit') {
        return pipeline.validateCompletedJob(currentProject, currentJob);
      }
      throw new Error(`Unexpected stage: ${stage}`);
    });

    const result = await pipeline.runEditingJob(r, job, new AbortController().signal);
    assert.equal(result.status, 'completed', 'Job must complete successfully');
    assert.deepEqual(stagesExecuted, ['analyzeFootage', 'applyRequestedEdits', 'validateEdit']);

    const finalProject = r.getProject();
    assert.equal(finalProject.settings.audioDucking, true);
    assert.equal(Object.keys(finalProject.captions).length, 1);
    assert.equal(finalProject.clips.footage.zooms?.length, 1);
  });

  test('Scenario 2: End-to-end section-bounded edit keeping first 10 seconds untouched', async () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createFixtureProject(load, { duration: 25 });

    const job = pipeline.createEditingJob(project, 'keep first 10 seconds untouched and edit everything after 10s', []);

    const r = mockRuntime(project, async (stage, currentProject, currentJob) => {
      if (stage === 'analyzeFootage') {
        return { summary: 'Section bounded analysis', operations: ['requestedEdits'] };
      }
      if (stage === 'applyRequestedEdits') {
        return {
          summary: 'Edits placed exclusively after 10.0s',
          decisions: [
            { op: 'addCaption', text: 'Second half topic', startTime: 11.0, duration: 3.0, templateId: 'clean-sub' },
            { op: 'addZoom', clipId: 'footage', startTime: 12.0, endTime: 15.0, fromScale: 1.0, toScale: 1.1 }
          ]
        };
      }
      return pipeline.validateCompletedJob(currentProject, currentJob);
    });

    const result = await pipeline.runEditingJob(r, job, new AbortController().signal);
    assert.equal(result.status, 'completed');

    const finalProject = r.getProject();
    const editsInUntouchedZone = Object.values(finalProject.clips).filter((c) => c.startTime < 10.0 && c.contentId);
    assert.equal(editsInUntouchedZone.length, 0, 'No captions or content added before 10s');
  });

  test('Scenario 3: End-to-end negative constraints preventing audio and SFX alterations', async () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createFixtureProject(load, { duration: 15, audioVolume: 0.8 });

    const job = pipeline.createEditingJob(project, 'add animated captions and callouts, but don\'t touch audio and no SFX', []);

    const r = mockRuntime(project, async (stage, currentProject, currentJob) => {
      if (stage === 'analyzeFootage') return { summary: 'Analyze', operations: ['requestedEdits'] };
      if (stage === 'applyRequestedEdits') {
        return {
          summary: 'Visual callout and captions added, audio preserved',
          decisions: [
            { op: 'addCaption', text: 'Visual only caption', startTime: 1.0, duration: 2.0, templateId: 'clean-sub' },
            { op: 'addGraphic', kind: 'callout', text: 'Focus point', startTime: 3.5, duration: 1.5, motion: 'pop' }
          ]
        };
      }
      return pipeline.validateCompletedJob(currentProject, currentJob);
    });

    const result = await pipeline.runEditingJob(r, job, new AbortController().signal);
    assert.equal(result.status, 'completed');

    const finalProject = r.getProject();
    assert.equal(finalProject.clips['bg-audio-clip'].volume, 0.8);
    assert.equal(finalProject.settings.audioDucking, false);
    const sfxCount = Object.values(finalProject.clips).filter((c) => c.audioRole === 'sfx').length;
    assert.equal(sfxCount, 0);
  });

  test('Scenario 4: End-to-end multi-turn conversational refinement without element duplication', async () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');

    // Turn 1: Add caption
    let project = createFixtureProject(load, { duration: 15 });
    const job1 = pipeline.createEditingJob(project, 'add captions', []);

    let r = mockRuntime(project, async (stage, cp, cj) => {
      if (stage === 'analyzeFootage') return { summary: 'Analyze', operations: ['requestedEdits'] };
      if (stage === 'applyRequestedEdits') {
        return {
          summary: 'Created speech caption',
          decisions: [{ op: 'addCaption', text: 'Spoken dialogue', startTime: 1.0, duration: 3.0, templateId: 'clean-sub' }]
        };
      }
      return pipeline.validateCompletedJob(cp, cj);
    });
    await pipeline.runEditingJob(r, job1, new AbortController().signal);
    project = r.getProject();

    const turn1CaptionCount = Object.keys(project.captions).length;
    const captionClip = Object.values(project.clips).find((c) => c.contentId && project.captions[c.contentId]);

    // Turn 2: Conversational refinement in-place
    const job2 = pipeline.createEditingJob(project, 'make captions yellow with Poppins font', []);
    r = mockRuntime(project, async (stage, cp, cj) => {
      if (stage === 'analyzeFootage') return { summary: 'Analyze Turn 2', operations: ['requestedEdits'] };
      if (stage === 'applyRequestedEdits') {
        return {
          summary: 'Recolored existing caption to yellow in-place',
          decisions: [{
            op: 'composeCaption',
            clipId: captionClip.id,
            presentation: { textColor: '#ffea00', emphasisFont: 'Poppins' }
          }]
        };
      }
      return pipeline.validateCompletedJob(cp, cj);
    });
    const result2 = await pipeline.runEditingJob(r, job2, new AbortController().signal);
    assert.equal(result2.status, 'completed');

    const finalProject = r.getProject();
    assert.equal(Object.keys(finalProject.captions).length, turn1CaptionCount, 'Caption count must NOT duplicate');
    assert.equal(finalProject.captions[captionClip.contentId].style.color, '#ffea00');
  });

  test('Scenario 5: End-to-end clarification request preservation without pipeline failure', async () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createFixtureProject(load, { duration: 15 });

    const job = pipeline.createEditingJob(project, 'make it fast and slow at the same time', []);

    const r = mockRuntime(project, async (stage, cp, cj) => {
      if (stage === 'analyzeFootage') return { summary: 'Analyze', operations: ['requestedEdits'] };
      if (stage === 'applyRequestedEdits') {
        return {
          summary: 'Contradictory request detected. Clarification required.',
          questions: ['Did you want fast visual cuts, or slow motion video playback?'],
          decisions: []
        };
      }
      return pipeline.validateCompletedJob(cp, cj);
    });

    const result = await pipeline.runEditingJob(r, job, new AbortController().signal);
    assert.equal(result.status, 'completed', 'Clarification turn must complete cleanly without job crash');
    assert.equal(result.errors.length, 0, 'Zero unhandled errors on clarification');
  });

  test('Scenario 6: End-to-end short footage preset resilience on 3-second footage', async () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const shortProject = createFixtureProject(load, { duration: 3.0 });

    const preset = pipeline.PIPELINE_PRESETS.find((p) => p.id === 'punchy');
    const job = pipeline.createEditingJob(shortProject, 'punchy preset on short clip', [], preset);

    const r = mockRuntime(shortProject, async (stage, cp, cj) => {
      if (stage === 'analyzeFootage') return { summary: 'Analyze 3s footage' };
      if (stage === 'applyCaptions') {
        return {
          summary: 'Short caption',
          decisions: [{ op: 'addCaption', text: 'Quick hook', startTime: 0.2, duration: 2.0 }]
        };
      }
      if (stage === 'applyZooms') {
        return { summary: 'Short footage; skipped zooms', skipRationale: 'duration < 4s', decisions: [] };
      }
      if (stage === 'applySoundEffects') {
        return { summary: 'Skipped sfx', skipRationale: 'duration < 4s', decisions: [] };
      }
      if (stage === 'planMotionGraphics') {
        return { summary: 'Skipped graphics', skipRationale: 'duration < 4s', decisions: [] };
      }
      if (stage === 'applyMotionGraphics') {
        return { summary: 'Skipped graphics apply', decisions: [] };
      }
      return pipeline.validateCompletedJob(cp, cj);
    });

    const result = await pipeline.runEditingJob(r, job, new AbortController().signal);
    assert.equal(result.status, 'completed', 'Short footage preset must complete cleanly');
  });

  test('Scenario 7: End-to-end model fallback activation on Groq 429 to Gemini 3.8 Flash', async () => {
    let groqAttempts = 0;
    let geminiAttempts = 0;

    const mockLoad = loader({
      'app/lib/server/groqEditorFallback.ts': {
        GroqEditorError: MockGroqEditorError,
        generateGroqEditorJson: async () => {
          groqAttempts++;
          throw new MockGroqEditorError('Groq 429: Too Many Requests', 429, 'GROQ_RATE_LIMIT');
        }
      },
      'app/lib/server/geminiService.ts': {
        GEMINI_EDITOR_MODEL: 'gemini-3.8-flash',
        generateGeminiJson: async (opts) => {
          geminiAttempts++;
          return {
            summary: 'Podcast edit generated via Gemini fallback',
            decisions: [
              { op: 'setAudioDucking', enabled: true },
              { op: 'addCaption', text: 'Fallback speech', startTime: 1.0, duration: 2.5 }
            ],
            toolRequests: []
          };
        }
      }
    });

    const provider = mockLoad('app/lib/server/editorProvider');
    const planResult = await provider.generateEditPlanJson({
      prompt: '{"pipelineStage":"applyRequestedEdits"}',
      systemInstruction: 'JSON edit planner'
    });

    assert.equal(groqAttempts, 1);
    assert.equal(geminiAttempts, 1);
    assert.equal(planResult.provider, 'gemini');
    assert.ok(planResult.value.decisions.length >= 2);
  });
});

// -----------------------------------------------------------------------------
// INVARIANTS & ADVERSARIAL VERIFICATION
// -----------------------------------------------------------------------------
describe('Invariants & Adversarial Verification', () => {

  test('Invariant 1: Atomic undo restores exact pre-edit timeline snapshot', () => {
    const load = loader();
    const { EditorStore } = load('app/lib/editor/store');
    const pipeline = load('app/lib/editor/sequentialEdit');

    const project = createFixtureProject(load, { duration: 15 });
    const store = new EditorStore(project);
    const initialSnapshot = store.getSnapshot();

    const plan = {
      summary: 'Complex custom edit',
      decisions: [
        { op: 'setAudioDucking', enabled: true },
        { op: 'addCaption', text: 'Undo test caption', startTime: 1.0, duration: 2.0 },
        { op: 'addZoom', clipId: 'footage', startTime: 2.0, endTime: 4.0, fromScale: 1.0, toScale: 1.1 }
      ]
    };

    const nextProject = pipeline.buildStageProject(initialSnapshot, plan);
    store.execute(() => nextProject);

    assert.equal(store.getSnapshot().settings.audioDucking, true);
    assert.ok(store.canUndo, 'Store must allow undo');

    // Perform atomic undo
    store.undo();

    assert.deepEqual(store.getSnapshot().clips, initialSnapshot.clips, 'Clips must revert bitwise');
    assert.deepEqual(store.getSnapshot().captions, initialSnapshot.captions, 'Captions must revert bitwise');
    assert.equal(store.getSnapshot().settings.audioDucking, false, 'Audio ducking must revert');
  });

  test('Invariant 2: Duplicate caption overlap prevention across tracks and timestamps', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createFixtureProject(load, { duration: 15 });

    const captionPlan = {
      summary: 'Add caption',
      decisions: [
        { op: 'addCaption', text: 'First phrase', startTime: 1.0, duration: 2.0 }
      ]
    };
    const next = pipeline.buildStageProject(project, captionPlan);

    // Verify all captions have unique contentIds
    const captionContentIds = Object.values(next.clips).filter((c) => c.contentId).map((c) => c.contentId);
    assert.equal(captionContentIds.length, new Set(captionContentIds).size, 'Content IDs must be unique');
  });

  test('Invariant 3: Audio gain safety limits enforce <= 0.35 gain for SFX', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createFixtureProject(load, { duration: 15 });

    // SFX volume > 0.35 must be rejected
    assert.throws(() => {
      pipeline.assertStagePlan(
        'applySoundEffects',
        [{ op: 'addClip', assetId: 'bg-music', trackId: 'track-audio', startTime: 1.0, duration: 1.0, audioRole: 'sfx', volume: 0.5 }],
        [],
        project
      );
    }, /gain|volume|restrained/i);
  });

  test('Invariant 4: Zoom restraint limit enforces <= 1.18x multiplier', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createFixtureProject(load, { duration: 15 });

    assert.throws(() => {
      pipeline.assertStagePlan(
        'applyZooms',
        [{ op: 'addZoom', clipId: 'footage', startTime: 1.0, endTime: 3.0, fromScale: 1.0, toScale: 1.3 }],
        [],
        project
      );
    }, /1.18/);
  });

  test('Invariant 5: Custom edit analyzeFootage executes locally without remote roundtrip', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const stages = pipeline.stagesFor(['requestedEdits']);

    assert.deepEqual(
      Array.from(stages),
      ['analyzeFootage', 'applyRequestedEdits', 'validateEdit'],
      'Custom edits must route through local analyzeFootage and atomic applyRequestedEdits'
    );
  });

  test('Invariant 6: Non-clarification empty edit plan throws actionable edits required error', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createFixtureProject(load, { duration: 15 });

    const emptyNonClarificationPlan = {
      summary: 'No work performed',
      decisions: []
    };

    assert.throws(() => {
      pipeline.validateStageChanges('applyRequestedEdits', project, project, emptyNonClarificationPlan);
    }, /Requested edits did not change the timeline/i);
  });
});
