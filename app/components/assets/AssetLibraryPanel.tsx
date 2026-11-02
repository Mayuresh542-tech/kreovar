"use client";
import AssetMediaPreview from "./AssetMediaPreview";
import {useEffect,useRef,useState} from "react";
import {Upload,Download,FolderPlus,RefreshCw} from "lucide-react";
import {listAssets,uploadAssetFile,downloadAsset,projectAssetItem} from "../../lib/assets/client";
import type {StudioAsset,StudioAssetKind,AssetRole} from "../../lib/assets/types";
import {readMediaDuration} from "../../lib/media/metadata";
import AddToProjectModal from "../projects/AddToProjectModal";

export default function AssetLibraryPanel({onChoose,compact=false,onlyKind,roleOverride,chooseLabel="Add to editor",hideUpload=false}:{chooseLabel?:string;hideUpload?:boolean;roleOverride?:AssetRole;onChoose?:(asset:StudioAsset)=>Promise<void>|void;compact?:boolean;onlyKind?:StudioAssetKind}){
 const [assets,setAssets]=useState<StudioAsset[]>([]),[kind,setKind]=useState(""),[query,setQuery]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[selected,setSelected]=useState<StudioAsset>(),[nextOffset,setNextOffset]=useState<number|null>(null),[version,setVersion]=useState(0);
 const input=useRef<HTMLInputElement>(null),lock=useRef(false);
 const button=compact?"vx-secondary":"inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50 disabled:opacity-50";
 useEffect(()=>{const abort=new AbortController();setLoading(true);setError("");const timer=setTimeout(()=>{const params=new URLSearchParams({query});if(onlyKind||kind)params.set("kind",onlyKind||kind);void listAssets(params,abort.signal).then(data=>{setAssets(data.assets);setNextOffset(data.nextOffset);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});},200);return()=>{clearTimeout(timer);abort.abort();};},[query,kind,onlyKind,version]);
 async function task(action:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError("");try{await action();}catch(e){setError(e instanceof Error?e.message:"Could not complete this action.");}finally{lock.current=false;setBusy(false);}}
 async function upload(file:File){await task(async()=>{if(!file.size||file.size>100*1024*1024)throw new Error("Choose a non-empty file up to 100 MB.");const metadata:Record<string,unknown>={};if(file.type.startsWith("image/")){const image=await createImageBitmap(file);metadata.width=image.width;metadata.height=image.height;image.close();}else if(/^(audio|video)\//.test(file.type))metadata.duration=await readMediaDuration(file);await uploadAssetFile(file,metadata);setVersion(v=>v+1);});}
 const role=roleOverride || (selected?.kind==="caption"?"captions":selected?.kind==="audio"?"voiceovers":selected?.kind==="image"?"thumbnails":"raw_footage");
 return <section className={compact?"vx-feature-note":"space-y-5"} aria-label="Shared Asset Library">
  <div className="flex flex-wrap items-center gap-2"><strong>{compact?"Your Asset Library":"Private Asset Library"}</strong>{!hideUpload&&<button className={button} disabled={busy} onClick={()=>input.current?.click()}><Upload size={14}/>Upload</button>}<button className={button} disabled={loading||busy} aria-label="Refresh assets" onClick={()=>setVersion(v=>v+1)}><RefreshCw size={14}/></button></div>
  <p className={compact?"vx-hint":"text-xs text-slate-500"}>Upload once and reuse across projects. New originals are private. Up to 100 MB per file and 2 GB per account.</p>
  <input ref={input} hidden type="file" accept={onlyKind==="audio"?"audio/mpeg,audio/wav,audio/ogg,audio/mp4":"video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/ogg,audio/mp4,image/png,image/jpeg,image/webp,.srt,.vtt,.txt"} onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void upload(file);}}/>
  <div className="flex flex-wrap gap-2"><input aria-label="Search your assets" placeholder="Search your assets" value={query} onChange={e=>setQuery(e.target.value)} className={compact?"vx-search":"rounded-lg border border-slate-200 px-3 py-2 text-sm"}/>{!onlyKind&&<select aria-label="Filter asset type" value={kind} onChange={e=>setKind(e.target.value)}><option value="">All types</option><option value="video">Videos</option><option value="audio">Audio</option><option value="image">Images</option><option value="caption">Captions</option><option value="document">Trends, ideas &amp; scripts</option></select>}</div>
  {error&&<p role="alert" className={compact?"vx-error":"text-sm text-rose-600"}>{error}</p>}
  {(loading||busy)&&<p role="status">{busy?"Working…":"Loading assets…"}</p>}
  {!loading&&!assets.length&&<p className={compact?"vx-hint":"text-sm text-slate-500"}>No saved assets match this view.</p>}
  <div className={compact?"space-y-3":"grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"}>{assets.map(asset=><article key={asset.id} className={compact?"space-y-2":"rounded-xl border border-slate-200 bg-white p-4 space-y-3"}>
   {["image","video","audio"].includes(asset.kind)?<AssetMediaPreview url={asset.url} kind={asset.kind as "video"|"audio"|"image"} name={asset.name} className="w-full max-h-48 rounded-lg object-contain"/>:asset.kind==="document"?<details><summary className="cursor-pointer text-sm font-medium">View {String(asset.metadata.toolType||"document")}</summary><p className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words text-sm text-slate-600">{String(asset.metadata.text||"")}</p></details>:<p>Timed subtitle file</p>}
   <strong className="block text-sm break-words">{asset.name}</strong><p className={compact?"vx-hint":"text-xs text-slate-500"}>{asset.kind} · {(asset.size/1048576).toFixed(1)} MB</p>
   <div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={()=>void task(()=>downloadAsset(asset))}><Download size={14}/>Download</button>{asset.kind==="document"?null:onChoose?<button className={button} disabled={busy} onClick={()=>void task(async()=>{await onChoose(asset);})}>{chooseLabel}</button>:<button className={button} disabled={busy} onClick={()=>setSelected(asset)}><FolderPlus size={14}/>Add to project</button>}</div>
  </article>)}</div>
  {nextOffset!==null&&<button className={button} disabled={busy||loading} onClick={()=>void task(async()=>{const params=new URLSearchParams({query,offset:String(nextOffset)});if(onlyKind||kind)params.set("kind",onlyKind||kind);const data=await listAssets(params);setAssets(old=>[...old,...data.assets]);setNextOffset(data.nextOffset);})}>Load more</button>}
  {selected&&<AddToProjectModal isOpen onClose={()=>setSelected(undefined)} assetType={role} assetItem={projectAssetItem(selected)} assetLabel={selected.name}/>}
 </section>;
}

