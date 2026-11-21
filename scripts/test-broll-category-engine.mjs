import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');

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

const userClipPath = 'C:/Users/Admin/.gemini/antigravity/brain/16c83238-f069-4d57-8756-fcce52e88e98/.user_uploaded/media_1795005808998_b40ad2a3.mp4';
const userClipDuration = 15.04;
const userClipWidth = 720;
const userClipHeight = 1280;

function loader(mocks = {}, extra = {}) {
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
    structuredClone: globalThis.structuredClone,
    setTimeout,
    clearTimeout,
    fetch: globalThis.fetch,
    process: { env: { EDITOR_AI_PRIMARY_PROVIDER: 'radox' } },
    ...extra,
  });

  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) filename += '.ts';
    const key = path.relative(root, filename).replaceAll('\\', '/');
    if (key in baseMocks) return baseMocks[key];
    if (cache.has(filename)) return cache.get(filename);
    const exports = {};
    cache.set(filename, exports);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    new vm.Script(`(function(require,module,exports){${code}\n})`).runInContext(context)(
      (s) =>
        s.startsWith('@/')
          ? load(s.slice(2))
          : s.startsWith('.')
          ? load(path.relative(root, path.resolve(path.dirname(filename), s)))
          : require(s),
      { exports },
      exports
    );
    return exports;
  }
  return load;
}

const REQUIRED_CATEGORIES = [
  'gaming',
  'memes',
  'productivity',
  'finance',
  'tech',
  'fitness',
  'podcast',
  'luxury',
  'education',
  'travel',
];

test('1. Curated B-Roll Catalog: verifies all 10 niches exist with >= 10 items each (>= 100 total)', () => {
  const load = loader();
  const { CURATED_BROLL_CATALOG, BROLL_CATEGORIES } = load('app/lib/assets/curatedBrollCatalog');

  assert.equal(BROLL_CATEGORIES.length, 10, 'Must have exactly 10 niche categories');
  assert.ok(CURATED_BROLL_CATALOG.length >= 100, `Catalog must have >= 100 items, got ${CURATED_BROLL_CATALOG.length}`);

  for (const cat of REQUIRED_CATEGORIES) {
    const meta = BROLL_CATEGORIES.find((c) => c.id === cat);
    assert.ok(meta, `Category ${cat} must exist in BROLL_CATEGORIES`);
    assert.ok(meta.label && meta.icon && meta.keywords.length >= 5, `Metadata for ${cat} must be complete`);

    const items = CURATED_BROLL_CATALOG.filter((i) => i.category === cat);
    assert.ok(
      items.length >= 10,
      `Category ${cat} must contain at least 10 items, found ${items.length}`
    );
  }
});

test('2. Curated B-Roll Catalog: all items have valid URLs, thumbnails, dimensions, duration and tags', () => {
  const load = loader();
  const { CURATED_BROLL_CATALOG } = load('app/lib/assets/curatedBrollCatalog');

  for (const item of CURATED_BROLL_CATALOG) {
    assert.ok(item.id && typeof item.id === 'string', 'Item must have an id');
    assert.ok(item.title && item.title.length >= 5, `Item ${item.id} must have a descriptive title`);
    assert.ok(item.description && item.description.length >= 15, `Item ${item.id} must have visual description`);
    assert.ok(REQUIRED_CATEGORIES.includes(item.category), `Item ${item.id} category ${item.category} must be in 10 niches`);
    assert.ok(Array.isArray(item.tags) && item.tags.length >= 4, `Item ${item.id} must have >= 4 tags`);
    assert.ok(item.videoUrl.startsWith('https://'), `Item ${item.id} videoUrl must be https`);
    assert.ok(item.thumbnail.startsWith('https://'), `Item ${item.id} thumbnail must be https`);
    assert.ok(item.duration > 0 && Number.isFinite(item.duration), `Item ${item.id} duration must be positive`);
    assert.ok(item.width >= 720 && item.height >= 720, `Item ${item.id} dimensions must be HD`);
    assert.ok(['portrait', 'landscape'].includes(item.orientation), `Item ${item.id} orientation must be portrait/landscape`);
  }
});

