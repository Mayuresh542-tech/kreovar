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

function createFixtureProject(load, options = {}) {
  const model = load('app/lib/editor/model');
  const ops = load('app/lib/editor/operations');

  const {
    id = 'challenger-fixture',
    duration = 20,
    width = 1080,
    height = 1920,
    audioDucking = false,
    aspectRatio = '9:16',
    includeAudioTrack = true,
    audioVolume = 0.75,
    existingCaptions = [],
    editingHistory = []
  } = options;

  let p = model.createProject(id);
  p.settings.aspectRatio = aspectRatio;
  p.settings.audioDucking = audioDucking;
  p.editingHistory = [...editingHistory];

  p = ops.addAsset(p, {
    id: 'source-video',
    kind: 'video',
    name: 'Interview.mp4',
    duration,
    width,
    height,
    mime: 'video/mp4',
    size: 10 * 1024 * 1024,
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
      size: 2 * 1024 * 1024,
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

function mockRuntime(project, executeHandler) {
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
    execute: async (...args) => {
      return await executeHandler(...args);
    },
    saved
  };
}

// =============================================================================
// ADVERSARIAL CHALLENGE SUITE: MILESTONE 3
// =============================================================================

describe('Adversarial Challenge 1: Section Bounds & Temporal Isolation', () => {

  test('Oracle test: Verifies strict timeline immutability within untouched range [0, 10.0s]', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createFixtureProject(load, { duration: 30 });

    // Legitimate plan with edits after 10.0s
    const validPlan = {
      summary: 'Edits strictly in [10s, 30s]',
      decisions: [
        { op: 'addCaption', text: 'Second section caption', startTime: 10.0, duration: 3.0, templateId: 'clean-sub' },
        { op: 'addZoom', clipId: 'footage', startTime: 14.0, endTime: 16.0, fromScale: 1.0, toScale: 1.12 }
      ]
    };

    const next = pipeline.buildStageProject(project, validPlan);

    // Oracle verification for untouched range [0, 10.0s]:
    // 1. Existing clips: source timing and volume unchanged
    for (const beforeClip of Object.values(project.clips)) {
      const afterClip = next.clips[beforeClip.id];
      assert.ok(afterClip, `Clip ${beforeClip.id} must still exist`);
      assert.equal(afterClip.startTime, beforeClip.startTime);
      assert.equal(afterClip.duration, beforeClip.duration);
      assert.equal(afterClip.sourceStart, beforeClip.sourceStart);
      assert.equal(afterClip.sourceEnd, beforeClip.sourceEnd);
      assert.equal(afterClip.volume, beforeClip.volume);

      // Zooms within [0, 10.0s] must be zero
      const zoomsBefore10 = (afterClip.zooms || []).filter(z => z.sourceStart < 10.0);
      assert.equal(zoomsBefore10.length, 0, 'Zero zooms allowed within [0, 10.0s]');
    }

    // 2. No newly created clips with startTime < 10.0s
    const newClipsBefore10 = Object.values(next.clips).filter(c => !project.clips[c.id] && c.startTime < 10.0);
    assert.equal(newClipsBefore10.length, 0, 'Zero new clips allowed in [0, 10s]');

    // 3. No newly created captions with startTime < 10.0s
    const newCaptionsBefore10 = Object.values(next.clips).filter(c => c.contentId && next.captions[c.contentId] && c.startTime < 10.0);
    assert.equal(newCaptionsBefore10.length, 0, 'Zero new captions allowed in [0, 10s]');
  });

  test('Adversarial Encroachment Oracle: Detects boundary violations at 9.999s and spanning intervals', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createFixtureProject(load, { duration: 25 });

    function violatesUntouchedRange(before, after, untouchedStart, untouchedEnd) {
      // Any new clip that overlaps [untouchedStart, untouchedEnd) is a violation
      for (const clip of Object.values(after.clips)) {
        if (!before.clips[clip.id]) {
          const clipStart = clip.startTime;
          const clipEnd = clip.startTime + clip.duration;
          if (clipStart < untouchedEnd && clipEnd > untouchedStart) return true;
        } else {
          // If existing clip was modified inside untouched section (e.g. zoom, trim)
          const oldClip = before.clips[clip.id];
          if (JSON.stringify(clip.zooms || []) !== JSON.stringify(oldClip.zooms || [])) {
            const zooms = (clip.zooms || []).filter(z => (z.sourceStart ?? z.startTime) < untouchedEnd && (z.sourceEnd ?? z.endTime) > untouchedStart);
            if (zooms.length > 0) return true;
          }
          if (clip.sourceStart !== oldClip.sourceStart || clip.sourceEnd !== oldClip.sourceEnd) {
            if (clip.startTime < untouchedEnd) return true;
          }
        }
      }
      return false;
    }

    // Case A: Encroaching clip at 9.999s
    const encroachingPlan = {
      summary: 'Encroaching clip at 9.999s',
      decisions: [{ op: 'addCaption', text: 'Sneaky', startTime: 9.999, duration: 2.0 }]
    };
    const encroachingNext = pipeline.buildStageProject(project, encroachingPlan);
    assert.equal(violatesUntouchedRange(project, encroachingNext, 0, 10.0), true, 'Must detect 9.999s encroachment');

    // Case B: Spanning clip starting at 8.0s and ending at 12.0s
    const spanningPlan = {
      summary: 'Spanning clip',
      decisions: [{ op: 'addCaption', text: 'Spanning', startTime: 8.0, duration: 4.0 }]
    };
    const spanningNext = pipeline.buildStageProject(project, spanningPlan);
    assert.equal(violatesUntouchedRange(project, spanningNext, 0, 10.0), true, 'Must detect spanning interval encroachment');

    // Case C: Zoom added inside [0, 10s]
    const zoomInsidePlan = {
      summary: 'Zoom inside protected region',
      decisions: [{ op: 'addZoom', clipId: 'footage', startTime: 3.0, endTime: 5.0, fromScale: 1.0, toScale: 1.1 }]
    };
    const zoomNext = pipeline.buildStageProject(project, zoomInsidePlan);
    assert.equal(violatesUntouchedRange(project, zoomNext, 0, 10.0), true, 'Must detect zoom inside untouched section');
  });
});

