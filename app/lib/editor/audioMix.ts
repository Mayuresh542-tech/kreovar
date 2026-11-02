import {clamp,type Clip,type EditorProject,type AudioRole} from './model';
export function audioRole(p:EditorProject,c:Clip):AudioRole{return c.audioRole||(p.tracks[c.trackId].kind==='video'?'speech':'background');}
export function speechWindows(p:EditorProject):{start:number;end:number}[]{
 const captions=Object.values(p.clips).filter(c=>c.contentId&&p.captions[c.contentId]&&!p.tracks[c.trackId].hidden);
 const windows:{start:number;end:number}[]=[];
 for(const c of Object.values(p.clips)){
  const track=p.tracks[c.trackId],asset=c.assetId?p.assets[c.assetId]:undefined;
  if(!asset||asset.kind==='image'||track.hidden||track.muted||!c.volume||audioRole(p,c)!=='speech')continue;
  const end=c.startTime+c.duration,overlap=captions.filter(cap=>cap.startTime<end&&cap.startTime+cap.duration>c.startTime);
  // Caption times provide speech cues. Untranscribed speech uses the whole voice clip, not guessed pauses.
  if(overlap.length)for(const cap of overlap)windows.push({start:Math.max(c.startTime,cap.startTime),end:Math.min(end,cap.startTime+cap.duration)});
  else windows.push({start:c.startTime,end});
 }
 return windows.sort((a,b)=>a.start-b.start);
}
export function clipGain(p:EditorProject,c:Clip,time:number,windows=speechWindows(p)){
 const track=p.tracks[c.trackId],local=time-c.startTime;
 if(track.hidden||track.muted||local<0||local>c.duration)return 0;
 const fade=Math.min(c.fadeIn?clamp(local/c.fadeIn,0,1):1,c.fadeOut?clamp((c.duration-local)/c.fadeOut,0,1):1);
 let duck=1;
 if(p.settings.audioDucking&&c.ducking!==false&&audioRole(p,c)!=='speech')for(const w of windows){
  if(time<w.start-.08||time>w.end+.22)continue;
  const amount=time<w.start?clamp((time-w.start+.08)/.08,0,1):time>w.end?clamp(1-(time-w.end)/.22,0,1):1;
  duck=Math.min(duck,1-.75*amount);
 }
 return c.volume*fade*duck;
}
