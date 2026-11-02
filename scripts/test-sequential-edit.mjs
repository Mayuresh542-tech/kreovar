import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json")), ts = require("typescript");
// Compile the real source in memory; mock only external auth/provider calls.
function loader(mocks = {}) {
 // Isolate existing provider/auth tests from the new allowance persistence boundary. Dedicated allowance tests exercise the real wrapper.
 mocks={"app/lib/server/planUsage.ts":{withUsage:h=>h,reserveUsage:async()=>({reservationId:'test-usage'}),finishUsage:async()=>{},PlanLimitError:class extends Error{},usageError:()=>new Response('{}',{status:503})},"app/lib/server/speechDuration.ts":{speechDuration:async()=>1},...mocks};if(mocks["app/lib/server/creditService.ts"])mocks["app/lib/server/usageCreditCompat.ts"]=mocks["app/lib/server/creditService.ts"];

  mocks = { "app/lib/supabase.ts": { supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }, ...mocks };
  const cache = new Map();
  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) filename += ".ts";
    const key = path.relative(root, filename).replaceAll("\\", "/");
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} }; cache.set(filename, loadedModule);
    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll("import.meta.url",JSON.stringify(pathToFileURL(filename).href));
    const localRequire = specifier => specifier.startsWith("@/") ? load(specifier.slice(2)) : specifier.startsWith(".") ? load(path.relative(root, path.resolve(path.dirname(filename), specifier))) : require(specifier);
    new vm.Script(`(function(require,module,exports){${source}\n})`, { filename }).runInThisContext()(localRequire, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return load;
}


const load=loader(),model=load('app/lib/editor/model.ts'),ops=load('app/lib/editor/operations.ts'),pipeline=load('app/lib/editor/sequentialEdit.ts');
function source(){let p=model.createProject('pipeline-test');p=ops.addAsset(p,{id:'source',kind:'video',name:'Original.mp4',duration:12,width:720,height:1280,mime:'video/mp4',size:100,url:'/test/original.mp4'});return ops.addClip(p,'source','track-video',0,{id:'footage',duration:12,sourceEnd:12});}
function runtime(project,handler){let p=project,inFlight=0,max=0;const saved=[];return {getProject:()=>p,interacting:()=>false,persist:async(next,job)=>{job.timelineRevision=p.revision+1;p={...next,revision:job.timelineRevision,editingJob:structuredClone(job)};saved.push(structuredClone(p));},execute:async(...args)=>{inFlight++;max=Math.max(max,inFlight);try{return await handler(...args);}finally{inFlight--; }},saved,max:()=>max};}
const signal=()=>new AbortController().signal;
const caption={summary:'Timed speech',decisions:[{op:'addCaption',text:'Real spoken words',startTime:1,duration:2,templateId:'signature-poppins',words:[{word:'Real',start:0,end:.7},{word:'spoken',start:.7,end:1.2},{word:'words',start:1.2,end:2}]}]};

test('pipeline executes one stage at a time and commits captions, graphics, B-roll and real zooms',async()=>{
 const p=source(),seen=[],job=pipeline.createEditingJob(p,'Add animated captions, motion graphics, relevant B-roll and subtle zoom effects.',[],pipeline.PIPELINE_PRESETS[0]);
 const broll={id:'licensed',libraryId:'licensed',kind:'video',name:'Licensed.mp4',duration:3,width:720,height:1280,mime:'video/mp4',size:30};
 const r=runtime(p,async(stage,project,j)=>{seen.push(stage);switch(stage){case 'analyzeFootage':return {summary:'12 second footage',operations:['captions','motionGraphics','broll','zooms']};case 'applyCaptions':return caption;case 'planMotionGraphics':assert.equal(Object.keys(project.captions).length,1);return {summary:'Callout',decisions:[{op:'addGraphic',kind:'callout',text:'Real emphasis',startTime:4,duration:1,motion:'pop'}]};case 'applyMotionGraphics':assert(!Object.values(project.clips).some(c=>c.graphic));return j.stages.find(s=>s.id==='planMotionGraphics').output;case 'findBroll':return {summary:'Selected licensed asset',assets:[broll],decisions:[{op:'addClip',assetId:'licensed',trackId:'track-overlay',startTime:6,duration:2,volume:0}]};case 'applyBroll':assert(!Object.values(project.clips).some(c=>c.assetId==='licensed'));return j.stages.find(s=>s.id==='findBroll').output;case 'applyZooms':return {summary:'Subtle zoom',decisions:[{op:'addZoom',clipId:'footage',startTime:1,endTime:2,fromScale:1,toScale:1.1,returnToStart:true,easing:'smooth'}]};case 'validateEdit':return pipeline.validateCompletedJob(project,j);default:throw Error(stage);}});
 const result=await pipeline.runEditingJob(r,job,signal());assert.equal(result.status,'completed');assert.equal(r.max(),1);assert.deepEqual(seen,pipeline.stagesFor(['captions','motionGraphics','broll','zooms']));assert.equal(Object.keys(r.getProject().captions).length,1);assert(Object.values(r.getProject().clips).some(c=>c.graphic));assert(Object.values(r.getProject().clips).some(c=>c.assetId==='licensed'));assert.equal(r.getProject().clips.footage.zooms.length,1);assert.equal(r.getProject().clips.footage.volume,p.clips.footage.volume);assert.equal(result.appliedOperations.length,4);assert(r.saved.some(p=>p.editingJob.completedStages.includes('applyCaptions')&&!p.editingJob.completedStages.includes('applyBroll')));
});

