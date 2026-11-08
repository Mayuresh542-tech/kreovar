"use client";
import {publicErrorMessage,publicServiceText} from '@/app/lib/serviceMessages';
import {useEffect,useRef,useState} from 'react';
import {Sparkles,Send,Square,RotateCcw,Check,LoaderCircle,AlertCircle} from 'lucide-react';
import {useEditor} from './EditorContext';
import {useProject} from '@/app/lib/editor/store';
import {createEditingJob,PIPELINE_PRESETS,STAGE_LABELS,type EditingJob} from '@/app/lib/editor/sequentialEdit';
import {runSequentialEdit} from '@/app/lib/editor/sequentialEditClient';

export const FEATURED_PRESET_IDS = ['hormozi', 'podcast-pro', 'mrbeast', 'documentary', 'clean'] as const;
const FEATURED_PRESETS = FEATURED_PRESET_IDS.map(id => PIPELINE_PRESETS.find(p => p.id === id)).filter((p): p is import('@/app/lib/editor/sequentialEdit').PipelinePreset => !!p);

export default function AiEditingChat({active,onManual}:{active:boolean;onManual:()=>void}){
 const {store,repository,scope,selection,playback,authToken}=useEditor(),project=useProject(store),job=project.editingJob;
 const [input,setInput]=useState(''),[preset,setPreset]=useState<string>(),[busy,setBusy]=useState(false),[error,setError]=useState<string>();
 const pending=useRef<AbortController|null>(null),conversation=useRef<HTMLDivElement>(null);
 useEffect(()=>()=>pending.current?.abort(),[]);
 useEffect(()=>{conversation.current?.scrollTo({top:conversation.current.scrollHeight,behavior:'smooth'});},[job?.currentStage,job?.status,error]);
 async function run(next:EditingJob){
  if(pending.current)return;const controller=new AbortController();pending.current=controller;setBusy(true);setError(undefined);playback.set(playback.getSnapshot().time,false);
  try{await runSequentialEdit(store,repository,scope,next,controller.signal,authToken);}catch(e){setError(publicErrorMessage(e instanceof Error?e.message:undefined,'Could not save AI editing progress.'));}
  finally{pending.current=null;setBusy(false);}
 }
 function start(){try{const config=PIPELINE_PRESETS.find(p=>p.id===preset&&p.instruction===input.trim()),next=createEditingJob(store.getSnapshot(),input,selection,config);void run(next);}catch(e){setError(e instanceof Error?e.message:'Describe your edit.');}}
 const resumable=job&&job.status!=='completed';
 return <aside className="vx-ai-chat" style={!active?{display:'none'}:undefined} aria-label="Edit with AI">
  <header><div><Sparkles size={17}/><strong>Edit with AI</strong></div><button onClick={onManual}>Manual Editor</button></header>
  <div className="vx-ai-conversation" ref={conversation} aria-live="polite" aria-relevant="additions text">
   <p className="vx-ai-welcome">Tell me what you want to change, or choose a preset below.</p>
   {project.editingHistory?.map(item=><div key={item.jobId}><article className="vx-ai-user">{item.instructions}</article><p>{publicServiceText(item.summary)}</p></div>)}
   {job&&<><article className="vx-ai-user">{job.instructions}</article><ol className="vx-ai-stages">{job.stages.map(stage=><li key={stage.key} data-state={stage.status}>
    {stage.status==='completed'?<Check size={15}/>:stage.status==='failed'?<AlertCircle size={15}/>:['planning','executing','validating','committing'].includes(stage.status)&&busy?<LoaderCircle size={15} className="vx-spin"/>:<span className="vx-ai-stage-dot"/>}
    <div><strong>{STAGE_LABELS[stage.id]}</strong><small>{stage.status==='completed'?'Saved':stage.status==='planning'?'Planning…':stage.status==='executing'?'Executing…':stage.status==='validating'?'Validating…':stage.status==='committing'?'Saving…':stage.status==='cancelled'?'Cancelled':stage.status==='failed'?'Failed': 'Waiting'}</small>
    {stage.status==='completed'&&stage.output?.summary&&<p>{publicServiceText(stage.output.summary)}</p>}{stage.error&&<p role="alert">{publicErrorMessage(stage.error)}</p>}</div>
   </li>)}</ol>
   {job.status==='completed'&&(
    job.stages.find(s=>s.output?.questions?.length)?(
     <p className="vx-ai-complete">{publicServiceText(job.stages.find(s=>s.output?.questions?.length)?.output?.questions?.[0]||job.stages.find(s=>s.output?.questions?.length)?.output?.summary||'Please clarify your request.')}</p>
    ):(
     <p className="vx-ai-complete">Editing completed. {job.appliedOperations.length} stages changed the timeline. Review the preview, then export your MP4.</p>
    )
   )}
   {resumable&&!busy&&<div className="vx-ai-resume"><p>{job.requiresNewJob?'The timeline changed manually. Review the saved changes and start a new AI edit.':job.status==='running'?'This job was interrupted. Resume from the first unfinished stage.':'Completed steps remain saved. Retry continues from the unfinished step.'}</p>{!job.requiresNewJob&&<button className="vx-secondary" onClick={()=>void run(job)}><RotateCcw size={14}/> {job.status==='failed'?'Retry stage':'Resume edit'}</button>}</div>}
   </>}
   {error&&<p className="vx-error" role="alert">{publicErrorMessage(error)}</p>}
  </div>
  <form onSubmit={e=>{e.preventDefault();start();}} className="vx-ai-chat-input">
   <textarea aria-label="AI editing instructions" placeholder="Describe your edit…" value={input} maxLength={2000} disabled={busy} onChange={e=>{setInput(e.target.value);setPreset(undefined);}}/>
   <fieldset className="vx-ai-chat-presets" disabled={busy}><legend>Try a preset</legend><div>{FEATURED_PRESETS.map(p=><button key={p.id} type="button" aria-pressed={preset===p.id} title={p.instruction} onClick={()=>{setPreset(p.id);setInput(p.instruction);}}>{p.name}</button>)}</div></fieldset>
   <div>{busy?<button type="button" className="vx-secondary" onClick={()=>pending.current?.abort()}><Square size={13}/> Cancel operation</button>:<button className="vx-primary" disabled={!input.trim()}><Send size={14}/> {resumable?'Start new edit':'Send'}</button>}</div>
  </form>
 </aside>;
}
