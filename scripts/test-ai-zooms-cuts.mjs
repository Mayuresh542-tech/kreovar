import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json")), ts = require("typescript");
// Compile the real source in memory; mock only external auth/provider calls.
function loader(mocks = {}) {
 mocks={"app/lib/server/planUsage.ts":{withUsage:h=>h},...mocks};
  mocks = { "app/lib/server/projectAccess.ts":{requireOwnedProject:async()=>{}},"app/lib/server/editorAiCatalog.ts":{loadAiCatalog:async()=>[]}, "app/lib/supabase.ts": { supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }, ...mocks };
  const cache = new Map();
  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) filename += ".ts";
    const key = path.relative(root, filename).replaceAll("\\", "/");
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} }; cache.set(filename, loadedModule);
    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll("import.meta.url",JSON.stringify(pathToFileURL(filename).href));
    const localRequire = specifier => Object.hasOwn(mocks,specifier)?mocks[specifier]:specifier.startsWith("@/") ? load(specifier.slice(2)) : specifier.startsWith(".") ? load(path.relative(root, path.resolve(path.dirname(filename), specifier))) : require(specifier);
    new vm.Script(`(function(require,module,exports){${source}\n})`, { filename }).runInThisContext()(localRequire, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return load;
}
const load=loader(),model=load('app/lib/editor/model.ts'),op=load('app/lib/editor/operations.ts'),zoom=load('app/lib/editor/zoom.ts'),cuts=load('app/lib/editor/rippleCut.ts'),ai=load('app/lib/editor/ai.ts'),validation=load('app/lib/editor/aiValidation.ts');
function footage(){
 let p=model.createProject('motion-test');
 p=op.addAsset(p,{id:'video',name:'Clip',kind:'video',mime:'video/mp4',size:100,duration:10,width:1920,height:1080});
 return op.addClip(p,'video','track-video',0,{id:'v'});
}
function fullTimeline(){
 let p=footage();
 p=op.addAsset(p,{id:'audio',name:'Speech',kind:'audio',mime:'audio/wav',size:100,duration:10,width:0,height:0});
 p=op.addClip(p,'audio','track-audio',0,{id:'a'});
 const words=Array.from({length:10},(_,i)=>({word:String(i),start:i+.1,end:i+.8}));
 return op.addCaption(p,words.map(w=>w.word).join(' '),0,10,{},words);
}
const sorted=(p,track)=>p.tracks[track].clipIds.map(id=>p.clips[id]).sort((a,b)=>a.startTime-b.startTime);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' != '+b);
test('smooth zoom renders exact endpoints, midpoint and hold without modifying original framing or sound',()=>{
 const p=footage(),next=zoom.addZoom(p,'v',2,6,1,1.2),c=next.clips.v;
 assert.equal(p.clips.v.zooms,undefined);near(zoom.zoomTransform(c,1).scale,1);near(zoom.zoomTransform(c,2).scale,1);near(zoom.zoomTransform(c,4).scale,1.1);near(zoom.zoomTransform(c,6).scale,1.2);near(zoom.zoomTransform(c,9).scale,1.2);
 assert.equal(c.volume,1);assert.equal(c.duration,10);assert.deepEqual(c.transform,p.clips.v.transform);
});
test('zoom pulse returns to its starting framing and respects a supplied focal point',()=>{
 const c=zoom.addZoom(footage(),'v',2,4,1,1.2,true,'smooth',.2,-.1).clips.v;
 near(zoom.zoomTransform(c,3).scale,1.2);near(zoom.zoomTransform(c,4).scale,1);near(zoom.zoomTransform(c,8).scale,1);near(zoom.zoomTransform(c,3).x,-.04);near(zoom.zoomTransform(c,3).y,.02);
});
test('animated zoom remains source-aligned after split, trim and movement',()=>{
 const p=zoom.addZoom(footage(),'v',1,9,1,1.2);
 const split=op.splitClip(p,'v',5),right=Object.values(split.clips).find(c=>c.id!=='v');
 near(zoom.zoomTransform(right,6).scale,zoom.zoomTransform(p.clips.v,6).scale);
 const moved=op.moveClip(split,right.id,8);
 near(zoom.zoomTransform(moved.clips[right.id],9).scale,zoom.zoomTransform(p.clips.v,6).scale);
 const trimmed=op.trimClip(p,'v','left',3);
 near(zoom.zoomTransform(trimmed.clips.v,4).scale,zoom.zoomTransform(p.clips.v,4).scale);
});
test('ripple cut removes original intervals once and keeps video, audio and captions synchronized',()=>{
 const p=fullTimeline(),original=JSON.stringify(p),next=cuts.rippleCut(p,[{start:2,end:3},{start:6,end:7}]);
 for(const track of ['track-video','track-audio','track-caption']){
  const rows=sorted(next,track);
  assert.deepEqual(rows.map(c=>[c.startTime,c.duration,c.sourceStart,c.sourceEnd]),[[0,2,0,2],[2,3,3,6],[5,3,7,10]]);
 }
 assert.deepEqual(sorted(next,'track-caption').map(c=>next.captions[c.contentId].text),['0 1','3 4 5','7 8 9']);
 near(model.projectDuration(next),8);assert.equal(JSON.stringify(p),original);
});
test('overlapping/unsorted cut ranges are merged rather than counted twice',()=>{
 const p=footage(),next=cuts.rippleCut(p,[{start:4,end:5},{start:2,end:4.5}]);
 near(model.projectDuration(next),7);
 assert.deepEqual(sorted(next,'track-video').map(c=>[c.startTime,c.sourceStart]),[[0,0],[2,5]]);
});
test('ripple cutting preserves source clock when footage has speed changes',()=>{
 let p=op.changeClipProperty(footage(),'v',{speed:2});
 p=cuts.rippleCut(p,[{start:1,end:2}]);
 const rows=sorted(p,'track-video');
 assert.deepEqual(rows.map(c=>[c.startTime,c.duration,c.sourceStart,c.sourceEnd]),[[0,1,0,2],[1,3,4,10]]);
});
test('locked affected tracks reject the whole cut atomically and unaffected locked tracks remain safe',()=>{
 let p=fullTimeline();p.tracks['track-audio'].locked=true;
 const {EditorStore}=load('app/lib/editor/store.ts'),store=new EditorStore(p);
 assert.throws(()=>store.execute(p=>cuts.rippleCut(p,[{start:2,end:3}])),/Unlock/);assert.equal(store.getSnapshot(),p);assert.equal(store.canUndo,false);
 p=footage();p.tracks['track-video'].locked=true;
 assert.throws(()=>zoom.addZoom(p,'v',0,2),/unlocked/);
});
test('unsafe cut ranges, whole-project deletion and subframe fragments are rejected',()=>{
 const p=footage();
 for(const ranges of [[],[{start:-1,end:2}],[{start:2,end:1}],[{start:0,end:10}],[{start:9,end:11}],[{start:NaN,end:2}]])assert.throws(()=>cuts.rippleCut(p,ranges));
 assert.throws(()=>zoom.addZoom(p,'v',9,11),/inside/);
 assert.throws(()=>zoom.addZoom(p,'v',1,2,1,4),/Invalid zoom/);
 assert.throws(()=>zoom.addZoom(zoom.addZoom(p,'v',1,4),'v',3,5),/overlap/);
});
test('cuts preserve existing zoom curves at retained source frames',()=>{
 const p=zoom.addZoom(footage(),'v',1,9,1,1.2),next=cuts.rippleCut(p,[{start:2,end:4}]),right=sorted(next,'track-video')[1];
 near(zoom.zoomTransform(right,3).scale,zoom.zoomTransform(p.clips.v,5).scale);
});
test('AI validation accepts supported cuts/zooms, preserves motion metadata, and rejects unsafe values',()=>{
 const p=fullTimeline(),result=validation.validateAiPlan({summary:'Subtle zoom and explicit cut',decisions:[{op:'addZoom',clipId:'v',startTime:1,endTime:5,fromScale:1,toScale:1.15},{op:'rippleCut',ranges:[{start:6,end:7}]}]},p);
 const next=ai.applyEditDecisionList(p,result.list),snapshot=validation.aiProjectSnapshot(next);
 assert.deepEqual(snapshot.clips.v.zooms,next.clips.v.zooms);
 assert.ok(Object.values(snapshot.captions).every(c=>c.words?.length));
 assert.throws(()=>validation.validateAiPlan({summary:'bad',decisions:[{op:'addZoom',clipId:'v',startTime:0,endTime:2,fromScale:1,toScale:Infinity}]},p));
});
test('preview and export compositor actually use animated transform at the requested frame',()=>{
 const {Compositor}=loader({'app/lib/editor/media.ts':{}})('app/lib/editor/compositor.ts');
 const p=zoom.addZoom(footage(),'v',0,4,1,1.2),scales=[],ctx={setTransform(){},fillRect(){},save(){},restore(){},translate(){},rotate(){},scale(x,y){scales.push([x,y]);},drawImage(){}};
 const compositor=new Compositor({});compositor.setFrame('v',{},1920,1080);
 const bounds=compositor.render({width:1920,height:1080,getContext:()=>ctx},p,2);
 near(scales[0][0],1.1);near(bounds[0].width,1920*1.1);
});
test('approved motion and cuts commit the reviewed IDs as one undoable transaction and persist on reopen',()=>{
 const {EditorStore}=load('app/lib/editor/store.ts'),{commitReviewedEdit}=load('app/lib/editor/reviewedEdit.ts'),{toLegacy,fromLegacy}=load('app/lib/editor/bridge.ts');
 const p=fullTimeline(),next=cuts.rippleCut(zoom.addZoom(p,'v',0,2),[{start:4,end:5}]),store=new EditorStore(p);
 commitReviewedEdit(store,p,next);
 assert.deepEqual(store.getSnapshot().clips,next.clips);
 assert.deepEqual(fromLegacy(JSON.parse(JSON.stringify(toLegacy(store.getSnapshot())))).clips,next.clips);
 store.undo();assert.deepEqual(store.getSnapshot().clips,p.clips);store.redo();assert.deepEqual(store.getSnapshot().clips,next.clips);
});
test('real caption-word evidence is mapped through source offsets, cut and speed for AI keyword edits',()=>{
 const {speechContext}=load('app/lib/editor/speechContext.ts');
 const p=cuts.rippleCut(fullTimeline(),[{start:2,end:3}]),context=speechContext(validation.aiProjectSnapshot(p));
 const right=context.find(c=>c.start===2);assert.equal(right.words[0].word,'3');near(right.words[0].start,2.1);near(right.words[0].end,2.8);
});
test('planner exposes supported motion/cut operations while retaining its two-request budget',async()=>{
 let count=0;
 const run=loader({'app/lib/server/radoxService.ts':{generateEditorJson:async opts=>{count++;assert.match(opts.systemInstruction,/op:"addZoom"/);assert.match(opts.systemInstruction,/op:"rippleCut"/);return{summary:'Explicit cut and zoom',decisions:[{op:'addZoom',clipId:'v',startTime:0,endTime:2,fromScale:1,toScale:1.12},{op:'rippleCut',ranges:[{start:5,end:6}]}],toolRequests:[]};}}});
 const result=await run('app/lib/server/editorAi.ts').planAiEdit(footage(),'Zoom in over the first 2 seconds and remove 5–6 seconds',[],'owner',new AbortController().signal);
 assert.equal(count,1);assert.equal(result.modelRequests,1);assert.equal(result.list.decisions.length,2);
});
