import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(root + '/package.json');
const ts = require('typescript');

function loadModule(file, mocks = {}) {
  mocks = {
    'app/lib/supabase.ts': { supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } },
    ...mocks
  };
  const fullPath = path.join(root, file);
  const code = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText.replaceAll('import.meta.url', JSON.stringify(path.join(root, file)));

  const context = vm.createContext({
    URL, URLSearchParams, Error, Date, Number, JSON, process, AbortSignal, AbortController, console, Buffer, Blob, FormData, File, Response,
    ReadableStream, TextEncoder, TextDecoder, setTimeout, clearTimeout,
    Math, Array, Object, Map, Set, Promise, Float32Array, Uint8Array,
    ...mocks
  });

  function resolveReq(s) {
    if (mocks[s]) return mocks[s];
    if (s.startsWith('@/')) {
      const target = s.slice(2);
      const targetTs = target.endsWith('.ts') ? target : target + '.ts';
      if (fs.existsSync(path.join(root, targetTs))) return loadModule(targetTs, mocks);
    }
    if (s.startsWith('.')) {
      const target = path.relative(root, path.resolve(path.dirname(fullPath), s)).replaceAll('\\', '/');
      const targetTs = target.endsWith('.ts') ? target : target + '.ts';
      if (fs.existsSync(path.join(root, targetTs))) return loadModule(targetTs, mocks);
    }
    return require(s);
  }

  const moduleObj = { exports: {} };
  new vm.Script('(function(require,module,exports){' + transpiled + '\n})').runInContext(context)(
    resolveReq,
    moduleObj,
    moduleObj.exports
  );
  return moduleObj.exports;
}

test('geminiService: exports uploadGeminiFile function', () => {
  const gemini = loadModule('app/lib/server/geminiService.ts', {
    './providerRegistry': {
      getProviderCredential: async () => 'mock-gemini-key',
      recordProviderUsage: async () => {}
    }
  });
  assert.equal(typeof gemini.uploadGeminiFile, 'function', 'uploadGeminiFile must be exported');
});

test('geminiService: uploadGeminiFile constructs multipart request and returns file details', async () => {
  let capturedUrl = '';
  let capturedHeaders = {};
  let capturedBody = null;

  const gemini = loadModule('app/lib/server/geminiService.ts', {
    './providerRegistry': {
      getProviderCredential: async () => 'test-api-key',
      recordProviderUsage: async () => {}
    },
    fetch: async (url, init) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers || {};
      capturedBody = init?.body;
      return {
        ok: true,
        json: async () => ({
          file: {
            name: 'files/test-file-123',
            uri: 'https://generativelanguage.googleapis.com/v1beta/files/test-file-123',
            mimeType: 'video/mp4',
            state: 'ACTIVE'
          }
        })
      };
    }
  });

  const dummyVideo = Buffer.from('mock-mp4-stream');
  const result = await gemini.uploadGeminiFile(dummyVideo, 'video/mp4', 'test-video.mp4');

  assert.equal(result.uri, 'https://generativelanguage.googleapis.com/v1beta/files/test-file-123');
  assert.equal(result.mimeType, 'video/mp4');
  assert.equal(result.name, 'files/test-file-123');
  assert.ok(capturedUrl.includes('key=test-api-key'));
  assert.ok(capturedUrl.includes('upload/v1beta/files'));
});

test('geminiService: generateGeminiContent passes file_data in contents parts when videoFile is provided', async () => {
  let sentPayload = null;

  const gemini = loadModule('app/lib/server/geminiService.ts', {
    './providerRegistry': {
      getProviderCredential: async () => 'test-api-key',
      recordProviderUsage: async () => {}
    },
    fetch: async (url, init) => {
      sentPayload = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: 'Video analyzed', decisions: [] }) }] } }],
          usageMetadata: { totalTokenCount: 1500 }
        })
      };
    }
  });

  await gemini.generateGeminiContent({
    prompt: 'Analyze video pacing and gestures',
    videoFile: {
      uri: 'https://generativelanguage.googleapis.com/v1beta/files/mock-vid-1',
      mimeType: 'video/mp4'
    }
  });

  assert.ok(sentPayload, 'Payload should have been sent');
  const userContent = sentPayload.contents[0];
  const videoPart = userContent.parts.find((p) => p.file_data);
  assert.ok(videoPart, 'A file_data part should be present in the user parts');
  assert.equal(videoPart.file_data.file_uri, 'https://generativelanguage.googleapis.com/v1beta/files/mock-vid-1');
  assert.equal(videoPart.file_data.mime_type, 'video/mp4');
});

