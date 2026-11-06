import assert from 'node:assert/strict';import {test} from 'node:test';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(root+'/package.json'),ts=require('typescript'),{NextRequest}=require('next/server');
function loader(mocks={},extra={}){
 // Isolate existing provider/auth tests from the new allowance persistence boundary. Dedicated allowance tests exercise the real wrapper.
 mocks={"app/lib/server/planUsage.ts":{withUsage:h=>h,reserveUsage:async()=>({reservationId:'test-usage'}),finishUsage:async()=>{},PlanLimitError:class extends Error{},usageError:()=>new Response('{}',{status:503})},"app/lib/server/speechDuration.ts":{speechDuration:async()=>1},...mocks};if(mocks["app/lib/server/creditService.ts"])mocks["app/lib/server/usageCreditCompat.ts"]=mocks["app/lib/server/creditService.ts"];
const cache=new Map(),context=vm.createContext({console:{...console,warn:()=>{}},URL,Headers,Response,Buffer,Blob,File,Error,AbortSignal,Uint8Array,setTimeout,clearTimeout,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test',NODE_ENV:'development'}},...extra});function load(rel){let f=path.resolve(root,rel);if(!path.extname(f))f+='.ts';const key=path.relative(root,f).replaceAll('\\','/');if(key in mocks)return mocks[key];if(cache.has(f))return cache.get(f);const exports={};cache.set(f,exports);const code=ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new vm.Script(`(function(require,module,exports){${code}\n})`).runInContext(context)(s=>s.startsWith('@/')?load(s.slice(2)):s.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(f),s))):s in mocks?mocks[s]:require(s),{exports},exports);return exports;}return load;}
function authFixture(){const tokens=[],db={auth:{getUser:async token=>{tokens.push(token);return{data:{user:token==='valid'?{id:'verified-user'}:null},error:token==='valid'?null:{message:'Invalid'}}},admin:{listUsers:()=>{throw new Error('Must not impersonate another user');}}}};return{tokens,auth:loader({'@supabase/supabase-js':{createClient:()=>db},'app/lib/admin.ts':{isAdminEmail:()=>false}})('app/lib/server/adminAuth.ts')};}
test('signed-out development requests never impersonate a database user',async()=>{const f=authFixture();assert.equal(await f.auth.getAuthenticatedUserId(new NextRequest('http://localhost')),null);assert.equal(f.tokens.length,0);});
test('forged cookie user IDs cannot authenticate without a verified access token',async()=>{const f=authFixture();for(const cookie of [{user:{id:'victim'}},{access_token:'invalid',user:{id:'victim'}}])assert.equal(await f.auth.getAuthenticatedUserId(new NextRequest('http://localhost',{headers:{cookie:'fretrend-auth='+encodeURIComponent(JSON.stringify(cookie))}})),null);});
test('valid bearer and chunked cookie sessions return only the server-verified identity',async()=>{const f=authFixture();assert.equal(await f.auth.getAuthenticatedUserId(new NextRequest('http://localhost',{headers:{Authorization:'Bearer valid'}})),'verified-user');const raw=encodeURIComponent(JSON.stringify({access_token:'valid',user:{id:'forged'}}));assert.equal(await f.auth.getAuthenticatedUserId(new NextRequest('http://localhost',{headers:{cookie:`fretrend-auth.0=${raw.slice(0,20)}; fretrend-auth.1=${raw.slice(20)}`}})),'verified-user');});
test('invalid explicit authorization never falls through to a cookie session',async()=>{const f=authFixture();assert.equal(await f.auth.getAuthenticatedUserId(new NextRequest('http://localhost',{headers:{Authorization:'Bearer invalid',cookie:'fretrend-auth='+encodeURIComponent(JSON.stringify({access_token:'valid'}))}})),null);assert.deepEqual(f.tokens,['invalid']);});
test('standard base64 Supabase cookie is verified before accepting its user ID',async()=>{const f=authFixture();const raw='base64-'+Buffer.from(JSON.stringify({access_token:'valid'})).toString('base64url');assert.equal(await f.auth.getAuthenticatedUserId(new NextRequest('http://localhost',{headers:{cookie:'sb-project-auth-token='+raw}})),'verified-user');});
test('render media rejects private hosts, unsafe protocols, lookalikes and foreign storage',()=>{const media=loader()('app/lib/server/render/mediaDownload.ts');for(const url of ['http://localhost/a','https://127.0.0.1/a','file:///etc/passwd','https://videos.pexels.com.evil.test/a','https://user:pass@videos.pexels.com/a','https://other.supabase.co/storage/v1/object/public/videos/x','https://project.supabase.co/rest/v1/users'])assert.throws(()=>media.trustedRenderMediaUrl(url));assert.equal(media.trustedRenderMediaUrl('https://videos.pexels.com/a').hostname,'videos.pexels.com');});
test('render media refuses a redirect to an internal service before following it',async()=>{const calls=[];const media=loader({}, {fetch:async url=>{calls.push(String(url));return new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});},Response})('app/lib/server/render/mediaDownload.ts');await assert.rejects(media.fetchRenderMedia('https://videos.pexels.com/a'));assert.equal(calls.length,1);});
test('render media rejects HTML, empty files and oversized payloads',async()=>{for(const response of [()=>new Response('<html>',{headers:{'Content-Type':'text/html'}}),()=>new Response('',{headers:{'Content-Type':'video/mp4'}}),()=>new Response('x',{headers:{'Content-Type':'video/mp4','Content-Length':String(101*1024*1024)}})]){const media=loader({}, {fetch:async()=>response(),Response})('app/lib/server/render/mediaDownload.ts');await assert.rejects(media.fetchRenderMedia('https://videos.pexels.com/a'));}});
test('failed voice providers never return mocked audio as success',async()=>{const eleven=loader({}, {fetch:async()=>new Response(JSON.stringify({detail:{message:'Quota exceeded'}}),{status:429,headers:{'Content-Type':'application/json'}}),Response})('app/lib/server/tts/providers/elevenlabs.ts');await assert.rejects(new eleven.ElevenLabsTTSProvider('test-key').generateSpeech('Test speech',{}));const voice=loader({}, {fetch:async()=>new Response('Quota exceeded',{status:429}),Response})('app/lib/server/tts/providers/voiceai.ts');await assert.rejects(new voice.VoiceAITTSProvider('vk_test').generateSpeech('Test speech',{}));});
test('AI completion fails closed for signed-out development requests',async()=>{let generated=false;const route=loader({'app/lib/server/adminAuth.ts':{getAdminClient:()=>({auth:{getUser:async()=>({data:{user:null}})}})},'app/lib/server/geminiService.ts':{generateGeminiContent:async()=>{generated=true;}}})('app/api/ai/complete/route.ts');const r=await route.POST(new NextRequest('http://localhost',{method:'POST',body:JSON.stringify({userPrompt:'Generate'})}));assert.equal(r.status,401);assert.equal(generated,false);});
test('thumbnail and competitor analysis reject signed-out calls before provider use',async()=>{for(const rel of ['app/api/thumbnails/generate/route.ts','app/api/competitors/analysis/route.ts']){let generated=false;const route=loader({'app/lib/server/adminAuth.ts':{getAuthenticatedUserId:async()=>null},'app/lib/server/geminiService.ts':{generateGeminiJson:async()=>{generated=true;}}})(rel);assert.equal((await route.POST(new NextRequest('http://localhost',{method:'POST',body:'{}'}))).status,401);assert.equal(generated,false);}});
test('server render refuses missing projects before reserving credits or spawning a worker',async()=>{let charged=false;const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null,error:null})};const route=loader({'app/lib/server/adminAuth.ts':{getAuthenticatedUserId:async()=> 'alice',getAdminClient:()=>({from:()=>q})},'app/lib/server/creditService.ts':{deductCreditsForVideoRender:async()=>{charged=true;},VIDEO_RENDER_COST:25},'app/lib/server/render/ffmpegRenderer.ts':{renderTimelineWithFFmpeg:()=>{throw new Error('Must not start');}}})('app/api/render/route.ts');const r=await route.POST(new NextRequest('http://localhost',{method:'POST',body:JSON.stringify({projectId:'missing',timeline:{tracks:[]}})}));assert.equal(r.status,403);assert.equal(charged,false);});

