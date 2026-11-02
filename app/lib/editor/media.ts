import {legacyStoragePath} from "../media/legacyStorage";
import {readOriginal} from './original';
import { MediaAsset, uid } from "./model";
import { loadCloudOriginal } from "./cloudMedia";
import { cacheRead, cacheWrite } from "./cache";

export function waitMedia(element:HTMLMediaElement,event="loadeddata",timeout=20000):Promise<void>{
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>done(new Error("Media decoding timed out. This codec may not be supported in this browser.")),timeout);
    const success=()=>done(),failure=()=>done(new Error("This browser cannot decode this file, or the remote host blocks access."));
    function done(error?:Error){clearTimeout(timer);element.removeEventListener(event,success);element.removeEventListener("error",failure);if(error)reject(error);else resolve();}
    element.addEventListener(event,success,{once:true});element.addEventListener("error",failure,{once:true});
  });
}
async function peaks(file:File):Promise<number[]|undefined>{
  // Large originals still import; avoid decoding hours of audio into RAM just for a thumbnail.
  if(file.size>64*1024*1024)return undefined;
  const context=new AudioContext();
  try{
    const buffer=await context.decodeAudioData(await file.arrayBuffer());
    const channels=Array.from({length:Math.min(2,buffer.numberOfChannels)},(_,i)=>buffer.getChannelData(i).slice());
    const worker=new Worker(new URL("./waveform.worker.ts",import.meta.url));
    return await new Promise<number[]>((resolve,reject)=>{
      const timer=setTimeout(()=>{worker.terminate();reject(new Error("Waveform analysis timed out."));},15000);
      worker.onmessage=(e:MessageEvent<number[]>)=>{clearTimeout(timer);worker.terminate();resolve(e.data);};
      worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(new Error("Waveform analysis failed."));};
      worker.postMessage({channels,bins:240},channels.map(c=>c.buffer));
    });
  }catch{return undefined;}finally{await context.close();}
}
export async function importMedia(file:File,scope:string,onProgress:(value:number)=>void):Promise<MediaAsset>{
  const ext=file.name.split(".").at(-1)?.toLowerCase();
  const kind=["png","jpg","jpeg","webp"].includes(ext||"")?"image":["mp3","wav","m4a","ogg"].includes(ext||"")||file.type.startsWith("audio/")?"audio":["mp4","webm","mov"].includes(ext||"")?"video":undefined;
  if(!kind)throw new Error(`${file.name}: use MP4, WebM, MOV, MP3, WAV, PNG, JPG or WEBP.`);
  if(!file.size)throw new Error(`${file.name} is empty.`);
  const id=uid(),url=URL.createObjectURL(file),asset:MediaAsset={id,name:file.name,kind,mime:file.type,size:file.size,duration:5,width:0,height:0,localKey:`${scope}:${id}`};
  onProgress(10);
  try{
    if(kind==="image"){
      const image=await createImageBitmap(file);asset.width=image.width;asset.height=image.height;
      const canvas=document.createElement("canvas");canvas.width=240;canvas.height=Math.max(1,Math.round(240*image.height/image.width));canvas.getContext("2d")?.drawImage(image,0,0,canvas.width,canvas.height);asset.thumbnail=canvas.toDataURL("image/jpeg",0.7);image.close();
    }else{
      const media=document.createElement(kind==="video"?"video":"audio");media.preload="auto";
      const loaded=waitMedia(media,"loadedmetadata");media.src=url;await loaded;
      if(media.duration===Infinity){const ended=waitMedia(media,"seeked");media.currentTime=1e10;await ended;const reset=waitMedia(media,"seeked");media.currentTime=0;await reset;}
      if(!Number.isFinite(media.duration)||media.duration<=0)throw new Error("Media duration is invalid. Re-encode this file and import again.");
      asset.duration=media.duration;onProgress(30);
      if(media instanceof HTMLVideoElement){
        asset.width=media.videoWidth;asset.height=media.videoHeight;
        const canvas=document.createElement("canvas");canvas.width=160;canvas.height=Math.max(1,Math.round(160*asset.height/asset.width));
        asset.thumbnails=[];
        for(let i=0;i<6;i++){
          const target=Math.max(0,Math.min(asset.duration-.001,asset.duration*(i+.1)/6));
          if(Math.abs(media.currentTime-target)>.0001){const sought=waitMedia(media,"seeked");media.currentTime=target;await sought;}
          canvas.getContext("2d")?.drawImage(media,0,0,canvas.width,canvas.height);asset.thumbnails.push(canvas.toDataURL("image/jpeg",0.6));onProgress(30+i*6);
        }
        asset.thumbnail=asset.thumbnails[0];
      }
      media.removeAttribute("src");media.load();
      asset.waveform=await peaks(file);
    }
    onProgress(85);await cacheWrite("media",asset.localKey!,file);onProgress(100);return asset;
  }finally{URL.revokeObjectURL(url);}
}
/** Session-only object URLs; blobs stay out of React and the editing document. */
export class MediaRepository {
  private controllers=new Map<string,AbortController>();
  private urls=new Map<string,string>();private pending=new Map<string,Promise<string>>();private disposed=false;private tickets=new Map<string,symbol>();
  activate(){this.disposed=false;}
  resolve(asset:MediaAsset):Promise<string>{
    const existing=this.urls.get(asset.id);if(existing)return Promise.resolve(existing);
    const pending=this.pending.get(asset.id);if(pending)return pending;
    const ticket=Symbol();this.tickets.set(asset.id,ticket);const controller=new AbortController();this.controllers.set(asset.id,controller);
    const task:Promise<string>=(async()=>{
      if(asset.libraryId){const file=(asset.localKey?await cacheRead<Blob>("media",asset.localKey).catch(()=>undefined):undefined)||await readOriginal(asset,controller.signal);const url=URL.createObjectURL(file);if(this.disposed||this.tickets.get(asset.id)!==ticket){URL.revokeObjectURL(url);throw new Error("Media session closed or original relinked.");}this.urls.set(asset.id,url);return url;}
      if(asset.localKey){const file=await cacheRead<Blob>("media",asset.localKey).catch(()=>undefined)|| (asset.cloud ? await loadCloudOriginal(asset) : undefined);if(!file){if(asset.libraryId)return `/api/assets/${encodeURIComponent(asset.libraryId)}/file`;throw new Error(`Missing original: ${asset.name}. Relink it in Media.`);}const url=URL.createObjectURL(file);if(this.disposed||this.tickets.get(asset.id)!==ticket){URL.revokeObjectURL(url);throw new Error("Media session closed or original relinked.");}this.urls.set(asset.id,url);return url;}
      if(asset.libraryId)return `/api/assets/${encodeURIComponent(asset.libraryId)}/file`;
      if(asset.cloud){const file=await loadCloudOriginal(asset);if(this.disposed||this.tickets.get(asset.id)!==ticket)throw new Error("Media session closed or original relinked.");const url=URL.createObjectURL(file);this.urls.set(asset.id,url);return url;}
      if(asset.url){if(legacyStoragePath(asset.url)){const file=await readOriginal(asset,controller.signal);if(this.disposed||this.tickets.get(asset.id)!==ticket)throw new Error("Media session closed.");const url=URL.createObjectURL(file);this.urls.set(asset.id,url);return url;}return asset.url;}
      throw new Error(`Missing original: ${asset.name}. Relink it in Media.`);
    })();
    this.pending.set(asset.id,task);task.catch(()=>{if(this.pending.get(asset.id)===task)this.pending.delete(asset.id);});return task;
  }
  invalidate(id:string){this.controllers.get(id)?.abort();this.controllers.delete(id);this.tickets.delete(id);const url=this.urls.get(id);if(url)URL.revokeObjectURL(url);this.urls.delete(id);this.pending.delete(id);}
  dispose(){this.disposed=true;this.controllers.forEach(c=>c.abort());this.controllers.clear();this.tickets.clear();this.urls.forEach(url=>URL.revokeObjectURL(url));this.urls.clear();this.pending.clear();}
}

/** Older shared assets may not have dimensions; inspect the original without uploading it again. */
export async function visualDimensions(asset:MediaAsset,repository:MediaRepository):Promise<{width:number;height:number}>{
 if(asset.kind==="audio")throw new Error("Select a video or image to frame.");
 if(asset.width&&asset.height)return {width:asset.width,height:asset.height};
 const url=await repository.resolve(asset);
 if(asset.kind==="image"){
  const image=new Image();image.crossOrigin="anonymous";
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{image.onload=null;image.onerror=null;reject(new Error("Image dimensions could not be loaded."));},20000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(new Error("Image dimensions could not be loaded."));};image.src=url;});
  return {width:image.naturalWidth,height:image.naturalHeight};
 }
 const video=document.createElement("video");video.preload="metadata";video.muted=true;video.playsInline=true;
 try{const loaded=waitMedia(video,"loadedmetadata");video.src=url;await loaded;if(!video.videoWidth||!video.videoHeight)throw new Error("This video has no readable dimensions.");return {width:video.videoWidth,height:video.videoHeight};}finally{video.pause();video.removeAttribute("src");video.load();}
}
