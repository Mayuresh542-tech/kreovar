import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(path.join(root,'package.json')),ts=require('typescript');
function loader(mocks={},extra={}){
 const cache=new Map(),context=vm.createContext({console,URL,Headers,Response,Buffer,Error,AbortSignal,AbortController,Uint8Array,crypto:globalThis.crypto,setTimeout,clearTimeout,fetch:globalThis.fetch,process:{env:{}},...extra});
 function load(relative){let filename=path.resolve(root,relative);if(!path.extname(filename))filename+='.ts';const key=path.relative(root,filename).replaceAll('\\','/');if(key in mocks)return mocks[key];if(cache.has(filename))return cache.get(filename);const exports={};cache.set(filename,exports);const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new vm.Script(`(function(require,module,exports){${code}\n})`,{filename}).runInContext(context)(s=>s.startsWith('@/')?load(s.slice(2)):s.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(filename),s))):require(s),{exports},exports);return exports;}return load;
}
const registry={getProviderCredential:async()=> 'PRIVATE_KEY',recordProviderUsage:async()=>{}};
const complete=(content='{"ok":true}',finish='stop',model='claude-opus-5.5')=>new Response(JSON.stringify({model,choices:[{finish_reason:finish,message:{content}}],usage:{total_tokens:12}}));
const options={prompt:'PRIVATE_PROMPT',systemInstruction:'Return JSON.'};

test('AI editor uses only the selected Opus 5.5 endpoint with safe structured output and no unsupported sampling parameters',async()=>{
 let seen;const events=[];const service=loader({'app/lib/server/providerRegistry.ts':{...registry,recordProviderUsage:async e=>events.push(e)}},{fetch:async(url,init)=>{seen={url,...init,body:JSON.parse(init.body)};return complete();}})('app/lib/server/radoxService');
 assert.equal((await service.generateEditorJson(options)).ok,true);assert.equal(seen.url,'https://radoxai.com/v1/chat/completions');assert.equal(seen.body.model,'claude-opus-5.5');assert.equal(seen.body.max_tokens,8192);assert.equal(seen.body.temperature,undefined);assert.equal(seen.body.top_p,undefined);assert.equal(seen.body.response_format.type,'json_object');assert.equal(seen.redirect,'error');assert.equal(events[0].providerKey,'radox');assert.equal(events[0].units,12);assert.ok(!JSON.stringify(events).includes('PRIVATE'));
});
test('reference frames are attached as bounded inline image inputs, never fetched through arbitrary external URLs',async()=>{
 let seen;const service=loader({'app/lib/server/providerRegistry.ts':registry},{fetch:async(_url,init)=>{seen=JSON.parse(init.body);return complete();}})('app/lib/server/radoxService');await service.generateEditorJson({...options,referenceImages:[{styleId:'prime',timeSecondsApprox:1.25,mediaType:'image/jpeg',data:'YWJj'}]});assert.equal(seen.messages[1].content[2].image_url.url,'data:image/jpeg;base64,YWJj');assert.ok(seen.messages[1].content[1].text.includes('never reuse'));
});
test('provider and quota errors never rotate to another model, retry or expose raw provider text',async()=>{
 for(const [status,code] of [[404,'RADOX_MODEL_UNAVAILABLE'],[402,'RADOX_ALLOWANCE_REACHED'],[401,'RADOX_AUTH_FAILED'],[413,'RADOX_REQUEST_CAPACITY'],[429,'RADOX_RATE_LIMIT']]){
  let calls=0;const events=[];const service=loader({'app/lib/server/providerRegistry.ts':{...registry,recordProviderUsage:async e=>events.push(e)}},{fetch:async()=>{calls++;return new Response(JSON.stringify({error:{message:'PRIVATE_KEY PRIVATE_ORG PRIVATE_PROMPT'}}),{status,headers:{'retry-after':'12'}});}})('app/lib/server/radoxService');
  await assert.rejects(service.generateEditorJson(options),e=>e.code===code&&!/PRIVATE/.test(e.message)&&(status!==429||e.retryAfterSeconds===12));assert.equal(calls,1);assert.ok(!JSON.stringify(events).includes('PRIVATE'));
 }
});
test('a successful response from an unrequested model is rejected',async()=>{const service=loader({'app/lib/server/providerRegistry.ts':registry},{fetch:async()=>complete('{"ok":true}','stop','claude-sonnet-5')})('app/lib/server/radoxService');await assert.rejects(service.generateEditorJson(options),e=>e.code==='RADOX_MODEL_MISMATCH');});
test('truncated, malformed and oversized responses never become edit plans',async()=>{
 for(const response of [()=>complete('{}','length'),()=>complete('invalid'),()=>complete('[]'),()=>new Response('x'.repeat(1024*1024+1))]){const service=loader({'app/lib/server/providerRegistry.ts':registry},{fetch:async()=>response()})('app/lib/server/radoxService');await assert.rejects(service.generateEditorJson(options));}
});
test('missing credentials and cancellation stop before a generation request',async()=>{
 let calls=0;const service=loader({'app/lib/server/providerRegistry.ts':{...registry,getProviderCredential:async()=>null}},{fetch:async()=>{calls++;return complete();}})('app/lib/server/radoxService');await assert.rejects(service.generateEditorJson(options),e=>e.code==='RADOX_NOT_CONFIGURED');const controller=new AbortController();controller.abort();await assert.rejects(service.generateEditorJson({...options,signal:controller.signal}));assert.equal(calls,0);
});
test('all six observed style references resolve; selected styles get only their own three private samples',()=>{
 const {editorStyleReferenceContext}=loader()('app/lib/server/editorStyleReferences');
 for(const name of ['Prism Pro','Prime','Vista','Impact II','Paper II','Sketch']){const context=editorStyleReferenceContext('Make a '+name+' edit.');assert.equal(context.references.length,1);assert.equal(context.references[0].name,name);assert.equal(context.images.length,3);assert.ok(context.images.every(i=>i.styleId===context.references[0].id&&i.data.length<50000));}
 const generic=editorStyleReferenceContext('Improve this video');assert.equal(generic.references.length,6);assert.equal(generic.images.length,6);const merged=editorStyleReferenceContext('Mix Prime and Vista with Sketch');assert.equal(merged.references.length,2);assert.equal(merged.images.length,6);
});
test('actual planner sends observed visual grammar and reference frames while preserving the original document',async()=>{
 let seen;const load=loader({'app/lib/server/editorAiCatalog.ts':{loadAiCatalog:async()=>[]},'app/lib/server/radoxService.ts':{generateEditorJson:async input=>{seen=input;return {summary:'Keep the message clear',decisions:[],toolRequests:[]};}}});const p=load('app/lib/editor/model').createProject('ref-test'),before=JSON.stringify(p);const result=await load('app/lib/server/editorAi').planAiEdit(p,'Use Prism Pro',[],'owner',new AbortController().signal);assert.equal(JSON.parse(seen.prompt).styleReferences[0].id,'prism-pro');assert.equal(seen.referenceImages.length,3);assert.ok(seen.systemInstruction.includes('AI chooses every new time and keyframe'));assert.ok(seen.systemInstruction.includes('never the current user footage'));assert.equal(result.planner.model,'claude-opus-5.5');assert.equal(JSON.stringify(p),before);
});

