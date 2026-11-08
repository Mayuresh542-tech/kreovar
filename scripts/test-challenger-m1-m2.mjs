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
    structuredClone: globalThis.structuredClone,
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
    }).outputText.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(filename).href));

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

// ============================================================================
// PART 1: Milestone 1 — Model Architecture & Gemini Failover Adversarial Tests
// ============================================================================

const fallbackOpts = {
  prompt: '{"pipelineStage":"applyRequestedEdits","instruction":"Add dramatic edit"}',
  systemInstruction: "You are Kreovar's AI video editor. Return JSON.",
};

test('CHALLENGE M1.1: Groq HTTP 429 failover to Gemini 3.8 Flash preserves compacted prompt and schema', async () => {
  const urls = [];
  const geminiPayloads = [];
  const events = [];

  const load = loader(
    {
      'app/lib/server/providerRegistry.ts': {
        getProviderCredential: async (p) => (p === 'groq' ? 'GROQ_KEY' : 'GEMINI_KEY'),
        recordProviderUsage: async (e) => events.push(e),
      },
    },
    {
      fetch: async (url, options = {}) => {
        urls.push(url);
        if (url.includes('api.groq.com')) {
          return Response.json(
            { error: { message: 'Rate limit exceeded: 30 requests per minute', code: 'rate_limit_exceeded' } },
            { status: 429, headers: { 'retry-after': '15' } }
          );
        }
        if (url.includes('generativelanguage.googleapis.com')) {
          const body = JSON.parse(options.body || '{}');
          geminiPayloads.push(body);
          assert.ok(url.includes('gemini-3.8-flash'), 'Gemini API URL must target gemini-3.8-flash');
          return Response.json({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify({ summary: 'Gemini 3.8 Flash plan', decisions: [], toolRequests: [] }) }],
                },
              },
            ],
            usageMetadata: { totalTokenCount: 420 },
          });
        }
        return Response.json({}, { status: 404 });
      },
    }
  );

  const provider = load('app/lib/server/editorProvider');
  const result = await provider.generateEditPlanJson(fallbackOpts);

  assert.equal(result.provider, 'gemini');
  assert.equal(result.model, 'gemini-3.8-flash');
  assert.equal(result.fallbackReason, 'GROQ_RATE_LIMIT');
  assert.equal(result.value.summary, 'Gemini 3.8 Flash plan');
  assert.equal(urls.length, 2, 'Must call Groq first, then Gemini on 429');
  assert.ok(urls[0].includes('api.groq.com'));
  assert.ok(urls[1].includes('generativelanguage.googleapis.com'));

  // Verify prompt was compacted for Gemini
  assert.equal(geminiPayloads.length, 1);
  const geminiPrompt = geminiPayloads[0].contents?.[0]?.parts?.[0]?.text;
  assert.ok(geminiPrompt, 'Prompt must be provided to Gemini');
  assert.equal(geminiPayloads[0].generationConfig?.responseMimeType, 'application/json');

  // Verify telemetry recorded
  assert.ok(events.some((e) => e.providerKey === 'gemini' && e.status === 'success'));
});

test('CHALLENGE M1.2: Groq 503 outage activates Gemini 3.8 Flash fallback', async () => {
  const load = loader(
    {
      'app/lib/server/providerRegistry.ts': {
        getProviderCredential: async (p) => (p === 'groq' ? 'GROQ_KEY' : 'GEMINI_KEY'),
        recordProviderUsage: async () => {},
      },
    },
    {
      fetch: async (url) => {
        if (url.includes('api.groq.com')) {
          return Response.json({ error: { message: 'Cloud service degraded' } }, { status: 503 });
        }
        if (url.includes('generativelanguage.googleapis.com')) {
          return Response.json({
            candidates: [
              { content: { parts: [{ text: JSON.stringify({ summary: '503 recovery', decisions: [] }) }] } },
            ],
          });
        }
        return Response.json({}, { status: 404 });
      },
    }
  );

  const provider = load('app/lib/server/editorProvider');
  const result = await provider.generateEditPlanJson(fallbackOpts);
  assert.equal(result.provider, 'gemini');
  assert.equal(result.fallbackReason, 'GROQ_UNAVAILABLE');
});

