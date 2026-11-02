"use client";
import {useRef,useState} from "react";
import {Play,Pause,RotateCcw,RotateCw} from "lucide-react";
export default function AudioPlayer({src,onDuration,onError}:{src:string;onDuration?:(seconds:number)=>void;onError?:(message:string)=>void}){
 const audio=useRef<HTMLAudioElement>(null),[time,setTime]=useState(0),[duration,setDuration]=useState(0),[playing,setPlaying]=useState(false);
 function seek(value:number){if(audio.current&&Number.isFinite(duration)&&duration>0){audio.current.currentTime=Math.max(0,Math.min(duration,value));setTime(audio.current.currentTime);}}
 async function toggle(){try{if(!audio.current)return;if(audio.current.paused)await audio.current.play();else audio.current.pause();}catch{onError?.("Audio could not play. Please retry.");}}
 const stamp=(value:number)=>`${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,"0")}`;
 return <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
  <audio key={src} ref={audio} src={src} preload="metadata" onLoadedMetadata={e=>{const d=e.currentTarget.duration;if(Number.isFinite(d)){setDuration(d);setTime(0);setPlaying(false);onDuration?.(d);}}} onTimeUpdate={e=>setTime(e.currentTarget.currentTime)} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onError={()=>onError?.("Audio could not load. Try generating it again.")} />
  <div className="flex items-center gap-3"><button type="button" aria-label={playing?"Pause voiceover":"Play voiceover"} onClick={()=>void toggle()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">{playing?<Pause size={18}/>:<Play size={18}/>}</button>
   <button type="button" disabled={!duration} aria-label="Back 5 seconds" onClick={()=>seek(time-5)} className="flex h-11 items-center gap-1 px-2"><RotateCcw size={17}/>5s</button>
   <button type="button" disabled={!duration} aria-label="Forward 5 seconds" onClick={()=>seek(time+5)} className="flex h-11 items-center gap-1 px-2"><RotateCw size={17}/>5s</button>
   <span className="ml-auto text-xs tabular-nums text-slate-600">{stamp(time)} / {stamp(duration)}</span></div>
  <input aria-label="Voiceover position" type="range" min={0} max={duration||0} step={0.05} value={Math.min(time,duration)} disabled={!duration} onChange={e=>seek(Number(e.target.value))} className="h-6 w-full accent-blue-600" />
 </div>;
}