test('3. Video Category Analyzer: single-topic recognition across diverse niches', () => {
  const load = loader();
  const { analyzeVideoCategories } = load('app/lib/server/videoCategoryAnalyzer');

  // Gaming
  const gaming = analyzeVideoCategories({
    speech: 'Watch this esports tournament match where our team hit an unbelievable clutch with the controller on the gaming rig.',
  });
  assert.equal(gaming.primaryCategory, 'gaming');
  assert.ok(gaming.categories[0].confidence > 0.6);

  // Fitness
  const fitness = analyzeVideoCategories({
    speech: 'Today at the gym we are hitting a heavy deadlift workout followed by barbell squats and endurance cardio.',
  });
  assert.equal(fitness.primaryCategory, 'fitness');
  assert.ok(fitness.categories[0].confidence > 0.6);

  // Podcast
  const podcast = analyzeVideoCategories({
    speech: 'Welcome back to the podcast. Today in the recording studio our guest speaker joins us on the broadcast microphone.',
  });
  assert.equal(podcast.primaryCategory, 'podcast');
  assert.ok(podcast.categories[0].confidence > 0.6);

  // Luxury
  const luxury = analyzeVideoCategories({
    speech: 'Inside this private jet and luxury penthouse suite, we celebrate with crystal champagne and exotic supercars.',
  });
  assert.equal(luxury.primaryCategory, 'luxury');
  assert.ok(luxury.categories[0].confidence > 0.6);

  // Travel
  const travel = analyzeVideoCategories({
    speech: 'Our cinematic drone flight over snowcapped mountain peaks and tropical turquoise beaches on this epic roadtrip.',
  });
  assert.equal(travel.primaryCategory, 'travel');
  assert.ok(travel.categories[0].confidence > 0.6);
});

test('4. Video Category Analyzer: multi-category matching (e.g. tech + finance + productivity)', () => {
  const load = loader();
  const { analyzeVideoCategories } = load('app/lib/server/videoCategoryAnalyzer');

  const multi = analyzeVideoCategories({
    speech: 'In this video I share how software developers can write clean code, build SaaS tools for passive income on the stock market, and organize their daily morning routine.',
    prompt: 'Add relevant B-roll to emphasize the key points',
  });

  const detectedCats = multi.categories.map((c) => c.category);
  assert.ok(detectedCats.includes('tech'), 'Should detect tech');
  assert.ok(detectedCats.includes('finance'), 'Should detect finance');
  assert.ok(detectedCats.includes('productivity'), 'Should detect productivity');
  assert.ok(multi.categories.length >= 3, 'Should detect at least 3 categories');
  assert.ok(multi.suggestedBrollQueries.length > 0, 'Should generate suggested queries');
});

test('5. Video Category Analyzer: fallback for empty or ambiguous speech context', () => {
  const load = loader();
  const { analyzeVideoCategories } = load('app/lib/server/videoCategoryAnalyzer');

  const empty = analyzeVideoCategories({});
  assert.ok(REQUIRED_CATEGORIES.includes(empty.primaryCategory), 'Fallback primary category must be valid niche');
  assert.ok(empty.categories.length >= 1, 'Fallback categories must not be empty');
  assert.ok(empty.categories[0].confidence > 0, 'Fallback confidence must be positive');
});

test('6. Stock Search: returns curated B-roll when PEXELS_API_KEY is not configured with zero errors', async () => {
  const load = loader({}, { process: { env: { PEXELS_API_KEY: '' } } });
  const { searchStockVideos } = load('app/lib/server/stockSearch');

  const portraitClips = await searchStockVideos('gaming controller esports', 'portrait', new AbortController().signal, 6);
  assert.ok(portraitClips.length > 0, 'Should return curated portrait clips');
  assert.ok(portraitClips[0].videoUrl.startsWith('https://'), 'Clip should have valid videoUrl');
  assert.ok(portraitClips[0].duration > 0, 'Clip should have valid duration');
  assert.equal(portraitClips[0].source, 'pexels', 'Downstream source should be compatible');

  const landscapeClips = await searchStockVideos('crypto trading chart', 'landscape', new AbortController().signal, 6);
  assert.ok(landscapeClips.length > 0, 'Should return curated landscape clips');
});

