"use client";
import {useRef} from 'react';
import type {CaptionSegment} from '@/app/lib/captions/presets';
export default function CaptionMiniTimeline({segments,duration,time,onSeek,onChange,onError,disabled}:{segments:CaptionSegment[];duration:number;time:number;onSeek:(time:number)=>void;onChange:(segments:CaptionSegment[])=>void;onError:(message:string)=>void;disabled:boolean}){
 const track=useRef<HTMLDivElement>(null),limit=duration||Math.max(1,...segments.map(s=>s.end));
 function drag(e:React.PointerEvent,segment:CaptionSegment,edge:'move'|'start'|'end'){
  if(disabled||!track.current)return;e.preventDefault();e.stopPropagation();const el=e.currentTarget as HTMLElement,startX=e.clientX,width=track.current.getBoundingClientRect().width,rows=segments;
  el.setPointerCapture(e.pointerId);let delta=0;
  const move=(event:PointerEvent)=>{delta=(event.clientX-startX)/width*limit;el.style.opacity='.6';};
  const end=(event:PointerEvent)=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',end);el.removeEventListener('pointercancel',cancel);el.style.opacity='';if(event.type==='pointercancel')return;
   let start=segment.start,nextEnd=segment.end;
   if(edge==='move'){delta=Math.max(-start,Math.min(limit-nextEnd,delta));start+=delta;nextEnd+=delta;}else if(edge==='start')start=Math.max(0,Math.min(nextEnd-.04,start+delta));else nextEnd=Math.min(limit,Math.max(start+.04,nextEnd+delta));
   if(start===segment.start&&nextEnd===segment.end)return;
   if(rows.some(s=>s.id!==segment.id&&s.start<nextEnd-1e-6&&s.end>start+1e-6)){onError('That move would overlap another caption.');return;}
   const retained=segment.words.map((w,index)=>({index,word:{...w,start:edge==='move'?w.start+delta:Math.max(start,w.start),end:edge==='move'?w.end+delta:Math.min(nextEnd,w.end)}})).filter(v=>v.word.end>v.word.start),words=retained.map(v=>v.word);
   const next={...segment,start,end:nextEnd,words,...(edge!=='move'&&segment.words.length?{text:words.map(w=>w.word).join(' '),emphasizedWords:retained.flatMap((v,i)=>segment.emphasizedWords?.includes(v.index)?[i]:[]),wordStyles:Object.fromEntries(retained.flatMap((v,i)=>segment.wordStyles?.[v.index]?[[i,segment.wordStyles[v.index]]]:[]))}:{})};
   if(segment.words.length&&!words.length){onError('This trim would remove every word in the caption.');return;}onChange(rows.map(s=>s.id===segment.id?next:s));
  };
  const cancel=(event:PointerEvent)=>end(event);el.addEventListener('pointermove',move);el.addEventListener('pointerup',end);el.addEventListener('pointercancel',cancel);
 }
 return <div className="my-3 rounded-xl border border-slate-200 bg-white p-3"><p className="mb-2 text-xs font-semibold">Caption timeline <span className="font-normal text-slate-500">· drag blocks to move, edges to trim</span></p><div ref={track} className="relative h-14 overflow-hidden rounded-lg bg-slate-100" aria-label="Caption timeline" onClick={e=>{const rect=e.currentTarget.getBoundingClientRect();onSeek(Math.max(0,Math.min(limit,(e.clientX-rect.left)/rect.width*limit)));}}>
  {segments.map((s,i)=><div key={s.id} title={`${s.start.toFixed(2)}–${s.end.toFixed(2)}s · ${s.text}`} onPointerDown={e=>drag(e,s,'move')} className="absolute top-2 flex h-10 touch-none overflow-hidden rounded border border-blue-500 bg-blue-100 text-[10px] text-blue-950" style={{left:s.start/limit*100+'%',width:(s.end-s.start)/limit*100+'%',minWidth:8}}><button type="button" aria-label={`Trim caption ${i+1} start`} disabled={disabled} onPointerDown={e=>drag(e,s,'start')} className="w-2 shrink-0 cursor-ew-resize bg-blue-300"/><button type="button" aria-label={`Seek caption ${i+1}`} disabled={disabled} className="min-w-0 flex-1 truncate px-1 text-left" onClick={e=>{e.stopPropagation();onSeek(s.start);}}>{s.text}</button><button type="button" aria-label={`Trim caption ${i+1} end`} disabled={disabled} onPointerDown={e=>drag(e,s,'end')} className="w-2 shrink-0 cursor-ew-resize bg-blue-300"/></div>)}<div className="pointer-events-none absolute inset-y-0 w-px bg-rose-500" style={{left:Math.min(100,time/limit*100)+'%'}}/>
 </div><div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>0:00</span><span>{limit.toFixed(2)}s</span></div></div>;
}
