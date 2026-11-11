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
    'app/lib/server/speechDuration.ts': { speechDuration: async () => 15.0 },
    'app/lib/server/providerRegistry.ts': {
      getProviderCredential: async () => 'test-key',
      recordProviderUsage: async () => {}
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
const hinglish = load('app/lib/editor/hinglishNormalizer.ts');
const speechLanguages = load('app/lib/captions/speechLanguages.ts');
const templates = load('app/lib/captions/templates.ts');
const refTemplates = load('app/lib/captions/referenceTemplates.ts');
const pipeline = load('app/lib/editor/sequentialEdit.ts');
const model = load('app/lib/editor/model.ts');
const ops = load('app/lib/editor/operations.ts');

describe('Feature 1: Hinglish Caption Generation & Romanization Mode', () => {

  test('1.1: Devanagari script detection and transliteration to Roman Latin script', () => {
    assert.equal(hinglish.containsDevanagari('नमस्ते'), true);
    assert.equal(hinglish.containsDevanagari('Hello'), false);
    assert.equal(hinglish.containsDevanagari('Kya haal hai bhai?'), false);
    assert.equal(hinglish.containsDevanagari('क्या हाल है भाई'), true);

    const romanized = hinglish.devanagariToRoman('नमस्ते भाई');
    assert.match(romanized, /namaste/i, 'Devanagari नमस्ते must transliterate to namaste');
    assert.match(romanized, /bhai/i, 'Devanagari भाई must transliterate to bhai');
  });

  test('1.2: Normalizes casing and standardizes popular Hinglish terms (bhai, yaara, matlab, kya, kaise)', () => {
    const raw = 'kya kar rahe ho yaara matlab yeh bilkul sahi hai bhai';
    const normalized = hinglish.normalizeHinglishText(raw);

    assert.match(normalized, /Kya/, 'kya should be normalized');
    assert.match(normalized, /Yaara/, 'yaara should be normalized');
    assert.match(normalized, /Matlab/, 'matlab should be normalized');
    assert.match(normalized, /Bilkul/, 'bilkul should be normalized');
    assert.match(normalized, /Sahi/, 'sahi should be normalized');
    assert.match(normalized, /Bhai/, 'bhai should be normalized');
  });

  test('1.3: Removes repetitive stutter and vocal filler sounds without breaking flow', () => {
    const rawWithStutter = 'matlab matlab yeh uhh umm bilkul sahi hai';
    const cleaned = hinglish.normalizeHinglishText(rawWithStutter);

    // Stutter "matlab matlab" should be deduplicated to one "Matlab"
    const matlabCount = (cleaned.match(/Matlab/gi) || []).length;
    assert.equal(matlabCount, 1, 'Duplicate stutter word "matlab matlab" must be condensed to 1');
    assert.doesNotMatch(cleaned, /\buhh\b/i, 'Vocal filler "uhh" should be removed');
    assert.doesNotMatch(cleaned, /\bumm\b/i, 'Vocal filler "umm" should be removed');
  });

  test('1.4: Word-level timestamps and boundaries are strictly preserved', () => {
    const rawWords = [
      { word: 'kya', start: 0.1, end: 0.4 },
      { word: 'haal', start: 0.41, end: 0.7 },
      { word: 'hai', start: 0.71, end: 1.0 },
      { word: 'bhai', start: 1.05, end: 1.5 }
    ];

    const normalized = hinglish.normalizeHinglishWords(rawWords);
    assert.equal(normalized.length, 4, 'Word count must be preserved');
    assert.equal(normalized[0].start, 0.1, 'Start timestamp must match original');
    assert.equal(normalized[0].end, 0.4, 'End timestamp must match original');
    assert.equal(normalized[3].word, 'Bhai', 'Word must be standardized');
    assert.equal(normalized[3].start, 1.05);
    assert.equal(normalized[3].end, 1.5);
  });

  test('1.5: readSpeechLanguage accepts "hinglish" language toggle option', () => {
    assert.equal(speechLanguages.readSpeechLanguage('hinglish'), 'hinglish');
    assert.equal(speechLanguages.readSpeechLanguage('en'), 'en');
    assert.equal(speechLanguages.readSpeechLanguage('hi'), 'hi');
    assert.equal(speechLanguages.readSpeechLanguage('auto'), undefined);
    assert.equal(speechLanguages.readSpeechLanguage('mixed'), undefined);
  });

  test('1.6: Viral Hinglish Pop preset exists with uppercase Romanized style and 720p canonical scale', () => {
    const template = templates.DEFAULT_CAPTION_TEMPLATES.find(t => t.id === 'viral-hinglish-pop');
    assert(template, 'Viral Hinglish Pop template must exist in DEFAULT_CAPTION_TEMPLATES');
    assert.equal(template.style.textTransform, 'uppercase', 'Viral Hinglish Pop must have uppercase transform');
    assert.equal(template.style.strokeColor, '#000000', 'Must have high contrast stroke');
    assert.equal(template.style.highlightColor, '#FFE600', 'Must have electric yellow highlight');
    assert(template.style.strokeWidth >= 3, 'Must have prominent stroke >= 3');

    const ref = refTemplates.referenceCaptionTemplate('study-viral-hinglish-pop');
    assert(ref, 'study-viral-hinglish-pop reference template must exist');
  });
});

describe('Feature 2: Non-Blocking Graceful Fallback Pipeline & Degradation Telemetry', () => {

  function createTestProject() {
    let p = model.createProject('non-blocking-test');
    p.settings.aspectRatio = '9:16';
    p.settings.fps = 30;

    p = ops.addAsset(p, {
      id: 'main-video-asset',
      kind: 'video',
      name: 'talking_head.mp4',
      duration: 15.0,
      width: 1080,
      height: 1920,
      mime: 'video/mp4',
      size: 5000000,
      url: '/assets/sample.mp4'
    });

    p = ops.addClip(p, 'main-video-asset', 'track-video', 0, {
      id: 'main-clip',
      name: 'Speaker Clip',
      duration: 15.0,
      sourceStart: 0,
      sourceEnd: 15.0,
      volume: 1
    });

    return p;
  }

  function makeMockRuntime(initialProject, stageHandler) {
    let project = structuredClone(initialProject);
    return {
      getProject: () => project,
      interacting: () => false,
      persist: async (next, job) => {
        job.timelineRevision = project.revision + 1;
        project = { ...next, revision: job.timelineRevision, editingJob: structuredClone(job) };
      },
      execute: async (...args) => stageHandler(...args)
    };
  }

  test('2.1: Obscure B-roll query failure (429 / 500 / no candidates) degrades gracefully without throwing', async () => {
    const project = createTestProject();
    const preset = pipeline.PIPELINE_PRESETS.find(p => p.id === 'documentary');
    assert(preset, 'Documentary preset must exist');
    const job = pipeline.createEditingJob(project, 'Add archival B-roll for quantum string theory and slow zoom holds', [], preset);

    const runtime = makeMockRuntime(project, async (stage, proj, j) => {
      switch (stage) {
        case 'analyzeFootage':
          return { summary: 'Analyzed 1 source clip', operations: preset.operations };
        case 'findBroll':
          // Simulate B-roll API rate limit / 500 error or zero matching vertical stock clips
          throw new Error('Stock media service rate limit exceeded (HTTP 429). No vertical 9:16 clips found.');
        case 'applyBroll':
          // Downstream applyBroll receives empty decisions
          return {
            summary: 'B-roll skipped; preserved original footage.',
            decisions: [],
            skipRationale: 'No matching vertical 9:16 stock footage found for query. Kept original A-roll intact without cutaway.'
          };
        case 'applyZooms':
          return {
            summary: 'Applied cinematic slow zooms',
            decisions: [{ op: 'addZoom', clipId: 'main-clip', startTime: 2.0, endTime: 5.0, fromScale: 1, toScale: 1.10, returnToStart: true, easing: 'smooth' }]
          };
        case 'applyEffects':
          return {
            summary: 'Applied audio ducking',
            decisions: [{ op: 'setAudioDucking', enabled: true }]
          };
        case 'validateEdit':
          return pipeline.validateCompletedJob(proj, j);
        default:
          throw new Error(`Unexpected stage ${stage}`);
      }
    });

    const result = await pipeline.runEditingJob(runtime, job, new AbortController().signal);

    assert.equal(result.status, 'completed', 'Job must complete even when B-roll stage encounters 429/failure');
    assert(result.degradationNotices && result.degradationNotices.length > 0, 'Must record degradation notices');
    
    // Check degradation notice details
    const brollNotice = result.degradationNotices.find(n => n.stage === 'findBroll' || n.stage === 'applyBroll');
    assert(brollNotice, 'Notice for B-roll must be captured');
    assert.equal(brollNotice.status, 'skipped');

    // Confirm timeline project state
    const finalProj = runtime.getProject();
    assert(finalProj.clips['main-clip'], 'Main video clip must remain intact');
    assert(finalProj.clips['main-clip'].zooms.length > 0, 'Subsequent zooms must execute successfully');
    assert.equal(finalProj.settings.aspectRatio, '9:16');
  });

  test('2.2: Missing SFX audio or duration < 0.3s degrades gracefully without failing composition', async () => {
    const project = createTestProject();
    const preset = pipeline.PIPELINE_PRESETS.find(p => p.id === 'hormozi');
    assert(preset, 'Hormozi preset must exist');
    const job = pipeline.createEditingJob(project, 'Add punchy captions, zooms, and sound effects', [], preset);

    const runtime = makeMockRuntime(project, async (stage, proj, j) => {
      switch (stage) {
        case 'analyzeFootage':
          return { summary: 'Analyzed 1 source clip', operations: preset.operations };
        case 'applyCaptions':
          return {
            summary: 'Applied kinetic captions',
            decisions: [{ op: 'addCaption', text: 'FOCUS ON DISCIPLINE', startTime: 1.0, duration: 2.0, templateId: 'viral-hinglish-pop' }]
          };
        case 'applyZooms':
          return {
            summary: 'Applied punch zoom',
            decisions: [{ op: 'addZoom', clipId: 'main-clip', startTime: 1.0, endTime: 2.5, fromScale: 1, toScale: 1.15, returnToStart: true, easing: 'smooth' }]
          };
        case 'planMotionGraphics':
          return { summary: 'Skipped graphics', decisions: [] };
        case 'applyMotionGraphics':
          return { summary: 'Skipped graphics', decisions: [] };
        case 'applySoundEffects':
          // Simulate missing audio file error
          throw new Error('SFX file "whoosh_impact.mp3" could not be loaded or timestamp was too close to track boundary.');
        case 'validateEdit':
          return pipeline.validateCompletedJob(proj, j);
        default:
          throw new Error(`Unexpected stage ${stage}`);
      }
    });

    const result = await pipeline.runEditingJob(runtime, job, new AbortController().signal);

    assert.equal(result.status, 'completed', 'Job must complete even when SFX stage fails');
    const finalProj = runtime.getProject();
    assert(Object.keys(finalProj.captions).length > 0, 'Captions must be applied successfully');
    assert(finalProj.clips['main-clip'].zooms.length > 0, 'Zooms must be applied successfully');

    // Confirm degradation notices and friendly skippedNotes
    assert(result.skippedNotes && result.skippedNotes.length > 0, 'Must compile user-friendly skippedNotes');
    const sfxNote = result.skippedNotes.find(note => /SFX/i.test(note));
    assert(sfxNote, 'Must generate user-friendly SFX degradation note with ⚠️');
  });

  test('2.3: Final response summary contains structured skippedNotes report matching spec', () => {
    const project = createTestProject();
    const job = pipeline.createEditingJob(project, 'Test edit', []);
    job.status = 'running';
    project.revision = job.initialRevision + 1;
    job.stages.forEach(s => {
      if (s.id !== 'validateEdit') s.status = 'completed';
    });
    job.completedStages = ['analyzeFootage', 'applyRequestedEdits'];
    job.appliedOperations = ['job:applyRequestedEdits'];
    job.degradationNotices = [
      {
        stage: 'applyBroll',
        status: 'skipped',
        reason: 'No matching vertical 9:16 stock footage found for query "Artificial Intelligence". Kept original A-roll intact without cutaway.'
      },
      {
        stage: 'applySoundEffects',
        status: 'skipped',
        reason: 'SFX file "pop.mp3" could not be loaded or timestamp was too close to track boundary.'
      }
    ];

    const validation = pipeline.validateCompletedJob(project, job);
    assert(validation.skippedNotes, 'validateCompletedJob must return skippedNotes');
    assert.equal(validation.skippedNotes.length, 2);
    assert.match(validation.skippedNotes[0], /⚠️ B-Roll/);
    assert.match(validation.skippedNotes[1], /⚠️ SFX/);
    assert.equal(job.completionMessage, "Video edit complete! Yahan kuch non-critical tasks hain jo skip huye:");
  });

});