test('editorAi: system prompt contains gesture and face framing directives for native video perception', () => {
  const code = fs.readFileSync(path.join(root, 'app/lib/server/editorAi.ts'), 'utf8');
  assert.ok(code.includes('speaker pointing gestures') || code.includes('gesture tracking'), 'Must instruct model on gestures');
  assert.ok(code.includes('focusX') && code.includes('focusY'), 'Must instruct model on focusX/focusY face framing');
  assert.ok(code.includes('visual gaze') || code.includes('framing and face position'), 'Must instruct model on gaze or framing');
});

test('editorProvider: generateEditPlanJson prioritizes Gemini when videoFile is present and routes videoFile through', async () => {
  let geminiCalledWith = null;

  const provider = loadModule('app/lib/server/editorProvider.ts', {
    './geminiService': {
      GEMINI_EDITOR_MODEL: 'gemini-2.0-flash',
      generateGeminiJson: async (opts) => {
        geminiCalledWith = opts;
        return { summary: 'Gemini video edit plan', decisions: [] };
      }
    },
    './groqEditorFallback': {
      GroqEditorError: class GroqEditorError extends Error {},
      generateGroqEditorJson: async () => {
        throw new Error('Should not call Groq when Gemini handles video');
      }
    },
    './radoxService': {
      RadoxEditorError: class RadoxEditorError extends Error {},
      generateEditorJson: async () => {}
    }
  });

  const result = await provider.generateEditPlanJson({
    prompt: '{"instruction":"edit video"}',
    systemInstruction: 'You are an editor.',
    videoFile: {
      uri: 'https://generativelanguage.googleapis.com/v1beta/files/test-video-uri',
      mimeType: 'video/mp4'
    }
  });

  assert.equal(result.provider, 'gemini');
  assert.ok(geminiCalledWith, 'generateGeminiJson should be called');
  assert.equal(geminiCalledWith.videoFile?.uri, 'https://generativelanguage.googleapis.com/v1beta/files/test-video-uri');
});

test('editorProvider: falls back to Groq if Gemini fails during video perception', async () => {
  let groqCalled = false;

  const provider = loadModule('app/lib/server/editorProvider.ts', {
    './geminiService': {
      GEMINI_EDITOR_MODEL: 'gemini-2.0-flash',
      generateGeminiJson: async () => {
        throw new Error('GEMINI_NOT_CONFIGURED');
      }
    },
    './groqEditorFallback': {
      GroqEditorError: class GroqEditorError extends Error {},
      generateGroqEditorJson: async () => {
        groqCalled = true;
        return {
          value: { summary: 'Groq fallback edit plan', decisions: [] },
          model: 'qwen3.8-27b',
          attempts: 1,
          imageCount: 0
        };
      }
    },
    './radoxService': {
      RadoxEditorError: class RadoxEditorError extends Error {},
      generateEditorJson: async () => {}
    }
  });

  const result = await provider.generateEditPlanJson({
    prompt: '{"instruction":"edit video"}',
    systemInstruction: 'You are an editor.',
    videoFile: {
      uri: 'https://generativelanguage.googleapis.com/v1beta/files/test-video-uri',
      mimeType: 'video/mp4'
    }
  });

  assert.equal(result.provider, 'groq');
  assert.ok(groqCalled, 'Should fall back to Groq');
});

