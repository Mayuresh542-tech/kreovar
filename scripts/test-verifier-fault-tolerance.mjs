import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json")), ts = require("typescript");

function loader(mocks = {}) {
  mocks = {
    "app/lib/server/planUsage.ts": { withUsage: h => h, reserveUsage: async () => ({ reservationId: 'test-usage' }), finishUsage: async () => {}, PlanLimitError: class extends Error {}, usageError: () => new Response('{}', { status: 503 }) },
    "app/lib/server/speechDuration.ts": { speechDuration: async () => 1 },
    "app/lib/supabase.ts": { supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } },
    ...mocks
  };
  const cache = new Map();
  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) filename += ".ts";
    const key = path.relative(root, filename).replaceAll("\\", "/");
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} }; cache.set(filename, loadedModule);
    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(filename).href));
    const localRequire = specifier => specifier.startsWith("@/") ? load(specifier.slice(2)) : specifier.startsWith(".") ? load(path.relative(root, path.resolve(path.dirname(filename), specifier))) : require(specifier);
    new vm.Script(`(function(require,module,exports){${source}\n})`, { filename }).runInThisContext()(localRequire, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return load;
}

const load = loader();
const model = load('app/lib/editor/model.ts');
const ops = load('app/lib/editor/operations.ts');
const pipeline = load('app/lib/editor/sequentialEdit.ts');
const { EditorStore } = load('app/lib/editor/store.ts');

function source() {
  let p = model.createProject('pipeline-test');
  p = ops.addAsset(p, { id: 'source', kind: 'video', name: 'Original.mp4', duration: 12, width: 720, height: 1280, mime: 'video/mp4', size: 100, url: '/test/original.mp4' });
  return ops.addClip(p, 'source', 'track-video', 0, { id: 'footage', duration: 12, sourceEnd: 12 });
}

function runtime(project, handler) {
  let p = project, inFlight = 0, max = 0;
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
      inFlight++;
      max = Math.max(max, inFlight);
      try {
        return await handler(...args);
      } finally {
        inFlight--;
      }
    },
    saved,
    max: () => max
  };
}

const signal = () => new AbortController().signal;
const caption = {
  summary: 'Timed speech',
  decisions: [{
    op: 'addCaption',
    text: 'Real spoken words',
    startTime: 1,
    duration: 2,
    templateId: 'signature-poppins',
    words: [{ word: 'Real', start: 0, end: .7 }, { word: 'spoken', start: .7, end: 1.2 }, { word: 'words', start: 1.2, end: 2 }]
  }]
};

test('Edge Case 1: Interleaved failures and successes in multi-stage preset', async () => {
  const p = source();
  const seen = [];
  const job = pipeline.createEditingJob(p, 'Preset edit with multiple stages', [], pipeline.PIPELINE_PRESETS[0]); // captions, motionGraphics, broll, zooms
  
  const brollAsset = { id: 'licensed', libraryId: 'licensed', kind: 'video', name: 'Licensed.mp4', duration: 3, width: 720, height: 1280, mime: 'video/mp4', size: 30 };
  
  const r = runtime(p, async (stage, project, j) => {
    seen.push(stage);
    switch (stage) {
      case 'analyzeFootage':
        return { summary: '12 second footage', operations: ['captions', 'motionGraphics', 'broll', 'zooms'] };
      case 'applyCaptions':
        // Stage 1 succeeds
        return caption;
      case 'planMotionGraphics':
        // Stage 2 fails execution
        throw new Error('Motion graphics engine GPU out of memory');
      case 'applyMotionGraphics':
        // Should handle empty plan from skipped previous stage
        return { summary: 'No motion graphics to apply', decisions: [] };
      case 'findBroll':
        // Stage 3 execution failure
        throw new Error('Stock media service timeout');
      case 'applyBroll':
        return { summary: 'No broll', decisions: [] };
      case 'applyZooms':
        // Stage 4 succeeds
        return {
          summary: 'Subtle zoom',
          decisions: [{ op: 'addZoom', clipId: 'footage', startTime: 1, endTime: 2, fromScale: 1, toScale: 1.1, returnToStart: true, easing: 'smooth' }]
        };
      case 'validateEdit':
        return pipeline.validateCompletedJob(project, j);
      default:
        throw new Error(stage);
    }
  });

  const result = await pipeline.runEditingJob(r, job, signal());
  assert.equal(result.status, 'completed', 'Job should complete despite failures');
  assert.ok(seen.includes('validateEdit'), 'Validation must run');
  assert.equal(Object.keys(r.getProject().captions).length, 1, 'Captions from successful stage 1 committed');
  assert.equal(r.getProject().clips.footage.zooms.length, 1, 'Zooms from successful stage 4 committed');
  assert.ok(result.degradationNotices.some(n => n.stage === 'planMotionGraphics' && n.status === 'skipped'));
  assert.ok(result.degradationNotices.some(n => n.stage === 'findBroll' && n.status === 'skipped'));
  assert.ok(result.skippedNotes.length >= 2, 'Skipped notes generated');
});