test('admin mutations return unauthorized rather than server errors when signed out',async()=>{const route=loader({'app/lib/server/admin.ts':{verifyServerAdmin:async()=>{throw new Error('Missing authentication token.');}}})('app/api/admin/users/route.ts');assert.equal((await route.POST(new NextRequest('http://localhost',{method:'POST',body:'{}'}))).status,401);});

for(const [name,file,args,response] of [['generateIdeas','ideaService.ts',['Topic','Niche'],{ideas:[{title:'Real result'}]}],['generateResearch','researchService.ts',['Topic','Niche'],{summary:'Real research'}],['generateScript','scriptService.ts',[{title:'Topic',hook:'Hook',format:'Shorts'},{topic:'Topic'}],{scenes:[]}]] ) test(name+' uses server-backed AI without a browser API key and surfaces failures',async()=>{let calls=0;class MockAIProvider{};const service=loader({'app/lib/services/aiProvider.ts':{MockAIProvider,getAIProvider:()=>({complete:async()=>{calls++;return JSON.stringify(response);}})}})('app/lib/services/'+file);await service[name](...args);assert.equal(calls,1);const failed=loader({'app/lib/services/aiProvider.ts':{MockAIProvider,getAIProvider:()=>({complete:async()=>{throw new Error('Provider unavailable');}})}})('app/lib/services/'+file);await assert.rejects(failed[name](...args),/Provider unavailable/);});

