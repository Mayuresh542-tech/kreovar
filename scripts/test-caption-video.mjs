import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const root=process.cwd(),require=createRequire(path.join(root,'package.json')),ts=require('typescript');
function loader(mocks={}){mocks={"../editor/exportAllowance":{withExportAllowance:async(_o,_s,render)=>render(),getUsageStatus:async()=>({maxResolution:720})},...mocks};const cache=new Map();function load(file){const full=path.resolve(root,file.endsWith('.ts')?file:file+'.ts');if(cache.has(full))return cache.get(full);const module={exports:{}};cache.set(full,module.exports);const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const localRequire=specifier=>mocks[specifier]||(specifier.startsWith('.')?load(path.resolve(path.dirname(full),specifier)):require(specifier));new vm.Script(`(function(require,module,exports){${code}\n})`).runInThisContext()(localRequire,module,module.exports);cache.set(full,module.exports);return module.exports;}return load;}
const load=loader(),{drawCaptions}=load('app/lib/captions/canvasCaptions'),{DEFAULT_CAPTION_TEMPLATES}=load('app/lib/captions/templates');
function canvas(){const words=[];return {words,ctx:{measureText:text=>({width:text.length*12}),save(){},restore(){},translate(){},scale(){},fillRect(){},strokeText(){},fillText(text){words.push(text);},clearRect(){},drawImage(){}}};}
const captions=[{id:'s',text:'Hello world',start:0,end:1,words:[{word:'Hello',start:0,end:.5},{word:'world',start:.5,end:1}]}];
test('captions never burn outside their active interval',()=>{const c=canvas();drawCaptions(c.ctx,captions,DEFAULT_CAPTION_TEMPLATES[0].style,1,720,1280);assert.deepEqual(c.words,[]);});
test('every selectable caption template draws readable content at different video ratios',()=>{for(const template of DEFAULT_CAPTION_TEMPLATES){for(const [w,h] of [[720,1280],[1280,720],[720,720]]){const c=canvas();drawCaptions(c.ctx,captions,template.style,.3,w,h);assert.ok(c.words.some(word=>word.length),template.id);}}});
test('edited captions without word timestamps are displayed and timed',()=>{const c=canvas();drawCaptions(c.ctx,[{...captions[0],text:'Updated text',words:[]}],DEFAULT_CAPTION_TEMPLATES[0].style,.3,720,1280);assert.ok(c.words.some(word=>/updated/i.test(word)));});
function fixture(duration=1,audio=true){
 const frames=[],audioCalls=[],draws=[],state={cancelled:false,disposed:false};let current;
 class Input{constructor(){current=this;}async getPrimaryVideoTrack(){return {canDecode:async()=>true,computeDuration:async()=>duration,displayWidth:1280,displayHeight:720};}async getPrimaryAudioTrack(){return audio?{canDecode:async()=>true}:null;}dispose(){state.disposed=true;}}
 class CanvasSink{async *canvasesAtTimestamps(times){for(const t of times)yield {canvas:{timestamp:t}};}}
 class AudioBufferSink{async *buffers(){yield {timestamp:.1,buffer:{duration:.9}};}}
 class Output{constructor({target,format}){this.target=target;state.format=format.constructor.name;}addVideoTrack(){}addAudioTrack(){}async start(){}async finalize(){this.target.buffer=new Uint8Array([1,2,3]).buffer;}async cancel(){state.cancelled=true;}}
 class CanvasSource{constructor(_canvas,options){state.videoCodec=options.codec;}async add(t,d){frames.push([t,d]);}close(){}}
 class AudioBufferSource{constructor(options){state.audioCodec=options.codec;}async add(){audioCalls.push('encoded');}close(){}}
 class OfflineAudioContext{constructor() {this.destination={};}createBufferSource(){return {connect(){},start(...args){audioCalls.push(args);}};}async startRendering(){return {};}}
 const mocks={mediabunny:{Input,BlobSource:class{},ALL_FORMATS:[],CanvasSink,AudioBufferSink,Output,WebMOutputFormat:class WebMOutputFormat{},Mp4OutputFormat:class Mp4OutputFormat{},BufferTarget:class{},CanvasSource,AudioBufferSource,Quality:class{},canEncodeVideo:async()=>true,canEncodeAudio:async()=>true},'../editor/offlineExport':{frameSchedule:(d,f)=>Array.from({length:Math.ceil(d*f)},(_,i)=>({time:i/f,duration:Math.min(1/f,d-i/f)}))},'./canvasCaptions':{drawCaptions:(_ctx,_segments,_style,time)=>draws.push(time)}};
 const exportVideo=loader(mocks)('app/lib/captions/videoExport').exportCaptionedVideo;
 return {exportVideo,frames,audioCalls,draws,state,OfflineAudioContext,current};
}
test('caption-only export encodes every frame and preserves source audio offsets',async()=>{
 const f=fixture();globalThis.document={fonts:{load:async()=>{},ready:Promise.resolve()},createElement:()=>({getContext:()=>canvas().ctx})};globalThis.OfflineAudioContext=f.OfflineAudioContext;
 const file=new File(['source'],'clip.mp4',{type:'video/mp4'}),progress=[];const result=await f.exportVideo(file,captions,DEFAULT_CAPTION_TEMPLATES[0].style,new AbortController().signal,p=>progress.push(p));
 assert.equal(f.frames.length,30);assert.equal(f.draws.length,30);assert.equal(f.frames[29][0],29/30);assert.deepEqual(f.audioCalls[0],[.1,0,.9]);assert.equal(result.type,'video/mp4');assert.equal(f.state.format,'Mp4OutputFormat');assert.equal(f.state.videoCodec,'avc');assert.equal(f.state.audioCodec,'aac');assert.equal(progress.at(-1),100);assert.equal(f.state.disposed,true);
});
test('caption-only export rejects over-60-second media before encoding',async()=>{const f=fixture(61);await assert.rejects(f.exportVideo(new File(['x'],'clip.mp4'),captions,DEFAULT_CAPTION_TEMPLATES[0].style,new AbortController().signal,()=>{}),/60/);assert.equal(f.frames.length,0);assert.equal(f.state.disposed,true);});
test('cancelled export stops and cleans up the input',async()=>{const f=fixture(),controller=new AbortController();controller.abort();await assert.rejects(f.exportVideo(new File(['x'],'clip.mp4'),captions,DEFAULT_CAPTION_TEMPLATES[0].style,controller.signal,()=>{}),{name:'AbortError'});assert.equal(f.state.disposed,true);});

