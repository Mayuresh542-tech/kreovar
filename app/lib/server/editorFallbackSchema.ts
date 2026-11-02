import {STAGE_CAPABILITIES} from '../editor/editingCapabilities';
import type {EditorJsonOptions} from './radoxService';
type Schema=Record<string,unknown>;
const str:Schema={type:'string'},num:Schema={type:'number'},bool:Schema={type:'boolean'};
const enumeration=(values:string[])=>({type:'string',enum:values});
const object=(properties:Record<string,Schema>):Schema=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const array=(items:Schema):Schema=>({type:'array',items});
const union=(items:Schema[]):Schema=>({anyOf:items});
export const FALLBACK_STAGE_CAPABILITIES=STAGE_CAPABILITIES;
export function fallbackPromptData(prompt:string):{data:Record<string,unknown>;feedback:string}|undefined{
 try{const boundary=prompt.indexOf('\nValidation feedback:'),data=JSON.parse(boundary<0?prompt:prompt.slice(0,boundary));if(!data||typeof data!=='object'||Array.isArray(data))return;return {data,feedback:boundary<0?'':prompt.slice(boundary)};}catch{return;}
}
export function editorFallbackResponseFormat(options:Pick<EditorJsonOptions,'prompt'|'operation'>){
 const plain={type:'json_object'},parsed=fallbackPromptData(options.prompt);if(!parsed)return plain;
 const data=parsed.data;
 const strict=(name:string,schema:Schema)=>({type:'json_schema',json_schema:{name,strict:true,schema}});
 if(options.operation==='editor_broll_pick'){
  const candidates=data.candidates as {id?:unknown}[]|undefined,ids=Array.isArray(candidates)?candidates.flatMap(c=>typeof c.id==='string'?[c.id]:[]):[];if(!ids.length||ids.length>6)return plain;
  return strict('editor_broll_choice',object({id:union([enumeration(ids),{type:'null'}]),reason:str,refinedQuery:union([str,{type:'null'}]),relevanceScore:num,candidateScores:array(object({id:enumeration(ids),score:num}))}));
 }
 if(data.pipelineStage!=='applyZooms'&&data.pipelineStage!=='applyEffects')return plain;
 const project=data.project as {clips?:Record<string,{assetId?:string;trackId?:string}>;assets?:Record<string,{kind?:string}>;tracks?:Record<string,{locked?:boolean;hidden?:boolean}>}|undefined;
 const editable=Object.entries(project?.clips||{}).filter(([,c])=>c.trackId&&!project?.tracks?.[c.trackId]?.locked&&!project?.tracks?.[c.trackId]?.hidden),ids=editable.map(([id])=>id),visualIds=editable.flatMap(([id,c])=>c.assetId&&['video','image'].includes(project?.assets?.[c.assetId]?.kind||'')?[id]:[]);
 if(!ids.length||data.pipelineStage==='applyZooms'&&!visualIds.length)return plain;
 const clipId=enumeration(ids),visualClipId=enumeration(visualIds);
 const focus:Schema={type:'number',minimum:-.4,maximum:.4,description:'Signed offset from frame center. 0 is centered; 0.5 is invalid. Use 0 unless a focus was requested.'},zoomScale:Schema={type:'number',minimum:1,maximum:1.18};
 const zoom=object({op:enumeration(['addZoom']),clipId:visualClipId,startTime:num,endTime:num,fromScale:zoomScale,toScale:zoomScale,easing:enumeration(['linear','smooth']),returnToStart:bool,focusX:focus,focusY:focus});
 const transform=object({x:num,y:num,scale:num,rotation:num,opacity:num}),effects=object({brightness:num,contrast:num,saturation:num,blur:num});
 const changes=union([object({fadeIn:num}),object({fadeOut:num}),object({effects}),object({transform}),object({volume:num}),object({speed:num}),object({audioRole:enumeration(['speech','background','sfx'])}),object({ducking:bool}),object({surface:enumeration(['none','paper','grid','grain','marker','retro'])})]);
 const effect=union([object({op:enumeration(['changeClipProperty']),clipId,changes}),object({op:enumeration(['setAudioDucking']),enabled:bool}),...(visualIds.length?[object({op:enumeration(['addTransition']),fromClipId:visualClipId,toClipId:visualClipId,kind:enumeration(['fade','dissolve','slide','zoom']),duration:num})]:[])]);
 return strict(data.pipelineStage==='applyZooms'?'editor_zoom_stage':'editor_effect_stage',object({summary:str,decisions:array(data.pipelineStage==='applyZooms'?zoom:effect),toolRequests:{type:'array',items:{type:'null'},maxItems:0}}));
}
