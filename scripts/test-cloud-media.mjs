import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(root+'/package.json'),ts=require('typescript'),{NextRequest}=require('next/server');
const projectId='12345678-1234-4234-8234-123456789012',assetId='asset-1',version='a'.repeat(32),userId='alice';
function loader(mocks={},globals={}){
 // Isolate existing provider/auth tests from the new allowance persistence boundary. Dedicated allowance tests exercise the real wrapper.
 mocks={"app/lib/server/planUsage.ts":{withUsage:h=>h,reserveUsage:async()=>({reservationId:'test-usage'}),finishUsage:async()=>{},PlanLimitError:class extends Error{},usageError:()=>new Response('{}',{status:503})},"app/lib/server/speechDuration.ts":{speechDuration:async()=>1},...mocks};if(mocks["app/lib/server/creditService.ts"])mocks["app/lib/server/usageCreditCompat.ts"]=mocks["app/lib/server/creditService.ts"];

 const cache=new Map(),context=vm.createContext({console,URL,URLSearchParams,Buffer,Blob,File,Error,AbortSignal,AbortController,TextEncoder,crypto:globalThis.crypto,setTimeout,clearTimeout,Uint8Array,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://project.supabase.co'}},...globals});
 function load(relative){let f=path.resolve(root,relative);if(!path.extname(f))f+='.ts';const key=path.relative(root,f).replaceAll('\\','/');if(Object.hasOwn(mocks,key))return mocks[key];if(cache.has(f))return cache.get(f);const exports={};cache.set(f,exports);const source=ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(f).href));new vm.Script(`(function(require,module,exports){${source}\n})`).runInContext(context)(specifier=>specifier.startsWith('@/')?load(specifier.slice(2)):specifier.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(f),specifier))):require(specifier),{exports},exports);return exports;}
 return load;
}
const policy=loader()('app/lib/server/editorMediaPolicy.ts');
test('cloud originals enforce project/asset/version/mime bounds and ownership prefixes',()=>{
 const p=policy.editorMediaPath(userId,projectId,assetId,version,'image/png');assert.equal(p,`alice/${projectId}/asset-1_${version}.png`);assert.equal(policy.ownedEditorMediaPath(p,'bob',projectId),false);assert.equal(policy.ownedEditorMediaPath(p,userId,projectId),true);assert.equal(policy.ownedEditorMediaPath(p+'/../private',userId,projectId),false);for(const args of [[userId,'../x',assetId,version,'image/png'],[userId,projectId,'../x',version,'image/png'],[userId,projectId,assetId,'bad','image/png'],[userId,projectId,assetId,version,'text/html']])assert.throws(()=>policy.editorMediaPath(...args));for(const size of [0,-1,Infinity,50*1024*1024+1])assert.throws(()=>policy.validateEditorFile(size,'image/png'));
});
function routeFixture({user=userId,owner=userId,publicBucket=false,existing=false,storedSize=3,used=0}={}){
 const calls=[];const storage={info:async()=>({data:existing?{size:storedSize,contentType:'image/png'}:null,error:existing?null:{statusCode:404}}),list:async()=>({data:[{metadata:{size:used}}],error:null}),createSignedUploadUrl:async p=>{calls.push({signUpload:p});return{data:{signedUrl:'https://project.supabase.co/storage/v1/object/upload/sign/editor-media/'+p},error:null};},createSignedUrl:async p=>{calls.push({signRead:p});return{data:{signedUrl:'https://project.supabase.co/storage/v1/object/sign/editor-media/'+p},error:null};}};
 const db={auth:{getUser:async()=>({data:{user:user?{id:user}:null},error:user?null:{message:'Expired'}})},from:()=>{const filters=[];const q={select:()=>q,eq:(k,v)=>{filters.push([k,v]);return q;},maybeSingle:async()=>{calls.push({filters});return{data:filters.some(([k,v])=>k==='user_id'&&v===owner)?{id:projectId}:null,error:null};}};return q;},storage:{getBucket:async()=>({data:{public:publicBucket},error:null}),from:()=>storage}};
 return {route:loader({'app/lib/server/adminAuth.ts':{getAdminClient:()=>db}})('app/api/editor/media/route.ts'),calls};
}
const body={projectId,assetId,version,mime:'image/png',size:3};
const request=(payload=body,token='test')=>new NextRequest('http://localhost/api/editor/media',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(payload)});
test('upload signing requires a real server-verified session',async()=>{const f=routeFixture({user:null});assert.equal((await f.route.POST(request(body,null))).status,401);assert.equal((await f.route.POST(request())).status,401);assert.equal(f.calls.length,0);});
test('upload signing refuses another user project and public buckets',async()=>{for(const options of [{owner:'bob'},{publicBucket:true}]){const f=routeFixture(options);assert.ok([403,503].includes((await f.route.POST(request())).status));assert.equal(f.calls.some(c=>c.signUpload),false);}});
test('valid owned project gets only a scoped private upload path',async()=>{const f=routeFixture();const response=await f.route.POST(request());assert.equal(response.status,200);assert.equal((await response.json()).path,`alice/${projectId}/asset-1_${version}.png`);assert.deepEqual(f.calls[0].filters,[['id',projectId],['user_id','alice']]);});
test('completed uploads require matching stored size and content type',async()=>{const good=routeFixture({existing:true});assert.equal((await good.route.POST(request({...body,complete:true}))).status,200);const bad=routeFixture({existing:true,storedSize:2});assert.equal((await bad.route.POST(request({...body,complete:true}))).status,409);assert.equal((await routeFixture().route.POST(request({...body,complete:true}))).status,409);});
test('cloud quota and oversized signing payloads fail before signing',async()=>{const full=routeFixture({used:500*1024*1024});assert.equal((await full.route.POST(request())).status,413);const huge=routeFixture();assert.equal((await huge.route.POST(request({...body,padding:'x'.repeat(5000)}))).status,413);assert.equal(huge.calls.length,0);});
test('cloud reads reject other owners and traversal before issuing a signed URL',async()=>{
 const f=routeFixture(),p=`bob/${projectId}/asset-1_${version}.png`;const req=new NextRequest('http://localhost/api/editor/media?'+new URLSearchParams({projectId,path:p}),{headers:{Authorization:'Bearer test'}});assert.equal((await f.route.GET(req)).status,403);assert.equal(f.calls.some(c=>c.signRead),false);
});
test('owner cloud read signs only the validated original path',async()=>{const f=routeFixture(),p=`alice/${projectId}/asset-1_${version}.png`;const req=new NextRequest('http://localhost/api/editor/media?'+new URLSearchParams({projectId,path:p}),{headers:{Authorization:'Bearer test'}});assert.equal((await f.route.GET(req)).status,200);assert.equal(f.calls.at(-1).signRead,p);});
function clientFixture({corrupt=false,uploadFails=false}={}){
 const bytes=new Blob(['abc'],{type:'image/png'}),calls=[],cache=new Map([['device-original',bytes]]);
 const load=loader({'app/lib/supabase.ts':{supabase:{auth:{getSession:async()=>({data:{session:{user:{id:userId},access_token:'test'}}})}}},'app/lib/editor/cache.ts':{cacheRead:async(_store,key)=>cache.get(key),cacheWrite:async(_store,key,value)=>cache.set(key,value)}},{fetch:async(url,options={})=>{
   calls.push({url:String(url),options});
   if(String(url)==='/api/editor/media'){const data=JSON.parse(options.body);return{ok:true,json:async()=>({exists:!!data.complete,path:`alice/${projectId}/${assetId}_${version}.png`,signedUrl:'https://project.supabase.co/storage/v1/object/upload/sign/editor-media/owned'})};}
   if(String(url).includes('/object/upload/'))return{ok:!uploadFails,status:uploadFails?500:200};
   if(String(url).startsWith('/api/editor/media?'))return{ok:true,json:async()=>({url:'https://project.supabase.co/storage/v1/object/sign/editor-media/owned'})};
   const blob=corrupt?new Blob(['a']):bytes;return{ok:true,body:blob.stream(),headers:new Headers({'content-type':'image/png'})};
 }});
 const model=load('app/lib/editor/model.ts'),project=model.createProject(projectId);project.assets[assetId]={id:assetId,name:'picture.png',kind:'image',mime:'image/png',size:3,duration:5,width:1,height:1,localKey:'device-original'};
 return {cloud:load('app/lib/editor/cloudMedia.ts'),project,calls,cache,load};
}
test('original upload completes before serializable refs are attached and retries deduplicate',async()=>{
 const f=clientFixture(),known=new Map();const result=await f.cloud.syncCloudOriginals(f.project,userId,known,new AbortController().signal,()=>{});assert.ok(result.assets[assetId].cloud);assert.equal(f.project.assets[assetId].cloud,undefined);assert.equal(JSON.stringify(result).includes('signedUrl'),false);const count=f.calls.length;await f.cloud.syncCloudOriginals(f.project,userId,known,new AbortController().signal,()=>{});assert.equal(f.calls.length,count);
});
test('failed uploads keep the local original and do not attach cloud refs',async()=>{const f=clientFixture({uploadFails:true});await assert.rejects(f.cloud.syncCloudOriginals(f.project,userId,new Map(),new AbortController().signal,()=>{}));assert.equal(f.project.assets[assetId].cloud,undefined);assert.ok(f.cache.get('device-original'));});
test('cross-device originals restore exact bytes and populate device cache',async()=>{
 const f=clientFixture(),asset={...f.project.assets[assetId],cloud:{bucket:'editor-media',projectId,path:`alice/${projectId}/${assetId}_${version}.png`,sourceKey:'device-original'}};f.cache.clear();assert.equal(await(await f.cloud.loadCloudOriginal(asset)).text(),'abc');assert.equal(await f.cache.get('device-original').text(),'abc');
});
test('truncated originals are rejected rather than cached',async()=>{const f=clientFixture({corrupt:true}),asset={...f.project.assets[assetId],cloud:{bucket:'editor-media',projectId,path:'owned',sourceKey:'device-original'}};await assert.rejects(f.cloud.loadCloudOriginal(asset),/incomplete/);});
test('background cloud refs preserve newer edits, undo history and active gestures',()=>{
 const f=clientFixture(),{EditorStore}=f.load('app/lib/editor/store.ts'),store=new EditorStore(f.project),synced={...f.project,assets:{[assetId]:{...f.project.assets[assetId],cloud:{bucket:'editor-media',path:'owned',sourceKey:'device-original',projectId}}}};
 store.execute(p=>({...p,title:'Newer title'}));const revision=store.getSnapshot().revision;store.attachCloudAssets(synced);assert.equal(store.getSnapshot().title,'Newer title');assert.equal(store.getSnapshot().revision,revision);assert.equal(store.canUndo,true);store.begin();store.preview(p=>({...p,title:'Gesture preview'}));assert.equal(store.getCommittedSnapshot().title,'Newer title');store.attachCloudAssets(synced);store.cancel();assert.equal(store.getSnapshot().title,'Newer title');
});

