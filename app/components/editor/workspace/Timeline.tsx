"use client";
import { memo, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Volume2, VolumeX, Lock, Unlock, Scissors, Trash2, Copy, Plus, Magnet, ZoomIn, ZoomOut, Merge, Film, Music, Type } from "lucide-react";
import {zoomAnchor} from "@/app/lib/editor/timelineNavigation";
import { Clip, MediaAsset, Track, TrackKind, formatTime, projectDuration } from "@/app/lib/editor/model";
import { addClip, addTrack, changeTrack, duplicateClip, mergeCaptions, moveClip, removeClip, snapTime, splitClip, trimClip } from "@/app/lib/editor/operations";
import { usePlayback, useProject } from "@/app/lib/editor/store";
import { pointerEdit } from "@/app/lib/editor/interaction";
import { useEditor } from "./EditorContext";

const ClipArtwork=memo(function ClipArtwork({asset,clip,width}:{asset?:MediaAsset;clip:Clip;width:number}){
  if(asset?.kind==="audio"&&asset.waveform){
    const count=Math.min(120,Math.max(4,Math.floor(width/4))),peaks=asset.waveform;
    const path=Array.from({length:count},(_,i)=>{const source=clip.sourceStart+(i/count)*(clip.sourceEnd-clip.sourceStart),peak=peaks[Math.min(peaks.length-1,Math.floor(source/asset.duration*peaks.length))]||0;return `M${i/count*100},${50-peak*42}V${50+peak*42}`;}).join(" ");
    return <svg className="vx-waveform" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Audio waveform"><path d={path} stroke="currentColor" strokeWidth=".6"/></svg>;
  }
  if(asset?.thumbnail){const frames=asset.thumbnails||[asset.thumbnail],count=Math.min(24,Math.max(1,Math.ceil(width/75)));return <div className="vx-filmstrip">{Array.from({length:count},(_,i)=>{const offset=clip.sourceStart+i/count*(clip.sourceEnd-clip.sourceStart),index=Math.min(frames.length-1,Math.max(0,Math.floor(offset/asset.duration*frames.length)));return <img src={frames[index]} alt="" key={i} draggable={false}/>;})}</div>;}
  return null;
});
function Playhead({pps,height}:{pps:number;height:number}){
  const {playback,store}=useEditor(),{time}=usePlayback(playback),p=useProject(store);
  return <div className="vx-playhead" style={{left:time*pps,height}}><span title={formatTime(time,p.settings.fps)}/></div>;
}
function TimeLabel(){const {playback,store}=useEditor(),{time}=usePlayback(playback),p=useProject(store);return <span className="vx-time">{formatTime(time,p.settings.fps)}</span>;}
export default function Timeline(){
  const {store,playback,selection,select,run,notify}=useEditor(),p=useProject(store);
  const [pps,setPps]=useState(60),[snapping,setSnapping]=useState(true),[viewport,setViewport]=useState({left:0,width:1200});
  const scroller=useRef<HTMLDivElement>(null),body=useRef<HTMLDivElement>(null),labels=useRef<HTMLDivElement>(null);
  useEffect(()=>{const el=scroller.current;if(!el)return;const update=()=>setViewport({left:el.scrollLeft,width:el.clientWidth});const observer=new ResizeObserver(update);observer.observe(el);update();return()=>observer.disconnect();},[]);
  const duration=projectDuration(p),width=Math.max(viewport.width,(duration+10)*pps),height=p.trackOrder.length*62+32;
  const tickStep=pps<20?10:pps<45?5:pps<90?2:1,startTick=Math.max(0,Math.floor(viewport.left/pps/tickStep)-1),endTick=Math.ceil((viewport.left+viewport.width)/pps/tickStep)+1;
  function zoom(value:number){const next=Math.max(8,Math.min(200,value)),el=scroller.current;if(!el)return;const left=zoomAnchor(pps,next,el.scrollLeft,el.clientWidth,playback.getSnapshot().time);setPps(next);requestAnimationFrame(()=>{if(scroller.current)scroller.current.scrollLeft=left;});}
  function fitTimeline(){setPps(Math.max(8,Math.min(200,(viewport.width-40)/Math.max(duration,1))));if(scroller.current)scroller.current.scrollLeft=0;}
  useEffect(()=>{function key(e:KeyboardEvent){if((e.target as HTMLElement).closest('input,textarea,select,[contenteditable=true],dialog,[role=dialog]')||e.ctrlKey||e.metaKey||e.altKey)return;if(e.key==='+'||e.key==='='){e.preventDefault();zoom(pps*1.4);}else if(e.key==='-'){e.preventDefault();zoom(pps/1.4);}else if(e.key.toLowerCase()==='f'){e.preventDefault();fitTimeline();}else if(e.key.toLowerCase()==='n'){e.preventDefault();setSnapping(value=>!value);}}window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);});
  function seek(event:React.PointerEvent){
    event.preventDefault();const rect=body.current!.getBoundingClientRect();
    const update=(e:{clientX:number})=>playback.set(Math.min(duration,Math.max(0,(e.clientX-rect.left)/pps)),false);update(event);
    const move=(e:PointerEvent)=>update(e),up=()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);window.removeEventListener("pointercancel",up);};window.addEventListener("pointermove",move);window.addEventListener("pointerup",up,{once:true});window.addEventListener("pointercancel",up,{once:true});
  }
  function drag(event:React.PointerEvent,clip:Clip,edge?:"left"|"right"){
    event.preventDefault();event.stopPropagation();
    let ids=selection.includes(clip.id)?selection:[clip.id];
    if(event.shiftKey&&!edge){ids=selection.includes(clip.id)?selection.filter(id=>id!==clip.id):[...selection,clip.id];select(ids);return;}
    if(event.ctrlKey||event.metaKey){select(selection.includes(clip.id)?selection.filter(id=>id!==clip.id):[...selection,clip.id]);return;}
    select(ids);if(p.tracks[clip.trackId].locked){notify("Unlock this track before editing.");return;}
    playback.set(playback.getSnapshot().time,false);
    const startX=event.clientX,startScroll=scroller.current?.scrollLeft||0,base=store.getSnapshot(),playhead=playback.getSnapshot().time;
    const minStart=Math.min(...ids.map(id=>base.clips[id].startTime));
    pointerEdit(store,e=>project=>{
      const scroll=scroller.current;if(scroll){const rect=scroll.getBoundingClientRect();if(e.clientX<rect.left+24)scroll.scrollLeft-=12;else if(e.clientX>rect.right-24)scroll.scrollLeft+=12;}
      const delta=(e.clientX-startX+(scroll?.scrollLeft||0)-startScroll)/pps;
      if(edge){let time=(edge==="left"?clip.startTime:clip.startTime+clip.duration)+delta;if(snapping)time=snapTime(base,time,[clip.id],playhead,pps);return trimClip(project,clip.id,edge,time);}
      let start=clip.startTime+Math.max(-minStart,delta);if(snapping)start=snapTime(base,start,ids,playhead,pps,clip.duration);
      const diff=Math.max(-minStart,start-clip.startTime),target=(document.elementFromPoint(e.clientX,e.clientY)?.closest("[data-track]") as HTMLElement|undefined)?.dataset.track;
      return ids.reduce((next,id)=>moveClip(next,id,base.clips[id].startTime+diff,ids.length===1?target:undefined),project);
    },notify);
  }
  function split(){const time=playback.getSnapshot().time;const targets=(selection.length?selection:Object.keys(p.clips)).filter(id=>{const c=p.clips[id];return !p.tracks[c.trackId].locked&&time>c.startTime+1/p.settings.fps&&time<c.startTime+c.duration-1/p.settings.fps;});if(!targets.length){notify("Move the playhead inside a clip to split.");return;}run(project=>targets.reduce((next,id)=>splitClip(next,id,time),project));}
  function drop(event:React.DragEvent,track:Track){event.preventDefault();const id=event.dataTransfer.getData("application/veelox-asset");if(!id)return;const rect=body.current!.getBoundingClientRect();let time=Math.max(0,(event.clientX-rect.left)/pps);if(snapping)time=snapTime(p,time,[],playback.getSnapshot().time,pps);run(project=>addClip(project,id,track.id,time));}
  function deleteSelected(){run(project=>selection.reduce((next,id)=>removeClip(next,id),project));select([]);}
  return <section className="vx-timeline" aria-label="Multi-track timeline"><header className="vx-timeline-tools"><div><strong>Timeline</strong><span className="vx-subtle" aria-live="polite">{selection.length?selection.length+" selected":""}</span><TimeLabel/><span className="vx-divider"/><button title="Split at playhead (S)" aria-label="Split at playhead" onClick={split}><Scissors size={16}/></button><button title="Duplicate selected clips (Ctrl+D)" aria-label="Duplicate clips" disabled={!selection.length} onClick={()=>run(project=>selection.reduce((next,id)=>duplicateClip(next,id),project))}><Copy size={16}/></button><button title="Delete selected clips (Delete)" aria-label="Delete clips" disabled={!selection.length} onClick={deleteSelected}><Trash2 size={16}/></button><button title="Merge selected captions" aria-label="Merge captions" disabled={selection.length<2||selection.some(id=>p.tracks[p.clips[id]?.trackId]?.kind!=="caption")} onClick={()=>run(project=>mergeCaptions(project,selection))}><Merge size={16}/></button><span className="vx-divider"/><label className="vx-add-track"><Plus size={14}/><select aria-label="Add track" value="" onChange={e=>{run(project=>addTrack(project,e.target.value as TrackKind));}}><option value="" disabled>Add track</option>{(["video","overlay","image","text","caption","audio"] as const).map(kind=><option value={kind} key={kind}>{kind}</option>)}</select></label></div><div><button className={snapping?"vx-active":""} aria-label="Toggle snapping" aria-pressed={snapping} title="Snap to playhead and edges" onClick={()=>setSnapping(!snapping)}><Magnet size={15}/></button><button title="Fit the complete timeline" aria-label="Fit timeline" onClick={fitTimeline}>Fit</button><button aria-label="Zoom timeline out" onClick={()=>zoom(pps/1.4)}><ZoomOut size={15}/></button><input className="vx-zoom-slider" aria-label="Timeline zoom" type="range" min={8} max={200} value={pps} onChange={e=>zoom(Number(e.target.value))}/><button aria-label="Zoom timeline in" onClick={()=>zoom(pps*1.4)}><ZoomIn size={15}/></button><span className="vx-subtle">{p.settings.fps} fps</span></div></header>
    <div className="vx-track-area"><div className="vx-track-labels" ref={labels}><div className="vx-track-ruler-label">TRACKS</div>{p.trackOrder.map(id=>{const track=p.tracks[id];return <div className="vx-track-header" key={id}><div>{track.kind==="audio"?<Music size={13}/>:track.kind==="text"||track.kind==="caption"?<Type size={13}/>:<Film size={13}/>}<span>{track.name}</span></div><div><button aria-label={`${track.hidden?"Show":"Hide"} ${track.name}`} aria-pressed={track.hidden} title="Track visibility" onClick={()=>run(project=>changeTrack(project,id,{hidden:!track.hidden}))}>{track.hidden?<EyeOff size={12}/>:<Eye size={12}/>}</button><button aria-label={`${track.muted?"Unmute":"Mute"} ${track.name}`} aria-pressed={track.muted} title="Track mute" onClick={()=>run(project=>changeTrack(project,id,{muted:!track.muted}))}>{track.muted?<VolumeX size={12}/>:<Volume2 size={12}/>}</button><button aria-label={`${track.locked?"Unlock":"Lock"} ${track.name}`} aria-pressed={track.locked} title="Track lock" onClick={()=>run(project=>changeTrack(project,id,{locked:!track.locked}))}>{track.locked?<Lock size={12}/>:<Unlock size={12}/>}</button></div></div>;})}</div>
      <div className="vx-timeline-scroll" ref={scroller} onScroll={e=>{if(labels.current)labels.current.scrollTop=e.currentTarget.scrollTop;setViewport({left:e.currentTarget.scrollLeft,width:e.currentTarget.clientWidth});}}><div className="vx-timeline-body" ref={body} style={{width,height}}>
        <div className="vx-ruler" onPointerDown={seek}>{Array.from({length:endTick-startTick},(_,i)=>{const tick=(startTick+i)*tickStep;return <span key={tick} style={{left:tick*pps}}>{Math.floor(tick/60)}:{String(tick%60).padStart(2,"0")}</span>;})}</div>
        {p.trackOrder.map(id=>{const track=p.tracks[id];return <div key={id} data-track={id} aria-label={`${track.name} track`} className={`vx-track-lane ${track.locked?"vx-track-locked":""} ${track.hidden?"vx-track-hidden":""}`} onPointerDown={seek} onDragOver={e=>{if(e.dataTransfer.types.includes("application/veelox-asset")){e.preventDefault();e.dataTransfer.dropEffect="copy";}}} onDrop={e=>drop(e,track)}>
          {track.clipIds.map(clipId=>p.clips[clipId]).filter(c=>c.startTime*pps+c.duration*pps>viewport.left-250&&c.startTime*pps<viewport.left+viewport.width+250).map(c=><div role="button" tabIndex={0} aria-label={`${c.name}, ${c.startTime.toFixed(2)} seconds, duration ${c.duration.toFixed(2)} seconds`} aria-pressed={selection.includes(c.id)} key={c.id} data-clip={c.id} className={`vx-clip vx-clip-${track.kind} ${selection.includes(c.id)?"vx-clip-selected":""}`} style={{left:c.startTime*pps,width:Math.max(4,c.duration*pps)}} onPointerDown={e=>drag(e,c)} onDoubleClick={()=>playback.set(c.startTime,false)} onKeyDown={e=>{if(e.key==="Enter"){e.stopPropagation();select([c.id]);}}}>
            <ClipArtwork clip={c} asset={c.assetId?p.assets[c.assetId]:undefined} width={c.duration*pps}/><span className="vx-clip-name">{c.name}</span><span className="vx-clip-duration">{c.speed!==1?`${c.speed}× · `:""}{c.duration.toFixed(1)}s</span><div className="vx-trim vx-trim-left" title="Trim left edge" onPointerDown={e=>drag(e,c,"left")}/><div className="vx-trim vx-trim-right" title="Trim right edge" onPointerDown={e=>drag(e,c,"right")}/>
          </div>)}
          {Object.values(p.transitions).filter(t=>p.clips[t.toClipId]?.trackId===id).map(t=><button className="vx-transition" key={t.id} style={{left:p.clips[t.toClipId].startTime*pps,width:Math.max(12,t.duration*pps)}} title={`${t.kind} · ${t.duration}s. Select incoming clip to edit.`} onPointerDown={e=>e.stopPropagation()} onClick={()=>select([t.toClipId])}>{t.kind==="dissolve"?"◇":t.kind[0].toUpperCase()}</button>)}
        </div>;})}<Playhead pps={pps} height={height}/>
        {!Object.keys(p.clips).length&&<div className="vx-timeline-empty" style={{left:Math.max(20,viewport.left+40)}}>Drag media to a track · Space to play · S to split</div>}
      </div></div>
    </div>
  </section>;
}