test('CHALLENGE M1.3: Groq network timeout triggers Gemini fallback', async () => {
  const load = loader(
    {
      'app/lib/server/providerRegistry.ts': {
        getProviderCredential: async (p) => (p === 'groq' ? 'GROQ_KEY' : 'GEMINI_KEY'),
        recordProviderUsage: async () => {},
      },
    },
    {
      fetch: async (url) => {
        if (url.includes('api.groq.com')) {
          const timeoutErr = new Error('Connection timed out');
          timeoutErr.name = 'TimeoutError';
          throw timeoutErr;
        }
        if (url.includes('generativelanguage.googleapis.com')) {
          return Response.json({
            candidates: [
              { content: { parts: [{ text: JSON.stringify({ summary: 'Timeout recovery', decisions: [] }) }] } },
            ],
          });
        }
        return Response.json({}, { status: 404 });
      },
    }
  );

  const provider = load('app/lib/server/editorProvider');
  const result = await provider.generateEditPlanJson(fallbackOpts);
  assert.equal(result.provider, 'gemini');
  assert.equal(result.value.summary, 'Timeout recovery');
});

test('CHALLENGE M1.4: Sticky routing skips Groq entirely when preferred.provider is gemini', async () => {
  let groqCalled = false;
  let geminiCalled = false;

  const load = loader(
    {
      'app/lib/server/providerRegistry.ts': {
        getProviderCredential: async () => 'KEY',
        recordProviderUsage: async () => {},
      },
    },
    {
      fetch: async (url) => {
        if (url.includes('api.groq.com')) {
          groqCalled = true;
          return Response.json({});
        }
        if (url.includes('generativelanguage.googleapis.com')) {
          geminiCalled = true;
          return Response.json({
            candidates: [
              { content: { parts: [{ text: JSON.stringify({ summary: 'Sticky plan', decisions: [] }) }] } },
            ],
          });
        }
        return Response.json({});
      },
    }
  );

  const provider = load('app/lib/server/editorProvider');
  const result = await provider.generateEditPlanJson(fallbackOpts, {
    provider: 'gemini',
    fallbackReason: 'GROQ_RATE_LIMIT',
  });

  assert.equal(groqCalled, false, 'Groq must NOT be called on sticky gemini routing');
  assert.equal(geminiCalled, true, 'Gemini must be called directly');
  assert.equal(result.provider, 'gemini');
  assert.equal(result.value.summary, 'Sticky plan');
});

test('CHALLENGE M1.5: Groq 401 auth error and user cancel must NOT fall back to Gemini', async () => {
  let geminiCalls = 0;
  const load = loader(
    {
      'app/lib/server/providerRegistry.ts': {
        getProviderCredential: async () => 'KEY',
        recordProviderUsage: async () => {},
      },
    },
    {
      fetch: async (url) => {
        if (url.includes('generativelanguage.googleapis.com')) {
          geminiCalls++;
        }
        return Response.json({ error: { message: 'Invalid API Key' } }, { status: 401 });
      },
    }
  );

  const provider = load('app/lib/server/editorProvider');
  await assert.rejects(
    provider.generateEditPlanJson(fallbackOpts),
    (err) => err.code === 'GROQ_AUTH_FAILED'
  );
  assert.equal(geminiCalls, 0, 'Gemini must not be invoked on auth error');

  // Test user cancellation
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(provider.generateEditPlanJson({ ...fallbackOpts, signal: ac.signal }));
  assert.equal(geminiCalls, 0, 'Gemini must not be invoked on user abort');
});

test('CHALLENGE M1.6: Token leases settle correctly on Gemini fallback success and failure', async () => {
  const leases = [];
  const settled = [];

  const load = loader(
    {
      'app/lib/server/providerRegistry.ts': {
        getProviderCredential: async () => 'KEY',
        recordProviderUsage: async () => {},
      },
      'app/lib/server/editorTokenBudget.ts': {
        reserveEditorTokens: async (userId, budget, amount) => {
          leases.push({ userId, budget, amount });
          return 'gemini-lease-1';
        },
        settleEditorTokens: async (userId, budget, lease, amount) => {
          settled.push({ userId, budget, lease, amount });
        },
        worstCaseTokens: () => 15000,
      },
    },
    {
      fetch: async (url) => {
        if (url.includes('api.groq.com')) {
          return Response.json({ error: { message: 'Rate limit' } }, { status: 429 });
        }
        if (url.includes('generativelanguage.googleapis.com')) {
          return Response.json({
            candidates: [
              { content: { parts: [{ text: JSON.stringify({ summary: 'Success', decisions: [] }) }] } },
            ],
            usageMetadata: { totalTokenCount: 500 },
          });
        }
        return Response.json({});
      },
    }
  );

  const provider = load('app/lib/server/editorProvider');
  await provider.generateEditPlanJson({
    ...fallbackOpts,
    userId: 'user-123',
    editingBudget: { projectId: 'p-1', jobId: 'j-1' },
  });

  assert.equal(leases.length, 2, 'Both Groq and Gemini must reserve token leases');
  assert.equal(settled.length, 2, 'Both Groq and Gemini must settle their token leases');
  assert.equal(settled[0].amount, 0, 'Groq 429 failed request must settle 0 tokens');
  assert.equal(settled[1].amount, 500, 'Gemini fallback successful request must settle actual tokens');
});

