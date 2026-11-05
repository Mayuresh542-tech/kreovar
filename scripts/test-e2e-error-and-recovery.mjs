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

function loader(mocks = {}) {
  mocks = {
    'app/lib/supabase.ts': {
      supabase: {
        auth: { getSession: async () => ({ data: { session: null } }) },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) })
      }
    },
    ...mocks
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
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(filename).href));

    const localRequire = specifier =>
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

const load = loader();
const model = load('app/lib/editor/model.ts');
const ops = load('app/lib/editor/operations.ts');
const pipeline = load('app/lib/editor/sequentialEdit.ts');
const recovery = load('app/lib/editor/recovery.ts');
const { EditorStore } = load('app/lib/editor/store.ts');
const { commitReviewedEdit } = load('app/lib/editor/reviewedEdit.ts');

function fixtureProject() {
  let p = model.createProject('error-recovery-test', 'Error & Recovery Test');
  p = ops.addAsset(p, {
    id: 'base-asset',
    name: 'Footage.mp4',
    duration: 20,
    kind: 'video',
    width: 720,
    height: 1280,
    mime: 'video/mp4',
    size: 1000
  });
  p = ops.addClip(p, 'base-asset', 'track-video', 0, {
    id: 'base-clip',
    duration: 20,
    sourceStart: 0,
    sourceEnd: 20
  });
  return p;
}

test('Error & Recovery: Browser refresh during editing restores latest valid checkpoint and rejects corrupt data', () => {
  const p = fixtureProject();
  const validSaved = { ...p, revision: 5, title: 'Valid Checkpoint' };
  const corruptSaved = { invalid: true, notAProject: 'broken' };

  // 1. Valid device checkpoint restoration
  const res1 = recovery.chooseRecovery(validSaved, p, p.id);
  assert.equal(res1.restored, true);
  assert.equal(res1.invalid, false);
  assert.equal(res1.project.title, 'Valid Checkpoint');

  // 2. Corrupt/tampered device checkpoint rejection (safe fallback to cloud/base)
  const res2 = recovery.chooseRecovery(corruptSaved, p, p.id);
  assert.equal(res2.restored, false);
  assert.equal(res2.invalid, true);
  assert.equal(res2.project.id, p.id);
});

test('Error & Recovery: Failed AI stage saves committed stages and retry does not duplicate mutations', async () => {
  const p = fixtureProject();
  const store = new EditorStore(p);
  const job = pipeline.createEditingJob(p, 'Add captions and zooms', []);

  let failZooms = true;
  const executedStages = [];

  const runtime = {
    getProject: () => store.getSnapshot(),
    interacting: () => store.interacting,
    persist: async (next, updatedJob) => {
      updatedJob.timelineRevision = store.getSnapshot().revision + 1;
      store.execute(curr => ({ ...next, editingJob: structuredClone(updatedJob) }));
    },
    execute: async (stage, currentProject, j) => {
      executedStages.push(stage);
      if (stage === 'analyzeFootage') {
        return { summary: 'Analysis complete', operations: ['captions', 'zooms'] };
      }
      if (stage === 'applyCaptions') {
        return {
          summary: 'Captions applied',
          decisions: [
            {
              op: 'addCaption',
              text: 'Segment one caption',
              startTime: 1,
              duration: 3,
              words: [
                { word: 'Segment', start: 0, end: 1 },
                { word: 'one', start: 1, end: 2 },
                { word: 'caption', start: 2, end: 3 }
              ]
            }
          ]
        };
      }
      if (stage === 'applyZooms') {
        if (failZooms) {
          throw new Error('Radox provider 503 Outage: Temporarily unavailable');
        }
        return {
          summary: 'Zooms applied',
          decisions: [
            {
              op: 'addZoom',
              clipId: 'base-clip',
              startTime: 5,
              endTime: 7,
              fromScale: 1.0,
              toScale: 1.12,
              returnToStart: true
            }
          ]
        };
      }
      if (stage === 'validateEdit') {
        return pipeline.validateCompletedJob(currentProject, j);
      }
      throw new Error(`Unexpected stage: ${stage}`);
    }
  };

  // First run: applyZooms fails
  const failedResult = await pipeline.runEditingJob(runtime, job, new AbortController().signal);
  assert.equal(failedResult.status, 'failed');
  assert.deepEqual(failedResult.failedStages, ['applyZooms']);
  assert.ok(failedResult.errors.some(e => e.includes('Radox provider 503 Outage')));

  // Crucial check: Captions stage WAS committed and preserved!
  assert.equal(Object.keys(store.getSnapshot().captions).length, 1);
  assert.ok(failedResult.completedStages.includes('applyCaptions'));

  // Retry the job: now provider is back online
  failZooms = false;
  const retryResult = await pipeline.runEditingJob(runtime, store.getSnapshot().editingJob, new AbortController().signal);
  assert.equal(retryResult.status, 'completed');
  assert.deepEqual(retryResult.failedStages, []);

  // Verify that applyCaptions was NOT executed twice and captions were NOT duplicated!
  assert.equal(executedStages.filter(s => s === 'applyCaptions').length, 1, 'applyCaptions must not re-run on retry');
  assert.equal(Object.keys(store.getSnapshot().captions).length, 1, 'Captions must not be duplicated');
  assert.equal(store.getSnapshot().clips['base-clip'].zooms.length, 1, 'Zooms applied once');
  assert.equal(new Set(retryResult.appliedOperations).size, retryResult.appliedOperations.length, 'No duplicate operation keys');
});

