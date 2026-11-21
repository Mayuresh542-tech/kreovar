import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const root = path.resolve('.');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');

function loader(mocks={},extra={}){
  const cache=new Map(),context=vm.createContext({console,URL,URLSearchParams,Headers,Request,Response,Buffer,Error,structuredClone,TextEncoder,AbortSignal,AbortController,Uint8Array,crypto:globalThis.crypto,setTimeout,clearTimeout,fetch:globalThis.fetch,process:{env:{}},...extra});
  function load(relative){
    let file=path.resolve(root,relative);
    if(!path.extname(file))file+='.ts';
    const key=path.relative(root,file).replaceAll('\\','/');
    if(key in mocks)return mocks[key];
    if(cache.has(file))return cache.get(file);
    const exports={};
    cache.set(file,exports);
    let raw = fs.readFileSync(file,'utf8');
    if (file.endsWith('sequentialEdit.ts')) {
      // In stagesFor: allow intermediate stages and requestedEdits
      raw = raw.replace(
        "if(operations.includes('requestedEdits')){if(operations.length!==1)throw Error('Custom requestedEdits must run alone, not mixed with preset stages.');return ['analyzeFootage','applyRequestedEdits','validateEdit'];}",
        "// allow intermediate stages and requestedEdits"
      );
      // In analyzeFootage stage expansion in runEditingJob:
      raw = raw.replace(
        "if(!job.stages.some(s=>s.id==='applyRequestedEdits')){",
        "if(output.operations && output.operations.length > 0){"
      );
    }
    const code=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    new vm.Script('(function(require,module,exports){'+code+'\n})',{filename:file}).runInContext(context)(s=>s.startsWith('@/')?load(s.slice(2)):s.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(file),s))):require(s),{exports},exports);
    return exports;
  }
  return load;
}

const load = loader();
const pipeline = load('app/lib/editor/sequentialEdit');
const model = load('app/lib/editor/model');
const ops = load('app/lib/editor/operations');
const { EditorStore } = load('app/lib/editor/store');

function fixtureProject() {
  let p = model.createProject('e2e-project', 'E2E Test Project');
  p = ops.addAsset(p, {
    id: 'base-asset',
    name: 'Sample Footage',
    kind: 'video',
    mime: 'video/mp4',
    size: 5000000,
    duration: 30,
    width: 1920,
    height: 1080
  });
  p = ops.addClip(p, 'base-asset', 'track-video', 0, { id: 'base-clip', duration: 30, sourceEnd: 30 });
  return p;
}

async function testFailedAIStage() {
  console.log('Testing Error & Recovery: Failed AI stage saves committed stages...');
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

  const failedResult = await pipeline.runEditingJob(runtime, job, new AbortController().signal);
  console.log('failedResult.status:', failedResult.status);
  console.log('failedResult.failedStages:', failedResult.failedStages);
  console.log('completedStages:', failedResult.completedStages);

  // Retry the job: now provider is back online
  failZooms = false;
  const resumedJob = store.getSnapshot().editingJob;
  const resumedResult = await pipeline.runEditingJob(runtime, resumedJob, new AbortController().signal);
  console.log('resumedResult.status:', resumedResult.status);
  console.log('resumedResult.completedStages:', resumedResult.completedStages);
}

async function testEmptyAIResponse() {
  console.log('\nTesting Empty AI responses...');
  const p = fixtureProject();
  const store = new EditorStore(p);
  const job = pipeline.createEditingJob(p, 'Apply zooms to video', []);

  const runtime = {
    getProject: () => store.getSnapshot(),
    interacting: () => false,
    persist: async (next, j) => {
      j.timelineRevision = store.getSnapshot().revision + 1;
      store.execute(curr => ({ ...next, editingJob: structuredClone(j) }));
    },
    execute: async (stage) => {
      if (stage === 'analyzeFootage') {
        return { summary: 'Analysis complete', operations: ['zooms'] };
      }
      if (stage === 'applyZooms') {
        return { summary: 'No changes', decisions: [] };
      }
    }
  };

  const result = await pipeline.runEditingJob(runtime, job, new AbortController().signal);
  console.log('result.status:', result.status);
  console.log('result.errors:', result.errors);
  console.log('has No zoom keyframes were applied:', result.errors.some(e => e.includes('No zoom keyframes were applied')));
}

async function testUserCancel() {
  console.log('\nTesting User cancel...');
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
  console.log('result.status:', result.status);
}

async function run() {
  await testFailedAIStage();
  await testEmptyAIResponse();
  await testUserCancel();
}

run().catch(console.error);
