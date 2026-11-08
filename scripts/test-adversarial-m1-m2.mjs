import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');

function providerLoader(mocks = {}, extra = {}) {
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
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
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

function pipelineLoader(mocks = {}) {
  mocks = {
    'app/lib/server/planUsage.ts': {
      withUsage: (h) => h,
      reserveUsage: async () => ({ reservationId: 'test-usage' }),
      finishUsage: async () => {},
      PlanLimitError: class extends Error {},
      usageError: () => new Response('{}', { status: 503 }),
    },
    'app/lib/server/speechDuration.ts': { speechDuration: async () => 1 },
    'app/lib/supabase.ts': { supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } },
    ...mocks,
  };
  const cache = new Map();
  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) filename += '.ts';
    const key = path.relative(root, filename).replaceAll('\\', '/');
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(filename).href));
    const localRequire = (specifier) =>
      specifier.startsWith('@/')
        ? load(specifier.slice(2))
        : specifier.startsWith('.')
        ? load(path.relative(root, path.resolve(path.dirname(filename), specifier)))
        : require(specifier);
    new vm.Script(`(function(require,module,exports){${source}\n})`, { filename }).runInThisContext()(
      localRequire,
      loadedModule,
      loadedModule.exports
    );
    return loadedModule.exports;
  }
  return load;
}

const defaultOpts = {
  prompt: '{"pipelineStage":"applyRequestedEdits"}',
  systemInstruction: "You are Kreovar's AI video editor. Return JSON.",
};

// =========================================================================
// Category 1: Concurrency and Cancellation Signals
// =========================================================================

test('Adversarial 1.1: Caller AbortSignal triggers DURING in-flight Groq call -> must abort cleanly without Gemini fallback', async () => {
  const urls = [];
  const events = [];
  const controller = new AbortController();

  const load = providerLoader(
    {
      'app/lib/server/providerRegistry.ts': {
        getProviderCredential: async () => 'TEST_KEY',
        recordProviderUsage: async (e) => events.push(e),
      },
    },
    {
      fetch: async (url, fetchOpts) => {
        urls.push(url);
        if (url.includes('api.groq.com')) {
          return new Promise((resolve, reject) => {
            const onAbort = () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            };
            if (fetchOpts?.signal?.aborted) return onAbort();
            fetchOpts?.signal?.addEventListener('abort', onAbort);

            // Abort after 40ms while in-flight
            setTimeout(() => {
              controller.abort(new Error('Caller cancelled operation'));
            }, 40);
          });
        }
        if (url.includes('generativelanguage.googleapis.com')) {
          return Response.json({
            candidates: [{ content: { parts: [{ text: '{"summary":"GEMINI_UNEXPECTED"}' }] } }],
          });
        }
        return Response.json({}, { status: 404 });
      },
    }
  );

  const provider = load('app/lib/server/editorProvider');
  await assert.rejects(
    provider.generateEditPlanJson({ ...defaultOpts, signal: controller.signal }),
    (err) => {
      return err.name === 'AbortError' || err.message?.includes('cancelled');
    }
  );

  // Assert Groq was called, but Gemini was NEVER contacted
  assert.equal(urls.length, 1, 'Only Groq should have been called');
  assert.ok(urls[0].includes('api.groq.com'));
  assert.ok(!urls.some((u) => u.includes('generativelanguage.googleapis.com')), 'Gemini must not be called');
  assert.ok(!events.some((e) => e.providerKey === 'gemini'), 'Gemini usage must not be recorded');
});

test('Adversarial 1.2: Pre-aborted signal rejects immediately before network call', async () => {
  const controller = new AbortController();
  controller.abort(new Error('Pre-aborted'));
  let fetchCalled = false;

  const load = providerLoader(
    {
      'app/lib/server/providerRegistry.ts': {
        getProviderCredential: async () => 'TEST_KEY',
        recordProviderUsage: async () => {},
      },
    },
    {
      fetch: async () => {
        fetchCalled = true;
        return Response.json({});
      },
    }
  );

  const provider = load('app/lib/server/editorProvider');
  await assert.rejects(
    provider.generateEditPlanJson({ ...defaultOpts, signal: controller.signal }),
    (err) => err.message === 'Pre-aborted' || err.name === 'AbortError'
  );
  assert.equal(fetchCalled, false, 'No network requests should be made');
});

