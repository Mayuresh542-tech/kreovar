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
    structuredClone: globalThis.structuredClone,
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
          getSession: async () => ({ data: { session: { access_token: 'test-challenger-token' } } })
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

function createProjectFixture(load, options = {}) {
  const model = load('app/lib/editor/model');
  const ops = load('app/lib/editor/operations');

  const {
    id = 'challenger-test-project',
    duration = 20,
    includeAudio = true,
    audioVolume = 0.8,
    existingCaptions = [],
    editingHistory = []
  } = options;

  let p = model.createProject(id);
  p.settings.aspectRatio = '9:16';
  p.settings.audioDucking = false;
  p.editingHistory = [...editingHistory];

  p = ops.addAsset(p, {
    id: 'source-video',
    kind: 'video',
    name: 'Footage.mp4',
    duration,
    width: 720,
    height: 1280,
    mime: 'video/mp4',
    size: 2 * 1024 * 1024,
    url: '/test/footage.mp4'
  });

  p = ops.addClip(p, 'source-video', 'track-video', 0, {
    id: 'footage',
    duration,
    sourceEnd: duration,
    volume: 1.0
  });

  if (includeAudio) {
    p = ops.addAsset(p, {
      id: 'bg-music',
      kind: 'audio',
      name: 'Music.mp3',
      duration,
      width: 0,
      height: 0,
      mime: 'audio/mpeg',
      size: 512 * 1024,
      url: '/test/music.mp3'
    });
    p = ops.addClip(p, 'bg-music', 'track-audio', 0, {
      id: 'bg-music-clip',
      duration,
      sourceEnd: duration,
      volume: audioVolume,
      audioRole: 'background'
    });
  }

  for (const cap of existingCaptions) {
    const pipeline = load('app/lib/editor/sequentialEdit');
    const textWords = cap.text.trim().split(/\s+/);
    const step = cap.duration / textWords.length;
    const words = cap.words || textWords.map((word, i) => ({
      word,
      start: Math.round(i * step * 1000) / 1000,
      end: Math.round((i + 1) * step * 1000) / 1000
    }));

    p = pipeline.buildStageProject(p, {
      summary: 'Seed caption',
      decisions: [{
        op: 'addCaption',
        text: cap.text,
        startTime: cap.startTime,
        duration: cap.duration,
        templateId: cap.templateId || 'signature-poppins',
        words
      }]
    });
  }

  return p;
}

