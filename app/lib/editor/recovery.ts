import {aiProjectSnapshot} from './aiValidation';
import {cacheRead,cacheWriteBatch} from './cache';
import type {EditorProject} from './model';
export function validRecovery(value:unknown,id:string):EditorProject|undefined{
 try{const p=value as EditorProject;if(!p||p.id!==id||p.schemaVersion!==1||!Number.isSafeInteger(p.revision)||!Number.isFinite(Date.parse(p.updatedAt)))return;aiProjectSnapshot(p);for(const t of Object.values(p.transitions)){if(!p.clips[t.fromClipId]||!p.clips[t.toClipId])return;}return p;}catch{return;}
}
export function chooseRecovery(local:unknown,cloud:EditorProject|undefined,id:string){
 const device=validRecovery(local,id),remote=validRecovery(cloud,id);
 if(cloud&&!remote)throw new Error("The saved project could not be validated. Autosave is paused to preserve it.");
 const restored=!!device&&(!remote||device.revision>remote.revision||device.revision===remote.revision&&Date.parse(device.updatedAt)>Date.parse(remote.updatedAt));
 return {project:restored?device:remote,restored,invalid:!!local&&!device};
}
const queues=new Map<string,Promise<void>>();
export function saveCheckpoint(scope:string,project:EditorProject):Promise<void>{
 const task=(queues.get(scope)||Promise.resolve()).catch(()=>{}).then(async()=>{
  if(!validRecovery(project,project.id))throw new Error('The recovery snapshot is invalid. Your last valid backup was preserved.');
  const old=await cacheRead<EditorProject>('projects',scope);
  if(old?.id===project.id&&old.revision>project.revision)return;
  const previous=validRecovery(old,project.id);
  await cacheWriteBatch('projects',[...(previous&&previous.revision!==project.revision?[[scope+':previous',previous] as [string,unknown]]:[]),[scope,project]]);
 });
 queues.set(scope,task);void task.finally(()=>{if(queues.get(scope)===task)queues.delete(scope);}).catch(()=>{});return task;
}