test('Adversarial 1.3: AbortSignal triggered DURING fallback Gemini call aborts without secondary retries', async () => {
  const urls = [];
  const controller = new AbortController();

  const load = providerLoader(
    {
      'app/lib/server/providerRegistry.ts': {
        getProviderCredential: async (p) => (p === 'groq' ? 'GROQ_KEY' : 'GEMINI_KEY'),
        recordProviderUsage: async () => {},
      },
    },
    {
      fetch: async (url, fetchOpts) => {
        urls.push(url);
        if (url.includes('api.groq.com')) {
          // Groq returns 429 to trigger fallback
          return Response.json({ error: { message: 'Rate limit' } }, { status: 429 });
        }
        if (url.includes('generativelanguage.googleapis.com')) {
          return new Promise((resolve, reject) => {
            const onAbort = () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            };
            if (fetchOpts?.signal?.aborted) return onAbort();
            fetchOpts?.signal?.addEventListener('abort', onAbort);

            // Abort while Gemini is in-flight
            setTimeout(() => {
              controller.abort(new Error('Cancelled during Gemini fallback'));
            }, 30);
          });
        }
        return Response.json({}, { status: 404 });
      },
    }
  );

  const provider = load('app/lib/server/editorProvider');
  await assert.rejects(
    provider.generateEditPlanJson({ ...defaultOpts, signal: controller.signal }),
    (err) => err.name === 'AbortError' || err.message?.includes('Cancelled')
  );

  // Groq called once (429), Gemini called once and aborted (not retried across all candidate models)
  assert.ok(urls[0].includes('api.groq.com'));
  assert.ok(urls[1].includes('generativelanguage.googleapis.com'));
  assert.equal(urls.length, 2, 'Gemini must not retry subsequent models after cancellation');
});

test('Adversarial 1.4: Discrimination between internal TimeoutError (falls back to Gemini) vs AbortSignal (does not)', async () => {
  // Scenario A: TimeoutError (not caller-aborted) -> should fallback to Gemini
  const urlsA = [];
  const loadA = providerLoader(
    {
      'app/lib/server/providerRegistry.ts': {
        getProviderCredential: async () => 'KEY',
        recordProviderUsage: async () => {},
      },
    },
    {
      fetch: async (url) => {
        urlsA.push(url);
        if (url.includes('api.groq.com')) {
          const timeout = new Error('Groq gateway timeout');
          timeout.name = 'TimeoutError';
          throw timeout;
        }
        if (url.includes('generativelanguage.googleapis.com')) {
          return Response.json({
            candidates: [{ content: { parts: [{ text: '{"summary":"Recovered from Timeout"}' }] } }],
          });
        }
        return Response.json({}, { status: 404 });
      },
    }
  );

  const providerA = loadA('app/lib/server/editorProvider');
  const resultA = await providerA.generateEditPlanJson(defaultOpts);
  assert.equal(resultA.provider, 'gemini');
  assert.equal(resultA.value.summary, 'Recovered from Timeout');
  assert.equal(urlsA.length, 2);

  // Scenario B: AbortError from caller signal -> must NOT fallback
  const urlsB = [];
  const controller = new AbortController();
  const loadB = providerLoader(
    {
      'app/lib/server/providerRegistry.ts': {
        getProviderCredential: async () => 'KEY',
        recordProviderUsage: async () => {},
      },
    },
    {
      fetch: async (url) => {
        urlsB.push(url);
        controller.abort();
        const abortErr = new Error('Aborted by user');
        abortErr.name = 'AbortError';
        throw abortErr;
      },
    }
  );

  const providerB = loadB('app/lib/server/editorProvider');
  await assert.rejects(
    providerB.generateEditPlanJson({ ...defaultOpts, signal: controller.signal }),
    (err) => err.name === 'AbortError' || controller.signal.aborted
  );
  assert.equal(urlsB.length, 1);
  assert.ok(urlsB[0].includes('api.groq.com'));
});

// =========================================================================
// Category 2: Error Code Discrimination
// =========================================================================