test('legacy media uploads reject missing or expired sessions before storage writes',async()=>{
 let uploads=0;
 const db={auth:{getUser:async()=>({data:{user:null},error:{message:'Expired'}})},storage:{from:()=>({upload:async()=>{uploads++;return{error:null};}})}};
 const route=loader({'app/lib/server/adminAuth.ts':{getAdminClient:()=>db}})('app/api/media/upload/route.ts');
 for(const headers of [{},{Authorization:'Bearer invalid'}])assert.equal((await route.POST(new NextRequest('http://localhost/api/media/upload',{method:'POST',headers,body:'invalid'}))).status,401);
 assert.equal(uploads,0);
});
test('legacy upload rejects oversized requests before buffering their file',async()=>{
 const db={auth:{getUser:async()=>({data:{user:{id:'alice'}},error:null})}};
 const route=loader({'app/lib/server/adminAuth.ts':{getAdminClient:()=>db}})('app/api/media/upload/route.ts');
 const req=new NextRequest('http://localhost/api/media/upload',{method:'POST',headers:{Authorization:'Bearer valid','Content-Length':String(102*1024*1024)},body:'small'});
 assert.equal((await route.POST(req)).status,413);
});

test('original cache shares concurrent reads and retains only successful originals',async()=>{
 const {OriginalCache}=loader()('app/lib/editor/originalCache.ts'),cache=new OriginalCache(10),signal=new AbortController().signal;let calls=0;
 const load=async()=>{calls++;return new Blob(['abc']);};
 const [a,b]=await Promise.all([cache.read('alice','asset',load,signal),cache.read('alice','asset',load,signal)]);
 assert.equal(await a.text(),'abc');assert.equal(a,b);assert.equal(calls,1);
 await cache.read('alice','asset',load,signal);assert.equal(calls,1);
 await cache.read('bob','asset',load,signal);assert.equal(calls,2);
 cache.clear();await assert.rejects(cache.read('bob','bad',async()=>{throw Error('broken');},signal),/broken/);
 assert.equal(await(await cache.read('bob','bad',load,signal)).text(),'abc');
});
test('original cache LRU budget and expiration force a fresh download',async()=>{
 const {OriginalCache}=loader()('app/lib/editor/originalCache.ts'),signal=new AbortController().signal,cache=new OriginalCache(6);let calls=0;
 const load=async()=>{calls++;return new Blob(['abc']);};
 for(const key of ['one','two','one','three','two'])await cache.read('alice',key,load,signal);
 assert.equal(calls,4);
 const expired=new OriginalCache(6,0);await expired.read('alice','x',load,signal);await expired.read('alice','x',load,signal);assert.equal(calls,6);
});
test('cancel one original consumer without interrupting the other, then cancel the last',async()=>{
 const {OriginalCache}=loader()('app/lib/editor/originalCache.ts'),cache=new OriginalCache();let release,shared;
 const load=signal=>{shared=signal;return new Promise(resolve=>{release=resolve;});};
 const first=new AbortController(),second=new AbortController();
 const a=cache.read('alice','a',load,first.signal),b=cache.read('alice','a',load,second.signal);
 await Promise.resolve();first.abort();await assert.rejects(a);assert.equal(shared.aborted,false);
 release(new Blob(['abc']));assert.equal(await(await b).text(),'abc');
 const last=new AbortController(),c=cache.read('alice','b',load,last.signal);await Promise.resolve();last.abort();await assert.rejects(c);assert.equal(shared.aborted,true);
 release(new Blob(['late']));await Promise.resolve();
 assert.equal(await(await cache.read('alice','b',async()=>new Blob(['fresh']),second.signal)).text(),'fresh');
});
test('changing original cache account cancels old work and rejects late private bytes',async()=>{
 const {OriginalCache}=loader()('app/lib/editor/originalCache.ts'),cache=new OriginalCache(),signal=new AbortController().signal;let release;
 const a=cache.read('alice','same',()=>new Promise(resolve=>{release=resolve;}),signal);await Promise.resolve();
 const b=await cache.read('bob','same',async()=>new Blob(['bob']),signal);release(new Blob(['alice']));await assert.rejects(a);assert.equal(await b.text(),'bob');
 assert.equal(await(await cache.read('bob','same',async()=>{throw Error('should use bob');},signal)).text(),'bob');
});
test('shared library originals validate bytes, key source changes and authenticate even on cache hits',async()=>{
 let downloads=0,token='alice',corrupt=false;const load=loader({
  'app/lib/assets/client.ts':{assetHeaders:async()=>{if(!token)throw Error('Sign in');return{Authorization:token};}},
  'app/lib/editor/cache.ts':{cacheRead:async()=>undefined},
  'app/lib/editor/cloudMedia.ts':{loadCloudOriginal:async()=>{throw Error('unexpected');}},
 },{fetch:async()=>{downloads++;const blob=new Blob([corrupt?'ab':'abc']);return{ok:true,headers:new Headers(),body:blob.stream()};}});
 const {readOriginal}=load('app/lib/editor/original.ts'),signal=new AbortController().signal,asset={id:'media',libraryId:'owned',name:'clip.mp4',size:3,mime:'video/mp4'};
 await readOriginal(asset,signal);await readOriginal(asset,signal);assert.equal(downloads,1);
 token='bob';await readOriginal(asset,signal);assert.equal(downloads,2);
 token='';await assert.rejects(readOriginal(asset,signal),/Sign in/);
 token='bob';corrupt=true;await assert.rejects(readOriginal(asset,signal),/incomplete/);corrupt=false;await readOriginal(asset,signal);assert.equal(downloads,4);
 await readOriginal({...asset,localKey:'relinked'},signal);assert.equal(downloads,5);
});
test('caption merge preserves style and text, rejects locks or long silence, and undoes as one edit',()=>{
 const load=loader(),model=load('app/lib/editor/model.ts'),ops=load('app/lib/editor/operations.ts'),edit=load('app/lib/editor/captionEditing.ts'),{EditorStore}=load('app/lib/editor/store.ts');
 let p=model.createProject(projectId);p=ops.addCaption(p,'पहली line',0,.2);p=ops.addCaption(p,'second line',.25,1);
 const ids=Object.values(p.clips).sort((a,b)=>a.startTime-b.startTime).map(c=>c.id),store=new EditorStore(p);
 assert.equal(edit.nextCaptionToMerge(p,ids[0]),ids[1]);store.execute(q=>edit.mergeCaptionWithNext(q,ids[0]));
 const merged=store.getSnapshot();assert.equal(Object.keys(merged.clips).length,1);assert.equal(merged.captions[merged.clips[ids[0]].contentId].text,'पहली line second line');assert.equal(merged.clips[ids[0]].duration,1.25);store.undo();assert.equal(Object.keys(store.getSnapshot().clips).length,2);
 const locked={...p,tracks:{...p.tracks,'track-caption':{...p.tracks['track-caption'],locked:true}}};assert.equal(edit.nextCaptionToMerge(locked,ids[0]),undefined);
 const gap={...p,clips:{...p.clips,[ids[1]]:{...p.clips[ids[1]],startTime:2}}};assert.throws(()=>edit.mergeCaptionWithNext(gap,ids[0]),/adjacent/);
});

