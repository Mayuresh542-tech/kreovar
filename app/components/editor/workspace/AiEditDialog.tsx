"use client";
import {captureFootageFrames} from '@/app/lib/editor/footageFramesClient';
import type {FootageFrame} from '@/app/lib/editor/footageContext';
import type {EditorialAnalysis} from '@/app/lib/editor/editorialAnalysis';
import AutoEditControls from './AutoEditControls';
import {createAutoEditPlan,DEFAULT_AUTO_EDIT,type AutoEditOptions,type AutoCut} from '@/app/lib/editor/autoEdit';
import {reviewDirectedPlan} from '@/app/lib/editor/directorReview';
import {directorBrief} from '@/app/lib/editor/directorBrief';
import {addAsset} from '@/app/lib/editor/operations';
import type {MediaAsset} from '@/app/lib/editor/model';
import {ALL_CAPTION_TEMPLATES as DEFAULT_CAPTION_TEMPLATES} from "@/app/lib/captions/referenceTemplates";
import {mainFootage,expandAiTools,validateAiTools,aiToolDescription,combinePreparedEdit,applyPreparedEdit,type AiToolRequest,type AiCatalogAsset} from "@/app/lib/editor/aiTools";
import {commitReviewedEdit} from "@/app/lib/editor/reviewedEdit";
import {reviewEdit} from "@/app/lib/editor/aiReview";
import {cleanEditInstruction} from '@/app/lib/editor/aiPresets';
import {stockKeys} from "@/app/lib/editor/stockSelection";
import {prepareAiTool,type PreparedTool} from "@/app/lib/editor/aiToolClient";
import {linkAsset} from "@/app/lib/assets/client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Sparkles, X } from "lucide-react";
import { supabase } from "@/app/lib/supabase";
import { EditorProject,projectDuration } from "@/app/lib/editor/model";
import { useProject,EditorStore,PlaybackStore } from "@/app/lib/editor/store";
import { EditDecision, EditDecisionList, applyEditDecisionList } from "@/app/lib/editor/ai";
import { aiProjectSnapshot, validateAiPlan } from "@/app/lib/editor/aiValidation";
import Preview from "./Preview";
import {EditorContext} from "./EditorContext";
import { useEditor } from "./EditorContext";

