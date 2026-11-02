import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(path.join(root,'package.json')),ts=require('typescript');
function loader(mocks={},extra={}){
 const cache=new Map(),context=vm.createContext({console,URL,Headers,Response,Buffer,Error,AbortSignal,AbortController,Uint8Array,crypto:globalThis.crypto,setTimeout,clearTimeout,fetch:globalThis.fetch,process:{env:{}},...extra});
 function load(relative){let filename=path.resolve(root,relative);if(!path.extname(filename))filename+='.ts';const key=path.relative(root,filename).replaceAll('\\','/');if(key in mocks)return mocks[key];if(cache.has(filename))return cache.get(filename);const exports={};cache.set(filename,exports);const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new vm.Script(`(function(require,module,exports){${code}\n})`,{filename}).runInContext(context)(s=>s.startsWith('@/')?load(s.slice(2)):s.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(filename),s))):require(s),{exports},exports);return exports;}return load;
}
const opts={prompt:'PRIVATE_PROMPT',systemInstruction:'Return JSON.'};
const reply=(model,content='{"ok":true}',usage={prompt_tokens:8,completion_tokens:4,total_tokens:12})=>Response.json({model,choices:[{finish_reason:'stop',message:{content}}],usage});
const maintenance=()=>Response.json({error:{code:'service_upgrading',message:'PRIVATE_KEY PRIVATE_PROMPT'}},{status:503});
function setup(fetch,overrides={}){
 const events=[],keys=[];
 const load=loader({'app/lib/server/providerRegistry.ts':{getProviderCredential:async p=>{keys.push(p);return p==='groq'?'PRIVATE_GROQ':'PRIVATE_RADOX';},recordProviderUsage:async e=>events.push(e)},...overrides},{fetch});
 return {load,events,keys,service:()=>load('app/lib/server/editorProvider')};
}
test('healthy primary stays on Radox with accurate metadata and one attempt',async()=>{
 const urls=[],s=setup(async url=>{urls.push(url);return reply('claude-opus-5.5');});
 const result=await s.service().generateEditPlanJson(opts);
 assert.equal(result.value.ok,true);assert.equal(result.provider,'radox');assert.equal(result.model,'claude-opus-5.5');assert.equal(result.attempts,1);assert.equal(result.fallbackReason,undefined);assert.equal(urls.length,1);
});
test('maintenance triggers exactly one Groq text completion and reports the real provider',async()=>{
 const seen=[],s=setup(async(url,init)=>{seen.push({url,body:JSON.parse(init.body)});return url.includes('radox')?maintenance():reply('openai/gpt-oss-120b');});
 const result=await s.service().generateEditPlanJson(opts);
 assert.equal(result.provider,'groq');assert.equal(result.model,'openai/gpt-oss-120b');assert.equal(result.fallbackReason,'RADOX_MAINTENANCE');assert.equal(result.attempts,2);assert.equal(result.value.ok,true);assert.equal(seen.length,2);assert.equal(seen[1].body.response_format.type,'json_object');assert.equal(seen[1].body.messages[1].content,'PRIVATE_PROMPT');assert.ok(s.events.some(e=>e.providerKey==='groq'&&e.status==='success'));assert.ok(!JSON.stringify(s.events).includes('PRIVATE'));
});
test('network errors and primary timeouts fall back while caller cancellation does not',async()=>{
 for(const reason of ['network','timeout']){let calls=0;const s=setup(async url=>{calls++;if(url.includes('radox')){if(reason==='timeout'){const e=new Error('timed out');e.name='TimeoutError';throw e;}throw Error('network');}return reply('openai/gpt-oss-120b');});assert.equal((await s.service().generateEditPlanJson(opts)).provider,'groq');assert.equal(calls,2);}
 const controller=new AbortController();let calls=0;const s=setup(async()=>{calls++;controller.abort();throw controller.signal.reason;});await assert.rejects(s.service().generateEditPlanJson({...opts,signal:controller.signal}));assert.equal(calls,1);
});
test('auth, billing, request size, malformed output and model mismatch never bypass the primary failure',async()=>{
 for(const response of [()=>Response.json({}, {status:401}),()=>Response.json({}, {status:402}),()=>Response.json({}, {status:413}),()=>reply('claude-opus-5.5','bad'),()=>reply('other-model')]){let calls=0;const s=setup(async()=>{calls++;return response();});await assert.rejects(s.service().generateEditPlanJson(opts));assert.equal(calls,1);}
});
test('disabled Groq fails clearly without sending a Groq request or exposing private response text',async()=>{
 let calls=0;const s=setup(async()=>{calls++;return maintenance();},{'app/lib/server/providerRegistry.ts':{getProviderCredential:async p=>p==='groq'?null:'PRIVATE',recordProviderUsage:async()=>{}}});
 await assert.rejects(s.service().generateEditPlanJson(opts),e=>e.code==='GROQ_NOT_CONFIGURED'&&e.message.includes('Groq')&&!e.message.includes('PRIVATE'));assert.equal(calls,1);
});
test('fallback rate limits and malformed output stop after two calls and expose only safe errors',async()=>{
 for(const bad of [()=>Response.json({error:{message:'PRIVATE_ORG PRIVATE_PROMPT'}},{status:429,headers:{'retry-after':'12'}}),()=>reply('openai/gpt-oss-120b','[]'),()=>reply('unrequested-model'),()=>new Response('x'.repeat(1024*1024+1))]){let calls=0;const s=setup(async url=>{calls++;return url.includes('radox')?maintenance():bad();});await assert.rejects(s.service().generateEditPlanJson(opts),e=>e.code?.startsWith('GROQ_')&&!e.message.includes('PRIVATE'));assert.equal(calls,2);}
});
test('validation correction can stay on Groq without another failed primary request',async()=>{
 const urls=[],s=setup(async url=>{urls.push(url);return reply('openai/gpt-oss-120b');});const result=await s.service().generateEditPlanJson(opts,{provider:'groq',fallbackReason:'RADOX_MAINTENANCE'});assert.equal(result.attempts,1);assert.equal(urls.length,1);assert.ok(urls[0].includes('groq'));
});
test('blocked model permissions explain the configuration problem without blaming the API key',async()=>{
 const s=setup(async url=>url.includes('radox')?maintenance():Response.json({error:{code:'model_permission_blocked_project',message:'PRIVATE_ORG'}},{status:403}));
 await assert.rejects(s.service().generateEditPlanJson(opts),e=>e.code==='GROQ_MODEL_BLOCKED'&&e.message.includes('model permissions')&&!e.message.includes('PRIVATE'));
});
test('primary and fallback reserve and settle separately under the same job budget',async()=>{
 const reserves=[],settles=[],s=setup(async url=>url.includes('radox')?maintenance():reply('openai/gpt-oss-120b'),{'app/lib/server/editorTokenBudget.ts':{reserveEditorTokens:async(user,budget,amount)=>{reserves.push({user,budget,amount});return 'lease-'+reserves.length;},settleEditorTokens:async(...args)=>settles.push(args),worstCaseTokens:()=>20000}});
 await s.service().generateEditPlanJson({...opts,userId:'owner',editingBudget:{projectId:'project',jobId:'same-job'}});assert.equal(reserves.length,2);assert.ok(reserves.every(r=>r.budget.jobId==='same-job'));assert.deepEqual(settles.map(a=>a[3]),[0,12]);
});
test('token reservation failure stops before any provider network request',async()=>{
 let calls=0;const s=setup(async()=>{calls++;return maintenance();},{'app/lib/server/editorTokenBudget.ts':{reserveEditorTokens:async()=>{throw Error('Token budget unavailable');},settleEditorTokens:async()=>{},worstCaseTokens:()=>20000}});await assert.rejects(s.service().generateEditPlanJson({...opts,userId:'owner',editingBudget:{projectId:'project',jobId:'same-job'}}),/budget unavailable/);assert.equal(calls,0);
});
test('unknown fallback outcomes retain their reservation instead of refunding uncertain usage',async()=>{
 const settles=[],s=setup(async url=>{if(url.includes('radox'))return maintenance();throw Error('network after submission');},{'app/lib/server/editorTokenBudget.ts':{reserveEditorTokens:async()=>crypto.randomUUID(),settleEditorTokens:async(...args)=>settles.push(args),worstCaseTokens:()=>20000}});await assert.rejects(s.service().generateEditPlanJson({...opts,userId:'owner',editingBudget:{projectId:'project',jobId:'same-job'}}));assert.deepEqual(settles.map(a=>a[3]),[0]);
});
test('vision fallback preserves every supplied frame and reference on one labeled image board',async()=>{
 const sharp=require('sharp'),data=(await sharp({create:{width:48,height:32,channels:3,background:'#ff0000'}}).jpeg().toBuffer()).toString('base64'),seen=[];
 const s=setup(async(url,init)=>{const body=JSON.parse(init.body);seen.push(body);return url.includes('radox')?maintenance():body.model==='qwen/qwen3.8-27b'?reply('qwen/qwen3.8-27b',JSON.stringify({observations:Array.from({length:18},(_,i)=>({panel:i+1,description:'A red test image on a plain background.'}))})):reply('openai/gpt-oss-120b');});
 const result=await s.service().generateEditPlanJson({...opts,referenceImages:Array.from({length:6},(_,i)=>({styleId:'style-'+i,timeSecondsApprox:i,mediaType:'image/jpeg',data})),footageFrames:Array.from({length:6},(_,i)=>({clipId:'clip-'+i,timelineTime:i,sourceTime:i,width:48,height:32,data})),candidateImages:Array.from({length:6},(_,i)=>({candidateId:'candidate-'+i,data}))});
 assert.equal(result.model,'openai/gpt-oss-120b');assert.equal(result.visionModel,'qwen/qwen3.8-27b');assert.equal(result.imageCount,18);const content=seen[1].messages[1].content,images=content.filter(x=>x.type==='image_url');assert.equal(images.length,1);const labels=JSON.parse(content[0].text).panels;assert.equal(labels.length,18);assert.equal(new Set(labels.map(p=>p.panel)).size,18);assert.equal(labels.filter(p=>p.kind==='footage').length,6);assert.equal(labels.filter(p=>p.kind==='reference').length,6);assert.equal(labels.filter(p=>p.kind==='candidate').length,6);for(const image of images)assert.ok((await sharp(Buffer.from(image.image_url.url.split(',')[1],'base64')).metadata()).width>0);
});
test('invalid fallback decisions get one correction on Groq and stop at three provider attempts',async()=>{
 const urls=[];let completions=0;const s=setup(async url=>{urls.push(url);if(url.includes('radox'))return maintenance();completions++;return reply('openai/gpt-oss-120b',JSON.stringify({summary:'Portrait framing',decisions:completions===1?[{op:'removeClip',clipId:'missing'}]:[{op:'setAspectRatio',aspectRatio:'9:16'}],toolRequests:[]}));},{'app/lib/server/editorAiCatalog.ts':{loadAiCatalog:async()=>[]},'app/lib/server/editorStyleReferences.ts':{editorStyleReferenceContext:()=>({references:[],images:[],selectedIds:[]})}});
 const project=s.load('app/lib/editor/model').createProject('correction-project'),before=JSON.stringify(project),result=await s.load('app/lib/server/editorAi').planAiEdit(project,'Set portrait framing',[],'owner',new AbortController().signal);
 assert.equal(urls.length,3);assert.equal(urls.filter(url=>url.includes('radox')).length,1);assert.equal(result.modelRequests,3);assert.equal(result.planner.provider,'groq');assert.equal(result.list.decisions[0].aspectRatio,'9:16');assert.equal(JSON.stringify(project),before);
});
test('actual planner validates Groq edits, reports fallback and leaves the source project unchanged',async()=>{
 const s=setup(async url=>url.includes('radox')?maintenance():reply('openai/gpt-oss-120b',JSON.stringify({summary:'Set portrait framing',decisions:[{op:'setAspectRatio',aspectRatio:'9:16'}],toolRequests:[]})),{'app/lib/server/editorAiCatalog.ts':{loadAiCatalog:async()=>[]},'app/lib/server/editorStyleReferences.ts':{editorStyleReferenceContext:()=>({references:[],images:[],selectedIds:[]})}});
 const project=s.load('app/lib/editor/model').createProject('fallback-project'),before=JSON.stringify(project);const result=await s.load('app/lib/server/editorAi').planAiEdit(project,'Set portrait framing',[],'owner',new AbortController().signal);
 assert.equal(result.planner.provider,'groq');assert.equal(result.planner.model,'openai/gpt-oss-120b');assert.equal(result.modelRequests,2);assert.match(result.summary,/Groq fallback/);assert.equal(result.list.decisions[0].op,'setAspectRatio');assert.equal(JSON.stringify(project),before);
});
test('compact fallback retains complete supported operation shapes and selected private style guidance',()=>{
 const {compactEditorFallback}=loader()('app/lib/server/editorFallbackPrompt');
 const result=compactEditorFallback({systemInstruction:'You are Kreovar\'s AI video editor. Extra explanation. {op:"changeClipProperty",clipId,changes:{fadeIn?,fadeOut?}}; More text. {op:"setAspectRatio",aspectRatio:"16:9"|"9:16"}',prompt:JSON.stringify({instruction:'PRIVATE_EXACT_REQUEST',styleReferences:[{id:'chosen',compositionGuide:'KEEP_SELECTED_STYLE'}],project:{id:'source-id'}})});
 assert.ok(result.systemInstruction.includes('{op:"changeClipProperty",clipId,changes:{fadeIn?,fadeOut?}}'));assert.ok(result.systemInstruction.includes('{op:"setAspectRatio",aspectRatio:"16:9"|"9:16"}'));assert.ok(result.systemInstruction.includes('locked/hidden'));assert.ok(result.prompt.includes('PRIVATE_EXACT_REQUEST'));assert.ok(result.prompt.includes('KEEP_SELECTED_STYLE'));assert.ok(result.prompt.includes('source-id'));
});