test('CHALLENGE M1.7: Gemini JSON parsing cleans markdown fences, leading/trailing prose, and rejects invalid JSON', async () => {
  const load = loader(
    {
      'app/lib/server/providerRegistry.ts': {
        getProviderCredential: async () => 'GEMINI_KEY',
        recordProviderUsage: async () => {},
      },
    },
    {
      fetch: async (url, options = {}) => {
        const body = JSON.parse(options.body || '{}');
        const prompt = body.contents?.[0]?.parts?.[0]?.text || '';
        let text = '';
        if (prompt.includes('FENCE_TEST')) {
          text = '```json\n{"summary": "clean fence", "decisions": []}\n```';
        } else if (prompt.includes('PROSE_TEST')) {
          text = 'Here is your editing plan:\n{"summary": "embedded json", "decisions": []}\nHope this helps!';
        } else if (prompt.includes('CORRUPT_TEST')) {
          text = 'Sorry, I am unable to fulfill this request as an AI model.';
        }
        return Response.json({
          candidates: [{ content: { parts: [{ text }] } }],
        });
      },
    }
  );

  const gemini = load('app/lib/server/geminiService');

  // Test 1: Code fences
  const r1 = await gemini.generateGeminiJson({ prompt: 'FENCE_TEST' });
  assert.equal(r1.summary, 'clean fence');

  // Test 2: Embedded JSON with prose
  const r2 = await gemini.generateGeminiJson({ prompt: 'PROSE_TEST' });
  assert.equal(r2.summary, 'embedded json');

  // Test 3: Corrupt text
  await assert.rejects(
    gemini.generateGeminiJson({ prompt: 'CORRUPT_TEST' }),
    /Gemini returned malformed structured data/
  );
});

// ============================================================================
// PART 2: Milestone 2 — Preset Flow Repair & Resilience Adversarial Tests
// ============================================================================

const loadM2 = loader();
const model = loadM2('app/lib/editor/model.ts');
const ops = loadM2('app/lib/editor/operations.ts');
const pipeline = loadM2('app/lib/editor/sequentialEdit.ts');

function createShortFootageProject(durationSec = 3.5) {
  let p = model.createProject('short-preset-test');
  p = ops.addAsset(p, {
    id: 'short-asset',
    kind: 'video',
    name: 'ShortClip.mp4',
    duration: durationSec,
    width: 720,
    height: 1280,
    mime: 'video/mp4',
    size: 200,
    url: '/test/short.mp4',
  });
  return ops.addClip(p, 'short-asset', 'track-video', 0, {
    id: 'short-clip',
    duration: durationSec,
    sourceStart: 0,
    sourceEnd: durationSec,
  });
}

function createLongFootageProject(durationSec = 12.0) {
  let p = model.createProject('long-preset-test');
  p = ops.addAsset(p, {
    id: 'long-asset',
    kind: 'video',
    name: 'LongClip.mp4',
    duration: durationSec,
    width: 720,
    height: 1280,
    mime: 'video/mp4',
    size: 800,
    url: '/test/long.mp4',
  });
  return ops.addClip(p, 'long-asset', 'track-video', 0, {
    id: 'long-clip',
    duration: durationSec,
    sourceStart: 0,
    sourceEnd: durationSec,
  });
}

function createRuntime(initialProject, handler) {
  let p = initialProject;
  return {
    getProject: () => p,
    interacting: () => false,
    persist: async (next, job) => {
      job.timelineRevision = p.revision + 1;
      p = { ...next, revision: job.timelineRevision, editingJob: structuredClone(job) };
    },
    execute: handler,
  };
}

