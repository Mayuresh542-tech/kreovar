"use client";
import {Scissors,Trash2} from "lucide-react";
import {useProject,usePlayback} from "@/app/lib/editor/store";
import {changeClipProperty,removeClip,splitClip} from "@/app/lib/editor/operations";
import {projectDuration} from "@/app/lib/editor/model";
import {assertVideoDuration} from "@/app/lib/editor/limits";
import {useEditor} from "./EditorContext";
export default function QuickClipToolbar(){
 const {store,playback,selection,select,run}=useEditor(),p=useProject(store),{time}=usePlayback(playback);
 const clips=selection.map(id=>p.clips[id]).filter(Boolean);if(!clips.length)return null;
 const unlocked=clips.filter(c=>!p.tracks[c.trackId].locked),splittable=unlocked.filter(c=>time-c.startTime>=1/p.settings.fps&&c.startTime+c.duration-time>=1/p.settings.fps);
 const media=clips.length===1&&clips[0].assetId?p.assets[clips[0].assetId]:undefined,c=clips[0],audio=media&&media.kind!=="image";
 return <div className="vx-clip-toolbar" role="toolbar" aria-label="Selected clip actions"><strong title={c.name}>{clips.length===1?c.name:`${clips.length} clips selected`}</strong><button aria-label="Split selected clips at playhead" disabled={!splittable.length} onClick={()=>run(p=>splittable.reduce((q,c)=>splitClip(q,c.id,time),p))}><Scissors size={14}/> Split</button>{audio&&<><label>Volume<select aria-label="Selected clip volume" disabled={!unlocked.length} value={c.volume} onChange={e=>run(p=>changeClipProperty(p,c.id,{volume:Number(e.target.value)}))}>{[...new Set([0,.25,.5,.75,1,1.5,2,c.volume])].sort((a,b)=>a-b).map(v=><option key={v} value={v}>{Math.round(v*100)}%</option>)}</select></label><label>Speed<select aria-label="Selected clip speed" disabled={!unlocked.length} value={c.speed} onChange={e=>run(p=>(()=>{const next=changeClipProperty(p,c.id,{speed:Number(e.target.value)});assertVideoDuration(projectDuration(next));return next;})())}>{[...new Set([.25,.5,.75,1,1.25,1.5,2,4,c.speed])].sort((a,b)=>a-b).map(v=><option key={v} value={v}>{v}×</option>)}</select></label><span className="vx-hint">Speed changes need caption timing review.</span></>}<button aria-label="Delete selected unlocked clips" disabled={!unlocked.length} onClick={()=>{run(p=>unlocked.reduce((q,c)=>removeClip(q,c.id),p));select(clips.filter(c=>p.tracks[c.trackId].locked).map(c=>c.id));}}><Trash2 size={14}/> Delete</button>{!unlocked.length&&<span>Track locked</span>}</div>;
}