if(process.env.RADOX_LIVE_PROBE==='1')test('LIVE: selected model produces a validated visual editing plan from actual private reference frames',async()=>{
 assert.ok(process.env.RADOX_API_KEY,'Configure the ignored server environment first');let requests=0;const events=[];
 const load=loader({'app/lib/server/editorAiCatalog.ts':{loadAiCatalog:async()=>[]},'app/lib/server/providerRegistry.ts':{getProviderCredential:async provider=>provider==='radox'?process.env.RADOX_API_KEY:null,recordProviderUsage:async event=>events.push(event)}},{fetch:async(...args)=>{requests++;return globalThis.fetch(...args);}});
 const model=load('app/lib/editor/model'),op=load('app/lib/editor/operations');let p=model.createProject('synthetic-visual-edit','Synthetic visual editing check');p=op.addAsset(p,{id:'source',name:'Synthetic source',kind:'video',mime:'video/mp4',size:1,duration:12,width:1080,height:1920});p=op.addClip(p,'source','track-video',0,{id:'main'});
 for(const [index,text]of ['A simple plan makes work easier','Pick one task','And start today'].entries()){const words=text.split(' '),duration=3;p=op.addCaption(p,text,index*3,duration,{},words.map((word,j)=>({word,start:j*duration/words.length,end:(j+1)*duration/words.length})));}
 const before=JSON.stringify(p),brief=load('app/lib/editor/directorBrief').directorBrief({...load('app/lib/editor/autoEdit').DEFAULT_AUTO_EDIT,styleId:'captions-prime',intensity:'balanced'});
 const plan=await load('app/lib/server/editorAi').planAiEdit(p,brief+' Use supported caption styling, one original contextual vector or word graphic with supported motion, and a restrained camera accent at a meaningful word. Choose all times yourself from the speech. No cuts, masks, blur, external media or generation.',[],'diagnostic',new AbortController().signal);
 assert.ok(plan.list.decisions.length>0);assert.equal(plan.planner.model,'claude-opus-5.5');assert.equal(JSON.stringify(p),before);load('app/lib/editor/aiValidation').aiProjectSnapshot(load('app/lib/editor/ai').applyEditDecisionList(p,plan.list));
 console.log(JSON.stringify({livePlanner:plan.planner,requests,operations:plan.list.decisions.map(d=>d.op),usage:events.map(e=>({units:e.units,status:e.status}))}));
 const output=path.join('C:/Users/Admin/OneDrive/Documents/ChatGPT/kreovar/outputs/radox-editor');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'validated-synthetic-plan.json'),JSON.stringify(plan,null,2));
});