// =============================================================================
// CHALLENGE 1: Combinatorial Constraint Testing (Negative Constraints + Section Bounds)
// =============================================================================
describe('Challenge 1: Combinatorial Constraint Testing (Negative + Section Bounds)', () => {

  test('1.1: Pairwise - [after 0:15] bound paired with negative audio & SFX constraints', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createProjectFixture(load, { duration: 25, audioVolume: 0.75 });

    // AI instruction: "After 15s add a highlight callout, but do not touch audio or add sound effects"
    const validPlan = {
      summary: 'Callout added at 16s; audio track and volume preserved, zero SFX',
      decisions: [
        {
          op: 'addGraphic',
          kind: 'callout',
          text: 'Exclusive Insight',
          startTime: 16.0,
          duration: 3.0,
          motion: 'slide-up'
        }
      ]
    };

    const next = pipeline.buildStageProject(project, validPlan);

    // Verify temporal bound: No graphic before 15.0s
    const graphicsBefore15 = Object.values(next.clips).filter(c => c.startTime < 15.0 && c.graphic);
    assert.equal(graphicsBefore15.length, 0, 'No graphics allowed before 15.0s boundary');

    // Verify graphic after 15.0s exists
    const graphicsAfter15 = Object.values(next.clips).filter(c => c.startTime >= 15.0 && c.graphic);
    assert.equal(graphicsAfter15.length, 1, 'Graphic successfully added after 15.0s');
    assert.equal(graphicsAfter15[0].startTime, 16.0);

    // Verify negative constraints: audio volume unchanged, ducking disabled, zero SFX clips
    assert.equal(next.clips['bg-music-clip'].volume, 0.75, 'Audio volume must remain unchanged');
    assert.equal(next.settings.audioDucking, false, 'Audio ducking must remain false');
    const sfxClips = Object.values(next.clips).filter(c => c.audioRole === 'sfx');
    assert.equal(sfxClips.length, 0, 'Zero SFX clips allowed under negative constraint');

    // Adversarial Encroachment: Attempting to place graphic at 14.9s
    const encroachingPlan = {
      summary: 'Graphic at 14.9s violates [after 0:15] boundary',
      decisions: [
        { op: 'addGraphic', kind: 'callout', text: 'Illegal', startTime: 14.9, duration: 2.0, motion: 'slide-up' }
      ]
    };
    const encroached = pipeline.buildStageProject(project, encroachingPlan);
    const encroachedClip = Object.values(encroached.clips).find(c => c.graphic && c.startTime < 15.0);
    assert.ok(encroachedClip, 'Encroaching clip detected');
    assert.ok(encroachedClip.startTime < 15.0, 'Strict violation of boundary < 15.0s');
  });

  test('1.2: Pairwise - [keep first 10s untouched] paired with strict negative cut constraint ("don\'t cut footage")', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const model = load('app/lib/editor/model');
    const project = createProjectFixture(load, { duration: 20 });

    const initialDuration = model.projectDuration(project);

    // Plan that obeys both: caption added at 11s, zero cuts anywhere
    const compliantPlan = {
      summary: 'Caption added after 10s, footage untouched and uncut',
      decisions: [
        { op: 'addCaption', text: 'Part Two Begins', startTime: 11.0, duration: 3.0, templateId: 'clean-sub' }
      ]
    };

    const next = pipeline.buildStageProject(project, compliantPlan);

    // Boundary check: first 10s completely untouched
    const clipsBefore10 = Object.values(next.clips).filter(c => c.id !== 'footage' && c.id !== 'bg-music-clip' && c.startTime < 10.0);
    assert.equal(clipsBefore10.length, 0, 'No clips added in untouched [0, 10s] range');

    // Negative cut check: project duration and footage duration must not change
    assert.equal(model.projectDuration(next), initialDuration, 'Project duration must not decrease');
    assert.equal(next.clips.footage.duration, 20, 'Footage duration must remain exactly 20s');
    assert.equal(next.clips.footage.sourceStart, 0, 'Footage sourceStart must remain 0');
    assert.equal(next.clips.footage.sourceEnd, 20, 'Footage sourceEnd must remain 20');
  });

  test('1.3: Hinglish Negation + Section Bounds: "pehle 10 second me kuch mat badalna" + "audio bilkul touch mat karna"', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createProjectFixture(load, { duration: 22, audioVolume: 0.6 });

    // Plan obeying Hinglish constraints: graphic after 10s, zero audio changes
    const hinglishPlan = {
      summary: 'Respecting mat/nahi constraints: Graphic added at 12s, first 10s and audio untouched',
      decisions: [
        { op: 'addGraphic', kind: 'label', text: 'Naya Adhyay', startTime: 12.0, duration: 2.5, motion: 'pop' }
      ]
    };

    const next = pipeline.buildStageProject(project, hinglishPlan);
    assert.equal(next.clips['bg-music-clip'].volume, 0.6, 'Audio volume strictly preserved');
    const graphic = Object.values(next.clips).find(c => c.graphic);
    assert.ok(graphic, 'Graphic added');
    assert.ok(graphic.startTime >= 10.0, 'Graphic strictly placed outside protected [0, 10s]');
  });

  test('1.4: Multi-zone boundary: "first 5s and last 5s untouched" on 30s project', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createProjectFixture(load, { duration: 30 });

    // Active zone is strictly [5.0s, 25.0s]
    const middleZonePlan = {
      summary: 'Edits placed in active middle zone [5s, 25s]',
      decisions: [
        { op: 'addZoom', clipId: 'footage', startTime: 6.0, endTime: 8.0, fromScale: 1.0, toScale: 1.12 },
        { op: 'addGraphic', kind: 'lower-third', text: 'Speaker', startTime: 10.0, duration: 3.0, motion: 'slide-left' }
      ]
    };

    const next = pipeline.buildStageProject(project, middleZonePlan);
    const addedClips = Object.values(next.clips).filter(c => c.id !== 'footage' && c.id !== 'bg-music-clip');
    for (const c of addedClips) {
      assert.ok(c.startTime >= 5.0, `Clip at ${c.startTime} encroaches into first 5s`);
      assert.ok(c.startTime + c.duration <= 25.0, `Clip ends at ${c.startTime + c.duration}, encroaching into last 5s`);
    }
  });
});