test('Adversarial 2.1: GROQ_AUTH_FAILED (401/403) must NOT attempt Gemini fallback', async () => {
  const urls = [];
  const load = providerLoader(
    {
      'app/lib/server/providerRegistry.ts': {
        getProviderCredential: async () => 'INVALID_GROQ_KEY',
        recordProviderUsage: async () => {},
      },
    },
    {
      fetch: async (url) => {
        urls.push(url);
        return Response.json({ error: { message: 'Invalid API Key', type: 'invalid_request_error' } }, { status: 401 });
      },
    }
  );

  const provider = load('app/lib/server/editorProvider');
  await assert.rejects(
    provider.generateEditPlanJson(defaultOpts),
    (err) => err.code === 'GROQ_AUTH_FAILED'
  );
  assert.equal(urls.length, 1);
  assert.ok(urls[0].includes('api.groq.com'));
});

test('Adversarial 2.2: GROQ_ALLOWANCE_REACHED (402) must NOT attempt Gemini fallback', async () => {
  const urls = [];
  const load = providerLoader(
    {
      'app/lib/server/providerRegistry.ts': {
        getProviderCredential: async () => 'KEY',
        recordProviderUsage: async () => {},
      },
    },
    {
      fetch: async (url) => {
        urls.push(url);
        return Response.json({ error: { message: 'Insufficient balance' } }, { status: 402 });
      },
    }
  );

  const provider = load('app/lib/server/editorProvider');
  await assert.rejects(
    provider.generateEditPlanJson(defaultOpts),
    (err) => err.code === 'GROQ_ALLOWANCE_REACHED'
  );
  assert.equal(urls.length, 1);
  assert.ok(urls[0].includes('api.groq.com'));
});

test('Adversarial 2.3: GROQ_REQUEST_CAPACITY (413) must NOT attempt Gemini fallback', async () => {
  const urls = [];
  const load = providerLoader(
    {
      'app/lib/server/providerRegistry.ts': {
        getProviderCredential: async () => 'KEY',
        recordProviderUsage: async () => {},
      },
    },
    {
      fetch: async (url) => {
        urls.push(url);
        return Response.json({ error: { message: 'Payload too large' } }, { status: 413 });
      },
    }
  );

  const provider = load('app/lib/server/editorProvider');
  await assert.rejects(
    provider.generateEditPlanJson(defaultOpts),
    (err) => err.code === 'GROQ_REQUEST_CAPACITY'
  );
  assert.equal(urls.length, 1);
  assert.ok(urls[0].includes('api.groq.com'));
});

test('Adversarial 2.4: GROQ_SCHEMA_REJECTED (400) must NOT attempt Gemini fallback', async () => {
  const urls = [];
  const load = providerLoader(
    {
      'app/lib/server/providerRegistry.ts': {
        getProviderCredential: async () => 'KEY',
        recordProviderUsage: async () => {},
      },
    },
    {
      fetch: async (url) => {
        urls.push(url);
        return Response.json({ error: { message: 'JSON schema validation failed', code: 'json_validate_failed' } }, { status: 400 });
      },
    }
  );

  const provider = load('app/lib/server/editorProvider');
  await assert.rejects(
    provider.generateEditPlanJson(defaultOpts),
    (err) => err.code === 'GROQ_SCHEMA_REJECTED'
  );
  assert.equal(urls.length, 1);
  assert.ok(urls[0].includes('api.groq.com'));
});

test('Adversarial 2.5: Rate limit 429 and 503 outage DO fall back to Gemini 3.8 Flash', async () => {
  for (const [status, expectedReason] of [[429, 'GROQ_RATE_LIMIT'], [503, 'GROQ_UNAVAILABLE']]) {
    const urls = [];
    const load = providerLoader(
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
            return Response.json({ error: { message: 'Error ' + status } }, { status });
          }
          if (url.includes('generativelanguage.googleapis.com')) {
            return Response.json({
              candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: 'Fallback Success', decisions: [] }) }] } }],
            });
          }
          return Response.json({}, { status: 404 });
        },
      }
    );

    const provider = load('app/lib/server/editorProvider');
    const result = await provider.generateEditPlanJson(defaultOpts);
    assert.equal(result.provider, 'gemini');
    assert.equal(result.model, 'gemini-3.8-flash');
    assert.equal(result.fallbackReason, expectedReason);
    assert.equal(urls.length, 2);
  }
});

// =========================================================================
// Category 3: Dynamic Captions In-Place Restyling & Entry Motion
// =========================================================================