test('a failed subscription read cannot reset a paid balance',async()=>{let written=false;const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null,error:{message:'Read failed'}}),upsert:()=>{written=true;return q;}};const db={auth:{admin:{getUserById:async()=>({data:{user:{email:'user@example.invalid'}},error:null})}},from:()=>q};const service=loader({'@supabase/supabase-js':{createClient:()=>db},'app/lib/admin.ts':{isAdminEmail:()=>false}})('app/lib/server/creditService.ts');await assert.rejects(service.ensureUserSubscription('alice'));assert.equal(written,false);});
test('voice pre-charge failure never grants a refund or claims one',async()=>{let refunds=0;const route=loader({'app/lib/server/adminAuth.ts':{getAuthenticatedUserId:async()=> 'alice',getAdminClient:()=>({})},'app/lib/server/creditService.ts':{deductCreditsForVoice:async()=>{throw new Error('Subscription unavailable');},refundCreditsForVoice:async()=>{refunds++;return{success:true};},VOICE_SYNTHESIS_COST:5},'app/lib/server/tts/registry.ts':{},'app/lib/server/providerRegistry.ts':{}})('app/api/voice/generate/route.ts');const response=await route.POST(new NextRequest('http://localhost',{method:'POST',body:JSON.stringify({text:'Test'})}));assert.equal(refunds,0);assert.equal((await response.json()).refunded,false);});
test('disabled provider refuses environment credentials',async()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{enabled:false,encrypted_api_key:null},error:null})};const provider=loader({'app/lib/server/adminAuth.ts':{getAdminClient:()=>({from:()=>q})},'app/lib/crypto.ts':{decrypt:()=>{throw new Error('Must not decrypt');}}},{process:{env:{GEMINI_API_KEY:'test-env-key'}}})('app/lib/server/providerRegistry.ts');assert.equal(await provider.getProviderCredential('gemini'),null);});

