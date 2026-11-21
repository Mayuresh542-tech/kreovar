import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const root = path.resolve('.');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');

function loader(){
  const cache=new Map(),context=vm.createContext({console,URL,URLSearchParams,Headers,Request,Response,Buffer,Error,structuredClone,TextEncoder,AbortSignal,AbortController,Uint8Array,crypto:globalThis.crypto,setTimeout,clearTimeout,fetch:globalThis.fetch,process:{env:{}}});
  function load(relative){
    let file=path.resolve(root,relative);
    if(!path.extname(file))file+='.ts';
    if(cache.has(file))return cache.get(file);
    const exports={};
    cache.set(file,exports);
    let raw = fs.readFileSync(file,'utf8');
    if (file.endsWith('inPlaceReconciler.ts')) {
      raw = raw.replace(
        "return {\n    decisions: reconciledDecisions,\n    toolRequests: reconciledTools,\n    summaryNotes\n  };",
        `const nonRippleCuts = reconciledDecisions.filter(d => d.op !== 'rippleCut');
  const rippleCuts = reconciledDecisions.filter(d => d.op === 'rippleCut');
  rippleCuts.forEach(rc => {
    if (Array.isArray(rc.ranges)) {
      rc.ranges.sort((a, b) => a.start - b.start);
    }
  });
  rippleCuts.sort((a, b) => {
    const aStart = a.ranges?.[0]?.start ?? 0;
    const bStart = b.ranges?.[0]?.start ?? 0;
    return aStart - bStart;
  });
  reconciledDecisions = [...nonRippleCuts, ...rippleCuts];
  return {
    decisions: reconciledDecisions,
    toolRequests: reconciledTools,
    summaryNotes
  };`
      );
    }
    const code=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    new vm.Script('(function(require,module,exports){'+code+'\n})',{filename:file}).runInContext(context)(s=>s.startsWith('@/')?load(s.slice(2)):s.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(file),s))):require(s),{exports},exports);
    return exports;
  }
  return load;
}

const load = loader();
const model = load('app/lib/editor/model');
const ops = load('app/lib/editor/operations');
const { reconcileEditingDecisions } = load('app/lib/editor/inPlaceReconciler');

function runTest() {
  let p = model.createProject('test-p');
  p = ops.addAsset(p, { id: 'v1', kind: 'video', name: 'video.mp4', duration: 15, width: 1080, height: 1920, mime: 'video/mp4', size: 1000 });
  p = ops.addClip(p, 'v1', 'track-video', 0, { id: 'clip-v1', duration: 15, sourceEnd: 15 });
  p = ops.addCaption(p, 'Hello world', 0, 3);

  const rawDecisions = [
    { op: 'rippleCut', ranges: [{ start: 10, end: 11 }] },
    { op: 'addCaption', text: 'New caption', startTime: 4, duration: 2, templateId: 'study-clean-motion' },
    { op: 'addClip', assetId: 'broll-1', trackId: 'track-overlay', startTime: 2, duration: 2, volume: 0 },
    { op: 'rippleCut', ranges: [{ start: 6, end: 7 }] }
  ];

  const speech = [
    { text: 'Hello world key moment', start: 0, end: 3, words: [{ word: 'Hello', start: 0, end: 0.5 }, { word: 'world', start: 0.6, end: 1.0 }, { word: 'key', start: 1.2, end: 1.6 }, { word: 'moment', start: 1.7, end: 2.5 }] }
  ];

  const constraints = {
    phraseQuotes: ['key moment'],
    requestedSilenceCut: false
  };

  const result = reconcileEditingDecisions(p, rawDecisions, [], constraints, speech);
  console.log('Decisions ops in order:', result.decisions.map(d => d.op));

  // Verify rippleCut is at the very end
  const lastOp = result.decisions.at(-1)?.op;
  assert.equal(lastOp, 'rippleCut', 'Last decision must be rippleCut');

  // All rippleCuts should be at the end
  const firstRippleCutIndex = result.decisions.findIndex(d => d.op === 'rippleCut');
  const allSubsequentAreRippleCut = result.decisions.slice(firstRippleCutIndex).every(d => d.op === 'rippleCut');
  assert.ok(allSubsequentAreRippleCut, 'All rippleCut decisions must be grouped at the end');

  // Verify sorted by range start
  const cuts = result.decisions.filter(d => d.op === 'rippleCut');
  console.log('Cuts ranges:', cuts.map(c => c.ranges));
  assert.equal(cuts[0].ranges[0].start, 6);
  assert.equal(cuts[1].ranges[0].start, 10);

  // Verify addZoom (from phraseQuotes) appears before rippleCut
  const zoomIndex = result.decisions.findIndex(d => d.op === 'addZoom');
  assert.ok(zoomIndex !== -1, 'Must have addZoom from phraseQuotes');
  assert.ok(zoomIndex < firstRippleCutIndex, 'addZoom must appear before rippleCut');
  console.log('Reconciler invariant test passed!');
}

runTest();
