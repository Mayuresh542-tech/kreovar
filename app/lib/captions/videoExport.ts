import {withExportAllowance,getUsageStatus} from '../editor/exportAllowance';
import {Input,BlobSource,ALL_FORMATS,CanvasSink,AudioBufferSink,Output,WebMOutputFormat,Mp4OutputFormat,BufferTarget,CanvasSource,AudioBufferSource,Quality,canEncodeVideo,canEncodeAudio} from "mediabunny";
import type {CaptionSegment} from "./presets";
import type {CaptionStyleConfig} from "./templates";
import {loadCaptionDocumentFonts} from './studioFonts';
import {drawCaptions} from "./canvasCaptions";
import {frameSchedule} from "../editor/offlineExport";
import {assertVideoDuration} from "../editor/limits";
/** Burn captions into the original video, retaining its aspect ratio and audio. No editor project is created. */
async function renderCaptionedVideo(file:File,segments:CaptionSegment[],style:CaptionStyleConfig,signal:AbortSignal,progress:(percent:number)=>void,format:"mp4"|"webm"="mp4",resolution=720){
 if(!file.size||file.size>100*1024*1024)throw new Error("Choose a video up to 100 MB.");
 if(!segments.length)throw new Error("Generate or import captions first.");
 const input=new Input({source:new BlobSource(file),formats:ALL_FORMATS});let output:Output|undefined,finished=false;
 try{
  signal.throwIfAborted();const track=await input.getPrimaryVideoTrack();if(!track||!await track.canDecode())throw new Error("This video cannot be decoded. Try an MP4 with H.264 video.");
  const duration=await track.computeDuration();assertVideoDuration(duration);const scale=Math.min(1,resolution/Math.min(track.displayWidth,track.displayHeight)),width=Math.max(2,Math.round(track.displayWidth*scale/2)*2),height=Math.max(2,Math.round(track.displayHeight*scale/2)*2);
  if(width>4096||height>4096)throw new Error("This video aspect ratio is too large to export.");
  const videoCodec=format==="mp4"?"avc":"vp8",audioCodec=format==="mp4"?"aac":"opus";
  const quality=new Quality({bitrate:6000000});
  const encOpts={width,height,frameRate:30,quality};
  const [preferHw,canSw]=await Promise.all([canEncodeVideo(videoCodec,{...encOpts,hardwareAcceleration:"prefer-hardware"}),canEncodeVideo(videoCodec,encOpts)]);
  if(!preferHw&&!canSw)throw new Error("This browser cannot encode the selected video format. Try updated Chrome or Edge, or select WebM.");
  const audioTrack=await input.getPrimaryAudioTrack();if(audioTrack&&(!await audioTrack.canDecode()||!await canEncodeAudio(audioCodec,{sampleRate:48000,numberOfChannels:2})))throw new Error("This browser cannot encode the selected audio format. Try updated Chrome or Edge, or select WebM.");
  await loadCaptionDocumentFonts(segments,style);signal.throwIfAborted();
  const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;const ctx=canvas.getContext("2d",{alpha:false});if(!ctx)throw new Error("Video canvas unavailable.");
  const target=new BufferTarget();output=new Output({format:format==="mp4"?new Mp4OutputFormat({fastStart:"in-memory"}):new WebMOutputFormat(),target});const video=new CanvasSource(canvas,{codec:videoCodec,quality,hardwareAcceleration:preferHw?"prefer-hardware":"no-preference"});output.addVideoTrack(video,{frameRate:30});
  const audio=audioTrack?new AudioBufferSource({codec:audioCodec,quality:new Quality({bitrate:128000})}):null;if(audio)output.addAudioTrack(audio);await output.start();
  // Mix asynchronously while decoding/encoding frames, keeping decoded source timestamps in sync.
  const audioPromise=(async()=>{
   if(audioTrack&&audio){const context=new OfflineAudioContext(2,Math.ceil(duration*48000),48000);for await(const value of new AudioBufferSink(audioTrack).buffers(0,duration)){signal.throwIfAborted();const source=context.createBufferSource();source.buffer=value.buffer;source.connect(context.destination);const offset=Math.max(0,-value.timestamp),when=Math.max(0,value.timestamp),length=Math.min(value.buffer.duration-offset,duration-when);if(length>0)source.start(when,offset,length);}signal.throwIfAborted();await audio.add(await context.startRendering());audio.close();}
  })();
  const schedule=frameSchedule(duration,30),sink=new CanvasSink(track,{poolSize:8,width,height,fit:"contain"}),iterator=sink.canvasesAtTimestamps(schedule.map(f=>f.time));
  let index=0,nextStepPromise=schedule.length?iterator.next():null,encodePromise:Promise<void>|null=null;
  while(index<schedule.length&&nextStepPromise){
   signal.throwIfAborted();
   const [step]=await Promise.all([nextStepPromise,encodePromise??Promise.resolve()]);
   if(step.done||!step.value)throw new Error("A source video frame is unavailable.");
   const scheduled=schedule[index];
   ctx.clearRect(0,0,width,height);ctx.drawImage(step.value.canvas,0,0,width,height);drawCaptions(ctx,segments,style,scheduled.time,width,height);
   encodePromise=video.add(scheduled.time,scheduled.duration);
   index++;
   nextStepPromise=index<schedule.length?iterator.next():null;
   if(index%5===0||index===schedule.length)progress(Math.round(index/schedule.length*95));
  }
  await Promise.all([encodePromise??Promise.resolve(),audioPromise]);
  if(index!==schedule.length)throw new Error("Video ended before all frames were rendered.");video.close();signal.throwIfAborted();await output.finalize();signal.throwIfAborted();if(!target.buffer?.byteLength||target.buffer.byteLength>256*1024*1024)throw new Error("Export returned an empty video.");finished=true;progress(100);return new Blob([target.buffer],{type:format==="mp4"?"video/mp4":"video/webm"});
 }finally{if(output&&!finished)await output.cancel().catch(()=>{});input.dispose();}
}

export async function exportCaptionedVideo(file:File,segments:CaptionSegment[],style:CaptionStyleConfig,signal:AbortSignal,progress:(percent:number)=>void,format:"mp4"|"webm"="mp4"){const input=new Input({source:new BlobSource(file),formats:ALL_FORMATS});let duration:number;try{const track=await input.getPrimaryVideoTrack();if(!track)throw new Error('No video track.');duration=await track.computeDuration();assertVideoDuration(duration);}finally{input.dispose();}const usage=await getUsageStatus(signal);return withExportAllowance({resolution:usage.maxResolution,fps:30,duration},signal,()=>renderCaptionedVideo(file,segments,style,signal,progress,format,usage.maxResolution));}