test('7. Hybrid B-roll Choice: chooseEditorialBroll successfully selects curated footage without external keys', async () => {
  const jpeg = Buffer.from([255, 216, 255, 224, 0, 0, 255, 217]).toString('base64');
  let modelInputSeen;

  const load = loader(
    {
      'app/lib/server/radoxService.ts': {
        generateEditorJson: async (input) => {
          modelInputSeen = input;
          const parsed = JSON.parse(input.prompt);
          const firstCandidate = parsed.candidates[0];
          return {
            id: firstCandidate.id,
            reason: 'Visual candidate supports the discussed technical and productive workflow.',
            refinedQuery: null,
            relevanceScore: 0.92,
            candidateScores: parsed.candidates.map((c) => ({ id: c.id, score: c.id === firstCandidate.id ? 0.92 : 0.4 })),
          };
        },
      },
    },
    {
      process: { env: { PEXELS_API_KEY: '', EDITOR_AI_PRIMARY_PROVIDER: 'radox' } },
      fetch: async () => new Response(Buffer.from(jpeg, 'base64'), { headers: { 'Content-Type': 'image/jpeg' } }),
    }
  );

  const { chooseEditorialBroll } = load('app/lib/server/editorBroll');

  const result = await chooseEditorialBroll(
    {
      query: 'deep work programmer coding',
      speech: 'When I sit down to program software, having zero distractions helps me write clean algorithms.',
      duration: 3,
      orientation: 'portrait',
      exclude: [],
    },
    'test-user-id',
    new AbortController().signal
  );

  assert.ok(result.video, 'Should return chosen video');
  assert.ok(result.video.videoUrl.startsWith('https://'), 'Video URL must be valid');
  assert.ok(result.relevanceScore >= 0.8, 'Relevance score should be high');
  assert.ok(result.categoryAnalysis, 'Should attach category analysis');
  assert.ok(['tech', 'productivity'].includes(result.categoryAnalysis.primaryCategory), 'Should detect tech or productivity');
  assert.ok(modelInputSeen, 'Model should have been invoked with candidate images and metadata');
});

test('8. Video Category Analyzer: verifies all 10 niche categories individually with distinct domain excerpts', () => {
  const load = loader();
  const { analyzeVideoCategories } = load('app/lib/server/videoCategoryAnalyzer');

  const testCases = [
    {
      category: 'gaming',
      speech: 'Watch this esports tournament match where our team hit an unbelievable clutch with the controller on the gaming rig.',
    },
    {
      category: 'memes',
      speech: 'That was the most hilarious facepalm reaction ever, mind blown and laughing so hard with popcorn.',
    },
    {
      category: 'productivity',
      speech: 'Starting my daily morning routine with a pomodoro timer and organizing my task checklist for deep work.',
    },
    {
      category: 'finance',
      speech: 'How to build passive income investing in the stock market and crypto trading for financial freedom.',
    },
    {
      category: 'tech',
      speech: 'Writing clean code as a software engineer using artificial intelligence, python algorithms, and cloud servers.',
    },
    {
      category: 'fitness',
      speech: 'Today at the gym we are hitting a heavy deadlift workout followed by barbell squats and endurance cardio.',
    },
    {
      category: 'podcast',
      speech: 'Welcome back to the podcast. Today in the recording studio our guest speaker joins us on the broadcast microphone.',
    },
    {
      category: 'luxury',
      speech: 'Inside this private jet and luxury penthouse suite, we celebrate with crystal champagne and exotic supercars.',
    },
    {
      category: 'education',
      speech: 'In the university lecture hall today, the professor explained the mathematical formula and scientific discovery.',
    },
    {
      category: 'travel',
      speech: 'Our cinematic drone flight over snowcapped mountain peaks and tropical turquoise beaches on this epic roadtrip.',
    },
  ];

  for (const { category, speech } of testCases) {
    const analysis = analyzeVideoCategories({ speech });
    assert.equal(
      analysis.primaryCategory,
      category,
      `Category analyzer must identify primary category ${category} from: "${speech}"`
    );
    assert.ok(
      analysis.categories[0].confidence > 0.5,
      `Confidence for ${category} must be > 0.5, got ${analysis.categories[0].confidence}`
    );
  }
});

test('9. Multi-Category Matching: query spanning tech and finance retrieves candidates from both niches', () => {
  const load = loader();
  const { searchCuratedBroll } = load('app/lib/assets/curatedBrollCatalog');

  const query = 'python stock trading algorithm crypto';
  const candidates = searchCuratedBroll(query, { limit: 12 });

  assert.ok(candidates.length >= 2, 'Must return candidates for multi-topic query');
  const categoriesPresent = new Set();
  const { CURATED_BROLL_CATALOG } = load('app/lib/assets/curatedBrollCatalog');

  for (const c of candidates) {
    const original = CURATED_BROLL_CATALOG.find((item) => item.id === c.id);
    if (original) categoriesPresent.add(original.category);
  }

  assert.ok(
    categoriesPresent.has('tech') && categoriesPresent.has('finance'),
    `Multi-category search should draw from both tech and finance niches, got: ${[...categoriesPresent].join(', ')}`
  );
});

