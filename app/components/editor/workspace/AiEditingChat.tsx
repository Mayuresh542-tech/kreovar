"use client";
import {useEffect,useRef,useState} from 'react';
import {Sparkles,Send,Square,RotateCcw,Check,LoaderCircle,AlertCircle} from 'lucide-react';
import {useEditor} from './EditorContext';
import {useProject} from '@/app/lib/editor/store';
import {createEditingJob,PIPELINE_PRESETS,STAGE_LABELS,type EditingJob} from '@/app/lib/editor/sequentialEdit';
import {runSequentialEdit} from '@/app/lib/editor/sequentialEditClient';
import {ALL_CAPTION_TEMPLATES} from '@/app/lib/captions/referenceTemplates';
import {assetHeaders} from '@/app/lib/assets/client';

export default function AiEditingChat({active,mode,onManual}:{active:boolean;mode:'manual'|'prompt'|'preset';onManual:()=>void}){
 const {store,repository,scope,selection,playback,authToken}=useEditor(),project=useProject(store),job=project.editingJob;
 const [input,setInput]=useState(''),[preset,setPreset]=useState(PIPELINE_PRESETS[0].id),[captionTemplate,setCaptionTemplate]=useState('signature-poppins'),[busy,setBusy]=useState(false),[error,setError]=useState<string>();
 const [serverBudget,setServerBudget]=useState<{jobId:string;value:NonNullable<EditingJob['tokenBudget']>}>();
 const jobId=job?.id,jobStatus=job?.status,jobStage=job?.currentStage;
 const pending=useRef<AbortController|null>(null),conversation=useRef<HTMLDivElement>(null);
 useEffect(()=>()=>pending.current?.abort(),[]);
 useEffect(()=>{
  if(!jobId)return;const controller=new AbortController();
  void (async()=>{const response=await fetch('/api/editor/ai-budget?'+new URLSearchParams({projectId:project.id,jobId}),{headers:await assetHeaders(),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]),cache:'no-store'});if(response.ok){const value=await response.json();if(!controller.signal.aborted)setServerBudget({jobId,value});}})().catch(()=>{});
  return()=>controller.abort();
 },[project.id,jobId,jobStatus,jobStage]);
 useEffect(()=>{conversation.current?.scrollTo({top:conversation.current.scrollHeight,behavior:'smooth'});},[job?.currentStage,job?.status,error]);
 async function run(next:EditingJob){
  if(pending.current)return;const controller=new AbortController();pending.current=controller;setBusy(true);setError(undefined);playback.set(playback.getSnapshot().time,false);
  try{await runSequentialEdit(store,repository,scope,next,controller.signal,authToken);}catch(e){setError(e instanceof Error?e.message:'Could not save AI editing progress.');}
  finally{pending.current=null;setBusy(false);}
 }
 function start(){try{const config=mode==='preset'?PIPELINE_PRESETS.find(p=>p.id===preset):undefined,next=createEditingJob(store.getSnapshot(),config?.instruction||input,selection,config);if(!config)next.captionTemplate=captionTemplate;void run(next);}catch(e){setError(e instanceof Error?e.message:'Describe your edit.');}}
 const resumable=job&&job.status!=='completed';
 const budget=serverBudget?.jobId===jobId?serverBudget?.value:job?.tokenBudget;
 return <aside className="vx-ai-chat" style={!active?{display:'none'}:undefined} aria-label="Kreovar AI Editor">
  <header><div><Sparkles size={17}/><strong>Kreovar AI Editor</strong></div><button onClick={onManual}>Manual Editor</button></header>
  <div className="vx-ai-token-budget">{budget?`${budget.usedTokens.toLocaleString()} / 300,000 tokens`:'300,000-token edit limit'}{budget?.reservedTokens?` · ${budget.reservedTokens.toLocaleString()} reserved for pending or unconfirmed usage`:''}</div>
  <div className="vx-ai-conversation" ref={conversation} aria-live="polite" aria-relevant="additions text">
   <p className="vx-ai-welcome">Describe your edit. Each step is applied, checked and saved on your timeline.</p>
   {project.editingHistory?.map(item=><div key={item.jobId}><article className="vx-ai-user">{item.instructions}</article><p>{item.summary}</p></div>)}
   {job&&<><article className="vx-ai-user">{job.instructions}</article><ol className="vx-ai-stages">{job.stages.map(stage=><li key={stage.key} data-state={stage.status}>
    {stage.status==='completed'?<Check size={15}/>:stage.status==='failed'?<AlertCircle size={15}/>:['planning','executing','validating','committing'].includes(stage.status)&&busy?<LoaderCircle size={15} className="vx-spin"/>:<span className="vx-ai-stage-dot"/>}
    <div><strong>{STAGE_LABELS[stage.id]}</strong><small>{stage.status==='completed'?'Saved':stage.status==='planning'?'Planning…':stage.status==='executing'?'Executing…':stage.status==='validating'?'Validating…':stage.status==='committing'?'Saving…':stage.status==='cancelled'?'Cancelled':stage.status==='failed'?'Failed': 'Waiting'}</small>
    {stage.status==='completed'&&stage.output?.summary&&<p>{stage.output.summary}</p>}{stage.error&&<p role="alert">{stage.error}</p>}</div>
   </li>)}</ol>
   {job.status==='completed'&&<p className="vx-ai-complete">Editing completed. {job.appliedOperations.length} stages changed the timeline. Review the preview, then export your MP4.</p>}
   {resumable&&!busy&&<div className="vx-ai-resume"><p>{job.requiresNewJob?'The timeline changed manually. Review the saved changes and start a new AI edit.':job.status==='running'?'This job was interrupted. Resume from the first unfinished stage.':'Completed steps remain saved. Retry continues from the unfinished step.'}</p>{!job.requiresNewJob&&<button className="vx-secondary" onClick={()=>void run(job)}><RotateCcw size={14}/> {job.status==='failed'?'Retry stage':'Resume edit'}</button>}</div>}
   </>}
   {error&&<p className="vx-error" role="alert">{error}</p>}
  </div>
  <form onSubmit={e=>{e.preventDefault();start();}} className="vx-ai-chat-input">
   {mode==='prompt'&&<details><summary>Caption template · {ALL_CAPTION_TEMPLATES.find(t=>t.id===captionTemplate)?.name}</summary><label>Caption template<select aria-label="AI caption template" disabled={busy} value={captionTemplate} onChange={e=>setCaptionTemplate(e.target.value)}>{ALL_CAPTION_TEMPLATES.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label></details>}
   {mode==='preset'?<label>Editing preset<select aria-label="Editing preset" value={preset} disabled={busy} onChange={e=>setPreset(e.target.value)}>{PIPELINE_PRESETS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><small>{PIPELINE_PRESETS.find(p=>p.id===preset)?.instruction}</small></label>:<><button type="button" className="vx-ai-suggestion" disabled={busy} onClick={()=>setInput('Add animated captions, motion graphics, relevant B-roll and subtle zoom effects.')}>Captions + B-roll + subtle motion</button><textarea aria-label="AI editing instructions" placeholder="How should I edit this video?" value={input} maxLength={2000} disabled={busy} onChange={e=>setInput(e.target.value)}/></>}
   <div>{busy?<button type="button" className="vx-secondary" onClick={()=>pending.current?.abort()}><Square size={13}/> Cancel operation</button>:<button className="vx-primary" disabled={mode==='prompt'&&!input.trim()}><Send size={14}/> {resumable?'Start new edit':'Send'}</button>}</div>
  </form>
 </aside>;
}