test('Adversarial 3.1: Dynamic captions in-place restyling with applyCaptionTemplate updates style without duplicating clips', () => {
  const load = pipelineLoader();
  const model = load('app/lib/editor/model.ts');
  const ops = load('app/lib/editor/operations.ts');
  const seq = load('app/lib/editor/sequentialEdit.ts');

  // Create project with footage
  let p = model.createProject('caption-restyling-test');
  p = ops.addAsset(p, { id: 'v1', kind: 'video', name: 'v1.mp4', duration: 10, width: 720, height: 1280, mime: 'video/mp4', size: 100, url: '/test/v1.mp4' });
  p = ops.addClip(p, 'v1', 'track-video', 0, { id: 'footage', duration: 10, sourceEnd: 10 });

  // Add initial captions with template 'clean-sub'
  p = ops.addCaption(p, 'Hello world', 1, 3, {}, [{ word: 'Hello', start: 0, end: 1 }, { word: 'world', start: 1, end: 2.5 }]);
  p = ops.addCaption(p, 'Second line', 4.5, 3, {}, [{ word: 'Second', start: 0, end: 1 }, { word: 'line', start: 1, end: 2.5 }]);

  const initialClipCount = Object.keys(p.clips).length;
  const initialCaptions = Object.values(p.captions);
  assert.equal(initialCaptions.length, 2);
  const captionClipIds = Object.values(p.clips).filter((c) => c.contentId && p.captions[c.contentId]).map((c) => c.id);
  assert.equal(captionClipIds.length, 2);

  // Apply new template 'signature-poppins'
  const output = {
    summary: 'Restyle existing captions with signature-poppins',
    decisions: [
      {
        op: 'applyCaptionTemplate',
        clipIds: captionClipIds,
        templateId: 'signature-poppins',
      },
    ],
    animateCaptions: true,
  };

  const next = seq.buildStageProject(p, output);

  // Clips count must NOT increase (no duplicate clips)
  assert.equal(Object.keys(next.clips).length, initialClipCount, 'Clip count must remain identical');
  assert.equal(Object.keys(next.captions).length, 2, 'Caption count must remain identical');

  // Verify captions got updated styles
  for (const clipId of captionClipIds) {
    const clip = next.clips[clipId];
    const cap = next.captions[clip.contentId];
    assert.equal(cap.motion, 'pop', 'Caption motion must be updated to pop');
    assert.equal(cap.style?.font, 'Poppins', 'Font must be updated to Poppins');
    assert.equal(cap.style?.fontAccent?.font, 'Caveat', 'Font accent must be updated to Caveat');
  }

  // validateStageChanges must pass
  const validated = seq.validateStageChanges('applyCaptions', p, next, output);
  assert.ok(validated);
});

test('Adversarial 3.2: Dynamic entry motion (pop) activation and scale curve verification', () => {
  const load = pipelineLoader();
  const motion = load('app/lib/editor/captionMotion.ts');

  const dummyClip = {
    id: 'c1',
    trackId: 'track-captions',
    contentId: 'cap1',
    startTime: 2.0,
    duration: 3.0,
    sourceStart: 0,
    sourceEnd: 3.0,
    speed: 1,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
  };

  const dummyCaption = {
    id: 'cap1',
    text: 'Test pop animation',
    motion: 'pop',
    words: [{ word: 'Test', start: 0, end: 0.5 }, { word: 'pop', start: 0.5, end: 1.5 }, { word: 'animation', start: 1.5, end: 2.5 }],
  };

  // Test at exact clip start time: scale should be 1 - 0.12 = 0.88
  const frameStart = motion.captionMotionFrame(dummyCaption, dummyClip, 2.0);
  assert.equal(Math.round(frameStart.scale * 100) / 100, 0.88, 'Scale at start should be 0.88');

  // Test at halfway through entrance (0.08s): scale should be between 0.88 and 1.0
  const frameMid = motion.captionMotionFrame(dummyCaption, dummyClip, 2.08);
  assert.ok(frameMid.scale > 0.88 && frameMid.scale < 1.0, 'Scale during entrance should be intermediate');

  // Test after entrance completed (>= 0.16s, e.g. 2.20s): scale must be 1.0
  const frameSettled = motion.captionMotionFrame(dummyCaption, dummyClip, 2.2);
  assert.equal(frameSettled.scale, 1.0, 'Scale after 0.16s must be exactly 1.0');
});

