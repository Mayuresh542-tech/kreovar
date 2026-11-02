"use client";
import {SPEECH_LANGUAGES} from "../lib/captions/speechLanguages";
import {loadCaptionDocumentFonts} from '../lib/captions/studioFonts';
import {Suspense,useEffect,useMemo,useRef,useState} from "react";
import {useRouter,useSearchParams} from "next/navigation";
import {Upload,Download,FolderPlus,LoaderCircle} from "lucide-react";
import {openCaptionVideo,transcribeCaptionVideo} from "../lib/captions/studioImport";
import CaptionStylePreview from "../components/captions/CaptionStylePreview";
import CaptionDesignPanel from '../components/captions/CaptionDesignPanel';
import CaptionTimingTools from '../components/captions/CaptionTimingTools';
import CaptionWordTools from '../components/captions/CaptionWordTools';
import CaptionMiniTimeline from '../components/captions/CaptionMiniTimeline';
import {referenceCaptionTemplate} from '../lib/captions/referenceTemplates';
import {deleteCaptionWord,moveBoundaryWord} from "../lib/captions/wordActions";
import {splitCaption,mergeCaptionNext} from '../lib/captions/captionEditing';
import type {CaptionStyleConfig} from "../lib/captions/templates";
import StudioShell from "../components/StudioShell";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import {useAuthGate} from "../lib/useAuthGate";
import {uploadAssetFile} from "../lib/assets/client";
import type {StudioAsset} from "../lib/assets/types";
import type {CaptionSegment} from "../lib/captions/presets";
import {createSegmentsFromTranscript} from "../lib/captions/presets";
import {DEFAULT_CAPTION_TEMPLATES,getTemplateById} from "../lib/captions/templates";
import {exportToSRT,exportToVTT,exportToASS,parseSRT} from "../lib/captions/subtitlesParser";
import {drawCaptions} from "../lib/captions/canvasCaptions";
import AddToProjectModal from "../components/projects/AddToProjectModal";

