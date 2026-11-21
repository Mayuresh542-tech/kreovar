import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(root + '/package.json');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');

function createModuleLoader(mocks = {}, extraGlobals = {}) {
  const cache = new Map();
  const context = vm.createContext({
    console: { ...console, warn: () => {}, error: () => {} },
    URL,
    URLSearchParams,
    Headers,
    Response,
    Request,
    NextRequest,
    NextResponse,
    Buffer,
    Blob,
    File,
    FormData,
    Error,
    AbortSignal,
    AbortController,
    ReadableStream,
    Uint8Array,
    TextEncoder,
    TextDecoder,
    crypto: globalThis.crypto,
    setTimeout,
    clearTimeout,
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
        NODE_ENV: 'test',
      },
    },
    ...extraGlobals,
  });

  function load(rel) {
    let f = path.resolve(root, rel);
    if (!path.extname(f)) f += '.ts';
    const key = path.relative(root, f).replaceAll('\\', '/');
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (cache.has(f)) return cache.get(f);
    const exports = {};
    cache.set(f, exports);
    const code = ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    new vm.Script(`(function(require,module,exports){\n${code}\n})`).runInContext(context)(
      (s) =>
        s.startsWith('@/')
          ? load(s.slice(2))
          : s.startsWith('.')
          ? load(path.relative(root, path.resolve(path.dirname(f), s)))
          : s in mocks
          ? mocks[s]
          : require(s),
      { exports },
      exports
    );
    return exports;
  }
  return load;
}

// ============================================================================
// 1. Authorization Guards & Project Access Checks
// ============================================================================

test('requireOwnedProject rejects null and undefined projectId by default to prevent auth bypass', async () => {
  const load = createModuleLoader();
  const { requireOwnedProject } = load('app/lib/server/projectAccess.ts');
  const mockDb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) };

  for (const empty of [null, undefined, '', '   ']) {
    await assert.rejects(
      async () => requireOwnedProject(mockDb, 'user-123', empty),
      /Invalid project/
    );
  }
});

test('requireOwnedProject allows optional project association only when explicitly permitted', async () => {
  const load = createModuleLoader();
  const { requireOwnedProject } = load('app/lib/server/projectAccess.ts');
  const mockDb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) };

  // Explicit optional: true passes without throwing
  await assert.doesNotReject(async () => requireOwnedProject(mockDb, 'user-123', null, { optional: true }));
  await assert.doesNotReject(async () => requireOwnedProject(mockDb, 'user-123', undefined, { optional: true }));
});

test('requireOwnedProject strictly rejects invalid UUID formats and injection payloads', async () => {
  const load = createModuleLoader();
  const { requireOwnedProject } = load('app/lib/server/projectAccess.ts');
  const mockDb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) };

  const invalidIds = [
    'not-a-uuid',
    '../../etc/passwd',
    "1' OR '1'='1",
    '12345678-1234-1234-1234-1234567890ab; DROP TABLE projects;',
    '12345678-1234-1234-1234-1234567890a', // 35 chars
    '12345678-1234-1234-1234-1234567890abb', // 37 chars
    12345,
    { id: 'uuid' },
  ];

  for (const badId of invalidIds) {
    await assert.rejects(
      async () => requireOwnedProject(mockDb, 'user-123', badId),
      /Invalid project/
    );
  }
});

test('requireOwnedProject throws when project belongs to a different user ID', async () => {
  const load = createModuleLoader();
  const { requireOwnedProject } = load('app/lib/server/projectAccess.ts');
  const validUuid = '11111111-2222-3333-4444-555555555555';

  const mockDb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: validUuid, user_id: 'victim-user-999' },
            error: null,
          }),
        }),
      }),
    }),
  };

  await assert.rejects(
    async () => requireOwnedProject(mockDb, 'attacker-user-001', validUuid),
    /This project is unavailable/
  );
});

