import {loadEditorStudioFonts} from './editorCaptionStudio';
import {Input,BlobSource,ALL_FORMATS,CanvasSink,AudioBufferSink,Output,WebMOutputFormat,Mp4OutputFormat,BufferTarget,CanvasSource,AudioBufferSource,Quality,canEncodeVideo,canEncodeAudio} from "mediabunny";
import {Compositor,visibleLayers} from "./compositor";
import {dimensions,projectDuration,clamp,type EditorProject,type Clip} from "./model";
import {assertVideoDuration} from "./limits";
import type {MediaRepository} from "./media";
import type {ExportOptions,ExportProgress} from "./export";
import {clipGain,speechWindows} from "./audioMix";
import {readOriginal} from "./original";

export function frameSchedule(duration:number,fps:number){
 assertVideoDuration(duration);if(![24,30,60].includes(fps))throw new Error("Choose 24, 30 or 60 fps.");
 return Array.from({length:Math.ceil(duration*fps-1e-7)},(_,i)=>({time:i/fps,duration:Math.min(1/fps,duration-i/fps)}));
}
export function clipAudioSlice(clip:Clip,timestamp:number,duration:number){
 const offset=Math.max(0,clip.sourceStart-timestamp),start=Math.max(timestamp,clip.sourceStart),length=Math.min(duration-offset,clip.sourceEnd-start);
 return {offset,length,when:clip.startTime+(start-clip.sourceStart)/clip.speed};
}
/** Decode at timeline timestamps and encode every frame; never use wall-clock recording. */
export async function renderOffline(project:EditorProject,options:ExportOptions,repository:MediaRepository,onProgress:(value:ExportProgress)=>void,signal:AbortSignal){
 const duration=projectDuration(project),schedule=frameSchedule(duration,options.fps),canvas=document.createElement("canvas"),[w,h]=dimensions[project.settings.aspectRatio],scale=options.resolution/Math.min(w,h);
 canvas.width=Math.round(w*scale/2)*2;canvas.height=Math.round(h*scale/2)*2;
 const mp4=options.mime.includes("mp4"),codec=mp4?"avc":options.mime.includes("vp9")?"vp9":"vp8",audioCodec=mp4?"aac":"opus",quality=new Quality({bitrate:Math.round((options.quality==="high"?12000000:6000000)*(options.resolution/1080)**2)});
 if(!await canEncodeVideo(codec,{width:canvas.width,height:canvas.height,frameRate:options.fps,quality})||!await canEncodeAudio(audioCodec,{sampleRate:48000,numberOfChannels:2}))throw new Error(mp4?"This browser cannot encode H.264/AAC. Choose WebM, or use updated Chrome or Edge.":"Frame-accurate export is unavailable in this browser. Use updated Chrome or Edge.");
 const compositor=new Compositor(repository),target=new BufferTarget(),output=new Output({format:mp4?new Mp4OutputFormat({fastStart:"in-memory"}):new WebMOutputFormat(),target}),video=new CanvasSource(canvas,{codec,quality}),audio=new AudioBufferSource({codec:audioCodec,quality:new Quality({bitrate:192000})});
 output.addVideoTrack(video,{frameRate:options.fps});output.addAudioTrack(audio);
 const inputs=new Map<string,Input>(),blobs=new Map<string,Blob>(),images=new Map<string,ImageBitmap>(),iterators=new Map<string,AsyncGenerator<import("mediabunny").WrappedCanvas|null,void,unknown>>();let originalBytes=0,finished=false;
 const load=async(id:string)=>{
  signal.throwIfAborted();const cached=blobs.get(id);if(cached)return cached;
  const asset=project.assets[id];if(!asset)throw new Error("An original asset is missing.");
  onProgress({stage:"Loading original: "+asset.name,progress:1});
  const blob=await readOriginal(asset,signal);
  originalBytes+=blob.size;if(originalBytes>250*1024*1024)throw new Error("This edit uses more than 250 MB of originals. Use smaller files to export in this browser.");
  blobs.set(id,blob);return blob;
 };
 const input=async(id:string)=>{let value=inputs.get(id);if(!value){value=new Input({source:new BlobSource(await load(id)),formats:ALL_FORMATS});inputs.set(id,value);}return value;};
 try{
  onProgress({stage:"Preparing originals and precise frame timing…",progress:0});await document.fonts.ready;await loadEditorStudioFonts(project);
  await Promise.all([...Object.values(project.textLayers),...Object.values(project.captions)].map(layer=>document.fonts.load(layer.style.weight+" "+layer.style.size+"px \""+layer.style.font+"\"")));
  onProgress({stage:"Checking video tracks…",progress:1});
  const times=new Map<string,number[]>();
  for(const frame of schedule)for(const layer of visibleLayers(project,frame.time)){
   const c=layer.clip;if(!c.assetId||project.assets[c.assetId]?.kind!=="video")continue;
   const list=times.get(c.id)||[];list.push(clamp(c.sourceStart+(layer.hold?c.duration-.001:frame.time-c.startTime)*c.speed,c.sourceStart,Math.max(c.sourceStart,c.sourceEnd-.001)));times.set(c.id,list);
  }
  for(const [id,timestamps] of times){signal.throwIfAborted();const c=project.clips[id],track=await (await input(c.assetId!)).getPrimaryVideoTrack();if(!track||!await track.canDecode())throw new Error("Video codec cannot be decoded: "+c.name);iterators.set(id,new CanvasSink(track,{poolSize:2}).canvasesAtTimestamps(timestamps));}
  const windows=speechWindows(project),offline=new OfflineAudioContext(2,Math.ceil(duration*48000),48000);
  for(const c of Object.values(project.clips)){
   signal.throwIfAborted();const track=project.tracks[c.trackId],asset=c.assetId?project.assets[c.assetId]:undefined;if(track.hidden||track.muted||!asset||asset.kind==="image"||!c.volume)continue;
   onProgress({stage:"Decoding audio: "+c.name,progress:2});
   const audioTrack=await (await input(asset.id)).getPrimaryAudioTrack();if(!audioTrack){if(asset.kind==="audio")throw new Error("Audio track is missing: "+c.name);continue;}if(!await audioTrack.canDecode())throw new Error("Audio codec cannot be decoded: "+c.name);
   const gain=offline.createGain();gain.connect(offline.destination);const steps=Math.max(2,Math.ceil(c.duration*60)+1),curve=Float32Array.from({length:steps},(_,i)=>{const local=c.duration*i/(steps-1);return clipGain(project,c,c.startTime+local,windows);});gain.gain.setValueCurveAtTime(curve,c.startTime,c.duration);
   for await(const wrapped of new AudioBufferSink(audioTrack).buffers(c.sourceStart,c.sourceEnd)){
    signal.throwIfAborted();const slice=clipAudioSlice(c,wrapped.timestamp,wrapped.buffer.duration);if(slice.length<=0)continue;
    const source=offline.createBufferSource();source.buffer=wrapped.buffer;source.playbackRate.value=c.speed;source.connect(gain);source.start(slice.when,slice.offset,slice.length);
   }
  }
  onProgress({stage:"Mixing audio at exact timeline positions…",progress:4});const mixed=await offline.startRendering();signal.throwIfAborted();
  await output.start();
  for(let index=0;index<schedule.length;index++){
   signal.throwIfAborted();const frame=schedule[index];
   for(const layer of visibleLayers(project,frame.time)){
    const c=layer.clip,asset=c.assetId?project.assets[c.assetId]:undefined;if(!asset)continue;
    if(asset.kind==="video"){const decoded=await iterators.get(c.id)!.next();if(!decoded.value)throw new Error("A source frame is unavailable: "+c.name);const image=decoded.value.canvas;compositor.setFrame(c.id,image,image.width,image.height);}
    else if(asset.kind==="image"){let image=images.get(asset.id);if(!image){image=await createImageBitmap(await load(asset.id));images.set(asset.id,image);}compositor.setFrame(c.id,image,image.width,image.height);}
   }
   compositor.render(canvas,project,frame.time);await video.add(frame.time,frame.duration);
   if(index%5===0||index===schedule.length-1)onProgress({stage:"Rendering frame "+(index+1)+" of "+schedule.length+"…",progress:5+index/schedule.length*90});
  }
  video.close();signal.throwIfAborted();await audio.add(mixed);audio.close();onProgress({stage:"Finishing video and audio…",progress:97});await output.finalize();signal.throwIfAborted();
  if(!target.buffer?.byteLength||target.buffer.byteLength>512*1024*1024)throw new Error("Export is empty or exceeds the browser memory budget.");
  finished=true;onProgress({stage:"Export complete",progress:100});return new Blob([target.buffer],{type:mp4?"video/mp4":"video/webm"});
 }finally{if(!finished)await output.cancel().catch(()=>{});for(const iterator of iterators.values())await iterator.return().catch(()=>{});for(const value of inputs.values())value.dispose();for(const image of images.values())image.close();compositor.dispose();blobs.clear();}
}