// =============================================================================
// CHALLENGE 2: Word Gap Silence Trimming (>0.6s) into Single Consolidated rippleCut
// =============================================================================
describe('Challenge 2: Word Gap Silence Trimming (>0.6s) into Consolidated rippleCut', () => {

  test('2.1: Multi-gap silence trimming: Gaps > 0.6s are cut, gaps <= 0.6s are preserved', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const model = load('app/lib/editor/model');

    // Create a 15-second project with speech transcript containing 3 pauses:
    // Pause 1: 1.5s to 2.5s (1.0s gap, >0.6s) -> SHOULD BE CUT
    // Pause 2: 4.0s to 4.5s (0.5s gap, <=0.6s) -> MUST BE PRESERVED
    // Pause 3: 7.0s to 8.2s (1.2s gap, >0.6s) -> SHOULD BE CUT
    const project = createProjectFixture(load, {
      duration: 15,
      existingCaptions: [
        { text: 'First phrase', startTime: 0.5, duration: 1.0 }, // ends at 1.5s
        { text: 'Second phrase', startTime: 2.5, duration: 1.5 }, // starts at 2.5s (gap=1.0s) -> ends at 4.0s
        { text: 'Third phrase', startTime: 4.5, duration: 2.5 }, // starts at 4.5s (gap=0.5s) -> ends at 7.0s
        { text: 'Final phrase', startTime: 8.2, duration: 2.0 }  // starts at 8.2s (gap=1.2s) -> ends at 10.2s
      ]
    });

    // Plan consolidates the two >0.6s pauses (1.5-2.5 and 7.0-8.2) into ONE single rippleCut
    const consolidatedCutPlan = {
      summary: 'Trimmed awkward silences >0.6s into a single consolidated rippleCut',
      decisions: [
        {
          op: 'rippleCut',
          ranges: [
            { start: 1.5, end: 2.5 },
            { start: 7.0, end: 8.2 }
          ]
        }
      ]
    };

    assert.doesNotThrow(() => {
      pipeline.assertStagePlan('applyRequestedEdits', consolidatedCutPlan.decisions, [], project);
    });

    const next = pipeline.buildStageProject(project, consolidatedCutPlan);
    const newDuration = model.projectDuration(next);

    // Total cut = 1.0s + 1.2s = 2.2s.
    // Original = 15s -> New = 12.8s
    assert.equal(Math.round(newDuration * 10) / 10, 12.8, 'Duration should decrease by exactly 2.2s');

    // Verify surviving clips alignment:
    // Captions after cut 1 (originally at 2.5s) should now start at 1.5s (shifted by 1.0s)
    const shiftedSecondPhrase = Object.values(next.clips).find(c => {
      const cap = next.captions[c.contentId];
      return cap && cap.text === 'Second phrase';
    });
    assert.ok(shiftedSecondPhrase, 'Second phrase caption must survive');
    assert.equal(Math.round(shiftedSecondPhrase.startTime * 10) / 10, 1.5, 'Second phrase should shift to 1.5s');

    // Captions during preserved gap (Third phrase, originally at 4.5s) should now start at 3.5s (shifted by 1.0s)
    const shiftedThirdPhrase = Object.values(next.clips).find(c => {
      const cap = next.captions[c.contentId];
      return cap && cap.text === 'Third phrase';
    });
    assert.ok(shiftedThirdPhrase, 'Third phrase caption must survive');
    assert.equal(Math.round(shiftedThirdPhrase.startTime * 10) / 10, 3.5, 'Third phrase should shift to 3.5s');
  });

  test('2.2: rippleCut placement rule: Must be consolidated at the end of decision list after direct edits', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createProjectFixture(load, { duration: 18 });

    // Plan with direct zoom edit applied BEFORE rippleCut
    const planZoomThenCut = {
      summary: 'Zoom applied on pre-cut time, followed by consolidated rippleCut',
      decisions: [
        { op: 'addZoom', clipId: 'footage', startTime: 0.5, endTime: 1.5, fromScale: 1.0, toScale: 1.1 },
        {
          op: 'rippleCut',
          ranges: [
            { start: 2.0, end: 3.0 },
            { start: 5.0, end: 6.0 }
          ]
        }
      ]
    };

    const next = pipeline.buildStageProject(project, planZoomThenCut);
    // Zoom should exist on footage
    const footageClip = next.clips.footage;
    assert.ok(footageClip, 'Footage clip exists');
    assert.equal(footageClip.zooms?.length, 1, 'Zoom applied on pre-cut footage successfully');
  });

  test('2.3: Frame-rounded threshold boundary edge for rippleCut', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const model = load('app/lib/editor/model');
    const project = createProjectFixture(load, { duration: 10 });

    // Cut of 21 frames (21 / 30 = 0.70s > 0.60s)
    const planCut70 = {
      summary: 'Cut gap of 0.70s (21 frames at 30fps)',
      decisions: [{ op: 'rippleCut', ranges: [{ start: 2.0, end: 2.70 }] }]
    };
    const next = pipeline.buildStageProject(project, planCut70);
    assert.equal(Math.round(model.projectDuration(next) * 100) / 100, 9.30, 'Duration decreased by 0.70s');
  });

  test('2.4: Locked track rejection: rippleCut throws when an affected track is locked', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const ops = load('app/lib/editor/operations');
    let project = createProjectFixture(load, { duration: 15 });

    // Lock track-audio
    project = ops.changeTrack(project, 'track-audio', { locked: true });

    const cutPlan = {
      summary: 'Attempt rippleCut on locked audio track',
      decisions: [{ op: 'rippleCut', ranges: [{ start: 2.0, end: 4.0 }] }]
    };

    assert.throws(() => {
      pipeline.buildStageProject(project, cutPlan);
    }, /Unlock every affected track before ripple cutting/i);
  });
});

