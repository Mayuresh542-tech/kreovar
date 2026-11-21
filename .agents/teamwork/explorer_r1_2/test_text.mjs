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
      // replace the text track deletion logic with our updated logic
      raw = raw.replace(
        /const isTextTrack = c\.trackId && project\.tracks\[c\.trackId\]\?\.kind === 'text';[\s\S]*?if \(!isStandardLowerThird\) \{[\s\S]*?delete project\.textLayers\[c\.contentId\];[\s\S]*?timestamp: Date\.now\(\)\s*\}\);?\s*\}\s*\}/,
        `const isTextTrack = c.trackId && project.tracks[c.trackId]?.kind === 'text';
   if (isTextTrack && c.contentId && project.textLayers[c.contentId] && !project.captions[c.contentId]) {
    const isStandardLowerThird = (c.graphic && GRAPHIC_KINDS.includes(c.graphic.kind)) || (c as any).placementId === 'lower-third';
    const isAiAddText = job.stages.some(s => s.output?.decisions?.some(d => d.op === 'addText'));
    const isTextOnlyProject = !Object.values(project.clips).some(clip => clip.assetId && project.assets[clip.assetId]?.kind === 'video');
    const isExplicitHallucination = Boolean((c as any).invalidHallucination || (c as any).isHallucination || (project.textLayers[c.contentId] as any)?.invalidHallucination || /hallucinat/i.test(project.textLayers[c.contentId]?.text || ''));

    const shouldRemove = isExplicitHallucination && !isStandardLowerThird && !isAiAddText && !isTextOnlyProject;
    if (shouldRemove) {
     delete project.clips[c.id];
     if (project.tracks[c.trackId]) {
      project.tracks[c.trackId].clipIds = project.tracks[c.trackId].clipIds.filter(id => id !== c.id);
     }
     delete project.textLayers[c.contentId];
     if (!job.degradationNotices) job.degradationNotices = [];
     job.degradationNotices.push({
      stage: 'applyCaptions',
      status: 'skipped',
      reason: 'Blocked arbitrary floating text on text track; only standard lower-third presets and transcript captions are permitted.',
      suggestedAction: 'Spoken dialogue captions are displayed with engaging typography.',
      timestamp: Date.now()
     });
    }
   }`
      );
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
  console.log('Testing test 16 (noVideo)...');
  const f16 = await clientFixture({ noVideo: true });
  console.log('Test 16 job status:', f16.job.status, 'errors:', f16.job.errors);
  console.log('Test 16 textLayers:', Object.values(f16.store.getSnapshot().textLayers));
  const hasHello = Object.values(f16.store.getSnapshot().textLayers).some(t => t.text === 'Hello');
  console.log('Test 16 assertion (has Hello):', hasHello);
}

testAll().catch(console.error);
