import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),require=createRequire(path.join(root,"package.json")),ts=require("typescript");
function loader(mocks={}){
 // Isolate existing provider/auth tests from the new allowance persistence boundary. Dedicated allowance tests exercise the real wrapper.
 mocks={"app/lib/server/planUsage.ts":{withUsage:h=>h,reserveUsage:async()=>({reservationId:'test-usage'}),finishUsage:async()=>{},PlanLimitError:class extends Error{},usageError:()=>new Response('{}',{status:503})},"app/lib/server/speechDuration.ts":{speechDuration:async()=>1},...mocks};if(mocks["app/lib/server/creditService.ts"])mocks["app/lib/server/usageCreditCompat.ts"]=mocks["app/lib/server/creditService.ts"];
const cache=new Map();function load(rel){let f=path.resolve(root,rel);if(!path.extname(f))f+=".ts";const key=path.relative(root,f).replaceAll("\\","/");if(Object.hasOwn(mocks,key))return mocks[key];if(cache.has(f))return cache.get(f);const exports={};cache.set(f,exports);const code=ts.transpileModule(fs.readFileSync(f,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new vm.Script("(function(require,module,exports){"+code+"\n})").runInThisContext()(s=>s.startsWith("@/")?load(s.slice(2)):s.startsWith(".")?load(path.relative(root,path.resolve(path.dirname(f),s))):require(s),{exports},exports);return exports;}return load;}
const owner="11111111-1111-4111-8111-111111111111",id="22222222-2222-4222-8222-222222222222",foreign="33333333-3333-4333-8333-333333333333";
const png=Buffer.from([137,80,78,71,13,10,26,10,0]);
test("asset validation rejects forged formats and unsafe caption times",()=>{
 const {validateAssetBytes,assetFilename}=loader()("app/lib/server/assetPolicy.ts");
 assert.throws(()=>validateAssetBytes(Buffer.from("<script>fake</script>"),"video/mp4"),/contents/);
 assert.throws(()=>validateAssetBytes(Buffer.from("not a subtitle"),"application/x-subrip"),/valid timed/);
 assert.doesNotThrow(()=>validateAssetBytes(png,"image/png"));
 assert.equal(assetFilename("../नमस्ते.mp4","audio/wav"),".._नमस्ते.wav");
 assert.throws(()=>validateAssetBytes(png,"image/svg+xml"),/supported/);
});
test("stored asset views contain stable authenticated URLs, not storage paths",()=>{
 const {assetView}=loader({"app/lib/server/adminAuth.ts":{}})("app/lib/server/assetStore.ts");
 const asset=assetView({id,kind:"image",filename:"image.png",mime:"image/png",size_bytes:9,storage_path:owner+"/private.png",metadata:{},source:"upload",created_at:"now"});
 assert.equal(asset.url,"/api/assets/"+id+"/file");assert.equal(JSON.stringify(asset).includes(owner),false);
});
test("same-user byte deduplication survives retries without another upload",async()=>{
 const rows=new Map();let uploads=0;const storage={upload:async()=>{uploads++;return{error:null};}},db={storage:{getBucket:async()=>({data:{public:false},error:null}),from:()=>storage},rpc:async(_name,p)=>{assert.equal(p.p_hash.length,64);const key=p.p_user_id+":"+p.p_hash;if(!rows.has(key))rows.set(key,{id:key,user_id:p.p_user_id,storage_path:p.p_path,filename:p.p_filename,mime:p.p_mime,kind:p.p_kind,size_bytes:p.p_bytes,metadata:p.p_metadata,status:"pending",source:p.p_source,created_at:"now"});return{data:[rows.get(key)],error:null};},from:()=>{let match;const q={update:()=>q,eq:(k,v)=>{if(k==="id")match=v;return q;},select:()=>q,single:async()=>{const row=[...rows.values()].find(r=>r.id===match);row.status="ready";return{data:row,error:null};}};return q;}};
 const {saveStudioAsset}=loader({"app/lib/server/adminAuth.ts":{getAdminClient:()=>db}})("app/lib/server/assetStore.ts");
 const first=await saveStudioAsset(owner,png,"image/png","First");
 const again=await saveStudioAsset(owner,png,"image/png","Different name");
 assert.equal(first.id,again.id);assert.equal(uploads,1);
 const other=await saveStudioAsset(foreign,png,"image/png","First");assert.notEqual(first.id,other.id);assert.equal(uploads,2);
});
test("private bucket and quota failures never upload or report success",async()=>{
 let uploaded=false;
 for(const publicBucket of [true,false]){const db={storage:{getBucket:async()=>({data:{public:publicBucket},error:null}),from:()=>({upload:()=>{uploaded=true;}})},rpc:async()=>({data:null,error:{message:"ASSET_QUOTA_EXCEEDED"}})};
 const store=loader({"app/lib/server/adminAuth.ts":{getAdminClient:()=>db}})("app/lib/server/assetStore.ts");
 await assert.rejects(()=>store.saveStudioAsset(owner,png,"image/png","Image"),publicBucket?/Private asset/:/2 GB/);assert.equal(uploaded,false);}
});
test("asset upload authenticates before reading or saving media",async()=>{
 let called=false;
 const route=loader({"app/lib/server/adminAuth.ts":{getAuthenticatedUserId:async()=>null},"app/lib/server/assetStore.ts":{saveStudioAsset:()=>{called=true;}}})("app/api/assets/route.ts");
 const {NextRequest}=require("next/server");const form=new FormData();form.set("file",new File([png],"image.png",{type:"image/png"}));
 const response=await route.POST(new NextRequest("http://localhost/api/assets",{method:"POST",body:form}));
 assert.equal(response.status,401);assert.equal(called,false);
});
test("foreign assets never receive a signed file URL",async()=>{
 let signed=false;
 const route=loader({"app/lib/server/adminAuth.ts":{getAuthenticatedUserId:async()=>owner,getAdminClient:()=>({storage:{from:()=>({createSignedUrl:()=>{signed=true;}})}})},"app/lib/server/assetStore.ts":{getStudioAsset:async(user,assetId)=>{assert.equal(user,owner);assert.equal(assetId,id);return null;}}})("app/api/assets/[id]/file/route.ts");
 const {NextRequest}=require("next/server");const response=await route.GET(new NextRequest("http://localhost/api/assets/"+id+"/file"),{params:Promise.resolve({id})});
 assert.equal(response.status,404);assert.equal(signed,false);
});
test("only owned asset paths are signed and downloads use the stored filename",async()=>{
 const signedCalls=[];const row={id,user_id:owner,storage_path:owner+"/original.wav",filename:"Voiceover.wav"};
 const route=loader({"app/lib/server/adminAuth.ts":{getAuthenticatedUserId:async()=>owner,getAdminClient:()=>({storage:{from:()=>({createSignedUrl:async(...args)=>{signedCalls.push(args);return{data:{signedUrl:"https://private.supabase.co/signed"},error:null};}})}})},"app/lib/server/assetStore.ts":{getStudioAsset:async()=>row}})("app/api/assets/[id]/file/route.ts");
 const {NextRequest}=require("next/server");let response=await route.GET(new NextRequest("http://localhost/api/assets/"+id+"/file?download=1"),{params:Promise.resolve({id})});assert.equal(response.status,302);assert.deepEqual(signedCalls[0],[row.storage_path,120,{download:"Voiceover.wav"}]);
 row.storage_path=foreign+"/original.wav";response=await route.GET(new NextRequest("http://localhost/api/assets/"+id+"/file"),{params:Promise.resolve({id})});assert.equal(response.status,404);assert.equal(signedCalls.length,1);
});
test("foreign project associations fail before credits or provider generation",async()=>{
 let charged=false;
 const route=loader({"app/lib/server/adminAuth.ts":{getAuthenticatedUserId:async()=>owner,getAdminClient:()=>({from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null,error:null})};return q;}})},"app/lib/server/creditService.ts":{deductCreditsForVoice:()=>{charged=true;}},"app/lib/server/tts/registry.ts":{},"app/lib/server/assetStore.ts":{}})("app/api/voice/generate/route.ts");
 const {NextRequest}=require("next/server");const response=await route.POST(new NextRequest("http://localhost/api/voice/generate",{method:"POST",body:JSON.stringify({projectId:id,text:"Speech"})}));assert.equal(response.status,404);assert.equal(charged,false);
});
test("raw analysis requires actual speech and reports measured zero pauses",()=>{
 const {speechAnalysis}=loader()("app/lib/media/speechAnalysis.ts");
 assert.throws(()=>speechAnalysis({transcript:""}),/No speech/);
 const result=speechAnalysis({transcript:"Real speech",words:[{start:0,end:1},{start:1.1,end:2}]});
 assert.equal(result.silenceCount,0);assert.equal("scenesCount" in result,false);assert.equal("potentialClips" in result,false);
 const pauses=speechAnalysis({transcript:"Real speech",words:[{start:0,end:1},{start:2,end:3}]});assert.deepEqual(pauses.silenceIntervals,[{start:1,end:2,duration:1}]);
});
test("shared library originals bypass per-project duplicate cloud uploads",async()=>{
 const {syncCloudOriginals}=loader({"app/lib/supabase.ts":{supabase:{auth:{getSession:async()=>({data:{session:{access_token:"test",user:{id:owner}}}})}}},"app/lib/editor/cache.ts":{cacheRead:()=>{throw Error("Must not copy library bytes");},cacheWrite:async()=>{}}})("app/lib/editor/cloudMedia.ts");
 const p={id,assets:{shared:{id:"shared",libraryId:id,localKey:"cached-original"}}};
 const result=await syncCloudOriginals(p,owner,new Map(),new AbortController().signal,()=>{});assert.equal(result.assets.shared.libraryId,id);
});
test("Pixabay download policy permits animation CDN only and rejects lookalikes",()=>{
 const {allowedDownloadUrl}=loader()("app/lib/server/brollDownload.ts");
 assert.equal(allowedDownloadUrl("https://cdn.pixabay.com/video/2026/01/clip.mp4").hostname,"cdn.pixabay.com");
 for(const url of ["https://cdn.pixabay.com.evil.test/video/clip.mp4","https://cdn.pixabay.com/photo/clip.mp4","http://cdn.pixabay.com/video/clip.mp4"])assert.throws(()=>allowedDownloadUrl(url));
});


