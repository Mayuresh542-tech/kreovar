import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {createRequire} from 'node:module';
const root=process.cwd(),require=createRequire(root+'/package.json'),ts=require('typescript'),{NextRequest}=require('next/server');
function loader(mocks={},globals={}){const cache=new Map(),context=vm.createContext({console,URL,Headers,Response,Request,NextRequest,Buffer,Blob,File,Error,AbortSignal,AbortController,ReadableStream,Uint8Array,TextEncoder,TextDecoder,crypto:globalThis.crypto,setTimeout,clearTimeout,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://project.supabase.co'}},...globals});function load(rel){let f=path.resolve(root,rel);if(!path.extname(f))f+='.ts';const key=path.relative(root,f).replaceAll('\\','/');if(Object.hasOwn(mocks,key))return mocks[key];if(cache.has(f))return cache.get(f);const exports={};cache.set(f,exports);const code=ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new vm.Script(`(function(require,module,exports){${code}\n})`).runInContext(context)(s=>s.startsWith('@/')?load(s.slice(2)):s.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(f),s))):require(s),{exports},exports);return exports;}return load;}
function fixture({user='owner',allowed=true,error=false}={}){const calls=[];let attempt=0;const db={rpc:async(name,args)=>{calls.push({name,args});if(error)return{error:{message:'private database internals'},data:null};if(name==='kreovar_reserve_usage')return {data:allowed?{allowed:true,reservationId:'lease',maxResolution:720}:{allowed:false,feature:'voice_characters'},error:null};if(name==='kreovar_usage_status')return {data:{plan:'free',maxResolution:720},error:null};attempt++;return{data:true,error:null};}};const load=loader({'app/lib/server/adminAuth.ts':{getAdminClient:()=>db,getAuthenticatedUserId:async()=>user}});return{api:load('app/lib/server/planUsage.ts'),calls,load};}
const request=(body={})=>new NextRequest('http://local/api/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
test('unauthenticated and exhausted accounts never invoke a generation provider',async()=>{for(const opts of [{user:null},{allowed:false}]){const f=fixture(opts);let invoked=0;const response=await f.api.withUsage(async()=>{invoked++;return Response.json({});},'voice')(request({text:'hello'}));assert.equal(response.status,opts.user===null?401:402);assert.equal(invoked,0);}});
test('voice allowance counts actual Unicode characters from text or scene input',async()=>{for(const body of [{text:'  Hi 😀  '},{scenes:[{text:'Hi'},{text:'😀'}]}]){const f=fixture();const response=await f.api.withUsage(async()=>Response.json({audioUrl:'owned'}),'voice')(request(body));assert.equal(response.status,200);assert.equal(f.calls[0].args.p_amounts.voice_characters,4);assert.equal(f.calls.at(-1).args.p_success,true);}});
test('standalone content stages share the same feature counters as editor calls',async()=>{for(const [mode,expected]of [['ideas',{content_ideas:1}],['script',{content_scripts:1}],['kit',{content_ideas:1,content_scripts:1}]]){const f=fixture();await f.api.withUsage(async()=>Response.json({kit:{}}),'content')(request({mode}));assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].args.p_amounts)),expected);}});
test('failed and throwing generation handlers release reservations',async()=>{for(const throws of [false,true]){const f=fixture();await f.api.withUsage(async()=>{if(throws)throw Error('provider failed');return Response.json({error:'failed'},{status:503});},'voice')(request({text:'hello'}));assert.equal(f.calls.at(-1).name,'kreovar_finish_usage');assert.equal(f.calls.at(-1).args.p_success,false);}});
test('a valid but unsupported AI plan is refunded; actionable plans count once',async()=>{for(const actionable of [false,true]){const f=fixture();await f.api.withUsage(async()=>Response.json({list:{decisions:[]},toolRequests:actionable?[{type:'sfx'}]:[] }),'ai')(request());assert.equal(f.calls[0].args.p_amounts.ai_edits,1);assert.equal(f.calls.at(-1).args.p_success,actionable);}});
test('stock downloads settle only after their stream completes and refund stream errors',async()=>{for(const broken of [false,true]){const f=fixture();let pulled=false;const stream=new ReadableStream({pull(controller){if(broken)controller.error(Error('download failed'));else if(!pulled){pulled=true;controller.enqueue(new Uint8Array([1,2,3]));}else controller.close();}});const response=await f.api.withUsage(async()=>new Response(stream,{headers:{'Content-Type':'video/mp4'}}),'stock')(request());if(broken)await assert.rejects(response.arrayBuffer());else assert.equal((await response.arrayBuffer()).byteLength,3);assert.equal(f.calls.at(-1).args.p_success,!broken);}});
test('stock previews and owned file re-downloads do not consume the stock allowance',async()=>{const f=fixture();const req=new NextRequest('http://local/api/broll/download?url='+encodeURIComponent('https://project.supabase.co/storage/v1/object/sign/owned'));await f.api.withUsage(async()=>Response.json({ok:true}),'stock')(req);assert.equal(f.calls.length,0);});
test('usage persistence failures fail closed and keep service details private',async()=>{const f=fixture({error:true});let invoked=0;const response=await f.api.withUsage(async()=>{invoked++;return Response.json({});},'ai')(request());assert.equal(response.status,503);assert.equal(invoked,0);assert.ok(!(await response.text()).includes('private database'));});
test('Free cannot use the old 1080p-only server finisher',async()=>{const f=fixture();let called=0;const response=await f.api.withUsage(async()=>{called++;return Response.json({});},'server-export')(request());assert.equal(response.status,402);assert.equal(called,0);});
test('export settlement endpoint ignores caller quota types and restricts settlement to exports',async()=>{let args;const load=loader({'app/lib/server/adminAuth.ts':{getAuthenticatedUserId:async()=> 'owner'},'app/lib/server/planUsage.ts':{finishUsage:async(...a)=>{args=a;},usageError:()=>Response.json({error:'failed'},{status:503})},'app/lib/server/boundedRequest.ts':{withBoundedRequest:h=>h}});const route=load('app/api/usage/export/route.ts');const response=await route.POST(request({action:'refund',id:'12345678-1234-4234-8234-123456789012',exportOnly:false}));assert.equal(response.status,200);assert.equal(args[0],'owner');assert.equal(args[2],false);assert.equal(args[3],true);});
test('browser rendering failure refunds its reservation with a fresh non-aborted request',async()=>{const calls=[],controller=new AbortController();const load=loader({'app/lib/assets/client.ts':{assetHeaders:async()=>({Authorization:'test'})}},{fetch:async(_url,options)=>{const body=JSON.parse(options.body);calls.push({body,signal:options.signal});return Response.json({id:'export-lease'});}});const api=load('app/lib/editor/exportAllowance.ts');await assert.rejects(api.withExportAllowance({resolution:720,fps:30,duration:20},controller.signal,async()=>{controller.abort();throw Error('render failed');}));assert.equal(calls[0].body.action,'reserve');assert.equal(calls[1].body.action,'refund');assert.equal(calls[1].signal.aborted,false);});
test('speech duration derives from media samples, rejecting forged caller duration',async()=>{const f=loader(),{speechDuration}=f('app/lib/server/speechDuration.ts'),samples=16000,buffer=Buffer.alloc(44+samples*2);buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(16000,24);buffer.writeUInt32LE(32000,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(samples*2,40);assert.equal(await speechDuration(buffer,new AbortController().signal),1);await assert.rejects(speechDuration(Buffer.from('not audio'),new AbortController().signal));});

test('a failed refund confirmation is not reported as restored allowance',async()=>{const load=loader({'app/lib/server/adminAuth.ts':{getAuthenticatedUserId:async()=> 'owner',getAdminClient:()=>({rpc:async name=>name==='kreovar_reserve_usage'?{data:{allowed:true,reservationId:'lease'}}:{data:null,error:{message:'private settlement failure'}}})}});const api=load('app/lib/server/planUsage.ts');const response=await api.withUsage(async()=>Response.json({error:'provider failed',refunded:true},{status:500}),'voice')(request({text:'hello'}));assert.equal(response.status,503);const data=await response.json();assert.notEqual(data.refunded,true);assert.ok(!JSON.stringify(data).includes('private settlement'));});

test('settlement retries thrown transport failures without reserving again',async()=>{
 const calls=[];let attempts=0;
 const load=loader({'app/lib/server/adminAuth.ts':{getAuthenticatedUserId:async()=> 'owner',getAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});if(name==='kreovar_reserve_usage')return{data:{allowed:true,reservationId:'lease'}};if(++attempts<3)throw Error('network lost');return{data:true};}})}});
 const response=await load('app/lib/server/planUsage.ts').withUsage(async()=>Response.json({audioUrl:'owned'}),'voice')(request({text:'hello'}));
 assert.equal(response.status,200);assert.equal(attempts,3);assert.equal(calls.filter(c=>c.name==='kreovar_reserve_usage').length,1);
});
test('malformed AI plans and success-status error payloads restore allowance',async()=>{
 for(const payload of [null,{error:'capacity reached'},{success:false},{list:{decisions:'invalid'},toolRequests:{length:1}}]){
  const f=fixture();await f.api.withUsage(async()=>Response.json(payload),'ai')(request());assert.equal(f.calls.at(-1).args.p_success,false);
 }
 const f=fixture();await f.api.withUsage(async()=>new Response('invalid JSON', {headers:{'Content-Type':'application/json'}}),'ai')(request());assert.equal(f.calls.at(-1).args.p_success,false);
});
test('cancelled generation restores allowance even when provider returned success',async()=>{
 const f=fixture(),controller=new AbortController();const req=new NextRequest('http://local/api/test',{method:'POST',body:JSON.stringify({text:'hello'}),signal:controller.signal});
 const response=await f.api.withUsage(async()=>{controller.abort();return Response.json({audioUrl:'owned'});},'voice')(req);
 assert.equal(response.status,503);assert.equal(f.calls.at(-1).args.p_success,false);
});
test('empty and cancelled stock downloads restore allowance',async()=>{
 for(const cancel of [false,true]){const f=fixture();const response=await f.api.withUsage(async()=>new Response(new ReadableStream({start(c){if(!cancel)c.close();}}),{headers:{'Content-Type':'audio/wav'}}),'stock')(request());
 if(cancel)await response.body.cancel();else await assert.rejects(response.arrayBuffer());assert.equal(f.calls.at(-1).args.p_success,false);}
});
test('failed server export streams restore allowance for Pro',async()=>{
 const calls=[];const load=loader({'app/lib/server/adminAuth.ts':{getAuthenticatedUserId:async()=> 'owner',getAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{data:name==='kreovar_usage_status'?{maxResolution:1080}:name==='kreovar_reserve_usage'?{allowed:true,reservationId:'lease'}:true};}})}});
 const response=await load('app/lib/server/planUsage.ts').withUsage(async()=>new Response(new ReadableStream({pull(c){c.error(Error('broken export'));}}),{headers:{'Content-Type':'video/mp4'}}),'server-export')(request());
 await assert.rejects(response.arrayBuffer());assert.equal(calls.at(-1).args.p_success,false);
});
test('server resolution ceiling validates pixels for landscape portrait and square exports',()=>{
 const {assertRenderResolution}=loader()('app/lib/server/renderResolution.ts');
 for(const size of [{width:1920,height:1080},{width:1080,height:1920},{width:1080,height:1080},{width:1280,height:720}])assert.doesNotThrow(()=>assertRenderResolution(size));
 for(const size of [null,{width:3840,height:2160},{width:2160,height:3840},{width:1920,height:1920},{width:'1920',height:1080},{width:0,height:1080},{width:1920.5,height:1080}])assert.throws(()=>assertRenderResolution(size));
 assert.throws(()=>assertRenderResolution({width:1920,height:1080},720));
});
test('server render charges only after the output record is saved; failed saves refund',async()=>{
 for(const failedSave of [false,true]){
  const settlements=[],events=[];let workerDone;const finished=new Promise(resolve=>{workerDone=resolve;});
  const db={from:()=>({insert:()=>({select:()=>({single:async()=>({data:{id:'job'}})})}),update:patch=>({eq:async()=>{events.push(patch.status);return{error:patch.status==='completed'&&failedSave?{message:'save failed'}:null};}})})};
  const load=loader({
   'app/lib/server/adminAuth.ts':{getAuthenticatedUserId:async()=> 'owner',getAdminClient:()=>db},
   'app/lib/server/planUsage.ts':{reserveUsage:async()=>({reservationId:'lease'}),usageStatus:async()=>({maxResolution:1080}),finishUsage:async(_user,_id,success)=>{settlements.push(success);events.push(success?'charged':'refunded');workerDone();},PlanLimitError:class extends Error{},usageError:()=>Response.json({error:'usage'},{status:503})},
   'app/lib/server/render/ffmpegRenderer.ts':{renderTimelineWithFFmpeg:async()=>({outputUrl:'owned'})},
   'app/lib/server/render/mediaDownload.ts':{},
   'app/lib/server/boundedRequest.ts':{withBoundedRequest:h=>h}
  },{console:{...console,error:()=>{},log:()=>{}}});
  const response=await load('app/api/render/route.ts').POST(request({timeline:{tracks:[],duration:10,resolution:{width:1920,height:1080}}}));
  assert.equal(response.status,200);await finished;assert.deepEqual(settlements,[!failedSave]);assert.ok(events.indexOf('completed')<events.indexOf(failedSave?'refunded':'charged'));
 }
});
test('alternate generation routes cannot bypass the shared plan counters',async()=>{
 for(const rel of ['app/api/ai/complete/route.ts','app/api/competitors/analysis/route.ts','app/api/platform-kit/route.ts']){
  const f=fixture({allowed:false});let invoked=false;
  const load=loader({
   'app/lib/server/planUsage.ts':f.api,
   'app/lib/server/geminiService.ts':{generateGeminiContent:async()=>{invoked=true;},generateGeminiJson:async()=>{invoked=true;}},
   'app/lib/server/boundedRequest.ts':{withBoundedRequest:h=>h}
  });
  const response=await load(rel).POST(request({mode:'script',userPrompt:'hello',niche:'test',videos:[{title:'test'}],topic:'test',platform:'youtube'}));
  assert.equal(response.status,402);assert.equal(invoked,false);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].args.p_amounts)),rel.includes('ai/complete')?{content_ideas:1,content_scripts:1}:rel.includes('competitors')?{content_ideas:1}:{content_scripts:1});
 }
});
test('development fallback output is never charged as generated content',async()=>{
 const f=fixture();const response=await f.api.withUsage(async()=>Response.json({isDevelopmentMode:true,sections:[{}]}),'script')(request());assert.equal(response.status,502);assert.equal(f.calls.at(-1).args.p_success,false);
});