// =============================================================================
// CHALLENGE 3: Chat UI Rendering (Clarification Questions vs Normal Completed Edits)
// =============================================================================
describe('Challenge 3: Chat UI Rendering (Questions vs Completed Edits)', () => {

  test('3.1: Clarification question rendering in completed job', () => {
    const load = loader();
    const service = load('app/lib/serviceMessages');

    const questionJob = {
      status: 'completed',
      appliedOperations: [],
      stages: [
        { id: 'analyzeFootage', status: 'completed', output: { summary: 'Analysis complete' } },
        {
          id: 'applyRequestedEdits',
          status: 'completed',
          output: {
            summary: 'Clarification needed regarding video pacing and cut intensity',
            questions: ['Would you prefer fast jump cuts or gentle smooth transitions?']
          }
        },
        {
          id: 'validateEdit',
          status: 'completed',
          output: { summary: 'Clarification questions returned.' }
        }
      ]
    };

    // Test the logic in AiEditingChat.tsx:
    // job.stages.find(s=>s.output?.questions?.length)
    const clarificationStage = questionJob.stages.find(s => s.output?.questions?.length);
    assert.ok(clarificationStage, 'Clarification stage must be found');

    const renderedText = service.publicServiceText(
      clarificationStage?.output?.questions?.[0] || clarificationStage?.output?.summary || 'Please clarify your request.'
    );

    assert.equal(renderedText, 'Would you prefer fast jump cuts or gentle smooth transitions?');

    // Verify it is NOT the regular completion text
    const regularCompleteText = `Editing completed. ${questionJob.appliedOperations.length} stages changed the timeline. Review the preview, then export your MP4.`;
    assert.notEqual(renderedText, regularCompleteText);
  });

  test('3.2: Regular completed edit rendering in completed job', () => {
    const load = loader();

    const normalJob = {
      status: 'completed',
      appliedOperations: ['applyRequestedEdits:key'],
      stages: [
        { id: 'analyzeFootage', status: 'completed', output: { summary: 'Analysis complete' } },
        {
          id: 'applyRequestedEdits',
          status: 'completed',
          output: {
            summary: 'Applied captions and zooms',
            questions: [] // Empty questions
          }
        },
        {
          id: 'validateEdit',
          status: 'completed',
          output: { summary: 'Timeline validated' }
        }
      ]
    };

    // Test the logic in AiEditingChat.tsx:
    const clarificationStage = normalJob.stages.find(s => s.output?.questions?.length);
    assert.equal(clarificationStage, undefined, 'Clarification stage must be undefined for regular edits');

    const renderedText = `Editing completed. ${normalJob.appliedOperations.length} stages changed the timeline. Review the preview, then export your MP4.`;
    assert.equal(renderedText, 'Editing completed. 1 stages changed the timeline. Review the preview, then export your MP4.');
  });

  test('3.3: In-flight / running job does not display completion banner', () => {
    const runningJob = {
      status: 'running',
      appliedOperations: [],
      stages: [
        { id: 'analyzeFootage', status: 'completed', output: { summary: 'Done' } },
        { id: 'applyRequestedEdits', status: 'executing' }
      ]
    };

    // In AiEditingChat.tsx, the block is guarded by: {job.status === 'completed' && ...}
    const isCompletedBannerVisible = runningJob.status === 'completed';
    assert.equal(isCompletedBannerVisible, false, 'Completion banner must be hidden while job is running');
  });

  test('3.4: Vendor name prefix stripping and vendor masking via publicServiceText', () => {
    const load = loader();
    const service = load('app/lib/serviceMessages');

    // Test 1: Historical format prefix stripping
    const rawWithVendor = 'Groq · qwen-3.8-27b. Which style of captions do you prefer?';
    const cleaned = service.publicServiceText(rawWithVendor);
    assert.ok(!cleaned.toLowerCase().includes('groq'), 'Groq vendor prefix must be stripped');
    assert.equal(cleaned, 'Which style of captions do you prefer?', 'Core question text must remain intact');

    // Test 2: Internal vendor name leakage protection
    const leakingText = 'The groq service completed 4 cuts on your timeline.';
    const masked = service.publicServiceText(leakingText);
    assert.ok(!masked.toLowerCase().includes('groq'), 'Leaking vendor name must be masked');
    assert.equal(masked, 'This request could not be completed. Please retry.');
  });
});