test('planning metadata deduplicates styles and preserves exact timing, locks and custom transforms',()=>{
 const load=loader(),model=load('app/lib/editor/model.ts'),ops=load('app/lib/editor/operations.ts'),{planningMetadata}=load('app/lib/editor/planningMetadata.ts');
 let p=model.createProject('compact');for(let i=0;i<15;i++)p=ops.addCaption(p,'Exact caption '+i,i*.55,.5);
 const ids=Object.keys(p.clips);p={...p,tracks:{...p.tracks,'track-caption':{...p.tracks['track-caption'],locked:true}},clips:{...p.clips,[ids[1]]:{...p.clips[ids[1]],transform:{...model.defaultTransform,scale:1.25},effects:{brightness:12,contrast:0,saturation:0,blur:0}}}};
 const before=JSON.stringify(p),m=planningMetadata(p);assert.equal(JSON.stringify(p),before);assert.ok(JSON.stringify(m).length<before.length*.65);assert.equal(Object.keys(m.styles).length,1);
 for(const id of ids){const a=p.clips[id],b=m.clips[id];assert.equal(b.startTime,a.startTime);assert.equal(b.sourceStart,a.sourceStart);assert.equal(b.duration,a.duration);assert.equal(m.captions[a.contentId].text,p.captions[a.contentId].text);assert.equal(m.styles[m.captions[a.contentId].styleId].font,p.captions[a.contentId].style.font);}
 assert.equal(m.tracks['track-caption'].locked,true);assert.equal(m.clips[ids[0]].transform.y,p.clips[ids[0]].transform.y);assert.equal(m.defaults.transform.scale,1);assert.equal(m.clips[ids[1]].transform.scale,1.25);assert.equal(m.clips[ids[1]].effects.brightness,12);
});
