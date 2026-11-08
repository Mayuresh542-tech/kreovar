import { Clip, EditorProject } from "./model";
export interface TimedCaption {text:string;start:number;duration:number;words?:{word:string;start:number;end:number}[]}
/** Source timestamps become timeline timestamps after trim, movement and speed changes. */
export function captionsForClip(clip:Clip,words:unknown):TimedCaption[]{
 if(!Array.isArray(words)||words.length>30000)throw new Error("Invalid transcription response.");
 const result:TimedCaption[]=[];let group:{word:string;start:number;end:number}[]=[];
 const flush=()=>{
  if(!group.length)return;
  for(let i=0;i<group.length;i++){
   if(i>0&&group[i].start<group[i-1].start)group[i].start=group[i-1].start;
   if(i<group.length-1&&group[i].end>group[i+1].start)group[i].end=Math.max(group[i].start,group[i+1].start);
  }
  const maxEnd=Math.max(...group.map(w=>w.end)),start=clip.startTime+(group[0].start-clip.sourceStart)/clip.speed,end=clip.startTime+(maxEnd-clip.sourceStart)/clip.speed,duration=Math.max(.01,end-start),text=group.map(w=>w.word).join(' ');
  if(duration<.002){const previous=result.at(-1);if(previous&&start<=previous.start+previous.duration+.001&&end>=previous.start){previous.text+=' '+text;previous.words=undefined;group=[];}return;}
  result.push({text,start,duration,words:group.map(w=>({word:w.word,start:(w.start-group[0].start)/clip.speed,end:Math.min(duration,Math.max((w.start-group[0].start)/clip.speed,(w.end-group[0].start)/clip.speed))}))});group=[];
 };
 for(const value of words){
  if(!value||typeof value!=='object')continue;const w=value as Record<string,unknown>;
  if(typeof w.word!=='string'||typeof w.start!=='number'||typeof w.end!=='number'||!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.end<w.start||!w.word.trim())continue;
  const start=Math.max(clip.sourceStart,w.start),end=Math.min(clip.sourceEnd,w.end);
  if(end<start||(end===start&&w.end>w.start))continue;
  if(group.length&&start-group[group.length-1].end>.7)flush();
  group.push({word:w.word.trim(),start,end});if(group.length>=4)flush();
 }
 flush();if(group.length)throw new Error('Some speech words have no usable timing. Retry transcription.');return result;
}

function timestamp(seconds:number){const ms=Math.round(Math.max(0,seconds)*1000);return [Math.floor(ms/3600000),Math.floor(ms/60000)%60,Math.floor(ms/1000)%60].map(n=>String(n).padStart(2,"0")).join(":")+","+String(ms%1000).padStart(3,"0");}
export function captionsSrt(project:EditorProject){return Object.values(project.clips).filter(c=>c.contentId&&project.captions[c.contentId]&&!project.tracks[c.trackId].hidden).sort((a,b)=>a.startTime-b.startTime).map((c,i)=>[String(i+1),timestamp(c.startTime)+" --> "+timestamp(c.startTime+c.duration),project.captions[c.contentId!].text.replace(/\r/g,"")].join("\n")).join("\n\n");}
