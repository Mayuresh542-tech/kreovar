import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {NextRequest,NextResponse} from 'next/server.js';
function load(file,mocks={}){
 const exports={};
 const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(source,{exports,require:n=>{if(n==='next/server')return{NextRequest,NextResponse};if(n in mocks)return mocks[n];throw Error(n);},Date,URL,URLSearchParams,console,Response,Number,Object,process:{env:{NEXT_PUBLIC_SUPABASE_URL:"https://test.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"test-only"}}});
 return exports;
}
const controls=load('app/lib/adminControls.ts');
const mocks=(auth)=>({'@/app/lib/server/adminAuth':{requireAdmin:async()=>auth},'@/app/lib/admin':{isAdminEmail:e=>e==='owner@test.test'},'@/app/lib/server/safeResponse':{withSafeResponse:h=>h},'@/app/lib/server/boundedRequest':{withBoundedRequest:h=>h},'@/app/lib/adminControls':controls});
const post=b=>new NextRequest('http://localhost/api/admin/control-center',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
test('every admin read and mutation rejects non-admin before database access',async()=>{
 const api=load('app/api/admin/control-center/route.ts',mocks({error:NextResponse.json({error:'Forbidden'},{status:403})}));
 assert.equal((await api.GET(new NextRequest('http://localhost/api/admin/control-center'))).status,403);
 assert.equal((await api.POST(post({action:'control',key:'ai',enabled:false}))).status,403);
});
test('allowance validation rejects missing keys, extra keys, fractions and negative values',()=>{
 const valid={content_ideas:3,content_scripts:3,voice_characters:1000,caption_seconds:120,ai_edits:1,exports:3,stock_downloads:10};
 assert.equal(controls.validLimits(valid),true);
 for(const bad of [{...valid,ai_edits:-1},{...valid,exports:1.5},{...valid,foo:1},{},null])assert.equal(controls.validLimits(bad),false);
 assert.equal(controls.validLimits({...valid,exports:null}),true);
});
test('feature gate covers generation routes without disabling saved history or account management',()=>{
 for(const [p,m,k] of [['/api/editor/ai-edit','POST','ai'],['/api/transcribe','POST','captions'],['/api/content-kit','POST','content'],['/api/voice/generate','POST','voice'],['/api/broll/download','GET','stock'],['/api/editor/export-mp4','POST','export']])assert.equal(controls.controlledFeature(p,m),k);
 assert.equal(controls.controlledFeature('/api/voice/history','GET'),null);
 assert.equal(controls.controlledFeature('/api/account','DELETE'),null);
});
test('errors expose categories instead of raw credentials or URLs',()=>{
 assert.equal(controls.errorCategory('401 secret-key-private'),'Provider authentication / permission');
 assert.equal(controls.errorCategory('quota exhausted private URL'),'Provider quota / rate limit');
 assert.ok(!controls.errorCategory('sk-private-token').includes('sk-private'));
});
test('invalid announcements and controls never reach database',async()=>{
 const api=load('app/api/admin/control-center/route.ts',mocks({db:{from(){throw Error('must not query');}},user:{id:'owner'}}));
 for(const body of [{action:'announcement',title:'x',body:'y',published:'yes'},{action:'announcement',title:'x'.repeat(101),body:'ok',published:true},{action:'control',key:'arbitrary',enabled:true},{action:'limits',plan:'owner',limits:{}},{action:'grant',userId:'wrong',reason:'test'}]){
  assert.equal((await api.POST(post(body))).status,400);
 }
});
test('announcement reader requires sign-in',async()=>{
 const api=load('app/api/announcements/route.ts',{'@/app/lib/server/adminAuth':{getAuthenticatedUserId:async()=>null,getAdminClient(){throw Error('must not query');}},'@/app/lib/server/safeResponse':{withSafeResponse:h=>h}});
 assert.equal((await api.GET(new NextRequest('http://localhost/api/announcements'))).status,401);
});
test('administrator cannot be suspended or granted privileges through user controls',async()=>{
 const api=load('app/api/admin/control-center/route.ts',mocks({db:{auth:{admin:{getUserById:async()=>({data:{user:{email:'owner@test.test'}}})}}},user:{id:'owner'}}));
 assert.equal((await api.POST(post({action:'suspend',userId:'12345678-1234-4234-8234-123456789012',reason:'test account'}))).status,403);
});
test('billing labels complimentary Pro access separately from paid Whop subscriptions',async()=>{
 for(const manual of [true,false]){
  const plan={id:'pro',name:'Pro',price:19,yearlyPrice:190,displayPrice:'$19',yearlyDisplayPrice:'$190',monthlyCredits:0,billingPeriod:'monthly'};
  const subscription=manual?null:{id:'sub',plan:'pro',source:'whop',status:'active',billing_cycle:'monthly',current_period_end:'2099-01-01T00:00:00Z'};
  const db={auth:{getUser:async()=>({data:{user:{id:'user',email:'user@test.test'}}})},rpc:async()=>({data:subscription}),from:table=>{const q={select:()=>q,eq:()=>q,gt:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>({data:table==='admin_plan_grants'?(manual?{expires_at:'2099-01-01T00:00:00Z'}:null):subscription}),then:resolve=>resolve({data:[]})};return q;}};
  const api=load('app/api/billing/route.ts',{'@supabase/supabase-js':{createClient:()=>db},'@/app/lib/server/safeResponse':{withSafeResponse:h=>h},'@/app/lib/server/planUsage':{usageStatus:async()=>({plan:'pro'})},'@/app/config/plans':{getPlan:()=>plan,PLANS:{free:plan}},'@/app/lib/server/whopService':{reconcileWhopPurchases:async()=>{}},'@/app/config/credits':{calculateContentKitAllowance:()=>0},'@/app/lib/server/creditService':{hasUnlimitedCredits:async()=>false,UNLIMITED_CREDIT_BALANCE:999}});
  const res=await api.GET(new NextRequest('http://localhost/api/billing',{headers:{Authorization:'Bearer user-token'}}));
  assert.equal(res.status,200);const result=await res.json();
  assert.equal(result.subscription.plan,'pro');
  assert.equal(result.subscription.manualGrant,manual);
  assert.equal(result.subscription.price,manual?0:19);
  assert.equal(result.subscription.source,manual?'admin':'whop');
 }
});

