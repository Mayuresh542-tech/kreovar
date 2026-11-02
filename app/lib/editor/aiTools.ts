import {textPlacementId,type TextPlacementId} from "./textPlacement";
import {MOTION_PRESETS,readKeyframes,type MotionPreset,type TransformKeyframe} from './keyframes';
import {readVisualTreatment,type VisualTreatment} from './visualTreatment';
import {ALL_CAPTION_TEMPLATES as DEFAULT_CAPTION_TEMPLATES} from "../captions/referenceTemplates";
import {checkCaptionSources} from "./captionBatch";
import {BUILTIN_SFX} from "../assets/builtinSfx";
import {CURATED_VOICES} from "../server/tts/voices";
import {canPlace,type EditorProject,type MediaAsset,type Ratio,type Transform} from "./model";
import {addAsset} from "./operations";
import {applyEditDecisionList,type EditDecisionList} from "./ai";
import {validateAiPlan} from "./aiValidation";
export interface AiCatalogAsset {id:string;name:string;kind:"audio"|"video"|"image"|"caption";duration:number}
interface Placement {trackId:string;startTime:number;duration?:number;volume?:number;treatment?:'overlay';motionPreset?:MotionPreset;visualTreatment?:VisualTreatment;keyframes?:TransformKeyframe[];transform?:Transform;orientation?:'portrait'|'landscape'}
export type AiToolRequest = (Placement & ({type:"sfx";soundId:string}|{type:"library";assetId:string}|{type:"broll"|"motion";query:string}|{type:"voiceover";text:string;voiceId:string}|{type:"image";prompt:string;aspectRatio:Ratio})) | {type:"captions";clipId:string;templateId?:string;placementId?:TextPlacementId} | {type:"captions";scope:"footage";templateId?:string;placementId?:TextPlacementId};
function text(value:unknown,max=200){if(typeof value!=="string"||!value.trim()||value.length>max)throw new Error("Invalid AI tool input.");return value.trim();}
function num(value:unknown,min:number,max:number){if(typeof value!=="number"||!Number.isFinite(value)||value<min||value>max)throw new Error("Invalid AI tool timing or volume.");return value;}
/** New media starts at source zero; animation cannot refer to another clip or escape its insert. */
export function readToolMediaPresentation(value:unknown,kind:MediaAsset['kind'],duration?:number){
 const r=value as Record<string,unknown>,hasPresentation=['visualTreatment','keyframes','transform'].some(k=>r[k]!==undefined);
 if((hasPresentation||r.orientation!==undefined)&&kind==='audio')throw Error('Visual framing and animation require image or video media.');
 if(hasPresentation&&r.treatment!==undefined)throw Error('Choose explicit media framing or the small image overlay preset, not both.');
 const visualTreatment=r.visualTreatment===undefined?undefined:readVisualTreatment(r.visualTreatment),keyframes=r.keyframes===undefined?undefined:readKeyframes(r.keyframes);
 let transform:Transform|undefined;
 if(r.transform!==undefined){if(!r.transform||typeof r.transform!=='object'||Array.isArray(r.transform))throw Error('Invalid media transform.');const t=r.transform as Record<string,unknown>;transform={x:num(t.x,-2,2),y:num(t.y,-2,2),scale:num(t.scale,.05,10),rotation:num(t.rotation,-3600,3600),opacity:num(t.opacity,0,1)};}
 if(keyframes!==undefined||visualTreatment?.effects?.length||visualTreatment?.entrance||visualTreatment?.exit){
  if(duration===undefined)throw Error('Animated inserted media requires an explicit duration.');
  if(keyframes?.some(f=>f.sourceTime>duration+1e-7)||visualTreatment?.effects?.some(e=>e.sourceEnd>duration+1e-7)||(visualTreatment?.entrance?.sourceDuration||0)>duration||(visualTreatment?.exit?.sourceDuration||0)>duration)throw Error('Inserted-media animation must stay inside its source duration.');
 }
 if(r.orientation!==undefined&&r.orientation!=='portrait'&&r.orientation!=='landscape')throw Error('Choose a portrait or landscape stock search.');
 if(r.orientation!==undefined&&!['broll','motion'].includes(String(r.type)))throw Error('Orientation is a stock-search option.');
 return {...(visualTreatment===undefined?{}:{visualTreatment}),...(keyframes===undefined?{}:{keyframes}),...(transform===undefined?{}:{transform}),...(r.orientation===undefined?{}:{orientation:r.orientation as 'portrait'|'landscape'})};
}
export function validateAiTools(value:unknown,project:EditorProject,catalog:AiCatalogAsset[]):AiToolRequest[]{
 if(value===undefined)return [];if(!Array.isArray(value)||value.length>6)throw new Error("An AI plan supports up to six tool requests.");
 return value.map(item=>{if(!item||typeof item!=="object"||Array.isArray(item))throw new Error("Invalid AI tool request.");const r=item as Record<string,unknown>;
 if(r.type==="captions"){
 const templateId=r.templateId===undefined?undefined:text(r.templateId);if(templateId&&!DEFAULT_CAPTION_TEMPLATES.some(t=>t.id===templateId))throw new Error('Unknown caption template.');
 const style={...(templateId?{templateId}:{}),...(r.placementId===undefined?{}:{placementId:textPlacementId(r.placementId)})};
 if(r.scope==='footage'){if(r.clipId!==undefined)throw new Error('Choose one caption source scope.');const ids=mainFootage(project).map(c=>c.id);checkCaptionSources(project,ids);return {type:'captions',scope:'footage',...style};}
 if(r.scope!==undefined)throw new Error('Unsupported caption scope.');
 const clipId=text(r.clipId);checkCaptionSources(project,[clipId]);return {type:'captions',clipId,...style};
 }
 let specific:Record<string,unknown>,kind:"video"|"audio"|"image";
 switch(r.type){case "sfx":{const soundId=text(r.soundId);if(!BUILTIN_SFX.some(s=>s.id===soundId))throw new Error("Unknown sound effect.");specific={type:"sfx",soundId};kind="audio";break;}
 case "library":{const assetId=text(r.assetId),asset=catalog.find(a=>a.id===assetId);if(!asset||asset.kind==="caption")throw new Error("This private library media is unavailable.");specific={type:"library",assetId};kind=asset.kind;break;}
 case "broll":case "motion":specific={type:r.type,query:text(r.query,100)};kind="video";break;
 case "voiceover":{const voiceId=text(r.voiceId);if(!CURATED_VOICES.some(v=>v.id===voiceId))throw new Error("Unknown AI voice.");specific={type:"voiceover",voiceId,text:text(r.text,3000)};kind="audio";break;}
 case "image":{const aspectRatio=text(r.aspectRatio) as Ratio;if(!["16:9","9:16","1:1","4:5"].includes(aspectRatio))throw new Error("Unsupported image ratio.");specific={type:"image",prompt:text(r.prompt,2000),aspectRatio};kind="image";break;}
 default:throw new Error("Unsupported AI tool.");}
 const trackId=text(r.trackId),track=project.tracks[trackId];if(!track||track.locked||!canPlace(track.kind,kind))throw new Error("AI tool needs an unlocked compatible track.");
 if(r.treatment!==undefined&&(r.treatment!=='overlay'||kind!=='image'||!['image','overlay'].includes(track.kind)))throw Error('Only image media can use overlay treatment on an image/overlay track.');
 if(r.motionPreset!==undefined&&(r.treatment!=='overlay'||!MOTION_PRESETS.includes(r.motionPreset as MotionPreset)))throw Error('Choose an overlay motion preset.');
 const duration=r.duration===undefined?undefined:num(r.duration,1/project.settings.fps,3600),presentation=readToolMediaPresentation(r,kind,duration);
 return {...specific,trackId,startTime:num(r.startTime,0,86400),...presentation,...(r.treatment?{treatment:'overlay' as const,motionPreset:r.motionPreset as MotionPreset|undefined}:{}),...(duration===undefined?{}:{duration}),...(r.volume===undefined?{}:{volume:num(r.volume,0,2)})} as AiToolRequest;
 });
}
export function aiToolDescription(r:AiToolRequest,catalog:AiCatalogAsset[]=[]){switch(r.type){case "sfx":return "Add SFX: "+(BUILTIN_SFX.find(s=>s.id===r.soundId)?.name||r.soundId)+" at "+r.startTime+"s";case "library":return "Use your asset: "+(catalog.find(a=>a.id===r.assetId)?.name||r.assetId)+" at "+r.startTime+"s";case "broll":return "Find B-roll: "+r.query+" at "+r.startTime+"s"+(r.duration?" for "+r.duration+"s":"")+" (muted unless requested)";case "motion":return "Find motion graphics: "+r.query;case "voiceover":return "Generate voiceover: "+r.text;case "image":return "Generate image: "+r.prompt;case "captions":return ("scope"in r?"Transcribe all main footage":"Transcribe clip")+" and add timed captions"+(r.templateId?" · "+(DEFAULT_CAPTION_TEMPLATES.find(t=>t.id===r.templateId)?.name||r.templateId):"");}}
export function combinePreparedEdit(project:EditorProject,list:EditDecisionList,assets:MediaAsset[],decisions:EditDecisionList["decisions"]){const augmented=assets.reduce((p,a)=>addAsset(p,a),project);const validated=validateAiPlan({summary:"Prepared edit",decisions:[...list.decisions,...decisions]},augmented);return {assets,list:validated.list};}
export function applyPreparedEdit(project:EditorProject,prepared:ReturnType<typeof combinePreparedEdit>){if(prepared.list.projectId!==project.id||prepared.list.baseRevision!==project.revision)throw new Error("The timeline changed. Generate a fresh plan.");const augmented=prepared.assets.reduce((p,a)=>addAsset(p,a),project);return applyEditDecisionList(augmented,prepared.list);}

export function mainFootage(project:EditorProject){return Object.values(project.clips).filter(c=>c.assetId&&project.assets[c.assetId]?.kind==='video'&&project.tracks[c.trackId].kind==='video'&&!project.tracks[c.trackId].hidden).sort((a,b)=>a.startTime-b.startTime);}
/** Resolve newly sequenced clip IDs locally; never ask the model to guess generated IDs. */
export function expandAiTools(requests:AiToolRequest[],project:EditorProject):AiToolRequest[]{
 const expanded=requests.flatMap(r=>r.type==='captions'&&'scope'in r?mainFootage(project).map(c=>({type:'captions' as const,clipId:c.id,...(r.templateId?{templateId:r.templateId}:{}),...(r.placementId?{placementId:r.placementId}:{})})):[r]);
 if(expanded.length>6)throw new Error('This edit requires more than six tool calls. Select fewer clips or request a smaller edit.');
 const captions=expanded.filter((r):r is Extract<AiToolRequest,{clipId:string}>=>r.type==='captions'&&'clipId'in r);
 if(captions.length)checkCaptionSources(project,captions.map(r=>r.clipId));
 return expanded;
}
