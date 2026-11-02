import {VISUAL_REGIONS,type VisualRegion,type EditorVisualContext,type EditorInputImages} from './editorVisualObservations';

/** Conservative aggregation of observations, not a placement author or tracker.
 * Clear regions require independent timestamps and agreement of every sample.
 */
export function compositionEvidence(context:EditorVisualContext,images:EditorInputImages){
 const groups=new Map<string,{time:number;confidence:number;subject?:string;occupied:VisualRegion[];clear:VisualRegion[]}[]>();
 for(const observation of context.observations){
  const label=images[observation.panel-1]?.label;
  if(label?.kind!=='footage'||typeof label.clipId!=='string'||typeof label.timelineTime!=='number'||!Number.isFinite(label.timelineTime))continue;
  const group=groups.get(label.clipId)||[];
  group.push({time:label.timelineTime,confidence:observation.confidence??0,subject:observation.subjectRegion,occupied:observation.occupiedRegions||[],clear:observation.clearRegions||[]});groups.set(label.clipId,group);
 }
 return [...groups].map(([clipId,samples])=>{
  const observedTimes=[...new Set(samples.map(s=>s.time))].sort((a,b)=>a-b);
  const avoidRegions=VISUAL_REGIONS.filter(region=>samples.some(s=>s.subject==='full-frame'||s.subject===region||s.occupied.includes(region)));
  const reliable=observedTimes.length>=2&&samples.every(s=>s.confidence>=.75&&s.subject!==undefined&&s.subject!=='unknown'&&s.subject!=='full-frame');
  return {clipId,observedTimes,avoidRegions,clearAtObservedTimes:reliable?VISUAL_REGIONS.filter(region=>!avoidRegions.includes(region)&&samples.every(s=>s.clear.includes(region))):[],coverage:'sampled-source-only; not tracking, masks, or a guarantee between samples'};
 });
}