test('requireOwnedProject succeeds for projects owned by the requesting user', async () => {
  const load = createModuleLoader();
  const { requireOwnedProject } = load('app/lib/server/projectAccess.ts');
  const validUuid = '11111111-2222-3333-4444-555555555555';

  const mockDb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: validUuid, user_id: 'owner-user-001' },
            error: null,
          }),
        }),
      }),
    }),
  };

  await assert.doesNotReject(async () =>
    requireOwnedProject(mockDb, 'owner-user-001', validUuid)
  );
});

test('export-mp4 route rejects metadata missing a valid project UUID', async () => {
  let finalized = false;
  const load = createModuleLoader({
    'app/lib/server/planUsage.ts': {
      withUsage: (h) => h,
      reserveUsage: async () => ({ reservationId: 'test-usage' }),
      finishUsage: async () => {},
      PlanLimitError: class extends Error {},
      usageError: () => new Response('{}', { status: 503 }),
    },
    'app/lib/server/adminAuth.ts': {
      getAuthenticatedUserId: async () => 'user-test',
      getAdminClient: () => ({}),
    },
    'app/lib/server/projectAccess.ts': {
      requireOwnedProject: async () => {},
    },
    'app/lib/server/render/editorAudio.ts': {
      finalizeEditorMp4: async () => { finalized = true; return new Uint8Array([1, 2, 3]); },
    },
  });

  const route = load('app/api/editor/export-mp4/route.ts');

  // Test missing project ID in metadata
  const badMetadatas = [
    JSON.stringify({}),
    JSON.stringify({ id: null }),
    JSON.stringify({ id: 'not-a-uuid' }),
    JSON.stringify({ id: '' }),
  ];

  for (const metadata of badMetadatas) {
    const form = new FormData();
    form.set('recording', new File([new Uint8Array([1, 2, 3])], 'rec.mp4', { type: 'video/mp4' }));
    form.set('project', metadata);

    const res = await route.POST(new NextRequest('http://localhost/api/editor/export-mp4', {
      method: 'POST',
      body: form,
    }));

    assert.equal(res.status, 400);
    assert.equal(finalized, false);
  }
});

// ============================================================================
// 2. SSRF Prevention & Strict Domain / Protocol Validation
// ============================================================================

test('trustedRenderMediaUrl rejects SSRF: path traversal, encoded separators, and directory climbing', () => {
  const load = createModuleLoader();
  const { trustedRenderMediaUrl } = load('app/lib/server/render/mediaDownload.ts');

  const dangerousUrls = [
    'https://project.supabase.co/storage/v1/object/public/videos/../../rest/v1/users',
    'https://project.supabase.co/storage/v1/object/public/videos/%2e%2e/%2e%2e/admin',
    'https://project.supabase.co/storage/v1/object/public/videos/%2f..%2fprivate',
    'https://project.supabase.co/storage/v1/object/public/videos/%5c..%5cprivate',
    'https://project.supabase.co/storage/v1/object/public/videos/..',
    'https://project.supabase.co/storage/v1/object/public/videos/test/..',
  ];

  for (const url of dangerousUrls) {
    assert.throws(
      () => trustedRenderMediaUrl(url),
      /(?:Unsupported render media URL|Use imported media or supported stock media)/
    );
  }
});

test('trustedRenderMediaUrl rejects non-443 ports, credentials, and non-https protocols', () => {
  const load = createModuleLoader();
  const { trustedRenderMediaUrl } = load('app/lib/server/render/mediaDownload.ts');

  const forbiddenProtocolsAndPorts = [
    'http://videos.pexels.com/video.mp4',
    'ftp://videos.pexels.com/video.mp4',
    'file:///etc/shadow',
    'https://videos.pexels.com:8443/video.mp4',
    'https://videos.pexels.com:8080/video.mp4',
    'https://videos.pexels.com:22/video.mp4',
    'https://user:password@videos.pexels.com/video.mp4',
    'https://admin@videos.pexels.com/video.mp4',
  ];

  for (const url of forbiddenProtocolsAndPorts) {
    assert.throws(
      () => trustedRenderMediaUrl(url),
      /Unsupported render media URL/
    );
  }
});