test('ai-edit route: accepts videoFile in request body and wires to planAiEdit context', () => {
  const routeCode = fs.readFileSync(path.join(root, 'app/api/editor/ai-edit/route.ts'), 'utf8');
  assert.ok(routeCode.includes('videoFile'), 'Route must declare videoFile');
  assert.ok(routeCode.includes('body.videoFile'), 'Route must inspect body.videoFile');
  assert.match(routeCode, /planAiEdit\([\s\S]*\{[\s\S]*videoFile[\s\S]*\}/, 'Route must pass videoFile to planAiEdit');
});

test('ai-video route: rejects missing auth, handles unconfigured Gemini, and uploads valid proxy', async () => {
  const { NextRequest } = require('next/server');
  const routePath = 'app/api/editor/ai-video/route.ts';

  const loadRoute = (overrides = {}) => loadModule(routePath, {
      '@/app/lib/server/adminAuth': {
        getAdminClient: () => ({
          auth: {
            getUser: async (token) =>
              token === 'valid-token'
                ? { data: { user: { id: 'user-1' } }, error: null }
                : { data: { user: null }, error: new Error('invalid') }
          }
        })
      },
      '@/app/lib/server/projectAccess': {
        requireOwnedProject: async () => {}
      },
      '@/app/lib/server/geminiService': {
        uploadGeminiFile: async (buf, mimeType, name) => ({
          uri: 'https://generativelanguage.googleapis.com/v1beta/files/proxy-123',
          mimeType,
          name: `files/${name}`
        })
      },
      ...overrides
    });

  // 1. Unauthenticated request returns 401
  const { POST } = loadRoute();
  const unauthedReq = new NextRequest('http://localhost/api/editor/ai-video', { method: 'POST' });
  const unauthedRes = await POST(unauthedReq);
  assert.equal(unauthedRes.status, 401);

  // 1b. Non-UUID projectId returns 400
  const badProjForm = new FormData();
  badProjForm.append('projectId', 'not-a-uuid');
  badProjForm.append('file', new Blob([Buffer.from('fake-mp4')], { type: 'video/mp4' }), 'preview.mp4');
  const badProjRes = await POST(new NextRequest('http://localhost/api/editor/ai-video', {
    method: 'POST',
    headers: { Authorization: 'Bearer valid-token' },
    body: badProjForm
  }));
  assert.equal(badProjRes.status, 400);

  // 2. Unconfigured Gemini returns 503 cleanly without crashing
  const { POST: unconfiguredPost } = loadRoute({
    '@/app/lib/server/geminiService': {
      uploadGeminiFile: async () => { throw new Error('GEMINI_NOT_CONFIGURED'); }
    }
  });
  const form503 = new FormData();
  form503.append('projectId', '11111111-1111-4111-8111-111111111111');
  form503.append('file', new Blob([Buffer.from('fake-mp4')], { type: 'video/mp4' }), 'preview.mp4');
  const req503 = new NextRequest('http://localhost/api/editor/ai-video', {
    method: 'POST',
    headers: { Authorization: 'Bearer valid-token' },
    body: form503
  });
  const res503 = await unconfiguredPost(req503);
  assert.equal(res503.status, 503);
  const body503 = await res503.json();
  assert.equal(body503.available, false);

  // 3. Valid proxy upload returns Gemini file URI
  const formOk = new FormData();
  formOk.append('projectId', '11111111-1111-4111-8111-111111111111');
  formOk.append('file', new Blob([Buffer.from('fake-mp4-bytes')], { type: 'video/mp4' }), 'clip.mp4');
  const reqOk = new NextRequest('http://localhost/api/editor/ai-video', {
    method: 'POST',
    headers: { Authorization: 'Bearer valid-token' },
    body: formOk
  });
  const resOk = await POST(reqOk);
  assert.equal(resOk.status, 200);
  const bodyOk = await resOk.json();
  assert.equal(bodyOk.uri, 'https://generativelanguage.googleapis.com/v1beta/files/proxy-123');
  assert.equal(bodyOk.mimeType, 'video/mp4');
});

test('videoPerceptionClient: uploads small clip directly, caches URI, and falls back gracefully on 503', async () => {
  let uploadCalls = 0;
  const mockFetch = async (url, init) => {
    if (String(url).startsWith('blob:')) {
      return {
        ok: true,
        blob: async () => new Blob([Buffer.from('small-video-bytes')], { type: 'video/mp4' })
      };
    }
    if (String(url) === '/api/editor/ai-video') {
      uploadCalls++;
      assert.equal(init.method, 'POST');
      assert.equal(init.headers.Authorization, 'Bearer tok-1');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          uri: 'https://generativelanguage.googleapis.com/v1beta/files/cached-1',
          mimeType: 'video/mp4'
        })
      };
    }
    throw new Error('Unexpected fetch: ' + url);
  };

  const clientMod = loadModule('app/lib/editor/videoPerceptionClient.ts', { fetch: mockFetch });
  const project = {
    schemaVersion: 1,
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Test',
    revision: 1,
    updatedAt: '',
    trackOrder: ['track-video'],
    tracks: { 'track-video': { id: 'track-video', name: 'Video 1', kind: 'video', clipIds: ['c1'], hidden: false, muted: false, locked: false } },
    clips: {
      c1: {
        id: 'c1', assetId: 'a1', trackId: 'track-video', name: 'clip.mp4',
        startTime: 0, duration: 5, sourceStart: 0, sourceEnd: 5,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
        volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
        effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }
      }
    },
    assets: {
      a1: { id: 'a1', name: 'clip.mp4', kind: 'video', mime: 'video/mp4', size: 123, duration: 5, width: 720, height: 1280 }
    },
    textLayers: {},
    captions: {},
    transitions: {},
    settings: { aspectRatio: '9:16', fps: 30, background: '#000000' }
  };

  const cache = new Map();
  const controller = new AbortController();
  const first = await clientMod.captureVideoFileForAi(project, ['c1'], async () => 'blob:clip-1', 'tok-1', controller.signal, cache);
  assert.equal(first?.uri, 'https://generativelanguage.googleapis.com/v1beta/files/cached-1');
  assert.equal(first?.mimeType, 'video/mp4');
  assert.equal(uploadCalls, 1);

  // Second call hits cache without re-uploading
  const second = await clientMod.captureVideoFileForAi(project, ['c1'], async () => 'blob:clip-1', 'tok-1', controller.signal, cache);
  assert.equal(second?.uri, first?.uri);
  assert.equal(second?.mimeType, first?.mimeType);
  assert.equal(uploadCalls, 1);

  // 503 unconfigured response falls back gracefully to undefined and caches null
  const fallbackClient = loadModule('app/lib/editor/videoPerceptionClient.ts', {
    fetch: async (url) => String(url).startsWith('blob:')
      ? { ok: true, blob: async () => new Blob([Buffer.from('small-video-bytes')], { type: 'video/mp4' }) }
      : { ok: false, status: 503, json: async () => ({ available: false }) }
  });
  const fallbackCache = new Map();
  const fallbackRes = await fallbackClient.captureVideoFileForAi(project, ['c1'], async () => 'blob:clip-1', 'tok-1', controller.signal, fallbackCache);
  assert.equal(fallbackRes, undefined);
  assert.equal(fallbackCache.size, 1);

  // Verify client callers wire videoFile into ai-edit requests
  const seqCode = fs.readFileSync(path.join(root, 'app/lib/editor/sequentialEditClient.ts'), 'utf8');
  const dlgCode = fs.readFileSync(path.join(root, 'app/components/editor/workspace/AiEditDialog.tsx'), 'utf8');
  assert.ok(seqCode.includes('captureVideoFileForAi') && seqCode.includes('videoFile'), 'sequentialEditClient must wire videoFile');
  assert.ok(dlgCode.includes('captureVideoFileForAi') && dlgCode.includes('videoFile'), 'AiEditDialog must wire videoFile');
});

