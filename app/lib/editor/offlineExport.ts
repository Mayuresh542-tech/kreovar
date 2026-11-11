import {loadEditorStudioFonts} from './editorCaptionStudio';
import {Input,BlobSource,ALL_FORMATS,CanvasSink,VideoSampleSink,AudioBufferSink,Output,WebMOutputFormat,Mp4OutputFormat,BufferTarget,CanvasSource,AudioBufferSource,Quality,canEncodeVideo,canEncodeAudio,type InputVideoTrack,type VideoSample,type WrappedCanvas} from "mediabunny";
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
export function sourceFrameTimestamp(clip:Pick<Clip,"sourceStart"|"sourceEnd"|"startTime"|"duration"|"speed">,frameTime:number,hold=false){
 return clamp(clip.sourceStart+(hold?clip.duration-.001:frameTime-clip.startTime)*clip.speed,clip.sourceStart,Math.max(clip.sourceStart,clip.sourceEnd-.001));
}
export function dedupeSequentialTimestamps(timestamps:number[],epsilon=1e-6){
 const uniqueTimes:number[]=[],advances:boolean[]=[];
 let last=Number.NaN;
 for(let i=0;i<timestamps.length;i++){
  const t=timestamps[i];
  if(i===0||Math.abs(t-last)>epsilon){uniqueTimes.push(t);advances.push(true);last=t;}
  else advances.push(false);
 }
 return {uniqueTimes,advances};
}
function clipMaxScale(clip:Clip){
 let peak=clip.transform.scale;
 if(clip.keyframes?.length)for(const k of clip.keyframes)peak=Math.max(peak,k.value.scale);
 if(clip.zooms?.length)for(const z of clip.zooms)peak=Math.max(peak,clip.transform.scale*Math.max(z.fromScale,z.toScale));
 if(clip.mediaAnimation){
  if(clip.mediaAnimation.entrance==='zoom-out'||clip.mediaAnimation.exit==='zoom-in')peak*=1.3;
  if(clip.mediaAnimation.loop==='pulse')peak*=1.07;
 }
 return clamp(peak,1,4);
}
type DecodedFrame={image:CanvasImageSource;width:number;height:number;sampleMicros?:number;close?:()=>void};
interface VideoFrameFeeder{
 next(name:string):Promise<DecodedFrame>;
 dispose():Promise<void>;
}
async function createVideoFrameFeeder(
 track:InputVideoTrack,
 timestamps:number[],
 canvasWidth:number,
 canvasHeight:number,
 clip:Clip,
 signal:AbortSignal
):Promise<VideoFrameFeeder>{
 const {uniqueTimes,advances}=dedupeSequentialTimestamps(timestamps);
 const hasVideoSample=typeof VideoSampleSink==="function"&&typeof track.getRotation==="function";
 let index=0;
 let held:DecodedFrame|null=null;

 const canvasSinkFeeder=(width?:number):VideoFrameFeeder=>{
  const iterator=new CanvasSink(track,width?{width,poolSize:8}:{poolSize:8}).canvasesAtTimestamps(uniqueTimes);
  return {
   async next(name){
    signal.throwIfAborted();
    const shouldAdvance=advances[index++];
    if(!shouldAdvance&&held)return held;
    const step=await iterator.next();
    const wrapped=step.value as WrappedCanvas|null|undefined;
    if(!wrapped)throw new Error("A source frame is unavailable: "+name);
    held={image:wrapped.canvas,width:wrapped.canvas.width,height:wrapped.canvas.height};
    return held;
   },
   async dispose(){
    held=null;
    await iterator.return().catch(()=>{});
   }
  };
 };

 if(hasVideoSample){
  const [rotation,flip,sqW,sqH,codedW,codedH]=await Promise.all([
   track.getRotation(),
   track.getFlip(),
   track.getSquarePixelWidth(),
   track.getSquarePixelHeight(),
   track.getCodedWidth(),
   track.getCodedHeight(),
  ]);
  const [rotW,rotH]=rotation%180===0?[sqW,sqH]:[sqH,sqW];
  const maxScale=clipMaxScale(clip);
  // Compute output pixel coverage needed; downscale via mipmapped CanvasSink only when >2.2x larger than needed.
  const neededRatio=Math.max(canvasWidth/Math.max(1,rotW),canvasHeight/Math.max(1,rotH))*maxScale*1.25;
  const strongDownscale=neededRatio<0.45&&rotW>320&&rotH>320;
  const directVideoFrame=typeof VideoFrame!=="undefined"&&rotation===0&&!flip&&sqW===codedW&&sqH===codedH&&!strongDownscale;

  if(directVideoFrame){
   const iterator=new VideoSampleSink(track).samplesAtTimestamps(uniqueTimes);
   return {
    async next(name){
     signal.throwIfAborted();
     const shouldAdvance=advances[index++];
     if(!shouldAdvance&&held)return held;
     const step=await iterator.next();
     const sample=step.value as VideoSample|null|undefined;
     if(!sample)throw new Error("A source frame is unavailable: "+name);
     const sampleMicros=sample.microsecondTimestamp;
     if(held&&held.sampleMicros===sampleMicros){
      sample.close();
      return held;
     }
     const width=sample.displayWidth||sqW,height=sample.displayHeight||sqH;
     const vf=sample.toVideoFrame();
     sample.close();
     held?.close?.();
     held={image:vf,width,height,sampleMicros,close:()=>{try{vf.close();}catch{}}};
     return held;
    },
    async dispose(){
     held?.close?.();
     held=null;
     await iterator.return().catch(()=>{});
    }
   };
  }

  if(!strongDownscale){
   // Use VideoSampleSink + a single reusable scratch canvas so rotated/flipped/anamorphic clips still skip repeated packet draws.
   const iterator=new VideoSampleSink(track).samplesAtTimestamps(uniqueTimes);
   const scratch=document.createElement("canvas");
   scratch.width=Math.max(1,Math.round(rotW));
   scratch.height=Math.max(1,Math.round(rotH));
   const scratchCtx=scratch.getContext?.("2d",{alpha:false})??null;
   return {
    async next(name){
     signal.throwIfAborted();
     const shouldAdvance=advances[index++];
     if(!shouldAdvance&&held)return held;
     const step=await iterator.next();
     const sample=step.value as VideoSample|null|undefined;
     if(!sample)throw new Error("A source frame is unavailable: "+name);
     const sampleMicros=sample.microsecondTimestamp;
     if(held&&held.sampleMicros===sampleMicros){
      sample.close();
      return held;
     }
     if(scratchCtx){
      scratchCtx.globalCompositeOperation="copy";
      sample.drawWithFit(scratchCtx,{fit:"fill"});
      scratchCtx.globalCompositeOperation="source-over";
     }
     sample.close();
     held={image:scratch,width:scratch.width,height:scratch.height,sampleMicros};
     return held;
    },
    async dispose(){
     held=null;
     scratch.width=0;scratch.height=0;
     await iterator.return().catch(()=>{});
    }
   };
  }

  // Fallback for >2.2x downscales (e.g. 4K footage into 720p/1080p): use mipmapped CanvasSink sized to target resolution.
  return canvasSinkFeeder(Math.min(rotW,Math.max(2,Math.round(rotW*neededRatio/2)*2)));
 }

 // Headless / CanvasSink-only fallback (including tests with mocked InputVideoTrack).
 return canvasSinkFeeder();
}

