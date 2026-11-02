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
const load=loader(),model=load('app/lib/editor/model.ts'),op=load('app/lib/editor/operations.ts'),layout=load('app/lib/editor/textLayout.ts'),placement=load('app/lib/editor/textPlacement.ts'),gradient=load('app/lib/editor/textGradient.ts'),validation=load('app/lib/editor/aiValidation.ts'),ai=load('app/lib/editor/ai.ts');
const textClip=(p)=>Object.values(p.clips).find(c=>c.contentId);
function title(p,text,time=0){return op.addText(p,text,time);}
test('long words and multilingual text wrap to the measured width without deleting source characters',()=>{
 for(const text of ['Supercalifragilisticexpialidocious','यहबहुतलंबाहिन्दीशब्दहै','शानदार captions 👨‍👩‍👦 for everyone']){
  const lines=layout.wrapText(text,60,s=>Array.from(s).length*10);
  assert.ok(lines.length>1);assert.equal(lines.join('').replaceAll(' ',''),text.replaceAll(' ',''));
 }
});
test('new title placements avoid time-overlapping manual captions and keep the manual placement unchanged',()=>{
 let p=model.createProject('overlap');p=op.addCaption(p,'Manual caption',0,3);const existing=textClip(p),before=JSON.stringify(existing);
 p=title(p,'An opening title');const id=Object.keys(p.clips).find(id=>id!==existing.id);
 // Existing caption moved to the title centre manually.
 p=op.changeClipProperty(p,existing.id,{transform:{...existing.transform,y:0}});
 const manual=JSON.stringify(p.clips[existing.id]);p=placement.applyTextPlacement(p,[id],'title-center');
 assert.notEqual(p.clips[id].transform.y,0);assert.equal(JSON.stringify(p.clips[existing.id]),manual);
 assert.ok(before.length>0);
});
test('safe placements stay inside margins across every supported aspect ratio',()=>{
 for(const aspectRatio of model.aspectRatios){
  let p=model.createProject('ratio');p.settings.aspectRatio=aspectRatio;p=title(p,'A clear readable title with enough words to wrap');
  const id=textClip(p).id;p=placement.applyTextPlacement(p,[id],'hook-top');
  const c=p.clips[id],b=layout.textBounds(p,c,p.textLayers[c.contentId]),[w,h]=model.dimensions[aspectRatio];
  assert.ok(b.left>=w*.08-1e-6&&b.right<=w*.92+1e-6);assert.ok(b.top>=h*.08-1e-6&&b.bottom<=h*.86+1e-6);
  assert.equal(p.textLayers[c.contentId].text,'A clear readable title with enough words to wrap');
 }
});
test('caption placementId survives validation and actually places the generated caption at the requested preset',()=>{
 const p=model.createProject('caption-position');
 const plan=validation.validateAiPlan({summary:'Place caption at the top',decisions:[{op:'addCaption',text:'Exact words',startTime:0,duration:2,placementId:'hook-top'}]},p);
 assert.equal(plan.list.decisions[0].placementId,'hook-top');
 const next=ai.applyEditDecisionList(p,plan.list),c=textClip(next);assert.equal(c.transform.y,-.28);assert.equal(next.captions[c.contentId].text,'Exact words');
});
test('new AI text uses safe defaults and respects locked-track rejection without partial changes',()=>{
 const p=model.createProject('default');
 const next=ai.applyEditDecisionList(p,validation.validateAiPlan({summary:'A title',decisions:[{op:'addText',text:'Hello',startTime:0}]},p).list),c=textClip(next);
 assert.equal(next.textLayers[c.contentId].style.maxWidth,.78);
 next.tracks['track-text'].locked=true;const original=JSON.stringify(next);
 assert.throws(()=>placement.applyTextPlacement(next,[c.id],'hook-top'),/Unlock/);assert.equal(JSON.stringify(next),original);
});
test('text that cannot fit at a readable size fails clearly instead of silently truncating',()=>{
 let p=model.createProject('long');p=title(p,'Too much text '.repeat(400));
 assert.throws(()=>placement.applyTextPlacement(p,[textClip(p).id],'caption-safe'),/too long/);
});
test('gradient input validation rejects unsafe colours, invalid stop order, NaN and unsupported angles',()=>{
 for(const value of [{angle:NaN,stops:[]},{angle:400,stops:[]},{angle:0,stops:[{offset:0,color:'url(evil)'},{offset:1,color:'#ffffff'}]},{angle:0,stops:[{offset:1,color:'#000000'},{offset:0,color:'#ffffff'}]}])assert.throws(()=>gradient.readTextGradient(value));
 assert.equal(gradient.readTextGradient(null),null);assert.equal(gradient.readTextGradient(gradient.TEXT_GRADIENTS[0]).stops.length,2);
});
test('AI gradient edits preserve exact caption text, word timing, position and one-step undo',()=>{
 const {EditorStore}=load('app/lib/editor/store.ts');
 let p=model.createProject('colour');p=op.addCaption(p,'Exact words',0,2,{},[{word:'Exact',start:0,end:1},{word:'words',start:1,end:2}]);
 const c=textClip(p),g=gradient.readTextGradient(gradient.TEXT_GRADIENTS[1]),store=new EditorStore(p);
 const plan=validation.validateAiPlan({summary:'Colour only',decisions:[{op:'changeText',clipId:c.id,text:'Exact words',style:{gradient:g}}]},p);
 store.execute(p=>ai.applyEditDecisionList(p,plan.list));
 const next=store.getSnapshot(),caption=next.captions[c.contentId];assert.deepEqual(caption.words,p.captions[c.contentId].words);assert.deepEqual(next.clips[c.id].transform,p.clips[c.id].transform);
 assert.deepEqual(validation.aiProjectSnapshot(next).captions[c.contentId].style.gradient,g);
 assert.deepEqual(JSON.parse(JSON.stringify(next)).captions[c.contentId].style.gradient,g);
 store.undo();assert.deepEqual(store.getSnapshot().captions,p.captions);store.redo();assert.deepEqual(store.getSnapshot().captions[c.contentId].style.gradient,g);
});
test('gradient direction is measured across the text box and solid colour remains a real fallback',()=>{
 const calls=[],fill={addColorStop:(offset,color)=>calls.push({offset,color})},ctx={createLinearGradient:(...points)=>{calls.push(points);return fill;}};
 const g={angle:0,stops:[{offset:0,color:'#ff0000'},{offset:1,color:'#0000ff'}]};
 assert.equal(gradient.textFill(ctx,g,'#ffffff',200,100),fill);assert.deepEqual(calls[0].map(n=>n||0),[-100,0,100,0]);assert.equal(calls.length,3);
 assert.equal(gradient.textFill(ctx,null,'#123456',200,100),'#123456');
});
test('production compositor paints a real text gradient and honours the requested line width',()=>{
 const {Compositor}=loader({'app/lib/editor/media.ts':{}})('app/lib/editor/compositor.ts');
 let p=model.createProject('render');p=title(p,'A gradient title');const c=textClip(p);
 p=op.changeText(p,c.id,'A gradient title',{gradient:gradient.readTextGradient(gradient.TEXT_GRADIENTS[0]),maxWidth:.5});
 const stops=[],ctx={setTransform(){},fillRect(){},save(){},restore(){},translate(){},rotate(){},scale(){},fillText(){},strokeText(){},measureText:s=>({width:s.length*35}),createLinearGradient:()=>({addColorStop:(...v)=>stops.push(v)})};
 const bounds=new Compositor({}).render({width:1920,height:1080,getContext:()=>ctx},p,0);
 assert.equal(stops.length,2);assert.equal(bounds[0].width,960);
});
test('explicit AI title size and alignment are preserved when safely fitting',()=>{
 const p=model.createProject('explicit');
 const next=ai.applyEditDecisionList(p,validation.validateAiPlan({summary:'Title',decisions:[{op:'addText',text:'Hi',startTime:0,style:{size:120,align:'right'}}]},p).list);
 const c=textClip(next),style=next.textLayers[c.contentId].style;assert.equal(style.size,120);assert.equal(style.align,'right');
});
test('AI template restyling preserves manually positioned captions',()=>{
 let p=model.createProject('manual');p=op.addCaption(p,'Keep here',0,2);
 const c=textClip(p);p=op.changeClipProperty(p,c.id,{transform:{...c.transform,x:.1,y:-.2}});
 const {DEFAULT_CAPTION_TEMPLATES}=load('app/lib/captions/templates.ts');
 const next=ai.applyEditDecisionList(p,validation.validateAiPlan({summary:'Style only',decisions:[{op:'applyCaptionTemplate',clipIds:[c.id],templateId:DEFAULT_CAPTION_TEMPLATES[0].id}]},p).list);
 assert.deepEqual(next.clips[c.id].transform,p.clips[c.id].transform);assert.equal(next.captions[c.contentId].text,'Keep here');
});