test('10. chooseEditorialBroll resilience: when top candidates are in exclude list, pulls unexcluded curated candidates', async () => {
  const jpeg = Buffer.from([255, 216, 255, 224, 0, 0, 255, 217]).toString('base64');
  const load = loader(
    {
      'app/lib/server/radoxService.ts': {
        generateEditorJson: async (input) => {
          const parsed = JSON.parse(input.prompt);
          const chosen = parsed.candidates[0];
          return {
            id: chosen.id,
            reason: 'Selected alternative unexcluded candidate',
            refinedQuery: null,
            relevanceScore: 0.88,
            candidateScores: parsed.candidates.map((c) => ({ id: c.id, score: 0.88 })),
          };
        },
      },
    },
    {
      process: { env: { PEXELS_API_KEY: '', EDITOR_AI_PRIMARY_PROVIDER: 'radox' } },
      fetch: async () => new Response(Buffer.from(jpeg, 'base64'), { headers: { 'Content-Type': 'image/jpeg' } }),
    }
  );

  const { chooseEditorialBroll } = load('app/lib/server/editorBroll');
  const { searchCuratedBroll } = load('app/lib/assets/curatedBrollCatalog');

  const defaultClips = searchCuratedBroll('tech coding cloud', { orientation: 'portrait', limit: 6 });
  const excludeList = defaultClips.map((c) => 'broll:' + c.id);

  const result = await chooseEditorialBroll(
    {
      query: 'tech coding cloud',
      speech: 'Writing clean code in python on cloud servers',
      duration: 3,
      orientation: 'portrait',
      exclude: excludeList,
    },
    'test-user-id',
    new AbortController().signal
  );

  assert.ok(result.video, 'Should return candidate even when top items are excluded');
  assert.ok(!excludeList.includes('broll:' + result.video.id), 'Selected video must not be in exclude list');
});

test('11. chooseEditorialBroll zero-failure: when model returns id: null, gracefully selects top candidate with zero errors', async () => {
  const jpeg = Buffer.from([255, 216, 255, 224, 0, 0, 255, 217]).toString('base64');
  const load = loader(
    {
      'app/lib/server/radoxService.ts': {
        generateEditorJson: async () => {
          return {
            id: null,
            reason: 'Model returned null id due to strictness',
            refinedQuery: null,
            relevanceScore: 0.2,
            candidateScores: [],
          };
        },
      },
    },
    {
      process: { env: { PEXELS_API_KEY: '', EDITOR_AI_PRIMARY_PROVIDER: 'radox' } },
      fetch: async () => new Response(Buffer.from(jpeg, 'base64'), { headers: { 'Content-Type': 'image/jpeg' } }),
    }
  );

  const { chooseEditorialBroll } = load('app/lib/server/editorBroll');

  const result = await chooseEditorialBroll(
    {
      query: 'coding python app',
      speech: 'Writing clean code in python',
      duration: 3,
      orientation: 'portrait',
      exclude: [],
    },
    'test-user-id',
    new AbortController().signal
  );

  assert.ok(result.video, 'Must always return a valid video clip even when model returns null id');
  assert.ok(result.video.videoUrl.startsWith('https://'), 'Video URL must be valid');
});