test('Adversarial 3.3: validateStageChanges rejects empty/invisible captions', () => {
  const load = pipelineLoader();
  const model = load('app/lib/editor/model.ts');
  const ops = load('app/lib/editor/operations.ts');
  const seq = load('app/lib/editor/sequentialEdit.ts');

  let p = model.createProject('empty-caption-test');
  p = ops.addAsset(p, { id: 'v1', kind: 'video', name: 'v1.mp4', duration: 10, width: 720, height: 1280, mime: 'video/mp4', size: 100, url: '/test/v1.mp4' });
  p = ops.addClip(p, 'v1', 'track-video', 0, { id: 'footage', duration: 10, sourceEnd: 10 });

  // Add caption with valid word structure but whitespace
  let next = ops.addCaption(p, 'HiddenText', 1, 2, {});
  // Mutate text to whitespace
  const capId = Object.keys(next.captions)[0];
  next = { ...next, captions: { ...next.captions, [capId]: { ...next.captions[capId], text: '   ' } } };

  const output = {
    summary: 'Empty caption',
    decisions: [{ op: 'addCaption', text: '   ', startTime: 1, duration: 2 }],
  };

  assert.throws(
    () => seq.validateStageChanges('applyCaptions', p, next, output),
    /Captions were not applied visibly with valid timing|Invalid or missing text/
  );
});

// =========================================================================
// Category 4: Preset Resilience & validateCompletedJob Edge Cases
// =========================================================================

test('Adversarial 4.1: Preset on short footage (<4s) validates completed job when all supporting stages skip', () => {
  const load = pipelineLoader();
  const model = load('app/lib/editor/model.ts');
  const ops = load('app/lib/editor/operations.ts');
  const seq = load('app/lib/editor/sequentialEdit.ts');

  // Short footage: 3.2 seconds
  let p = model.createProject('short-preset-test');
  p = ops.addAsset(p, { id: 'v1', kind: 'video', name: 'v1.mp4', duration: 3.2, width: 720, height: 1280, mime: 'video/mp4', size: 100, url: '/test/v1.mp4' });
  p = ops.addClip(p, 'v1', 'track-video', 0, { id: 'footage', duration: 3.2, sourceEnd: 3.2 });

  // Add 1 valid caption
  let next = ops.addCaption(p, 'Quick speech', 0.5, 2.0, {}, [{ word: 'Quick', start: 0, end: 0.8 }, { word: 'speech', start: 0.8, end: 1.8 }]);
  const captionOutput = seq.validateStageChanges('applyCaptions', p, next, {
    summary: 'Captions added',
    decisions: [{ op: 'addCaption', text: 'Quick speech', startTime: 0.5, duration: 2.0 }],
  });

  const preset = seq.PIPELINE_PRESETS.find((pr) => pr.id === 'engaging');
  const job = seq.createEditingJob(p, preset.instruction, [], preset);

  // Simulate execution: analyzeFootage completed, applyCaptions completed, motionGraphics/broll/zooms skipped with 0 additions
  job.status = 'running';
  job.completedStages = ['analyzeFootage', 'applyCaptions', 'planMotionGraphics', 'applyMotionGraphics', 'findBroll', 'applyBroll', 'applyZooms'];
  job.appliedOperations = [job.id + ':applyCaptions'];
  next.revision = p.revision + 1;

  job.stages = [
    { id: 'analyzeFootage', key: job.id + ':analyzeFootage', status: 'completed', attempts: 1, output: { summary: 'Analyzed short clip' } },
    { id: 'applyCaptions', key: job.id + ':applyCaptions', status: 'completed', attempts: 1, output: captionOutput },
    { id: 'planMotionGraphics', key: job.id + ':planMotionGraphics', status: 'completed', attempts: 1, output: { summary: 'Short clip, skipping graphics', decisions: [] } },
    { id: 'applyMotionGraphics', key: job.id + ':applyMotionGraphics', status: 'completed', attempts: 1, output: { summary: 'Skipped', decisions: [] } },
    { id: 'findBroll', key: job.id + ':findBroll', status: 'completed', attempts: 1, output: { summary: 'No B-roll needed for 3.2s', decisions: [] } },
    { id: 'applyBroll', key: job.id + ':applyBroll', status: 'completed', attempts: 1, output: { summary: 'Skipped', decisions: [] } },
    { id: 'applyZooms', key: job.id + ':applyZooms', status: 'completed', attempts: 1, output: { summary: 'No zooms for short clip', decisions: [] } },
    { id: 'validateEdit', key: job.id + ':validateEdit', status: 'pending', attempts: 0 },
  ];

  // Verify validateStageChanges permits 0 additions for all supporting stages on short footage
  assert.equal(seq.permitsZeroAdditions('applyMotionGraphics', p, { summary: '' }, job), true);
  assert.equal(seq.permitsZeroAdditions('applyBroll', p, { summary: '' }, job), true);
  assert.equal(seq.permitsZeroAdditions('applyZooms', p, { summary: '' }, job), true);

  // validateCompletedJob must PASS without throwing
  const result = seq.validateCompletedJob(next, job);
  assert.ok(result.summary.includes('validated'));
});

