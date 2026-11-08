"use client";
import {createPortal} from "react-dom";
import { useEffect,useRef, useState } from "react";
import { readMediaDuration } from "../../lib/media/metadata";
import { uploadMime } from "../../lib/assets/uploadPolicy";
import AssetLibraryPanel from "../assets/AssetLibraryPanel";
import {importProjectAsset,projectImportKinds} from "../../lib/assets/projectImport";
import type {StudioAsset} from "../../lib/assets/types";
import { Upload } from "lucide-react";
import { uploadAssetFile,projectAssetItem } from "../../lib/assets/client";
import { supabase } from "../../lib/supabase";
import { addAssetToProject, getProject } from "../../lib/services/projectService";
import type { VeeloxProject } from "../../lib/services/types";

type Kind = "raw_footage" | "voiceovers" | "broll_assets" | "thumbnails" | "captions" | "sfx_assets";
const options: { kind: Kind; label: string; accept: string }[] = [
  { kind: "raw_footage", label: "Upload raw footage", accept: "video/mp4,video/webm,video/quicktime" },
  { kind: "voiceovers", label: "Upload voiceover", accept: "audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg,audio/webm" },
  { kind: "broll_assets", label: "Upload B-roll", accept: "video/mp4,video/webm,video/quicktime" },
  { kind: "thumbnails", label: "Upload thumbnail", accept: "image/png,image/jpeg,image/webp" },
  { kind: "sfx_assets", label: "Upload SFX", accept: "audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg,audio/webm" },
  { kind: "captions", label: "Import captions", accept: ".srt,.vtt" },
];


