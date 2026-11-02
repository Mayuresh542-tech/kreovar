import {type EditorProject,projectDuration} from "./model";
/** Report measurable impact, without claiming semantic or acoustic analysis. */
export function reviewEdit(before:EditorProject,after:EditorProject){
 const removed=Object.keys(before.clips).filter(id=>!after.clips[id]);
 const changed=Object.values(before.clips).filter(c=>after.clips[c.id]&&JSON.stringify(c)!==JSON.stringify(after.clips[c.id]));
 const warnings:string[]=[];
 if(projectDuration(after)<projectDuration(before)-1/before.settings.fps)warnings.push("The timeline will be shortened. Review cut boundaries and speech before applying.");
 if(removed.length)warnings.push(`${removed.length} existing clip(s) will be removed.`);
 if(before.settings.aspectRatio!==after.settings.aspectRatio)warnings.push("The project aspect ratio will change.");
 for(const c of changed){const next=after.clips[c.id];if(c.assetId&&before.assets[c.assetId]?.kind!=="image"&&next.speed!==c.speed)warnings.push(`${c.name}: speed changes from ${c.speed}× to ${next.speed}×; check speech sync.`);}
 const video=Object.values(after.clips).filter(c=>after.tracks[c.trackId].kind==="video"&&!after.tracks[c.trackId].hidden).sort((a,b)=>a.startTime-b.startTime);
 let covered=0;
 for(const c of video){if(c.startTime>covered+1/after.settings.fps)warnings.push(`Main footage gap: ${covered.toFixed(2)}–${c.startTime.toFixed(2)}s. Review overlays or background here.`);covered=Math.max(covered,c.startTime+c.duration);}
 return {removed:removed.length,added:Object.keys(after.clips).filter(id=>!before.clips[id]).length,changed:changed.length,durationDelta:projectDuration(after)-projectDuration(before),warnings:[...new Set(warnings)]};
}