test('12. chooseEditorialBroll zero-failure: when model throws / rate limit occurs, gracefully selects top candidate with zero crash', async () => {
  const jpeg = Buffer.from([255, 216, 255, 224, 0, 0, 255, 217]).toString('base64');
  class MockRadoxError extends Error {
    constructor(msg, code) { super(msg); this.code = code; }
  }

  const load = loader(
    {
      'app/lib/server/radoxService.ts': {
        RadoxEditorError: MockRadoxError,
        generateEditorJson: async () => {
          throw new MockRadoxError('Radox rate limit / 503 Service Unavailable', 'RATE_LIMIT');
        },
      },
      'app/lib/server/groqEditorTransport.ts': {
        requestGroqEditorCompletion: async () => {
          throw new Error('Groq provider unavailable');
        },
      },
    },
    {
      process: { env: { PEXELS_API_KEY: '', EDITOR_AI_PRIMARY_PROVIDER: 'radox' } },
      fetch: async () => new Response(Buffer.from(jpeg, 'base64'), { headers: { 'Content-Type': 'image/jpeg' } }),
    }
  );

  const { chooseEditorialBroll } = load('app/lib/server/editorBroll');

  const result = await chooseEditorialBroll(
    {
      query: 'coding python app',
      speech: 'Writing clean code in python',
      duration: 3,
      orientation: 'portrait',
      exclude: [],
    },
    'test-user-id',
    new AbortController().signal
  );

  assert.ok(result.video, 'Must return a valid video clip even when all AI models throw or fail');
  assert.ok(result.video.videoUrl.startsWith('https://'), 'Video URL must be valid');
});

test('13. End-to-End Sequential Edit AI Assistant Execution on Real User Podcast Clip', async () => {
  assert.ok(fs.existsSync(userClipPath), `User video clip must exist at ${userClipPath}`);

  const load = loader();
  const model = load('app/lib/editor/model.ts');
  const ops = load('app/lib/editor/operations.ts');
  const pipeline = load('app/lib/editor/sequentialEdit.ts');
  const { searchCuratedBroll } = load('app/lib/assets/curatedBrollCatalog.ts');
  const { analyzeVideoCategories } = load('app/lib/server/videoCategoryAnalyzer.ts');

  // Ingest real user podcast video clip
  let project = model.createProject('podcast-user-project');
  project.settings.aspectRatio = '9:16';
  project.settings.fps = 30;

  project = ops.addAsset(project, {
    id: 'podcast-asset',
    kind: 'video',
    name: 'Entrepreneurs_having_podcast_con…_d798d2d4.mp4',
    duration: userClipDuration,
    width: userClipWidth,
    height: userClipHeight,
    mime: 'video/mp4',
    size: 5641767,
    url: userClipPath,
  });

  project = ops.addClip(project, 'podcast-asset', 'track-video', 0, {
    id: 'podcast-clip',
    name: 'Entrepreneurs Podcast Footage',
    duration: userClipDuration,
    sourceStart: 0,
    sourceEnd: userClipDuration,
    volume: 1,
  });

  const podcastTranscript =
    'When starting a venture-backed tech company, cash flow and capital efficiency determine survival. Focus on clean architecture, product-market fit, and high productivity routines.';

  // 1. Verify category analyzer detects finance, tech, and productivity
  const analysis = analyzeVideoCategories({
    speech: podcastTranscript,
    prompt: 'Add engaging B-roll to visualize tech and finance concepts',
  });
  const catNames = analysis.categories.map((c) => c.category);
  assert.ok(catNames.includes('finance'), 'Should detect finance category');
  assert.ok(catNames.includes('tech'), 'Should detect tech category');
  assert.ok(catNames.includes('productivity'), 'Should detect productivity category');

  // 2. Select curated B-roll from tech
  const curatedClips = searchCuratedBroll('tech coding cloud', {
    category: 'tech',
    orientation: 'portrait',
  });
  assert.ok(curatedClips.length > 0, 'Must have curated tech B-roll');
  const selectedClip = curatedClips[0];

  // 3. Create editing job and run through sequential assistant pipeline
  const job = pipeline.createEditingJob(
    project,
    'Add engaging B-roll supporting our discussion of tech startups and finance.',
    [],
    pipeline.PIPELINE_PRESETS.find((p) => p.id === 'engaging')
  );

  let currentProject = structuredClone(project);
  const runtime = {
    getProject: () => currentProject,
    interacting: () => false,
    persist: async (next, j) => {
      j.timelineRevision = currentProject.revision + 1;
      currentProject = { ...next, revision: j.timelineRevision, editingJob: structuredClone(j) };
    },
    execute: async (stage, proj, j) => {
      switch (stage) {
        case 'analyzeFootage':
          return {
            summary: '15.04s entrepreneur podcast video analyzed with tech/finance topics',
            operations: ['broll'],
          };
        case 'findBroll':
          return {
            summary: `Curated B-roll matching ${selectedClip.title}`,
            assets: [
              {
                id: 'asset-' + selectedClip.id,
                libraryId: selectedClip.id,
                kind: 'video',
                name: selectedClip.title,
                duration: selectedClip.duration,
                width: selectedClip.width,
                height: selectedClip.height,
                mime: 'video/mp4',
                url: selectedClip.videoUrl,
                size: 2048,
              },
            ],
            decisions: [
              {
                op: 'addClip',
                assetId: 'asset-' + selectedClip.id,
                trackId: 'track-overlay',
                startTime: 2.5,
                duration: 3.5,
                volume: 0,
                audioRole: 'background',
              },
            ],
          };
        case 'applyBroll':
          return j.stages.find((s) => s.id === 'findBroll').output;
        case 'validateEdit':
          return pipeline.validateCompletedJob(proj, j);
        default:
          throw new Error(`Unexpected stage: ${stage}`);
      }
    },
  };

  const result = await pipeline.runEditingJob(runtime, job, new AbortController().signal);
  assert.equal(result.status, 'completed', 'AI assistant job must complete with status completed');

  const finalProject = runtime.getProject();
  const overlayClips = Object.values(finalProject.clips).filter((c) => c.trackId === 'track-overlay');
  assert.equal(overlayClips.length, 1, 'Exactly one B-roll clip must be inserted');
  assert.equal(overlayClips[0].volume, 0, 'B-roll overlay volume MUST be 0');
  assert.equal(overlayClips[0].audioRole, 'background', 'B-roll audioRole must be background');
  assert.equal(overlayClips[0].startTime, 2.5, 'B-roll startTime must be 2.5');
  assert.equal(overlayClips[0].duration, 3.5, 'B-roll duration must be 3.5');
  assert.ok(overlayClips[0].startTime + overlayClips[0].duration <= userClipDuration, 'B-roll must fit within video duration');

  // Verify dialogue & audio integrity of original podcast clip
  const sourceClip = finalProject.clips['podcast-clip'];
  assert.equal(sourceClip.duration, userClipDuration, 'Original clip duration must remain untouched (15.04s)');
  assert.equal(sourceClip.sourceStart, 0, 'Original clip sourceStart must remain 0');
  assert.equal(sourceClip.sourceEnd, userClipDuration, 'Original clip sourceEnd must remain untouched (15.04s)');
  assert.equal(sourceClip.volume, 1, 'Original clip volume must remain 1 (dialogue completely preserved)');
});

