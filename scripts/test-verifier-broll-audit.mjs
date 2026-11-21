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

function loader(mocks = {}, extra = {}) {
  const cache = new Map();
  const context = vm.createContext({
    console,
    URL,
    URLSearchParams,
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
    process: { env: { EDITOR_AI_PRIMARY_PROVIDER: 'radox' } },
    ...extra,
  });

  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) filename += '.ts';
    const key = path.relative(root, filename).replaceAll('\\', '/');
    if (key in mocks) return mocks[key];
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

const NICHES = [
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

// -------------------------------------------------------------
// 1. Curated B-Roll Catalog Completeness & Integrity
// -------------------------------------------------------------
test('Catalog Integrity: Exactly 10 niches defined and >= 10 items per niche', () => {
  const load = loader();
  const { CURATED_BROLL_CATALOG, BROLL_CATEGORIES } = load('app/lib/assets/curatedBrollCatalog');

  assert.equal(BROLL_CATEGORIES.length, 10, 'Should have exactly 10 niches');
  assert.ok(CURATED_BROLL_CATALOG.length >= 100, `Catalog has >= 100 items (actual: ${CURATED_BROLL_CATALOG.length})`);

  for (const niche of NICHES) {
    const meta = BROLL_CATEGORIES.find((c) => c.id === niche);
    assert.ok(meta, `Category ${niche} must exist in BROLL_CATEGORIES`);
    assert.ok(meta.label && meta.description && meta.icon, `Metadata for ${niche} must be complete`);
    assert.ok(Array.isArray(meta.keywords) && meta.keywords.length >= 5, `Category ${niche} must have >= 5 keywords`);

    const items = CURATED_BROLL_CATALOG.filter((i) => i.category === niche);
    assert.ok(items.length >= 10, `Niche ${niche} has at least 10 entries (actual: ${items.length})`);
  }
});

test('Catalog Integrity: Every entry conforms to schema, valid URLs, and aspect ratio', () => {
  const load = loader();
  const { CURATED_BROLL_CATALOG } = load('app/lib/assets/curatedBrollCatalog');
  const seenIds = new Set();

  for (const item of CURATED_BROLL_CATALOG) {
    assert.ok(item.id && typeof item.id === 'string', 'Item must have an id');
    assert.ok(!seenIds.has(item.id), `Item ID ${item.id} must be unique`);
    seenIds.add(item.id);

    assert.ok(item.title && item.title.trim().length >= 5, `Item ${item.id} title too short`);
    assert.ok(item.description && item.description.trim().length >= 15, `Item ${item.id} description too short`);
    assert.ok(NICHES.includes(item.category), `Item ${item.id} category ${item.category} invalid`);
    assert.ok(Array.isArray(item.tags) && item.tags.length >= 3, `Item ${item.id} tags too few`);
    for (const t of item.tags) {
      assert.ok(typeof t === 'string' && t.trim().length > 0, `Item ${item.id} contains empty tag`);
    }

    assert.ok(item.thumbnail.startsWith('https://'), `Item ${item.id} thumbnail must be https`);
    assert.ok(item.videoUrl.startsWith('https://'), `Item ${item.id} videoUrl must be https`);
    new URL(item.thumbnail);
    new URL(item.videoUrl);

    assert.ok(Number.isFinite(item.duration) && item.duration > 0, `Item ${item.id} duration must be positive`);
    assert.ok(item.width >= 360 && item.height >= 360, `Item ${item.id} dimensions must be >= 360`);
    assert.ok(['portrait', 'landscape'].includes(item.orientation), `Item ${item.id} orientation invalid`);

    if (item.orientation === 'portrait') {
      assert.ok(item.width <= item.height, `Item ${item.id} portrait must have width <= height`);
    } else {
      assert.ok(item.width >= item.height, `Item ${item.id} landscape must have width >= height`);
    }

    assert.ok(item.creatorName && item.creatorName.length > 0, `Item ${item.id} missing creatorName`);
    assert.ok(item.creatorUrl && item.creatorUrl.startsWith('https://'), `Item ${item.id} invalid creatorUrl`);
    assert.ok(item.sourcePage && item.sourcePage.startsWith('https://'), `Item ${item.id} invalid sourcePage`);
  }
});

// -------------------------------------------------------------
// 2. Video Category Analyzer
// -------------------------------------------------------------
test('Category Analyzer: Accurately identifies all 10 niches from transcripts', () => {
  const load = loader();
  const { analyzeVideoCategories } = load('app/lib/server/videoCategoryAnalyzer');

  const testCases = [
    { niche: 'gaming', speech: 'Playing retro arcade games with a pro controller and mechanical keyboard on my gaming rig.' },
    { niche: 'memes', speech: 'That hilarious moment was a viral meme, total plot twist mind blown facepalm reaction.' },
    { niche: 'productivity', speech: 'Deep work focus session using the pomodoro timer and checking items off my morning routine checklist.' },
    { niche: 'finance', speech: 'Analyzing stock market charts, bitcoin crypto trading, and passive income dividends.' },
    { niche: 'tech', speech: 'Writing clean code in python and building neural networks with machine learning algorithms.' },
    { niche: 'fitness', speech: 'Hitting heavy deadlifts at the gym, doing squats and intense cardio endurance workout.' },
    { niche: 'podcast', speech: 'In our podcast recording studio speaking into the broadcast microphone with our interview guest.' },
    { niche: 'luxury', speech: 'Flying first class in a private jet to a luxury penthouse suite with supercars and champagne.' },
    { niche: 'education', speech: 'Attending a university lecture in the biology lab studying scientific formulas and research papers.' },
    { niche: 'travel', speech: 'Epic roadtrip across mountain peaks, flying a drone over tropical turquoise beaches.' },
  ];

  for (const { niche, speech } of testCases) {
    const analysis = analyzeVideoCategories({ speech });
    assert.equal(analysis.primaryCategory, niche, `Expected ${niche} as primary category for speech: "${speech}"`);
    assert.ok(analysis.categories[0].confidence >= 0.5, `Confidence for ${niche} should be >= 0.5`);
  }
});

test('Category Analyzer: Multi-category combination and confidence ranking', () => {
  const load = loader();
  const { analyzeVideoCategories } = load('app/lib/server/videoCategoryAnalyzer');

  const multi = analyzeVideoCategories({
    speech: 'How software developers can write clean python code, invest in stock market portfolios for financial freedom, and manage their daily calendar.',
  });

  const categories = multi.categories.map((c) => c.category);
  assert.ok(categories.includes('tech'), 'Should include tech');
  assert.ok(categories.includes('finance'), 'Should include finance');
  assert.ok(categories.includes('productivity'), 'Should include productivity');
  assert.ok(multi.categories[0].confidence >= multi.categories[1].confidence, 'Categories must be sorted by confidence');
  assert.ok(multi.suggestedBrollQueries.length > 0, 'Must produce suggested search queries');
});

test('Category Analyzer: Edge cases (empty, short, ambiguous)', () => {
  const load = loader();
  const { analyzeVideoCategories } = load('app/lib/server/videoCategoryAnalyzer');

  // Completely empty input
  const empty = analyzeVideoCategories({});
  assert.ok(NICHES.includes(empty.primaryCategory), 'Empty input returns a valid primary niche');
  assert.ok(empty.categories.length >= 1, 'Empty input returns categories');
  assert.ok(empty.categories[0].confidence > 0, 'Empty input confidence is positive');

  // Ambiguous short input
  const short = analyzeVideoCategories({ speech: 'hey guys check this out' });
  assert.ok(NICHES.includes(short.primaryCategory), 'Short input returns a valid primary niche');
  assert.ok(short.categories.length >= 1, 'Short input returns at least 1 category');

  // Prompt overrides/prioritizes topic over ambiguous speech
  const promptGuided = analyzeVideoCategories({
    speech: 'look at this really cool thing',
    prompt: 'Insert B-roll of stock market charts and crypto investment',
  });
  assert.equal(promptGuided.primaryCategory, 'finance', 'Prompt keywords should guide the primary category');
});

// -------------------------------------------------------------
// 3. Stock Search & Hybrid Fallbacks
// -------------------------------------------------------------
test('Stock Search: Returns curated catalog items when PEXELS_API_KEY is not set', async () => {
  const load = loader({}, { process: { env: { PEXELS_API_KEY: '' } } });
  const { searchStockVideos } = load('app/lib/server/stockSearch');

  const portrait = await searchStockVideos('gaming rig', 'portrait', new AbortController().signal, 6);
  assert.ok(portrait.length > 0, 'Must return curated portrait videos');
  assert.ok(portrait[0].videoUrl.startsWith('https://'), 'Video URL must be https');
  assert.ok(portrait[0].duration > 0, 'Duration must be positive');

  const landscape = await searchStockVideos('luxury penthouse', 'landscape', new AbortController().signal, 6);
  assert.ok(landscape.length > 0, 'Must return curated landscape videos');
});

test('Stock Search: Gracefully falls back to curated catalog if Pexels API fails (500 or network error)', async () => {
  const load = loader(
    {},
    {
      process: { env: { PEXELS_API_KEY: 'mock-key' } },
      fetch: async () => new Response('Internal Server Error', { status: 500 }),
    }
  );
  const { searchStockVideos } = load('app/lib/server/stockSearch');

  const result = await searchStockVideos('fitness workout', 'portrait', new AbortController().signal, 6);
  assert.ok(result.length > 0, 'Must fall back to curated catalog on API error');
});

// -------------------------------------------------------------
// 4. Download Security & Whitelist Compliance
// -------------------------------------------------------------
test('Download Whitelists: All curated video URLs are permitted by allowedDownloadUrl and STOCK_HOSTS', () => {
  const load = loader();
  const { CURATED_BROLL_CATALOG } = load('app/lib/assets/curatedBrollCatalog');
  const { allowedDownloadUrl } = load('app/lib/server/brollDownload');
  const { trustedRenderMediaUrl } = load('app/lib/server/render/mediaDownload');

  for (const item of CURATED_BROLL_CATALOG) {
    // Check brollDownload allowedDownloadUrl
    assert.doesNotThrow(() => {
      allowedDownloadUrl(item.videoUrl);
    }, `brollDownload must allow videoUrl: ${item.videoUrl} (item: ${item.id})`);

    // Check render/mediaDownload trustedRenderMediaUrl
    assert.doesNotThrow(() => {
      trustedRenderMediaUrl(item.videoUrl);
    }, `render/mediaDownload must allow videoUrl: ${item.videoUrl} (item: ${item.id})`);
  }
});

test('chooseEditorialBroll: succeeds when live search returns items shorter than input duration or excluded', async () => {
  const jpeg = Buffer.from([255, 216, 255, 224, 0, 0, 255, 217]).toString('base64');
  const load = loader(
    {
      'app/lib/server/stockSearch.ts': {
        searchStockVideos: async () => [
          {
            id: 'short-pexels-1',
            title: 'Too short footage',
            thumbnail: 'https://images.pexels.com/photos/1/short.jpg',
            videoUrl: 'https://videos.pexels.com/short.mp4',
            duration: 1.5, // Less than input.duration = 4.0
            width: 1080,
            height: 1920,
            creatorName: 'Creator',
            creatorUrl: 'https://pexels.com',
            sourcePage: 'https://pexels.com',
            source: 'pexels',
          },
        ],
        StockSearchError: class StockSearchError extends Error {},
      },
      'app/lib/server/radoxService.ts': {
        generateEditorJson: async (input) => {
          const parsed = JSON.parse(input.prompt);
          const firstCandidate = parsed.candidates[0];
          return {
            id: firstCandidate ? firstCandidate.id : null,
            reason: 'Curated fallback provides ideal visual illustration.',
            refinedQuery: null,
            relevanceScore: 0.9,
            candidateScores: parsed.candidates.map((c) => ({ id: c.id, score: 0.9 })),
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
      query: 'deep focus study session',
      speech: 'Studying in the university library reading books and taking notes for final exams.',
      duration: 4.0,
      orientation: 'portrait',
      exclude: [],
    },
    'user-123',
    new AbortController().signal
  );

  assert.ok(result.video, 'Must successfully select a video despite live stock being too short');
  assert.ok(result.video.duration >= 4.0, 'Selected video duration must satisfy input duration');
});

