"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {Play,Download,RefreshCw} from "lucide-react";
import {assetHeaders,assetResponse,downloadAsset} from "../lib/assets/client";
import type {StudioAsset} from "../lib/assets/types";
export interface SavedVoice {id:string;voice_id:string;voice_name:string;script_text:string;audio_url:string;duration:number;created_at:string;asset:StudioAsset|null}
export default function VoiceHistory({userId,refreshKey,onSelect}:{userId:string;refreshKey:number;onSelect:(voice:SavedVoice)=>void}){
 const [items,setItems]=useState<SavedVoice[]>([]),[next,setNext]=useState<number|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[downloading,setDownloading]=useState<string|null>(null);
 const controller=useRef<AbortController|null>(null);
 const load=useCallback(async(offset=0)=>{
  controller.current?.abort();const active=new AbortController();controller.current=active;
  setLoading(true);setError(null);
  try{const data=await assetResponse(await fetch("/api/voice/history?offset="+offset,{headers:await assetHeaders(),signal:active.signal,cache:"no-store"}));if(active.signal.aborted)return;setItems(previous=>offset?Array.from(new Map([...previous,...data.generations].map((item:SavedVoice)=>[item.id,item])).values()):data.generations);setNext(data.nextOffset);}
  catch(err){if(!active.signal.aborted)setError(err instanceof Error?err.message:"Could not load voiceovers.");}
  finally{if(!active.signal.aborted)setLoading(false);}
 },[]);
 useEffect(()=>{void load();return()=>controller.current?.abort();},[load,userId,refreshKey]);
 async function download(item:SavedVoice){if(!item.asset||downloading)return;setDownloading(item.id);try{await downloadAsset(item.asset);}catch(err){setError(err instanceof Error?err.message:"Download failed.");}finally{setDownloading(null);}}
 return <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-xs" aria-label="Previous voiceover generations">
  <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-slate-900">Previous voiceovers</h3><button type="button" onClick={()=>void load()} disabled={loading} aria-label="Refresh voiceover history" className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-50"><RefreshCw className={"w-4 h-4 "+(loading?"animate-spin":"")}/></button></div>
  {error&&<p role="alert" className="text-sm text-rose-600">{error} <button type="button" onClick={()=>void load()} className="underline">Retry</button></p>}
  {loading&&items.length===0&&<p role="status" className="text-sm text-slate-500">Loading your voiceovers…</p>}
  {!loading&&!error&&items.length===0&&<p className="text-sm text-slate-500">Your generated voiceovers will appear here.</p>}
  <div className="space-y-3">{items.map(item=><div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3">
   <div><p className="text-sm font-semibold text-slate-900">{item.voice_name||"Voiceover"}</p><p className="text-xs text-slate-500 mt-1">{new Date(item.created_at).toLocaleString()} · {Number(item.duration||0).toFixed(1)}s</p><p className="text-sm text-slate-600 line-clamp-2 mt-2 break-words">{item.script_text}</p></div>
   <div className="flex flex-wrap gap-2"><button type="button" disabled={!item.asset} onClick={()=>onSelect(item)} className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-40"><Play className="w-3.5 h-3.5"/>Open in player</button><button type="button" disabled={!item.asset||!!downloading} onClick={()=>void download(item)} className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border border-slate-200 disabled:opacity-40"><Download className="w-3.5 h-3.5"/>{downloading===item.id?"Downloading…":"Download"}</button>{!item.asset&&<span className="text-xs text-slate-500 self-center">Saved file unavailable</span>}</div>
  </div>)}</div>
  {next!==null&&<button type="button" disabled={loading} onClick={()=>void load(next)} className="text-sm font-medium text-slate-700 underline disabled:opacity-50">{loading?"Loading…":"Load older voiceovers"}</button>}
 </section>;
}