type AiPlan={editorialAnalysis?:EditorialAnalysis;directorPass?:number;directorBase?:EditorProject;directed?:boolean;retained?:PreparedTool[];summary:string;list:EditDecisionList;snapshot:EditorProject;toolRequests:AiToolRequest[];catalog:AiCatalogAsset[];auto?:{options:AutoEditOptions;selection:string[];notes:string[]}};
const seconds=(value:number)=>Number(value.toFixed(2));
function describe(d: EditDecision, project: EditorProject): string {
  const name = "clipId" in d ? project.clips[d.clipId]?.name || "clip" : "";
  switch (d.op) {
    case 'composeCaption':return 'Compose '+name+' with scene-specific placement and word emphasis';
    case 'setVisualTreatment':return 'Set '+name+' framing and timed blur/scale treatment';
    case 'keyframes':return `Animate ${name} with ${d.frames.length} editable transform keyframes`;
    case 'animate':return `Animate ${name} using ${d.preset}`;
    case 'addShape':return "Add "+d.kind+" shape at "+seconds(d.startTime)+"s for "+seconds(d.duration)+"s";
    case 'addGraphic':return `Add ${d.kind} “${d.text}” at ${seconds(d.startTime)}s for ${seconds(d.duration)}s`;
    case 'addOverlay':return `Animate image overlay ${project.assets[d.assetId]?.name||'image'} at ${seconds(d.startTime)}s for ${seconds(d.duration)}s`;
    case "addZoom":return "Zoom "+name+" from "+d.fromScale+"× to "+d.toScale+"× at "+seconds(d.startTime)+"–"+seconds(d.endTime)+"s"+(d.returnToStart?" and return to the starting framing":" (hold final framing)");
    case "clearZooms":return "Clear timed zooms on "+name;
    case "rippleCut":return "Remove "+d.ranges.map(r=>seconds(r.start)+"–"+seconds(r.end)+"s").join(", ")+" and close the gaps across all tracks, including audio and captions";
    case "applyTextPlacement":return `Apply ${d.placementId} placement to ${d.clipIds.length} text/caption clips`;
    case "appendSequence":return "Join footage in order: "+d.assetIds.map(id=>project.assets[id]?.name||"media").join(" → ");
    case "applyCaptionTemplate":return `Apply ${d.templateId} to ${d.clipIds.length} captions`;
    case "setAudioDucking":return d.enabled?"Soften background audio under speech":"Turn off automatic audio balance";
    case "duplicateClip":return `Duplicate ${name}`;
    case "changeText":return `Update text to “${d.text}”`;
    case "mergeCaptions":return "Merge selected captions";
    case "changeTrack":return "Update track visibility/audio";
    case "removeClip": return `Remove ${name}`;
    case "moveClip": return `Move ${name} to ${d.startTime}s${d.trackId ? ` on ${project.tracks[d.trackId]?.name}` : ""}`;
    case "trimClip": return `Trim ${name} ${d.edge === "left" ? "start" : "end"} to ${d.time}s`;
    case "splitClip": return `Split ${name} at ${d.time}s`;
    case "addClip": return `Add ${project.assets[d.assetId]?.name || "media"} from ${seconds(d.startTime)}s to ${seconds(d.startTime+(d.duration??project.assets[d.assetId]?.duration??0))}s on ${project.tracks[d.trackId]?.name||"track"}${d.volume===0?" · muted":""}`;
    case "addText": return `Add title “${d.text}” at ${d.startTime}s`;
    case "addCaption": return `Add caption “${d.text}” at ${seconds(d.startTime)}s for ${seconds(d.duration)}s`;
    case "addTransition": return `Add ${d.kind} transition (${d.duration}s)`;
    case "setAspectRatio": return `Set project framing to ${d.aspectRatio}`;
    case "changeClipProperty": return `Adjust ${name}: ${Object.entries(d.changes).map(([key, value]) => key === "speed" ? `speed ${value}×` : key === "volume" ? `volume ${Math.round(Number(value) * 100)}%` : key === "fadeIn" ? `fade in ${value}s` : key === "fadeOut" ? `fade out ${value}s` : key === "transform" ? `framing (${Object.entries(value).map(([k, v]) => `${k} ${v}`).join(", ")})` : `effects (${Object.entries(value).map(([k, v]) => `${k} ${v}`).join(", ")})`).join("; ")}`;
  }
}