test('Adversarial 4.2: Preset on speech-free footage validates completed job when all stages skip', () => {
  const load = pipelineLoader();
  const model = load('app/lib/editor/model.ts');
  const ops = load('app/lib/editor/operations.ts');
  const seq = load('app/lib/editor/sequentialEdit.ts');

  // 6s footage with no speech
  let p = model.createProject('silent-preset-test');
  p = ops.addAsset(p, { id: 'v1', kind: 'video', name: 'v1.mp4', duration: 6.0, width: 720, height: 1280, mime: 'video/mp4', size: 100, url: '/test/v1.mp4' });
  p = ops.addClip(p, 'v1', 'track-video', 0, { id: 'footage', duration: 6.0, sourceEnd: 6.0 });

  const preset = seq.PIPELINE_PRESETS.find((pr) => pr.id === 'punchy');
  const job = seq.createEditingJob(p, preset.instruction, [], preset);

  job.status = 'running';
  job.completedStages = ['analyzeFootage', 'applyCaptions', 'planMotionGraphics', 'applyMotionGraphics', 'applyZooms', 'applySoundEffects'];
  job.appliedOperations = []; // 0 operations applied

  job.stages = [
    { id: 'analyzeFootage', key: job.id + ':analyzeFootage', status: 'completed', attempts: 1, output: { summary: 'Silent footage analyzed' } },
    { id: 'applyCaptions', key: job.id + ':applyCaptions', status: 'completed', attempts: 1, output: { summary: 'No speech found', decisions: [] } },
    { id: 'planMotionGraphics', key: job.id + ':planMotionGraphics', status: 'completed', attempts: 1, output: { summary: 'Skipped', decisions: [] } },
    { id: 'applyMotionGraphics', key: job.id + ':applyMotionGraphics', status: 'completed', attempts: 1, output: { summary: 'Skipped', decisions: [] } },
    { id: 'applyZooms', key: job.id + ':applyZooms', status: 'completed', attempts: 1, output: { summary: 'Preserve framing', decisions: [] } },
    { id: 'applySoundEffects', key: job.id + ':applySoundEffects', status: 'completed', attempts: 1, output: { summary: 'No sound effects', decisions: [] } },
    { id: 'validateEdit', key: job.id + ':validateEdit', status: 'pending', attempts: 0 },
  ];

  // Must tolerate zero additions because it is a preset and speech is 0
  assert.equal(seq.permitsZeroAdditions('applyZooms', p, { summary: 'Preserve framing' }, job), true);
  assert.equal(seq.permitsZeroAdditions('applySoundEffects', p, { summary: 'No sound effects' }, job), true);

  const result = seq.validateCompletedJob(p, job);
  assert.ok(result.summary.includes('validated'));
});

test('Adversarial 4.3: Non-preset explicit zoom request on 10s footage with speech MUST REJECT when 0 zooms returned without skip rationale', () => {
  const load = pipelineLoader();
  const model = load('app/lib/editor/model.ts');
  const ops = load('app/lib/editor/operations.ts');
  const seq = load('app/lib/editor/sequentialEdit.ts');

  // 10s footage with speech
  let p = model.createProject('long-explicit-test');
  p = ops.addAsset(p, { id: 'v1', kind: 'video', name: 'v1.mp4', duration: 10.0, width: 720, height: 1280, mime: 'video/mp4', size: 100, url: '/test/v1.mp4' });
  p = ops.addClip(p, 'v1', 'track-video', 0, { id: 'footage', duration: 10.0, sourceEnd: 10.0 });
  p = ops.addCaption(p, 'Talking here', 1, 5, {}, [{ word: 'Talking', start: 0, end: 2 }, { word: 'here', start: 2, end: 4 }]);

  const job = seq.createEditingJob(p, 'Please add zooms to the video', []);

  // Output returns 0 zooms claiming success with no skip rationale
  const fakeOutput = { summary: 'I have added zooms', decisions: [] };

  assert.equal(seq.permitsZeroAdditions('applyZooms', p, fakeOutput, job), false, 'Must NOT permit zero additions without skip rationale');
  assert.throws(
    () => seq.validateStageChanges('applyZooms', p, p, fakeOutput, job),
    /No zoom keyframes were applied/
  );
});