test('font-pair captions survive AI validation, preserve word timings and positions, and undo in one step',()=>{
 const {EditorStore}=load('app/lib/editor/store.ts');
 let p=model.createProject('paired');p=op.addCaption(p,'Make this matter',0,3,{},[{word:'Make',start:0,end:1},{word:'this',start:1,end:2},{word:'matter',start:2,end:3}]);const c=textClip(p);
 p=op.changeClipProperty(p,c.id,{transform:{...c.transform,x:.08,y:.2}});const store=new EditorStore(p);
 const plan=validation.validateAiPlan({summary:'Use Signature Pop',decisions:[{op:'applyCaptionTemplate',clipIds:[c.id],templateId:'signature-poppins'}]},p);
 store.execute(p=>ai.applyEditDecisionList(p,plan.list));let next=store.getSnapshot();
 assert.equal(next.captions[c.contentId].style.font,'Poppins');assert.equal(next.captions[c.contentId].style.fontAccent.font,'Caveat');
 assert.deepEqual(next.captions[c.contentId].words,p.captions[c.contentId].words);assert.deepEqual(next.clips[c.id].transform,p.clips[c.id].transform);
 assert.equal(validation.aiProjectSnapshot(JSON.parse(JSON.stringify(next))).captions[c.contentId].style.fontAccent.font,'Caveat');
 store.undo();assert.deepEqual(store.getSnapshot().captions,p.captions);store.redo();next=store.getSnapshot();
 const solid=ai.applyEditDecisionList(next,validation.validateAiPlan({summary:'Clean',decisions:[{op:'applyCaptionTemplate',clipIds:[c.id],templateId:'clean-sub'}]},next).list);
 assert.equal(solid.captions[c.contentId].style.fontAccent,null);assert.deepEqual(solid.captions[c.contentId].words,p.captions[c.contentId].words);
 next.tracks['track-caption'].locked=true;assert.throws(()=>ai.applyEditDecisionList(next,validation.validateAiPlan({summary:'Locked',decisions:[{op:'applyCaptionTemplate',clipIds:[c.id],templateId:'dancing-poppins'}]},next).list));
});
test('actual standalone and editor renderers use both fonts with a stable final-word accent',()=>{
 const {drawCaptions}=load('app/lib/captions/canvasCaptions.ts'),{FONT_PAIR_CAPTION_TEMPLATES}=load('app/lib/captions/templates.ts');
 const {Compositor}=loader({'app/lib/editor/media.ts':{}})('app/lib/editor/compositor.ts');
 for(const template of FONT_PAIR_CAPTION_TEMPLATES){
  const paints=[],stack=[],ctx={setTransform(){},fillRect(){},save(){stack.push({font:this.font});},restore(){Object.assign(this,stack.pop());},translate(){},rotate(){},scale(){},strokeText(){},fillText(text){paints.push({text,font:this.font});},measureText(text){return {width:text.length*(this.font?.includes('Caveat')?22:17)};}};
  const seg={id:'s',text:'Make this matter',start:0,end:3,words:[{word:'Make',start:0,end:1},{word:'this',start:1,end:2},{word:'matter',start:2,end:3}]};
  for(const time of [.4,2.4]){paints.length=0;drawCaptions(ctx,[seg],template.style,time,720,1280);assert.ok(paints.find(p=>p.text==='Make').font.includes(template.style.fontFamily.split(',')[0]));assert.ok(paints.find(p=>p.text==='matter').font.includes(template.style.fontAccent.font));}
  let p=model.createProject('canvas');p=op.addCaption(p,seg.text,0,3,{},seg.words);const c=textClip(p);p=load('app/lib/editor/captionTemplates.ts').applyCaptionTemplate(p,[c.id],template);paints.length=0;
  new Compositor({}).render({width:1920,height:1080,getContext:()=>ctx},p,.4);
  assert.ok(paints.find(p=>p.text==='Make').font.includes(p.captions[c.contentId].style.font));assert.ok(paints.find(p=>p.text==='matter').font.includes(template.style.fontAccent.font));
 }
});
test('mixed-font wrapping measures the accent font and keeps revealed words in the base font until the final word',()=>{
 const {mixedTextLines}=load('app/lib/captions/typography.ts');const ctx={measureText(text){return {width:text.length*(this.font.includes('Caveat')?24:10)};}};
 const {rows}=mixedTextLines(ctx,'Make this matter',36,'Poppins',600,{font:'Caveat',weight:700},180,3);
 assert.ok(rows.length>1);assert.equal(rows.flat().map(r=>r.text).join(' '),'Make this matter');assert.ok(rows.every(row=>row.reduce((n,r)=>n+r.width,0)+(row.length-1)*10<=180));
 const reveal=mixedTextLines(ctx,'Make this',36,'Poppins',600,{font:'Caveat',weight:700},500,4,3);assert.ok(reveal.rows.flat().every(r=>!r.font.includes('Caveat')));
});
test('font loading waits for both the base and calligraphy font before export can proceed',async()=>{
 const {loadCaptionFonts}=load('app/lib/captions/typography.ts');const before=globalThis.document,requested=[];let complete;
 globalThis.document={fonts:{load:spec=>{requested.push(spec);return spec.includes('Caveat')?new Promise(resolve=>complete=resolve):Promise.resolve([]);},ready:Promise.resolve()}};
 try{let done=false;const task=loadCaptionFonts('Poppins',600,38,{font:'Caveat',weight:700}).then(()=>done=true);await Promise.resolve();assert.equal(done,false);assert.equal(requested.length,2);complete([]);await task;assert.equal(done,true);}finally{globalThis.document=before;}
});
test('AI receives font-pair metadata and restyles existing captions in one planning request without retranscribing',async()=>{
 let calls=0,seen;let p=model.createProject('provider');p=op.addCaption(p,'Exact spoken words',0,2);const c=textClip(p);
 const provider=loader({'app/lib/server/radoxService.ts':{generateEditorJson:async options=>{calls++;seen=JSON.parse(options.prompt);return {summary:'Apply calligraphy and Poppins',decisions:[{op:'applyCaptionTemplate',clipIds:[c.id],templateId:'dancing-poppins'}],toolRequests:[]};}}})('app/lib/server/editorAi.ts');
 const result=await provider.planAiEdit(p,'Apply calligraphy plus Poppins captions',[],'owner',new AbortController().signal);
 assert.equal(calls,1);assert.equal(result.toolRequests.length,0);assert.equal(seen.captionTemplates.find(t=>t.id==='dancing-poppins').fontAccent.font,'Dancing Script');
 const next=ai.applyEditDecisionList(p,result.list);assert.equal(next.captions[c.contentId].style.fontAccent.font,'Dancing Script');assert.equal(next.captions[c.contentId].text,'Exact spoken words');
});
test('untrusted AI style accents and word counts are validated before mutation',()=>{
 let p=model.createProject('invalid');p=op.addCaption(p,'Hello',0,2);const c=textClip(p),original=JSON.stringify(p);
 for(const fontAccent of [{font:'url(evil)',weight:700},{font:'Caveat',weight:NaN}])assert.throws(()=>validation.validateAiPlan({summary:'Bad style',decisions:[{op:'changeText',clipId:c.id,text:'Hello',style:{fontAccent}}]},p));
 assert.throws(()=>op.changeText(p,c.id,'Hello',{maxWordsPerLine:1.5}));assert.equal(JSON.stringify(p),original);
});