test("asset uploads use an existing database rate-limit scope and remain bounded",()=>{
 const policy=loader()("app/lib/server/requestSecurity.ts");
 const rule=policy.ratePolicy("/api/assets","POST");
 assert.equal(rule.scope,"generation");assert.equal(rule.limit,12);assert.equal(rule.seconds,60);
 assert.equal(policy.requestBodyLimit("/api/assets"),101*1024*1024);
});

test("upload MIME falls back to extensions but refuses contradictory media",()=>{
 const {uploadMime}=loader()("app/lib/assets/uploadPolicy.ts");
 assert.equal(uploadMime({name:"Clip.MP4",type:""}),"video/mp4");
 assert.equal(uploadMime({name:"Voice.wav",type:"audio/x-wav"}),"audio/wav");
 assert.equal(uploadMime({name:"Captions.srt",type:"text/plain"}),"application/x-subrip");
 assert.throws(()=>uploadMime({name:"clip.mp4",type:"text/html"}));
});
test("direct private upload validates reservation and verifies content before ready",async()=>{
 const {createHash}=require("node:crypto"),hash=createHash("sha256").update(png).digest("hex");
 const row={id,user_id:owner,kind:"image",filename:"test.png",mime:"image/png",size_bytes:png.length,storage_path:owner+"/"+hash+".png",status:"pending",metadata:{},source:"upload",created_at:"now"};
 let signed=0,ready=0,bytes=png;
 const storage={createSignedUploadUrl:async(p,o)=>{assert.equal(p,row.storage_path);assert.equal(o.upsert,false);signed++;return{data:{signedUrl:"https://storage.test/signed"}};},info:async()=>({data:{size:png.length}}),download:async()=>({data:new Blob([bytes])})};
 const db={storage:{getBucket:async()=>({data:{public:false}}),from:()=>storage},rpc:async()=>({data:row}),from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:row}),update:()=>{ready++;return q;},single:async()=>({data:{...row,status:"ready"}})};return q;}};
 const api=loader({"app/lib/server/adminAuth.ts":{getAdminClient:()=>db}})("app/lib/server/assetUpload.ts");
 await assert.rejects(()=>api.prepareAssetUpload(owner,{hash,mime:"image/png",name:"test.png",size:101*1024*1024}));assert.equal(signed,0);
 const input={hash,mime:"image/png",name:"test.png",size:png.length};
 assert.equal((await api.prepareAssetUpload(owner,input)).id,id);assert.equal(signed,1);
 await assert.rejects(()=>api.completeAssetUpload(foreign,id));assert.equal(ready,0);
 bytes=Buffer.from("badbytes!");await assert.rejects(()=>api.completeAssetUpload(owner,id));assert.equal(ready,0);
 bytes=Buffer.from(png);bytes[8]=1;await assert.rejects(()=>api.completeAssetUpload(owner,id),/integrity/);assert.equal(ready,0);
 bytes=png;assert.equal((await api.completeAssetUpload(owner,id)).id,id);assert.equal(ready,1);
 row.status="ready";assert.equal((await api.prepareAssetUpload(owner,input)).asset.id,id);assert.equal(signed,1);
});
test("direct upload route rejects anonymous requests before parsing body",async()=>{
 const route=loader({"app/lib/server/adminAuth.ts":{getAuthenticatedUserId:async()=>null},"app/lib/server/assetUpload.ts":{}})("app/api/assets/upload/route.ts");
 const {NextRequest}=require("next/server");assert.equal((await route.POST(new NextRequest("http://localhost/api/assets/upload",{method:"POST",body:"invalid"}))).status,401);
});

