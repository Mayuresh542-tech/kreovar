import assert from 'node:assert/strict';import {test} from 'node:test';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {createRequire} from 'node:module';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(path.join(root,'package.json')),ts=require('typescript'),cache=new Map();
function load(relative){let filename=path.resolve(root,relative);if(!path.extname(filename))filename+='.ts';if(cache.has(filename))return cache.get(filename).exports;const m={exports:{}};cache.set(filename,m);const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(filename).href));new vm.Script(`(function(require,module,exports){${code}\n})`,{filename}).runInThisContext()(s=>s.startsWith('@/')?load(s.slice(2)):s.startsWith('.')?load(path.resolve(path.dirname(filename),s)):require(s),m,m.exports);return m.exports;}
const visual=load('app/lib/editor/visualTreatment'),model=load('app/lib/editor/model'),op=load('app/lib/editor/operations');
function clip(){return {id:'v',startTime:10,sourceStart:4,sourceEnd:12,duration:4,speed:2,transform:{...model.defaultTransform}};}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ~= ${b}`);

test('source-clock visual effect ramps survive clip moves and playback speed changes',()=>{
 const c={...clip(),visualTreatment:visual.readVisualTreatment({effects:[{sourceStart:5,sourceEnd:9,rampIn:1,rampOut:1,blur:20,scale:1.2,opacity:.8}]})};
 assert.equal(visual.visualTreatmentAt(c,10).blur,0);close(visual.visualTreatmentAt(c,10.75).blur,10);close(visual.visualTreatmentAt(c,11.5).blur,20);close(visual.visualTreatmentAt(c,12.25).blur,10);assert.equal(visual.visualTreatmentAt(c,12.5).blur,0);
 const moved={...c,startTime:20};assert.deepEqual(visual.visualTreatmentAt(moved,21.5),visual.visualTreatmentAt(c,11.5));const slower={...c,speed:1,duration:8};assert.deepEqual(visual.visualTreatmentAt(slower,13),visual.visualTreatmentAt(c,11.5));
});
test('entrance and exit operate within trimmed source boundaries and keep neutral readable holds',()=>{
 const c={...clip(),visualTreatment:visual.readVisualTreatment({entrance:{sourceDuration:1,blur:16,scale:1.15,opacity:0},exit:{sourceDuration:1,blur:12,scale:.9,opacity:0}})};
 assert.deepEqual(visual.visualTreatmentAt(c,10),{blur:16,scale:1.15,opacity:0});assert.deepEqual(visual.visualTreatmentAt(c,11),{blur:0,scale:1,opacity:1});assert.deepEqual(visual.visualTreatmentAt(c,14),{blur:12,scale:.9,opacity:0});
 const trimmed={...c,sourceStart:6,startTime:11,duration:3};assert.equal(visual.visualTreatmentAt(trimmed,11).blur,16);assert.equal(visual.visualTreatmentAt(trimmed,12).blur,0);
});
test('invalid effect ranges, unsupported card fields, overlapping intervals and unreasonable sizes are rejected',()=>{
 for(const value of [{},{card:{width:0}},{card:{width:.8,height:2}},{card:{width:.8,background:'url(private)'}},{effects:Array(13).fill({sourceStart:0,sourceEnd:1,blur:2})},{effects:[{sourceStart:2,sourceEnd:1,blur:4}]},{effects:[{sourceStart:1,sourceEnd:2,rampIn:1,rampOut:1,blur:4}]},{effects:[{sourceStart:1,sourceEnd:3},{sourceStart:2,sourceEnd:4}]},{entrance:{sourceDuration:0,blur:24}},{effects:[{sourceStart:1,sourceEnd:2,blur:25}]}])assert.throws(()=>visual.readVisualTreatment(value));
 assert.deepEqual(visual.readVisualTreatment({card:{width:.8,height:.45,unknown:'discard'},untrusted:'ignored'}),{card:{width:.8,height:.45}});
});
function commands(){const calls=[],properties=[];return {calls,properties,ctx:new Proxy({}, {get:(_,key)=>(...values)=>calls.push([key,...values]),set:(_,key,value)=>(properties.push([key,value]),true)})};}
test('a real square media card clips the actual source, preserves its crop and draws a bounded shadow',()=>{
 const {ctx,calls,properties}=commands(),image={source:'owned'},bounds=visual.drawVisualMedia(ctx,image,1920,1080,1080,1920,visual.readVisualTreatment({card:{width:.8,height:.45,radius:12,shadow:18,fit:'cover'}}));
 assert.deepEqual(bounds,{width:864,height:864});assert.equal(calls.filter(c=>c[0]==='clip').length,1);assert.ok(calls.some(c=>c[0]==='roundRect'&&c[3]===864&&c[4]===864));const draw=calls.find(c=>c[0]==='drawImage');assert.equal(draw[1],image);assert.equal(draw[5],864);assert.equal(draw[4],1536);assert.ok(properties.some(p=>p[0]==='shadowBlur'&&p[1]===27));
});
test('contain framing preserves source aspect without cropping and ordinary clips retain previous fit behavior',()=>{
 const image={};let c=commands();visual.drawVisualMedia(c.ctx,image,1920,1080,1080,1920,{card:{width:.8,height:.45,fit:'contain'}});const draw=c.calls.find(x=>x[0]==='drawImage');assert.equal(draw[4],864);assert.equal(draw[5],486);
 c=commands();const plain=visual.drawVisualMedia(c.ctx,image,1920,1080,1080,1920);assert.deepEqual(plain,{width:1080,height:607.5});assert.equal(c.calls.some(x=>x[0]==='clip'),false);
});
test('shared compositor applies animated blur and scale to real media frames in deterministic preview/export draw order',()=>{
 cache.set(path.resolve(root,'app/lib/editor/media.ts'),{exports:{waitMedia:async()=>{}}});const {Compositor}=load('app/lib/editor/compositor');let p=model.createProject('visual-engine');p.settings.aspectRatio='9:16';p=op.addAsset(p,{id:'source',kind:'video',mime:'video/mp4',name:'Owned',duration:10,width:1080,height:1920,size:1});p=op.addClip(p,'source','track-video',0,{id:'main'});p.clips.main.visualTreatment=visual.readVisualTreatment({effects:[{sourceStart:1,sourceEnd:5,rampIn:.5,rampOut:.5,blur:18,scale:1.1}]});
 p=op.addAsset(p,{id:'photo',kind:'image',mime:'image/jpeg',name:'Owned card',duration:10,width:1200,height:1200,size:1});p=op.addClip(p,'photo','track-overlay',2,{id:'card',duration:3,sourceEnd:3});p.clips.card.visualTreatment=visual.readVisualTreatment({card:{width:.8,height:.45,radius:10,shadow:16},entrance:{sourceDuration:.3,blur:12,scale:.9,opacity:0}});
 const render=()=>{const out=commands(),compositor=new Compositor({});compositor.setFrame('main',{id:'main'},1080,1920);compositor.setFrame('card',{id:'card'},1200,1200);const bounds=compositor.render({width:540,height:960,getContext:()=>out.ctx},p,3);return {...out,bounds};};const a=render(),b=render();assert.deepEqual(a.calls,b.calls);assert.deepEqual(a.properties,b.properties);assert.ok(a.properties.some(p=>p[0]==='filter'&&p[1].includes('blur(18px)')));assert.ok(a.calls.some(c=>c[0]==='scale'&&c[1]===1.1));assert.deepEqual(a.bounds.map(b=>b.id),['main','card']);assert.equal(a.bounds[1].width,864);assert.equal(a.calls.filter(c=>c[0]==='drawImage').length,2);
});