export default function ProjectAssetUploads({ projectId, onSaved }: { projectId: string; onSaved: (project: VeeloxProject) => void }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [progress, setProgress] = useState<{ percent: number; loaded: number; total: number } | null>(null);
  const lock = useRef(false),device=useRef<HTMLInputElement>(null),dialog=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement|null>(null);
  const [chosen,setChosen]=useState<Kind>(),[source,setSource]=useState<'choose'|'library'>();
  const option=options.find(item=>item.kind===chosen);
  useEffect(()=>{if(!source)return;const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.current?.focus();return()=>{document.body.style.overflow=overflow;(trigger.current||previous)?.focus();};},[source]);
  function closeSource(){if(!lock.current)setSource(undefined);}
  async function fromLibrary(asset:StudioAsset){
   if(!chosen||lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('Adding '+asset.name+'…');
   try{const saved=await importProjectAsset(projectId,chosen,asset);onSaved(saved);setMessage('Added '+asset.name+' to this project.');setSource(undefined);}catch(error){setMessage('');throw error;}finally{lock.current=false;setBusy(false);}
  }
  async function upload(files: File[], kind: Kind) {
    if (lock.current || !files.length) return;
    lock.current = true; setBusy(true); setError(""); setMessage(`Adding ${files.length} file(s)…`); setProgress(null);
    try {
      const max = kind === "captions" ? 1024 * 1024 : kind === "thumbnails" ? 10 * 1024 * 1024 : 100 * 1024 * 1024;
      const failures:string[]=[];let succeeded=0;
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) throw new Error("Sign in again to add files.");
      const project = await getProject(projectId);
      if (!project || project.user_id !== data.user.id) throw new Error("This project is unavailable.");
      for(let index=0;index<files.length;index++){
      const file=files[index];try{
      if(!file.size||file.size>max)throw new Error(`Choose a non-empty file smaller than ${Math.round(max/1024/1024)} MB.`);
      setMessage(`Adding ${index+1} of ${files.length}: ${file.name}…`);
      const accepted=options.find(o=>o.kind===kind)!.accept.split(",");
      const mime=uploadMime(file);
      if(kind!=="captions"&&!accepted.includes(mime))throw new Error("Unsupported file type.");
      const metadata:Record<string,unknown>={};
      if(kind==="thumbnails"){const image=await createImageBitmap(file);metadata.width=image.width;metadata.height=image.height;image.close();}
      else if(kind!=="captions")metadata.duration=await readMediaDuration(file.type===mime?file:new File([file],file.name,{type:mime}));
      const libraryAsset=await uploadAssetFile(file,metadata,undefined,(msg,pct,loaded,total)=>{
        setMessage(msg);
        if(typeof pct==="number"&&typeof loaded==="number"&&typeof total==="number"){
          setProgress({percent:pct,loaded,total});
        }
      });
      const asset=projectAssetItem(libraryAsset);
      const saved = await addAssetToProject(projectId, kind, asset);
      if (!saved) throw new Error("The file could not be attached to this project. Please retry.");
      onSaved(saved);succeeded++;
      }catch(error){failures.push(file.name+": "+(error instanceof Error?error.message:"Upload failed."));}
      }
      setMessage(`${succeeded} of ${files.length} files added to this project.`); setProgress(null);
      if(failures.length)setError(failures.join("; "));
    } catch (e) { setMessage(""); setError(e instanceof Error ? e.message : "Could not add this file. Please retry."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section aria-label="Add project assets" className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
    <div><h2 className="text-sm font-semibold text-slate-900">Add assets to this project</h2><p className="text-xs text-slate-500 mt-1">Upload your files here, then choose Open in Editor.</p></div>
    <div className="flex flex-wrap gap-2">{options.map(item=><button key={item.kind} type="button" disabled={busy} aria-haspopup="dialog" onClick={event=>{trigger.current=event.currentTarget;setChosen(item.kind);setSource('choose');}} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Upload className="h-3.5 w-3.5" aria-hidden="true"/>{item.label}</button>)}</div>
    <input ref={device} hidden aria-label="Choose project files from your device" type="file" accept={option?.accept} multiple disabled={busy} onChange={event=>{const files=Array.from(event.target.files||[]);event.target.value='';if(files.length&&chosen)void upload(files,chosen);}}/>
    {source&&option&&createPortal(<div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-3 sm:p-6" onClick={event=>{if(event.target===event.currentTarget)closeSource();}}>
     <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="project-source-title" tabIndex={-1} className="max-h-[85dvh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-4 shadow-xl outline-none sm:p-6" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();closeSource();}if(event.key==='Tab'){const controls=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not([hidden]):not(:disabled),select:not(:disabled),a[href]');if(!controls?.length){event.preventDefault();return;}const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){event.preventDefault();first.focus();}}}}>
      <div className="mb-4 flex items-center justify-between gap-3"><h2 id="project-source-title" className="text-base font-semibold">{option.label}</h2><button type="button" disabled={busy} onClick={closeSource} aria-label="Close import options" className="min-h-11 rounded-lg px-3 text-sm">Close</button></div>
      {source==='choose'?<div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={()=>setSource('library')} className="min-h-24 rounded-xl border border-slate-200 p-5 text-left hover:bg-slate-50"><strong className="block text-sm">From Asset Library</strong><span className="mt-1 block text-xs text-slate-500">Reuse an asset you already saved.</span></button><button type="button" onClick={()=>{device.current?.click();setSource(undefined);}} className="min-h-24 rounded-xl border border-slate-200 p-5 text-left hover:bg-slate-50"><strong className="block text-sm">From Your Device</strong><span className="mt-1 block text-xs text-slate-500">Choose one or more files to upload.</span></button></div>:<><button type="button" disabled={busy} onClick={()=>setSource('choose')} className="mb-3 min-h-11 text-xs font-semibold">← Choose another source</button><AssetLibraryPanel key={chosen} onlyKind={projectImportKinds[chosen!]} roleOverride={chosen} chooseLabel="Add to project" hideUpload onChoose={fromLibrary}/></>}
     </div>
    </div>,document.body)}
    {message && <div className="space-y-1.5 pt-1">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span className="font-medium">{message}</span>
        {progress && progress.total > 0 && <span className="font-mono text-[11px] text-slate-400">{(progress.loaded / 1048576).toFixed(1)} / {(progress.total / 1048576).toFixed(1)} MB</span>}
      </div>
      {progress && <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600 transition-all duration-150" style={{width:`${progress.percent}%`}}/></div>}
    </div>}
    {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
  </section>;
}