test('mandatory failure stops; resume after reload does not repeat committed captions or operation keys',async()=>{
 let fail=true;const seen=[],p=source(),job=pipeline.createEditingJob(p,'captions and zooms',[]);const handler=async(stage,project,j)=>{seen.push(stage);if(stage==='analyzeFootage')return {summary:'Analyze',operations:['captions','zooms']};if(stage==='applyCaptions')return caption;if(stage==='applyZooms'){if(fail)throw Error('Provider unavailable');return {summary:'Zoom',decisions:[{op:'addZoom',clipId:'footage',startTime:5,endTime:6,fromScale:1,toScale:1.1}]};}return pipeline.validateCompletedJob(project,j);};
 const r=runtime(p,handler);let result=await pipeline.runEditingJob(r,job,signal());assert.equal(result.status,'failed');assert.deepEqual(result.failedStages,['applyZooms']);assert(!seen.includes('validateEdit'));assert.equal(Object.keys(r.getProject().captions).length,1);
 const recovered=JSON.parse(JSON.stringify(r.getProject())),retry=runtime(recovered,handler);fail=false;result=await pipeline.runEditingJob(retry,recovered.editingJob,signal());assert.equal(result.status,'completed');assert.equal(seen.filter(s=>s==='applyCaptions').length,1);assert.equal(Object.keys(retry.getProject().captions).length,1);assert.equal(new Set(result.appliedOperations).size,result.appliedOperations.length);
});

test('cancelled stage never inserts its partial draft; resume continues saved steps',async()=>{
 const controller=new AbortController(),p=source(),r=runtime(p,async stage=>{if(stage==='analyzeFootage')return {summary:'Analyze',operations:['captions']};controller.abort();return caption;});const result=await pipeline.runEditingJob(r,pipeline.createEditingJob(p,'Add captions',[]),controller.signal);assert.equal(result.status,'cancelled');assert.equal(Object.keys(r.getProject().captions).length,0);assert(result.completedStages.includes('analyzeFootage'));
});

test('zero-operation stages cannot falsely report completion',async()=>{const p=source(),r=runtime(p,async stage=>stage==='analyzeFootage'?{summary:'Analyze',operations:['zooms']}:{summary:'No changes',decisions:[]});const result=await pipeline.runEditingJob(r,pipeline.createEditingJob(p,'Add zooms',[]),signal());assert.equal(result.status,'failed');assert(result.errors.at(-1).includes('No zoom'));assert.equal(result.appliedOperations.length,0);});

test('stage boundary rejects unrelated operations, excessive zooms, invented assets and unsafe audio gain',()=>{
 const p=source();assert.throws(()=>pipeline.assertStagePlan('planMotionGraphics',[{op:'addZoom'}],[],p),/outside/);assert.throws(()=>pipeline.assertStagePlan('analyzeFootage',[],[{type:'captions'}],p),/outside/);assert.throws(()=>pipeline.assertStagePlan('applyZooms',[{op:'addZoom',toScale:1.5,fromScale:1,startTime:1,endTime:2}],[],p),/restrained/);assert.throws(()=>pipeline.assertStagePlan('findBroll',[{op:'addClip',assetId:'invented',trackId:'track-overlay',volume:0}],[],p),/real muted/);
});

test('hidden graphics and B-roll beyond the footage fail before commit',()=>{
 const p=source(),graphic={summary:'Hidden',decisions:[{op:'addGraphic',kind:'callout',text:'Visible?',startTime:13,duration:1}]};const next=pipeline.buildStageProject(p,graphic);assert.throws(()=>pipeline.validateStageChanges('applyMotionGraphics',p,next,graphic),/visible|hidden|outside/);
});

test('presets execute only their configured operations through the same pipeline',()=>{assert.deepEqual(pipeline.stagesFor(pipeline.PIPELINE_PRESETS.find(p=>p.id==='clean').operations),['analyzeFootage','applyCaptions','validateEdit']);assert(pipeline.stagesFor(pipeline.PIPELINE_PRESETS.find(p=>p.id==='punchy').operations).includes('applySoundEffects'));});

