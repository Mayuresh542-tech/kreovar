import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(path.join(root,'package.json')),ts=require('typescript');
function loader(mocks={},extra={}){
 const cache=new Map(),context=vm.createContext({console,URL,Headers,Response,Buffer,Error,AbortSignal,AbortController,Uint8Array,crypto:globalThis.crypto,setTimeout,clearTimeout,fetch:globalThis.fetch,process:{env:{EDITOR_AI_PRIMARY_PROVIDER:'radox'}},...extra});
 function load(relative){let filename=path.resolve(root,relative);if(!path.extname(filename))filename+='.ts';const key=path.relative(root,filename).replaceAll('\\','/');if(key in mocks)return mocks[key];if(cache.has(filename))return cache.get(filename);const exports={};cache.set(filename,exports);const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new vm.Script(`(function(require,module,exports){${code}\n})`,{filename}).runInContext(context)(s=>s.startsWith('@/')?load(s.slice(2)):s.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(filename),s))):require(s),{exports},exports);return exports;}return load;
}
const TEXT='openai/gpt-oss-120b',VISION='qwen/qwen3.8-27b',PRIMARY='claude-opus-5.5';
const reply=(model,value,units=12)=>Response.json({model,choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:units-2,completion_tokens:2,total_tokens:units}});
const down=()=>Response.json({error:{code:'service_upgrading'}},{status:503});
const observations={observations:[{panel:1,description:'A red rectangle centered on a plain background; no person or readable text is visible.'}]};
const opts={prompt:JSON.stringify({instruction:'PRIVATE_EDIT_REQUEST',project:{id:'project-1'}}),systemInstruction:'Return complete edit JSON. PRIVATE_OPERATION_SCHEMA'};
async function image(){const sharp=require('sharp');return (await sharp({create:{width:48,height:32,channels:3,background:'#ff0000'}}).jpeg().toBuffer()).toString('base64');}
function setup(fetch,mocks={}){
 const events=[],load=loader({'app/lib/server/providerRegistry.ts':{getProviderCredential:async()=> 'PRIVATE_KEY',recordProviderUsage:async e=>events.push(e)},...mocks},{fetch});return {load,events,service:()=>load('app/lib/server/editorProvider')};
}
test('healthy Claude remains the only model even with visual inputs',async()=>{
 const seen=[],s=setup(async(url,init)=>{seen.push({url,body:JSON.parse(init.body)});return reply(PRIMARY,{ok:true});});
 const result=await s.service().generateEditPlanJson({...opts,referenceImages:[{styleId:'prime',timeSecondsApprox:1,mediaType:'image/jpeg',data:'YWJj'}]});
 assert.equal(result.provider,'radox');assert.equal(result.model,PRIMARY);assert.equal(seen.length,1);assert.ok(seen[0].url.includes('radox'));assert.equal(seen[0].body.messages[1].content[0].text,opts.prompt);assert.equal(result.visionModel,undefined);
});
test('image fallback uses Qwen only for observation, then GPT-OSS for the final plan',async()=>{
 const seen=[],s=setup(async(url,init)=>{const body=JSON.parse(init.body);seen.push({url,body});if(url.includes('radox'))return down();return body.model===VISION?reply(VISION,observations,20):reply(TEXT,{ok:true},30);});
 const result=await s.service().generateEditPlanJson({...opts,footageFrames:[{clipId:'main',sourceTime:1,timelineTime:1,width:48,height:32,data:await image()}]});
 assert.deepEqual(seen.map(s=>s.body.model),[PRIMARY,VISION,TEXT]);assert.equal(result.model,TEXT);assert.equal(result.visionModel,VISION);assert.equal(result.attempts,3);assert.equal(result.value.ok,true);const vision=JSON.stringify(seen[1].body);assert.ok(!vision.includes('PRIVATE_EDIT_REQUEST'));assert.ok(!vision.includes('PRIVATE_OPERATION_SCHEMA'));assert.ok(vision.includes('observation'));assert.equal(typeof seen[2].body.messages[1].content,'string');assert.ok(seen[2].body.messages[1].content.includes('PRIVATE_EDIT_REQUEST'));assert.ok(seen[2].body.messages[1].content.includes('A red rectangle'));assert.ok(seen[2].body.messages[1].content.includes('main'));assert.ok(!JSON.stringify(seen[2].body).includes('data:image'));assert.ok(!JSON.stringify(s.events).includes('PRIVATE'));
});
test('text-only fallback skips Qwen and keeps GPT-OSS as the planner',async()=>{
 const models=[],s=setup(async(url,init)=>{const model=JSON.parse(init.body).model;models.push(model);return url.includes('radox')?down():reply(TEXT,{ok:true});});const result=await s.service().generateEditPlanJson(opts);assert.deepEqual(models,[PRIMARY,TEXT]);assert.equal(result.model,TEXT);assert.equal(result.visionModel,undefined);assert.equal(result.attempts,2);
});
test('missing, duplicate, invented or oversized panel observations stop before GPT planning',async()=>{
 const data=await image();
 for(const value of [{observations:[]},{observations:[{panel:2,description:'Invented panel'}]},{observations:[{panel:1,description:'x'},{panel:1,description:'y'}]},{observations:[{panel:1,description:'x'.repeat(401)}]},{...observations,decisions:[{op:'removeClip',clipId:'main'}]}]){const seen=[],s=setup(async(url,init)=>{const model=JSON.parse(init.body).model;seen.push(model);return url.includes('radox')?down():reply(VISION,value);});await assert.rejects(s.service().generateEditPlanJson({...opts,candidateImages:[{candidateId:'a',data}]}),e=>e.code==='GROQ_INVALID_OBSERVATIONS');assert.deepEqual(seen,[PRIMARY,VISION]);}
});
test('Qwen quota/access failures and cancellation never start final planning',async()=>{
 const data=await image();for(const status of [403,429]){const seen=[],s=setup(async(url,init)=>{seen.push(JSON.parse(init.body).model);return url.includes('radox')?down():Response.json({error:{message:'PRIVATE_ORG'}},{status});});await assert.rejects(s.service().generateEditPlanJson({...opts,candidateImages:[{candidateId:'a',data}]}));assert.deepEqual(seen,[PRIMARY,VISION]);}
 const controller=new AbortController(),seen=[],s=setup(async(url,init)=>{const model=JSON.parse(init.body).model;seen.push(model);if(url.includes('radox'))return down();controller.abort();return reply(VISION,observations);});await assert.rejects(s.service().generateEditPlanJson({...opts,candidateImages:[{candidateId:'a',data}],signal:controller.signal}));assert.deepEqual(seen,[PRIMARY,VISION]);
});
test('each provider step reserves and settles independently under the same editing job',async()=>{
 const reserved=[],settled=[],s=setup(async(url,init)=>url.includes('radox')?down():JSON.parse(init.body).model===VISION?reply(VISION,observations,20):reply(TEXT,{ok:true},30),{'app/lib/server/editorTokenBudget.ts':{reserveEditorTokens:async(user,budget,amount)=>{reserved.push({user,budget,amount});return 'lease-'+reserved.length;},settleEditorTokens:async(...args)=>settled.push(args),worstCaseTokens:()=>20000}});
 await s.service().generateEditPlanJson({...opts,candidateImages:[{candidateId:'a',data:await image()}],userId:'owner',editingBudget:{projectId:'project',jobId:'same-job'}});assert.equal(reserved.length,3);assert.ok(reserved.every(r=>r.budget.jobId==='same-job'));assert.deepEqual(settled.map(s=>s[3]),[0,20,30]);
});
test('budget denial after visual observation stops before a GPT request',async()=>{
 let reserves=0;const models=[],s=setup(async(url,init)=>{models.push(JSON.parse(init.body).model);return url.includes('radox')?down():reply(VISION,observations);},{'app/lib/server/editorTokenBudget.ts':{reserveEditorTokens:async()=>{reserves++;if(reserves===3)throw Error('Planner token budget denied');return 'lease-'+reserves;},settleEditorTokens:async()=>{},worstCaseTokens:()=>20000}});
 await assert.rejects(s.service().generateEditPlanJson({...opts,candidateImages:[{candidateId:'a',data:await image()}],userId:'owner',editingBudget:{projectId:'project',jobId:'same-job'}}),/token budget denied/);assert.deepEqual(models,[PRIMARY,VISION]);
});
test('validation correction reuses observations and only reruns GPT, with four total calls',async()=>{
 const data=await image(),models=[];let plans=0;const s=setup(async(url,init)=>{const model=JSON.parse(init.body).model;models.push(model);if(url.includes('radox'))return down();if(model===VISION)return reply(VISION,observations);plans++;return reply(TEXT,{summary:'Set portrait framing',decisions:plans===1?[{op:'removeClip',clipId:'missing'}]:[{op:'setAspectRatio',aspectRatio:'9:16'}],toolRequests:[]});},{'app/lib/server/editorAiCatalog.ts':{loadAiCatalog:async()=>[]},'app/lib/server/editorStyleReferences.ts':{editorStyleReferenceContext:()=>({references:[],images:[{styleId:'prime',timeSecondsApprox:1,mediaType:'image/jpeg',data}],selectedIds:['prime']})}});
 const project=s.load('app/lib/editor/model').createProject('two-step-project'),before=JSON.stringify(project),result=await s.load('app/lib/server/editorAi').planAiEdit(project,'Set portrait framing',[],'owner',new AbortController().signal);assert.deepEqual(models,[PRIMARY,VISION,TEXT,TEXT]);assert.equal(result.modelRequests,4);assert.equal(result.planner.model,TEXT);assert.equal(result.planner.visionModel,VISION);assert.equal(result.summary,'Set portrait framing');assert.equal(JSON.stringify(project),before);
});
test('final planner failure does not return Qwen observations as an edit or rotate models again',async()=>{
 const models=[],s=setup(async(url,init)=>{const model=JSON.parse(init.body).model;models.push(model);if(url.includes('radox'))return down();if(model===VISION)return reply(VISION,observations);return Response.json({error:{message:'PRIVATE_KEY'}},{status:429});});await assert.rejects(s.service().generateEditPlanJson({...opts,candidateImages:[{candidateId:'a',data:await image()}]}),e=>e.code==='GROQ_RATE_LIMIT');assert.deepEqual(models,[PRIMARY,VISION,TEXT]);
});

