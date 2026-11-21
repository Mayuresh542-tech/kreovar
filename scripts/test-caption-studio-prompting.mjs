import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');

function loader(mocks = {}) {
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
    }).outputText;
    const localRequire = specifier =>
      Object.hasOwn(mocks, specifier)
        ? mocks[specifier]
        : specifier.startsWith('@/')
        ? load(specifier.slice(2))
        : specifier.startsWith('.')
        ? load(path.relative(root, path.resolve(path.dirname(filename), specifier)))
        : require(specifier);
    vm.runInNewContext(source, {
      exports: loadedModule.exports,
      module: loadedModule,
      require: localRequire,
      console,
      process,
      URL,
      Buffer,
      Math,
      crypto: globalThis.crypto,
      setTimeout,
      clearTimeout
    });
    return loadedModule.exports;
  }
  return load;
}

const load = loader();
const { extractEditingConstraints, matchCaptionPreset } = load('app/lib/editor/editingIntent');
const { explicitOperations, createEditingJob } = load('app/lib/editor/sequentialEdit');
const { extractConversationalIntent, buildProgressiveSteps } = load('app/lib/editor/conversationalIntent');
const { STRICT_CAPTION_CONSTRAINT_PROMPT } = load('app/lib/editor/prompts');
const { reconcileEditingDecisions } = load('app/lib/editor/inPlaceReconciler');
const model = load('app/lib/editor/model');
const ops = load('app/lib/editor/operations');

test('prompts strictly mandate Caption Studio templates whenever captions or subtitles are requested', () => {
  assert.ok(STRICT_CAPTION_CONSTRAINT_PROMPT.includes('CAPTION STUDIO'));
  assert.ok(STRICT_CAPTION_CONSTRAINT_PROMPT.includes('ad captions'));
  assert.ok(STRICT_CAPTION_CONSTRAINT_PROMPT.includes('add subtitles'));
  assert.ok(STRICT_CAPTION_CONSTRAINT_PROMPT.includes('better styles'));
  assert.ok(STRICT_CAPTION_CONSTRAINT_PROMPT.includes('study-hormozi-style'));
});

test('extractEditingConstraints identifies "ad captions" and "add subtitles" as Caption Studio requests', () => {
  const c1 = extractEditingConstraints('ad captions');
  assert.equal(c1.requestedCaptionStudio, true);
  assert.equal(c1.requestedCaptionPreset, 'study-hormozi-style');

  const c2 = extractEditingConstraints('add subtitles');
  assert.equal(c2.requestedCaptionStudio, true);
  assert.equal(c2.requestedCaptionPreset, 'study-hormozi-style');

  const c3 = extractEditingConstraints('use caption studio with better styles');
  assert.equal(c3.requestedCaptionStudio, true);
  assert.equal(c3.requestedCaptionPreset, 'study-hormozi-style');

  const c4 = extractEditingConstraints('ad captions ali abdaal style');
  assert.equal(c4.requestedCaptionStudio, true);
  assert.equal(c4.requestedCaptionPreset, 'study-ali-abdaal');
});

test('explicitOperations correctly parses "ad captions", "add subtitles", and "subtitles"', () => {
  assert.deepEqual(Array.from(explicitOperations('ad captions') || []), ['captions']);
  assert.deepEqual(Array.from(explicitOperations('add subtitles') || []), ['captions']);
  assert.deepEqual(Array.from(explicitOperations('subtitles') || []), ['captions']);
});

test('createEditingJob defaults captionTemplate to Caption Studio template on caption/subtitle queries', () => {
  const p = model.createProject('test');
  const job1 = createEditingJob(p, 'ad captions', []);
  assert.equal(job1.captionTemplate, 'study-hormozi-style');

  const job2 = createEditingJob(p, 'add subtitles with mr beast energy', []);
  assert.equal(job2.captionTemplate, 'study-mr-beast-style-2');
});

test('conversational intent and progressive steps display Caption Studio branding', () => {
  const intent = extractConversationalIntent('ad captions');
  assert.ok(intent.operations.includes('captions'));

  const steps = buildProgressiveSteps('ad captions', undefined, true, false);
  const captionStep = steps.find(s => s.id === 'captions');
  assert.ok(captionStep, 'Must include captions step');
  assert.ok(captionStep.label.includes('Caption Studio'));

  const restyleSteps = buildProgressiveSteps('ad captions', undefined, true, true);
  const restyleStep = restyleSteps.find(s => s.id === 'captions');
  assert.ok(restyleStep.label.includes('Caption Studio'));
});

test('reconcileEditingDecisions upgrades plain captions to Caption Studio templates in-place', () => {
  let p = model.createProject('test');
  p = ops.addAsset(p, { id: 'v1', kind: 'video', name: 'video.mp4', duration: 10, width: 1080, height: 1920, fps: 30 });
  p = ops.addClip(p, 'v1', 'track-video', 0, { id: 'clip-v1', duration: 10, sourceEnd: 10 });
  p = ops.addCaption(p, 'First sentence', 0, 3);
  p = ops.addCaption(p, 'Second sentence', 3, 3);

  const rawDecisions = [
    { op: 'addCaption', text: 'First sentence', startTime: 0, duration: 3 }
  ];
  const constraints = extractEditingConstraints('ad captions');

  const result = reconcileEditingDecisions(p, rawDecisions, [], constraints);
  const applyDec = result.decisions.find(d => d.op === 'applyCaptionTemplate');
  assert.ok(applyDec, 'Must emit applyCaptionTemplate');
  assert.equal(applyDec.templateId, 'study-hormozi-style');
});