test('admin requires verified identity, confirmed email and server allowlist',async()=>{
 for(const [user,status] of [[null,401],[{id:'x',email:'owner',user_metadata:{role:'admin'}},403],[{id:'x',email:'other',email_confirmed_at:'now',user_metadata:{role:'admin'}},403],[{id:'x',email:'owner',email_confirmed_at:'now'},403]]){
  const auth=loader({'@supabase/supabase-js':{createClient:()=>({auth:{getUser:async()=>({data:{user},error:null})}})},'app/lib/admin.ts':{isAdminEmail:email=>email==='owner'}})('app/lib/server/adminAuth.ts');
  const result=await auth.requireAdmin(new NextRequest('http://localhost/admin',{headers:{Authorization:'Bearer test'}}));assert.equal('error' in result?result.error.status:200,status);
 }
});
test('verified MFA enrollment requires aal2 for admin access',async()=>{
 const auth=loader({'@supabase/supabase-js':{createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'x',email:'owner',email_confirmed_at:'now',factors:[{status:'verified'}]}},error:null})}})},'app/lib/admin.ts':{isAdminEmail:()=>true}})('app/lib/server/adminAuth.ts');
 for(const [aal,status]of[['aal1',403],['aal2',200]]){const token='header.'+Buffer.from(JSON.stringify({aal})).toString('base64url')+'.sig';const result=await auth.requireAdmin(new NextRequest('http://localhost/admin',{headers:{Authorization:'Bearer '+token}}));assert.equal('error' in result?result.error.status:200,status);}
});
test('CSRF guard rejects cross-site writes including bearer requests and cookie-only writes without Origin',()=>{
 const security=loader()('app/lib/server/requestSecurity.ts');
 for(const headers of [{Origin:'https://evil.test'},{Origin:'null'},{Cookie:'fretrend-auth=x'},{Origin:'http://localhost', 'Sec-Fetch-Site':'cross-site',Authorization:'Bearer token'}])assert.equal(security.isSafeMutation(new NextRequest('http://localhost/api/keys',{method:'POST',headers})),false);
 assert.equal(security.isSafeMutation(new NextRequest('http://localhost/api/keys',{method:'POST',headers:{Origin:'http://localhost'}})),true);
 assert.equal(security.isSafeMutation(new NextRequest('http://localhost/api/keys',{method:'POST',headers:{Authorization:'Bearer token'}})),true);
});
test('bounded requests reject chunked oversized bodies before handler or provider executes',async()=>{
 const bounded=loader()('app/lib/server/boundedRequest.ts');let called=false;const handler=bounded.withBoundedRequest(async()=>{called=true;return new Response('OK');});const req=new NextRequest('http://localhost/api/ai/complete',{method:'POST',body:'x'.repeat(1024*1024+1)});assert.equal((await handler(req)).status,413);assert.equal(called,false);
});
test('bounded multipart preserves bytes and route context',async()=>{
 const bounded=loader()('app/lib/server/boundedRequest.ts');const data=new FormData();data.set('file',new File(['video-test'],'clip.mp4',{type:'video/mp4'}));const handler=bounded.withBoundedRequest(async(req,context)=>{assert.equal(await (await req.formData()).get('file').text(),'video-test');assert.equal(context.id,'owned');return new Response('OK');});assert.equal((await handler(new NextRequest('http://localhost/api/media/upload',{method:'POST',body:data}),{id:'owned'})).status,200);
});
test('retired referral endpoint never writes for anonymous or forged identities',async()=>{
 for(const identity of [null,'alice']){let written=false;const route=loader({'app/lib/server/adminAuth.ts':{getAuthenticatedUserId:async()=>identity},'app/lib/server/affiliateService.ts':{recordAffiliateReferral:async()=>{written=true;}}})('app/api/affiliates/track/route.ts');const response=await route.POST(new NextRequest('http://localhost/api/affiliates/track',{method:'POST',body:JSON.stringify({userId:'victim',referralCode:'TEST1234'})}));assert.equal(response.status,410);assert.equal(written,false);}
});
test('CSP permits nonce scripts but blocks unsafe inline production scripts and framing',()=>{
 const h=loader()('app/lib/server/requestSecurity.ts').securityHeaders('unique-test',false);assert.match(h['Content-Security-Policy'],/script-src 'self' 'nonce-unique-test' 'strict-dynamic';/);assert.equal(h['Content-Security-Policy'].includes('unsafe-eval'),false);assert.match(h['Content-Security-Policy'],/frame-ancestors 'none'/);assert.equal(h['X-Content-Type-Options'],'nosniff');
});
test('proxy denies unauthenticated APIs before rate counter and refuses CSRF writes',async()=>{
 let rateCalls=0;const proxy=loader({'app/lib/server/adminAuth.ts':{getAuthenticatedUser:async()=>null,getAdminClient:()=>({rpc:async()=>{rateCalls++;}})}},{Headers,crypto:{randomUUID:()=> 'random'}})('proxy.ts');const anonymous=await proxy.proxy(new NextRequest('http://localhost/api/ai/complete',{method:'POST',body:'{}'}));assert.equal(anonymous.status,401);assert.equal(rateCalls,0);const cross=await proxy.proxy(new NextRequest('http://localhost/api/keys',{method:'POST',headers:{Origin:'https://evil.test'},body:'{}'}));assert.equal(cross.status,403);
});
test('proxy rate counter fails closed and marks private responses no-store',async()=>{
 for(const [data,error,status]of[[false,null,429],[null,{message:'DB offline'},503]]){const proxy=loader({'app/lib/server/adminAuth.ts':{getAuthenticatedUser:async()=>({id:'alice'}),getAdminClient:()=>({rpc:async()=>({data,error})})}},{Headers,crypto:{randomUUID:()=> 'random'}})('proxy.ts');const response=await proxy.proxy(new NextRequest('http://localhost/api/editor/ai-edit',{method:'POST',body:'{}'}));assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'private, no-store');}
});
test('admin page protection verifies authorization before allowing shell or prefetch',async()=>{
 const proxy=loader({'app/lib/server/adminAuth.ts':{requireAdmin:async()=>({error:new Response('',{status:401})})}},{Headers,crypto:{randomUUID:()=> 'random'}})('proxy.ts');const response=await proxy.proxy(new NextRequest('http://localhost/admin/providers',{headers:{'next-router-prefetch':'1'}}));assert.equal(response.status,307);assert.equal(response.headers.get('location'),'http://localhost/login');
});

