import {createHash} from 'node:crypto';
import {GroqEditorError} from './groqEditorTransport';
import type {fallbackInputImages} from './editorFallbackImages';

export const VISUAL_REGIONS=['upper-left','upper-center','upper-right','middle-left','center','middle-right','lower-left','lower-center','lower-right'] as const;
export type VisualRegion=typeof VISUAL_REGIONS[number];
export interface VisualObservation {panel:number;description:string;confidence?:number;subjectRegion?:VisualRegion|'full-frame'|'unknown';clearRegions?:VisualRegion[];occupiedRegions?:VisualRegion[]}
export interface EditorVisualContext {signature:string;model:string;observations:VisualObservation[];scope?:string}
export type EditorInputImages=ReturnType<typeof fallbackInputImages>;
export function editorImageSignature(images:EditorInputImages){return createHash('sha256').update(JSON.stringify(images)).digest('hex');}

/** Fixed panel keys are enforced by the vision API schema. Legacy arrays remain
 * readable for in-flight corrections; both forms get identical local validation.
 */
export function readVisualObservations(value:unknown,panelCount:number):VisualObservation[]{
 const fail=():never=>{throw new GroqEditorError('GROQ_INVALID_OBSERVATIONS',502);};
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>k!=='observations'))return fail();
 let items=(value as {observations?:unknown}).observations;
 if(items&&typeof items==='object'&&!Array.isArray(items)){
  if(Object.keys(items).length!==panelCount)return fail();
  items=Object.entries(items).map(([key,raw])=>{const match=/^panel([1-9]\d*)$/.exec(key),panel=match?Number(match[1]):0;if(!panel||panel>panelCount||!raw||typeof raw!=='object'||Array.isArray(raw))return fail();const item=raw as Record<string,unknown>;if(item.panel!==undefined&&item.panel!==panel)return fail();return {...item,panel};});
 }
 if(!Array.isArray(items)||items.length!==panelCount||panelCount<1||panelCount>18)return fail();
 const seen=new Set<number>(),observations:VisualObservation[]=[];
 for(const item of items){
  if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!['panel','description','confidence','subjectRegion','clearRegions','occupiedRegions'].includes(k)))return fail();
  const {panel,description,confidence,subjectRegion,clearRegions,occupiedRegions}=item as Record<string,unknown>;
  if(typeof panel!=='number'||!Number.isInteger(panel)||panel<1||panel>panelCount||seen.has(panel)||typeof description!=='string'||!description.trim()||description.length>400)return fail();
  if(confidence!==undefined&&(typeof confidence!=='number'||!Number.isFinite(confidence)||confidence<0||confidence>1))return fail();
  if(subjectRegion!==undefined&&(typeof subjectRegion!=='string'||![...VISUAL_REGIONS,'full-frame','unknown'].includes(subjectRegion)))return fail();
  if(clearRegions!==undefined&&(!Array.isArray(clearRegions)||clearRegions.length>3||new Set(clearRegions).size!==clearRegions.length||clearRegions.some(r=>!VISUAL_REGIONS.includes(r as VisualRegion))))return fail();
  if(occupiedRegions!==undefined&&(!Array.isArray(occupiedRegions)||occupiedRegions.length>9||occupiedRegions.some(r=>!VISUAL_REGIONS.includes(r as VisualRegion))))return fail();
  seen.add(panel);observations.push({panel,description:description.trim(),...(confidence===undefined?{}:{confidence:confidence as number}),...(subjectRegion===undefined?{}:{subjectRegion:subjectRegion as VisualObservation['subjectRegion']}),...(occupiedRegions===undefined?{}:{occupiedRegions:[...new Set(occupiedRegions as VisualRegion[])]}),...(clearRegions===undefined?{}:{clearRegions:clearRegions as VisualRegion[]})});
 }
 return observations.sort((a,b)=>a.panel-b.panel);
}
export function linkedVisualObservations(context:EditorVisualContext,images:EditorInputImages){return context.observations.map(observation=>({...images[observation.panel-1].label,...observation}));}
export function visualObservationResponseFormat(panelCount:number){
 const panel={type:'object',properties:{description:{type:'string'},confidence:{type:'number'},subjectRegion:{type:'string',enum:[...VISUAL_REGIONS,'full-frame','unknown']},clearRegions:{type:'array',items:{type:'string',enum:[...VISUAL_REGIONS]}},occupiedRegions:{type:'array',items:{type:'string',enum:[...VISUAL_REGIONS]}}},required:['description','confidence','subjectRegion','clearRegions','occupiedRegions'],additionalProperties:false};
 const properties=Object.fromEntries(Array.from({length:panelCount},(_,i)=>['panel'+(i+1),panel]));
 return {type:'json_schema',json_schema:{name:'editor_visual_observations',strict:true,schema:{type:'object',properties:{observations:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}},required:['observations'],additionalProperties:false}}};
}