test('WebM alternate uses VP8/Opus without naming it MP4',async()=>{const f=fixture();globalThis.document={fonts:{load:async()=>{},ready:Promise.resolve()},createElement:()=>({getContext:()=>canvas().ctx})};globalThis.OfflineAudioContext=f.OfflineAudioContext;const result=await f.exportVideo(new File(['x'],'clip.mp4'),captions,DEFAULT_CAPTION_TEMPLATES[0].style,new AbortController().signal,()=>{},'webm');assert.equal(result.type,'video/webm');assert.equal(f.state.format,'WebMOutputFormat');assert.equal(f.state.videoCodec,'vp8');assert.equal(f.state.audioCodec,'opus');});

test('caption layout controls change wrapping, position, alignment and font size',()=>{
 function render(patch){const positions=[],c=canvas();c.ctx.translate=(x,y)=>positions.push([x,y]);drawCaptions(c.ctx,captions,{...DEFAULT_CAPTION_TEMPLATES[0].style,animation:'fade',fontSize:40,...patch},.3,1280,720);return {positions,font:c.ctx.font};}
 const top=render({position:'custom',positionYPercent:20,maxWordsPerLine:1});
 const bottom=render({position:'custom',positionYPercent:80,maxWordsPerLine:1});
 assert.notEqual(top.positions[0][1],top.positions[1][1]);
 assert.ok(bottom.positions[0][1]>top.positions[0][1]);
 const row=render({maxWordsPerLine:8,alignment:'left',fontSize:60});
 assert.equal(row.positions[0][1],row.positions[1][1]);
 assert.ok(row.positions[0][0]<render({alignment:'right'}).positions[0][0]);
 assert.match(row.font,/60px 'Montserrat', -apple-system, sans-serif/);
});

test('Caption Studio sends extracted speech only, with no original video upload',async()=>{
 const original=new File(['original footage'],'clip.mov',{type:'video/quicktime'}),speech=new File(['small speech'],'speech.wav',{type:'audio/wav'}),requests=[],stages=[];
 const transcribe=loader({'../editor/transcriptionAudio':{prepareSpeechFile:async(file,duration)=>{assert.equal(file,original);assert.equal(duration,45);return {file:speech};}},'../assets/client':{assetHeaders:async()=>({Authorization:'Bearer test'}),assetResponse:async response=>response.json()}})('app/lib/captions/studioImport').transcribeCaptionVideo;
 const saved=globalThis.fetch;globalThis.fetch=async(url,init)=>{requests.push({url,init});return new Response(JSON.stringify({segments:captions}),{headers:{'Content-Type':'application/json'}});};
 try{const result=await transcribe(original,45,new AbortController().signal,message=>stages.push(message));assert.equal(requests.length,1);assert.equal(requests[0].url,'/api/transcribe');assert.equal(requests[0].init.body.get('file').name,'speech.wav');assert.equal(requests[0].init.body.get('file').size,speech.size);assert.equal(result.segments.length,1);assert.equal(stages.length,2);}finally{globalThis.fetch=saved;}
});

