import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');

function loader(mocks = {}) {
  const cache = new Map();
  function load(filename) {
    if (!path.isAbsolute(filename)) filename = path.resolve(root, filename);
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

function source() {
  let p = model.createProject('preset-resilience-test');
  p = ops.addAsset(p, {
    id: 'source',
    kind: 'video',
    name: 'Original.mp4',
    duration: 12,
    width: 720,
    height: 1280,
    mime: 'video/mp4',
    size: 100,
    url: '/test/original.mp4'
  });
  return ops.addClip(p, 'source', 'track-video', 0, { id: 'footage', duration: 12, sourceEnd: 12 });
}

function makeRuntime(project, handler) {
  let p = project;
  const saved = [];
  return {
    getProject: () => p,
    interacting: () => false,
    persist: async (next, job) => {
      job.timelineRevision = p.revision + 1;
      p = { ...next, revision: job.timelineRevision, editingJob: structuredClone(job) };
      saved.push(structuredClone(p));
    },
    execute: async (...args) => handler(...args),
    saved
  };
}

const signal = () => new AbortController().signal;
const captionOutput = {
  summary: 'Timed speech',
  decisions: [
    {
      op: 'addCaption',
      text: 'Real spoken words',
      startTime: 1,
      duration: 2,
      templateId: 'signature-poppins',
      words: [
        { word: 'Real', start: 0, end: 0.7 },
        { word: 'spoken', start: 0.7, end: 1.2 },
        { word: 'words', start: 1.2, end: 2 }
      ]
    }
  ]
};

describe('Preset Failure Resilience & Non-Stopping Pipeline Progression', () => {
  test('Preset with failing B-roll continues to zooms and completes edit without cancelling', async () => {
    const p = source();
    const seen = [];
    const mrbeastPreset = pipeline.PIPELINE_PRESETS.find(pr => pr.id === 'mrbeast');
    assert.ok(mrbeastPreset, 'mrbeast preset must exist');

    const job = pipeline.createEditingJob(p, mrbeastPreset.instruction, [], mrbeastPreset);
    assert.equal(job.presetId, 'mrbeast');

    const r = makeRuntime(p, async (stage, project, j) => {
      seen.push(stage);
      switch (stage) {
        case 'analyzeFootage':
          return { summary: '12 second footage', operations: mrbeastPreset.operations };
        case 'applyCaptions':
          return captionOutput;
        case 'planMotionGraphics':
          return {
            summary: 'Stat callout',
            decisions: [{ op: 'addGraphic', kind: 'stat', text: '100K', startTime: 3, duration: 1, motion: 'pop' }]
          };
        case 'applyMotionGraphics':
          return j.stages.find(s => s.id === 'planMotionGraphics').output;
        case 'findBroll':
          // Simulate B-roll tool failure / search failure
          throw new Error('AI did not select new relevant footage.');
        case 'applyBroll':
          // Should receive skipped findBroll output
          return { summary: 'B-roll skipped', decisions: [], skipRationale: 'No B-roll available' };
        case 'applyZooms':
          return {
            summary: 'Subtle zoom',
            decisions: [{ op: 'addZoom', clipId: 'footage', startTime: 1, endTime: 2, fromScale: 1, toScale: 1.1, returnToStart: true, easing: 'smooth' }]
          };
        case 'validateEdit':
          return pipeline.validateCompletedJob(project, j);
        default:
          throw new Error(`Unexpected stage: ${stage}`);
      }
    });

    const result = await pipeline.runEditingJob(r, job, signal());

    assert.equal(result.status, 'completed', 'Job must complete successfully despite B-roll failure');
    assert.ok(seen.includes('applyZooms'), 'Pipeline must have moved to applyZooms after B-roll failure');
    assert.ok(seen.includes('validateEdit'), 'Pipeline must have reached validateEdit');
    assert.equal(result.failedStages.length, 0, 'No stages should be in failedStages list');
    assert.ok(result.completedStages.includes('findBroll'), 'findBroll must be recorded as completed with skip');
    assert.ok(result.completedStages.includes('applyZooms'), 'applyZooms must be completed');
    // Captions, graphics and zooms must be applied to the project!
    assert.equal(Object.keys(r.getProject().captions).length, 1);
    assert.equal(r.getProject().clips.footage.zooms.length, 1);
  });

  test('Preset with failing sound effects continues to completion without stopping edit', async () => {
    const p = source();
    const seen = [];
    const hormoziPreset = pipeline.PIPELINE_PRESETS.find(pr => pr.id === 'hormozi');
    assert.ok(hormoziPreset, 'hormozi preset must exist');

    const job = pipeline.createEditingJob(p, hormoziPreset.instruction, [], hormoziPreset);

    const r = makeRuntime(p, async (stage, project, j) => {
      seen.push(stage);
      switch (stage) {
        case 'analyzeFootage':
          return { summary: '12 second footage', operations: hormoziPreset.operations };
        case 'applyCaptions':
          return captionOutput;
        case 'planMotionGraphics':
          return {
            summary: 'Punchy callout',
            decisions: [{ op: 'addGraphic', kind: 'callout', text: 'FOCUS', startTime: 3, duration: 1, motion: 'pop' }]
          };
        case 'applyMotionGraphics':
          return j.stages.find(s => s.id === 'planMotionGraphics').output;
        case 'applyZooms':
          return {
            summary: 'Emphasis punch zoom',
            decisions: [{ op: 'addZoom', clipId: 'footage', startTime: 2, endTime: 3, fromScale: 1, toScale: 1.15, returnToStart: true, easing: 'smooth' }]
          };
        case 'applySoundEffects':
          // Simulate sound effect API failure or stock SFX missing
          throw new Error('Sound effect was not saved. Please retry.');
        case 'validateEdit':
          return pipeline.validateCompletedJob(project, j);
        default:
          throw new Error(`Unexpected stage: ${stage}`);
      }
    });

    const result = await pipeline.runEditingJob(r, job, signal());

    assert.equal(result.status, 'completed', 'Job must complete successfully despite SFX failure');
    assert.ok(seen.includes('applySoundEffects'), 'Pipeline must have attempted applySoundEffects');
    assert.ok(seen.includes('validateEdit'), 'Pipeline must have proceeded to validateEdit');
    assert.equal(result.failedStages.length, 0);
    assert.ok(result.completedStages.includes('applySoundEffects'));
  });

  test('Preset with both B-roll and SFX failures completes with captions and zooms', async () => {
    const p = source();
    const dualPreset = {
      id: 'custom-preset-combo',
      name: 'Combo Preset',
      instruction: 'Add captions, B-roll, zooms and sound effects.',
      operations: ['captions', 'broll', 'zooms', 'soundEffects'],
      captionTemplate: 'signature-poppins'
    };
    const job = pipeline.createEditingJob(p, dualPreset.instruction, [], dualPreset);

    const r = makeRuntime(p, async (stage, project, j) => {
      switch (stage) {
        case 'analyzeFootage':
          return { summary: '12 second footage', operations: ['captions', 'broll', 'zooms', 'soundEffects'] };
        case 'applyCaptions':
          return captionOutput;
        case 'findBroll':
          throw new Error('Pexels rate limit 429');
        case 'applyBroll':
          return { summary: 'B-roll skipped', decisions: [], skipRationale: 'No B-roll available' };
        case 'applyZooms':
          return {
            summary: 'Zoom',
            decisions: [{ op: 'addZoom', clipId: 'footage', startTime: 4, endTime: 5, fromScale: 1, toScale: 1.12, returnToStart: true, easing: 'smooth' }]
          };
        case 'applySoundEffects':
          throw new Error('SFX catalog unavailable');
        case 'validateEdit':
          return pipeline.validateCompletedJob(project, j);
        default:
          throw new Error(`Unexpected stage: ${stage}`);
      }
    });

    const result = await pipeline.runEditingJob(r, job, signal());

    assert.equal(result.status, 'completed');
    assert.ok(result.completedStages.includes('findBroll'));
    assert.ok(result.completedStages.includes('applySoundEffects'));
    assert.ok(result.completedStages.includes('applyZooms'));
    assert.equal(Object.keys(r.getProject().captions).length, 1);
    assert.equal(r.getProject().clips.footage.zooms.length, 1);
  });

  test('Non-preset custom edit mandatory failure still halts as expected', async () => {
    const p = source();
    const job = pipeline.createEditingJob(p, 'Add zooms to this video', []); // No preset!
    assert.equal(job.presetId, undefined);

    const r = makeRuntime(p, async (stage, project, j) => {
      switch (stage) {
        case 'analyzeFootage':
          return { summary: 'Analyze', operations: ['zooms'] };
        case 'applyZooms':
          throw new Error('Model provider unavailable');
        case 'validateEdit':
          return pipeline.validateCompletedJob(project, j);
        default:
          throw new Error(`Unexpected stage: ${stage}`);
      }
    });

    const result = await pipeline.runEditingJob(r, job, signal());

    assert.equal(result.status, 'failed', 'Non-preset mandatory failures must halt the edit');
    assert.deepEqual(result.failedStages, ['applyZooms']);
  });
});