test('Edge Case 1b: Stage validation failure (applyZooms outside duration) gracefully degrades', async () => {
  const p = source();
  const job = pipeline.createEditingJob(p, 'Preset edit with validation failure', [], pipeline.PIPELINE_PRESETS[0]);
  
  const r = runtime(p, async (stage, project, j) => {
    switch (stage) {
      case 'analyzeFootage':
        return { summary: '12 second footage', operations: ['captions', 'zooms'] };
      case 'applyCaptions':
        return caption;
      case 'applyZooms':
        // Returns zoom outside project duration (project is 12s, zoom at 20-22s) -> triggers validation failure
        return {
          summary: 'Zoom outside range',
          decisions: [{ op: 'addZoom', clipId: 'footage', startTime: 20, endTime: 22, fromScale: 1, toScale: 1.1 }]
        };
      case 'validateEdit':
        return pipeline.validateCompletedJob(project, j);
      default:
        return { summary: 'Skipped', decisions: [] };
    }
  });

  const result = await pipeline.runEditingJob(r, job, signal());
  assert.equal(result.status, 'completed');
  assert.equal(Object.keys(r.getProject().captions).length, 1, 'Captions were committed');
  assert.equal(r.getProject().clips.footage.zooms, undefined, 'Invalid zoom was rejected and baseline preserved');
  assert.ok(result.degradationNotices.some(n => n.stage === 'applyZooms' && n.status === 'skipped'));
  assert.ok(result.skippedNotes.some(note => note.includes('Zooms')));
});

test('Edge Case 2: Freeform / Conversational edit fails execution gracefully', async () => {
  const p = source();
  const job = pipeline.createEditingJob(p, 'Cut the awkward silences and balance background music', []); // conversational requestedEdits
  assert.equal(job.presetId, undefined, 'Must be freeform without presetId');
  
  const r = runtime(p, async (stage, project, j) => {
    if (stage === 'analyzeFootage') return { summary: 'Analyze', operations: ['requestedEdits'] };
    if (stage === 'applyRequestedEdits') throw new Error('Groq model timeout after 85s');
    return pipeline.validateCompletedJob(project, j);
  });

  const result = await pipeline.runEditingJob(r, job, signal());
  assert.equal(result.status, 'completed', 'Conversational edit must complete cleanly');
  assert.deepEqual(r.getProject().clips, p.clips, 'Timeline unchanged');
  assert.ok(result.degradationNotices.some(n => n.stage === 'applyRequestedEdits'));
  assert.ok(result.skippedNotes.some(note => note.includes('Requested Edits')));
});

test('Edge Case 3: Freeform / Conversational edit fails validation gracefully', async () => {
  const p = source();
  const job = pipeline.createEditingJob(p, 'Add a custom overlay track', []);
  
  const r = runtime(p, async (stage, project, j) => {
    if (stage === 'analyzeFootage') return { summary: 'Analyze', operations: ['requestedEdits'] };
    if (stage === 'applyRequestedEdits') {
      // Returns empty decisions without questions -> would fail "Requested edits did not change the timeline"
      return { summary: 'No changes made', decisions: [] };
    }
    return pipeline.validateCompletedJob(project, j);
  });

  const result = await pipeline.runEditingJob(r, job, signal());
  assert.equal(result.status, 'completed', 'Validation failure degrades cleanly');
  assert.ok(result.degradationNotices.some(n => n.stage === 'applyRequestedEdits'));
});