/** Decode at timeline timestamps and encode every frame; never use wall-clock recording. */
export async function renderOffline(project:EditorProject,options:ExportOptions,repository:MediaRepository,onProgress:(value:ExportProgress)=>void,signal:AbortSignal){
 const duration=projectDuration(project),schedule=frameSchedule(duration,options.fps),canvas=document.createElement("canvas"),[w,h]=dimensions[project.settings.aspectRatio],scale=options.resolution/Math.min(w,h);
 canvas.width=Math.round(w*scale/2)*2;canvas.height=Math.round(h*scale/2)*2;
 canvas.getContext?.("2d",{alpha:false});
 const mp4=options.mime.includes("mp4"),codec=mp4?"avc":options.mime.includes("vp9")?"vp9":"vp8",audioCodec=mp4?"aac":"opus",quality=new Quality({bitrate:Math.round((options.quality==="high"?12000000:6000000)*(options.resolution/1080)**2)});
 const encodeCheckOpts={width:canvas.width,height:canvas.height,frameRate:options.fps,quality};
 const [preferHw,canFallbackSw,canAud]=await Promise.all([
  canEncodeVideo(codec,{...encodeCheckOpts,hardwareAcceleration:"prefer-hardware"}),
  canEncodeVideo(codec,encodeCheckOpts),
  canEncodeAudio(audioCodec,{sampleRate:48000,numberOfChannels:2}),
 ]);
 if((!preferHw&&!canFallbackSw)||!canAud)throw new Error(mp4?"This browser cannot encode H.264/AAC. Choose WebM, or use updated Chrome or Edge.":"Frame-accurate export is unavailable in this browser. Use updated Chrome or Edge.");
 const compositor=new Compositor(repository),target=new BufferTarget(),output=new Output({format:mp4?new Mp4OutputFormat({fastStart:"in-memory"}):new WebMOutputFormat(),target}),video=new CanvasSource(canvas,{codec,quality,hardwareAcceleration:preferHw?"prefer-hardware":"no-preference"}),audio=new AudioBufferSource({codec:audioCodec,quality:new Quality({bitrate:192000})});
 output.addVideoTrack(video,{frameRate:options.fps});output.addAudioTrack(audio);
 const inputs=new Map<string,Input>(),inputPromises=new Map<string,Promise<Input>>(),blobs=new Map<string,Blob>(),blobPromises=new Map<string,Promise<Blob>>(),images=new Map<string,ImageBitmap>(),feeders=new Map<string,VideoFrameFeeder>();
 let originalBytes=0,finished=false;
 const load=(id:string)=>{
  signal.throwIfAborted();
  const existing=blobPromises.get(id);
  if(existing)return existing;
  const promise=(async()=>{
   signal.throwIfAborted();
   const asset=project.assets[id];if(!asset)throw new Error("An original asset is missing.");
   onProgress({stage:"Loading original: "+asset.name,progress:1});
   const blob=await readOriginal(asset,signal);
   originalBytes+=blob.size;if(originalBytes>250*1024*1024)throw new Error("This edit uses more than 250 MB of originals. Use smaller files to export in this browser.");
   blobs.set(id,blob);return blob;
  })();
  blobPromises.set(id,promise);
  return promise;
 };
 const input=(id:string)=>{
  const existing=inputPromises.get(id);
  if(existing)return existing;
  const promise=(async()=>{
   const value=new Input({source:new BlobSource(await load(id)),formats:ALL_FORMATS});
   inputs.set(id,value);return value;
  })();
  inputPromises.set(id,promise);
  return promise;
 };
 try{
  onProgress({stage:"Preparing originals and precise frame timing…",progress:0});
  const fontsPromise=(async()=>{
   await document.fonts.ready;
   await Promise.all([
    loadEditorStudioFonts(project),
    ...[...Object.values(project.textLayers),...Object.values(project.captions)].map(layer=>document.fonts.load(layer.style.weight+" "+layer.style.size+"px \""+layer.style.font+"\"")),
   ]);
  })();

  // Precompute schedule visibility once to avoid scanning tracks/transitions twice per frame.
  const frameLayers=schedule.map(frame=>visibleLayers(project,frame.time));
  const times=new Map<string,number[]>();
  const neededImageAssetIds=new Set<string>();
  for(let i=0;i<schedule.length;i++){
   const frameTime=schedule[i].time;
   for(const layer of frameLayers[i]){
    const c=layer.clip,kind=c.assetId?project.assets[c.assetId]?.kind:undefined;
    if(!c.assetId||!kind)continue;
    if(kind==="video"){
     const list=times.get(c.id)||[];
     list.push(sourceFrameTimestamp(c,frameTime,layer.hold));
     times.set(c.id,list);
    }else if(kind==="image"){
     neededImageAssetIds.add(c.assetId);
    }
   }
  }

  onProgress({stage:"Checking video tracks and decoding audio…",progress:1});
  const windows=speechWindows(project),offline=new OfflineAudioContext(2,Math.ceil(duration*48000),48000);
  const audioClips=Object.values(project.clips).filter(c=>{
   const track=project.tracks[c.trackId],asset=c.assetId?project.assets[c.assetId]:undefined;
   return !track.hidden&&!track.muted&&!!asset&&asset.kind!=="image"&&!!c.volume;
  });

  await Promise.all([
   fontsPromise,
   Promise.all([...neededImageAssetIds].map(async assetId=>{
    const bmp=await createImageBitmap(await load(assetId));
    images.set(assetId,bmp);
   })),
   Promise.all([...times.entries()].map(async([id,timestamps])=>{
    signal.throwIfAborted();
    const c=project.clips[id],track=await (await input(c.assetId!)).getPrimaryVideoTrack();
    if(!track||!await track.canDecode())throw new Error("Video codec cannot be decoded: "+c.name);
    feeders.set(id,await createVideoFrameFeeder(track,timestamps,canvas.width,canvas.height,c,signal));
   })),
   Promise.all(audioClips.map(async c=>{
    signal.throwIfAborted();
    const asset=project.assets[c.assetId!]!;
    onProgress({stage:"Decoding audio: "+c.name,progress:2});
    const audioTrack=await (await input(asset.id)).getPrimaryAudioTrack();
    if(!audioTrack){if(asset.kind==="audio")throw new Error("Audio track is missing: "+c.name);return;}
    if(!await audioTrack.canDecode())throw new Error("Audio codec cannot be decoded: "+c.name);
    const gain=offline.createGain();gain.connect(offline.destination);
    const steps=Math.max(2,Math.ceil(c.duration*60)+1);
    const curve=Float32Array.from({length:steps},(_,i)=>{const local=c.duration*i/(steps-1);return clipGain(project,c,c.startTime+local,windows);});
    gain.gain.setValueCurveAtTime(curve,c.startTime,c.duration);
    for await(const wrapped of new AudioBufferSink(audioTrack).buffers(c.sourceStart,c.sourceEnd)){
     signal.throwIfAborted();
     const slice=clipAudioSlice(c,wrapped.timestamp,wrapped.buffer.duration);
     if(slice.length<=0)continue;
     const source=offline.createBufferSource();source.buffer=wrapped.buffer;source.playbackRate.value=c.speed;source.connect(gain);source.start(slice.when,slice.offset,slice.length);
    }
   })),
  ]);

  onProgress({stage:"Mixing audio at exact timeline positions…",progress:4});
  const [mixed]=await Promise.all([offline.startRendering(),output.start()]);
  signal.throwIfAborted();

  type PreparedLayer={id:string;frame:DecodedFrame};
  const prepareFrame=(frameIndex:number):Promise<PreparedLayer[]>=>{
   const layers=frameLayers[frameIndex];
   const pending:Promise<PreparedLayer>[]=[];
   for(const layer of layers){
    const c=layer.clip,asset=c.assetId?project.assets[c.assetId]:undefined;
    if(!asset)continue;
    if(asset.kind==="video"){
     const feeder=feeders.get(c.id)!;
     pending.push(feeder.next(c.name).then(frame=>({id:c.id,frame})));
    }else if(asset.kind==="image"){
     const img=images.get(asset.id);
     if(img)pending.push(Promise.resolve({id:c.id,frame:{image:img,width:img.width,height:img.height}}));
    }
   }
   return Promise.all(pending);
  };

  let nextPreparedPromise:Promise<PreparedLayer[]>|null=schedule.length?prepareFrame(0):null;
  let encodePromise:Promise<void>|null=null;

  for(let index=0;index<schedule.length;index++){
   signal.throwIfAborted();
   const frame=schedule[index];
   const [layersReady]=await Promise.all([nextPreparedPromise!,encodePromise??Promise.resolve()]);
   signal.throwIfAborted();
   for(const item of layersReady)compositor.setFrame(item.id,item.frame.image,item.frame.width,item.frame.height);
   compositor.render(canvas,project,frame.time);
   // video.add() snapshots canvas synchronously into WebCodecs VideoFrame before yielding for encoder backpressure.
   encodePromise=video.add(frame.time,frame.duration);
   // Overlap decoding/preparing frame `index + 1` with `encodePromise` backpressure wait.
   nextPreparedPromise=index+1<schedule.length?prepareFrame(index+1):null;
   if(index%5===0||index===schedule.length-1)onProgress({stage:"Rendering frame "+(index+1)+" of "+schedule.length+"…",progress:5+index/schedule.length*90});
  }
  if(encodePromise)await encodePromise;
  video.close();signal.throwIfAborted();await audio.add(mixed);audio.close();onProgress({stage:"Finishing video and audio…",progress:97});await output.finalize();signal.throwIfAborted();
  if(!target.buffer?.byteLength||target.buffer.byteLength>512*1024*1024)throw new Error("Export is empty or exceeds the browser memory budget.");
  finished=true;onProgress({stage:"Export complete",progress:100});return new Blob([target.buffer],{type:mp4?"video/mp4":"video/webm"});
 }finally{if(!finished)await output.cancel().catch(()=>{});await Promise.all([...feeders.values()].map(feeder=>feeder.dispose().catch(()=>{})));for(const value of inputs.values())value.dispose();for(const image of images.values())image.close();compositor.dispose();blobs.clear();blobPromises.clear();inputPromises.clear();}
}
