"use client";
import {useEffect,useState} from 'react';
import {resolveAssetPreview} from '../../lib/assets/preview';
type MediaKind='video'|'audio'|'image';
/** No bearer token in media URLs. Preview links are resolved only when opened (images on mount). */
export default function AssetMediaPreview({url,kind,name,className=''}:{url:string;kind:MediaKind;name:string;className?:string}){
 const [request,setRequest]=useState(0),[result,setResult]=useState<{key:string;source?:string;error?:string;loading?:boolean}>({key:''});
 useEffect(()=>{if(!request&&kind!=='image')return;const controller=new AbortController();
  void resolveAssetPreview(url,AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])).then(source=>{if(!controller.signal.aborted)setResult({key:url,source});}).catch(error=>{if(!controller.signal.aborted)setResult({key:url,error:error instanceof Error?error.message:'Preview failed. Please retry.'});});
  return()=>controller.abort();
 },[url,kind,request]);
 const current=result.key===url?result:undefined,source=current?.source,loading=current?.loading||((kind==='image'||request>0)&&!current);
 const failed=()=>setResult({key:url,error:kind==='video'?'This video could not play. Retry the preview; if it still fails, reimport an H.264 MP4.':'This media could not load. Retry the preview.'});
 return <div className="relative flex min-h-16 w-full flex-col items-center justify-center gap-2" aria-label={name+' preview'}>
  {source?(kind==='image'?<img src={source} alt={name} onError={failed} className={className}/>:kind==='video'?<video src={source} aria-label={name} controls playsInline preload="metadata" onError={failed} className={className}/>:<audio src={source} aria-label={name} controls preload="metadata" onError={failed} className={className}/>):<>
   {current?.error&&<p role="alert" className="max-w-sm px-3 text-center text-xs text-rose-500">{current.error}</p>}
   <button type="button" disabled={loading} onClick={()=>{setResult({key:url,loading:true});setRequest(v=>v+1);}} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 disabled:opacity-50">{loading?'Opening preview…':current?.error?'Retry preview':'Open '+(kind==='image'?'image':kind==='audio'?'audio':'video')+' preview'}</button>
  </>}
 </div>;
}
