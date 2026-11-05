import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(path.join(root,'package.json')),ts=require('typescript'),cache=new Map();
function load(relative){let filename=path.resolve(root,relative);if(!path.extname(filename))filename+='.ts';if(cache.has(filename))return cache.get(filename).exports;const m={exports:{}};cache.set(filename,m);const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(filename).href));new vm.Script(`(function(require,module,exports){${code}\n})`,{filename}).runInThisContext()(s=>s.startsWith('@/')?load(s.slice(2)):s.startsWith('.')?load(path.resolve(path.dirname(filename),s)):require(s),m,m.exports);return m.exports;}
const visual=load('app/lib/editor/visualTreatment'),model=load('app/lib/editor/model'),op=load('app/lib/editor/operations');
function source(){let p=model.createProject('effects-continuity');p=op.addAsset(p,{id:'video',kind:'video',mime:'video/mp4',name:'Owned',duration:10,width:720,height:1280,size:1});p=op.addClip(p,'video','track-video',0,{id:'main'});return p;}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} ~= ${b}`);

test('visual presentation rejects unknown and empty treatment, card, range, edge and RGB fields',()=>{
 for(const input of [{unexpected:true},{card:{width:.8,unexpected:1}},{effects:[]},{effects:[{sourceStart:0,sourceEnd:1}]},{effects:[{sourceStart:0,sourceEnd:1,chromaticOffset:8}]},{entrance:{sourceDuration:.2}},{exit:{sourceDuration:.2,blur:3,unexpected:1}},{effects:[{sourceStart:0,sourceEnd:1,rgbOffset:{x:25,y:0}}]},{effects:[{sourceStart:0,sourceEnd:1,rgbOffset:{x:2,y:0,code:'x'}}]}])assert.throws(()=>visual.readVisualTreatment(input),JSON.stringify(input));
});
test('mask schemas accept only bounded native geometry and unique source-clock frames',()=>{
 for(const mask of [{kind:'circle'},{kind:'rounded-rect',radius:.2},{kind:'polygon',points:[{x:0,y:0},{x:1,y:0},{x:.5,y:1}]},{kind:'stepped',steps:5,direction:'up'},{kind:'torn-paper',seed:42,roughness:.07,keyframes:[{sourceTime:1,progress:0},{sourceTime:2,progress:1,easing:'smooth'}]}])assert.equal(visual.readVisualTreatment({mask}).mask.kind,mask.kind);
 for(const mask of [{kind:'svg',path:'x'},{kind:'circle',progress:1.1},{kind:'circle',radius:.2},{kind:'polygon',points:[{x:0,y:0},{x:1,y:1}]},{kind:'polygon',points:[{x:0,y:0},{x:1,y:1},{x:0,y:1},{x:1,y:0}]},{kind:'stepped',steps:20},{kind:'torn-paper',seed:-1},{kind:'torn-paper',roughness:.5},{kind:'circle',keyframes:[]},{kind:'circle',keyframes:[{sourceTime:1,progress:0},{sourceTime:1,progress:1}]},{kind:'circle',keyframes:[{sourceTime:-1,progress:0}]},{kind:'circle',keyframes:[{sourceTime:0,progress:0,easing:'code'}]}])assert.throws(()=>visual.readVisualTreatment({mask}),JSON.stringify(mask));
});
test('mask progress uses the media source clock after move, trim and speed changes',()=>{
 const {maskProgressAt}=load('app/lib/editor/visualMasks');const p=source(),treatment=visual.readVisualTreatment({mask:{kind:'circle',keyframes:[{sourceTime:2,progress:0},{sourceTime:6,progress:1,easing:'smooth'}]}}),c={...p.clips.main,visualTreatment:treatment};
 close(maskProgressAt(treatment.mask,4),.5);close(maskProgressAt(treatment.mask,-1),0);close(maskProgressAt(treatment.mask,9),1);
 const moved={...c,startTime:10,speed:2};const sourceClock=moved.sourceStart+(12-moved.startTime)*moved.speed;close(maskProgressAt(treatment.mask,sourceClock),.5);
 const next=op.trimClip({...p,clips:{main:c}},'main','left',3);assert.deepEqual(next.clips.main.visualTreatment.mask,treatment.mask);assert.doesNotThrow(()=>visual.setVisualTreatment(next,'main',next.clips.main.visualTreatment));
 assert.throws(()=>visual.setVisualTreatment(p,'main',{mask:{kind:'circle',keyframes:[{sourceTime:11,progress:0}]}}));
});
test('split and trim retain authored effect ramps and edge clocks, and remain AI-snapshot valid',()=>{
 let p=source();p=visual.setVisualTreatment(p,'main',{effects:[{sourceStart:2,sourceEnd:8,rampIn:2,rampOut:2,blur:20,rgbOffset:{x:8,y:-4}}],entrance:{sourceDuration:2,blur:12},exit:{sourceDuration:2,blur:10},mask:{kind:'circle',keyframes:[{sourceTime:0,progress:0},{sourceTime:2,progress:1}]}});
 const before=visual.visualTreatmentAt(p.clips.main,3),trimmed=op.trimClip(p,'main','left',3);assert.deepEqual(visual.visualTreatmentAt(trimmed.clips.main,3),before);assert.doesNotThrow(()=>visual.setVisualTreatment(trimmed,'main',trimmed.clips.main.visualTreatment));
 const split=op.splitClip(p,'main',3),right=Object.values(split.clips).find(c=>c.id!=='main');assert.deepEqual(visual.visualTreatmentAt(right,3),before);assert.equal(visual.visualTreatmentAt(split.clips.main,2.5).blur,visual.visualTreatmentAt(p.clips.main,2.5).blur);
 for(const c of Object.values(split.clips))assert.doesNotThrow(()=>visual.setVisualTreatment(split,c.id,c.visualTreatment));
 assert.doesNotThrow(()=>load('app/lib/editor/aiValidation').aiProjectSnapshot(split));
 const shortened=op.trimClip(p,'main','right',5);assert.deepEqual(visual.visualTreatmentAt(shortened.clips.main,4.5),visual.visualTreatmentAt(p.clips.main,4.5));
 // Old saved clips had unanchored edges; editing must capture their original anchors first.
 const legacy=source();legacy.clips.main.visualTreatment={entrance:{sourceDuration:2,blur:12},exit:{sourceDuration:2,blur:10}};
 const cut=op.splitClip(legacy,'main',3),legacyRight=Object.values(cut.clips).find(c=>c.id!=='main');assert.equal(visual.visualTreatmentAt(legacyRight,3).blur,0);assert.equal(visual.visualTreatmentAt(cut.clips.main,2.5).blur,0);
});
function commands(){const calls=[];return {calls,ctx:new Proxy({}, {get:(_,key)=>(...values)=>calls.push([key,...values]),set:()=>true})};}
test('circle clips real media with a source-timed radius, and neutral legacy drawing stays unclipped',()=>{
 const c=commands(),image={owned:true};const bounds=visual.drawVisualMedia(c.ctx,image,400,400,720,1280,{mask:{kind:'circle',keyframes:[{sourceTime:0,progress:0},{sourceTime:2,progress:1,easing:'linear'}]}},1);
 assert.deepEqual(bounds,{width:720,height:720});assert.ok(c.calls.some(v=>v[0]==='arc'&&v[3]===180));assert.equal(c.calls.filter(v=>v[0]==='clip').length,1);assert.ok(c.calls.some(v=>v[0]==='drawImage'&&v[1]===image));
 const legacy=commands();visual.drawVisualMedia(legacy.ctx,image,400,400,720,1280);assert.equal(legacy.calls.some(v=>v[0]==='clip'),false);
});
test('seeded paper and stepped reveal paths are stable, bounded, distinct and complete at endpoints',()=>{
 const {maskRevealPolygon}=load('app/lib/editor/visualMasks');const paper={kind:'torn-paper',seed:37,roughness:.08,direction:'left'},a=maskRevealPolygon(paper,.5),b=maskRevealPolygon(paper,.5);assert.deepEqual(a,b);assert.notDeepEqual(a,maskRevealPolygon({...paper,seed:38},.5));
 for(const mask of [paper,{kind:'stepped',steps:6,direction:'right'},{kind:'torn-paper',seed:4,direction:'up'}]){
  for(const p of maskRevealPolygon(mask,.5))assert.ok(p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);
  const full=maskRevealPolygon(mask,1);assert.ok(full.some(p=>p.x===0&&p.y===0));assert.ok(full.some(p=>p.x===1&&p.y===1));
 }
 const stepped=maskRevealPolygon({kind:'stepped',steps:5},.5);assert.ok(new Set(stepped.map(p=>p.x)).size>=4);
});
test('RGB offsets ramp on the same source clock and preserve neutral legacy effect values',()=>{
 const p=source();p.clips.main.visualTreatment=visual.readVisualTreatment({effects:[{sourceStart:2,sourceEnd:6,rampIn:1,rampOut:1,rgbOffset:{x:10,y:-6}}]});assert.deepEqual(visual.visualTreatmentAt(p.clips.main,2.5).rgbOffset,{x:5,y:-3});assert.deepEqual(visual.visualTreatmentAt(p.clips.main,3).rgbOffset,{x:10,y:-6});assert.equal(visual.visualTreatmentAt(p.clips.main,7).rgbOffset,undefined);
});
test('RGB pixel separation retains real channels, handles transparent edges and is identity at zero',()=>{
 const {shiftRgbPixels}=load('app/lib/editor/chromatic');const pixels=new Uint8ClampedArray([0,0,0,0,100,150,200,255,0,0,0,0]);assert.deepEqual(shiftRgbPixels(pixels,3,1,0,0),pixels);
 const shifted=shiftRgbPixels(pixels,3,1,1,0);assert.deepEqual(Array.from(shifted),[0,0,200,255,0,150,0,255,100,0,0,255]);
 const semi=new Uint8ClampedArray([50,90,120,128,0,0,0,0]);const moved=shiftRgbPixels(semi,2,1,1,0);assert.equal(moved[3],128);assert.equal(moved[7],128);assert.equal(moved[4],50);
});