const panel="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs";
const button="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium disabled:opacity-50";
function CaptionsContent(){
 const router=useRouter(),params=useSearchParams(),{status}=useAuthGate();
 const [segments,setSegments]=useState<CaptionSegment[]>([]),[templateId,setTemplateId]=useState(DEFAULT_CAPTION_TEMPLATES[0].id),[url,setUrl]=useState<string|null>(null),[fileName,setFileName]=useState(""),[busy,setBusy]=useState(""),[error,setError]=useState(""),[time,setTime]=useState(0),[duration,setDuration]=useState(0),[aspect,setAspect]=useState(16/9),[text,setText]=useState(params.get("script")||params.get("text")||""),[exporting,setExporting]=useState(false),[progress,setProgress]=useState(0),[exportUrl,setExportUrl]=useState<string|null>(null),[captionAsset,setCaptionAsset]=useState<StudioAsset|null>(null),[modal,setModal]=useState(false);
 const original=useRef<File|null>(null),video=useRef<HTMLVideoElement>(null),overlay=useRef<HTMLCanvasElement>(null),job=useRef<AbortController|null>(null),exportJob=useRef<AbortController|null>(null);
 const [exportFormat,setExportFormat]=useState<"mp4"|"webm">("mp4");
 const [detectedLanguage,setDetectedLanguage]=useState(""),[captionLanguage,setCaptionLanguage]=useState("auto");
 const template=referenceCaptionTemplate(templateId)||getTemplateById(templateId);
 const [styleOverrides,setStyleOverrides]=useState<Partial<CaptionStyleConfig>>({highlightingMode:"keyword"}),[samplePlaying,setSamplePlaying]=useState(false),[generating,setGenerating]=useState(false);
 const captionStyle=useMemo(()=>({...template.style,...styleOverrides}),[template,styleOverrides]);
 type StudioSnapshot={segments:CaptionSegment[];templateId:string;styleOverrides:Partial<CaptionStyleConfig>};
 const history=useRef<{past:StudioSnapshot[];future:StudioSnapshot[]}>({past:[],future:[]});const [historyCounts,setHistoryCounts]=useState({past:0,future:0}); function renderHistory(){setHistoryCounts({past:history.current.past.length,future:history.current.future.length});}
 const currentSnapshot=():StudioSnapshot=>({segments,templateId,styleOverrides});
 function remember(){history.current.past=[...history.current.past.slice(-49),currentSnapshot()];history.current.future=[];renderHistory();}
 function restore(s:StudioSnapshot){setSegments(s.segments);setTemplateId(s.templateId);setStyleOverrides(s.styleOverrides);setExportUrl(null);setCaptionAsset(null);renderHistory();}
 function undoStudio(){const previous=history.current.past.pop();if(previous){history.current.future.push(currentSnapshot());restore(previous);}}
 function redoStudio(){const next=history.current.future.pop();if(next){history.current.past.push(currentSnapshot());restore(next);}}
 function updateStyle(patch:Partial<CaptionStyleConfig>){remember();setStyleOverrides(previous=>({...previous,...patch}));setCaptionAsset(null);setExportUrl(null);}
 function selectTemplate(id:string){remember();setTemplateId(id);setStyleOverrides(referenceCaptionTemplate(id)?{}:{highlightingMode:'keyword'});setCaptionAsset(null);setExportUrl(null);}
 useEffect(()=>{if(status==="unauthed")router.replace("/login");},[status,router]);
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);},[url]);
 useEffect(()=>()=>{if(exportUrl)URL.revokeObjectURL(exportUrl);},[exportUrl]);
 useEffect(()=>()=>{job.current?.abort();exportJob.current?.abort();},[]);
 // One shared renderer for sample, source preview and export; paused video does not redraw continuously.
 useEffect(()=>{
  const media=video.current,canvas=overlay.current;if(!url||!media||!canvas)return;
  canvas.width=Math.round(720*aspect);canvas.height=720;let frame=0,disposed=false;
  const draw=()=>{if(disposed)return;const ctx=canvas.getContext("2d");if(ctx){ctx.clearRect(0,0,canvas.width,canvas.height);drawCaptions(ctx,segments,captionStyle,media.currentTime,canvas.width,canvas.height);}};
  const tick=()=>{draw();frame=!media.paused&&!media.ended?requestAnimationFrame(tick):0;};
  const sync=()=>{cancelAnimationFrame(frame);frame=0;tick();};
  const events=["play","pause","seeked","loadeddata","timeupdate"] as const;events.forEach(event=>media.addEventListener(event,sync));sync();
  void loadCaptionDocumentFonts(segments,captionStyle).catch(()=>{}).then(()=>{if(!disposed)draw();});
  return()=>{disposed=true;cancelAnimationFrame(frame);events.forEach(event=>media.removeEventListener(event,sync));};
 },[segments,captionStyle,aspect,url]);
 function changeSegments(next:CaptionSegment[]){remember();setSegments(next);setCaptionAsset(null);setExportUrl(null);}
 async function uploadVideo(file:File){
  if(busy||exporting)return;setError("");setFileName("");setBusy("Opening video on your device…");setGenerating(true);setExportUrl(null);setCaptionAsset(null);setDetectedLanguage("");history.current={past:[],future:[]};renderHistory();setSegments([]);setTime(0);setDuration(0);original.current=null;setUrl(null);
  const controller=new AbortController();job.current=controller;let localUrl:string|undefined;
  try{
   const meta=await openCaptionVideo(file,controller.signal);localUrl=meta.url;
   controller.signal.throwIfAborted();original.current=file;setFileName(file.name);setDuration(meta.duration);setAspect(meta.width/meta.height||16/9);setUrl(localUrl);localUrl=undefined;
   const data=await transcribeCaptionVideo(file,meta.duration,controller.signal,setBusy,captionLanguage);
   const timed=(data.segments as CaptionSegment[]||[]).filter(s=>typeof s.text==="string"&&Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.end>s.start&&s.start<meta.duration).map(s=>({...s,end:Math.min(s.end,meta.duration)}));if(!timed.length)throw new Error("No speech was found. You can import an SRT caption file instead.");
   setDetectedLanguage(typeof data.language==="string"?data.language.slice(0,80):"");setSegments(timed);setText(data.transcript||"");setCaptionAsset(data.asset||null);
  }catch(cause){setError(controller.signal.aborted?"Caption generation cancelled. You can retry or import an SRT file.":cause instanceof Error?cause.message:"Transcription failed. Import an SRT or retry.");}finally{if(localUrl)URL.revokeObjectURL(localUrl);if(job.current===controller){job.current=null;setGenerating(false);setBusy("");}}
 }
 async function importSubtitles(file:File){
  if(busy||exporting)return;setBusy("Importing captions…");setError("");try{if(file.size>1024*1024)throw new Error("Choose an SRT file up to 1 MB.");const parsed=parseSRT(await file.text()).filter(s=>Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.start>=0&&s.end>s.start);if(!parsed.length)throw new Error("No valid timed captions were found in this SRT.");changeSegments(parsed);setText(parsed.map(s=>s.text).join(" "));}catch(cause){setError(cause instanceof Error?cause.message:"Caption import failed.");}finally{setBusy("");}
 }
 function downloadSubtitles(format:"srt"|"vtt"|"ass"|"txt"){
  const values=segments.map(s=>({text:s.text,startTime:s.start,endTime:s.end})),blob=new Blob([format==="txt"?segments.map(s=>s.text).join("\n"):format==="srt"?exportToSRT(values):format==="vtt"?exportToVTT(values):exportToASS(values)],{type:format==="txt"?"text/plain":format==="srt"?"application/x-subrip":"text/vtt"}),objectUrl=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=objectUrl;anchor.download=`veelox-captions.${format}`;anchor.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);
 }
 async function exportVideo(){
  if(!original.current||!segments.length||exporting||busy)return;video.current?.pause();setExporting(true);setProgress(0);setError("");setExportUrl(null);const controller=new AbortController();exportJob.current=controller;
  try{const {exportCaptionedVideo}=await import("../lib/captions/videoExport");const result=await exportCaptionedVideo(original.current,segments,captionStyle,controller.signal,setProgress,exportFormat);setExportUrl(URL.createObjectURL(result));}catch(cause){setError(controller.signal.aborted?"Export cancelled.":cause instanceof Error?cause.message:"Video export failed.");}finally{exportJob.current=null;setExporting(false);}
 }
 async function addToProject(){
  if(!segments.length||busy||exporting)return;setBusy("Saving captions…");setError("");try{if(!captionAsset){const content=exportToSRT(segments.map(s=>({text:s.text,startTime:s.start,endTime:s.end})));setCaptionAsset(await uploadAssetFile(new File([content],"veelox-captions.srt",{type:"application/x-subrip"}),{preset:templateId,style:captionStyle}));}setModal(true);}catch(cause){setError(cause instanceof Error?cause.message:"Could not save captions.");}finally{setBusy("");}
 }
 if(status!=="authed")return <AuthLoadingScreen label="Loading Captions Studio…"/>;
 return <StudioShell active="captions"><div className="space-y-5 pb-8">
  <div><h1 className="text-2xl font-bold text-slate-900">Captions Studio</h1><p className="mt-1 text-sm text-slate-500">Videos up to 60 seconds.</p>{detectedLanguage&&<p className="mt-1 text-xs text-slate-500">Detected language: {detectedLanguage}</p>}</div>
  {error&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
  <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
   <div className="min-w-0 space-y-4">
    <section className={panel}><h2 className="mb-3 text-sm font-semibold">1. Choose your video</h2>
     <label className="mb-3 block text-xs font-medium">Spoken language<select aria-label="Caption language" value={captionLanguage} disabled={!!busy||exporting} onChange={event=>setCaptionLanguage(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="auto">Auto-detect</option><option value="mixed">Hinglish / Mixed (auto-detect)</option>{SPEECH_LANGUAGES.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}</select><span className="mt-1 block text-[11px] font-normal text-slate-500">Choose before uploading your video.</span></label>
     <label className={`${button} w-full cursor-pointer border-dashed bg-slate-50`}><Upload size={18}/><span className="min-w-0 break-all">{fileName||"Choose video — MP4, MOV or WebM"}</span><input aria-label="Upload video for captions" type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v" disabled={!!busy||exporting} onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)void uploadVideo(f);}} className="sr-only"/></label>
     {busy&&<div className="mt-3 flex flex-wrap items-center gap-3"><p role="status" className="flex items-center gap-2 text-sm text-blue-700"><LoaderCircle size={16} className="animate-spin"/>{busy}</p>{generating&&<button type="button" className={button} onClick={()=>job.current?.abort()}>Cancel generation</button>}</div>}
     {url&&!busy&&!segments.length&&<button type="button" className={`${button} mt-3`} disabled={exporting} onClick={()=>{if(original.current)void uploadVideo(original.current);}}>Retry captions</button>}
     <p className="mt-2 text-xs text-slate-500">Video stays on your device; only speech audio is sent for transcription. 100 MB maximum. Original audio stays in the export.</p>
    </section>
    <section className={panel}><h2 className="mb-3 text-sm font-semibold">Video preview</h2>
     {url?<><div className="relative mx-auto w-full overflow-hidden rounded-xl bg-black" style={{aspectRatio:aspect,maxWidth:`min(100%, ${65*aspect}dvh)`}}><video ref={video} src={url} playsInline preload="metadata" className="h-full w-full object-contain" onTimeUpdate={e=>setTime(e.currentTarget.currentTime)} onError={()=>setError("Video preview could not load. Try H.264 MP4.")} /><canvas ref={overlay} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full"/></div>
      <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" className={button} onClick={()=>{const v=video.current;if(v){if(v.paused)void v.play().catch(()=>setError("Playback could not start. Try again."));else v.pause();}}}>Play / Pause</button><span className="text-xs tabular-nums">{time.toFixed(1)}s / {duration.toFixed(1)}s</span></div>
      <input aria-label="Video preview position" type="range" min={0} max={duration} step={.05} value={time} onChange={e=>{if(video.current){video.current.currentTime=Number(e.target.value);setTime(Number(e.target.value));}}} className="mt-2 h-7 w-full accent-blue-600"/>
     </>:<div className="space-y-3"><CaptionStylePreview style={captionStyle} animate={samplePlaying} sampleText={referenceCaptionTemplate(templateId)?.sampleText}/><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">Sample preview · Choose a video to use your own footage.</p><button type="button" className={button} aria-pressed={samplePlaying} onClick={()=>setSamplePlaying(value=>!value)}>{samplePlaying?"Pause sample":"Play sample"}</button></div></div>}
    </section>
    <section className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold">3. Export captioned video</h2><select aria-label="Captioned video format" value={exportFormat} disabled={exporting} onChange={e=>{setExportFormat(e.target.value as "mp4"|"webm");setExportUrl(null);}} className="rounded-lg border border-slate-200 p-2"><option value="mp4">MP4</option><option value="webm">WebM</option></select><button type="button" disabled={!url||!segments.length||!!busy||exporting} onClick={()=>void exportVideo()} className={`${button} bg-blue-600 text-white`}><Download size={16}/>{exporting?`Rendering ${progress}%…`:"Export video with captions"}</button></div>
     <p className="mt-2 text-xs text-slate-500">MP4 or WebM · 30 FPS · Up to 720p short edge</p>
     {exporting&&<div className="mt-3 space-y-2"><progress aria-label="Captioned video export progress" value={progress} max={100} className="w-full"/><button type="button" className={button} onClick={()=>exportJob.current?.abort()}>Cancel export</button><p className="text-xs text-slate-500">Keep this tab open while rendering. Export support depends on your browser.</p></div>}
     {exportUrl&&<a href={exportUrl} download={`${fileName.replace(/\.[^.]+$/,"")||"veelox"}-captioned.${exportFormat}`} className={`${button} mt-3 bg-emerald-50 text-emerald-800`}>Download captioned video</a>}
    </section>
   </div>
   <aside className={panel+' lg:sticky lg:top-0 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto'}><h2 className="mb-3 text-sm font-semibold">Caption design</h2><CaptionDesignPanel style={captionStyle} templateId={templateId} onStyle={updateStyle} onTemplate={selectTemplate} onReset={()=>{remember();setStyleOverrides({});setCaptionAsset(null);setExportUrl(null);}} disabled={exporting||!!busy}/></aside>
  </div>
  <section className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold">Edit timed captions ({segments.length})</h2><div className="flex flex-wrap gap-2"><label className={`${button} cursor-pointer`}>Import SRT<input aria-label="Import SRT captions" type="file" accept=".srt" disabled={!!busy||exporting} className="sr-only" onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)void importSubtitles(f);}}/></label><button type="button" disabled={!segments.length} className={button} onClick={()=>downloadSubtitles("srt")}>SRT</button><button type="button" disabled={!segments.length} className={button} onClick={()=>downloadSubtitles("txt")}>TXT</button><button type="button" disabled={!segments.length} className={button} onClick={()=>downloadSubtitles("vtt")}>VTT</button><button type="button" disabled={!segments.length} className={button} onClick={()=>downloadSubtitles("ass")}>ASS</button><button type="button" disabled={!segments.length||!!busy||exporting} className={button} onClick={()=>void addToProject()}><FolderPlus size={16}/>Add to project</button></div></div>
   <p className="mt-2 text-[11px] text-slate-500">Add to project transfers editable caption text and timing. Export video preserves the full studio styling.</p>
   <CaptionTimingTools segments={segments} onChange={changeSegments} onError={setError} duration={duration} disabled={!!busy||exporting} undo={undoStudio} redo={redoStudio} canUndo={historyCounts.past>0} canRedo={historyCounts.future>0}/>
   <CaptionMiniTimeline segments={segments} duration={duration} time={time} disabled={!!busy||exporting} onError={setError} onChange={changeSegments} onSeek={t=>{setTime(t);if(video.current)video.current.currentTime=t;}}/>
   <div className="mt-3 max-h-[60dvh] space-y-3 overflow-y-auto">{segments.map((segment,i)=><div key={segment.id} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[160px_minmax(0,1fr)]"><div className="flex gap-2">{(["start","end"] as const).map(field=><label key={field} className="min-w-0 flex-1 text-[11px] capitalize">{field}<input aria-label={`Caption ${i+1} ${field}`} type="number" min={0} max={duration||60} step={.05} disabled={exporting} value={segment[field]} onChange={e=>{const value=Number(e.target.value);if(!Number.isFinite(value)||value<0||value>(duration||60)||(field==="start"?value>=segment.end:value<=segment.start))return;changeSegments(segments.map((s,n)=>n===i?{...s,[field]:value,words:[]}:s));}} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white p-2"/></label>)}</div><label className="min-w-0 text-[11px]">Caption text<input aria-label={`Caption ${i+1} text`} value={segment.text} disabled={exporting} onChange={e=>changeSegments(segments.map((s,n)=>n===i?{...s,text:e.target.value,words:[]}:s))} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm"/></label><CaptionWordTools segment={segment} index={i} disabled={!!busy||exporting} onError={setError} onChange={s=>changeSegments(segments.map((row,n)=>n===i?s:row))} onSplit={()=>{try{changeSegments(splitCaption(segments,segment.id));}catch(e){setError(e instanceof Error?e.message:'Cannot split this caption.');}}} onMerge={()=>{try{changeSegments(mergeCaptionNext(segments,segment.id));}catch(e){setError(e instanceof Error?e.message:'Cannot merge these captions.');}}} onDelete={()=>changeSegments(segments.filter(s=>s.id!==segment.id))} onWordAction={(action,n)=>{try{changeSegments(action==="delete"?deleteCaptionWord(segments,segment.id,n):action==="split"?splitCaption(segments,segment.id,n):moveBoundaryWord(segments,segment.id,n,action));}catch(e){setError(e instanceof Error?e.message:"Word action failed.");}}}/></div>)}</div>
   <details className="mt-4"><summary className="cursor-pointer text-sm text-slate-600">Use a script instead (estimated timing)</summary><textarea aria-label="Caption script" value={text} disabled={exporting} onChange={e=>setText(e.target.value)} rows={4} className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm"/><button type="button" disabled={!text.trim()||exporting} className={button} onClick={()=>changeSegments(createSegmentsFromTranscript(text))}>Create estimated captions</button><p className="mt-2 text-xs text-slate-500">Script timings are estimated. Edit the timings to match your video; uploaded speech uses transcription timings.</p></details>
  </section>
 </div><AddToProjectModal isOpen={modal} onClose={()=>setModal(false)} assetType="caption" assetItem={{id:captionAsset?.id,libraryId:captionAsset?.id,url:captionAsset?.url,transcript:segments.map(s=>s.text).join(" "),preset:templateId,style:captionStyle,segments}} defaultTitle="Captions Track"/></StudioShell>;
}
export default function CaptionsPage(){return <Suspense fallback={<AuthLoadingScreen label="Loading Captions Studio…"/>}><CaptionsContent/></Suspense>;}
