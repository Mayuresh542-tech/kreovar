
import {type Clip,type EditorProject,projectDuration,uid} from './model';
export interface CutRange {start:number;end:number}
export function normalizedCuts(p:EditorProject,ranges:CutRange[]):CutRange[]{
 if(!Array.isArray(ranges)||!ranges.length||ranges.length>20)throw Error('Choose between 1 and 20 cut ranges.');
 const fps=p.settings.fps,duration=projectDuration(p);
 const sorted=ranges.map(r=>{
  if(!Number.isFinite(r.start)||!Number.isFinite(r.end)||r.start<0||r.end>duration+1e-6||r.end<=r.start)throw Error('Cut ranges must be inside the timeline.');
  const start=Math.round(r.start*fps)/fps,end=Math.min(duration,Math.round(r.end*fps)/fps);
  if(end-start<1/fps-1e-6)throw Error('A cut must remove at least one frame.');
  return {start,end};
 }).sort((a,b)=>a.start-b.start);
 const merged:CutRange[]=[];
 for(const r of sorted){const last=merged.at(-1);if(last&&r.start<=last.end+1e-6)last.end=Math.max(last.end,r.end);else merged.push({...r});}
 if(merged.reduce((sum,r)=>sum+r.end-r.start,0)>=duration-1/fps)throw Error('Keep at least one frame of the project.');
 return merged;
}
/** Remove time globally, including overlays/audio/captions, to keep all surviving tracks aligned. */
export function rippleCut(p:EditorProject,ranges:CutRange[]):EditorProject{
 const cuts=normalizedCuts(p,ranges),min=1/p.settings.fps,shift=(t:number)=>cuts.reduce((sum,r)=>sum+Math.max(0,Math.min(t,r.end)-r.start),0);
 const clips:Record<string,Clip>={},tracks=Object.fromEntries(Object.entries(p.tracks).map(([id,t])=>[id,{...t,clipIds:[] as string[]}]));
 const captions={...p.captions},textLayers={...p.textLayers};
 for(const trackId of p.trackOrder)for(const id of p.tracks[trackId].clipIds){
  const c=p.clips[id];let segments=[{start:c.startTime,end:c.startTime+c.duration}];
  for(const r of cuts)segments=segments.flatMap(s=>r.end<=s.start||r.start>=s.end?[s]:[...(r.start>s.start?[{start:s.start,end:r.start}]:[]),...(r.end<s.end?[{start:r.end,end:s.end}]:[])]);
  const changed=segments.length!==1||Math.abs((segments[0]?.start??0)-c.startTime)>1e-6||Math.abs((segments[0]?.end??0)-(c.startTime+c.duration))>1e-6||shift(c.startTime)>1e-6;
  if(changed&&p.tracks[c.trackId].locked)throw Error('Unlock every affected track before ripple cutting; audio and captions must stay aligned.');
  if(!changed){clips[id]=c;tracks[trackId].clipIds.push(id);continue;}
  if(segments.some(s=>s.end-s.start<min-1e-6))throw Error('This cut would leave a fragment shorter than one frame. Adjust the cut boundary.');
  if(c.contentId){delete captions[c.contentId];delete textLayers[c.contentId];}
  segments.forEach((s,index)=>{
   const newId=index===0?id:uid(),sourceStart=c.sourceStart+(s.start-c.startTime)*c.speed,sourceEnd=c.sourceStart+(s.end-c.startTime)*c.speed;
   const contentId=c.contentId?uid():undefined;
   if(contentId&&c.contentId){
    const caption=p.captions[c.contentId],text=p.textLayers[c.contentId];
    if(caption){const words=caption.words?.filter(w=>w.end>sourceStart&&w.start<sourceEnd).map(w=>({...w,start:Math.max(sourceStart,w.start),end:Math.min(sourceEnd,w.end)}));captions[contentId]={...caption,id:contentId,...(words?{words,text:words.map(w=>w.word).join(' ')}:{})};}
    if(text)textLayers[contentId]={...text,id:contentId};
   }
   const clip:Clip={...c,id:newId,...(contentId?{contentId}:{}),startTime:Math.max(0,s.start-shift(s.start)),duration:s.end-s.start,sourceStart,sourceEnd,
    fadeIn:Math.abs(s.start-c.startTime)<1e-6?Math.min(c.fadeIn,s.end-s.start):0,
    fadeOut:Math.abs(s.end-c.startTime-c.duration)<1e-6?Math.min(c.fadeOut,s.end-s.start):0};
   clips[newId]=clip;tracks[trackId].clipIds.push(newId);
  });
 }
 const transitions=Object.fromEntries(Object.entries(p.transitions).filter(([,t])=>{
  const a=clips[t.fromClipId],b=clips[t.toClipId],oldA=p.clips[t.fromClipId],oldB=p.clips[t.toClipId];
  return a&&b&&Math.abs(a.sourceEnd-oldA.sourceEnd)<1e-6&&Math.abs(b.sourceStart-oldB.sourceStart)<1e-6&&Math.abs(a.startTime+a.duration-b.startTime)<min&&t.duration<=Math.min(a.duration,b.duration);
 }));
 return {...p,clips,tracks,captions,textLayers,transitions};
}