test('Error & Recovery: User manual edits during planning trigger stale revision rejection and require fresh job', () => {
  const p = fixtureProject();
  const store = new EditorStore(p);
  const before = store.getSnapshot();

  // Create a plan targeted at revision 0
  const reviewed = {
    ...before,
    clips: {
      ...before.clips,
      'new-clip': { id: 'new-clip', trackId: 'track-video', startTime: 5, duration: 2, transform: { opacity: 1, scale: 1, x: 0, y: 0, rotation: 0 } }
    }
  };

  // User performs a manual edit in the background before applying AI changes
  store.execute(curr => ops.addText(curr, 'Manual Text Edit', 2));
  assert.notEqual(store.getSnapshot().revision, before.revision);

  // Attempting to commit stale reviewed edit must throw and protect project state
  assert.throws(
    () => commitReviewedEdit(store, before, reviewed),
    /Your timeline changed. Generate a fresh plan before applying it./
  );
  // Manual edit is preserved
  assert.ok(Object.values(store.getSnapshot().textLayers).some(t => t.text === 'Manual Text Edit'));
});

test('Error & Recovery: Empty AI responses and zero-operation stages throw and never report false success', async () => {
  const p = fixtureProject();
  const store = new EditorStore(p);
  const job = pipeline.createEditingJob(p, 'Add subtle zoom', []);

  const runtime = {
    getProject: () => store.getSnapshot(),
    interacting: () => false,
    persist: async (next, j) => {
      j.timelineRevision = store.getSnapshot().revision + 1;
      store.execute(curr => ({ ...next, editingJob: structuredClone(j) }));
    },
    execute: async (stage) => {
      if (stage === 'analyzeFootage') return { summary: 'Analysis', operations: ['zooms'] };
      // Hallucinated empty decisions array
      return { summary: 'I have successfully added zooms', decisions: [] };
    }
  };

  const result = await pipeline.runEditingJob(runtime, job, new AbortController().signal);
  if (!result.errors.some(e => e.includes('No zoom keyframes were applied'))) {
    console.error('Test 4 errors:', result.errors);
  }
  assert.equal(result.status, 'failed');
  assert.ok(result.errors.some(e => e.includes('No zoom keyframes were applied')));
  assert.equal(result.appliedOperations.length, 0);
});

test('Error & Recovery: User cancel aborts operation cleanly without corrupted state', async () => {
  const p = fixtureProject();
  const store = new EditorStore(p);
  const job = pipeline.createEditingJob(p, 'Add captions', []);

  const controller = new AbortController();

  const runtime = {
    getProject: () => store.getSnapshot(),
    interacting: () => false,
    persist: async (next, j) => {
      j.timelineRevision = store.getSnapshot().revision + 1;
      store.execute(curr => ({ ...next, editingJob: structuredClone(j) }));
    },
    execute: async (stage) => {
      if (stage === 'analyzeFootage') return { summary: 'Analysis', operations: ['captions'] };
      if (stage === 'applyCaptions') {
        controller.abort();
        throw new Error('Operation aborted');
      }
    }
  };

  const result = await pipeline.runEditingJob(runtime, job, controller.signal);
  if (result.status !== 'cancelled') {
    console.error('Test 5 status:', result.status, 'errors:', result.errors);
  }
  assert.equal(result.status, 'cancelled');
  assert.equal(Object.keys(store.getSnapshot().captions).length, 0, 'No partial mutations inserted on cancel');
});
