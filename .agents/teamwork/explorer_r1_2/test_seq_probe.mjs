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

function source(){
  let p=model.createProject('test');
  p=ops.addAsset(p,{id:'footage',name:'Footage.mp4',kind:'video',duration:12,width:1080,height:1920,mime:'video/mp4',size:100});
  return ops.addClip(p,'footage','track-video',0,{id:'footage',duration:12,sourceEnd:12});
}
function runtime(project,execute){
  let p=project;
  const saved=[];
  return {
    getProject:()=>p,
    interacting:()=>false,
    saved,
    max:()=>1,
    persist:async(next,job)=>{
      job.timelineRevision=p.revision+1;
      p={...next,revision:job.timelineRevision,editingJob:structuredClone(job)};
      saved.push(p);
    },
    execute
  };
}
function signal(){return new AbortController().signal;}
const caption={summary:'Captions',decisions:[{op:'addCaption',text:'Hello',startTime:1,duration:2}]};

async function test47() {
  console.log('Testing test 47 (mandatory failure stops; resume after reload)...');
  let fail=true;
  const seen=[],p=source(),job=pipeline.createEditingJob(p,'captions and zooms',[]);
  const handler=async(stage,project,j)=>{
    seen.push(stage);
    if(stage==='analyzeFootage')return {summary:'Analyze',operations:['captions','zooms']};
    if(stage==='applyCaptions')return caption;
    if(stage==='applyZooms'){
      if(fail)throw Error('Provider unavailable');
      return {summary:'Zoom',decisions:[{op:'addZoom',clipId:'footage',startTime:5,endTime:6,fromScale:1,toScale:1.1}]};
    }
    return pipeline.validateCompletedJob(project,j);
  };
  const r=runtime(p,handler);
  let result=await pipeline.runEditingJob(r,job,signal());
  console.log('Test 47 result.status:', result.status);
  console.log('Test 47 result.failedStages:', result.failedStages);
  console.log('Test 47 seen:', seen);

  const recovered=JSON.parse(JSON.stringify(r.getProject()));
  const retry=runtime(recovered,handler);
  fail=false;
  result=await pipeline.runEditingJob(retry,recovered.editingJob,signal());
  console.log('Test 47 retry result.status:', result.status);
  console.log('Test 47 retry seen:', seen);
}

async function test57() {
  console.log('\nTesting test 57 (zero-operation stages cannot falsely report completion)...');
  const p=source();
  const r=runtime(p,async stage=>stage==='analyzeFootage'?{summary:'Analyze',operations:['zooms']}:{summary:'No changes',decisions:[]});
  const result=await pipeline.runEditingJob(r,pipeline.createEditingJob(p,'Add zooms',[]),signal());
  console.log('Test 57 status:', result.status);
  console.log('Test 57 errors:', result.errors);
  console.log('Test 57 errors at -1 includes No zoom:', result.errors.at(-1)?.includes('No zoom'));
}

async function run() {
  await test47();
  await test57();
}

run().catch(console.error);
