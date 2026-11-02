"use client";
import {useEffect,useRef,useState} from "react";
import {MediaAsset} from "@/app/lib/editor/model";
import {useEditor} from "./EditorContext";
export default function MediaPreview({asset,close}:{asset:MediaAsset;close:()=>void}){
 const {repository}=useEditor(),[source,setSource]=useState<{id:string;url:string}>(),[error,setError]=useState("");
 const media=useRef<HTMLMediaElement|null>(null);
 useEffect(()=>{let cancelled=false;setError("");void repository.resolve(asset).then(url=>{if(!cancelled)setSource({id:asset.id,url});}).catch(()=>{if(!cancelled)setError("Preview unavailable. Relink the original file and try again.");});return()=>{cancelled=true;media.current?.pause();};},[asset,repository]);
 useEffect(()=>{const element=media.current;return()=>{if(element){element.pause();element.removeAttribute("src");element.load();}};},[asset.id,source]);
 const url=source?.id===asset.id?source.url:undefined;
 return <section className="vx-asset-preview" aria-label="Media preview"><header><strong>{asset.name}</strong><button aria-label="Close media preview" onClick={close}>×</button></header>{error?<p role="alert">{error}</p>:!url?<p role="status">Loading preview…</p>:asset.kind==="video"?<video key={url} ref={element=>{media.current=element;}} src={url} controls playsInline preload="metadata" onError={()=>setError("This file could not be previewed in your browser.")}/>:asset.kind==="audio"?<audio key={url} ref={element=>{media.current=element;}} src={url} controls preload="metadata" onError={()=>setError("This file could not be previewed in your browser.")}/>:<img src={url} alt={asset.name} onError={()=>setError("This image could not be previewed.")}/>}</section>;
}