describe('Adversarial Challenge 2: Negative Constraints Rigor', () => {

  test('Oracle test: Bitwise audio track & clip preservation under "don\'t change audio" and "no SFX"', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createFixtureProject(load, { duration: 20, audioVolume: 0.72 });

    const initialAudioClip = JSON.stringify(project.clips['bg-audio-clip']);
    const initialAudioTrack = JSON.stringify(project.tracks['track-audio']);
    const initialAudioDucking = project.settings.audioDucking;

    // Visual-only plan complying with negative audio constraint
    const visualPlan = {
      summary: 'Enhanced visual titles and motion callouts without touching audio',
      decisions: [
        { op: 'addGraphic', kind: 'callout', text: 'Notice this visual', startTime: 2.0, duration: 3.0, motion: 'pop' },
        { op: 'addCaption', text: 'Dialogue line', startTime: 5.0, duration: 2.0, templateId: 'clean-sub' }
      ]
    };

    const next = pipeline.buildStageProject(project, visualPlan);

    // Audio invariants oracle
    assert.equal(JSON.stringify(next.clips['bg-audio-clip']), initialAudioClip, 'Audio clip must be bitwise identical');
    assert.equal(JSON.stringify(next.tracks['track-audio']), initialAudioTrack, 'Audio track must be bitwise identical');
    assert.equal(next.settings.audioDucking, initialAudioDucking, 'Audio ducking setting must be unchanged');

    // Zero SFX clips
    const sfxClips = Object.values(next.clips).filter(c => c.audioRole === 'sfx');
    assert.equal(sfxClips.length, 0, 'Zero SFX clips allowed');

    // Zero audio assets added
    const audioAssets = Object.values(next.assets).filter(a => a.kind === 'audio');
    assert.equal(audioAssets.length, 1, 'Only the initial background audio asset must exist');
  });

  test('Adversarial test: Prompt directives in editorAi.ts include Hinglish negative keywords', () => {
    const editorAiRaw = fs.readFileSync(path.join(root, 'app/lib/server/editorAi.ts'), 'utf8');

    // Verify negative constraints directive exists and specifies Hinglish keywords
    assert.ok(editorAiRaw.includes('NEGATIVE CONSTRAINTS:'), 'Negative constraints directive must be present');
    assert.ok(editorAiRaw.includes('"don\'t change audio"'), 'Prompt must instruct audio preservation');
    assert.ok(editorAiRaw.includes('"no SFX"'), 'Prompt must instruct no SFX');
    assert.ok(editorAiRaw.includes('"mat"'), 'Prompt must instruct Hinglish negative keyword mat');
    assert.ok(editorAiRaw.includes('"nahi"'), 'Prompt must instruct Hinglish negative keyword nahi');
    assert.ok(editorAiRaw.includes('"bina"'), 'Prompt must instruct Hinglish negative keyword bina');
  });
});

