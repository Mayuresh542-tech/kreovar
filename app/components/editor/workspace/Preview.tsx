"use client";
import {loadEditorStudioFonts} from '@/app/lib/editor/editorCaptionStudio';
import {loadCaptionFonts} from "@/app/lib/captions/typography";
import { useEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Maximize, Film } from "lucide-react";
import { playbackTime } from "@/app/lib/editor/playbackClock";
import { Compositor, VisualBounds } from "@/app/lib/editor/compositor";
import { clamp, dimensions, formatTime, projectDuration } from "@/app/lib/editor/model";
import { usePlayback, useProject } from "@/app/lib/editor/store";
import { changeClipProperty } from "@/app/lib/editor/operations";
import { pointerEdit } from "@/app/lib/editor/interaction";
import { useEditor } from "./EditorContext";

function Transport({toggle,zoom,setZoom,fullscreen}:{toggle:()=>void;zoom:number;setZoom:(zoom:number)=>void;fullscreen:()=>void}){
  const {store,playback}=useEditor(),p=useProject(store),{time,playing}=usePlayback(playback),duration=projectDuration(p);
  return <div><input className="vx-preview-scrub" type="range" aria-label="Seek preview" min={0} max={duration || 0} step={1/p.settings.fps} value={Math.min(time,duration)} disabled={!duration} onChange={e=>playback.set(Number(e.target.value),false)}/><div className="vx-transport"><div><button title="Previous frame (←)" aria-label="Previous frame" onClick={()=>playback.set(Math.max(0,time-1/p.settings.fps),false)}><SkipBack size={15}/></button><button className="vx-play" title="Play / pause (Space)" aria-label={playing?"Pause":"Play"} disabled={!duration} onClick={toggle}>{playing?<Pause size={17}/>:<Play size={17}/>}</button><button aria-label="Next frame" title="Next frame (→)" onClick={()=>playback.set(Math.min(duration,time+1/p.settings.fps),false)}><SkipForward size={15}/></button><button aria-label="Go to start" title="Go to start" onClick={()=>playback.set(0,false)}>↤</button><button aria-label="Go to end" title="Go to end" onClick={()=>playback.set(duration,false)}>↦</button><span className="vx-time">{formatTime(time,p.settings.fps)} <i>/ {formatTime(duration,p.settings.fps)}</i></span></div><div><select aria-label="Preview zoom" value={zoom} onChange={e=>setZoom(Number(e.target.value))}><option value={1}>Fit</option><option value={.5}>50%</option><option value={1.5}>150%</option><option value={2}>200%</option></select><button aria-label="Fullscreen preview" onClick={fullscreen}><Maximize size={15}/></button></div></div></div>;
}
export default function Preview({quality,readOnly=false}:{quality:number;readOnly?:boolean}){
  const {store,playback,repository,selection,select,notify}=useEditor(),p=useProject(store);
  const canvas=useRef<HTMLCanvasElement>(null),stage=useRef<HTMLDivElement>(null),frame=useRef<HTMLDivElement>(null),outline=useRef<HTMLDivElement>(null),engine=useRef<Compositor|null>(null),bounds=useRef<VisualBounds[]>([]),selected=useRef<string | undefined>(undefined);
  const [zoom,setZoom]=useState(1),[buffering,setBuffering]=useState(false);
  useEffect(()=>{void loadEditorStudioFonts(p).catch(()=>{});for(const layer of [...Object.values(p.textLayers),...Object.values(p.captions)])void loadCaptionFonts(`"${layer.style.font}"`,layer.style.weight,layer.style.size,layer.style.fontAccent,layer.text).catch(()=>{});},[p.textLayers,p.captions]);
  useEffect(()=>{selected.current=selection[0];},[selection]);
  useEffect(()=>{
    const compositor=new Compositor(repository,error=>notify(error.message));engine.current=compositor;
    let request=0,last=performance.now(),waiting=false,lastRender=0,lastProject:typeof p|undefined,lastTime=-1,lastSize="";
    const loop=(now:number)=>{
      const state=playback.getSnapshot(),project=store.getSnapshot(),duration=projectDuration(project),delta=Math.max(0,(now-last)/1000);last=now;
      try{
        const next=playbackTime(state.time,state.playing,waiting,delta,duration);
        const displayTime=duration?Math.min(next,Math.max(0,duration-1/project.settings.fps)):0;
        const wasWaiting=waiting;
        const ready=compositor.sync(project,displayTime,state.playing);
        if(waiting!==!ready){waiting=!ready;setBuffering(waiting);}
        if(ready && canvas.current && (project!==lastProject || `${canvas.current.width}:${canvas.current.height}`!==lastSize || wasWaiting!==waiting || (!state.playing && displayTime!==lastTime) || state.playing && now-lastRender>=1000/project.settings.fps)){bounds.current=compositor.render(canvas.current,project,displayTime);lastProject=project;lastTime=displayTime;lastRender=now;lastSize=`${canvas.current.width}:${canvas.current.height}`;}
        const box=bounds.current.find(b=>b.id===selected.current),element=outline.current;
        if(element&&canvas.current){element.style.display=box?"block":"none";if(box){const [w,h]=dimensions[project.settings.aspectRatio];element.style.left=`${box.x/w*100}%`;element.style.top=`${box.y/h*100}%`;element.style.width=`${box.width/w*100}%`;element.style.height=`${box.height/h*100}%`;element.style.transform=`translate(-50%,-50%) rotate(${box.rotation}deg)`;}}
        if(state.playing&&ready){playback.set(next,next<duration);}else if(!ready)compositor.pause();
      }catch(error){playback.set(state.time,false);notify(error instanceof Error?error.message:"Preview failed.");}
      request=requestAnimationFrame(loop);
    };
    const fontsReady=()=>{lastProject=undefined;};
    document.fonts.addEventListener("loadingdone",fontsReady);
    request=requestAnimationFrame(loop);
    const visibility=()=>{if(document.hidden){playback.set(playback.getSnapshot().time,false);compositor.pause();}};
    document.addEventListener("visibilitychange",visibility);
    return()=>{cancelAnimationFrame(request);document.fonts.removeEventListener("loadingdone",fontsReady);document.removeEventListener("visibilitychange",visibility);compositor.dispose();engine.current=null;};
  },[store,playback,repository,notify]);
  useEffect(()=>{
    const element=stage.current,box=frame.current;if(!element||!box)return;
    const [w,h]=dimensions[p.settings.aspectRatio];
    function fit(){if(!element||!box)return;const padding=getComputedStyle(element),availableWidth=Math.max(1,element.clientWidth-parseFloat(padding.paddingLeft)-parseFloat(padding.paddingRight)),availableHeight=Math.max(1,element.clientHeight-parseFloat(padding.paddingTop)-parseFloat(padding.paddingBottom));const width=Math.max(1,Math.min(availableWidth,availableHeight*w/h))*zoom;box.style.width=`${width}px`;box.style.height=`${width*h/w}px`;}
    const observer=new ResizeObserver(fit);observer.observe(element);fit();return()=>observer.disconnect();
  },[p.settings.aspectRatio,zoom]);
  const [w,h]=dimensions[p.settings.aspectRatio],renderHeight=quality,renderWidth=Math.round(quality*w/h);
  async function toggle(){const state=playback.getSnapshot();if(state.playing){playback.set(state.time,false);return;}try{await engine.current?.activateAudio();playback.set(state.time>=projectDuration(p)?0:state.time,true);}catch(e){notify(e instanceof Error?e.message:"Audio playback unavailable.");}}
  useEffect(()=>{
    const onPlay=()=>{const state=playback.getSnapshot();if(state.playing)playback.set(state.time,false);else void engine.current?.activateAudio().then(()=>playback.set(state.time>=projectDuration(store.getSnapshot())?0:state.time,true)).catch(e=>notify(e.message));};
    window.addEventListener("veelox:toggle-play",onPlay);return()=>window.removeEventListener("veelox:toggle-play",onPlay);
  },[playback,store,notify]);
  function gesture(event:React.PointerEvent,mode:"move"|"scale"|"rotate",id:string){
    if(readOnly)return;
    event.preventDefault();event.stopPropagation();const c=store.getSnapshot().clips[id];if(!c||store.getSnapshot().tracks[c.trackId].locked){notify("Unlock this track before transforming.");return;}
    playback.set(playback.getSnapshot().time,false);const rect=canvas.current!.getBoundingClientRect(),x=event.clientX,y=event.clientY,t=c.transform;
    pointerEdit(store,e=>project=>changeClipProperty(project,id,{transform:{...t,...(mode==="move"?{x:t.x+(e.clientX-x)/rect.width,y:t.y+(e.clientY-y)/rect.height}:mode==="scale"?{scale:clamp(t.scale*(1+(e.clientX-x)/Math.max(30,rect.width*.3)),.05,10)}:{rotation:t.rotation+(e.clientX-x)*.6})}}),notify);
  }
  function pick(event:React.PointerEvent<HTMLCanvasElement>){
    if(readOnly)return;
    const rect=event.currentTarget.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*w,y=(event.clientY-rect.top)/rect.height*h;
    const hit=[...bounds.current].reverse().find(b=>{const radians=-b.rotation*Math.PI/180,dx=x-b.x,dy=y-b.y;return Math.abs(dx*Math.cos(radians)-dy*Math.sin(radians))<b.width/2&&Math.abs(dx*Math.sin(radians)+dy*Math.cos(radians))<b.height/2;});
    select(hit?[hit.id]:[]);if(hit)gesture(event,"move",hit.id);
  }
  return <section className="vx-preview vx-panel" aria-label="Video preview"><header className="vx-panel-heading"><span>Preview <span className="vx-subtle">/ {p.settings.aspectRatio}</span></span><span className="vx-badge">{buffering?"Loading media…":`${quality}p preview`}</span></header>
    <div className="vx-stage" ref={stage}><div className="vx-canvas-frame" ref={frame}>
      <canvas ref={canvas} width={renderWidth} height={renderHeight} onPointerDown={pick} aria-label="Project canvas"/>
      {!Object.keys(p.clips).length&&<div className="vx-canvas-empty"><Film size={30}/><strong>Your next story starts here</strong><span>Import media and add it to the timeline</span></div>}
      <div ref={outline} className="vx-selection-box" style={{display:"none"}} onPointerDown={e=>{if(selection[0])gesture(e,"move",selection[0]);}}><span className="vx-selection-label">{p.clips[selection[0]]?.name}</span><button aria-label="Scale selected layer" className="vx-scale-handle" onPointerDown={e=>gesture(e,"scale",selection[0])}/><button aria-label="Rotate selected layer" className="vx-rotation-handle" onPointerDown={e=>gesture(e,"rotate",selection[0])}/></div>
    </div></div>
    <Transport toggle={()=>void toggle()} zoom={zoom} setZoom={setZoom} fullscreen={()=>void stage.current?.requestFullscreen().catch(e=>notify(e.message))}/>
  </section>;
}

