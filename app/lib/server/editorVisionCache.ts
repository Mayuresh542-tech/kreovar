import {createHash} from 'node:crypto';
import {readVisualObservations,type EditorVisualContext} from './editorVisualObservations';
import type {EditorJsonOptions} from './radoxService';
const VERSION='groq-visual-evidence-v4';
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function editorVisionScope(options:EditorJsonOptions,credential:string){
 let projectId=options.editingBudget?.projectId;
 if(!projectId)try{projectId=JSON.parse(options.prompt.split('\nValidation feedback:')[0]).project?.id;}catch{/* Generic calls have no shared cache. */}
 const userId=typeof options.userId==='string'&&options.userId.length<=200?options.userId:null;
 if(typeof projectId!=='string'||!projectId||projectId.length>200)projectId=undefined;
 return {key:digest([VERSION,userId,projectId||null,options.editingBudget?.jobId||null,digest(credential)]),shared:!!userId&&!!projectId};
}
/** In-process, completed observations only. No image bytes, credentials or final
 * plans. Scope includes user/project/job and credential identity; every caller
 * still checks current provider enablement before using a cached observation.
 */
export class EditorVisionCache {
 private entries=new Map<string,{expires:number;bytes:number;value:EditorVisualContext}>();
 private bytes=0;
 constructor(private maxEntries=32,private ttlMs=120000,private maxBytes=524288){}
 private remove(key:string){const entry=this.entries.get(key);if(entry)this.bytes-=entry.bytes;this.entries.delete(key);}
 private prune(now:number){for(const [key,value]of this.entries)if(value.expires<=now)this.remove(key);}
 get(scope:string,signature:string,now=Date.now()):EditorVisualContext|undefined{
  this.prune(now);const key=scope+':'+signature,entry=this.entries.get(key);if(!entry)return;
  this.entries.delete(key);this.entries.set(key,entry);return JSON.parse(JSON.stringify(entry.value)) as EditorVisualContext;
 }
 put(scope:string,context:EditorVisualContext,now=Date.now()){
  this.prune(now);
  const value:EditorVisualContext={scope,signature:context.signature,model:context.model,observations:readVisualObservations({observations:context.observations},context.observations.length)},serialized=JSON.stringify(value),bytes=Buffer.byteLength(serialized,'utf8');
  if(bytes>this.maxBytes)return;
  const key=scope+':'+context.signature;this.remove(key);
  while(this.entries.size>=this.maxEntries||this.bytes+bytes>this.maxBytes){const oldest=this.entries.keys().next().value;if(oldest===undefined)return;this.remove(oldest);}
  this.entries.set(key,{expires:now+this.ttlMs,bytes,value:JSON.parse(serialized) as EditorVisualContext});this.bytes+=bytes;
 }
}
export const editorVisionCache=new EditorVisionCache();
