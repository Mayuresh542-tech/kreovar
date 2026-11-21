"use client";
import { useSyncExternalStore } from "react";
import { EditorProject } from "./model";
export type Edit = (project: EditorProject) => EditorProject;
export class EditorStore {
  private project:EditorProject;
  private listeners=new Set<()=>void>();
  private past:EditorProject[]=[];private future:EditorProject[]=[];
  private transaction:EditorProject|null=null;
  constructor(project:EditorProject){this.project=project;}
  subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
  getSnapshot=()=>this.project;
  getCommittedSnapshot=()=>this.transaction||this.project;
  private notify(){this.listeners.forEach(fn=>fn());}
  private stamp(next:EditorProject){return {...next,revision:this.project.revision+1,updatedAt:new Date().toISOString()};}
  attachCloudAssets(source:EditorProject){
    if(this.transaction)return;
    let changed=false;const assets={...this.project.assets};
    for(const asset of Object.values(source.assets)){
      const current=assets[asset.id];
      if(current&&asset.cloud&&current.localKey===asset.localKey&&current.cloud!==asset.cloud){assets[asset.id]={...current,cloud:asset.cloud};changed=true;}
    }
    if(changed){this.project={...this.project,assets};this.notify();}
  }
  load(project:EditorProject){this.project=project;this.past=[];this.future=[];this.transaction=null;this.notify();}
  execute(edit:Edit){if(this.transaction)this.commit();const next=edit(this.project);if(next===this.project)return;this.past=[...this.past.slice(-79),this.project];this.future=[];this.project=this.stamp(next);this.notify();}
  /** AI progress is persistent metadata, not a manual undo step. Actual edits still use execute. */
  checkpoint(edit:Edit){if(this.transaction)throw Error('Finish the current edit first.');this.project=this.stamp(edit(this.project));this.notify();}
  begin(){if(!this.transaction)this.transaction=this.project;}
  preview(edit:Edit){this.begin();this.project=edit(this.transaction!);this.notify();}
  commit(){const before=this.transaction;this.transaction=null;if(!before||before===this.project)return;this.past=[...this.past.slice(-79),before];this.future=[];this.project=this.stamp(this.project);this.notify();}
  cancel(){if(this.transaction){this.project=this.transaction;this.transaction=null;this.notify();}}
  undo(){this.cancel();const previous=this.past.at(-1);if(!previous)return;this.past=this.past.slice(0,-1);this.future=[this.project,...this.future];this.project=this.stamp(previous);this.notify();}
  redo(){this.cancel();const next=this.future[0];if(!next)return;this.future=this.future.slice(1);this.past=[...this.past,this.project];this.project=this.stamp(next);this.notify();}
  rollbackToRevision(targetRevision: number): boolean {
    this.cancel();
    if (this.project.revision === targetRevision) return true;
    let index = this.past.findLastIndex((p) => p.revision === targetRevision);
    if (index === -1) {
      index = this.past.findIndex((p) => p.revision >= targetRevision);
    }
    if (index === -1) {
      index = this.past.findLastIndex((p) => p.revision <= targetRevision);
    }
    if (index === -1) return false;
    const targetProject = this.past[index];
    const undone = [this.project, ...this.past.slice(index + 1)];
    this.past = this.past.slice(0, index);
    this.future = [...undone, ...this.future];
    this.project = this.stamp(targetProject);
    this.notify();
    return true;
  }
  get canUndo(){return this.past.length>0;}get canRedo(){return this.future.length>0;}get interacting(){return !!this.transaction;}
}
export function useProject(store:EditorStore){return useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);}
export function useEditorSelector<T>(store:EditorStore,select:(p:EditorProject)=>T){return useSyncExternalStore(store.subscribe,()=>select(store.getSnapshot()),()=>select(store.getSnapshot()));}
/** Frame-rate updates have separate subscribers; the library/inspector/clip list do not rerender. */
export interface PlaybackState {
  time: number;
  playing: boolean;
  speed?: number;
}
export class PlaybackStore {
  private state: PlaybackState = { time: 0, playing: false, speed: 1 };
  private listeners = new Set<() => void>();
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.state;
  set(time: number, playing = this.state.playing, speed = this.state.speed ?? 1) {
    time = Number.isFinite(time) ? Math.max(0, time) : this.state.time;
    const safeSpeed = Number.isFinite(speed) ? speed : 1;
    if (time === this.state.time && playing === this.state.playing && safeSpeed === (this.state.speed ?? 1)) return;
    this.state = { time, playing, speed: safeSpeed };
    this.listeners.forEach((fn) => fn());
  }
}
export function usePlayback(store:PlaybackStore){return useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);}
