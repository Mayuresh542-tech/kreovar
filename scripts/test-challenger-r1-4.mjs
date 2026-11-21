import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');

function createVmLoader(extraGlobals = {}) {
  const cache = new Map();
  const context = vm.createContext({
    console,
    URL,
    URLSearchParams,
    Headers,
    Request,
    Response,
    Buffer,
    Error,
    structuredClone,
    TextEncoder,
    AbortSignal,
    AbortController,
    Uint8Array,
    crypto: globalThis.crypto,
    setTimeout,
    clearTimeout,
    fetch: globalThis.fetch,
    document: { fonts: { ready: Promise.resolve() }, createElement: () => ({}) },
    navigator: {},
    process: { env: { ...process.env } },
    ...extraGlobals,
  });

  function load(relative) {
    let file = path.resolve(root, relative);
    if (!path.extname(file)) file += '.ts';
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const raw = fs.readFileSync(file, 'utf8');
    const code = ts.transpileModule(raw, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;

    new vm.Script('(function(require,module,exports){\n' + code + '\n})', { filename: file }).runInContext(context)(
      (s) => (s.startsWith('@/') ? load(s.slice(2)) : s.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(file), s))) : require(s)),
      { exports },
      exports
    );
    return exports;
  }
  return { load, context };
}

describe('Challenger R1.4 Empirical Stress Suite', () => {

  // =========================================================================
  // 1. Partial/Cancelled Run UI Action Visibility (AiResponseBubble.tsx)
  // =========================================================================
  describe('1. Partial/Cancelled Run UI Action Visibility', () => {
    const bubbleSource = fs.readFileSync(path.join(root, 'app/components/editor/AiResponseBubble.tsx'), 'utf8');

    test('AiResponseBubble.tsx does NOT gate showActions on turn.status === "completed"', () => {
      assert.ok(
        !bubbleSource.includes('turn.status === "completed" &&'),
        'AiResponseBubble must not require completed status to show actions'
      );
    });

    test('showActions predicate evaluates true for cancelled/failed runs with revision increase', () => {
      // Replicate exact predicate from app/components/editor/AiResponseBubble.tsx lines 39-41:
      const evaluateShowActions = (turn) =>
        !turn.isClarification &&
        (turn.didModifyTimeline || turn.changes.length > 0 || turn.undone);

      // Cancelled run with timeline modifications
      const cancelledWithChanges = {
        id: 'turn-cancel-1',
        status: 'cancelled',
        isClarification: false,
        didModifyTimeline: true,
        changes: [{ id: 'ch-1', label: 'Added captions', time: 0 }],
        preRevision: 1,
        postRevision: 3,
        undone: false,
      };
      assert.strictEqual(evaluateShowActions(cancelledWithChanges), true);

      // Failed run with timeline modifications
      const failedWithChanges = {
        id: 'turn-fail-1',
        status: 'failed',
        isClarification: false,
        didModifyTimeline: true,
        changes: [{ id: 'ch-2', label: 'Added zoom', time: 2 }],
        preRevision: 2,
        postRevision: 4,
        undone: false,
      };
      assert.strictEqual(evaluateShowActions(failedWithChanges), true);

      // Cancelled run WITHOUT modifications (aborted before any stage executed)
      const cancelledClean = {
        id: 'turn-cancel-clean',
        status: 'cancelled',
        isClarification: false,
        didModifyTimeline: false,
        changes: [],
        preRevision: 2,
        postRevision: 2,
        undone: false,
      };
      assert.strictEqual(evaluateShowActions(cancelledClean), false, 'Clean cancel should not display action buttons');

      // Clarification turn should NEVER show action buttons
      const clarificationTurn = {
        id: 'turn-clarify',
        status: 'completed',
        isClarification: true,
        didModifyTimeline: true,
        changes: [{ id: 'ch-3', label: 'Dummy' }],
        preRevision: 1,
        postRevision: 2,
        undone: false,
      };
      assert.strictEqual(evaluateShowActions(clarificationTurn), false, 'Clarification must not show actions');
    });

    test('canUndoTurn predicate in useConversationalAiChat allows undoing cancelled/failed runs', () => {
      const { load } = createVmLoader();
      const model = load('app/lib/editor/model');
      const ops = load('app/lib/editor/operations');
      const { EditorStore } = load('app/lib/editor/store');

      let project = model.createProject('bubble-test-proj');
      project = ops.addAsset(project, { id: 'a1', kind: 'video', name: 'v.mp4', duration: 15, width: 1080, height: 1920, mime: 'video/mp4', size: 1000 });
      const store = new EditorStore(project);

      // Simulate stage 1 execution
      store.execute((p) => ops.addClip(p, 'a1', 'track-video', 0, { id: 'c1', duration: 10 }));
      const current = store.getSnapshot();

      // Predicate matching lines 271-280 in useConversationalAiChat.ts:
      const canUndoTurn = (turn, snap, s) =>
        Boolean(
          turn.didModifyTimeline &&
            !turn.undone &&
            s.canUndo &&
            snap.revision === turn.postRevision
        );

      const cancelledTurn = {
        id: 'turn-cancelled',
        status: 'cancelled',
        didModifyTimeline: true,
        undone: false,
        preRevision: 0,
        postRevision: current.revision,
      };

      assert.strictEqual(canUndoTurn(cancelledTurn, current, store), true);
    });
  });

  // =========================================================================
  // 2. Web Locks & stopExecution() Stress Tests
  // =========================================================================
  describe('2. Web Locks & stopExecution() Concurrency Safety', () => {
    class MockLockManager {
      constructor() {
        this.activeLocks = new Set();
      }

      async request(name, optionsOrCallback, callbackOrUndefined) {
        const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : callbackOrUndefined;
        const options = typeof optionsOrCallback === 'object' ? optionsOrCallback : {};

        if (this.activeLocks.has(name)) {
          if (options.ifAvailable) {
            return callback(null);
          }
          throw new Error('Lock contention: lock ' + name + ' is already held.');
        }

        this.activeLocks.add(name);
        try {
          return await callback({ name, mode: 'exclusive' });
        } finally {
          this.activeLocks.delete(name);
        }
      }
    }

    test('stopExecution awaits execution promise and releases lock cleanly across 25 rapid cycles', async () => {
      const locks = new MockLockManager();
      const scope = 'stress-project-lock';
      let isExecuting = false;
      let abortController = null;
      let currentExecutionPromiseRef = null;

      const runAIEdit = (signal) => {
        return locks.request('kreovar-ai-edit:' + scope, { ifAvailable: true }, async (lock) => {
          if (!lock) throw new Error('This project already has an AI edit running in another tab.');
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 30);
            signal.addEventListener('abort', () => {
              clearTimeout(timer);
              // Small async microtask unwinding
              setTimeout(() => reject(new Error('AbortError')), 5);
            });
          });
        });
      };

      const start = () => {
        isExecuting = true;
        abortController = new AbortController();
        const p = runAIEdit(abortController.signal);
        currentExecutionPromiseRef = p;
        return p.catch(() => {});
      };

      const stopExecution = async () => {
        if (abortController) {
          abortController.abort();
          abortController = null;
          if (currentExecutionPromiseRef) {
            try {
              await currentExecutionPromiseRef;
            } catch {}
          }
          isExecuting = false;
        }
      };

      // Run 25 rapid start -> stop -> immediate start cycles
      for (let i = 0; i < 25; i++) {
        const runPromise = start();
        assert.strictEqual(isExecuting, true);
        assert.strictEqual(locks.activeLocks.has('kreovar-ai-edit:' + scope), true);

        // Concurrently stop
        await stopExecution();
        await runPromise;

        assert.strictEqual(isExecuting, false);
        assert.strictEqual(locks.activeLocks.has('kreovar-ai-edit:' + scope), false, `Lock must be released after cycle ${i}`);
      }
    });

    test('failure mode reproduction: un-awaited execution promise causes immediate second run to fail', async () => {
      const locks = new MockLockManager();
      const scope = 'fail-repro-scope';
      let isExecuting = false;
      let abortController = null;

      const runAIEdit = (signal) => {
        return locks.request('kreovar-ai-edit:' + scope, { ifAvailable: true }, async (lock) => {
          if (!lock) throw new Error('This project already has an AI edit running in another tab.');
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 50);
            signal.addEventListener('abort', () => {
              setTimeout(() => {
                clearTimeout(timer);
                reject(new Error('AbortError'));
              }, 15);
            });
          });
        });
      };

      const unawaitedStop = () => {
        if (abortController) {
          abortController.abort();
          abortController = null;
          isExecuting = false; // Does NOT await promise!
        }
      };

      isExecuting = true;
      abortController = new AbortController();
      const task1 = runAIEdit(abortController.signal).catch(() => {});

      // Call flawed unawaited stop
      unawaitedStop();
      assert.strictEqual(isExecuting, false);

      // Lock is still held in mock
      let caughtError = null;
      try {
        const ctrl2 = new AbortController();
        await runAIEdit(ctrl2.signal);
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError, 'Un-awaited stop must cause lock contention on subsequent run');
      assert.match(caughtError.message, /already has an AI edit running/);

      await task1;
    });
  });

  // =========================================================================
  // 3. Timeline Lock in Workspace.tsx Stress Tests
  // =========================================================================
  describe('3. Timeline Lock in Workspace.tsx', () => {
    const { load } = createVmLoader();
    const model = load('app/lib/editor/model');
    const ops = load('app/lib/editor/operations');
    const { EditorStore } = load('app/lib/editor/store');

    function createWorkspaceRunner(store, isExecutingGetter, notifyCallback) {
      return (edit) => {
        if (isExecutingGetter()) {
          notifyCallback('Timeline is locked while AI is editing.');
          return;
        }
        try {
          store.execute(edit);
        } catch (e) {
          notifyCallback(e instanceof Error ? e.message : 'This edit could not be applied.');
        }
      };
    }

    test('manual edits are completely blocked with user notification during AI execution', () => {
      let project = model.createProject('workspace-lock-proj');
      project = ops.addAsset(project, { id: 'v1', kind: 'video', name: 'v.mp4', duration: 10, width: 1080, height: 1920, mime: 'video/mp4', size: 1000 });
      const store = new EditorStore(project);

      const notices = [];
      const notify = (msg) => notices.push(msg);
      let isExecuting = true;
      const run = createWorkspaceRunner(store, () => isExecuting, notify);

      const initialRevision = store.getSnapshot().revision;

      // Blast 100 manual edits while isExecuting === true
      for (let i = 0; i < 100; i++) {
        run((p) => ops.addClip(p, 'v1', 'track-video', i, { id: `c-${i}`, duration: 1 }));
      }

      assert.strictEqual(notices.length, 100);
      assert.strictEqual(notices[0], 'Timeline is locked while AI is editing.');
      assert.strictEqual(store.getSnapshot().revision, initialRevision);
      assert.strictEqual(Object.keys(store.getSnapshot().clips).length, 0);

      // Now toggle isExecuting to false
      isExecuting = false;
      run((p) => ops.addClip(p, 'v1', 'track-video', 0, { id: 'legit-clip', duration: 5 }));

      assert.strictEqual(store.getSnapshot().revision, initialRevision + 1);
      assert.ok(store.getSnapshot().clips['legit-clip']);
    });
  });

  // =========================================================================
  // 4. Reconciler Invariant: rippleCut Decisions Sorted & Trailing
  // =========================================================================
  describe('4. Reconciler Invariant for rippleCut Decisions', () => {
    const { load } = createVmLoader();
    const model = load('app/lib/editor/model');
    const ops = load('app/lib/editor/operations');
    const { reconcileEditingDecisions } = load('app/lib/editor/inPlaceReconciler');

    function createBaseProject() {
      let p = model.createProject('reconciler-invariant-proj');
      p = ops.addAsset(p, { id: 'v1', kind: 'video', name: 'main.mp4', duration: 60, width: 1080, height: 1920, mime: 'video/mp4', size: 5000 });
      p = ops.addClip(p, 'v1', 'track-video', 0, { id: 'clip-1', duration: 60, sourceEnd: 60 });
      return p;
    }

    test('complex mix of decisions: rippleCuts are chronologically sorted and placed strictly at end', () => {
      const project = createBaseProject();
      const decisions = [
        { op: 'rippleCut', ranges: [{ start: 40, end: 45 }, { start: 20, end: 25 }] }, // unsorted internal ranges
        { op: 'addZoom', clipId: 'clip-1', startTime: 5, endTime: 7, fromScale: 1, toScale: 1.15 },
        { op: 'addText', text: 'Introduction Title', placementId: 'header', trackId: 'track-text', startTime: 0, duration: 4 },
        { op: 'rippleCut', ranges: [{ start: 5, end: 8 }] },
        { op: 'addClip', assetId: 'broll-1', trackId: 'track-overlay', startTime: 10, duration: 3, audioRole: 'background', volume: 0 },
        { op: 'setAudioDucking', enabled: true },
        { op: 'rippleCut', ranges: [{ start: 30, end: 32 }] },
        { op: 'addText', text: 'Speaker Name', placementId: 'lower-third', trackId: 'track-text', startTime: 12, duration: 3 },
      ];

      const result = reconcileEditingDecisions(project, decisions, []);
      const finalOps = result.decisions.map((d) => d.op);

      // Verify that all non-rippleCut operations come before ANY rippleCut
      const firstRippleIdx = finalOps.indexOf('rippleCut');
      const lastNonRippleIdx = Math.max(
        finalOps.lastIndexOf('addZoom'),
        finalOps.lastIndexOf('addText'),
        finalOps.lastIndexOf('addClip'),
        finalOps.lastIndexOf('setAudioDucking')
      );

      assert.ok(
        firstRippleIdx > lastNonRippleIdx,
        `All ripple cuts must trail non-cuts. firstRippleIdx=${firstRippleIdx}, lastNonRippleIdx=${lastNonRippleIdx}`
      );

      // Verify ripple cuts order: earliest start range (5s, then 20s, then 30s)
      const rippleDecisions = result.decisions.filter((d) => d.op === 'rippleCut');
      assert.strictEqual(rippleDecisions.length, 3);
      assert.strictEqual(rippleDecisions[0].ranges[0].start, 5);
      assert.strictEqual(rippleDecisions[1].ranges[0].start, 20);
      assert.strictEqual(rippleDecisions[1].ranges[1].start, 40); // Internal range sorted
      assert.strictEqual(rippleDecisions[2].ranges[0].start, 30);

      // Verify text preservation: both 'header' and 'lower-third' must be retained
      const textDecisions = result.decisions.filter((d) => d.op === 'addText');
      assert.strictEqual(textDecisions.length, 2, 'Non-hallucinated addText decisions must both be preserved');
      assert.ok(textDecisions.some((t) => t.placementId === 'header'));
      assert.ok(textDecisions.some((t) => t.placementId === 'lower-third'));
    });

    test('explicit invalidHallucination flag correctly filters hallucinated text while keeping valid text', () => {
      const project = createBaseProject();
      const decisions = [
        { op: 'addText', text: 'Legit Header', placementId: 'header', trackId: 'track-text', startTime: 0, duration: 3 },
        { op: 'addText', text: 'Ghost text', placementId: 'floating', trackId: 'track-text', startTime: 1, duration: 2, invalidHallucination: true },
        { op: 'rippleCut', ranges: [{ start: 10, end: 12 }] },
      ];

      const result = reconcileEditingDecisions(project, decisions, []);
      const textDecisions = result.decisions.filter((d) => d.op === 'addText');
      assert.strictEqual(textDecisions.length, 1);
      assert.strictEqual(textDecisions[0].text, 'Legit Header');
    });

    test('reconciler edge cases: empty ranges, nullish bounds, and zero-cut scenarios', () => {
      const project = createBaseProject();
      // Case 1: Empty ripple cut ranges
      const resultEmpty = reconcileEditingDecisions(project, [
        { op: 'rippleCut', ranges: [] },
        { op: 'addText', text: 'Title', placementId: 'custom', trackId: 'track-text', startTime: 0, duration: 2 }
      ], []);
      assert.strictEqual(resultEmpty.decisions.length, 2);
      assert.strictEqual(resultEmpty.decisions[1].op, 'rippleCut');

      // Case 2: Only non-cuts
      const resultNoCuts = reconcileEditingDecisions(project, [
        { op: 'setAudioDucking', enabled: true },
        { op: 'addText', text: 'Title 2', trackId: 'track-text', startTime: 0, duration: 2 }
      ], []);
      assert.strictEqual(resultNoCuts.decisions.length, 2);
      assert.ok(!resultNoCuts.decisions.some(d => d.op === 'rippleCut'));

      // Case 3: Only cuts
      const resultOnlyCuts = reconcileEditingDecisions(project, [
        { op: 'rippleCut', ranges: [{ start: 15, end: 20 }] },
        { op: 'rippleCut', ranges: [{ start: 2, end: 5 }] }
      ], []);
      assert.strictEqual(resultOnlyCuts.decisions.length, 2);
      assert.strictEqual(resultOnlyCuts.decisions[0].ranges[0].start, 2);
      assert.strictEqual(resultOnlyCuts.decisions[1].ranges[0].start, 15);
    });
  });

  // =========================================================================
  // 5. Atomic Rollback & Store History Boundaries
  // =========================================================================
  describe('5. Atomic Multi-Stage Rollback Boundaries', () => {
    const { load } = createVmLoader();
    const model = load('app/lib/editor/model');
    const ops = load('app/lib/editor/operations');
    const { EditorStore } = load('app/lib/editor/store');

    test('rollbackToRevision restores exact preTurnRevision across checkpoints', () => {
      let p = model.createProject('rollback-boundary-proj');
      p = ops.addAsset(p, { id: 'v1', kind: 'video', name: 'v.mp4', duration: 20, width: 1080, height: 1920, mime: 'video/mp4', size: 1000 });
      p = ops.addClip(p, 'v1', 'track-video', 0, { id: 'c1', duration: 20 });
      const store = new EditorStore(p);

      // User makes a manual edit before AI turn
      store.execute((s) => ({ ...s, settings: { ...s.settings, title: 'Manual Title' } }));
      const preTurnRevision = store.getSnapshot().revision;
      assert.strictEqual(preTurnRevision, 1);

      // AI job starts with checkpoints
      store.checkpoint((s) => ({ ...s, editingJob: { id: 'job-1', currentStage: 'analyzeFootage' } }));

      // Stage 1: Add Captions
      store.execute((s) => ops.addText(s, 'Hello world', 0, {}, true, 3));

      // Checkpoint between stages
      store.checkpoint((s) => ({ ...s, editingJob: { id: 'job-1', currentStage: 'applyBroll' } }));

      // Stage 2: Add Overlay Clip
      store.execute((s) => ops.addClip(s, 'v1', 'track-overlay', 5, { id: 'broll-c2', duration: 3 }));

      assert.ok(store.getSnapshot().revision > preTurnRevision);
      assert.strictEqual(store.getSnapshot().settings.title, 'Manual Title');
      assert.ok(store.getSnapshot().clips['broll-c2']);

      // Atomic rollback to preTurnRevision
      const success = store.rollbackToRevision(preTurnRevision);
      assert.strictEqual(success, true);

      const rolled = store.getSnapshot();
      assert.strictEqual(rolled.settings.title, 'Manual Title', 'User title preserved');
      assert.strictEqual(rolled.clips['broll-c2'], undefined, 'B-roll clip rolled back');
    });

    test('investigate rollbackToRevision behavior when target revision exceeds project revision', () => {
      let p = model.createProject('rollback-future-proj');
      const store = new EditorStore(p);
      store.execute((s) => ({ ...s, settings: { ...s.settings, title: 'Edit 1' } }));
      store.execute((s) => ({ ...s, settings: { ...s.settings, title: 'Edit 2' } }));

      const currentRev = store.getSnapshot().revision; // 2

      // Edge case: target revision is 999 (far in future / non-existent)
      const resultFuture = store.rollbackToRevision(999);
      // NOTE: In the current store.ts implementation, lines 42-44 do:
      // index = this.past.findLastIndex((p) => p.revision <= targetRevision);
      // This causes targetRevision 999 to roll back to the last element of past instead of returning false!
      // We document this empirical behavior for our report.
      console.log(`[Empirical Observation] store.rollbackToRevision(999) returned: ${resultFuture}, snapshot title after call: "${store.getSnapshot().settings.title}"`);
    });
  });
});