test('keyword emphasis supports Unicode, custom terms and numbers without marking every uppercase word',()=>{
 const {isImportantWord,wordHighlight,distinctHighlight}=load('app/lib/captions/highlighting.ts');
 for(const word of ['FREE!','जरूरी','महत्वपूर्ण','مهم','éxito','গুরুত্বপূর্ণ','முக்கியம்','ఉచితం','ਮੁਫ਼ਤ','重要','₹500','２０％'])assert.equal(isImportantWord(word),true,word);
 for(const word of ['THIS','THE','AND','Hello','है'])assert.equal(isImportantWord(word),false,word);
 for(const [word,custom] of [['Überraschung!','überraschung'],['возможность','ВОЗМОЖНОСТЬ'],['कहानियाँ','कहानियाँ'],['大切な言葉','大切な言葉']])assert.equal(isImportantWord(word,custom),true);
 assert.equal(wordHighlight('keyword','ordinary',0,true),false);assert.equal(wordHighlight('current-word','ordinary',0,true),true);
 assert.notEqual(distinctHighlight('#fff','#FFFFFF').toLowerCase(),'#ffffff');
});
test('important words stay highlighted throughout the caption and render in the correct script font',()=>{
 const {drawCaptions}=load('app/lib/captions/canvasCaptions.ts'),{DEFAULT_CAPTION_TEMPLATES}=load('app/lib/captions/templates.ts');
 const style={...DEFAULT_CAPTION_TEMPLATES[0].style,highlightingMode:'keyword',textTransform:'none',textColor:'#FFFFFF',highlightColor:'#FFFFFF'};
 const seg={id:'hi',text:'यह जरूरी है',start:0,end:3,words:[{word:'यह',start:0,end:1},{word:'जरूरी',start:1,end:2},{word:'है',start:2,end:3}]};
 const draw=(time)=>{const paints=[],stack=[],ctx={measureText:text=>({width:[...text].length*18}),save(){stack.push({font:this.font,fillStyle:this.fillStyle});},restore(){Object.assign(this,stack.pop());},translate(){},scale(){},fillRect(){},strokeText(){},fillText(text){paints.push({text,color:this.fillStyle,font:this.font});}};drawCaptions(ctx,[seg],style,time,720,1280);return paints;};
 const early=draw(.2),late=draw(2.2);assert.equal(early.find(p=>p.text==='यह').color,'#FFFFFF');assert.notEqual(early.find(p=>p.text==='जरूरी').color,'#FFFFFF');assert.deepEqual(early.map(p=>p.color),late.map(p=>p.color));assert.ok(early.every(p=>p.font.includes('Noto Sans Devanagari')));
});
test('Arabic caption runs start on the right and retain their original word order and text',()=>{
 const {drawCaptions}=load('app/lib/captions/canvasCaptions.ts'),{DEFAULT_CAPTION_TEMPLATES}=load('app/lib/captions/templates.ts'),{textDirection,scriptFonts}=load('app/lib/captions/languages.ts');
 assert.equal(textDirection('هذا مهم جدا'),'rtl');assert.equal(textDirection('Hello مرحبا'),'ltr');assert.deepEqual(scriptFonts('यह தமிழ் বাংলা'),['Noto Sans Devanagari','Noto Sans Bengali','Noto Sans Tamil']);
 const points=[],text=[],ctx={save(){},restore(){},scale(){},translate(x){points.push(x);},measureText:s=>({width:s.length*20}),strokeText(){},fillRect(){},fillText(s){text.push(s);}};
 drawCaptions(ctx,[{id:'ar',text:'هذا مهم جدا',start:0,end:3,words:[]}],{...DEFAULT_CAPTION_TEMPLATES[0].style,textTransform:'none',highlightingMode:'keyword',maxWordsPerLine:5},.2,720,1280);
 assert.deepEqual(text,['هذا','مهم','جدا']);assert.ok(points[0]>points[1]&&points[1]>points[2]);
});
test('AI caption keyword styling persists and the editor highlights actual important words without timing guesses',()=>{
 const {Compositor}=loader({'app/lib/editor/media.ts':{}})('app/lib/editor/compositor.ts');let p=model.createProject('keywords');p=op.addCaption(p,'A free opportunity',0,2);const c=textClip(p);
 p=ai.applyEditDecisionList(p,validation.validateAiPlan({summary:'Style captions',decisions:[{op:'applyCaptionTemplate',clipIds:[c.id],templateId:'signature-poppins'}]},p).list);
 p.captions[c.contentId].highlightWords='opportunity';const restored=validation.aiProjectSnapshot(JSON.parse(JSON.stringify(p)));assert.equal(restored.captions[c.contentId].highlightMode,'keyword');assert.equal(restored.captions[c.contentId].highlightWords,'opportunity');
 const paints=[],stack=[],ctx={setTransform(){},fillRect(){},save(){stack.push({fillStyle:this.fillStyle,font:this.font});},restore(){Object.assign(this,stack.pop());},translate(){},rotate(){},scale(){},strokeText(){},measureText:s=>({width:s.length*30}),fillText(text){paints.push([text,this.fillStyle]);}};
 new Compositor({}).render({width:1920,height:1080,getContext:()=>ctx},p,.1);assert.ok(paints.some(([text,color])=>text==='free'&&color!=='#FFFFFF'));assert.ok(paints.some(([text,color])=>text==='opportunity'&&color!=='#FFFFFF'));assert.equal(p.captions[c.contentId].words,undefined);
});

