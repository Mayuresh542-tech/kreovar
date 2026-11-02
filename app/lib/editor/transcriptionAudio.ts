import {readOriginal} from './original';
import {Input,BlobSource,UrlSource,ALL_FORMATS,AudioBufferSink} from 'mediabunny';
import {cacheRead} from './cache';
import {assetHeaders} from '../assets/client';
import type {Clip,MediaAsset} from './model';

/** Compact mono PCM; speech time is unchanged, independently of timeline speed. */
export function speechWav(samples:Float32Array,rate=16000):Blob{
 if(!samples.length||samples.length>240*rate||rate!==16000)throw new Error('Speech audio is empty or exceeds the decoding budget.');
 const bytes=new ArrayBuffer(44+samples.length*2),v=new DataView(bytes);
 const text=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)v.setUint8(offset+i,value.charCodeAt(i));};
 text(0,'RIFF');v.setUint32(4,36+samples.length*2,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,samples.length*2,true);
 samples.forEach((sample,i)=>{const n=Number.isFinite(sample)?Math.max(-1,Math.min(1,sample)):0;v.setInt16(44+i*2,Math.round(n*(n<0?32768:32767)),true);});
 return new Blob([bytes],{type:'audio/wav'});
}

/** Read only the requested original's audio packets, instead of uploading the entire MOV again. */
export async function prepareSpeechAudio(asset:MediaAsset,clip:Pick<Clip,"sourceStart"|"sourceEnd">,resolve:(a:MediaAsset)=>Promise<string>,signal:AbortSignal,original?:Blob):Promise<{file:File;sourceOffset:number}|undefined>{
 if(typeof window==='undefined'||typeof AudioDecoder==='undefined'||typeof OfflineAudioContext==='undefined')return undefined;
 signal.throwIfAborted();const duration=clip.sourceEnd-clip.sourceStart;
 if(!Number.isFinite(duration)||duration<=0||duration>240)throw new Error('Choose a source range up to four minutes for transcription.');
 const cached=original||(asset.libraryId?await readOriginal(asset,signal):asset.localKey?await cacheRead<Blob>('media',asset.localKey).catch(()=>undefined):undefined);
 const url=cached?undefined:asset.libraryId?'/api/assets/'+encodeURIComponent(asset.libraryId)+'/file':await resolve(asset);
 if(url?.startsWith('blob:'))throw new Error('Relink the original footage before generating captions.');
 const headers=asset.libraryId?await assetHeaders():undefined;signal.throwIfAborted();
 const source=cached?new BlobSource(cached):new UrlSource(new URL(url!,window.location.href),{requestInit:{headers},getRetryDelay:()=>null,fetchFn:(input,init)=>fetch(input,{...init,signal:AbortSignal.any([signal,...(init?.signal?[init.signal]:[])])})});
 const input=new Input({source,formats:ALL_FORMATS}),cancel=()=>input.dispose();signal.addEventListener('abort',cancel,{once:true});
 try{
  const track=await input.getPrimaryAudioTrack();if(!track||!await track.canDecode())throw new Error('This clip has no decodable speech audio.');
  const offline=new OfflineAudioContext(1,Math.ceil(duration*16000),16000);let decoded=false;
  for await(const wrapped of new AudioBufferSink(track).buffers(clip.sourceStart,clip.sourceEnd)){
   signal.throwIfAborted();const start=Math.max(clip.sourceStart,wrapped.timestamp),end=Math.min(clip.sourceEnd,wrapped.timestamp+wrapped.buffer.duration);if(end<=start)continue;
   const node=offline.createBufferSource();node.buffer=wrapped.buffer;node.connect(offline.destination);node.start(start-clip.sourceStart,start-wrapped.timestamp,end-start);decoded=true;
  }
  if(!decoded)throw new Error('No audio was found in this clip range.');
  const rendered=await offline.startRendering();signal.throwIfAborted();
  return {file:new File([speechWav(rendered.getChannelData(0))],asset.name.replace(/\.[^.]+$/,'')+'-speech.wav',{type:'audio/wav'}),sourceOffset:clip.sourceStart};
 }finally{signal.removeEventListener('abort',cancel);input.dispose();}
}

export async function prepareSpeechFile(file:File,duration:number,signal:AbortSignal){
 return prepareSpeechAudio({id:'upload',name:file.name,kind:'video',mime:file.type,size:file.size,duration,width:0,height:0},{sourceStart:0,sourceEnd:duration},async()=>{throw new Error('Original video is unavailable.');},signal,file);
}