test('trustedRenderMediaUrl rejects lookalike hosts and internal network targets', () => {
  const load = createModuleLoader();
  const { trustedRenderMediaUrl } = load('app/lib/server/render/mediaDownload.ts');

  const unapprovedHosts = [
    'https://videos.pexels.com.evil-domain.com/video.mp4',
    'https://evil-videos.pexels.com/video.mp4',
    'https://localhost/video.mp4',
    'https://127.0.0.1/video.mp4',
    'https://169.254.169.254/latest/meta-data',
    'https://10.0.0.1/video.mp4',
    'https://192.168.1.1/video.mp4',
    'https://other.supabase.co/storage/v1/object/public/videos/clip.mp4',
  ];

  for (const url of unapprovedHosts) {
    assert.throws(
      () => trustedRenderMediaUrl(url),
      /Use imported media or supported stock media/
    );
  }
});

test('trustedRenderMediaUrl approves whitelisted stock domains and owned storage paths', () => {
  const load = createModuleLoader();
  const { trustedRenderMediaUrl } = load('app/lib/server/render/mediaDownload.ts');

  const approvedUrls = [
    'https://videos.pexels.com/video-files/12345/hd.mp4',
    'https://images.pexels.com/photos/12345/pic.jpeg',
    'https://images.unsplash.com/photo-12345',
    'https://cdn.freesound.org/previews/1/sound.mp3',
    'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    'https://www.w3schools.com/html/mov_bbb.mp4',
    'https://project.supabase.co/storage/v1/object/public/videos/clip-123.mp4',
    'https://project.supabase.co/storage/v1/object/sign/videos/clip-123.mp4?token=signed',
  ];

  for (const url of approvedUrls) {
    assert.doesNotThrow(() => trustedRenderMediaUrl(url));
  }
});

test('broll download URL validation strictly restricts allowed stock domains', () => {
  const load = createModuleLoader();
  const { allowedDownloadUrl } = load('app/lib/server/brollDownload.ts');

  assert.doesNotThrow(() =>
    allowedDownloadUrl('https://videos.pexels.com/video-files/999/clip.mp4')
  );
  assert.doesNotThrow(() =>
    allowedDownloadUrl('https://project.supabase.co/storage/v1/object/public/videos/my-clip.mp4')
  );

  for (const bad of [
    'http://videos.pexels.com/video.mp4',
    'https://evil.pexels.com/video.mp4',
    'https://127.0.0.1:8000/video.mp4',
    'https://project.supabase.co/rest/v1/users',
  ]) {
    assert.throws(() => allowedDownloadUrl(bad));
  }
});

// ============================================================================
// 3. Input Boundary Validation & Route Hardening
// ============================================================================

test('broll/search route safely bounds query, page, per_page, and orientation', async () => {
  const load = createModuleLoader();
  const route = load('app/api/broll/search/route.ts');

  // Test unbounded and negative params
  const req = new NextRequest(
    'http://localhost/api/broll/search?query=' + 'a'.repeat(500) + '&page=-5&per_page=999999&orientation=invalid'
  );

  const res = await route.GET(req);
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.success, true);
  assert.ok(data.page >= 1 && data.page <= 100);
  assert.ok(data.perPage >= 1 && data.perPage <= 50);
});

