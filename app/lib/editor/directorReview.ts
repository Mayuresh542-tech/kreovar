import {projectDuration} from './model';
import {applyEditDecisionList,type EditDecisionList} from './ai';
import {validateAiPlan} from './aiValidation';
import {validateAiTools,type AiCatalogAsset} from './aiTools';
import {autoEditCutCandidates,type AutoEditOptions} from './autoEdit';
import type {EditorProject} from './model';
export interface DirectorResponse {summary:string;list:EditDecisionList;toolRequests?:unknown;catalog?:AiCatalogAsset[]}
/** Validates the model's choices. It never invents a cut, placement, graphic or fallback edit. */
export function reviewDirectedPlan(base:EditorProject,response:DirectorResponse,options:AutoEditOptions,selection:string[]=[]){
 if(response.list?.projectId!==base.id||response.list?.baseRevision!==base.revision)throw Error('AI returned a stale edit plan.');
 const proposed=validateAiPlan({summary:response.summary,decisions:response.list.decisions},base);
 if(proposed.list.decisions.some(d=>['removeClip','trimClip','moveClip'].includes(d.op)||d.op==='changeClipProperty'&&d.changes.speed!==undefined))throw Error('The AI plan changes preserved footage timing. Ask for a revised plan.');
 if(!options.motionGraphics&&proposed.list.decisions.some(d=>d.op==='addGraphic'||d.op==='addText'||d.op==='addShape'))throw Error('The AI proposed graphics that were not requested.');
 if(!options.surfaces&&proposed.list.decisions.some(d=>d.op==='changeClipProperty'&&d.changes.surface!==undefined))throw Error('The AI proposed a surface that was not requested.');
 if(!options.transitions&&proposed.list.decisions.some(d=>d.op==='addTransition'))throw Error('The AI proposed transitions that were not requested.');
 const ranges=proposed.list.decisions.flatMap(d=>d.op==='rippleCut'?d.ranges:[]),allowed=options.removeFillers?autoEditCutCandidates(base,selection):[];
 const candidates=allowed.filter(c=>ranges.some(r=>Math.abs(r.start-c.start)<=1/base.settings.fps&&Math.abs(r.end-c.end)<=1/base.settings.fps));
 const list={...proposed.list,decisions:proposed.list.decisions.filter(d=>d.op!=='rippleCut')},reviewed=applyEditDecisionList(base,list),catalog=response.catalog||[],requests=validateAiTools(response.toolRequests,reviewed,catalog);
 if(requests.some(r=>r.type==='broll'&&(!options.broll||reviewed.tracks[r.trackId].kind!=='overlay'||r.duration===undefined||r.duration>6||r.startTime+r.duration>projectDuration(base)+1/base.settings.fps)))throw Error('Supporting footage must be enabled and fit within the original timeline on an overlay track.');
 if(!options.captions&&requests.some(r=>r.type==='captions'))throw Error('The AI requested captions that were not approved.');
 return {list,reviewed,candidates,catalog,requests,excludedCuts:ranges.length-candidates.length};
}
