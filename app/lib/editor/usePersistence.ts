"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getProjectWithSource, saveProjectWithResult } from "../services/projectService";
import { createProjectSyncChannel } from "../services/projectRecoveryService";
import { VeeloxProject, VeeloxTimeline } from "../services/types";
import { EditorProject } from "./model";
import { cacheKey, cacheRead } from "./cache";
import { projectFromRecord, mergeProjectAssets, toLegacy } from "./bridge";
import { syncCloudOriginals, withKnownCloudOriginals, type CloudOriginal } from "./cloudMedia";
import { EditorStore } from "./store";

import {chooseRecovery,saveCheckpoint} from "./recovery";

export type SaveState="loading"|"unsaved"|"saving"|"saved"|"local"|"failed";
export function usePersistence(store:EditorStore,userId?:string){
  const [state,setState]=useState<SaveState>("loading"),[error,setError]=useState<string>(),[conflict,setConflict]=useState(false);
  const [recoveryMessage,setRecoveryMessage]=useState<string>();
  const [ready,setReady]=useState(false);
  const metadata=useRef<VeeloxProject|null>(null),saveNow=useRef<()=>void>(()=>{});
  const reload=useCallback(()=>{window.location.reload();},[]);
  useEffect(()=>{
    let alive=true,loaded=false,busy=false,blocked=false,queued:EditorProject|undefined,timer:ReturnType<typeof setTimeout>|undefined,savedRevision=-1;
    const id=store.getSnapshot().id,scope=cacheKey(userId,id),originals=new Map<string,CloudOriginal>(),uploadController=new AbortController();
    const channel=createProjectSyncChannel(scope,msg=>{if(msg.type==="PROJECT_SAVED"&&loaded){blocked=true;setConflict(true);}});
    async function persist(target:EditorProject){
      if(blocked)return;
      if(busy){queued=target;return;}
      busy=true;target=withKnownCloudOriginals(target,originals);if(alive)setState("saving");
      try{
        await saveCheckpoint(scope,target);
        let timeline=toLegacy(target);
        // Existing service preserves upstream assets, scene data, credits, and RLS.
        let result=await saveProjectWithResult({...metadata.current,id:target.id,title:target.title,duration:timeline.duration,aspect_ratio:target.settings.aspectRatio==="4:5"?"9:16":target.settings.aspectRatio==="4:3"?"16:9":target.settings.aspectRatio,timeline:timeline as unknown as VeeloxTimeline,revision:target.revision,status:"editing"});
        if(userId&&result.persistedToDb&&Object.values(target.assets).some(asset=>!asset.libraryId&&asset.localKey&&(!asset.cloud||asset.cloud.sourceKey!==asset.localKey||asset.cloud.projectId!==target.id||!asset.cloud.path.startsWith(`${userId}/${target.id}/`)))){
          try{
            const backedUp=await syncCloudOriginals(target,userId,originals,AbortSignal.any([uploadController.signal,AbortSignal.timeout(180000)]),message=>{if(alive)setError(message);});
            if(uploadController.signal.aborted)return;
            timeline=toLegacy(backedUp);
            result=await saveProjectWithResult({...result.project,timeline:timeline as unknown as VeeloxTimeline,revision:target.revision});
            if(!result.persistedToDb)throw new Error(result.error||"Cloud media references could not be saved.");
            savedRevision=target.revision;store.attachCloudAssets(backedUp);
            await saveCheckpoint(scope,withKnownCloudOriginals(store.getCommittedSnapshot(),originals));
          }catch(e){
            if(alive){setState("local");setError(e instanceof Error?e.message:"Cloud media sync failed. Your originals remain on this device.");}
            return;
          }
        }
        if(result.persistedToDb)metadata.current=result.project;
        if(!result.persistedToDb&&userId){if(alive){setState("local");setError(result.error||"Cloud sync unavailable. Your edit is saved on this device.");}}
        else if(alive){setState(store.getCommittedSnapshot().revision!==target.revision?"unsaved":userId?"saved":"local");setError(undefined);}
        savedRevision=target.revision;
        if(result.persistedToDb)channel.broadcast({type:"PROJECT_SAVED",revision:target.revision,timestamp:Date.now()});
      }catch(e){if(alive){setState("failed");setError(e instanceof Error?e.message:"Could not save the project.");}}
      finally{busy=false;if(alive&&queued){const next=queued;queued=undefined;void persist(next);}}
    }
    saveNow.current=()=>{if(timer)clearTimeout(timer);if(loaded)void persist(store.getSnapshot());};
    void (async()=>{
      try{
        const [loadedRecord,local]=await Promise.all([getProjectWithSource(id).catch(()=>({project:null,source:"local" as const})),cacheRead<EditorProject>("projects",scope).catch(()=>undefined)]);
        if(!alive)return;
        const record=loadedRecord.project;
        const owned=record&&(!record.user_id||record.user_id===userId)?record:null;metadata.current=owned;
        const cloud=owned?projectFromRecord(owned):undefined;
        const recovery=chooseRecovery(local,cloud,id);
        if(recovery.restored)setRecoveryMessage("Restored your latest device checkpoint. Cloud sync will retry automatically.");
        else if(recovery.invalid)setRecoveryMessage("An invalid device checkpoint was skipped; your saved project was preserved.");
        const selectedProject=recovery.project||store.getSnapshot();
        const project=owned?mergeProjectAssets(selectedProject,owned):selectedProject;
        const needsBackup=!!userId&&Object.values(project.assets).some(asset=>!asset.libraryId&&asset.localKey&&(!asset.cloud||asset.cloud.sourceKey!==asset.localKey||asset.cloud.projectId!==project.id||!asset.cloud.path.startsWith(`${userId}/${project.id}/`)));
        store.load(project);savedRevision=project.revision;loaded=true;setReady(true);setState(userId&&loadedRecord.source==="cloud"&&cloud&&project===cloud&&!needsBackup?"saved":"local");
        // Reopening newer device recovery must retry cloud sync without another edit.
        if(userId&&(loadedRecord.source!=="cloud"||project!==cloud||needsBackup))timer=setTimeout(()=>void persist(store.getSnapshot()),1200);
      }catch(e){blocked=true;if(alive){loaded=false;setReady(true);setState("failed");setError(e instanceof Error?e.message:"Project load failed.");}}
    })();
    const unsubscribe=store.subscribe(()=>{
      if(!loaded||store.interacting||store.getSnapshot().revision===savedRevision||blocked)return;
      const target=store.getSnapshot();setState("unsaved");if(timer)clearTimeout(timer);
      // Recovery writes commit snapshots only; no mouse-move writes.
      void saveCheckpoint(scope,target).catch(e=>{if(alive){setState("failed");setError(e.message);}});
      timer=setTimeout(()=>void persist(store.getSnapshot()),1200);
    });
    const online=()=>saveNow.current();
    const checkpoint=()=>{if(loaded&&!blocked)void saveCheckpoint(scope,store.getCommittedSnapshot()).catch(()=>{});};
    const hidden=()=>{if(document.visibilityState==="hidden")checkpoint();};
    document.addEventListener("visibilitychange",hidden);window.addEventListener("pagehide",checkpoint);
    const leaving=(event:BeforeUnloadEvent)=>{if(loaded&&store.getSnapshot().revision!==savedRevision){void saveCheckpoint(scope,store.getCommittedSnapshot()).catch(()=>{});event.preventDefault();}};
    window.addEventListener("online",online);window.addEventListener("beforeunload",leaving);
    return()=>{checkpoint();document.removeEventListener("visibilitychange",hidden);window.removeEventListener("pagehide",checkpoint);alive=false;uploadController.abort();unsubscribe();channel.destroy();if(timer)clearTimeout(timer);window.removeEventListener("online",online);window.removeEventListener("beforeunload",leaving);};
  },[store,userId]);
  const retry=useCallback(()=>saveNow.current(),[]);
  return {state,error,ready,retry,conflict,reload,recoveryMessage,dismissRecovery:()=>setRecoveryMessage(undefined)};
}
