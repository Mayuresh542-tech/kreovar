import {footageSampleTargets,footageProbeTargets,type FootageFrame} from './footageContext';
import {selectFallbackFootage,type FootageProbe} from './footageSampling';
import type {EditorProject,MediaAsset} from './model';

function mediaEvent(video:HTMLVideoElement,event:string,signal:AbortSignal){return new Promise<void>((resolve,reject)=>{
 const finish=(error?:Error)=>{clearTimeout(timer);video.removeEventListener(event,ready);video.removeEventListener('error',failed);signal.removeEventListener('abort',cancel);if(error)reject(error);else resolve();};
 const ready=()=>finish(),failed=()=>finish(new Error('The source video could not be decoded for AI analysis. Relink the original file and retry.')),cancel=()=>finish(new DOMException('Analysis cancelled','AbortError'));
 const timer=setTimeout(()=>finish(new Error('Reading source video frames timed out. Relink the original file and retry.')),15000);video.addEventListener(event,ready,{once:true});video.addEventListener('error',failed,{once:true});signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
});}
async function captureFrames(p:EditorProject,targets:ReturnType<typeof footageSampleTargets>,resolve:(asset:MediaAsset)=>Promise<string>,signal:AbortSignal,observe=false){
 const frames:FootageFrame[]=[],probes:FootageProbe[]=[];let activeAsset='',video:HTMLVideoElement|undefined;
 const close=()=>{if(video){video.pause();video.removeAttribute('src');video.load();video=undefined;}};
 try{for(const target of targets){signal.throwIfAborted();const asset=p.assets[p.clips[target.clipId].assetId!];if(activeAsset!==asset.id){close();video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';video.crossOrigin='anonymous';const url=await resolve(asset);signal.throwIfAborted();const loaded=mediaEvent(video,'loadeddata',signal);video.src=url;video.load();await loaded;activeAsset=asset.id;}
  const element=video!;if(Math.abs(element.currentTime-target.sourceTime)>.002){const seeked=mediaEvent(element,'seeked',signal);element.currentTime=target.sourceTime;await seeked;}
  signal.throwIfAborted();if(!element.videoWidth||!element.videoHeight)throw Error('The source has no readable video frames.');
  const scale=Math.min(1,480/Math.max(element.videoWidth,element.videoHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(element.videoWidth*scale));canvas.height=Math.max(1,Math.round(element.videoHeight*scale));const ctx=canvas.getContext('2d');if(!ctx)throw Error('Video analysis is unavailable in this browser.');ctx.drawImage(element,0,0,canvas.width,canvas.height);
  let data='';for(const quality of [.65,.45,.25]){data=canvas.toDataURL('image/jpeg',quality).split(',')[1]||'';if(data.length<=48000)break;}if(!data||data.length>48000)throw Error('The source preview is too large for analysis.');
  const frame={...target,width:canvas.width,height:canvas.height,data};frames.push(frame);
  if(observe){const thumbnail=document.createElement('canvas');thumbnail.width=24;thumbnail.height=14;const small=thumbnail.getContext('2d',{willReadFrequently:true});if(!small)throw Error('Frame analysis is unavailable.');small.drawImage(canvas,0,0,24,14);const rgba=small.getImageData(0,0,24,14).data,pixels=new Uint8Array(24*14*3);for(let i=0,j=0;i<rgba.length;i+=4){pixels[j++]=rgba[i];pixels[j++]=rgba[i+1];pixels[j++]=rgba[i+2];}probes.push({frame,pixels});}
 }return {frames,probes};}finally{close();}
}

/** Legacy/Claude observations retain the exact original sampling targets. */
export async function captureFootageFrames(p:EditorProject,selection:string[],resolve:(asset:MediaAsset)=>Promise<string>,signal:AbortSignal):Promise<FootageFrame[]>{return (await captureFrames(p,footageSampleTargets(p,selection),resolve,signal)).frames;}
export async function captureFootageEvidence(p:EditorProject,selection:string[],resolve:(asset:MediaAsset)=>Promise<string>,signal:AbortSignal){
 const original=footageSampleTargets(p,selection),scan=await captureFrames(p,footageProbeTargets(p,selection),resolve,AbortSignal.any([signal,AbortSignal.timeout(30000)]),true);
 const footageFrames=original.map(t=>{const frame=scan.frames.find(f=>f.clipId===t.clipId&&Math.abs(f.sourceTime-t.sourceTime)<.00001);if(!frame)throw Error('Original footage observation is missing.');return frame;});
 return {footageFrames,fallbackFootageFrames:selectFallbackFootage(scan.probes)};
}