test('owned media preview returns only a short-lived signed URL with no-store while anonymous and foreign paths stay blocked',async()=>{
 let user=owner,signed=0,row={id,user_id:owner,storage_path:owner+'/clip.mp4',filename:'clip.mp4'};
 const route=loader({'app/lib/server/adminAuth.ts':{getAuthenticatedUserId:async()=>user,getAdminClient:()=>({storage:{from:()=>({createSignedUrl:async(p,ttl)=>{signed++;assert.equal(ttl,120);return {data:{signedUrl:'https://private.supabase.co/storage/v1/object/sign/clip?token=test'},error:null};}})}})},'app/lib/server/assetStore.ts':{getStudioAsset:async()=>row}})('app/api/assets/[id]/file/route.ts');
 const {NextRequest}=require('next/server'),request=()=>new NextRequest('http://localhost/api/assets/'+id+'/file?preview=1'),params={params:Promise.resolve({id})};
 user=null;assert.equal((await route.GET(request(),params)).status,401);assert.equal(signed,0);user=owner;
 let response=await route.GET(request(),params),data=await response.json();assert.equal(response.status,200);assert.equal(data.expiresIn,120);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.ok(data.url.startsWith('https://'));assert.equal(data.storage_path,undefined);
 row.storage_path=foreign+'/clip.mp4';assert.equal((await route.GET(request(),params)).status,404);assert.equal(signed,1);
 row=null;assert.equal((await route.GET(request(),params)).status,404);assert.equal(signed,1);
});
test('private playback authorizes the URL response without downloading full media or putting bearer tokens in the media URL',async()=>{
 const previous=globalThis.fetch,calls=[];
 const preview=loader({'app/lib/assets/client.ts':{assetHeaders:async()=>({Authorization:'Bearer test-session'}),assetResponse:async r=>{if(!r.ok)throw Error('Denied');return r.json();}}})('app/lib/assets/preview.ts');
 globalThis.fetch=async(url,options)=>{calls.push([url,options]);return Response.json({url:'https://private.supabase.co/signed?token=short-lived'});};
 try{const result=await preview.resolveAssetPreview('/api/assets/'+id+'/file?download=1',new AbortController().signal,'http://localhost');assert.ok(result.includes('short-lived'));assert.ok(!result.includes('test-session'));assert.equal(calls.length,1);assert.equal(calls[0][0],'/api/assets/'+id+'/file?preview=1');assert.equal(calls[0][1].headers.Authorization,'Bearer test-session');assert.equal(calls[0][1].cache,'no-store');assert.equal(calls[0][1].body,undefined);
 assert.equal(await preview.resolveAssetPreview('https://stock.example/clip.mp4',new AbortController().signal,'http://localhost'),'https://stock.example/clip.mp4');assert.equal(calls.length,1);
 await assert.rejects(()=>preview.resolveAssetPreview('javascript:alert(1)',new AbortController().signal,'http://localhost'));assert.equal(calls.length,1);
 }finally{globalThis.fetch=previous;}
});
test('cancelled or malformed playback authorization cannot leak a token or return a playable source',async()=>{
 const before=globalThis.fetch;let fetched=0;const abort=new AbortController();
 const preview=loader({'app/lib/assets/client.ts':{assetHeaders:async()=>{abort.abort();return {Authorization:'Bearer test'};},assetResponse:r=>r.json()}})('app/lib/assets/preview.ts');
 globalThis.fetch=async()=>{fetched++;return Response.json({url:'https://valid.example'});};
 try{await assert.rejects(()=>preview.resolveAssetPreview('/api/assets/'+id+'/file',abort.signal,'http://localhost'));assert.equal(fetched,0);
 const checked=loader({'app/lib/assets/client.ts':{assetHeaders:async()=>({Authorization:'Bearer test'}),assetResponse:r=>r.json()}})('app/lib/assets/preview.ts');
 globalThis.fetch=async()=>Response.json({url:'http://user:password@evil.example/clip'});await assert.rejects(()=>checked.resolveAssetPreview('/api/assets/'+id+'/file',new AbortController().signal,'http://localhost'),/invalid/);
 }finally{globalThis.fetch=before;}
});
test('library project imports fetch canonical metadata and reuse the same original ID rather than uploading bytes',async()=>{
 const calls=[],canonical={id,kind:'video',name:'Canonical clip.mp4',url:'/api/assets/'+id+'/file',mime:'video/mp4',size:42,duration:2,source:'upload',created_at:'now',metadata:{}};
 const importer=loader({'app/lib/assets/client.ts':{getAsset:async value=>{assert.equal(value,id);return canonical;},projectAssetItem:asset=>({id:asset.id,libraryId:asset.id,url:asset.url,name:asset.name})},'app/lib/services/projectService.ts':{addAssetToProject:async(...args)=>{calls.push(args);return {id:owner};}}})('app/lib/assets/projectImport.ts');
 for(const role of ['raw_footage','broll_assets']){const project=await importer.importProjectAsset(owner,role,{id,name:'Forged',url:'https://foreign.example'});assert.equal(project.id,owner);const call=calls.at(-1);assert.equal(call[1],role);assert.equal(call[2].libraryId,id);assert.equal(call[2].name,'Canonical clip.mp4');}
});
test('library project imports reject wrong media, invalid timed captions and persistence failures before reporting success',async()=>{
 let linked=0,asset={id,kind:'audio',metadata:{}};
 const importer=loader({'app/lib/assets/client.ts':{getAsset:async()=>asset,projectAssetItem:asset=>asset},'app/lib/services/projectService.ts':{addAssetToProject:async()=>{linked++;return null;}}})('app/lib/assets/projectImport.ts');
 await assert.rejects(()=>importer.importProjectAsset(owner,'raw_footage',{id}),/matches/);assert.equal(linked,0);
 asset={id,kind:'caption',metadata:{}};await assert.rejects(()=>importer.importProjectAsset(owner,'captions',{id}),/timed/);assert.equal(linked,0);
 asset={id,kind:'image',metadata:{}};await assert.rejects(()=>importer.importProjectAsset(owner,'thumbnails',{id}),/could not be added/);assert.equal(linked,1);
});
