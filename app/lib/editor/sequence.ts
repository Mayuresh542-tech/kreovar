import {addClip} from './operations';
import {projectDuration,type EditorProject} from './model';
import {assertVideoDuration} from './limits';
/** Appends originals without overlaps or gaps, in the user's explicit order, as one edit. */
export function appendSequence(p:EditorProject,assetIds:string[],trackId?:string){
 if(!assetIds.length||assetIds.length>30||new Set(assetIds).size!==assetIds.length)throw new Error('Choose up to 30 distinct video assets.');
 const track=trackId?p.tracks[trackId]:p.trackOrder.map(id=>p.tracks[id]).find(t=>t.kind==='video'&&!t.locked);
 if(!track||track.kind!=='video'||track.locked)throw new Error('Choose an unlocked video track for the sequence.');
 const assets=assetIds.map(id=>p.assets[id]);if(assets.some(a=>!a||a.kind!=='video'||!Number.isFinite(a.duration)||a.duration<1/p.settings.fps))throw new Error('Every sequence item needs a usable video original.');
 let time=Math.max(0,...track.clipIds.map(id=>p.clips[id].startTime+p.clips[id].duration));
 const end=time+assets.reduce((n,a)=>n+a.duration,0);assertVideoDuration(Math.max(end,projectDuration(p)));
 let next=p;const clipIds:string[]=[];
 for(const asset of assets){const id=crypto.randomUUID();next=addClip(next,asset.id,track.id,time,{id,duration:asset.duration,sourceEnd:asset.duration,audioRole:'speech'});clipIds.push(id);time+=asset.duration;}
 return {project:next,clipIds};
}
