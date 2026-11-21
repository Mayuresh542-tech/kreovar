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
      // let's log the caught error in line 412
      raw = raw.replace('catch(error){', 'catch(error){ console.log("REAL ERROR CAUGHT:", error, "instanceof Error:", error instanceof Error, "constructor:", error?.constructor?.name, "message:", error?.message);');
    }
    const code=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    new vm.Script('(function(require,module,exports){'+code+'\n})',{filename:file}).runInContext(context)(s=>s.startsWith('@/')?load(s.slice(2)):s.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(file),s))):require(s),{exports},exports);
    return exports;
  }
  return load;
}

function source(load){
  const m=load('app/lib/editor/model'),o=load('app/lib/editor/operations');
  let p=m.createProject('chat-tool-test');
  p=o.addAsset(p,{id:'source',libraryId:'source-library',kind:'video',name:'Original',duration:12,width:640,height:360,mime:'video/mp4',size:1});
  return o.addClip(p,'source','track-video',0,{id:'main',duration:12,sourceEnd:12});
}

async function clientFixture({failLink=false,noVideo=false,trackOnly=false,mediaType,audioOnly=false}={}){
  let prepares=0,links=0,observed;
  const requests=[];
  const base=loader();
  const captionStudio = base('app/lib/editor/editorCaptionStudio.ts');
  const voiceId=base('app/lib/server/tts/voices').CURATED_VOICES[0].id;
  const p=noVideo?base('app/lib/editor/model').createProject('text-only'):source(base);
  if(audioOnly){
    p.assets.source.kind='audio';
    p.assets.source.mime='audio/wav';
    p.clips.main.trackId='track-audio';
    p.tracks['track-video'].clipIds=[];
    p.tracks['track-audio'].clipIds=['main'];
  }
  let linkFail=failLink;
  const load=loader({
    'app/lib/supabase.ts':{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'TEST'}}})}}},
    'app/lib/editor/footageFramesClient.ts':{captureFootageEvidence:async()=>({footageFrames:[],fallbackFootageFrames:[]})},
    'app/lib/assets/client.ts':{linkAsset:async()=>{links++;if(linkFail){linkFail=false;throw Error('Temporary link failure');}}},
    'app/lib/editor/recovery.ts':{saveCheckpoint:async()=>{}},
    'app/lib/editor/editorCaptionStudio.ts':{...captionStudio,loadEditorStudioFonts:async()=>{}},
    'app/lib/editor/compositor.ts':{Compositor:class{sync(){return true;}render(){}dispose(){}}},
    'app/lib/editor/aiToolClient.ts':{prepareAiTool:async(request,project)=>{
      prepares++;
      observed={start:project.clips.main.startTime,source:project.clips.main.sourceStart};
      return {asset:{id:'caption-asset'},role:'captions',decisions:[{op:'addCaption',text:'Hello test',startTime:project.clips.main.startTime,duration:1}]};
    }}
  },{
    document:{fonts:{ready:Promise.resolve()},createElement:()=>({})},
    navigator:{},
    fetch:async(url,init)=>{
      if(String(url).startsWith('/api/editor/ai-budget'))return Response.json({usedTokens:10,reservedTokens:0,limit:300000});
      const body=JSON.parse(init.body);
      requests.push(body.pipelineStage);
      return Response.json({
        summary:'Provider-selected edit',
        list:{
          projectId:body.project.id,
          baseRevision:body.project.revision,
          decisions:body.pipelineStage==='analyzeFootage'?[]:mediaType||audioOnly?[]:trackOnly?[{op:'changeTrack',trackId:'track-audio',muted:true}]:noVideo?[{op:'addText',text:'Hello',startTime:0}]:[{op:'trimClip',clipId:'main',edge:'left',time:2},{op:'rippleCut',ranges:[{start:0,end:1}]}]
        },
        requiredOperations:['requestedEdits'],
        toolRequests:body.pipelineStage==='applyRequestedEdits'&&!noVideo&&!trackOnly?[{type:'captions',clipId:'main'}]:[],
        catalog:[]
      });
    }
  });

  const store=new (load('app/lib/editor/store').EditorStore)(p);
  const pipeline=load('app/lib/editor/sequentialEdit');
  const client=load('app/lib/editor/sequentialEditClient');
  let job=pipeline.createEditingJob(p,audioOnly?'Add captions':noVideo?'Add text Hello at zero':'Trim then cut and transcribe',[]);
  job=await client.runSequentialEdit(store,{resolve:async()=>'/fixture'},'test',job,new AbortController().signal,'TEST');
  return {job,store,requests,observed,prepares:()=>prepares,links:()=>links,retry:()=>client.runSequentialEdit(store,{resolve:async()=>'/fixture'},'test',store.getSnapshot().editingJob,new AbortController().signal,'TEST')};
}

async function testAll() {
  console.log('Testing test 14...');
  const f14 = await clientFixture();
  console.log('Test 14 job status:', f14.job.status, 'errors:', f14.job.errors);
  console.log('Test 14 requests:', f14.requests);
  console.log('Test 14 observed:', f14.observed);

  console.log('\nTesting test 16 (noVideo)...');
  const f16 = await clientFixture({ noVideo: true });
  console.log('Test 16 job status:', f16.job.status, 'errors:', f16.job.errors);
  console.log('Test 16 textLayers:', Object.values(f16.store.getSnapshot().textLayers));

  console.log('\nTesting test 25 (audioOnly)...');
  const f25 = await clientFixture({ audioOnly: true });
  console.log('Test 25 job status:', f25.job.status, 'errors:', f25.job.errors);
  console.log('Test 25 captions:', Object.values(f25.store.getSnapshot().captions).map(c => c.text));
}

testAll().catch(console.error);