test('cancelled speech extraction does not send a transcription request',async()=>{
 const controller=new AbortController();
 const transcribe=loader({'../editor/transcriptionAudio':{prepareSpeechFile:async()=>{controller.abort();return {file:new File(['speech'],'speech.wav')};}},'../assets/client':{assetHeaders:async()=>{throw Error('Must not request credentials after cancellation.');}}})('app/lib/captions/studioImport').transcribeCaptionVideo;
 await assert.rejects(transcribe(new File(['video'],'clip.mp4'),10,controller.signal,()=>{}),{name:'AbortError'});
});

function metadataFixture(duration=30){
 const revoked=[],cleaned=[];let probe;
 const create=URL.createObjectURL,revoke=URL.revokeObjectURL,doc=globalThis.document;
 URL.createObjectURL=()=> 'blob:test-caption-original';URL.revokeObjectURL=url=>revoked.push(url);
 globalThis.document={createElement:()=>probe={duration,videoWidth:1920,videoHeight:1080,removeAttribute:()=>cleaned.push('src'),load(){},set src(_url){queueMicrotask(()=>probe.onloadedmetadata?.());}}};
 return {revoked,cleaned,restore(){URL.createObjectURL=create;URL.revokeObjectURL=revoke;globalThis.document=doc;}};
}
test('video opens locally after metadata without network or reading the whole file',async()=>{
 const f=metadataFixture();try{const result=await load('app/lib/captions/studioImport').openCaptionVideo(new File(['local'],'clip.mov'),new AbortController().signal);assert.equal(result.url,'blob:test-caption-original');assert.equal(result.duration,30);assert.equal(result.width,1920);assert.deepEqual(f.revoked,[]);assert.equal(f.cleaned.length,1);}finally{f.restore();}
});
test('unsupported long video releases its local URL',async()=>{
 const f=metadataFixture(61);try{await assert.rejects(load('app/lib/captions/studioImport').openCaptionVideo(new File(['video'],'clip.mp4'),new AbortController().signal),/60 seconds/);assert.deepEqual(f.revoked,['blob:test-caption-original']);assert.equal(f.cleaned.length,1);}finally{f.restore();}
});
test('an already cancelled import never creates a preview URL',async()=>{
 const controller=new AbortController();controller.abort();await assert.rejects(load('app/lib/captions/studioImport').openCaptionVideo(new File(['video'],'clip.mp4'),controller.signal),{name:'AbortError'});
});

test('language choices validate known ISO codes and preserve auto detection for Hinglish/mixed speech',()=>{
 const {SPEECH_LANGUAGES,readSpeechLanguage}=load('app/lib/captions/speechLanguages');assert.equal(SPEECH_LANGUAGES.length,99);assert.equal(new Set(SPEECH_LANGUAGES.map(l=>l.code)).size,99);
 for(const language of ['hi','en','ar','ta','ja','bn'])assert.equal(readSpeechLanguage(language),language);
 for(const language of [undefined,null,'','auto','mixed'])assert.equal(readSpeechLanguage(language),undefined);
 for(const language of ['invented','--help','hi;exit',{},123])assert.throws(()=>readSpeechLanguage(language),/supported/);
});
test('the chosen caption language travels with one compact-speech upload; Auto and Mixed omit the hint',async()=>{
 const speech=new File(['speech'],'speech.wav',{type:'audio/wav'}),requests=[];
 const transcribe=loader({'../editor/transcriptionAudio':{prepareSpeechFile:async()=>({file:speech})},'../assets/client':{assetHeaders:async()=>({Authorization:'Bearer test'}),assetResponse:r=>r.json()}})('app/lib/captions/studioImport').transcribeCaptionVideo;
 const before=globalThis.fetch;globalThis.fetch=async(url,init)=>{requests.push(init.body);return Response.json({segments:[]});};
 try{for(const language of ['hi','ja','auto','mixed'])await transcribe(new File(['video'],'clip.mp4'),2,new AbortController().signal,()=>{},language);assert.equal(requests.length,4);assert.deepEqual(requests.map(f=>f.get('language')),['hi','ja',null,null]);assert.ok(requests.every(f=>f.get('file').name==='speech.wav'));}finally{globalThis.fetch=before;}
});