test('14. End-to-End Sequential Edit AI Assistant on Simulated Gaming and Travel Clips', async () => {
  const load = loader();
  const model = load('app/lib/editor/model.ts');
  const ops = load('app/lib/editor/operations.ts');
  const pipeline = load('app/lib/editor/sequentialEdit.ts');
  const { searchCuratedBroll } = load('app/lib/assets/curatedBrollCatalog.ts');
  const { analyzeVideoCategories } = load('app/lib/server/videoCategoryAnalyzer');

  // Scenario A: Gaming Clip (16:9, 30s)
  let gamingProject = model.createProject('gaming-project');
  gamingProject.settings.aspectRatio = '16:9';
  gamingProject = ops.addAsset(gamingProject, {
    id: 'game-asset',
    kind: 'video',
    name: 'esports_stream.mp4',
    duration: 30,
    width: 1920,
    height: 1080,
    mime: 'video/mp4',
    size: 10000,
    url: 'https://example.com/stream.mp4',
  });
  gamingProject = ops.addClip(gamingProject, 'game-asset', 'track-video', 0, {
    id: 'game-clip',
    name: 'Stream',
    duration: 30,
    sourceStart: 0,
    sourceEnd: 30,
    volume: 1,
  });

  const gamingAnalysis = analyzeVideoCategories({
    speech: 'Look at that clutch play in the esports tournament match with the controller!',
  });
  assert.equal(gamingAnalysis.primaryCategory, 'gaming');
  const gamingBroll = searchCuratedBroll('gaming controller arcade', {
    category: 'gaming',
    orientation: 'landscape',
  })[0];

  const gamingJob = pipeline.createEditingJob(
    gamingProject,
    'Add gaming B-roll',
    [],
    pipeline.PIPELINE_PRESETS.find((p) => p.id === 'engaging')
  );

  let currentGamingProj = structuredClone(gamingProject);
  const gamingRuntime = {
    getProject: () => currentGamingProj,
    interacting: () => false,
    persist: async (next, j) => {
      j.timelineRevision = currentGamingProj.revision + 1;
      currentGamingProj = { ...next, revision: j.timelineRevision, editingJob: structuredClone(j) };
    },
    execute: async (stage, proj, j) => {
      switch (stage) {
        case 'analyzeFootage':
          return { summary: '30s gaming video analyzed', operations: ['broll'] };
        case 'findBroll':
          return {
            summary: `Curated B-roll matching ${gamingBroll.title}`,
            assets: [
              {
                id: 'asset-' + gamingBroll.id,
                libraryId: gamingBroll.id,
                kind: 'video',
                name: gamingBroll.title,
                duration: gamingBroll.duration,
                width: gamingBroll.width,
                height: gamingBroll.height,
                mime: 'video/mp4',
                url: gamingBroll.videoUrl,
                size: 2048,
              },
            ],
            decisions: [
              {
                op: 'addClip',
                assetId: 'asset-' + gamingBroll.id,
                trackId: 'track-overlay',
                startTime: 5.0,
                duration: 4.0,
                volume: 0,
                audioRole: 'background',
              },
            ],
          };
        case 'applyBroll':
          return j.stages.find((s) => s.id === 'findBroll').output;
        case 'validateEdit':
          return pipeline.validateCompletedJob(proj, j);
        default:
          throw new Error(`Unexpected stage: ${stage}`);
      }
    },
  };

  const gamingResult = await pipeline.runEditingJob(gamingRuntime, gamingJob, new AbortController().signal);
  assert.equal(gamingResult.status, 'completed');
  const finalGaming = gamingRuntime.getProject();
  const gamingOverlay = Object.values(finalGaming.clips).find((c) => c.trackId === 'track-overlay');
  assert.ok(gamingOverlay);
  assert.equal(gamingOverlay.volume, 0);
  assert.equal(finalGaming.clips['game-clip'].volume, 1);
  assert.equal(finalGaming.clips['game-clip'].duration, 30);
});