function PlanPreview({project}:{project:EditorProject}){
 const parent=useEditor(),{store,playback}=useMemo(()=>({store:new EditorStore(project),playback:new PlaybackStore()}),[project]);
 const context=useMemo(()=>({...parent,store,playback,selection:[],select:()=>{},run:()=>{}}),[parent,store,playback]);
 return <div className="vx-ai-preview"><EditorContext.Provider value={context}><Preview quality={540} readOnly/></EditorContext.Provider></div>;
}
export default function AiEditDialog({ close, authToken }: { close: () => void; authToken?: string | null }) {
  const { store, selection, playback, notify, repository } = useEditor(), current = useProject(store);
  const [mode,setMode]=useState<'auto'|'custom'>('auto');
  const [autoOptions,setAutoOptions]=useState<AutoEditOptions>({...DEFAULT_AUTO_EDIT});
  const [autoDraft,setAutoDraft]=useState<EditorProject>();
  const [autoCuts,setAutoCuts]=useState<AutoCut[]>([]),[autoNotes,setAutoNotes]=useState<string[]>([]);
  const [approvedCuts,setApprovedCuts]=useState<Set<string>>(new Set());
  const autoParts=useRef<{assets:MediaAsset[];decisions:EditDecision[];base?:EditorProject}>({assets:[],decisions:[]});
  const [instruction, setInstruction] = useState("");
  const [captionTemplate,setCaptionTemplate]=useState("signature-poppins");
  const [showOriginal,setShowOriginal]=useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string>();
  const [plan, setPlan] = useState<AiPlan>();
  const [prepared,setPrepared]=useState<ReturnType<typeof combinePreparedEdit>>(),[previews,setPreviews]=useState<PreparedTool[]>([]),[progress,setProgress]=useState("");
  const frameCache=useRef<{key:string;frames:FootageFrame[]}|undefined>(undefined);
  async function readFrames(project:EditorProject,ids:string[],controller:AbortController){const key=JSON.stringify([ids,Object.values(project.clips).filter(c=>c.assetId).map(c=>[c.id,c.assetId,c.startTime,c.duration,c.sourceStart,c.sourceEnd])]);if(frameCache.current?.key===key)return frameCache.current.frames;setProgress('Reading your video and framing…');const frames=await captureFootageFrames(project,ids,a=>repository.resolve(a),controller.signal);frameCache.current={key,frames};return frames;}
  const linked=useRef(new Set<string>());
  const completed=useRef<Map<number,PreparedTool>>(new Map());
  const pending = useRef<AbortController | null>(null), dialog = useRef<HTMLElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const draft=useMemo(()=>{if(!plan)return;if(autoDraft)return autoDraft;try{return prepared?applyPreparedEdit(plan.snapshot,prepared):applyEditDecisionList(plan.snapshot,plan.list);}catch{return;}},[plan,prepared,autoDraft]);
  const review=plan&&draft?reviewEdit(plan.snapshot,draft):undefined;
  function clearPlan(){frameCache.current=undefined;setPlan(undefined);setPrepared(undefined);setAutoDraft(undefined);setAutoCuts([]);setAutoNotes([]);setApprovedCuts(new Set());setPreviews([]);completed.current.clear();linked.current.clear();setError(undefined);}
  function applyChosenCuts(base:EditorProject,cuts:ReadonlySet<string>,candidates:AutoCut[]){const ranges=candidates.filter(c=>cuts.has(c.key)).map(({start,end})=>({start,end}));return ranges.length?applyEditDecisionList(base,{version:1,projectId:base.id,baseRevision:base.revision,decisions:[{op:'rippleCut',ranges}]}):base;}
  async function finishAuto(active:AiPlan,assets:MediaAsset[],decisions:EditDecision[],controller:AbortController,items:PreparedTool[]=[],preparedBase?:EditorProject){
    if(!active.auto)throw Error('Choose an edit direction.');
    const augmented=assets.reduce((p,a)=>addAsset(p,a),active.snapshot),base=preparedBase||applyEditDecisionList(augmented,{...active.list,decisions:[...active.list.decisions,...decisions]});
    const token=(await supabase.auth.getSession()).data.session?.access_token||authToken;if(!token)throw Error('Sign in so the AI can plan your edit.');
    const footageFrames=await readFrames(base,active.auto.selection,controller);setProgress('AI is choosing captions, supporting footage and motion…');
    const response=await fetch('/api/editor/ai-edit',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({instruction:directorBrief(active.auto.options),footageFrames,completeEdit:true,project:aiProjectSnapshot(base),selectedClipIds:active.auto.selection.filter(id=>!!base.clips[id]),playheadTime:playback.getSnapshot().time}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(85000)])});
    const result=await response.json();if(!response.ok)throw Error(result.error||'AI planning failed. Your timeline is unchanged.');
    if(store.getSnapshot()!==active.snapshot||store.interacting)throw Error('The timeline changed while AI was planning. Request a fresh edit.');
    const {list,reviewed,candidates,catalog,requests,excludedCuts}=reviewDirectedPlan(base,result,active.auto.options,active.auto.selection);
    const next:AiPlan={...active,editorialAnalysis:result.editorialAnalysis,summary:result.summary,list,toolRequests:requests,catalog,directed:true,directorPass:(active.directorPass||0)+1,directorBase:reviewed,retained:items};
    autoParts.current={assets,decisions:list.decisions,base:reviewed};completed.current.clear();setPlan(next);setAutoDraft(reviewed);setAutoCuts(candidates);setApprovedCuts(new Set());setAutoNotes([...active.auto.notes,'The AI generated this edit plan. Timings and placements are not selected by a local style script.',...(excludedCuts>0?['Unsupported cuts were excluded; only verified timed hesitation words can be approved.']:[])]);setPrepared(requests.length?undefined:{assets,list});setPreviews(items);setProgress('');
    if(requests.length&&requests.every(r=>r.type==='captions'||r.type==='broll'&&active.auto?.options.broll))await preparePlan(next,controller);
  }
  function toggleAutoCut(key:string){if(!plan?.directed||!autoParts.current.base||stale||busy)return;const next=new Set(approvedCuts);if(next.has(key))next.delete(key);else next.add(key);try{setAutoDraft(applyChosenCuts(autoParts.current.base,next,autoCuts));setApprovedCuts(next);setError(undefined);}catch(e){setError(e instanceof Error?e.message:'This cut is unavailable.');}}
  function cancelRequest(){const controller=pending.current;if(controller){controller.abort();pending.current=null;setBusy(false);setProgress("");}}
  const stale = !!plan && (current !== plan.snapshot || store.interacting);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => { pending.current?.abort(); previous?.focus(); };
  }, []);
  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || (mode==='custom'&&!instruction.trim())) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); clearPlan();
    try {
      if (store.interacting) throw new Error("Finish the current edit before requesting AI changes.");
      const snapshot = store.getSnapshot(), project = aiProjectSnapshot(snapshot);
      if(mode==='auto'){
        const setup=mainFootage(snapshot).length?createAutoEditPlan(snapshot,autoOptions,selection):{summary:"AI will choose the sequence and edit plan.",list:{version:1 as const,projectId:snapshot.id,baseRevision:snapshot.revision,decisions:[]},toolRequests:[],notes:[]};
        const next:AiPlan={summary:setup.summary,list:setup.list,snapshot,toolRequests:setup.toolRequests,catalog:[],auto:{options:{...autoOptions},selection:[...selection],notes:setup.notes}};
        setPlan(next);setAutoNotes(setup.notes);
        if(next.toolRequests.length)await preparePlan(next,controller);else await finishAuto(next,[],[],controller);
        return;
      }
      const token = (await supabase.auth.getSession()).data.session?.access_token || authToken;
      if (!token) throw new Error("Sign in to use AI Edit.");
      const footageFrames=await readFrames(snapshot,selection,controller);setProgress("AI is understanding your clip and planning the edit…");
      const response = await fetch("/api/editor/ai-edit", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ instruction: instruction.trim(), footageFrames, project, playheadTime:playback.getSnapshot().time, selectedClipIds: selection.filter(id => !!project.clips[id]) }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(85000)]) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not generate an AI edit.");
      if (result.list?.projectId !== snapshot.id || result.list?.baseRevision !== snapshot.revision) throw new Error("This plan targets a different project revision.");
      const validated = validateAiPlan({ summary: result.summary, decisions: result.list.decisions }, snapshot);
      controller.signal.throwIfAborted();
      const nextPlan:AiPlan={...validated,editorialAnalysis:result.editorialAnalysis,snapshot,toolRequests:validateAiTools(result.toolRequests,applyEditDecisionList(snapshot,validated.list),result.catalog||[]),catalog:result.catalog||[]};
      if(store.getSnapshot()!==snapshot||store.interacting)throw new Error('Your timeline changed. Generate a fresh AI edit.');
      setPlan(nextPlan);
      // Tool execution requires a separate explicit approval after the plan is shown.
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "AI editing timed out. Try a simpler instruction." : error instanceof Error ? error.message : "AI editing failed. Please retry.");
    } finally { if (pending.current === controller) {setBusy(false);pending.current = null;} }
  }
  async function preparePlan(active:AiPlan,controller:AbortController){
    const base=active.directorBase||applyEditDecisionList(active.snapshot,active.list),requests=expandAiTools(active.toolRequests,base),items:PreparedTool[]=[],usedStock=stockKeys(base);
    for(let i=0;i<requests.length;i++){
      controller.signal.throwIfAborted();
      if(store.getSnapshot()!==active.snapshot||store.interacting)throw new Error('Your timeline changed. Generate a fresh AI edit.');
      setProgress('Preparing '+(i+1)+' of '+requests.length+': '+aiToolDescription(requests[i],active.catalog));
      let item=completed.current.get(i);
      if(!item){item=await prepareAiTool(requests[i],base,a=>repository.resolve(a),AbortSignal.any([controller.signal,AbortSignal.timeout(125000)]),usedStock);controller.signal.throwIfAborted();completed.current.set(i,item);}
      if(item.media?.stockKey)usedStock.add(item.media.stockKey);items.push(item);setPreviews([...items]);
    }
    if(store.getSnapshot()!==active.snapshot||store.interacting)throw new Error('Your timeline changed. Generate a fresh plan. Prepared media stays in your library.');
    controller.signal.throwIfAborted();
    if(active.auto&&!active.directed){await finishAuto(active,items.flatMap(i=>i.media?[i.media]:[]),items.flatMap(i=>i.decisions),controller,items);return;}
    if(active.directed){
      const ready=combinePreparedEdit(base,{version:1,projectId:base.id,baseRevision:base.revision,decisions:[]},items.flatMap(i=>i.media?[i.media]:[]),items.flatMap(i=>i.decisions)),reviewed=applyPreparedEdit(base,ready);
      if(active.auto&&requests.length&&requests.every(r=>r.type==="captions")&&(active.directorPass||0)<2){await finishAuto(active,[],[],controller,[...(active.retained||[]),...items],reviewed);return;}
      autoParts.current.base=reviewed;setAutoDraft(applyChosenCuts(reviewed,approvedCuts,autoCuts));setPrepared({assets:ready.assets,list:{...active.list,decisions:[...active.list.decisions,...ready.list.decisions]}});setPreviews([...(active.retained||[]),...items]);setProgress('');return;
    }
    const ready=combinePreparedEdit(active.snapshot,active.list,items.flatMap(i=>i.media?[i.media]:[]),items.flatMap(i=>i.decisions));setPrepared(ready);
    setPreviews(items);setProgress('');
  }
  async function prepare(){
    if(!plan||pending.current||stale)return;const controller=new AbortController();pending.current=controller;setBusy(true);setError(undefined);
    try{await preparePlan(plan,controller);}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'AI preparation failed. Timeline unchanged.');}
    finally{if(pending.current===controller){pending.current=null;setBusy(false);setProgress('');}}
  }
  async function apply() {
    if (!plan||pending.current) return;
    const controller=new AbortController();pending.current=controller;setBusy(true);setError(undefined);
    try {
      if (store.getSnapshot() !== plan.snapshot || store.interacting) throw new Error("Your timeline changed. Generate a fresh plan before applying it.");
      if(plan.toolRequests.length&&!prepared)throw new Error("Prepare and review the requested assets first.");
      for(let i=0;i<previews.length;i++){const item=previews[i];controller.signal.throwIfAborted();setProgress('Saving edit assets '+(i+1)+' of '+previews.length+'…');const key=item.role+":"+item.asset.id;if(!linked.current.has(key)){await linkAsset(plan.snapshot.id,item.role,item.asset.id,controller.signal);controller.signal.throwIfAborted();linked.current.add(key);}}
      controller.signal.throwIfAborted();
      if(store.getSnapshot()!==plan.snapshot||store.interacting)throw new Error("Your timeline changed. Generate a fresh plan.");
      playback.set(playback.getSnapshot().time, false);
      if(!draft)throw new Error("This edit could not be previewed. Generate a fresh plan.");
      commitReviewedEdit(store,plan.snapshot,draft);
      notify(`Applied ${prepared?.list.decisions.length??plan.list.decisions.length} AI changes. Use Undo to revert the entire edit.`);
      close();
    } catch (error) { if(!controller.signal.aborted)setError(error instanceof Error && error.name==="TimeoutError" ? "Saving edit assets timed out. Your timeline is unchanged. Retry Apply changes." : error instanceof Error ? error.message : "Could not apply this edit."); }finally{if(pending.current===controller){setBusy(false);setProgress("");pending.current=null;}}
  }
  function key(event: React.KeyboardEvent) {
    if (event.key === "Escape") { event.stopPropagation(); close(); }
    if (event.key !== "Tab") return;
    const controls = dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled),textarea,input,select:not(:disabled)");
    const first = controls?.[0], last = controls?.[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  return <div className="vx-ai-backdrop" onClick={close}><section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="vx-ai-title" data-vx-motion="panel" className="vx-ai-dialog" onClick={event => event.stopPropagation()} onKeyDown={key}>
    <header><h2 id="vx-ai-title"><Sparkles size={20} /> Edit with AI</h2><button type="button" aria-label="Close AI Edit" onClick={close}><X size={18} /></button></header>
    <p>{mode==='auto'?`Choose automatic editing or a style. AI will analyze your clip, match captions and find supporting footage. Review the finished preview before applying.`:<>Describe changes to {selection.length ? `${selection.length} selected clips` : "your timeline"}. AI will propose a plan. Approve any requested tools, preview the result, then apply it as one undoable edit.</>}</p>
    <div className="vx-ai-presets" aria-label="Editing mode"><button type="button" aria-pressed={mode==='custom'} disabled={busy} onClick={()=>{setMode('custom');clearPlan();}}>Prompt edit</button><button type="button" aria-pressed={mode==='auto'} disabled={busy} onClick={()=>{setMode('auto');clearPlan();}}>Auto edit by style</button></div>
    {mode==='custom'&&<div className="vx-ai-presets">{[
      ["Clean edit",cleanEditInstruction(current)],
      ["Captions only","Generate accurate captions from speech for the selected footage, or all main footage when nothing is selected. Use the clean-sub caption template. Preserve all existing clips, framing and audio. Do not guess the spoken text."],
      ["Soft SFX here","Add one built-in soft whoosh on an audio track at the playhead, at 10% volume. Keep the existing footage unchanged."]
    ].map(([label,text])=><button key={label} type="button" disabled={busy} onClick={()=>{setInstruction(text);setPlan(undefined);setPrepared(undefined);setPreviews([]);completed.current.clear();linked.current.clear();}}>{label}</button>)}</div>}
    <form onSubmit={event => void generate(event)}>
      {mode==='auto'?<AutoEditControls project={current} value={autoOptions} disabled={busy} onChange={value=>{setAutoOptions(value);clearPlan();}}/>:<>
      <label htmlFor="vx-ai-instruction">Editing instructions</label>
      <textarea ref={input} id="vx-ai-instruction" value={instruction} maxLength={2000} disabled={busy} rows={4} placeholder="Slowly zoom to 1.15× from 2–5s. Cut 8–9s and close the gap, keeping audio and captions in sync." onChange={event => { setInstruction(event.target.value); setPlan(undefined);setPrepared(undefined);setPreviews([]);completed.current.clear();linked.current.clear(); }} />
      <div className="vx-ai-caption-row"><label className="vx-field"><span>Caption Studio style</span><select aria-label="AI caption template" disabled={busy} value={captionTemplate} onChange={e=>setCaptionTemplate(e.target.value)}>{[...DEFAULT_CAPTION_TEMPLATES].sort((a,b)=>Number(!!b.style.fontAccent)-Number(!!a.style.fontAccent)).map(t=><option value={t.id} key={t.id}>{t.name}{t.style.fontAccent?' · '+t.tagline:''}</option>)}</select></label><button className="vx-secondary vx-ai-caption-apply" type="button" disabled={busy} onClick={()=>{const template=DEFAULT_CAPTION_TEMPLATES.find(t=>t.id===captionTemplate)!;setInstruction('Add or style captions using Caption Studio template '+template.name+' (templateId: '+template.id+'). Limit to selected footage or selected captions if any are selected, otherwise all main footage. Reuse existing captions and their exact words and timings; only transcribe footage that has no captions. Preserve existing manual caption positions, use caption-safe for new captions. Do not change framing, cuts, audio or other assets.');setPlan(undefined);setPrepared(undefined);setPreviews([]);completed.current.clear();linked.current.clear();}}>Use caption style</button></div>
      <p className="vx-ai-hint">Use exact times for cuts. Zooms and cuts are previewed before you apply them.</p><div className="vx-ai-zoom-actions"><button className="vx-secondary" type="button" disabled={busy} onClick={()=>{setInstruction("Add one subtle smooth push-in from 1× to 1.12× on the selected footage, or the first main video clip if nothing is selected. Start at the clip start and finish after 2 seconds or at the clip end if shorter. Keep the original aspect ratio, audio, captions and timing. Do not add cuts, effects or other assets.");setPlan(undefined);setPrepared(undefined);}}>Subtle zoom</button><button className="vx-secondary" type="button" disabled={busy} onClick={()=>{setInstruction("Add a brief smooth zoom pulse from 1× to 1.15× and back on the selected footage at the playhead, lasting 0.6 seconds or to the clip end if shorter. If no footage is selected, use the main video clip at the playhead. Preserve audio, captions, timing and aspect ratio. Do not add cuts or other changes.");setPlan(undefined);setPrepared(undefined);}}>Zoom pulse</button></div><details className="vx-ai-usage"><summary>AI limits and usage</summary><p className="vx-ai-hint">AI reads video samples and timed speech. Planning and stock selection use your existing allowance; paid generation still needs approval.</p></details>
      </>}
      <button className="vx-primary" disabled={busy || (mode==='custom'&&!instruction.trim())} type="submit">{busy ? <LoaderCircle size={15} className="vx-spin" /> : <Sparkles size={15} />}{busy ? progress || (plan ? "Working on your edit…" : "AI is planning your edit…") : mode==='auto'?"Create complete edit":"Create AI edit"}</button>
    </form>
    {busy&&<button type="button" className="vx-secondary" onClick={cancelRequest}>Cancel request</button>}
    {error && <p className="vx-ai-error" role="alert">{error}</p>}
    {plan && <div className="vx-ai-plan" role="status"><h3>{`${prepared?.list.decisions.length??plan.list.decisions.length} timeline changes · ${plan.toolRequests.length} tool requests`}</h3><p className="vx-ai-hint">Proposed changes only. Your timeline is unchanged until Apply changes.</p><p>{plan.summary}</p>{plan.editorialAnalysis&&<div className="vx-feature-note"><strong>Editing choices</strong><p>{plan.editorialAnalysis.summary}</p><p>Captions: {plan.editorialAnalysis.captionStyle.reason}</p><p>Supporting footage: {plan.editorialAnalysis.brollStrategy}</p></div>}
      {review&&<div className="vx-feature-note"><strong>Review before applying</strong><p>{review.added} added · {review.changed} changed · {review.removed} removed</p>{!!review.warnings.length&&<ul>{review.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul>}</div>}{draft&&<><div className="vx-ai-impact"><span>Duration: {seconds(projectDuration(plan.snapshot))}s → {seconds(projectDuration(draft))}s</span><span>Clips: {Object.keys(plan.snapshot.clips).length} → {Object.keys(draft.clips).length}</span></div><div className="vx-ai-presets"><button type="button" aria-pressed={showOriginal} onClick={()=>setShowOriginal(true)}>Before</button><button type="button" aria-pressed={!showOriginal} onClick={()=>setShowOriginal(false)}>After</button></div>{(showOriginal||!plan.toolRequests.length||prepared)&&<PlanPreview project={showOriginal?plan.snapshot:draft}/>}{plan.toolRequests.length>0&&!prepared&&<p className="vx-ai-hint">Asset preparation must finish before the complete edit can be previewed or applied.</p>}</>}
      {plan.auto&&<><p className="vx-ai-hint">{autoNotes.join(' ')}</p>{autoCuts.length>0&&<fieldset className="vx-auto-cuts" disabled={busy||stale}><legend>Review suggested cuts</legend><p className="vx-ai-hint">These are timed hesitation words, not detected silence. No cut is selected by default. Uncheck a cut to restore its original speech and timing.</p>{autoCuts.map(c=><label key={c.key}><input type="checkbox" checked={approvedCuts.has(c.key)} onChange={()=>toggleAutoCut(c.key)}/>Remove “{c.word}” · {seconds(c.start)}–{seconds(c.end)}s</label>)}</fieldset>}</>}
      <ol>{(prepared?.list.decisions??plan.list.decisions).map((d, index) => <li key={index}>{describe(d, plan.snapshot)}</li>)}</ol>
      {!!plan.toolRequests.length&&<><ul>{plan.toolRequests.map((request,index)=><li key={index}>{aiToolDescription(request,plan.catalog)}</li>)}</ul><p className="vx-ai-hint">Approved tools may use credits. Prepared assets remain in your library if you cancel.</p>{!prepared&&previews.length>0&&<p className="vx-ai-hint">{previews.length} prepared steps retained. Retry continues with unfinished steps.</p>}{!prepared&&<button type="button" className="vx-secondary" disabled={stale||busy} onClick={()=>void prepare()}>{busy?progress||"Working…":(previews.length?"Retry approved tools":"Approve plan and prepare assets")}</button>}</>}
      {!!previews.length&&<div className="space-y-3">{previews.map((item,index)=><article key={index}><strong>{item.asset.name}</strong><p className="vx-ai-hint">{item.decisions.map(d=>describe(d,{...plan.snapshot,assets:{...plan.snapshot.assets,...Object.fromEntries((prepared?.assets||[]).map(a=>[a.id,a]))}})).join("; ")}</p>{item.asset.kind==="audio"?<audio src={item.asset.url} controls preload="none" className="w-full"/>:item.asset.kind==="video"?<video src={item.asset.url} controls preload="none" className="w-full max-h-40"/>:item.asset.kind==="image"?<img src={item.asset.url} alt={item.asset.name} className="max-h-40"/>:<><p>{item.decisions.length} timed captions prepared</p><ol>{item.decisions.map((decision,i)=><li key={i}>{describe(decision,plan.snapshot)}</li>)}</ol></>}</article>)}</div>}
      {stale && <p className="vx-ai-error">Your timeline changed. Generate a fresh plan.</p>}
      <button type="button" className="vx-primary" disabled={!draft || stale || busy || (plan.toolRequests.length>0&&!prepared) || !(prepared?.list.decisions.length??plan.list.decisions.length)} onClick={()=>void apply()}>Apply changes</button>
    </div>}
    <footer><button type="button" onClick={close}>{busy ? "Cancel" : "Close"}</button><span>Original files stay unchanged. Undo restores your previous timeline.</span></footer>
  </section></div>;
}