test('unexpected provider errors do not expose private details while preserving refund result',async()=>{
 const safe=loader()('app/lib/server/safeResponse.ts');const handler=safe.withSafeResponse(async()=>new Response(JSON.stringify({error:'private-key-in-url',details:'provider-secret',refunded:false}),{status:500,headers:{'Content-Type':'application/json'}}));const r=await handler(new NextRequest('http://localhost'));const body=await r.json();assert.equal(body.refunded,false);assert.equal(JSON.stringify(body).includes('private-key'),false);assert.equal('details' in body,false);
});
test('HTML renamed to an MP4 cannot be uploaded to public video storage',async()=>{
 let uploaded=false;const route=loader({'app/lib/server/adminAuth.ts':{getAdminClient:()=>({auth:{getUser:async()=>({data:{user:{id:'alice'}},error:null})},storage:{from:()=>({upload:()=>{uploaded=true;}})}})}})('app/api/media/upload/route.ts');const form=new FormData();form.set('file',new File(['<script>bad</script>'],'clip.mp4',{type:'text/html'}));const response=await route.POST(new NextRequest('http://localhost/api/media/upload',{method:'POST',headers:{Authorization:'Bearer valid'},body:form}));assert.equal(response.status,400);assert.equal(uploaded,false);
});
test('unsigned event identity headers cannot defeat webhook replay identity',async()=>{
 const ids=[];const route=loader({'app/lib/server/whopService.ts':{verifyWhopSignature:()=>true,processWhopWebhook:async(_payload,id)=>{ids.push(id);return{duplicate:false,message:'OK'};}}})('app/api/webhooks/whop/route.ts');for(const id of ['header-a','header-b'])await route.POST(new NextRequest('http://localhost/api/webhooks/whop',{method:'POST',headers:{'whop-signature':'test','webhook-id':id},body:JSON.stringify({action:'membership.went_valid',data:{id:'membership-test'}})}));assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);assert.match(ids[0],/^body_[0-9a-f]{64}$/);
});
test('concurrent duplicate webhook claims stop before entitlement writes',async()=>{
 let calls=0;const service=loader({'app/lib/server/admin.ts':{createAdminSupabaseClient:()=>({rpc:async()=>{calls++;return{data:false,error:null};},from:()=>{throw new Error('Must not change entitlements');}})}})('app/lib/server/whopService.ts');const result=await service.processWhopWebhook({action:'membership.went_valid',data:{id:'membership'}},'event');assert.equal(result.duplicate,true);assert.equal(calls,1);
});
test('unsupported webhook types never grant subscriptions',async()=>{
 const service=loader({'app/lib/server/admin.ts':{createAdminSupabaseClient:()=>({rpc:()=>{throw new Error('Must not claim unsupported event');}})}})('app/lib/server/whopService.ts');const result=await service.processWhopWebhook({action:'unrelated.event',data:{email:'owner@example.invalid'}},'event');assert.equal(result.success,true);assert.match(result.message,/ignored/);
});