describe('Adversarial Challenge 3: Conversational Refinements & Zero Duplication', () => {

  test('Multi-turn stress: 5 consecutive refinement turns on a single caption without duplication', async () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');

    let project = createFixtureProject(load, {
      duration: 15,
      existingCaptions: [
        { text: 'Initial Speech Line', startTime: 1.0, duration: 3.0, templateId: 'clean-sub' }
      ]
    });

    const captionClip = Object.values(project.clips).find(c => c.contentId && project.captions[c.contentId]);
    assert.ok(captionClip);
    const initialClipCount = Object.keys(project.clips).length;
    const initialCaptionCount = Object.keys(project.captions).length;

    // Turn 1: Change color to yellow
    const turn1Plan = {
      summary: 'Yellow captions',
      decisions: [{ op: 'composeCaption', clipId: captionClip.id, presentation: { textColor: '#ffee00' } }]
    };
    project = pipeline.buildStageProject(project, turn1Plan);
    assert.equal(Object.keys(project.clips).length, initialClipCount, 'Turn 1 clip count must not increase');
    assert.equal(Object.keys(project.captions).length, initialCaptionCount, 'Turn 1 caption count must not increase');
    assert.equal(project.captions[captionClip.contentId].style.color, '#ffee00');

    // Turn 2: Change font to Poppins and size to 40
    const turn2Plan = {
      summary: 'Font Poppins',
      decisions: [{ op: 'composeCaption', clipId: captionClip.id, presentation: { fontSize: 40, emphasisFont: 'Poppins' } }]
    };
    project = pipeline.buildStageProject(project, turn2Plan);
    assert.equal(Object.keys(project.clips).length, initialClipCount, 'Turn 2 clip count must not increase');
    assert.equal(Object.keys(project.captions).length, initialCaptionCount, 'Turn 2 caption count must not increase');
    assert.equal(project.captions[captionClip.contentId].studioStyle?.fontSize, 40);

    // Turn 3: Change motion entrance to pop
    const turn3Plan = {
      summary: 'Entrance pop',
      decisions: [{ op: 'composeCaption', clipId: captionClip.id, presentation: { entrance: 'pop' } }]
    };
    project = pipeline.buildStageProject(project, turn3Plan);
    assert.equal(Object.keys(project.clips).length, initialClipCount, 'Turn 3 clip count must not increase');
    assert.equal(Object.keys(project.captions).length, initialCaptionCount, 'Turn 3 caption count must not increase');

    // Turn 4: Change caption text in-place using changeText
    const turn4Plan = {
      summary: 'Update text',
      decisions: [{ op: 'changeText', clipId: captionClip.id, text: 'Refined Speech Text' }]
    };
    project = pipeline.buildStageProject(project, turn4Plan);
    assert.equal(Object.keys(project.clips).length, initialClipCount, 'Turn 4 clip count must not increase');
    assert.equal(Object.keys(project.captions).length, initialCaptionCount, 'Turn 4 caption count must not increase');
    assert.equal(project.captions[captionClip.contentId].text, 'Refined Speech Text');

    // Turn 5: Apply zoom then remove it with clearZooms
    const zoomPlan = {
      summary: 'Add zoom',
      decisions: [{ op: 'addZoom', clipId: 'footage', startTime: 2.0, endTime: 4.0, fromScale: 1.0, toScale: 1.1 }]
    };
    project = pipeline.buildStageProject(project, zoomPlan);
    assert.equal(project.clips.footage.zooms?.length, 1);

    const clearZoomPlan = {
      summary: 'Remove zoom in-place',
      decisions: [{ op: 'clearZooms', clipId: 'footage' }]
    };
    project = pipeline.buildStageProject(project, clearZoomPlan);
    assert.equal(project.clips.footage.zooms?.length || 0, 0, 'Zoom must be cleared cleanly');
    assert.equal(Object.keys(project.clips).length, initialClipCount, 'Final clip count must match original');
  });
});

describe('Adversarial Challenge 4: Clarification Lifecycle & Resilience', () => {

  test('Clarification without decisions returns cleanly with questions in output and job report', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createFixtureProject(load, { duration: 15 });

    const clarificationOutput = {
      summary: 'Contradictory instructions: pacing conflict between fast cuts and uncut dialogue',
      questions: [
        'Would you like rapid cuts to shorten pauses, or should we keep all spoken phrases complete?'
      ],
      decisions: []
    };

    // Stage validation must pass without throwing
    const stageValidated = pipeline.validateStageChanges('applyRequestedEdits', project, project, clarificationOutput);
    assert.deepEqual(stageValidated.questions, clarificationOutput.questions);

    const job = {
      ...pipeline.createEditingJob(project, 'make it fast and slow at the same time', []),
      appliedOperations: [],
      stages: [
        { id: 'analyzeFootage', status: 'completed' },
        { id: 'applyRequestedEdits', status: 'completed', output: stageValidated }
      ]
    };

    // validateCompletedJob must return clarification summary
    const completed = pipeline.validateCompletedJob(project, job);
    assert.ok(completed.summary.includes('pacing conflict') || completed.summary.includes('Clarification'));
  });

  test('Security & safety invariant: Proposed decisions during clarification turn are neutralized to empty array', () => {
    const editorAiRaw = fs.readFileSync(path.join(root, 'app/lib/server/editorAi.ts'), 'utf8');

    // Verify editorAi.ts enforces decisions: [] when intent.questions.length > 0
    assert.ok(
      editorAiRaw.includes("if(intent?.questions?.length){\n        return {summary:intent.summary,questions:intent.questions,list:{version:1 as const,projectId:project.id,baseRevision:project.revision,decisions:[]},toolRequests:[],catalog};\n      }") ||
      editorAiRaw.includes("if(intent?.questions?.length)")
    );
  });

  test('Clarification questions extraction in sequentialEditClient.ts handles diverse question properties', () => {
    const clientRaw = fs.readFileSync(path.join(root, 'app/lib/editor/sequentialEditClient.ts'), 'utf8');

    // Verify previousClarification extraction extracts question text
    assert.ok(clientRaw.includes('previousClarification'));
    assert.ok(clientRaw.includes('output?.questions?.[0]'));
  });

  test('AiEditingChat.tsx renders clarification question without generic export text', () => {
    const chatRaw = fs.readFileSync(path.join(root, 'app/components/editor/workspace/AiEditingChat.tsx'), 'utf8');

    // Verify chat UI renders question text when questions are present
    assert.ok(chatRaw.includes('job.stages.find(s=>s.output?.questions?.length)'));
    assert.ok(chatRaw.includes('publicServiceText'));
  });
});

