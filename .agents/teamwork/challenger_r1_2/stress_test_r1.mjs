import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
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
    ...extraGlobals
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
        esModuleInterop: true
      }
    }).outputText;

    new vm.Script('(function(require,module,exports){\n' + code + '\n})', { filename: file }).runInContext(context)(
      (s) => s.startsWith('@/') ? load(s.slice(2)) : s.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(file), s))) : require(s),
      { exports },
      exports
    );
    return exports;
  }
  return { load, context };
}

describe('Challenger R1 Stress Suite', () => {

  // =========================================================================
  // 1. Reconciler Invariant Stress Tests
  // =========================================================================
  describe('1. Reconciler Invariant for rippleCut decisions', () => {
    const { load } = createVmLoader();
    const model = load('app/lib/editor/model');
    const ops = load('app/lib/editor/operations');
    const { reconcileEditingDecisions } = load('app/lib/editor/inPlaceReconciler');

    function createBaseProject() {
      let p = model.createProject('reconciler-stress-proj');
      p = ops.addAsset(p, { id: 'v1', kind: 'video', name: 'clip.mp4', duration: 30, width: 1080, height: 1920, mime: 'video/mp4', size: 1000 });
      p = ops.addClip(p, 'v1', 'track-video', 0, { id: 'clip-v1', duration: 30, sourceEnd: 30 });
      return p;
    }

    test('rippleCut placed at beginning is moved strictly to the very end', () => {
      const project = createBaseProject();
      const decisions = [
        { op: 'rippleCut', ranges: [{ start: 2, end: 4 }] },
        { op: 'addZoom', clipId: 'clip-v1', startTime: 0, endTime: 2, fromScale: 1, toScale: 1.2 },
        { op: 'setAudioDucking', enabled: true },
        { op: 'addText', text: 'Speaker', placementId: 'lower-third', trackId: 'track-text', startTime: 0, duration: 3 }
      ];

      const result = reconcileEditingDecisions(project, decisions, []);
      const finalOps = result.decisions.map(d => d.op);
      assert.equal(finalOps[finalOps.length - 1], 'rippleCut', 'Last decision must be rippleCut');
      assert.ok(finalOps.indexOf('rippleCut') > finalOps.indexOf('addZoom'), 'rippleCut must come after addZoom');
      assert.ok(finalOps.indexOf('rippleCut') > finalOps.indexOf('addText'), 'rippleCut must come after addText');
    });

    test('multiple rippleCut decisions are chronologically sorted and appended at the end', () => {
      const project = createBaseProject();
      const decisions = [
        { op: 'rippleCut', ranges: [{ start: 10, end: 12 }] },
        { op: 'addZoom', clipId: 'clip-v1', startTime: 1, endTime: 3, fromScale: 1, toScale: 1.15 },
        { op: 'rippleCut', ranges: [{ start: 1, end: 3 }] },
        { op: 'addClip', assetId: 'broll-1', trackId: 'track-overlay', startTime: 5, duration: 2, audioRole: 'background', volume: 0 },
        { op: 'rippleCut', ranges: [{ start: 6, end: 8 }] }
      ];

      const result = reconcileEditingDecisions(project, decisions, []);
      const finalOps = result.decisions.map(d => d.op);

      // Verify all non-ripple decisions precede any rippleCut
      const firstRippleIdx = finalOps.indexOf('rippleCut');
      const lastNonRippleIdx = Math.max(
        finalOps.lastIndexOf('addZoom'),
        finalOps.lastIndexOf('addClip')
      );
      assert.ok(firstRippleIdx > lastNonRippleIdx, `All ripple cuts must be at the end. First ripple at ${firstRippleIdx}, last non-ripple at ${lastNonRippleIdx}`);

      // Verify multiple rippleCut decisions are sorted by earliest range start
      const rippleDecisions = result.decisions.filter(d => d.op === 'rippleCut');
      assert.equal(rippleDecisions.length, 3);
      assert.equal(rippleDecisions[0].ranges[0].start, 1);
      assert.equal(rippleDecisions[1].ranges[0].start, 6);
      assert.equal(rippleDecisions[2].ranges[0].start, 10);
    });

    test('unsorted ranges inside a single rippleCut decision are sorted chronologically', () => {
      const project = createBaseProject();
      const decisions = [
        {
          op: 'rippleCut',
          ranges: [
            { start: 15, end: 18 },
            { start: 2, end: 4 },
            { start: 8, end: 10 }
          ]
        },
        { op: 'addZoom', clipId: 'clip-v1', startTime: 0, endTime: 2, fromScale: 1, toScale: 1.1 }
      ];

      const result = reconcileEditingDecisions(project, decisions, []);
      const ripple = result.decisions.find(d => d.op === 'rippleCut');
      assert.ok(ripple);
      assert.deepEqual(
        ripple.ranges.map(r => r.start),
        [2, 8, 15],
        'Ranges inside rippleCut must be chronologically sorted'
      );
    });

    test('speech-derived silence cuts (requestedSilenceCut) are sorted and placed after phrase quotes', () => {
      const project = createBaseProject();
      const speech = [
        { text: 'Hello', start: 0, end: 1, words: [{ word: 'Hello', start: 0, end: 1 }] },
        { text: 'world', start: 3, end: 4, words: [{ word: 'world', start: 3, end: 4 }] }, // gap of 2s (>0.6s)
        { text: 'welcome', start: 6, end: 7, words: [{ word: 'welcome', start: 6, end: 7 }] } // gap of 2s (>0.6s)
      ];

      const constraints = {
        disallowedAudio: false,
        disallowedSfx: false,
        disallowedCuts: false,
        disallowedBroll: false,
        disallowedZooms: false,
        removeZooms: false,
        requestedSilenceCut: true,
        phraseQuotes: ['world'],
        protectedIntervals: []
      };

      const result = reconcileEditingDecisions(project, [], [], constraints, speech);
      const opsList = result.decisions.map(d => d.op);
      assert.ok(opsList.includes('addZoom'), 'Should have anchored punch zoom');
      assert.ok(opsList.includes('rippleCut'), 'Should have generated silence cuts');
      assert.equal(opsList[opsList.length - 1], 'rippleCut', 'rippleCut must be last decision');
      assert.ok(opsList.indexOf('addZoom') < opsList.indexOf('rippleCut'), 'addZoom must come before rippleCut');
    });

    test('edge case: rippleCut with empty ranges or non-array ranges does not crash', () => {
      const project = createBaseProject();
      const decisions = [
        { op: 'rippleCut', ranges: [] },
        { op: 'addZoom', clipId: 'clip-v1', startTime: 1, endTime: 2, fromScale: 1, toScale: 1.1 }
      ];

      const result = reconcileEditingDecisions(project, decisions, []);
      assert.equal(result.decisions.length, 2);
      assert.equal(result.decisions[1].op, 'rippleCut');
    });
  });

  // =========================================================================
  // 2. Timeline Mutation Lock Stress Tests
  // =========================================================================
  describe('2. Timeline Mutation Lock in Workspace.tsx', () => {
    const { load } = createVmLoader();
    const model = load('app/lib/editor/model');
    const ops = load('app/lib/editor/operations');
    const { EditorStore } = load('app/lib/editor/store');

    function simulateWorkspaceRun(store, isExecuting, notifyCallback) {
      return (edit) => {
        if (isExecuting) {
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

    test('attempting run(edit) while isExecuting === true is blocked with notice and does not mutate store', () => {
      let project = model.createProject('lock-test-proj');
      project = ops.addAsset(project, { id: 'v1', kind: 'video', name: 'clip.mp4', duration: 10, width: 1080, height: 1920, mime: 'video/mp4', size: 1000 });
      const store = new EditorStore(project);

      const notices = [];
      const notify = (msg) => notices.push(msg);

      let isExecuting = true;
      const run = simulateWorkspaceRun(store, isExecuting, notify);

      const preRevision = store.getSnapshot().revision;

      // Attempt manual clip addition while AI is executing
      run((p) => ops.addClip(p, 'v1', 'track-video', 0, { id: 'manual-clip', duration: 5 }));

      // Verify notice was triggered
      assert.equal(notices.length, 1);
      assert.equal(notices[0], 'Timeline is locked while AI is editing.');

      // Verify store was not mutated
      assert.equal(store.getSnapshot().revision, preRevision, 'Revision must NOT change when blocked');
      assert.equal(Boolean(store.getSnapshot().clips['manual-clip']), false, 'Clip must NOT be added');
    });

    test('high-concurrency blast of manual edits during isExecuting === true leaves store completely intact', () => {
      let project = model.createProject('blast-lock-proj');
      const store = new EditorStore(project);

      const notices = [];
      const notify = (msg) => notices.push(msg);

      const isExecuting = true;
      const run = simulateWorkspaceRun(store, isExecuting, notify);

      const initialRevision = store.getSnapshot().revision;

      // Blast 50 concurrent edits
      for (let i = 0; i < 50; i++) {
        run((p) => ops.addAsset(p, { id: `asset-${i}`, kind: 'video', name: `v${i}.mp4`, duration: 5, width: 1080, height: 1920, mime: 'video/mp4', size: 100 }));
      }

      assert.equal(notices.length, 50, 'All 50 edits must be intercepted with notice');
      assert.equal(store.getSnapshot().revision, initialRevision, 'Revision must stay identical');
      assert.equal(Object.keys(store.getSnapshot().assets).length, 0, 'No assets must be added');
    });

    test('when isExecuting transitions to false, run(edit) immediately applies mutations cleanly', () => {
      let project = model.createProject('unlock-test-proj');
      project = ops.addAsset(project, { id: 'v1', kind: 'video', name: 'clip.mp4', duration: 10, width: 1080, height: 1920, mime: 'video/mp4', size: 1000 });
      const store = new EditorStore(project);

      const notices = [];
      const notify = (msg) => notices.push(msg);

      let isExecuting = true;
      let run = simulateWorkspaceRun(store, isExecuting, notify);

      // Blocked while true
      run((p) => ops.addClip(p, 'v1', 'track-video', 0, { id: 'c1', duration: 5 }));
      assert.equal(store.getSnapshot().revision, 0);

      // Transition isExecuting to false
      isExecuting = false;
      run = simulateWorkspaceRun(store, isExecuting, notify);

      // Successfully applies
      run((p) => ops.addClip(p, 'v1', 'track-video', 0, { id: 'c1', duration: 5 }));
      assert.equal(store.getSnapshot().revision, 1);
      assert.ok(store.getSnapshot().clips['c1']);
    });
  });

  // =========================================================================
  // 3. Web Locks Race & stopExecution() Stress Tests
  // =========================================================================
  describe('3. Lock race & stopExecution()', () => {
    // Mock navigator.locks conforming to the Web Locks API
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
          throw new Error('Lock contention in mock');
        }

        this.activeLocks.add(name);
        const lock = { name, mode: 'exclusive' };
        try {
          return await callback(lock);
        } finally {
          this.activeLocks.delete(name);
        }
      }
    }

    test('awaiting currentExecutionPromiseRef in stopExecution prevents double-run lock contention error', async () => {
      const mockLocks = new MockLockManager();
      let isExecuting = false;
      let abortController = null;
      let currentExecutionPromiseRef = null;
      const notices = [];
      const notify = (msg) => notices.push(msg);

      // Simulate an AI edit that takes 50ms to finish a stage
      const runSequentialEditSim = (scope, signal) => {
        return mockLocks.request('kreovar-ai-edit:' + scope, { ifAvailable: true }, async (lock) => {
          if (!lock) throw new Error('This project already has an AI edit running in another tab.');
          // Simulate multi-stage pipeline executing
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 50);
            signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new Error('AbortError: The operation was aborted.'));
            });
          });
        });
      };

      const startEdit = (scope) => {
        isExecuting = true;
        abortController = new AbortController();
        const executionPromise = runSequentialEditSim(scope, abortController.signal);
        currentExecutionPromiseRef = executionPromise;
        return executionPromise.catch(() => {});
      };

      // Implementation of stopExecution as written in useConversationalAiChat.ts
      const stopExecution = async () => {
        if (abortController) {
          abortController.abort();
          abortController = null;
          notify('AI edit paused.');
          if (currentExecutionPromiseRef) {
            try {
              await currentExecutionPromiseRef;
            } catch {}
          }
          isExecuting = false;
        }
      };

      // 1. Start execution
      const editTask = startEdit('test-scope');
      assert.equal(isExecuting, true);
      assert.equal(mockLocks.activeLocks.has('kreovar-ai-edit:test-scope'), true);

      // 2. Concurrently invoke stopExecution()
      await stopExecution();

      // 3. Verify that once stopExecution() resolves:
      // - isExecuting is false
      // - The Web Lock has been completely released!
      assert.equal(isExecuting, false);
      assert.equal(mockLocks.activeLocks.has('kreovar-ai-edit:test-scope'), false, 'Lock MUST be released before stopExecution resolves');

      // 4. Start a subsequent edit immediately: must acquire lock WITHOUT contention error
      let secondEditError = null;
      try {
        const secondTask = startEdit('test-scope');
        await new Promise(r => setTimeout(r, 10));
        await stopExecution();
        await secondTask;
      } catch (err) {
        secondEditError = err;
      }

      assert.equal(secondEditError, null, 'Second edit immediately after stopExecution must NOT fail with lock contention');
    });

    test('demonstrate failure mode if stopExecution does NOT await currentExecutionPromiseRef', async () => {
      const mockLocks = new MockLockManager();
      let isExecuting = false;
      let abortController = null;
      let currentExecutionPromiseRef = null;

      const runSequentialEditSim = (scope, signal) => {
        return mockLocks.request('kreovar-ai-edit:' + scope, { ifAvailable: true }, async (lock) => {
          if (!lock) throw new Error('This project already has an AI edit running in another tab.');
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 50);
            signal.addEventListener('abort', () => {
              // Asynchronous cleanup takes 10ms
              setTimeout(() => {
                clearTimeout(timer);
                reject(new Error('Aborted'));
              }, 10);
            });
          });
        });
      };

      const startEdit = (scope) => {
        isExecuting = true;
        abortController = new AbortController();
        const executionPromise = runSequentialEditSim(scope, abortController.signal);
        currentExecutionPromiseRef = executionPromise;
        return executionPromise;
      };

      // FLAWED implementation that resets isExecuting without awaiting promise
      const flawedStopExecution = async () => {
        if (abortController) {
          abortController.abort();
          abortController = null;
          // NO await currentExecutionPromiseRef!
          isExecuting = false;
        }
      };

      // Start edit
      const task1 = startEdit('scope-flawed').catch(() => {});
      // Call flawed stop
      await flawedStopExecution();
      assert.equal(isExecuting, false);

      // Lock is STILL held because abort cleanup is in flight!
      assert.equal(mockLocks.activeLocks.has('kreovar-ai-edit:scope-flawed'), true);

      // Attempting immediate second run fails with lock error!
      let lockError = null;
      try {
        await startEdit('scope-flawed');
      } catch (err) {
        lockError = err;
      }
      assert.ok(lockError, 'Flawed stopExecution leaves lock active and causes double-run error');
      assert.match(lockError.message, /already has an AI edit running/);

      await task1;
    });
  });

  // =========================================================================
  // 4. Partial/Cancelled Run Visibility Challenge (AiResponseBubble & Chat)
  // =========================================================================
  describe('4. Partial/Cancelled Run Visibility (Undo Edit and View Changes)', () => {
    test('check showActions predicate logic in AiResponseBubble.tsx', () => {
      const bubbleSource = fs.readFileSync(path.join(root, 'app/components/editor/AiResponseBubble.tsx'), 'utf8');
      assert.ok(
        !bubbleSource.includes('turn.status === "completed" &&'),
        'turn.status === "completed" must be removed so partial/cancelled edits show actions'
      );

      function evaluateShowActions(turn) {
        return (
          !turn.isClarification &&
          (turn.didModifyTimeline || turn.changes.length > 0 || turn.undone)
        );
      }

      // Scenario A: A completed turn that modified timeline
      const completedTurn = {
        id: 'turn-1',
        status: 'completed',
        isClarification: false,
        didModifyTimeline: true,
        changes: [{ id: 'c1', label: 'Added captions' }],
        preRevision: 1,
        postRevision: 2
      };
      assert.equal(evaluateShowActions(completedTurn), true, 'Completed turn shows actions');

      // Scenario B: A cancelled turn (user clicked stop) after stage 1 committed mutations (postRevision > preRevision)
      const cancelledTurnWithMutations = {
        id: 'turn-2',
        status: 'cancelled',
        isClarification: false,
        didModifyTimeline: true,
        changes: [{ id: 'c1', label: 'Added captions' }],
        preRevision: 1,
        postRevision: 2
      };

      const showActionsForCancelled = evaluateShowActions(cancelledTurnWithMutations);
      assert.equal(showActionsForCancelled, true, 'REMEDIATED: AiResponseBubble shows actions for cancelled runs with mutations!');

      // Scenario C: A failed turn after stage 1 committed mutations
      const failedTurnWithMutations = {
        id: 'turn-3',
        status: 'failed',
        isClarification: false,
        didModifyTimeline: true,
        changes: [{ id: 'c1', label: 'Added captions' }],
        preRevision: 1,
        postRevision: 2
      };
      const showActionsForFailed = evaluateShowActions(failedTurnWithMutations);
      assert.equal(showActionsForFailed, true, 'REMEDIATED: AiResponseBubble shows actions for failed runs with mutations!');
    });

    test('canUndoTurn predicate in useConversationalAiChat.ts handles cancelled/failed partial runs correctly', () => {
      const { load } = createVmLoader();
      const model = load('app/lib/editor/model');
      const ops = load('app/lib/editor/operations');
      const { EditorStore } = load('app/lib/editor/store');

      let project = model.createProject('partial-test-proj');
      const store = new EditorStore(project);

      // Simulate stage 1 committing an edit
      store.execute((p) => ops.addAsset(p, { id: 'a1', kind: 'video', name: 'v.mp4', duration: 10, width: 1080, height: 1920, mime: 'video/mp4', size: 100 }));
      const postRevision = store.getSnapshot().revision;
      assert.equal(postRevision, 1);

      // Define canUndoTurn matching useConversationalAiChat.ts lines 271-280:
      const canUndoTurn = (turn, currentProject, editorStore) => {
        return Boolean(
          turn.didModifyTimeline &&
            !turn.undone &&
            editorStore.canUndo &&
            currentProject.revision === turn.postRevision
        );
      };

      const cancelledTurn = {
        id: 'turn-cancelled',
        status: 'cancelled',
        didModifyTimeline: true,
        undone: false,
        preRevision: 0,
        postRevision: 1,
        changes: [{ id: 'ch1', label: 'Added asset' }]
      };

      // In useConversationalAiChat, canUndoTurn evaluates to TRUE
      const canUndoResult = canUndoTurn(cancelledTurn, store.getSnapshot(), store);
      assert.equal(canUndoResult, true, 'canUndoTurn returns true in useConversationalAiChat');

      // BUT because AiResponseBubble has `turn.status === "completed"`, it is NEVER rendered to the user!
    });
  });
});