test('custom-domain caption writes pass the hosting-origin boundary without trusting forged forwarded hosts',()=>{
 for(const env of [{},{SITE_URL:'https://kreovar.kreovarstudio.workers.dev'},{NEXT_PUBLIC_SITE_URL:'https://kreovar.kreovarstudio.workers.dev'}]){
  const security=loader({}, {process:{env}})('app/lib/server/requestSecurity.ts');
  const request=headers=>new NextRequest('https://kreovar.kreovarstudio.workers.dev/api/transcribe',{method:'POST',headers});
  assert.equal(security.isSafeMutation(request({Origin:'https://kreovar.online','Sec-Fetch-Site':'same-origin'})),true);
  assert.equal(security.isSafeMutation(request({Origin:'https://kreovar.online','Sec-Fetch-Site':'cross-site',Authorization:'Bearer token'})),false);
  for(const origin of ['https://kreovar.online.evil.test','http://kreovar.online','https://kreovar.online:444','https://evil.test','null'])assert.equal(security.isSafeMutation(request({Origin:origin,'X-Forwarded-Host':'evil.test',Host:'evil.test',Authorization:'Bearer token'})),false);
 }
});
test('custom-domain caption requests reach authentication while foreign origins remain blocked',async()=>{
 let authCalls=0;
 const p=loader({'app/lib/server/adminAuth.ts':{getAuthenticatedUser:async()=>{authCalls++;return null;}}},{Headers,crypto:{randomUUID:()=> 'random'},process:{env:{SITE_URL:'https://kreovar.kreovarstudio.workers.dev'}}})('proxy.ts');
 for(const [origin,status] of [['https://kreovar.online',401],['https://evil.test',403]]){
  const response=await p.proxy(new NextRequest('https://kreovar.kreovarstudio.workers.dev/api/transcribe',{method:'POST',headers:{Origin:origin,'Sec-Fetch-Site':'same-origin'}}));assert.equal(response.status,status);
 }
 assert.equal(authCalls,1);
});

test('pending account deletion blocks new API work but permits a tightly rate-limited deletion retry',async()=>{
 let rateCalls=0;
 const p=loader({'app/lib/server/adminAuth.ts':{getAuthenticatedUser:async()=>({id:'alice',app_metadata:{account_deletion_pending:true}}),getAccessToken:()=> 'verified',getAdminClient:()=>({rpc:async(_name,args)=>{rateCalls++;assert.equal(args.p_scope,'account-delete');assert.equal(args.p_limit,3);assert.equal(args.p_window_seconds,300);return{data:true,error:null};}})}},{Headers,crypto:{randomUUID:()=> 'random'}})('proxy.ts');
 for(const url of ['/api/voice/generate','/api/assets'])assert.equal((await p.proxy(new NextRequest('http://localhost'+url,{method:'POST',body:'{}'}))).status,423);
 assert.equal(rateCalls,0);
 assert.equal((await p.proxy(new NextRequest('http://localhost/api/account',{method:'DELETE',body:'{}'}))).status,200);
 assert.equal(rateCalls,1);
});


test('legacy media URL parser rejects foreign hosts and traversal while rewriting only owned-project legacy buckets',()=>{
 const mod=loader()('app/lib/media/legacyStorage.ts');const raw='https://project.supabase.co/storage/v1/object/public/videos/owner/clip.mp4';assert.equal(mod.legacyStoragePath(raw).path,'owner/clip.mp4');assert.ok(mod.legacyStorageEndpoint(raw).startsWith('/api/media/legacy?'));
 for(const raw of ['https://other.supabase.co/storage/v1/object/public/videos/owner/x.mp4','https://project.supabase.co/storage/v1/object/public/other/x.mp4','https://videos.pexels.com/x.mp4'])assert.equal(mod.legacyStoragePath(raw),null);
 for(const tail of ['owner%2fother/file.mp4','owner/%2e%2e/file.mp4','owner/file.mp4?token=bad'])assert.throws(()=>mod.legacyStoragePath('https://project.supabase.co/storage/v1/object/public/videos/'+tail));
});
test('legacy media signing requires verified identity and the caller JWT, and fails closed on storage ownership denial',async()=>{
 for(const scenario of ['signedout','denied','owned','foreign']){
  let signs=0;const load=loader({'app/lib/server/adminAuth.ts':{getAccessToken:()=>scenario==='signedout'?null:'caller-jwt',getAuthenticatedUserId:async()=>scenario==='signedout'?null:'owner'},'@supabase/supabase-js':{createClient:(url,key,opts)=>{assert.equal(opts.global.headers.Authorization,'Bearer caller-jwt');assert.notEqual(key,'test');return {storage:{from:bucket=>{assert.equal(bucket,'videos');return {createSignedUrl:async(path,ttl)=>{signs++;assert.equal(path,'owner/file.mp4');assert.equal(ttl,120);return scenario==='denied'?{error:{},data:null}:{data:{signedUrl:'https://project.supabase.co/storage/v1/object/sign/videos/owner/file.mp4?token=temporary'}};}};}}};}}});
  const url=scenario==='foreign'?'https://foreign.example/file.mp4':'https://project.supabase.co/storage/v1/object/public/videos/owner/file.mp4';const req=new NextRequest('http://localhost/api/media/legacy?url='+encodeURIComponent(url));const result=await load('app/api/media/legacy/route.ts').GET(req);assert.equal(result.status,scenario==='signedout'?401:scenario==='owned'?302:404);assert.equal(signs,scenario==='signedout'||scenario==='foreign'?0:1);
 }
});