test('completed evidence detects deleted or hidden edits instead of reporting success',()=>{const p=source(),next=pipeline.buildStageProject(p,caption),output=pipeline.validateStageChanges('applyCaptions',p,next,caption),job=pipeline.createEditingJob(p,'captions',[]);job.stages=[{id:'applyCaptions',status:'completed',key:'caption',attempts:1,output}];job.appliedOperations=['caption'];next.revision=2;const clip=Object.values(next.clips).find(c=>c.contentId);const deleted=ops.removeClip(next,clip.id);assert.throws(()=>pipeline.validateCompletedJob(deleted,job),/no longer visible/);});

test('manual inspector is preserved and mode changes share a single store',()=>{const source=fs.readFileSync(path.join(root,'app/components/editor/workspace/Workspace.tsx'),'utf8');assert(source.includes('!aiMode&&<Inspector/>'));assert(source.includes('<AiEditingChat'));assert.equal((source.match(/new EditorStore\(/g)||[]).length,1);assert(!source.includes('<AiEditDialog'));assert(fs.existsSync(path.join(root,'app/components/editor/workspace/Inspector.tsx')));});

test('explicit task planning avoids an unnecessary model call but defers ambiguous or negative requests',()=>{assert.deepEqual(pipeline.explicitOperations('Add animated captions, motion graphics, relevant B-roll and subtle zoom effects.'),['captions','motionGraphics','broll','zooms']);assert.equal(pipeline.explicitOperations('Do not add captions. Make this engaging.'),undefined);assert.equal(pipeline.explicitOperations('Only add captions without zooms'),undefined);});

test('progress metadata does not consume manual undo steps',()=>{const {EditorStore}=load('app/lib/editor/store.ts'),store=new EditorStore(source());const initial=store.getSnapshot();store.execute(p=>ops.addText(p,'Actual edit',1));store.checkpoint(p=>({...p,editingJob:{status:'running'}}));store.checkpoint(p=>({...p,editingJob:{status:'completed'}}));store.undo();assert.deepEqual(store.getSnapshot().clips,initial.clips);});

test('token reservation rejects a call before any provider request is sent',async()=>{let calls=0;const original=globalThis.fetch;try{globalThis.fetch=async()=>{calls++;throw Error('must not send');};const service=loader({'app/lib/server/providerRegistry.ts':{getProviderCredential:async()=> 'PRIVATE',recordProviderUsage:async()=>{}},'app/lib/server/editorTokenBudget.ts':{reserveEditorTokens:async()=>{throw Error('300,000-token budget reached');},settleEditorTokens:async()=>{},worstCaseTokens:()=>20000}})('app/lib/server/radoxService.ts');await assert.rejects(()=>service.generateEditorJson({userId:'owner',editingBudget:{projectId:'project',jobId:'same-job'},prompt:'Test',systemInstruction:'JSON'}),/budget reached/);assert.equal(calls,0);}finally{globalThis.fetch=original;}});

test('separate model calls and retries share the job ID and settle their actual total usage',async()=>{const leases=[],settled=[],original=globalThis.fetch;try{globalThis.fetch=async()=>Response.json({model:'claude-opus-5.5',choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}],usage:{total_tokens:1234}});const service=loader({'app/lib/server/providerRegistry.ts':{getProviderCredential:async()=> 'PRIVATE',recordProviderUsage:async()=>{}},'app/lib/server/editorTokenBudget.ts':{reserveEditorTokens:async(user,budget,amount)=>{leases.push({user,budget,amount});return 'lease-'+leases.length;},settleEditorTokens:async(...args)=>settled.push(args),worstCaseTokens:()=>30000}})('app/lib/server/radoxService.ts');const options={userId:'owner',editingBudget:{projectId:'project',jobId:'same-job'},prompt:'Test',systemInstruction:'JSON'};await service.generateEditorJson(options);await service.generateEditorJson(options);assert.equal(leases.length,2);assert(leases.every(l=>l.budget.jobId==='same-job'));assert.equal(settled.reduce((n,args)=>n+args[3],0),2468);}finally{globalThis.fetch=original;}});

test('unconfirmed network outcomes retain the full token reservation',async()=>{let reserved=0,settled=0;const original=globalThis.fetch;try{globalThis.fetch=async()=>{throw Error('Network failed after submission');};const service=loader({'app/lib/server/providerRegistry.ts':{getProviderCredential:async()=> 'PRIVATE',recordProviderUsage:async()=>{}},'app/lib/server/editorTokenBudget.ts':{reserveEditorTokens:async()=>{reserved++;return 'lease';},settleEditorTokens:async()=>{settled++;},worstCaseTokens:()=>30000}})('app/lib/server/radoxService.ts');await assert.rejects(()=>service.generateEditorJson({userId:'owner',editingBudget:{projectId:'project',jobId:'job'},prompt:'Test',systemInstruction:'JSON'}));assert.equal(reserved,1);assert.equal(settled,0);}finally{globalThis.fetch=original;}});