test('Adversarial 4.4: Non-preset explicit zoom request on 10s footage SUCCEEDS when valid skip rationale is provided', () => {
  const load = pipelineLoader();
  const model = load('app/lib/editor/model.ts');
  const ops = load('app/lib/editor/operations.ts');
  const seq = load('app/lib/editor/sequentialEdit.ts');

  let p = model.createProject('long-explicit-skip-test');
  p = ops.addAsset(p, { id: 'v1', kind: 'video', name: 'v1.mp4', duration: 10.0, width: 720, height: 1280, mime: 'video/mp4', size: 100, url: '/test/v1.mp4' });
  p = ops.addClip(p, 'v1', 'track-video', 0, { id: 'footage', duration: 10.0, sourceEnd: 10.0 });
  p = ops.addCaption(p, 'Talking here', 1, 5, {}, [{ word: 'Talking', start: 0, end: 2 }, { word: 'here', start: 2, end: 4 }]);

  const job = seq.createEditingJob(p, 'Please add zooms to the video', []);

  // Output returns 0 zooms with explicit skip rationale
  const skipOutput = {
    summary: 'Preserve framing: no suitable emphasis moments for zoom effects.',
    decisions: [],
  };

  assert.equal(seq.hasSkipRationale(skipOutput), true);
  assert.equal(seq.permitsZeroAdditions('applyZooms', p, skipOutput, job), true);

  const validated = seq.validateStageChanges('applyZooms', p, p, skipOutput, job);
  assert.ok(validated);
});

test('Adversarial 4.5: Full runEditingJob execution completes successfully when preset supporting stages skip', async () => {
  const load = pipelineLoader();
  const model = load('app/lib/editor/model.ts');
  const ops = load('app/lib/editor/operations.ts');
  const seq = load('app/lib/editor/sequentialEdit.ts');

  let p = model.createProject('run-job-skip-test');
  p = ops.addAsset(p, { id: 'v1', kind: 'video', name: 'v1.mp4', duration: 3.5, width: 720, height: 1280, mime: 'video/mp4', size: 100, url: '/test/v1.mp4' });
  p = ops.addClip(p, 'v1', 'track-video', 0, { id: 'footage', duration: 3.5, sourceEnd: 3.5 });

  const preset = seq.PIPELINE_PRESETS.find((pr) => pr.id === 'engaging');
  const initialJob = seq.createEditingJob(p, preset.instruction, [], preset);

  let currentProject = p;
  const runtime = {
    getProject: () => currentProject,
    interacting: () => false,
    persist: async (next, job) => {
      job.timelineRevision = currentProject.revision + 1;
      currentProject = { ...next, revision: job.timelineRevision, editingJob: structuredClone(job) };
    },
    execute: async (stage) => {
      switch (stage) {
        case 'analyzeFootage':
          return { summary: '3.5s footage', operations: preset.operations };
        case 'applyCaptions':
          return {
            summary: 'Captions added',
            decisions: [{ op: 'addCaption', text: 'Spoken line', startTime: 0.5, duration: 2.0, templateId: 'signature-poppins' }],
          };
        case 'planMotionGraphics':
        case 'applyMotionGraphics':
        case 'findBroll':
        case 'applyBroll':
        case 'applyZooms':
          return { summary: 'Skipped for 3.5s footage', decisions: [] };
        case 'validateEdit':
          return seq.validateCompletedJob(currentProject, currentProject.editingJob);
        default:
          throw new Error('Unknown stage: ' + stage);
      }
    },
  };

  const finalJob = await seq.runEditingJob(runtime, initialJob, new AbortController().signal);
  assert.equal(finalJob.status, 'completed', 'Job should complete successfully');
  assert.equal(finalJob.completedStages.length, 8);
  assert.equal(finalJob.failedStages.length, 0);
  assert.equal(finalJob.errors.length, 0);
});