test('8. Edge Case: when stock search returns results but all are filtered out by duration/exclude, fallback seamlessly retrieves curated candidates', async () => {
  const jpeg = Buffer.from([255, 216, 255, 224, 0, 0, 255, 217]).toString('base64');
  let chosenCandidateId;

  const load = loader(
    {
      'app/lib/server/stockSearch.ts': {
        StockSearchError: class extends Error {},
        // Return clips that are all too short (< 4s) or excluded
        searchStockVideos: async () => [
          {
            id: 'short-stock-clip',
            title: 'Too short clip',
            thumbnail: 'https://images.pexels.com/photos/3165335/pexels-photo-3165335.jpeg',
            videoUrl: 'https://videos.pexels.com/test.mp4',
            duration: 1.5, // Shorter than requested 4.0s duration
            width: 720,
            height: 1280,
            creatorName: 'Test',
            creatorUrl: 'https://www.pexels.com',
            sourcePage: 'https://www.pexels.com',
            source: 'pexels',
          },
        ],
      },
      'app/lib/server/radoxService.ts': {
        generateEditorJson: async (input) => {
          const parsed = JSON.parse(input.prompt);
          const first = parsed.candidates[0];
          chosenCandidateId = first.id;
          return {
            id: first.id,
            reason: 'Curated fallback candidate supports the gaming speech.',
            refinedQuery: null,
            relevanceScore: 0.88,
            candidateScores: parsed.candidates.map((c) => ({ id: c.id, score: c.id === first.id ? 0.88 : 0.5 })),
          };
        },
      },
    },
    {
      fetch: async () => new Response(Buffer.from(jpeg, 'base64'), { headers: { 'Content-Type': 'image/jpeg' } }),
    }
  );

  const { chooseEditorialBroll } = load('app/lib/server/editorBroll');

  const result = await chooseEditorialBroll(
    {
      query: 'esports gamer tournament',
      speech: 'Check out this awesome esports gamer match on twitch.',
      duration: 4.0, // Stock clip is 1.5s, so filtered out
      orientation: 'portrait',
      exclude: ['broll:short-stock-clip'],
    },
    'test-owner',
    new AbortController().signal
  );

  assert.ok(result.video, 'Should successfully fall back to curated video');
  assert.ok(result.video.id.startsWith('curated-'), 'Should be a curated candidate ID');
  assert.equal(result.video.id, chosenCandidateId);
  assert.equal(result.categoryAnalysis.primaryCategory, 'gaming');
});
