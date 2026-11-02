import {speechContext} from './speechContext';
import {prepareSpeechAudio} from "./transcriptionAudio";
import {stockKeys,chooseStock} from "./stockSelection";
import {cacheRead} from "./cache";
import {BUILTIN_SFX} from "../assets/builtinSfx";
import {assetHeaders,assetResponse,uploadAssetFile,getAsset} from "../assets/client";
import type {StudioAsset,AssetRole} from "../assets/types";
import type {EditorProject,MediaAsset} from "./model";
import type {EditDecision} from "./ai";
import type {AiToolRequest} from "./aiTools";
import {readToolMediaPresentation} from './aiTools';
import {captionsForClip} from "./captionTiming";
import {readMediaDuration} from "../media/metadata";
export interface PreparedTool {asset:StudioAsset;media?:MediaAsset;decisions:EditDecision[];role:AssetRole;sourceLabel?:string;selection?:{candidateId:string;startTime:number;relevanceScore:number|null;reason:string}}
async function checked(response:Response){if(!response.ok){const d=await response.json().catch(()=>({}));throw new Error(d.error||"This editing tool failed. Please retry.");}return response;}
export async function prepareAiTool(request:AiToolRequest,project:EditorProject,resolve:(asset:MediaAsset)=>Promise<string>,signal:AbortSignal,usedStock=stockKeys(project),editingBudget?:{jobId:string}):Promise<PreparedTool>{
 if(request.type==="captions")signal=AbortSignal.any([signal,AbortSignal.timeout(120000)]);
 const headers=await assetHeaders();signal.throwIfAborted();const jsonHeaders={...headers,"Content-Type":"application/json"};let asset:StudioAsset,role:AssetRole="raw_footage",selection:PreparedTool["selection"],sourceLabel:string|undefined,stockKey:string|undefined;
 const send=(url:string,body:unknown)=>fetch(url,{method:"POST",headers:jsonHeaders,body:JSON.stringify(body),signal});
 if(request.type==="captions"){if(!("clipId"in request))throw new Error("Resolve the footage caption batch before preparation.");const clip=project.clips[request.clipId],original=project.assets[clip?.assetId||""];if(!clip||!original)throw new Error("The source clip is unavailable.");const form=new FormData();
 const speech=await prepareSpeechAudio(original,clip,resolve,signal);
 if(speech)form.set("file",speech.file);
 else if(original.libraryId){form.set("videoUrl","/api/assets/"+encodeURIComponent(original.libraryId)+"/file");}
 else{let blob=original.localKey?await cacheRead<Blob>("media",original.localKey).catch(()=>undefined):undefined;
  if(!blob){const url=await resolve(original);if(url.startsWith("blob:"))throw new Error("The cached original is unavailable. Relink your footage and retry captions.");const response=await checked(await fetch(url,{headers:url.startsWith("/api/assets/")?headers:undefined,signal}));blob=await response.blob();}
  if(!blob.size||blob.size>100*1048576)throw new Error("Transcription needs an original up to 100 MB.");form.set("file",new File([blob],original.name,{type:original.mime||blob.type}));
 }const data=await assetResponse(await fetch("/api/transcribe",{method:"POST",headers,body:form,signal}));const captions=captionsForClip(clip,speech?data.words.map((w:{word:string;start:number;end:number})=>({...w,start:w.start+speech.sourceOffset,end:w.end+speech.sourceOffset})):data.words);if(!captions.length||!data.asset)throw new Error("No timed speech was found in this clip.");return {asset:data.asset,role:"captions",decisions:captions.map(c=>({op:"addCaption",text:c.text,startTime:c.start,duration:c.duration,words:c.words,...(request.templateId?{templateId:request.templateId}:{}),...(request.placementId?{placementId:request.placementId}:{})}))};}
 switch(request.type){case "library":asset=await getAsset(request.assetId);role=asset.kind==="audio"?"sfx_assets":asset.kind==="image"?"backgrounds":"raw_footage";break;
 case "sfx":{const sound=BUILTIN_SFX.find(s=>s.id===request.soundId);if(!sound)throw new Error("Unknown sound effect.");const data=await assetResponse(await send("/api/assets/builtin-sfx",{soundId:sound.id}));if(!data.asset)throw new Error("Sound effect was not saved. Please retry.");asset=data.asset;role="sfx_assets";break;}
 case "broll":case "motion":{let match:{id:string;videoUrl:string;duration:number;sourcePage?:string;creatorUrl?:string};
 if(request.type==='broll'){
  const speech=speechContext(project).filter(c=>c.end>request.startTime-2&&c.start<request.startTime+(request.duration||3)+2).map(c=>c.text).join(' ').slice(0,3000);
  const choice=await assetResponse(await checked(await send('/api/editor/broll-choice',{projectId:project.id,...(editingBudget?{editingJobId:editingBudget.jobId}:{}),query:request.query,speech,duration:request.duration||3,orientation:request.orientation||(project.settings.aspectRatio==='9:16'?'portrait':'landscape'),exclude:[...usedStock]})));
  if(!choice.video?.videoUrl||usedStock.has('broll:'+choice.video.id))throw Error('AI did not select new relevant footage.');match=choice.video;sourceLabel=choice.reason;selection={candidateId:String(choice.video.id),startTime:request.startTime,relevanceScore:typeof choice.relevanceScore==="number"?choice.relevanceScore:null,reason:choice.reason};
 }else{const data=await assetResponse(await fetch('/api/stock/motion?'+new URLSearchParams({query:request.query,per_page:'12',orientation:request.orientation||(project.settings.aspectRatio==='9:16'?'portrait':'landscape')}),{headers,signal}));match=chooseStock(data.videos||[],request.type,usedStock,request.duration);};stockKey=request.type+":"+match.id;const response=await checked(await fetch("/api/broll/download?"+new URLSearchParams({url:match.videoUrl,filename:"AI-"+request.type+"-"+match.id+".mp4"}),{headers,signal}));const blob=await response.blob();const file=new File([blob],"AI-"+request.type+"-"+match.id+".mp4",{type:blob.type||"video/mp4"});const duration=await readMediaDuration(file);asset=await uploadAssetFile(file,{duration,sourcePage:match.sourcePage||match.creatorUrl,providerAssetId:String(match.id)},signal);role="broll_assets";sourceLabel=sourceLabel||request.query;break;}
 case "voiceover":{const data=await assetResponse(await send("/api/voice/generate",{projectId:project.id,text:request.text,voiceConfig:{voiceId:request.voiceId,speed:1}}));if(!data.asset)throw new Error("Voiceover was not saved.");asset=data.asset;role="voiceovers";break;}
 case "image":{const response=await checked(await send("/api/editor/generate-image",{prompt:request.prompt,aspectRatio:request.aspectRatio}));const id=response.headers.get("X-Veelox-Asset-Id");if(!id)throw new Error("Generated image was not saved.");const blob=await response.blob();asset=await getAsset(id);const image=await createImageBitmap(blob);asset={...asset,width:image.width,height:image.height};image.close();role="backgrounds";break;}
 }
 signal.throwIfAborted();if(stockKey)usedStock.add(stockKey);if(!["audio","video","image"].includes(asset.kind))throw new Error("Choose a media asset for clip insertion.");const duration=request.duration??(asset.kind==="image"?5:asset.duration);if(duration<=0||asset.kind!=="image"&&duration>asset.duration+.01)throw new Error("Requested clip is longer than the available media.");
 const presentation=readToolMediaPresentation(request,asset.kind as MediaAsset['kind'],duration);
 const media:MediaAsset={...(stockKey?{stockKey}:{}),id:asset.id,libraryId:asset.id,name:asset.name,kind:asset.kind as "video"|"audio"|"image",mime:asset.mime,size:asset.size,url:asset.url,duration:asset.kind==="image"?duration:asset.duration,width:asset.width,height:asset.height};
 return {asset,media,role,sourceLabel,selection,decisions:request.treatment==="overlay"?[{op:"addOverlay",assetId:media.id,trackId:request.trackId,startTime:request.startTime,duration,motion:request.motionPreset||"pop"}]:[{op:"addClip",assetId:media.id,trackId:request.trackId,startTime:request.startTime,duration,...(presentation.visualTreatment?{visualTreatment:presentation.visualTreatment}:{}),...(presentation.keyframes?{keyframes:presentation.keyframes}:{}),...(presentation.transform?{transform:presentation.transform}:{}),audioRole:request.type==="voiceover"?"speech":request.type==="sfx"?"sfx":"background",...((request.type==="broll"||request.type==="motion")?{volume:request.volume??0}:request.volume===undefined?{}:{volume:request.volume})}]};
}