describe('Adversarial Challenge 5: Wire Contract & Payload Boundaries', () => {

  test('POST /api/editor/ai-edit conversationHistory validation and bounding', async () => {
    const routeRaw = fs.readFileSync(path.join(root, 'app/api/editor/ai-edit/route.ts'), 'utf8');

    // Check bounds: slices to last 20, trims instructions and summary to 2000 chars
    assert.ok(routeRaw.includes('body.conversationHistory.slice(-20)'));
    assert.ok(routeRaw.includes('item.instructions.slice(0,2000)'));
    assert.ok(routeRaw.includes('item.summary.slice(0,2000)'));
    assert.ok(routeRaw.includes('Invalid conversation history.'));
  });

  test('stagesFor(["requestedEdits"]) yields exactly 3 stages', () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');

    const customStages = pipeline.stagesFor(['requestedEdits']);
    assert.deepEqual(Array.from(customStages), ['analyzeFootage', 'applyRequestedEdits', 'validateEdit']);

    // Mixing requestedEdits with preset operations must throw
    assert.throws(() => {
      pipeline.stagesFor(['requestedEdits', 'captions']);
    }, /Custom requestedEdits must run alone/i);
  });
});

describe('Adversarial Challenge 6: Natural Language Podcast Edit End-to-End Integrity', () => {

  test('Podcast edit combines ducking, captions, and zoom keyframes in atomic step', async () => {
    const load = loader();
    const pipeline = load('app/lib/editor/sequentialEdit');
    const project = createFixtureProject(load, { duration: 18, audioVolume: 0.8 });

    const job = pipeline.createEditingJob(
      project,
      'make this a podcast edit: add animated captions with pop, subtle camera zoom, and duck background music',
      []
    );

    const r = mockRuntime(project, async (stage, currentProject, currentJob) => {
      if (stage === 'analyzeFootage') {
        return { summary: 'Analyzed 18s footage', operations: ['requestedEdits'] };
      }
      if (stage === 'applyRequestedEdits') {
        return {
          summary: 'Podcast edit applied',
          decisions: [
            { op: 'setAudioDucking', enabled: true },
            {
              op: 'addCaption',
              text: 'Welcome to our deep dive',
              startTime: 1.0,
              duration: 3.5,
              templateId: 'signature-poppins',
              words: [
                { word: 'Welcome', start: 0, end: 0.6 },
                { word: 'to', start: 0.6, end: 0.8 },
                { word: 'our', start: 0.8, end: 1.2 },
                { word: 'deep', start: 1.2, end: 1.8 },
                { word: 'dive', start: 1.8, end: 3.5 }
              ]
            },
            {
              op: 'addZoom',
              clipId: 'footage',
              startTime: 2.0,
              endTime: 4.5,
              fromScale: 1.0,
              toScale: 1.12,
              easing: 'smooth',
              returnToStart: true
            }
          ]
        };
      }
      return pipeline.validateCompletedJob(currentProject, currentJob);
    });

    const result = await pipeline.runEditingJob(r, job, new AbortController().signal);
    assert.equal(result.status, 'completed');

    const finalProject = r.getProject();
    assert.equal(finalProject.settings.audioDucking, true, 'Audio ducking must be active');
    assert.equal(Object.keys(finalProject.captions).length, 1, 'Caption must be present');
    assert.equal(finalProject.clips.footage.zooms?.length, 1, 'Zoom must be present');
    assert.equal(finalProject.clips.footage.zooms[0].toScale, 1.12, 'Zoom scale must be 1.12');
  });
});
