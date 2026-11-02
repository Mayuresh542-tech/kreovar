import type {EditorProject} from './model';
import {moveClip} from './operations';
export function zoomAnchor(oldScale:number,newScale:number,left:number,width:number,time:number){
 const visible=time*oldScale>=left&&time*oldScale<=left+width,anchor=visible?time:(left+width/2)/oldScale;
 return Math.max(0,anchor*newScale-(anchor*oldScale-left));
}
export function nudgeClips(p:EditorProject,ids:string[],frames:number){
 if(!ids.length)return p;const clips=ids.map(id=>p.clips[id]);if(clips.some(c=>!c))throw new Error('Selected clips changed. Select them again.');
 const delta=Math.max(-Math.min(...clips.map(c=>c.startTime)),frames/p.settings.fps);
 return clips.reduce((next,c)=>moveClip(next,c.id,c.startTime+delta),p);
}