test('admin access requires verified server identity, confirmed allowlisted email, AAL2 and a currently verified factor',async()=>{
 for(const scenario of ['foreign','unconfirmed','aal1','reset','allowed']){
  const user={id:'owner',email:scenario==='foreign'?'other@example.com':'owner@example.com',email_confirmed_at:scenario==='unconfirmed'?null:'2026-10-21',factors:scenario==='reset'?[]:[{status:'verified',factor_type:'totp'}]};
  const token='h.'+Buffer.from(JSON.stringify({aal:scenario==='aal1'?'aal1':'aal2'})).toString('base64url')+'.s';
  const auth=loader({'@supabase/supabase-js':{createClient:()=>({auth:{getUser:async()=>({data:{user},error:null})}})},'app/lib/admin.ts':{isAdminEmail:email=>email==='owner@example.com'}})('app/lib/server/adminAuth.ts');
  const result=await auth.requireAdmin(new NextRequest('http://localhost/api/admin',{headers:{Authorization:'Bearer '+token}}));if(scenario==='allowed')assert.equal(result.user.id,'owner');else assert.equal(result.error.status,403);
 }
});
test('proxy enforces tool controls after rate protection and fails closed if controls cannot load',async()=>{
 for(const [controls,error,status] of [
  [[{key:'ai',value:{enabled:false,message:'AI maintenance'}}],null,503],
  [[{key:'maintenance',value:{enabled:true,message:'Maintenance'}}],null,503],
  [[{key:'ai',value:{enabled:true}}],null,200],
  [[],{message:'private DB details'},503]
 ]){
  let rateCalls=0;
  const p=loader({'app/lib/server/adminAuth.ts':{getAuthenticatedUser:async()=>({id:'alice'}),getAccessToken:()=> 'verified',getAdminClient:()=>({rpc:async()=>{rateCalls++;return{data:true,error:null};},from:()=>({select:()=>({in:async()=>({data:controls,error})})})})}},{Headers,crypto:{randomUUID:()=> 'random'}})('proxy.ts');
  const response=await p.proxy(new NextRequest('http://localhost/api/editor/ai-edit',{method:'POST',body:'{}'}));
  assert.equal(response.status,status);assert.equal(rateCalls,1);
  assert.ok(!(await response.text()).includes('private DB details'));
 }
});
test('suspended account cannot reach APIs even with a still-valid verified access token',async()=>{
 let calls=0;
 const p=loader({'app/lib/server/adminAuth.ts':{getAuthenticatedUser:async()=>({id:'alice',app_metadata:{admin_suspended:true}}),getAdminClient:()=>{calls++;throw Error('must not query');}}},{Headers,crypto:{randomUUID:()=> 'random'}})('proxy.ts');
 const response=await p.proxy(new NextRequest('http://localhost/api/assets'));
 assert.equal(response.status,403);assert.equal((await response.json()).code,'ACCOUNT_SUSPENDED');assert.equal(calls,0);
});