test('vision schema-generation rejection gets one same-model JSON-mode retry with identical image evidence',async()=>{
 const seen=[],data=await image();const load=loader({'app/lib/server/providerRegistry.ts':{getProviderCredential:async()=> 'PRIVATE_KEY',recordProviderUsage:async()=>{}}},{process:{env:{}},fetch:async(_url,init)=>{
  const body=JSON.parse(init.body);seen.push(body);
  if(seen.length===1)return Response.json({error:{code:'json_validate_failed',type:'invalid_request_error',message:'PRIVATE',failed_generation:'{\u200b'}},{status:400});
  return body.model===VISION?reply(VISION,observations):reply(TEXT,{ok:true});
 }});
 const result=await load('app/lib/server/editorProvider').generateEditPlanJson({...opts,footageFrames:[{clipId:'main',sourceTime:1,timelineTime:1,width:48,height:32,data}]});
 assert.equal(result.value.ok,true);assert.equal(result.attempts,3);assert.deepEqual(seen.map(b=>b.model),[VISION,VISION,TEXT]);assert.equal(seen[0].response_format.type,'json_schema');assert.equal(seen[1].response_format.type,'json_object');assert.deepEqual(seen[0].messages[1].content.filter(c=>c.type==='image_url'),seen[1].messages[1].content.filter(c=>c.type==='image_url'));assert.ok(JSON.stringify(seen[1].messages).includes('panel1'));
});
test('vision format recovery never retries auth, quotas, unrelated rejection or a second schema failure',async()=>{
 for(const [status,code,expected] of [[401,'bad_key',1],[429,'rate_limit_exceeded',1],[400,'bad_request',1],[400,'json_validate_failed',2]]){
  let calls=0;const data=await image(),load=loader({'app/lib/server/providerRegistry.ts':{getProviderCredential:async()=> 'PRIVATE_KEY',recordProviderUsage:async()=>{}}},{process:{env:{}},fetch:async()=>{calls++;return Response.json({error:{code,message:'PRIVATE'}},{status});}});
  await assert.rejects(load('app/lib/server/editorProvider').generateEditPlanJson({...opts,footageFrames:[{clipId:'main',sourceTime:1,timelineTime:1,width:48,height:32,data}]}));assert.equal(calls,expected);
 }
});
