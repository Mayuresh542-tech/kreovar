"use client";
import {getUsageStatus} from '@/app/lib/editor/exportAllowance';
import { useEffect, useRef, useState } from "react";
import { X, Download, CheckCircle, AlertCircle } from "lucide-react";
import { BrowserExportBackend, ExportOptions, ExportProgress, exportFormats} from "@/app/lib/editor/export";
import {MAX_VIDEO_SECONDS} from "@/app/lib/editor/limits";
import { projectDuration } from "@/app/lib/editor/model";
import { useEditor } from "./EditorContext";
export default function ExportDialog({close}:{close:()=>void}){
  const {store,playback,repository}=useEditor(),[formats]=useState(exportFormats),[options,setOptions]=useState<ExportOptions>(()=>({resolution:1080,fps:30,quality:"high",mime:exportFormats()[0]?.mime||""}));
  const [progress,setProgress]=useState<ExportProgress>(),[error,setError]=useState<string>(),[output,setOutput]=useState<{url:string;name:string;size:number}>();
  const [maxResolution,setMaxResolution]=useState<720|1080>(720),[allowanceReady,setAllowanceReady]=useState(false);
  useEffect(()=>{const controller=new AbortController();void getUsageStatus(controller.signal).then(status=>{setMaxResolution(status.maxResolution);setOptions(o=>({...o,resolution:status.maxResolution}));setAllowanceReady(true);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[]);
  const abort=useRef<AbortController|undefined>(undefined),url=useRef<string|undefined>(undefined),dialog=useRef<HTMLDialogElement>(null);
  const running=useRef(false);
  const duration=projectDuration(store.getSnapshot()),busy=!!progress&&progress.progress<100&&!error;
  useEffect(()=>{dialog.current?.showModal();return()=>{abort.current?.abort();if(url.current)URL.revokeObjectURL(url.current);};},[]);
  async function start(){
    if(running.current)return;running.current=true;
    setError(undefined);setOutput(undefined);if(url.current)URL.revokeObjectURL(url.current);
    const project=store.getSnapshot();playback.set(playback.getSnapshot().time,false);abort.current=new AbortController();setProgress({stage:"Preparing export…",progress:0});
    try{const blob=await new BrowserExportBackend(repository).render(project,options,setProgress,abort.current.signal);url.current=URL.createObjectURL(blob);setOutput({url:url.current,name:`${project.title.replace(/[^a-zA-Z0-9 _-]/g,"")||"Kreovar video"}.${options.mime.includes("mp4")?"mp4":"webm"}`,size:blob.size});}
    catch(e){setProgress(undefined);setError(abort.current?.signal.aborted?"Export cancelled. Your timeline is unchanged.":e instanceof Error?e.message:"Export failed.");}finally{running.current=false;}
  }
  return <dialog ref={dialog} data-vx-motion="panel" className="vx-dialog" onCancel={e=>{if(busy){e.preventDefault();abort.current?.abort();}else close();}} aria-labelledby="export-title"><div className="vx-dialog-header"><div><span className="vx-eyebrow">KREOVAR STUDIO</span><h2 id="export-title">Export your story</h2></div><button aria-label="Close export dialog" onClick={()=>{if(busy)abort.current?.abort();else close();}}><X size={20}/></button></div>
    <p className="vx-hint">Rendered from your current edit. Audio, captions, layers and adjustments are included.</p>
    {store.getSnapshot().editingJob&&store.getSnapshot().editingJob?.status!=='completed'&&<p className="vx-export-note" role="status">Your AI edit is unfinished. This export includes only committed timeline changes. Resume the unfinished stage to include all requested edits.</p>}
    <fieldset disabled={busy} className="vx-export-fields"><label className="vx-field"><span>Resolution</span><select aria-label="Export resolution" value={options.resolution} onChange={e=>setOptions({...options,resolution:Number(e.target.value) as 720|1080})}><option value={720}>720p</option><option value={1080} disabled={maxResolution<1080}>1080p · Pro</option></select></label><label className="vx-field"><span>Frame rate</span><select aria-label="Export FPS" value={options.fps} onChange={e=>setOptions({...options,fps:Number(e.target.value) as 24|30|60})}>{[24,30,60].map(fps=><option key={fps} value={fps}>{fps} fps</option>)}</select></label><label className="vx-field"><span>Quality</span><select value={options.quality} aria-label="Export quality" onChange={e=>setOptions({...options,quality:e.target.value as ExportOptions["quality"]})}><option value="standard">Standard · smaller file</option><option value="high">High · more detail</option></select></label><label className="vx-field"><span>Format</span><select aria-label="Export format" value={options.mime} onChange={e=>setOptions({...options,mime:e.target.value})}>{formats.map(f=><option key={f.mime} value={f.mime}>{f.label}</option>)}</select></label></fieldset>
    <div className="vx-export-note">{options.mime.includes("webm")?"Export renders every frame at your selected frame rate. Processing time depends on your device and edit.":"MP4 renders every frame at exact timeline timestamps with synchronized audio."} {"MP4 requires browser H.264/AAC support. WebM is available as an alternative. Exports are limited to 60 seconds."}</div>
    {duration>MAX_VIDEO_SECONDS&&<p role="alert" className="vx-error">Videos up to 60 seconds are supported. Trim the timeline to export.</p>}
    {!formats.length&&<p role="alert" className="vx-error">Export is unavailable in this browser. Use a browser with WebCodecs support, such as updated Chrome or Edge.</p>}
    {progress&&<div className="vx-export-progress" aria-live="polite"><span>{progress.stage}<b>{Math.round(progress.progress)}%</b></span><progress value={progress.progress} max={100}/></div>}
    {error&&<p role="alert" className="vx-error"><AlertCircle size={16}/>{error}</p>}
    {output?<div className="vx-export-success"><CheckCircle size={24}/><strong>Ready to share</strong><span>{(output.size/1048576).toFixed(1)} MB</span><a className="vx-primary" href={output.url} download={output.name}><Download size={16}/> Download video</a><button className="vx-secondary" onClick={close}>Done</button></div>:<button className="vx-primary vx-wide" disabled={!allowanceReady||!formats.length||!duration||duration>MAX_VIDEO_SECONDS||busy} onClick={()=>void start()}><Download size={16}/>{busy?"Exporting…":"Export video"}</button>}
    {busy&&<button className="vx-secondary vx-wide" onClick={()=>abort.current?.abort()}>Cancel export</button>}
  </dialog>;
}