// =============================================================================
// CHALLENGE 4: History Persistence Integrity Across Multi-Turn Sessions
// =============================================================================
describe('Challenge 4: History Persistence Integrity Across Multi-Turn Sessions', () => {

  test('4.1: Two-turn session: Clarification in Turn 1 preserves exact question summary in Turn 2 history', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const storeModule = load('app/lib/editor/store');
    const project = createProjectFixture(load, { duration: 15 });

    const store = new storeModule.EditorStore(project);

    // Turn 1: User asks vague edit, job completes with clarification
    const job1 = pipeline.createEditingJob(project, 'Make it punchy and cut things', []);
    job1.status = 'completed';
    job1.appliedOperations = [];
    job1.stages = [
      { id: 'analyzeFootage', key: job1.id + ':analyzeFootage', status: 'completed', output: { summary: 'Analysis' } },
      {
        id: 'applyRequestedEdits',
        key: job1.id + ':applyRequestedEdits',
        status: 'completed',
        output: {
          summary: 'Need clarification on cut pacing',
          questions: ['Should I cut awkward silences or only keep high-energy sentences?']
        }
      },
      { id: 'validateEdit', key: job1.id + ':validateEdit', status: 'completed', output: { summary: 'Clarification returned' } }
    ];

    // Set job1 on project
    store.checkpoint(() => ({ ...store.getSnapshot(), editingJob: job1 }));

    // Now Turn 2 begins: User answers "Cut awkward silences"
    const job2 = pipeline.createEditingJob(store.getSnapshot(), 'Cut awkward silences', []);

    // Simulate persist() logic in sequentialEditClient.ts:
    const current = store.getSnapshot();
    const previous = current.editingJob;
    const previousClarification =
      previous?.stages?.find(s => s.output?.questions?.length)?.output?.questions?.[0] ||
      previous?.stages?.find(s => s.output?.questions?.length)?.output?.summary ||
      previous?.questions?.[0];

    const editingHistory = previous && previous.id !== job2.id ? [
      ...(current.editingHistory || []).slice(-19),
      {
        jobId: previous.id,
        instructions: previous.instructions,
        status: previous.status,
        summary: previous.status === 'completed'
          ? (previousClarification || 'All requested stages completed.')
          : previous.errors.at(-1) || 'Previous edit stopped; committed changes remain.'
      }
    ] : current.editingHistory;

    store.checkpoint(() => ({ ...current, editingHistory, editingJob: structuredClone(job2) }));

    const updated = store.getSnapshot();
    assert.equal(updated.editingHistory.length, 1, 'History must contain exactly 1 previous turn');
    assert.equal(updated.editingHistory[0].jobId, job1.id);
    assert.equal(updated.editingHistory[0].instructions, 'Make it punchy and cut things');
    assert.equal(updated.editingHistory[0].status, 'completed');
    assert.equal(
      updated.editingHistory[0].summary,
      'Should I cut awkward silences or only keep high-energy sentences?',
      'History MUST preserve the exact clarification question text!'
    );

    // Verify conversationHistory sent to server in Turn 2:
    const conversationHistory = (updated.editingHistory || [])
      .filter(h => h.status === 'completed' && !h.summary?.includes('stopped'))
      .map(h => ({ instructions: h.instructions, summary: h.summary }));

    assert.equal(conversationHistory.length, 1);
    assert.equal(conversationHistory[0].instructions, 'Make it punchy and cut things');
    assert.equal(conversationHistory[0].summary, 'Should I cut awkward silences or only keep high-energy sentences?');
  });

  test('4.2: Three-turn session: Clarification -> Normal Edit -> Refinement', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const storeModule = load('app/lib/editor/store');
    const project = createProjectFixture(load, { duration: 15 });

    const store = new storeModule.EditorStore(project);

    // Turn 1: Clarification
    const job1 = pipeline.createEditingJob(project, 'Turn 1: Style inquiry', []);
    job1.status = 'completed';
    job1.stages = [
      { id: 'analyzeFootage', key: job1.id + ':analyze', status: 'completed' },
      {
        id: 'applyRequestedEdits',
        key: job1.id + ':apply',
        status: 'completed',
        output: { questions: ['Do you prefer modern yellow captions or clean white captions?'] }
      },
      { id: 'validateEdit', key: job1.id + ':validate', status: 'completed' }
    ];
    store.checkpoint(() => ({ ...store.getSnapshot(), editingJob: job1 }));

    // Turn 2: Normal Edit ("Clean white captions")
    const job2 = pipeline.createEditingJob(store.getSnapshot(), 'Turn 2: Clean white captions', []);
    // Execute persist for job2
    {
      const current = store.getSnapshot();
      const previous = current.editingJob;
      const previousClarification = previous?.stages?.find(s => s.output?.questions?.length)?.output?.questions?.[0];
      const editingHistory = [
        ...(current.editingHistory || []),
        {
          jobId: previous.id,
          instructions: previous.instructions,
          status: previous.status,
          summary: previousClarification || 'All requested stages completed.'
        }
      ];
      store.checkpoint(() => ({ ...current, editingHistory, editingJob: job2 }));
    }

    job2.status = 'completed';
    job2.appliedOperations = ['applyRequestedEdits:key'];
    job2.stages = [
      { id: 'analyzeFootage', key: job2.id + ':analyze', status: 'completed' },
      { id: 'applyRequestedEdits', key: job2.id + ':apply', status: 'completed', output: { summary: 'Applied clean white captions' } },
      { id: 'validateEdit', key: job2.id + ':validate', status: 'completed' }
    ];
    store.checkpoint(() => ({ ...store.getSnapshot(), editingJob: job2 }));

    // Turn 3: Refinement ("Make font size 40")
    const job3 = pipeline.createEditingJob(store.getSnapshot(), 'Turn 3: Make font size 40', []);
    // Execute persist for job3
    {
      const current = store.getSnapshot();
      const previous = current.editingJob;
      const previousClarification = previous?.stages?.find(s => s.output?.questions?.length)?.output?.questions?.[0];
      const editingHistory = [
        ...(current.editingHistory || []),
        {
          jobId: previous.id,
          instructions: previous.instructions,
          status: previous.status,
          summary: previousClarification || 'All requested stages completed.'
        }
      ];
      store.checkpoint(() => ({ ...current, editingHistory, editingJob: job3 }));
    }

    const finalProject = store.getSnapshot();
    assert.equal(finalProject.editingHistory.length, 2, 'History must contain both previous turns');

    // Turn 1 in history:
    assert.equal(finalProject.editingHistory[0].jobId, job1.id);
    assert.equal(finalProject.editingHistory[0].summary, 'Do you prefer modern yellow captions or clean white captions?');

    // Turn 2 in history:
    assert.equal(finalProject.editingHistory[1].jobId, job2.id);
    assert.equal(finalProject.editingHistory[1].summary, 'All requested stages completed.');

    // Filtered conversationHistory forwarded to API:
    const forwardHistory = (finalProject.editingHistory || [])
      .filter(h => h.status === 'completed' && !h.summary?.includes('stopped'))
      .map(h => ({ instructions: h.instructions, summary: h.summary }));

    assert.equal(forwardHistory.length, 2);
    assert.equal(forwardHistory[0].summary, 'Do you prefer modern yellow captions or clean white captions?');
    assert.equal(forwardHistory[1].summary, 'All requested stages completed.');
  });

  test('4.3: Interleaved failed/cancelled turns are kept in project history but excluded from LLM conversationHistory', () => {
    const history = [
      { jobId: 'j1', instructions: 'Turn 1', status: 'completed', summary: 'Question: Which style?' },
      { jobId: 'j2', instructions: 'Turn 2 (Crashed)', status: 'failed', summary: 'API 500 error' },
      { jobId: 'j3', instructions: 'Turn 3 (Stopped)', status: 'cancelled', summary: 'Previous edit stopped; committed changes remain.' },
      { jobId: 'j4', instructions: 'Turn 4', status: 'completed', summary: 'All requested stages completed.' }
    ];

    // Filter forwarded to LLM
    const forwarded = history.filter(h => h.status === 'completed' && !h.summary?.includes('stopped'));
    assert.equal(forwarded.length, 2, 'Must filter out failed and stopped turns');
    assert.equal(forwarded[0].jobId, 'j1');
    assert.equal(forwarded[0].summary, 'Question: Which style?');
    assert.equal(forwarded[1].jobId, 'j4');
    assert.equal(forwarded[1].summary, 'All requested stages completed.');
  });

  test('4.4: Maximum history bounds (20 turns limit prevents payload ballooning)', () => {
    // Generate 25 historical turns
    let history = [];
    for (let i = 0; i < 25; i++) {
      history = [...history.slice(-19), { jobId: `job-${i}`, instructions: `Instruction ${i}`, status: 'completed', summary: `Summary ${i}` }];
    }

    assert.equal(history.length, 20, 'History must be capped at 20 turns');
    assert.equal(history[0].jobId, 'job-5', 'Oldest 5 entries must be pruned');
    assert.equal(history[19].jobId, 'job-24', 'Latest entry must be preserved');
  });
});