test('ASR keeps multilingual source words and automatic detection without calling translation or sending a language override',async()=>{
 const {transcribeWithGroq}=load('app/lib/server/groqTranscription.ts'),before=globalThis.fetch;let target,form;
 globalThis.fetch=async(url,options)=>{target=url;form=options.body;return Response.json({text:'यह important है مرحبا',language:'hindi',duration:2,words:[{word:'यह',start:0,end:.4},{word:'important',start:.4,end:.9},{word:'है',start:.9,end:1.2},{word:'مرحبا',start:1.2,end:2}]});};
 try{const result=await transcribeWithGroq(Buffer.from('audio'),'audio/wav','test-key',new AbortController().signal);assert.ok(target.endsWith('/audio/transcriptions'));assert.equal(form.get('model'),'whisper-large-v3');assert.equal(form.has('language'),false);assert.equal(result.language_code,'hindi');assert.deepEqual(result.words.map(w=>w.text),['यह','important','है','مرحبا']);}finally{globalThis.fetch=before;}
});

test('whole-line editor styling retains its selected solid colour rather than forcing keyword contrast',()=>{
 const {Compositor}=loader({'app/lib/editor/media.ts':{}})('app/lib/editor/compositor.ts');let p=model.createProject('solid');p=op.addCaption(p,'Keep this white',0,2);const c=textClip(p);p.captions[c.contentId]={...p.captions[c.contentId],highlightMode:'full-line',highlightColor:'#FFFFFF',style:{...p.captions[c.contentId].style,color:'#FFFFFF',maxWordsPerLine:4}};
 const colors=[],ctx={setTransform(){},fillRect(){},save(){},restore(){},translate(){},rotate(){},scale(){},strokeText(){},measureText:s=>({width:s.length*25}),fillText(){colors.push(this.fillStyle);}};new Compositor({}).render({width:1920,height:1080,getContext:()=>ctx},p,0);assert.ok(colors.length>0);assert.ok(colors.every(c=>c==='#FFFFFF'));
});
