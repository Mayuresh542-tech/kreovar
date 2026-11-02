"use client";
import {useState} from "react";
import AssetLibraryPanel from "../../assets/AssetLibraryPanel";
import ImageGenerator from "../../assets/ImageGenerator";
import {useEditor} from "./EditorContext";
import {addAsset,addClip,addCaption} from "@/app/lib/editor/operations";
import {canPlace,uid} from "@/app/lib/editor/model";
import type {StudioAsset,AssetRole} from "@/app/lib/assets/types";
import {assetHeaders,assetResponse,linkAsset} from "@/app/lib/assets/client";
import {CURATED_VOICES} from "@/app/lib/server/tts/voices";
export function useLibraryInsert(roleOverride?:AssetRole){const {store,playback,select}=useEditor();return async(asset:StudioAsset)=>{
 if(asset.kind==="document")throw new Error("Text documents can be viewed and downloaded in Asset Library.");
 await linkAsset(store.getSnapshot().id,roleOverride || (asset.kind==="caption"?"captions":asset.kind==="audio"?"voiceovers":asset.kind==="image"?"backgrounds":"raw_footage"),asset.id);
 if(asset.kind==="caption"){const segments=asset.metadata.segments;if(!Array.isArray(segments)||!segments.length)throw new Error("No timed captions found.");store.execute(p=>segments.reduce((next,s)=>addCaption(next,String(s.text),Number(s.start),Number(s.end)-Number(s.start)),p));return;}
 const project=store.getSnapshot(),track=project.trackOrder.map(id=>project.tracks[id]).find(t=>!t.locked&&canPlace(t.kind,asset.kind as "video"|"audio"|"image"));if(!track)throw new Error("Add or unlock a compatible track.");
 const media={id:asset.id,libraryId:asset.id,name:asset.name,kind:asset.kind,mime:asset.mime,size:asset.size,url:asset.url,duration:asset.kind==="image"?5:asset.duration,width:asset.width,height:asset.height};
 if(media.duration<=0)throw new Error("This asset has no readable duration. Download and reimport it.");
 const id=uid();store.execute(p=>addClip(addAsset(p,media),asset.id,track.id,playback.getSnapshot().time,{id,...(asset.kind==="audio"?{audioRole:roleOverride==="sfx_assets"?"sfx" as const:roleOverride==="voiceovers"?"speech" as const:"background" as const}:{}),...(roleOverride==="broll_assets"?{volume:0}:{})}));select([id]);
};}
export function SharedAssetTools(){const insert=useLibraryInsert();return <details className="vx-feature-note"><summary>Shared Asset Library</summary><AssetLibraryPanel compact onChoose={insert}/></details>;}
export function SharedImageTools(){const insert=useLibraryInsert();return <ImageGenerator compact onCreated={insert}/>;}
export function VoiceTools(){const insert=useLibraryInsert("voiceovers"),[text,setText]=useState(""),[voice,setVoice]=useState(CURATED_VOICES[0].id),[busy,setBusy]=useState(false),[error,setError]=useState("");
 return <details className="vx-feature-note"><summary>Generate AI voiceover</summary><form className="space-y-3" onSubmit={e=>{e.preventDefault();if(busy)return;setBusy(true);setError("");void assetHeaders().then(headers=>fetch("/api/voice/generate",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({text,voiceConfig:{voiceId:voice,speed:1}})})).then(assetResponse).then(async data=>{if(!data.asset)throw new Error("Voiceover was not saved.");await insert(data.asset);}).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}><textarea aria-label="Voiceover script" maxLength={10000} value={text} onChange={e=>setText(e.target.value)} placeholder="Enter your voiceover script…" rows={4}/><select aria-label="AI voice" value={voice} onChange={e=>setVoice(e.target.value)}>{CURATED_VOICES.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select><button className="vx-primary vx-wide" disabled={busy||!text.trim()}>{busy?"Generating…":"Generate and add voiceover"}</button></form>{error&&<p role="alert" className="vx-error">{error}</p>}</details>;
}