const sampleCaption = {
  summary: 'Added captions',
  decisions: [
    {
      op: 'addCaption',
      text: 'Speech in clip',
      startTime: 0.5,
      duration: 2.0,
      templateId: 'signature-poppins',
      words: [
        { word: 'Speech', start: 0, end: 0.6 },
        { word: 'in', start: 0.6, end: 1.0 },
        { word: 'clip', start: 1.0, end: 2.0 },
      ],
    },
  ],
};

test('CHALLENGE M2.1: Short footage (<4s) with engaging preset succeeds cleanly when supporting stages add 0 elements', async () => {
  const p = createShortFootageProject(3.2);
  const engagingPreset = pipeline.PIPELINE_PRESETS.find((pr) => pr.id === 'engaging');
  const job = pipeline.createEditingJob(p, engagingPreset.instruction, [], engagingPreset);

  const stagesExecuted = [];
  const rt = createRuntime(p, async (stage, project, currentJob) => {
    stagesExecuted.push(stage);
    switch (stage) {
      case 'analyzeFootage':
        return { summary: 'Short 3.2s footage analyzed', operations: engagingPreset.operations };
      case 'applyCaptions':
        return sampleCaption;
      case 'planMotionGraphics':
        // Zero decisions
        return { summary: 'Duration < 4s, no motion graphics needed', decisions: [] };
      case 'applyMotionGraphics':
        return currentJob.stages.find((s) => s.id === 'planMotionGraphics').output;
      case 'findBroll':
        // Zero decisions and zero requests
        return { summary: 'Clip too short for B-roll cutaway', decisions: [], requests: [] };
      case 'applyBroll':
        return currentJob.stages.find((s) => s.id === 'findBroll').output;
      case 'applyZooms':
        // Zero zoom keyframes
        return { summary: 'Short duration, zooms skipped', decisions: [] };
      case 'validateEdit':
        return pipeline.validateCompletedJob(project, currentJob);
      default:
        throw new Error(`Unexpected stage: ${stage}`);
    }
  });

  const result = await pipeline.runEditingJob(rt, job, new AbortController().signal);
  assert.equal(result.status, 'completed', `Job should complete successfully but got: ${result.errors.join('; ')}`);
  assert.equal(result.errors.length, 0);
  assert.ok(stagesExecuted.includes('applyZooms'));
  assert.ok(stagesExecuted.includes('applyBroll'));
  assert.ok(stagesExecuted.includes('applyMotionGraphics'));
  assert.ok(stagesExecuted.includes('validateEdit'));
});

test('CHALLENGE M2.2: Speech-free footage with punchy preset succeeds cleanly when supporting stages add 0 elements', async () => {
  // Speech-free project (source clip duration 10s, 0 transcript words)
  const p = createLongFootageProject(10.0);
  const punchyPreset = pipeline.PIPELINE_PRESETS.find((pr) => pr.id === 'punchy');
  const job = pipeline.createEditingJob(p, punchyPreset.instruction, [], punchyPreset);

  const stagesExecuted = [];
  const rt = createRuntime(p, async (stage, project, currentJob) => {
    stagesExecuted.push(stage);
    switch (stage) {
      case 'analyzeFootage':
        return { summary: '10s silent footage', operations: punchyPreset.operations };
      case 'applyCaptions':
        // Caption was added
        return sampleCaption;
      case 'planMotionGraphics':
        return { summary: 'No speech context, skipping motion callouts', decisions: [] };
      case 'applyMotionGraphics':
        return currentJob.stages.find((s) => s.id === 'planMotionGraphics').output;
      case 'applyZooms':
        // Zero zoom keyframes produced for speech-free footage
        return { summary: 'No speech emphasis moments', decisions: [] };
      case 'applySoundEffects':
        return { summary: 'No sound effects required', decisions: [] };
      case 'validateEdit':
        return pipeline.validateCompletedJob(project, currentJob);
      default:
        throw new Error(`Unexpected stage: ${stage}`);
    }
  });

  const result = await pipeline.runEditingJob(rt, job, new AbortController().signal);
  assert.equal(result.status, 'completed', `Job should complete successfully but got: ${result.errors.join('; ')}`);
  assert.equal(result.errors.length, 0);
  assert.ok(stagesExecuted.includes('applyZooms'));
  assert.ok(stagesExecuted.includes('applySoundEffects'));
  assert.ok(stagesExecuted.includes('validateEdit'));
});

