"use client";
import {removeProjectMedia} from '@/app/lib/editor/projectMedia';
import {publicErrorMessage} from '@/app/lib/serviceMessages';
import { useEffect, useRef, useState } from "react";
import { Film, Upload, Search, Plus, Music, Image as ImageIcon, Link2, Play, Trash2 } from "lucide-react";
import { useProject } from "@/app/lib/editor/store";
import { MediaAsset, canPlace } from "@/app/lib/editor/model";
import { importMedia } from "@/app/lib/editor/media";
import { addAsset, addCaption, addClip, addText, addTransition, changeClipProperty } from "@/app/lib/editor/operations";
import { parseSRT } from "@/app/lib/captions/subtitlesParser";
import { useEditor } from "./EditorContext";
import { CaptionTools, StockTools, AssetDownload } from "./ConnectedTools";
import {SharedAssetTools,SharedImageTools,VoiceTools,useLibraryInsert} from "./SharedAssets";
import MotionLibrary from "../../assets/MotionLibrary";
import SfxLibrary from "../../assets/SfxLibrary";
import {uploadAssetFile,linkAsset} from "@/app/lib/assets/client";
import SequenceBuilder from "./SequenceBuilder";
import AudioBalance from "./AudioBalance";
import CaptionList from "./CaptionList";
import RecoveryPanel from "./RecoveryPanel";
import ShapeLibrary from './ShapeLibrary';
import CaptionTemplates from "./CaptionTemplates";
import MediaPreview from "./MediaPreview";
import BRollDownloadButton from "../../BRollDownloadButton";
export type LibraryTab="media"|"ai"|"audio"|"text"|"captions"|"transitions"|"effects"|"filters"|"sfx"|"broll"|"motion"|"shapes";
const textPresets=[{name:"Kreovar Title",text:"Make something matter.",style:{size:88,weight:800}}, {name:"Studio Label",text:"THE NEXT CHAPTER",style:{size:44,weight:600,letterSpacing:6,color:"#93b4ff"}}, {name:"Creator Card",text:"Your story starts here",style:{size:60,background:"#172033",weight:700}}, {name:"Quiet Note",text:"A moment worth keeping.",style:{size:48,weight:400,font:"Inter"}}];
export default function Library({tab}:{tab:LibraryTab}){
  const insertShared=useLibraryInsert();
  const insertSfx=useLibraryInsert("sfx_assets");
  const {store,playback,repository,scope,run,selection,select,notify}=useEditor(),project=useProject(store);
  const [query,setQuery]=useState(""),[progress,setProgress]=useState<{name:string;value:number}>(),[drag,setDrag]=useState(false),[relink,setRelink]=useState<string>();
  const [preview,setPreview]=useState<MediaAsset>(),[mediaKind,setMediaKind]=useState("all");
  useEffect(()=>{setPreview(undefined);setMediaKind("all");},[tab]);
  const [removing,setRemoving]=useState<MediaAsset>();
  const removeDialog=useRef<HTMLDialogElement>(null),mediaSearch=useRef<HTMLInputElement>(null);
  useEffect(()=>{const dialog=removeDialog.current;if(removing)dialog?.showModal();return()=>dialog?.close();},[removing]);
  function removeMedia(asset:MediaAsset,confirmed=false){
    const current=store.getSnapshot(),used=Object.values(current.clips).filter(c=>c.assetId===asset.id);
    if(used.length&&!confirmed){setRemoving(asset);return;}
    try{store.execute(p=>removeProjectMedia(p,asset.id,confirmed));select(selection.filter(id=>!!store.getSnapshot().clips[id]));if(preview?.id===asset.id)setPreview(undefined);setRemoving(undefined);notify('Removed from this project. Undo to restore. The original file has not been deleted.');setTimeout(()=>mediaSearch.current?.focus(),0);}catch(error){notify(publicErrorMessage(error instanceof Error?error.message:undefined));}
  }
  const removalClips=removing?Object.values(project.clips).filter(c=>c.assetId===removing.id):[],removalLocked=removalClips.some(c=>project.tracks[c.trackId].locked);
  const importing=useRef(false);
  const fileInput=useRef<HTMLInputElement>(null),subtitleInput=useRef<HTMLInputElement>(null);
  async function upload(files:FileList|File[]){
    if(importing.current)return;
    importing.current=true;
    const replacing=relink;setRelink(undefined);
    try{
      const failures:string[]=[];let succeeded=0;
      for(const file of Array.from(files)){
        try{
        setProgress({name:file.name,value:0});
        if(!file.size||file.size>100*1024*1024)throw new Error("Import files up to 100 MB.");
        const imported=await importMedia(file,scope,value=>setProgress({name:file.name,value:Math.min(25,Math.round(value*0.25))}));
        const saved=await uploadAssetFile(file,{duration:imported.duration,width:imported.width,height:imported.height},undefined,(msg,pct)=>{
          if(typeof pct==="number")setProgress({name:file.name,value:25+Math.round(pct*0.7)});
        });
        setProgress({name:file.name,value:98});
        await linkAsset(project.id,saved.kind==="audio"?"voiceovers":saved.kind==="image"?"backgrounds":"raw_footage",saved.id);
        const asset={...imported,libraryId:saved.id,url:saved.url};
        if(replacing){const existing=store.getSnapshot().assets[replacing];if(asset.kind!==existing.kind)throw new Error("Relink with the same media type.");
          const used=Object.values(store.getSnapshot().clips).filter(c=>c.assetId===replacing);if(asset.kind!=="image"&&used.some(c=>c.sourceEnd>asset.duration+0.01))throw new Error("This replacement is shorter than the source range used by your clips.");
          repository.invalidate(replacing);run(p=>addAsset(p,{...asset,id:replacing}));break;
        }else store.execute(p=>addAsset(p,asset));
        succeeded++;
        }catch(error){failures.push(file.name+": "+(error instanceof Error?error.message:"Import failed."));if(replacing)break;}
      }
      notify(`${succeeded} file(s) imported.`+(failures.length?` ${failures.length} failed: `+failures.join("; "):" Build a sequence to join your video clips."));
    }catch(e){notify(e instanceof Error?e.message:"Import failed.");}finally{importing.current=false;setProgress(undefined);if(fileInput.current)fileInput.current.value="";}
  }
  function place(asset:MediaAsset){
    const track=project.trackOrder.map(id=>project.tracks[id]).find(t=>!t.locked&&canPlace(t.kind,asset.kind));
    if(!track){notify("Add or unlock a compatible track.");return;}const id=crypto.randomUUID();run(p=>addClip(p,asset.id,track.id,playback.getSnapshot().time,{id}));select([id]);
  }
  async function subtitles(file:File){try{const captions=parseSRT(await file.text()).filter(c=>Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.end>c.start);if(!captions.length)throw new Error("No valid captions found in this SRT file.");run(p=>captions.reduce((next,c)=>addCaption(next,c.text,c.start,c.end-c.start),p));notify(`Imported ${captions.length} captions.`);}catch(e){notify(e instanceof Error?e.message:"SRT import failed.");}}
  const media=Object.values(project.assets).filter(a=>(tab!=="audio"||a.kind==="audio")&&(mediaKind==="all"||a.kind===mediaKind)&&a.name.toLowerCase().includes(query.toLowerCase()));
  const selected=project.clips[selection[0]];
  const titles:Record<LibraryTab,string>={media:"Project media",audio:"Audio library",text:"Text studio",captions:"Caption Studio",transitions:"Transitions",effects:"Effects",filters:"Filters",ai:"AI media",sfx:"Sound effects",broll:"B-roll footage",motion:"Motion graphics",shapes:"Shapes"};
  return <aside className="vx-library vx-panel" aria-label={titles[tab]}>
    <header className="vx-panel-heading"><span>{titles[tab]}</span><span className="vx-badge">{tab==="media"?`${media.length} assets`:"Kreovar"}</span></header>
    <div key={tab} data-vx-motion="panel" className="vx-library-content">{tab==="audio"&&<AudioBalance/>}
      <input ref={fileInput} type="file" accept=".mp4,.webm,.mov,.mp3,.wav,.png,.jpg,.jpeg,.webp" multiple={!relink} hidden onChange={e=>{if(e.target.files)void upload(e.target.files);}}/>
      <input ref={subtitleInput} type="file" accept=".srt" hidden onChange={e=>{if(e.target.files?.[0])void subtitles(e.target.files[0]);e.target.value="";}}/>
      {(tab==="media"||tab==="audio")&&<>
        <button className={`vx-import ${drag?"vx-drag-over":""}`} disabled={!!progress} onClick={()=>fileInput.current?.click()} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);void upload(e.dataTransfer.files);}}>
          <Upload size={24}/><strong>{progress?`Importing ${progress.name}`:"Import media"}</strong><span>{progress?`${progress.value}% · ${progress.value<25?'reading file':progress.value<95?'uploading':'saving'}`:"Drop files here or browse your device"}</span>
          {progress&&<progress value={progress.value} max={100}/>}
        </button>

        {tab==="audio"&&<><VoiceTools/></>}
        <p className="vx-hint">Video, audio or PNG · up to 100 MB each</p>
        <label className="vx-search"><Search size={14}/><input ref={mediaSearch} aria-label="Search media" placeholder="Search your media" value={query} onChange={e=>setQuery(e.target.value)}/></label>
        {!media.length&&<div className="vx-empty"><Film size={28}/><strong>{query?"No matching media":"Your library starts here"}</strong><p>Import footage, music or images. Preview an asset, then add it or drag it onto a compatible track.</p></div>}
        <div className="vx-library-switch" aria-label="Filter media">{["all","video","audio","image"].map(kind=><button key={kind} aria-pressed={mediaKind===kind} onClick={()=>setMediaKind(kind)}>{kind==="all"?"All":kind[0].toUpperCase()+kind.slice(1)}</button>)}</div>
        {preview&&<MediaPreview asset={preview} close={()=>setPreview(undefined)}/>}
        <div className="vx-media-grid">{media.map(asset=><div key={asset.id} className="vx-media-card" draggable onDragStart={e=>{e.dataTransfer.setData("application/veelox-asset",asset.id);e.dataTransfer.effectAllowed="copy";}}>
          <button className="vx-media-thumb" title={`Preview ${asset.name}`} aria-label={`Preview ${asset.name}`} onClick={()=>{playback.set(playback.getSnapshot().time,false);setPreview(asset);}}>{asset.thumbnail?<img alt="" src={asset.thumbnail}/>:asset.kind==="audio"?<Music size={24}/>:asset.kind==="image"?<ImageIcon size={24}/>:<Film size={24}/>}<span>{asset.kind==="image"?"IMAGE":`${asset.duration.toFixed(1)}s`}</span><Play size={16} className="vx-add-overlay"/></button>
          <strong title={asset.name}>{asset.name}</strong><button className="vx-secondary vx-wide" onClick={()=>place(asset)} aria-label={`Add ${asset.name} to timeline`}><Plus size={13}/> Add to timeline</button><div className="vx-media-meta"><span>{asset.width?`${asset.width}×${asset.height}`:asset.kind.toUpperCase()}{asset.size?` · ${(asset.size/1048576).toFixed(1)} MB`:""}</span><button aria-label={`Relink ${asset.name}`} title="Relink original" onClick={()=>{setRelink(asset.id);fileInput.current?.click();}}><Link2 size={12}/></button></div>
          <button className="vx-remove-media" title="Remove from this project" aria-label={`Remove ${asset.name} from project`} onClick={()=>removeMedia(asset)}><Trash2 size={12}/> Remove</button>
          {asset.kind==="video"&&asset.url?<BRollDownloadButton url={asset.url} name={asset.name} className="vx-ai-entry"/>:<AssetDownload asset={asset}/>}
        </div>)}</div>
        {tab==="media"&&<details className="vx-library-advanced"><summary>Project tools &amp; recovery</summary><SequenceBuilder/><RecoveryPanel/><SharedAssetTools/></details>}
      </>}
      {tab==="sfx"&&<SfxLibrary compact onChoose={insertSfx}/>}
      {tab==="broll"&&<StockTools/>}
      {tab==="shapes"&&<ShapeLibrary/>}
      {tab==="motion"&&<MotionLibrary compact onCreated={insertShared}/>}
      {tab==="text"&&<><p className="vx-hint">Original Kreovar styles. Every detail stays editable.</p>{textPresets.map(preset=><button className="vx-preset" key={preset.name} onClick={()=>run(p=>addText(p,preset.text,playback.getSnapshot().time,preset.style))}><span className="vx-preset-preview" style={{fontWeight:preset.style.weight,color:preset.style.color||"white",letterSpacing:preset.style.letterSpacing?2:0}}>{preset.name}</span><span>Add text <Plus size={14}/></span></button>)}</>}
      {tab==="captions"&&<><div className="vx-caption-actions"><button className="vx-primary vx-wide" onClick={()=>run(p=>addCaption(p,"Write your caption",playback.getSnapshot().time))}><Plus size={14}/> Add manual caption</button><button className="vx-secondary vx-wide" onClick={()=>subtitleInput.current?.click()}><Upload size={14}/> Import SRT</button></div><details className="vx-caption-transcript"><summary>Generate automatic captions</summary><CaptionTools/></details><CaptionTemplates/><details className="vx-caption-transcript"><summary>Transcript &amp; timing</summary><CaptionList/></details></>}
      {tab==="transitions"&&<><p className="vx-hint">Select two adjacent visual clips on one track with Shift-click.</p>{(["fade","dissolve","slide","zoom"] as const).map(kind=><button key={kind} className="vx-preset" disabled={selection.length!==2} onClick={()=>{const clips=selection.map(id=>project.clips[id]).sort((a,b)=>a.startTime-b.startTime);run(p=>addTransition(p,clips[0].id,clips[1].id,kind,.5));}}><span className={`vx-transition-art vx-transition-${kind}`}/><span>{kind==="dissolve"?"Cross dissolve":kind[0].toUpperCase()+kind.slice(1)} <Plus size={14}/></span></button>)}<p className="vx-hint">Transitions hold the outgoing final frame while the incoming clip reveals. Adjust duration in the inspector.</p></>}
      {tab==="effects"&&<><p className="vx-hint">Select a visual clip to apply a non-destructive effect.</p><button className="vx-preset" disabled={!selected||!selected.assetId||project.assets[selected.assetId]?.kind==="audio"} onClick={()=>run(p=>changeClipProperty(p,selected.id,{effects:{...selected.effects,blur:selected.effects.blur?0:6}}))}><span className="vx-preset-preview">Soft focus</span><span>{selected?.effects.blur?"Remove blur":"Add blur"}</span></button></>}
      {tab==="filters"&&<><p className="vx-hint">Select a visual clip. Adjustments remain editable in the inspector.</p>{[{name:"Original",brightness:0,contrast:0,saturation:0},{name:"Studio contrast",brightness:2,contrast:18,saturation:-8},{name:"Monochrome",brightness:0,contrast:12,saturation:-100},{name:"Soft light",brightness:10,contrast:-12,saturation:-12}].map(filter=><button key={filter.name} className="vx-preset" disabled={!selected||!selected.assetId||project.assets[selected.assetId]?.kind==="audio"} onClick={()=>run(p=>changeClipProperty(p,selected.id,{effects:{...selected.effects,brightness:filter.brightness,contrast:filter.contrast,saturation:filter.saturation}}))}><span className="vx-preset-preview">{filter.name}</span><span>Apply filter <Plus size={14}/></span></button>)}</>}
      {tab==="ai"&&<SharedImageTools/>}
    </div>
    {removing&&<dialog ref={removeDialog} className="vx-dialog" aria-labelledby="remove-media-title" onCancel={()=>setRemoving(undefined)}>
      <h2 id="remove-media-title">Remove from this project?</h2><p className="vx-hint">{removing.name} is used by {removalClips.length} timeline clip(s). Removing it also removes those clips and their transitions. The original file is not deleted. You can undo this change.</p>
      {removalLocked&&<p className="vx-error">Unlock the tracks using this file before removing it.</p>}
      <div className="vx-remove-media-actions"><button className="vx-secondary" onClick={()=>setRemoving(undefined)}>Keep media</button><button className="vx-primary" disabled={removalLocked} onClick={()=>removeMedia(removing,true)}>Remove media and clips</button></div>
    </dialog>}
  </aside>;
}