test('captions/templates route validates name, description, and style boundary limits', async () => {
  let inserted = false;
  const load = createModuleLoader({
    'app/lib/server/adminAuth.ts': {
      getAuthenticatedUserId: async () => 'user-123',
      getAdminClient: () => ({
        from: () => ({
          insert: () => {
            inserted = true;
            return {
              select: () => ({
                single: async () => ({
                  data: {
                    id: 'tmpl-1',
                    name: 'Valid',
                    category: 'Custom',
                    description: 'Desc',
                    style: {},
                    user_id: 'user-123',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              }),
            };
          },
        }),
      }),
    },
  });

  const route = load('app/api/captions/templates/route.ts');

  // 1. Missing name
  const res1 = await route.POST(new NextRequest('http://localhost/api/captions/templates', {
    method: 'POST',
    body: JSON.stringify({ style: { font: 'Inter' } }),
  }));
  assert.equal(res1.status, 400);

  // 2. Oversized name (> 100 chars)
  const res2 = await route.POST(new NextRequest('http://localhost/api/captions/templates', {
    method: 'POST',
    body: JSON.stringify({ name: 'x'.repeat(101), style: { font: 'Inter' } }),
  }));
  assert.equal(res2.status, 400);

  // 3. Missing style
  const res3 = await route.POST(new NextRequest('http://localhost/api/captions/templates', {
    method: 'POST',
    body: JSON.stringify({ name: 'Valid Name' }),
  }));
  assert.equal(res3.status, 400);

  // 4. Oversized style (> 100 keys)
  const hugeStyle = {};
  for (let i = 0; i < 105; i++) hugeStyle[`key_${i}`] = 'val';
  const res4 = await route.POST(new NextRequest('http://localhost/api/captions/templates', {
    method: 'POST',
    body: JSON.stringify({ name: 'Valid Name', style: hugeStyle }),
  }));
  assert.equal(res4.status, 400);

  // 5. Valid request succeeds
  const res5 = await route.POST(new NextRequest('http://localhost/api/captions/templates', {
    method: 'POST',
    body: JSON.stringify({ name: 'Valid Name', style: { font: 'Inter', size: 24 } }),
  }));
  assert.equal(res5.status, 200);
  assert.equal(inserted, true);
});

test('captions/templates/[id] route rejects invalid template IDs and injection characters', async () => {
  const load = createModuleLoader({
    'app/lib/server/adminAuth.ts': {
      getAuthenticatedUserId: async () => 'user-123',
      getAdminClient: () => ({
        from: () => ({
          select: () => ({ eq: () => ({ or: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
          delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
        }),
      }),
    },
  });

  const route = load('app/api/captions/templates/[id]/route.ts');

  const maliciousIds = [
    'id,user_id.eq.other',
    'id.eq.1; DROP TABLE users',
    '../../../etc/passwd',
    'a'.repeat(65),
    'id with spaces',
  ];

  for (const badId of maliciousIds) {
    const getRes = await route.GET(new NextRequest('http://localhost/api/captions/templates/' + badId), {
      params: Promise.resolve({ id: badId }),
    });
    assert.equal(getRes.status, 400);

    const patchRes = await route.PATCH(new NextRequest('http://localhost/api/captions/templates/' + badId, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'New' }),
    }), {
      params: Promise.resolve({ id: badId }),
    });
    assert.equal(patchRes.status, 400);

    const delRes = await route.DELETE(new NextRequest('http://localhost/api/captions/templates/' + badId, {
      method: 'DELETE',
    }), {
      params: Promise.resolve({ id: badId }),
    });
    assert.equal(delRes.status, 400);
  }
});

// ============================================================================
// 4. ReDoS Resilience on Large Transcripts and Adversarial Prompts
// ============================================================================

test('extractConversationalIntent and extractEditingConstraints resist ReDoS on massive adversarial inputs', () => {
  const load = createModuleLoader();
  const { extractConversationalIntent } = load('app/lib/editor/conversationalIntent.ts');
  const { extractEditingConstraints } = load('app/lib/editor/editingIntent.ts');

  // Adversarial payloads with deep repeating patterns, unclosed quotes, and whitespace variations
  const repeatingTokens = 'when I say "test '.repeat(5000);
  const deepRepetition = 'cut and zoom and add captions and sfx and broll '.repeat(3000);
  const massiveWhitespace = 'word   \t   \n  \r  '.repeat(10000);
  const unquotedPhrases = 'when i say ' + 'repeat '.repeat(3000);

  const t0 = performance.now();
  const intent1 = extractConversationalIntent(deepRepetition);
  const t1 = performance.now();
  assert.ok(t1 - t0 < 100, `Execution took ${t1 - t0}ms, expected < 100ms`);
  assert.ok(intent1.operations.length > 0);

  const t2 = performance.now();
  const intent2 = extractConversationalIntent(repeatingTokens);
  const t3 = performance.now();
  assert.ok(t3 - t2 < 100, `Execution took ${t3 - t2}ms, expected < 100ms`);

  const t4 = performance.now();
  const constraints = extractEditingConstraints(unquotedPhrases);
  const t5 = performance.now();
  assert.ok(t5 - t4 < 100, `Execution took ${t5 - t4}ms, expected < 100ms`);
  assert.ok(Array.isArray(constraints.phraseQuotes));

  const t6 = performance.now();
  extractConversationalIntent(massiveWhitespace);
  const t7 = performance.now();
  assert.ok(t7 - t6 < 100, `Execution took ${t7 - t6}ms, expected < 100ms`);
});

test('Hinglish normalizer resists ReDoS and handles massive transcripts efficiently', () => {
  const load = createModuleLoader();
  const { normalizeHinglishText, normalizeHinglishWords } = load('app/lib/editor/hinglishNormalizer.ts');

  // 10,000 words with mixed Devanagari, extreme punctuation, and repeated stutter
  const massiveText = 'bhaiya!?!?!?!?!?!? matlab matlab ummmmmm hmmmmmm achha achha bilkul bilkul '.repeat(1000);

  const t0 = performance.now();
  const normalized = normalizeHinglishText(massiveText);
  const t1 = performance.now();
  assert.ok(t1 - t0 < 150, `Hinglish normalization took ${t1 - t0}ms, expected < 150ms`);
  assert.ok(normalized.length > 0);

  // Large word array (5,000 timed words)
  const timedWords = Array.from({ length: 5000 }, (_, i) => ({
    word: i % 2 === 0 ? 'matlab!?' : 'bhai',
    start: i * 0.3,
    end: i * 0.3 + 0.25,
  }));

  const t2 = performance.now();
  const normalizedWords = normalizeHinglishWords(timedWords);
  const t3 = performance.now();
  assert.ok(t3 - t2 < 150, `Timed words normalization took ${t3 - t2}ms, expected < 150ms`);
  assert.ok(normalizedWords.length > 0);
});

test('videoCategoryAnalyzer resists ReDoS on large transcripts and clamps processing length', () => {
  const load = createModuleLoader();
  const { analyzeVideoCategories } = load('app/lib/server/videoCategoryAnalyzer.ts');

  // 50,000 character transcript with repetitive keywords
  const hugeTranscript = 'gaming esports streaming stock market finance crypto bitcoin productivity '.repeat(800);

  const t0 = performance.now();
  const analysis = analyzeVideoCategories({
    transcript: hugeTranscript,
    prompt: 'make it viral with deep work and crypto gaming setup',
  });
  const t1 = performance.now();

  assert.ok(t1 - t0 < 100, `Category analysis took ${t1 - t0}ms, expected < 100ms`);
  assert.ok(analysis.primaryCategory);
  assert.ok(analysis.categories.length > 0);
});

// ============================================================================
// 5. Dependency Vulnerability Verification & Next.js Advisory
// ============================================================================

test('Next.js dependency version is patched against security advisories GHSA-mfr8-8qww-v76h and GHSA-vc7v-qv4w-wrv8', () => {
  const nextPkg = require('next/package.json');
  const semverParts = nextPkg.version.split('.').map(Number);
  const [major, minor, patch] = semverParts;

  // Advisory affects next 16.2.0 - 16.4.4. Patched in 16.4.5+ or 16.4.6
  assert.ok(major >= 16, `Major version ${major} should be >= 16`);
  if (major === 16 && minor === 4) {
    assert.ok(patch >= 5, `Next.js version ${nextPkg.version} must be >= 16.4.5 to resolve cache leak advisories`);
  }
  assert.equal(nextPkg.version, '16.4.6', 'Expected Next.js 16.4.6 exact patched version');
});