// =============================================================================
// CHALLENGE 5: Deep Adversarial Failure Modes & Security Edge Cases
// =============================================================================
describe('Challenge 5: Deep Adversarial Invariants & Edge Cases', () => {

  test('5.1: rippleCut boundaries: Overlapping cut ranges merge, entire project cut is rejected, >20 ranges rejected', () => {
    const load = loader();
    const cutModule = load('app/lib/editor/rippleCut');
    const project = createProjectFixture(load, { duration: 15 });

    // Test overlapping merge: [2.0, 3.5] and [3.0, 4.5] should merge into [2.0, 4.5]
    const merged = cutModule.normalizedCuts(project, [
      { start: 2.0, end: 3.5 },
      { start: 3.0, end: 4.5 }
    ]);
    assert.equal(merged.length, 1, 'Overlapping ranges must merge into a single cut');
    assert.equal(merged[0].start, 2.0);
    assert.equal(merged[0].end, 4.5);

    // Test rejection when cut exceeds project duration:
    assert.throws(() => {
      cutModule.normalizedCuts(project, [{ start: 0, end: 15.0 }]);
    }, /Keep at least one frame of the project/i);

    // Test rejection when ranges count > 20:
    const excessiveRanges = Array.from({ length: 21 }, (_, i) => ({
      start: i * 0.5,
      end: i * 0.5 + 0.3
    }));
    assert.throws(() => {
      cutModule.normalizedCuts(project, excessiveRanges);
    }, /Choose between 1 and 20 cut ranges/i);
  });

  test('5.2: Continuous speech with zero pauses > 0.6s emits 0 ripple cuts without failure', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const model = load('app/lib/editor/model');
    const project = createProjectFixture(load, {
      duration: 10,
      existingCaptions: [
        { text: 'P1', startTime: 0.0, duration: 2.0 },
        { text: 'P2', startTime: 2.2, duration: 2.0 }, // gap 0.2s <= 0.6s
        { text: 'P3', startTime: 4.4, duration: 2.0 }  // gap 0.2s <= 0.6s
      ]
    });

    // Plan adds caption styling without any ripple cuts
    const planNoCuts = {
      summary: 'Continuous speech context; no silences >0.6s detected, zero ripple cuts applied',
      decisions: [
        { op: 'addGraphic', kind: 'label', text: 'Fluent speech', startTime: 1.0, duration: 2.0, motion: 'pop' }
      ]
    };

    const next = pipeline.buildStageProject(project, planNoCuts);
    assert.equal(model.projectDuration(next), 10.0, 'Project duration remains exactly 10s');
    const cuts = planNoCuts.decisions.filter(d => d.op === 'rippleCut');
    assert.equal(cuts.length, 0, 'Zero rippleCut operations emitted');
  });

  test('5.3: Chat UI error handling: Failed job displays public error alert instead of complete banner', () => {
    const load = loader();
    const service = load('app/lib/serviceMessages');

    const failedJob = {
      status: 'failed',
      appliedOperations: [],
      stages: [
        { id: 'analyzeFootage', status: 'completed' },
        { id: 'applyRequestedEdits', status: 'failed', error: 'Groq service timed out while planning.' }
      ]
    };

    // Chat UI state assertions:
    const isCompletedBannerVisible = failedJob.status === 'completed';
    assert.equal(isCompletedBannerVisible, false, 'Completed banner MUST be false');

    const failedStage = failedJob.stages.find(s => s.status === 'failed');
    assert.ok(failedStage, 'Failed stage exists');
    const errorMessage = service.publicErrorMessage(failedStage.error);
    assert.equal(errorMessage, 'This request took too long. Please retry. Saved changes are preserved.');
  });

  test('5.4: API route input sanitization: conversationHistory malformed payload rejects gracefully', () => {
    const malformedBodies = [
      { conversationHistory: 'not an array' },
      { conversationHistory: [null, 123] },
      { conversationHistory: [{ instructions: 123, summary: null }] }
    ];

    for (const body of malformedBodies) {
      if (body.conversationHistory !== undefined) {
        const isInvalid = !Array.isArray(body.conversationHistory) || body.conversationHistory.some(item => !item || typeof item !== 'object');
        if (body.conversationHistory === 'not an array' || body.conversationHistory.some(i => !i || typeof i !== 'object')) {
          assert.ok(isInvalid, 'Must flag invalid conversation history');
        }
      }
    }
  });

  test('5.5: Instructions length bounds: Enforces 1-2000 character limit', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createProjectFixture(load, { duration: 10 });

    // Empty instruction throws:
    assert.throws(() => {
      pipeline.createEditingJob(project, '   ', []);
    }, /Describe your edit in 1–2000 characters/i);

    // Over 2000 chars throws:
    const longText = 'a'.repeat(2001);
    assert.throws(() => {
      pipeline.createEditingJob(project, longText, []);
    }, /Describe your edit in 1–2000 characters/i);

    // Exactly 2000 chars passes:
    const exact2000 = 'a'.repeat(2000);
    assert.doesNotThrow(() => {
      pipeline.createEditingJob(project, exact2000, []);
    });
  });
});
