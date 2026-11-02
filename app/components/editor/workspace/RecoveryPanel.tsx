"use client";
import {useEffect,useRef,useState} from 'react';
import {useProject} from '@/app/lib/editor/store';
import {cacheRead} from '@/app/lib/editor/cache';
import {validRecovery} from '@/app/lib/editor/recovery';
import {readOriginal} from '@/app/lib/editor/original';
import {useEditor} from './EditorContext';
export default function RecoveryPanel(){
 const {store,scope,notify}=useEditor(),p=useProject(store),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function verify(){if(busy)return;const abort=new AbortController();controller.current=abort;setBusy(true);let checked=0;const failed:string[]=[];
  try{const q=store.getSnapshot(),ids=[...new Set(Object.values(q.clips).flatMap(c=>c.assetId?[c.assetId]:[]))];for(const id of ids){abort.signal.throwIfAborted();const asset=q.assets[id];setStatus('Checking original: '+asset.name);try{await readOriginal(asset,abort.signal);checked++;}catch(error){abort.signal.throwIfAborted();failed.push(asset.name+': '+(error instanceof Error?error.message:'Unavailable'));}}setStatus(failed.length?checked+' originals verified. Could not verify: '+failed.join('; '):checked+' originals verified.');}catch(error){setStatus(abort.signal.aborted?'Original check cancelled.':error instanceof Error?error.message:'Original check failed.');}finally{setBusy(false);controller.current=null;}}
 async function restore(){try{const previous=validRecovery(await cacheRead('projects',scope+':previous'),p.id);if(!previous)throw new Error('No valid earlier checkpoint is available yet.');store.execute(()=>previous);notify('Restored the previous device checkpoint. Undo returns to your edit.');}catch(error){notify(error instanceof Error?error.message:'Recovery failed.');}}
 function backup(){const blob=new Blob([JSON.stringify(store.getCommittedSnapshot())],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(p.title.replace(/[^a-zA-Z0-9 _-]/g,'')||'Kreovar')+'-project.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
 return <details className="vx-feature-note"><summary>Project recovery & originals</summary><p>Committed edits save on this device; signed-in projects also sync originals to private storage. Keep browser storage until cloud sync finishes. Project backups contain edit instructions, not media files.</p><div className="vx-quick-actions"><button onClick={()=>void verify()} disabled={busy}>Verify originals</button><button onClick={backup}>Download project backup</button><button onClick={()=>void restore()} disabled={busy}>Restore previous checkpoint</button>{busy&&<button onClick={()=>controller.current?.abort()}>Cancel original check</button>}</div>{status&&<p role="status">{status}</p>}</details>;
}
