import assert from 'node:assert/strict';import {test} from 'node:test';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(root+'/package.json'),ts=require('typescript');
const cache=new Map();function load(relative){let file=path.resolve(root,relative);if(!path.extname(file))file+='.ts';if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new vm.Script('(function(require,module,exports){'+code+'\n})',{filename:file}).runInThisContext()(s=>s.startsWith('@/')?load(s.slice(2)):s.startsWith('.')?load(path.resolve(path.dirname(file),s)):require(s),{exports},exports);return exports;}
const brands=/groq|radox|elevenlabs|voice\.ai|openai|gemini|claude|qwen|gpt-oss|whisper|openrouter|nemotron|llama|pollinations/i;
test('public service errors and saved summaries remove internal brands without changing authored content',()=>{
 const messages=load('app/lib/serviceMessages');
 for(const text of ['Groq rejected this planning request.','RADOX_AUTH_FAILED','ElevenLabs API key missing','Speech model is disabled in Groq settings. Enable whisper-large-v3.','Google Gemini request failed','Voice.ai unavailable'])assert.equal(brands.test(messages.publicErrorMessage(text)),false,text);
 assert.equal(messages.publicServiceText('Groq · Qwen vision → GPT-OSS 120B. Add readable captions.'),'Add readable captions.');
 assert.equal(messages.publicErrorMessage('Unlock this track before editing.'),'Unlock this track before editing.');
 for(const key of ['groq','radox','gemini','voiceai','elevenlabs','openrouter','pollinations','remotion_render'])assert.equal(brands.test(messages.serviceLabel(key)),false);
});
test('safe error responses redact service names at every failure status and preserve wait/refund information',async()=>{
 const {NextRequest}=require('next/server'),safe=load('app/lib/server/safeResponse');
 for(const status of [400,429,502,503]){
  const response=await safe.withSafeResponse(async()=>Response.json({error:'Groq rejected this request.',code:'GROQ_REQUEST_REJECTED',retryAfterSeconds:12,refunded:true},{status,headers:{'Retry-After':'12'}}))(new NextRequest('http://localhost'));
  const body=await response.json();assert.equal(response.status,status);assert.equal(response.headers.get('retry-after'),'12');assert.equal(body.refunded,true);assert.equal(body.retryAfterSeconds,12);assert.equal(brands.test(JSON.stringify(body)),false);
 }
 const content={text:'An article about OpenAI and Gemini.'};const response=await safe.withSafeResponse(async()=>Response.json(content))(new NextRequest('http://localhost'));assert.deepEqual(await response.json(),content);
});
function source(){const m=load('app/lib/editor/model'),op=load('app/lib/editor/operations');let p=m.createProject('removal-test');p=op.addAsset(p,{id:'raw',libraryId:'private-original',name:'Original.mp4',kind:'video',mime:'video/mp4',size:1,duration:6,width:360,height:640});return p;}
test('removing unused project media is immutable and undo restores the canonical asset reference',()=>{
 const p=source(),before=JSON.stringify(p),{EditorStore}=load('app/lib/editor/store'),{removeProjectMedia}=load('app/lib/editor/projectMedia'),store=new EditorStore(p);
 store.execute(p=>removeProjectMedia(p,'raw'));assert.equal(store.getSnapshot().assets.raw,undefined);assert.equal(JSON.stringify(p),before);store.undo();assert.equal(store.getSnapshot().assets.raw.libraryId,'private-original');store.redo();assert.equal(store.getSnapshot().assets.raw,undefined);
});
test('used media requires explicit timeline removal; locked clips fail atomically and confirmed removal cleans transitions',()=>{
 const op=load('app/lib/editor/operations'),{removeProjectMedia}=load('app/lib/editor/projectMedia');let p=op.addClip(source(),'raw','track-video',0,{id:'a',duration:3,sourceEnd:3});p=op.addClip(p,'raw','track-video',3,{id:'b',duration:3,sourceEnd:3});p=op.addTransition(p,'a','b','fade',.2);const before=JSON.stringify(p);
 assert.throws(()=>removeProjectMedia(p,'raw'),/timeline/i);assert.equal(JSON.stringify(p),before);
 const locked={...p,tracks:{...p.tracks,'track-video':{...p.tracks['track-video'],locked:true}}};assert.throws(()=>removeProjectMedia(locked,'raw',true),/unlock/i);assert.equal(Object.keys(locked.clips).length,2);
 const next=removeProjectMedia(p,'raw',true);assert.equal(next.assets.raw,undefined);assert.equal(Object.keys(next.clips).length,0);assert.equal(Object.keys(next.transitions).length,0);assert.equal(next.tracks['track-video'].clipIds.length,0);assert.equal(JSON.stringify(p),before);
});

test('removed media stays removed when legacy project assets are merged again; explicit re-add clears its tombstone',()=>{
 const op=load('app/lib/editor/operations'),{removeProjectMedia}=load('app/lib/editor/projectMedia'),bridge=load('app/lib/editor/bridge'),p=source(),removed=removeProjectMedia(p,'raw');
 const restored=bridge.mergeProjectAssets(JSON.parse(JSON.stringify(removed)),{raw_footage:[{id:'raw',name:'Original.mp4',url:'/original.mp4',duration:6}]});assert.equal(restored.assets.raw,undefined);
 const added=op.addAsset(removed,p.assets.raw);assert.equal(added.assets.raw.libraryId,'private-original');assert.equal(added.removedProjectAssetIds.includes('raw'),false);
});

