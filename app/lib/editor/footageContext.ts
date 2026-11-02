import type {EditorProject} from './model';
export interface FootageFrame {clipId:string;timelineTime:number;sourceTime:number;width:number;height:number;data:string}
export function analysisFootage(p:EditorProject,selection:string[]=[]){
 const selected=selection.map(id=>p.clips[id]).filter(Boolean);
 return Object.values(p.clips).filter(c=>c.assetId&&p.assets[c.assetId]?.kind==='video'&&!p.assets[c.assetId].stockKey&&p.tracks[c.trackId]?.kind==='video'&&!p.tracks[c.trackId].hidden&&(!selected.length||selected.some(s=>s.id===c.id||!!s.contentId&&s.startTime<c.startTime+c.duration&&c.startTime<s.startTime+s.duration))).sort((a,b)=>a.startTime-b.startTime);
}
/** Sampling positions are observation coverage, never editing decisions. */
export function footageSampleTargets(p:EditorProject,selection:string[]=[],limit=6){
 const clips=analysisFootage(p,selection),total=clips.reduce((sum,c)=>sum+c.duration,0);if(!total)return [];
 return Array.from({length:Math.min(6,Math.max(1,limit))},(_,i)=>{let offset=(i+.5)*total/Math.min(6,Math.max(1,limit));const clip=clips.find(c=>{if(offset<c.duration)return true;offset-=c.duration;return false;})||clips[clips.length-1];const elapsed=Math.max(0,Math.min(offset,clip.duration-1/p.settings.fps));return {clipId:clip.id,timelineTime:clip.startTime+elapsed,sourceTime:clip.sourceStart+elapsed*clip.speed};});
}

/** Original six targets plus bounded probes and short-clip coverage. */
export function footageProbeTargets(p:EditorProject,selection:string[]=[]){
 const clips=analysisFootage(p,selection),targets=footageSampleTargets(p,selection),total=clips.reduce((n,c)=>n+c.duration,0);if(!total)return [];
 const target=(clip:typeof clips[number],elapsed:number)=>{elapsed=Math.max(0,Math.min(elapsed,clip.duration-1/p.settings.fps));return {clipId:clip.id,timelineTime:clip.startTime+elapsed,sourceTime:clip.sourceStart+elapsed*clip.speed};};
 for(let i=0;i<12;i++){let offset=(i+.5)*total/12;const clip=clips.find(c=>{if(offset<c.duration)return true;offset-=c.duration;return false;})||clips[clips.length-1];targets.push(target(clip,offset));}
 for(let i=0;i<Math.min(6,clips.length);i++){const clip=clips[Math.floor(i*clips.length/Math.min(6,clips.length))];targets.push(target(clip,clip.duration/2));}
 return targets.filter((t,i,a)=>a.findIndex(x=>x.clipId===t.clipId&&Math.abs(x.sourceTime-t.sourceTime)<.00001)===i).sort((a,b)=>a.timelineTime-b.timelineTime||a.clipId.localeCompare(b.clipId));
}
