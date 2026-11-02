"use client";
import {useEffect,useMemo,useRef,useState} from 'react';
import {AbsoluteFill,Audio,Sequence,useCurrentFrame,useVideoConfig,useBufferState,delayRender,continueRender,cancelRender} from 'remotion';
import type {EditorProject,Clip} from '../lib/editor/model';
import {MediaRepository} from '../lib/editor/media';
import {Compositor} from '../lib/editor/compositor';
import {loadEditorStudioFonts} from '../lib/editor/editorCaptionStudio';
import {clipGain,speechWindows} from '../lib/editor/audioMix';

/** The normalized document is authoritative for Remotion as well as editor preview/MP4. */
function ClipAudio({project,clip,repository}:{project:EditorProject;clip:Clip;repository:MediaRepository}){
 const [src,setSrc]=useState<string>(),[handle]=useState(()=>delayRender('Load original audio')),{fps}=useVideoConfig(),windows=useMemo(()=>speechWindows(project),[project]);
 useEffect(()=>{let alive=true;void repository.resolve(project.assets[clip.assetId!]).then(url=>{if(alive){setSrc(url);continueRender(handle);}}).catch(cancelRender);return()=>{alive=false;continueRender(handle);};},[project,clip,repository,handle]);
 if(!src)return null;
 return <Audio src={src} startFrom={Math.round(clip.sourceStart*fps)} playbackRate={clip.speed} volume={frame=>clipGain(project,clip,clip.startTime+frame/fps,windows)}/>;
}
export default function NormalizedEditorComposition({project}:{project:EditorProject}){
 const frame=useCurrentFrame(),{fps,width,height}=useVideoConfig(),canvas=useRef<HTMLCanvasElement>(null),[repository]=useState(()=>new MediaRepository()),engine=useRef<Compositor|null>(null);
 const {delayPlayback}=useBufferState();
 const handle=useMemo(()=>delayRender('Decode normalized editor frame '+frame+' revision '+project.revision),[frame,project.revision]);
 useEffect(()=>{repository.activate();const compositor=new Compositor(repository,cancelRender);engine.current=compositor;return()=>{compositor.dispose();repository.dispose();};},[repository]);
 useEffect(()=>{
  let stopped=false;
  const buffering=delayPlayback();
  const compositor=engine.current!;
  void (async()=>{
   await loadEditorStudioFonts(project);await document.fonts.ready;
   const deadline=Date.now()+25000;
   while(!stopped&&!compositor.sync(project,frame/fps,false)){if(Date.now()>deadline)throw Error('Composition media decode timed out.');await new Promise(resolve=>setTimeout(resolve,20));}
   if(!stopped&&canvas.current)compositor.render(canvas.current,project,frame/fps);
   continueRender(handle);
   buffering.unblock();
  })().catch(error=>{buffering.unblock();cancelRender(error);});
  return()=>{stopped=true;continueRender(handle);buffering.unblock();};
 },[project,frame,fps,handle,delayPlayback]);
 return <AbsoluteFill><canvas ref={canvas} width={width} height={height} style={{width:'100%',height:'100%'}}/>{Object.values(project.clips).filter(c=>c.assetId&&project.assets[c.assetId]?.kind!=='image'&&c.volume>0&&!project.tracks[c.trackId].hidden&&!project.tracks[c.trackId].muted).map(c=><Sequence key={c.id} from={Math.round(c.startTime*fps)} durationInFrames={Math.max(1,Math.round(c.duration*fps))}><ClipAudio project={project} clip={c} repository={repository}/></Sequence>)}</AbsoluteFill>;
}