test('Edge Case 4: ALL stages fail in a preset pipeline -> Completes gracefully with degradations, baseline intact', async () => {
  const p = source();
  const initialRevision = p.revision;
  const job = pipeline.createEditingJob(p, 'Full edit package', [], pipeline.PIPELINE_PRESETS[0]);
  
  const r = runtime(p, async (stage, project, j) => {
    if (stage === 'analyzeFootage') return { summary: 'Analyze', operations: ['captions', 'zooms'] };
    if (stage === 'validateEdit') return pipeline.validateCompletedJob(project, j);
    throw new Error(`Simulated total failure at ${stage}`);
  });

  const result = await pipeline.runEditingJob(r, job, signal());
  assert.equal(result.status, 'completed', 'Job must complete without throwing uncaught exceptions even when all stages fail');
  assert.ok(result.degradationNotices.length >= 2, 'Degradation notices recorded for failed stages');
  assert.ok(result.skippedNotes.length >= 2, 'Skipped notes populated');
  assert.equal(r.getProject().clips.footage.zooms, undefined, 'No zooms applied');
  assert.equal(Object.keys(r.getProject().captions).length, 0, 'No captions applied');
  assert.deepEqual(r.getProject().clips, p.clips, 'Original footage clips preserved');
});

test('Edge Case 5: ALL stages fail in a conversational edit -> Completes gracefully with degradations', async () => {
  const p = source();
  const job = pipeline.createEditingJob(p, 'Perform high-level custom edits', []);
  
  const r = runtime(p, async (stage, project, j) => {
    if (stage === 'analyzeFootage') return { summary: 'Analyze', operations: ['requestedEdits'] };
    if (stage === 'applyRequestedEdits') throw new Error('Downstream service fatal error');
    if (stage === 'validateEdit') return pipeline.validateCompletedJob(project, j);
  });

  const result = await pipeline.runEditingJob(r, job, signal());
  assert.equal(result.status, 'completed');
  assert.ok(result.degradationNotices.some(n => n.stage === 'applyRequestedEdits'));
  assert.deepEqual(r.getProject().clips, p.clips);
});

test('Edge Case 6: Timeline consistency, revision tracking, and checkpointing remain intact across skips', async () => {
  const store = new EditorStore(source());
  const initial = store.getSnapshot();
  
  // Verify revisions increment properly on checkpoints and saves
  const job = pipeline.createEditingJob(initial, 'Test revisions', [], pipeline.PIPELINE_PRESETS[5]); // clean (captions)
  let savedCount = 0;
  
  const r = {
    getProject: () => store.getSnapshot(),
    interacting: () => false,
    persist: async (next, j) => {
      savedCount++;
      j.timelineRevision = store.getSnapshot().revision + 1;
      store.checkpoint(() => ({ ...next, revision: j.timelineRevision, editingJob: structuredClone(j) }));
    },
    execute: async (stage, project, j) => {
      if (stage === 'analyzeFootage') return { summary: 'Analyze', operations: ['captions'] };
      if (stage === 'applyCaptions') throw new Error('Whisper server 503');
      return pipeline.validateCompletedJob(project, j);
    }
  };

  const result = await pipeline.runEditingJob(r, job, signal());
  assert.equal(result.status, 'completed');
  assert.ok(savedCount > 3, 'Multiple checkpoints persisted');
  assert.equal(store.getSnapshot().revision, result.timelineRevision);
  assert.deepEqual(store.getSnapshot().clips, initial.clips, 'Footage clips unchanged');
  
  // Verify undo history isn't corrupted by metadata checkpoints
  store.execute(p => ops.addText(p, 'Post-AI Manual Text', 2));
  assert.equal(Object.keys(store.getSnapshot().textLayers).length, 1);
  store.undo();
  assert.equal(Object.keys(store.getSnapshot().textLayers).length, 0);
  assert.deepEqual(store.getSnapshot().clips, initial.clips);
});