test('CHALLENGE M2.3: Long footage (>4s) with explicit "Add zooms" instruction strictly FAILS on 0 zooms without skip rationale', async () => {
  const p = createLongFootageProject(12.0);
  const job = pipeline.createEditingJob(p, 'Add subtle zooms to this footage', []);

  const rt = createRuntime(p, async (stage) => {
    if (stage === 'analyzeFootage') return { summary: 'Analyze', operations: ['zooms'] };
    // Model falsely reports success without actually adding any zoom keyframes or providing skip rationale
    return { summary: 'I have successfully added zooms', decisions: [] };
  });

  const result = await pipeline.runEditingJob(rt, job, new AbortController().signal);
  assert.equal(result.status, 'failed', 'Must fail when model hallucinates success with 0 zooms on long footage');
  assert.ok(result.errors.some((e) => e.includes('No zoom keyframes were applied')));
  assert.equal(result.appliedOperations.length, 0);
});

test('CHALLENGE M2.4: Long footage (>4s) with explicit "Add zooms" SUCCEEDS when model documents explicit skip rationale', async () => {
  const p = createLongFootageProject(12.0);
  const job = pipeline.createEditingJob(p, 'Add subtle zooms to this footage', []);

  const rt = createRuntime(p, async (stage, project, currentJob) => {
    if (stage === 'analyzeFootage') return { summary: 'Analyze', operations: ['zooms'] };
    if (stage === 'applyZooms') {
      // Model documents explicit skip rationale
      return { summary: 'Preserve framing: footage is static screen recording with no suitable emphasis points', decisions: [] };
    }
    if (stage === 'validateEdit') {
      return pipeline.validateCompletedJob(project, currentJob);
    }
    throw new Error(`Unexpected stage: ${stage}`);
  });

  const result = await pipeline.runEditingJob(rt, job, new AbortController().signal);
  assert.equal(result.status, 'completed', `Must tolerate zero additions when explicit skip rationale is documented: ${result.errors.join('; ')}`);
});

test('CHALLENGE M2.5: Supporting stages (motionGraphics, broll, sfx) strictly reject 0 additions on long footage without skip rationale', async () => {
  const p = createLongFootageProject(12.0);

  // Test motion graphics rejection
  {
    const job = pipeline.createEditingJob(p, 'Add motion graphics', []);
    const rt = createRuntime(p, async (stage) => {
      if (stage === 'analyzeFootage') return { summary: 'Analyze', operations: ['motionGraphics'] };
      if (stage === 'planMotionGraphics') return { summary: 'Planned graphics', decisions: [] };
      return { summary: 'Applied graphics', decisions: [] };
    });
    const result = await pipeline.runEditingJob(rt, job, new AbortController().signal);
    assert.equal(result.status, 'failed');
    assert.ok(result.errors.some((e) => e.includes('No visible animated motion graphic was created')));
  }

  // Test B-roll rejection
  {
    const job = pipeline.createEditingJob(p, 'Add B-roll', []);
    const rt = createRuntime(p, async (stage) => {
      if (stage === 'analyzeFootage') return { summary: 'Analyze', operations: ['broll'] };
      if (stage === 'findBroll') return { summary: 'Found B-roll', decisions: [] };
      return { summary: 'Applied B-roll', decisions: [] };
    });
    const result = await pipeline.runEditingJob(rt, job, new AbortController().signal);
    assert.equal(result.status, 'failed');
    assert.ok(result.errors.some((e) => e.includes('No valid muted B-roll was inserted')));
  }

  // Test Sound effects rejection
  {
    const job = pipeline.createEditingJob(p, 'Add sound effects', []);
    const rt = createRuntime(p, async (stage) => {
      if (stage === 'analyzeFootage') return { summary: 'Analyze', operations: ['soundEffects'] };
      return { summary: 'Applied SFX', decisions: [] };
    });
    const result = await pipeline.runEditingJob(rt, job, new AbortController().signal);
    assert.equal(result.status, 'failed');
    assert.ok(result.errors.some((e) => e.includes('No audible, synchronized sound effect was inserted')));
  }
});

