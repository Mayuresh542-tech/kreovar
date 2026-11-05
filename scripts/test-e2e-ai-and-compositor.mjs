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
const { Compositor } = load('app/lib/editor/compositor.ts');
const { reviewEdit } = load('app/lib/editor/aiReview.ts');
const { commitReviewedEdit } = load('app/lib/editor/reviewedEdit.ts');
const { EditorStore } = load('app/lib/editor/store.ts');

function makeCaptionWords(text, duration) {
  const parts = text.trim().split(/\s+/);
  const step = duration / parts.length;
  return parts.map((w, i) => ({
    word: w,
    start: Number((i * step).toFixed(2)),
    end: Number(((i + 1) * step).toFixed(2))
  }));
}

test('E2E Workflow: Project creation -> Footage import -> Sequential AI Edit -> Validation -> Review -> Commit -> Undo', async () => {
  // 1. Create project
  let project = model.createProject('e2e-project-1', 'Kreovar E2E Test');
  project.settings.aspectRatio = '9:16';

  // 2. Import real test footage (20s)
  const footagePath = path.join(root, 'fixtures', 'test-creator-footage.mp4');
  assert.ok(
    fs.existsSync(footagePath),
    "Test footage fixture 'fixtures/test-creator-footage.mp4' must exist. Run 'python scripts/generate-test-footage.py' or 'npm run test:fixtures' to generate fixtures."
  );
  const footageStats = fs.statSync(footagePath);

  project = ops.addAsset(project, {
    id: 'asset-main-footage',
    kind: 'video',
    name: 'test-creator-footage.mp4',
    duration: 20,
    width: 720,
    height: 1280,
    mime: 'video/mp4',
    size: footageStats.size,
    url: '/fixtures/test-creator-footage.mp4'
  });

  // Add clip to video track
  project = ops.addClip(project, 'asset-main-footage', 'track-video', 0, {
    id: 'clip-main-footage',
    duration: 20,
    sourceStart: 0,
    sourceEnd: 20,
    volume: 1
  });
  assert.equal(model.projectDuration(project), 20);

  // 3. Import B-roll footage (3s)
  const brollPath = path.join(root, 'fixtures', 'test-broll-footage.mp4');
  assert.ok(
    fs.existsSync(brollPath),
    "B-roll footage fixture 'fixtures/test-broll-footage.mp4' must exist. Run 'python scripts/generate-test-footage.py' or 'npm run test:fixtures' to generate fixtures."
  );
  const brollStats = fs.statSync(brollPath);
  const brollAsset = {
    id: 'asset-broll',
    libraryId: 'broll-lib-id-1234',
    kind: 'video',
    name: 'test-broll-footage.mp4',
    duration: 3,
    width: 720,
    height: 1280,
    mime: 'video/mp4',
    size: brollStats.size,
    url: '/fixtures/test-broll-footage.mp4'
  };

  // 4. Initialize EditorStore
  const store = new EditorStore(project);

  // 5. Create sequential editing job for full creator edit
  const instructions = 'Add animated captions, motion graphics, relevant B-roll and subtle zoom effects.';
  const job = pipeline.createEditingJob(store.getSnapshot(), instructions, ['clip-main-footage'], pipeline.PIPELINE_PRESETS[0]);
  assert.equal(job.status, 'ready');
  assert.deepEqual(job.stages.map(s => s.id), [
    'analyzeFootage',
    'applyCaptions',
    'planMotionGraphics',
    'applyMotionGraphics',
    'findBroll',
    'applyBroll',
    'applyZooms',
    'validateEdit'
  ]);

  // 6. Execute stages with deterministic mock provider
  let inFlight = 0;
  let maxConcurrent = 0;
  const stagesExecuted = [];

  const runtime = {
    getProject: () => store.getSnapshot(),
    interacting: () => store.interacting,
    persist: async (next, updatedJob) => {
      const current = store.getSnapshot();
      updatedJob.timelineRevision = current.revision + 1;
      const changed =
        next.tracks !== current.tracks ||
        next.clips !== current.clips ||
        next.captions !== current.captions ||
        next.assets !== current.assets ||
        next.textLayers !== current.textLayers ||
        next.transitions !== current.transitions;
      if (changed) {
        store.execute(curr => ({ ...next, editingJob: structuredClone(updatedJob) }));
      } else {
        store.checkpoint(curr => ({ ...next, editingJob: structuredClone(updatedJob) }));
      }
    },
    execute: async (stage, p, j) => {
      inFlight++;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      stagesExecuted.push(stage);
      try {
        switch (stage) {
          case 'analyzeFootage':
            return {
              summary: 'Analyzed 1 source clip, 20.00 seconds. Spoken dialogue present.',
              operations: ['captions', 'motionGraphics', 'broll', 'zooms']
            };

          case 'applyCaptions': {
            const t1 = 'Welcome to Kreovar video editor. In this first segment, we introduce our test footage.';
            const t2 = 'Now we move into the second segment, showing animated movement and clear speech.';
            const t3 = 'In the third segment, we highlight key editing features with synchronized audio.';
            const t4 = 'Finally, we conclude the video demonstration. Ready for export and verification.';
            return {
              summary: 'Applied timed speech captions across 4 segments',
              decisions: [
                {
                  op: 'addCaption',
                  text: t1,
                  startTime: 0.5,
                  duration: 4.0,
                  templateId: 'signature-poppins',
                  words: makeCaptionWords(t1, 4.0)
                },
                {
                  op: 'addCaption',
                  text: t2,
                  startTime: 5.2,
                  duration: 4.2,
                  templateId: 'signature-poppins',
                  words: makeCaptionWords(t2, 4.2)
                },
                {
                  op: 'addCaption',
                  text: t3,
                  startTime: 10.2,
                  duration: 4.2,
                  templateId: 'signature-poppins',
                  words: makeCaptionWords(t3, 4.2)
                },
                {
                  op: 'addCaption',
                  text: t4,
                  startTime: 15.2,
                  duration: 4.2,
                  templateId: 'signature-poppins',
                  words: makeCaptionWords(t4, 4.2)
                }
              ]
            };
          }

          case 'planMotionGraphics':
            return {
              summary: 'Planned motion graphic callout for key segment',
              decisions: [
                {
                  op: 'addGraphic',
                  kind: 'callout',
                  text: 'CREATOR HIGHLIGHT',
                  startTime: 4.0,
                  duration: 2.0,
                  motion: 'pop'
                }
              ]
            };

          case 'applyMotionGraphics':
            return j.stages.find(s => s.id === 'planMotionGraphics').output;

          case 'findBroll':
            return {
              summary: 'Selected authorized 3-second B-roll clip',
              assets: [brollAsset],
              decisions: [
                {
                  op: 'addClip',
                  assetId: brollAsset.id,
                  trackId: 'track-overlay',
                  startTime: 7.0,
                  duration: 3.0,
                  volume: 0,
                  audioRole: 'background'
                }
              ]
            };

          case 'applyBroll':
            return j.stages.find(s => s.id === 'findBroll').output;

          case 'applyZooms':
            return {
              summary: 'Applied smooth zoom on clip-main-footage from 11.0s to 13.0s',
              decisions: [
                {
                  op: 'addZoom',
                  clipId: 'clip-main-footage',
                  startTime: 11.0,
                  endTime: 13.0,
                  fromScale: 1.0,
                  toScale: 1.12,
                  returnToStart: true,
                  easing: 'smooth'
                }
              ]
            };

          case 'validateEdit':
            return pipeline.validateCompletedJob(p, j);

          default:
            throw new Error(`Unknown stage ${stage}`);
        }
      } finally {
        inFlight--;
      }
    }
  };

  const abortController = new AbortController();
  const completedJob = await pipeline.runEditingJob(runtime, job, abortController.signal);
  if (completedJob.status !== 'completed') {
    console.error('Job failed with errors:', completedJob.errors);
    console.error('Stages:', completedJob.stages.map(s => ({ id: s.id, status: s.status, error: s.error })));
  }

  // Assertions on completed AI Edit
  assert.equal(completedJob.status, 'completed', 'AI editing job must complete');
  assert.equal(maxConcurrent, 1, 'Only one stage must execute at a time');
  assert.equal(completedJob.failedStages.length, 0, 'No stages should fail');
  assert.equal(completedJob.appliedOperations.length, 4, '4 mutation stages applied');

  const editedProject = store.getSnapshot();

  // Verify captions were applied
  const captionClips = Object.values(editedProject.clips).filter(c => c.contentId && editedProject.captions[c.contentId]);
  assert.equal(captionClips.length, 4, 'Must have 4 caption clips');
  assert.equal(captionClips[0].startTime, 0.5);
  assert.ok(editedProject.captions[captionClips[0].contentId].text.includes('Welcome to Kreovar'));

  // Verify motion graphic was applied
  const graphicClips = Object.values(editedProject.clips).filter(c => c.graphic);
  assert.equal(graphicClips.length, 1, 'Must have 1 motion graphic clip');
  assert.equal(editedProject.textLayers[graphicClips[0].contentId].text, 'CREATOR HIGHLIGHT');
  assert.equal(graphicClips[0].graphic.kind, 'callout');
  assert.equal(graphicClips[0].startTime, 4.0);
  assert.ok(graphicClips[0].keyframes.length > 0, 'Motion graphic must have animated keyframes');

  // Verify B-roll was inserted on overlay track with volume 0 (dialogue preserved)
  const brollClips = Object.values(editedProject.clips).filter(c => c.assetId === brollAsset.id);
  assert.equal(brollClips.length, 1, 'Must have 1 B-roll clip');
  assert.equal(brollClips[0].trackId, 'track-overlay');
  assert.equal(brollClips[0].startTime, 7.0);
  assert.equal(brollClips[0].duration, 3.0);
  assert.equal(brollClips[0].volume, 0, 'B-roll audio must be muted to preserve speech dialogue');

  // Verify zoom was applied on original footage
  const mainClip = editedProject.clips['clip-main-footage'];
  assert.ok(mainClip.zooms && mainClip.zooms.length === 1, 'Must have 1 zoom on main footage');
  assert.equal(mainClip.zooms[0].fromScale, 1.0);
  assert.equal(mainClip.zooms[0].toScale, 1.12);
  assert.equal(mainClip.zooms[0].returnToStart, true);

  // 7. Verify Review-before-apply diff analysis
  const reviewResult = reviewEdit(project, editedProject);
  assert.equal(reviewResult.added, 6, 'Added 4 captions + 1 graphic + 1 B-roll');
  assert.equal(reviewResult.changed, 1, 'Main footage clip changed (zoom added)');
  assert.equal(reviewResult.removed, 0, 'No clips removed');
  assert.equal(reviewResult.warnings.length, 0, 'No warnings');

  // 8. Verify Compositor rendering on actual timeline timestamps
  const compositor = new Compositor({});
  compositor.setFrame('clip-main-footage', {}, 720, 1280);
  compositor.setFrame(brollClips[0].id, {}, 720, 1280);

  const drawCalls = [];
  const mockCtx = new Proxy({}, {
    get: (target, prop) => {
      if (prop === 'measureText') return (text) => ({ width: text.length * 12 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return (...args) => {
          drawCalls.push([prop, ...args]);
          return {
            addColorStop: (...stopArgs) => drawCalls.push(['addColorStop', ...stopArgs])
          };
        };
      }
      return (...args) => drawCalls.push([prop, ...args]);
    },
    set: (target, prop, val) => {
      drawCalls.push([prop, val]);
      return true;
    }
  });

  const canvas = { width: 720, height: 1280, getContext: () => mockCtx };

  // Render at t=2.0s (Segment 1 with Caption)
  drawCalls.length = 0;
  const boundsAt2s = compositor.render(canvas, editedProject, 2.0);
  assert.ok(boundsAt2s.length >= 2, 'Must render video and caption at t=2s');
  assert.ok(drawCalls.some(c => c[0] === 'fillText' && c[1] === 'Welcome'), 'Caption word Welcome rendered');
  assert.ok(drawCalls.some(c => c[0] === 'fillText' && c[1] === 'Kreovar'), 'Caption word Kreovar rendered');

  // Render at t=4.5s (Segment 1 outro with Motion Graphic Callout)
  drawCalls.length = 0;
  const boundsAt4s = compositor.render(canvas, editedProject, 4.5);
  assert.ok(boundsAt4s.some(b => b.id === graphicClips[0].id), 'Graphic clip rendered at t=4.5s');

  // Render at t=8.0s (Segment 2 with B-roll overlay)
  drawCalls.length = 0;
  const boundsAt8s = compositor.render(canvas, editedProject, 8.0);
  assert.ok(boundsAt8s.some(b => b.id === brollClips[0].id), 'B-roll rendered at t=8.0s');

  // Render at t=12.0s (Segment 3 with Zoom 1.12x active)
  drawCalls.length = 0;
  const boundsAt12s = compositor.render(canvas, editedProject, 12.0);
  assert.ok(boundsAt12s.some(b => b.id === 'clip-main-footage'), 'Main footage rendered at t=12s');

  compositor.dispose();

  // 9. Verify Atomic Undo / Redo
  assert.equal(store.canUndo, true, 'Store must support undo');
  // Undo the 4 mutation steps
  store.undo(); // undo zooms
  store.undo(); // undo B-roll
  store.undo(); // undo motion graphics
  store.undo(); // undo captions
  const undoneProject = store.getSnapshot();
  assert.equal(Object.keys(undoneProject.captions).length, 0, 'Captions reverted on Undo');
  assert.equal(undoneProject.clips['clip-main-footage'].zooms, undefined, 'Zooms reverted on Undo');
  assert.equal(Object.values(undoneProject.clips).filter(c => c.assetId === brollAsset.id).length, 0, 'B-roll reverted');

  // Redo all
  store.redo();
  store.redo();
  store.redo();
  store.redo();
  const redoneProject = store.getSnapshot();
  assert.equal(Object.keys(redoneProject.captions).length, 4, 'Captions restored on Redo');
  assert.equal(redoneProject.clips['clip-main-footage'].zooms.length, 1, 'Zooms restored on Redo');
});
