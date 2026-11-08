import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');

function loader(mocks = {}, extra = {}) {
  const cache = new Map();
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
    setTimeout,
    clearTimeout,
    fetch: globalThis.fetch,
    process: { env: {} },
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
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    new vm.Script(`(function(require,module,exports){${code}\n})`, { filename }).runInContext(context)(
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

const opts = { prompt: '{"pipelineStage":"applyRequestedEdits"}', systemInstruction: "You are Kreovar's AI video editor. Return JSON." };

test('Groq 429 rate limit triggers automatic fallback to Gemini 3.8 Flash', async () => {
  const urls = [];
  const events = [];
  const load = loader(
    {
      'app/lib/server/providerRegistry.ts': {
        getProviderCredential: async (p) => (p === 'groq' ? 'GROQ_KEY' : 'GEMINI_KEY'),
        recordProviderUsage: async (e) => events.push(e),
      },
    },
    {
      fetch: async (url) => {
        urls.push(url);
        if (url.includes('api.groq.com')) {
          return Response.json({ error: { message: 'Rate limit exceeded' } }, { status: 429, headers: { 'retry-after': '10' } });
        }
        if (url.includes('generativelanguage.googleapis.com')) {
          return Response.json({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify({ summary: 'Gemini fallback edit', decisions: [], toolRequests: [] }) }],
                },
              },
            ],
            usageMetadata: { totalTokenCount: 350 },
          });
        }
        return Response.json({}, { status: 404 });
      },
    }
  );

  const provider = load('app/lib/server/editorProvider');
  const result = await provider.generateEditPlanJson(opts);

  assert.equal(result.provider, 'gemini');
  assert.equal(result.model, 'gemini-3.8-flash');
  assert.equal(result.fallbackReason, 'GROQ_RATE_LIMIT');
  assert.equal(result.value.summary, 'Gemini fallback edit');
  assert.equal(urls.length, 2);
  assert.ok(urls[0].includes('api.groq.com'));
  assert.ok(urls[1].includes('generativelanguage.googleapis.com'));
  assert.ok(events.some((e) => e.providerKey === 'gemini' && e.status === 'success'));
});

test('Groq 503 outage triggers automatic fallback to Gemini 3.8 Flash', async () => {
  const urls = [];
  const load = loader(
    {
      'app/lib/server/providerRegistry.ts': {
        getProviderCredential: async (p) => (p === 'groq' ? 'GROQ_KEY' : 'GEMINI_KEY'),
        recordProviderUsage: async () => {},
      },
    },
    {
      fetch: async (url) => {
        urls.push(url);
        if (url.includes('api.groq.com')) {
          return Response.json({ error: { message: 'Service unavailable' } }, { status: 503 });
        }
        if (url.includes('generativelanguage.googleapis.com')) {
          return Response.json({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify({ summary: 'Recovered via Gemini 3.8 Flash', decisions: [] }) }],
                },
              },
            ],
          });
        }
        return Response.json({}, { status: 404 });
      },
    }
  );

  const provider = load('app/lib/server/editorProvider');
  const result = await provider.generateEditPlanJson(opts);

  assert.equal(result.provider, 'gemini');
  assert.equal(result.model, 'gemini-3.8-flash');
  assert.equal(result.fallbackReason, 'GROQ_UNAVAILABLE');
  assert.equal(result.value.summary, 'Recovered via Gemini 3.8 Flash');
  assert.equal(urls.length, 2);
});

test('Groq timeout triggers automatic fallback to Gemini 3.8 Flash', async () => {
  const urls = [];
  const load = loader(
    {
      'app/lib/server/providerRegistry.ts': {
        getProviderCredential: async (p) => (p === 'groq' ? 'GROQ_KEY' : 'GEMINI_KEY'),
        recordProviderUsage: async () => {},
      },
    },
    {
      fetch: async (url) => {
        urls.push(url);
        if (url.includes('api.groq.com')) {
          const timeoutErr = new Error('Groq request timed out');
          timeoutErr.name = 'TimeoutError';
          throw timeoutErr;
        }
        if (url.includes('generativelanguage.googleapis.com')) {
          return Response.json({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify({ summary: 'Timeout fallback to Gemini', decisions: [] }) }],
                },
              },
            ],
          });
        }
        return Response.json({}, { status: 404 });
      },
    }
  );

  const provider = load('app/lib/server/editorProvider');
  const result = await provider.generateEditPlanJson(opts);

  assert.equal(result.provider, 'gemini');
  assert.equal(result.model, 'gemini-3.8-flash');
  assert.equal(result.value.summary, 'Timeout fallback to Gemini');
  assert.equal(urls.length, 2);
});

test('Preferred provider sticky routing routes directly to Gemini without calling Groq', async () => {
  const urls = [];
  const load = loader(
    {
      'app/lib/server/providerRegistry.ts': {
        getProviderCredential: async (p) => (p === 'groq' ? 'GROQ_KEY' : 'GEMINI_KEY'),
        recordProviderUsage: async () => {},
      },
    },
    {
      fetch: async (url) => {
        urls.push(url);
        if (url.includes('generativelanguage.googleapis.com')) {
          return Response.json({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify({ summary: 'Direct Gemini correction', decisions: [] }) }],
                },
              },
            ],
          });
        }
        return Response.json({}, { status: 404 });
      },
    }
  );

  const provider = load('app/lib/server/editorProvider');
  const result = await provider.generateEditPlanJson(opts, {
    provider: 'gemini',
    fallbackReason: 'GROQ_RATE_LIMIT',
  });

  assert.equal(result.provider, 'gemini');
  assert.equal(result.model, 'gemini-3.8-flash');
  assert.equal(result.fallbackReason, 'GROQ_RATE_LIMIT');
  assert.equal(result.value.summary, 'Direct Gemini correction');
  assert.equal(urls.length, 1);
  assert.ok(urls[0].includes('generativelanguage.googleapis.com'));
});

test('Groq 401 auth error does not fall back to Gemini', async () => {
  const urls = [];
  const load = loader(
    {
      'app/lib/server/providerRegistry.ts': {
        getProviderCredential: async (p) => (p === 'groq' ? 'GROQ_KEY' : 'GEMINI_KEY'),
        recordProviderUsage: async () => {},
      },
    },
    {
      fetch: async (url) => {
        urls.push(url);
        return Response.json({ error: { message: 'Invalid API Key' } }, { status: 401 });
      },
    }
  );

  const provider = load('app/lib/server/editorProvider');
  await assert.rejects(provider.generateEditPlanJson(opts), (err) => err.code === 'GROQ_AUTH_FAILED');
  assert.equal(urls.length, 1);
  assert.ok(urls[0].includes('api.groq.com'));
});

test('User cancellation signal abort does not fall back to Gemini', async () => {
  const controller = new AbortController();
  controller.abort();
  const urls = [];
  const load = loader(
    {
      'app/lib/server/providerRegistry.ts': {
        getProviderCredential: async (p) => (p === 'groq' ? 'GROQ_KEY' : 'GEMINI_KEY'),
        recordProviderUsage: async () => {},
      },
    },
    {
      fetch: async (url) => {
        urls.push(url);
        return Response.json({});
      },
    }
  );

  const provider = load('app/lib/server/editorProvider');
  await assert.rejects(provider.generateEditPlanJson({ ...opts, signal: controller.signal }));
  assert.equal(urls.length, 0);
});