test('CHALLENGE M2.8: Speech-free clip with preset applyCaptions returning 0 decisions', () => {
  const p = createLongFootageProject(10.0);
  const punchyPreset = pipeline.PIPELINE_PRESETS.find((pr) => pr.id === 'punchy');
  const job = pipeline.createEditingJob(p, punchyPreset.instruction, [], punchyPreset);

  const emptyCaptionOutput = { summary: 'No speech found in clip', decisions: [] };
  // validateStageChanges must tolerate 0 captions for a speech-free preset
  const validated = pipeline.validateStageChanges('applyCaptions', p, p, emptyCaptionOutput, job);
  assert.ok(validated);
});

test('CHALLENGE M2.9: Entire speech-free preset pipeline (captions + graphics + broll + zooms + sfx with 0 additions) succeeds cleanly', async () => {
  const p = createLongFootageProject(10.0);
  const punchyPreset = pipeline.PIPELINE_PRESETS.find((pr) => pr.id === 'punchy');
  const job = pipeline.createEditingJob(p, punchyPreset.instruction, [], punchyPreset);

  const stagesExecuted = [];
  const rt = createRuntime(p, async (stage, project, currentJob) => {
    stagesExecuted.push(stage);
    switch (stage) {
      case 'analyzeFootage':
        return { summary: '10s silent footage', operations: punchyPreset.operations };
      case 'applyCaptions':
        return { summary: 'No speech detected, 0 captions added', decisions: [] };
      case 'planMotionGraphics':
        return { summary: 'No motion graphics planned', decisions: [] };
      case 'applyMotionGraphics':
        return currentJob.stages.find((s) => s.id === 'planMotionGraphics').output;
      case 'applyZooms':
        return { summary: 'No zooms needed', decisions: [] };
      case 'applySoundEffects':
        return { summary: 'No sound effects needed', decisions: [] };
      case 'validateEdit':
        return pipeline.validateCompletedJob(project, currentJob);
      default:
        throw new Error(`Unexpected stage: ${stage}`);
    }
  });

  const result = await pipeline.runEditingJob(rt, job, new AbortController().signal);
  assert.equal(result.status, 'completed', `Job should complete successfully: ${result.errors.join('; ')}`);
  assert.equal(result.errors.length, 0);
  assert.ok(stagesExecuted.includes('applyCaptions'));
  assert.ok(stagesExecuted.includes('applyZooms'));
  assert.ok(stagesExecuted.includes('applySoundEffects'));
  assert.ok(stagesExecuted.includes('validateEdit'));
});

test('CHALLENGE M2.6: Boundary duration 3.99s vs 4.00s zero-addition tolerance threshold', () => {
  const pUnder = createShortFootageProject(3.99);
  const pExact = createShortFootageProject(4.00);

  const emptyZoomOutput = { summary: 'No changes', decisions: [] };
  const customJob = { instructions: 'Add zooms' };

  // 3.99s is < 4.0: permits zero additions regardless of instructions
  assert.equal(pipeline.permitsZeroAdditions('applyZooms', pUnder, emptyZoomOutput, customJob), true);

  // 4.00s is >= 4.0: requires additions for explicit command unless skip rationale
  assert.equal(pipeline.permitsZeroAdditions('applyZooms', pExact, emptyZoomOutput, customJob), false);

  // 4.00s with skip rationale permits zero additions
  const skipZoomOutput = { summary: 'Preserve framing, skip zooms', decisions: [] };
  assert.equal(pipeline.permitsZeroAdditions('applyZooms', pExact, skipZoomOutput, customJob), true);
});

test('CHALLENGE M2.7: Dynamic caption restyling & pop animation on engaging preset', () => {
  const p = createShortFootageProject(3.5);
  // Add an existing caption clip
  let captioned = ops.addCaption(p, 'Original text', 1, 2, 'clean-sub');
  const captionClip = Object.values(captioned.clips).find((c) => c.contentId);
  assert.ok(captionClip);

  // Output applies template to existing caption clip
  const restyleOutput = {
    summary: 'Restyled captions',
    animateCaptions: true,
    decisions: [
      {
        op: 'applyCaptionTemplate',
        clipIds: [captionClip.id],
        templateId: 'signature-poppins',
      },
    ],
  };

  const next = pipeline.buildStageProject(captioned, restyleOutput);
  // Motion should be pop
  const restyledCaption = next.captions[captionClip.contentId];
  assert.equal(restyledCaption.motion, 'pop');

  // validateStageChanges accepts in-place restyling
  const validated = pipeline.validateStageChanges('applyCaptions', captioned, next, restyleOutput);
  assert.ok(validated);
});