test('development upload and voice writes accept their exact loopback origin despite a production SITE_URL',async()=>{
 const env={NODE_ENV:'development',SITE_URL:'https://kreovar.online',NEXT_PUBLIC_SITE_URL:'https://kreovar.online'};
 const load=loader({}, {process:{env}}),security=load('app/lib/server/requestSecurity');
 for(const host of ['127.0.0.1','localhost','[::1]'])for(const path of ['/api/assets/upload','/api/voice/generate']){
  const origin='http://'+host+':3110',request=new NextRequest(origin+path,{method:'POST',headers:{Origin:origin,'Sec-Fetch-Site':'same-origin'}});
  assert.equal(security.isSafeMutation(request),true,origin+path);
 }
 const proxy=loader({'app/lib/server/adminAuth.ts':{getAuthenticatedUser:async()=>null}},{crypto:{randomUUID:()=> 'random'},process:{env}})('proxy');
 for(const path of ['/api/assets/upload','/api/voice/generate']){
  const response=await proxy.proxy(new NextRequest('http://127.0.0.1:3110'+path,{method:'POST',headers:{Origin:'http://127.0.0.1:3110','Sec-Fetch-Site':'same-origin'}}));
  assert.notEqual(response.status,403,'Local requests must reach auth, not origin rejection');
 }
});

test('loopback allowance is development-only and never trusts different ports, remote hosts or forwarded hosts',()=>{
 const check=mode=>loader({}, {process:{env:{NODE_ENV:mode,SITE_URL:'https://kreovar.online'}}})('app/lib/server/requestSecurity');
 for(const mode of ['production','test'])assert.equal(check(mode).isSafeMutation(new NextRequest('http://127.0.0.1:3110/api/assets/upload',{method:'POST',headers:{Origin:'http://127.0.0.1:3110'}})),false);
 const security=check('development');
 assert.equal(security.isSafeMutation(new NextRequest('http://localhost:3110/api/assets/upload',{method:'POST',headers:{Origin:'http://127.0.0.1:3110','Sec-Fetch-Site':'same-origin'}})),true,'Next normalizes the loopback request URL');
 for(const origin of ['http://evil.test','http://127.0.0.1:9999','https://127.0.0.1:3110','http://127.0.0.1.evil.test:3110','null'])assert.equal(security.isSafeMutation(new NextRequest('http://127.0.0.1:3110/api/assets/upload',{method:'POST',headers:{Origin:origin,'X-Forwarded-Host':'127.0.0.1:3110',Authorization:'Bearer token'}})),false,origin);
 assert.equal(security.isSafeMutation(new NextRequest('http://127.0.0.1:3110/api/voice/generate',{method:'POST',headers:{Origin:'http://127.0.0.1:3110','Sec-Fetch-Site':'cross-site'}})),false);
 assert.equal(security.isSafeMutation(new NextRequest('https://kreovar.kreovarstudio.workers.dev/api/assets/upload',{method:'POST',headers:{Origin:'http://127.0.0.1:3110','X-Forwarded-Host':'127.0.0.1:3110',Host:'127.0.0.1:3110'}})),false);
});

test('www deployment requests redirect to the fixed HTTPS canonical host with path and query preserved',async()=>{const load=loader({'app/lib/server/adminAuth.ts':{getAccessToken:()=>null,getAuthenticatedUser:async()=>{throw Error('No auth lookup for canonical redirect');},getAdminClient:()=>{throw Error('No database lookup for canonical redirect');},requireAdmin:async()=>{throw Error('No admin lookup for canonical redirect');}}},{crypto:{randomUUID:()=> 'nonce'},process:{env:{NODE_ENV:'production'}}});const proxy=load('proxy.ts').proxy;for(const suffix of ['/pricing?plan=pro&ref=social','//foreign.invalid/test?q=1','/admin?next=%2Fprojects']){const result=await proxy(new NextRequest('https://www.kreovar.online'+suffix));assert.equal(result.status,308);const target=new URL(result.headers.get('location'));assert.equal(target.origin,'https://kreovar.online');assert.equal(target.pathname,new URL('https://www.kreovar.online'+suffix).pathname);assert.equal(target.search,new URL('https://www.kreovar.online'+suffix).search);assert.ok(result.headers.get('content-security-policy'));}const ordinary=await proxy(new NextRequest('https://kreovar.kreovarstudio.workers.dev/pricing'));assert.equal(ordinary.status,200);});
