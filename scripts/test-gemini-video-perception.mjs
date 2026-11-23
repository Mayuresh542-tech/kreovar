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
    URL, URLSearchParams, Error, Date, Number, JSON, process, AbortSignal, console, Buffer, FormData, File, Response,
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
  assert.ok(routeCode.includes('{footageFrames,fallbackFootageFrames,completeEdit,pipelineStage,editingBudget,conversationHistory,videoFile}'), 'Route must pass videoFile to planAiEdit');
});

