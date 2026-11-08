import {publicErrorMessage,publicServiceText} from '../serviceMessages';
import {captureFootageEvidence} from './footageFramesClient';
import {analysisFootage,type FootageFrame} from './footageContext';
import {speechContext} from './speechContext';
import {prepareAiTool} from './aiToolClient';
import {validateAiTools,expandAiTools} from './aiTools';
import {aiProjectSnapshot,validateAiPlan} from './aiValidation';
import {linkAsset} from '../assets/client';
import {supabase} from '../supabase';
import {saveCheckpoint} from './recovery';
import {stockKeys} from './stockSelection';
import {projectDuration,type EditorProject,type MediaAsset} from './model';
import type {EditorStore} from './store';
import type {MediaRepository} from './media';
import {buildStageProject,assertStagePlan,stageInstruction,validateCompletedJob,runEditingJob,explicitOperations,PIPELINE_PRESETS,hasSkipRationale,type EditingJob,type EditStage,type StageOutput} from './sequentialEdit';
import {loadEditorStudioFonts} from './editorCaptionStudio';
import {Compositor} from './compositor';

function canSkipSupportingStage(stage:EditStage,project:EditorProject,output?:StageOutput,job?:EditingJob):boolean{
 if(projectDuration(project)<4.0)return true;
 const isPreset=!!(job?.presetId||project.editingJob?.presetId);
 if(isPreset)return true;
 const initialSpeechSegments=job?.stages?.find(s=>s.id==='analyzeFootage')?.output?.analysis?.speechSegments??project.editingJob?.stages?.find(s=>s.id==='analyzeFootage')?.output?.analysis?.speechSegments;
 if(initialSpeechSegments===0||speechContext(project).length===0)return true;
 return hasSkipRationale(output);
}

/** Stored jobs reference canonical assets; signed and browser URLs never enter the job ledger. */
function persistentMedia(asset:MediaAsset):MediaAsset{return {...asset,url:asset.libraryId?'/api/assets/'+encodeURIComponent(asset.libraryId)+'/file':asset.url?.startsWith('blob:')?undefined:asset.url};}
export async function runSequentialEdit(store:EditorStore,repository:MediaRepository,scope:string,initial:EditingJob,signal:AbortSignal,authToken?:string|null){
 let frames:FootageFrame[]|undefined,fallbackFrames:FootageFrame[]|undefined;
 const readFrames=async(project:EditorProject,selection:string[])=>{const evidence=await captureFootageEvidence(project,selection,a=>repository.resolve(a),signal);frames=evidence.footageFrames;fallbackFrames=evidence.fallbackFootageFrames;};
 const persist=async(project:EditorProject,job:EditingJob)=>{
  if(store.interacting)throw Error('Finish your manual edit before continuing the AI job.');
  const current=store.getSnapshot();if(current.revision!==job.timelineRevision&&!(job.requiresNewJob&&project===current&&['failed','cancelled'].includes(job.status)))throw Error('Timeline changed during the AI job. Start a new edit.');
  job.timelineRevision=store.getSnapshot().revision+1;
  const previous=current.editingJob;
  const previousClarification=previous?.stages?.find(s=>s.output?.questions?.length)?.output?.questions?.[0]||previous?.stages?.find(s=>s.output?.questions?.length)?.output?.summary||(previous as {questions?:string[]})?.questions?.[0];
  const editingHistory=previous&&previous.id!==job.id?[...(current.editingHistory||[]).slice(-19),{jobId:previous.id,instructions:previous.instructions,status:previous.status,summary:previous.status==='completed'?(previousClarification||'All requested stages completed.'):previous.errors.at(-1)||'Previous edit stopped; committed changes remain.'}]:current.editingHistory;
  const next={...project,editingHistory,editingJob:structuredClone(job)};
  const changed=project.tracks!==current.tracks||project.trackOrder!==current.trackOrder||project.textLayers!==current.textLayers||project.clips!==current.clips||project.captions!==current.captions||project.assets!==current.assets||project.transitions!==current.transitions||project.settings!==current.settings;
  if(changed)store.execute(()=>next);else store.checkpoint(()=>next);
  await saveCheckpoint(scope,store.getSnapshot());
 };
 const plan=async(stage:EditStage,project:EditorProject,job:EditingJob,signal:AbortSignal)=>{
  const token=(await supabase.auth.getSession()).data.session?.access_token||authToken;
  if(!token)throw Error('Sign in to use AI editing.');
  if(!frames)await readFrames(project,job.selection);
  const conversationHistory=(project.editingHistory||[]).filter(h=>h.status==='completed'&&!h.summary?.includes('stopped')).map(h=>({instructions:h.instructions,summary:h.summary}));
  const response=await fetch('/api/editor/ai-edit',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'Idempotency-Key':job.id+':'+stage},body:JSON.stringify({instruction:stageInstruction(stage,job),pipelineStage:stage,editingJobId:job.id,project:aiProjectSnapshot(project),selectedClipIds:job.selection.filter(id=>!!project.clips[id]),footageFrames:frames,fallbackFootageFrames:fallbackFrames,conversationHistory}),signal:AbortSignal.any([signal,AbortSignal.timeout(85000)])});
  const result=await response.json();if(!response.ok)throw Error(publicErrorMessage(result.error,'This AI stage could not be completed. Please retry.'));
  if(result.list?.projectId!==project.id||result.list?.baseRevision!==project.revision)throw Error('AI returned a stale stage plan.');
  const validated=validateAiPlan({summary:publicServiceText(result.summary),decisions:result.list.decisions},project),requests=validateAiTools(result.toolRequests,stage==='applyRequestedEdits'?buildStageProject(project,{summary:result.summary,decisions:validated.list.decisions}):project,result.catalog||[]);
  assertStagePlan(stage,validated.list.decisions,requests,project);
  return {summary:validated.summary,questions:result.questions,skipRationale:result.skipRationale,decisions:validated.list.decisions,requests,operations:result.requiredOperations} as StageOutput;
 };
 const prepare=async(output:StageOutput,project:EditorProject,checkpoint:(output:StageOutput)=>Promise<void>,signal:AbortSignal)=>{
  if(output.preparedApplied){for(const item of output.prepared||[])await linkAsset(project.id,item.role,item.assetId,signal);return output;}
  const requests=expandAiTools(output.requests||[],project),prepared=[...(output.prepared||[])],used=stockKeys(project);
  for(const item of prepared)if(item.media?.stockKey)used.add(item.media.stockKey);
  for(let index=prepared.length;index<requests.length;index++){
   signal.throwIfAborted();const item=await prepareAiTool(requests[index],project,a=>repository.resolve(a),signal,used,{jobId:initial.id});
   prepared.push({assetId:item.asset.id,role:item.role,decisions:item.decisions,media:item.media?persistentMedia(item.media):undefined,sourceLabel:item.sourceLabel,selection:item.selection});
   // Persist each transcription/download before preparing another asset.
   output={...output,prepared};await checkpoint(output);
  }
  for(const item of prepared){await linkAsset(project.id,item.role,item.assetId,signal);signal.throwIfAborted();}
  return {...output,preparedApplied:true,prepared,assets:prepared.flatMap(i=>i.media?[i.media]:[]),decisions:[...(output.decisions||[]),...prepared.flatMap(i=>i.decisions)]};
 };
 const executeStage=async(stage:EditStage,project:EditorProject,job:EditingJob,signal:AbortSignal,checkpoint:(output:StageOutput)=>Promise<void>):Promise<StageOutput>=>{
  const saved=job.stages.find(s=>s.id===stage)!.output;
  switch(stage){
   case 'analyzeFootage':{
    const footage=analysisFootage(project,job.selection);if(!footage.length&&job.presetId)throw Error('Add original footage to the timeline first.');
    if(!frames)await readFrames(project,job.selection);
    const operations=PIPELINE_PRESETS.find(p=>p.id===job.presetId)?.operations||(footage.length?explicitOperations(job.instructions):undefined);
    const result=operations?{summary:`Analyzed ${footage.length} source clip(s), ${projectDuration(project).toFixed(2)} seconds, ${frames?.length||0} sampled frames and ${speechContext(project).length} available speech segments. Planned ${operations.join(', ')}.`,operations}:await plan(stage,project,job,signal);
    return {...result,analysis:{duration:projectDuration(project),footageIds:footage.map(c=>c.id),speechSegments:speechContext(project).length,sampledFrames:frames?.length||0,assetIds:Object.keys(project.assets)}};
   }
   case 'applyCaptions':{
    const footage=analysisFootage(project,job.selection),existing=Object.values(project.clips).filter(c=>c.contentId&&project.captions[c.contentId]&&footage.some(v=>c.startTime>=v.startTime-.01&&c.startTime+c.duration<=v.startTime+v.duration+.01));
    if(existing.some(c=>project.tracks[c.trackId].locked||project.tracks[c.trackId].hidden))throw Error('Unlock and show caption tracks before applying captions.');
    const requests=footage.filter(c=>!existing.some(cap=>cap.startTime<c.startTime+c.duration&&cap.startTime+cap.duration>c.startTime)).map(c=>({type:'captions' as const,clipId:c.id,templateId:job.captionTemplate}));
    try{
     return await prepare(saved||{summary:'Apply timed speech captions with '+job.captionTemplate,animateCaptions:/animat|engaging|punchy/i.test(job.instructions)||['engaging','punchy'].includes(job.presetId||''),decisions:existing.length?[{op:'applyCaptionTemplate',clipIds:existing.map(c=>c.id),templateId:job.captionTemplate}]:[],requests},project,checkpoint,signal);
    }catch(err){
     const isPreset=!!(job.presetId||project.editingJob?.presetId);
     if(isPreset){
      return {summary:'Timed speech captions could not be generated; skipped captions and preserved original audio.',decisions:[],skipRationale:'Captions skipped: '+(err instanceof Error?err.message:'transcription failed')};
     }
     throw err;
    }
   }
   case 'planMotionGraphics':{
    const isPreset=!!(job.presetId||project.editingJob?.presetId);
    try{
     const output=saved||await plan(stage,project,job,signal);
     if(!output.decisions?.length&&!canSkipSupportingStage(stage,project,output,job))throw Error('AI did not plan any requested motion graphics.');
     return {...output,summary:output.summary||'No motion graphics planned; moving to next step.',decisions:output.decisions||[],skipRationale:output.skipRationale||(isPreset&&!output.decisions?.length?'No motion graphics planned':undefined)};
    }catch(err){
     if(isPreset)return {summary:'Motion graphics skipped; moving to next step.',decisions:[],skipRationale:'Motion graphics skipped: '+(err instanceof Error?err.message:'plan failed')};
     throw err;
    }
   }
   case 'applyMotionGraphics':{
    const output=job.stages.find(s=>s.id==='planMotionGraphics')?.output;
    if(!output?.decisions?.length){
     if(!canSkipSupportingStage(stage,project,output,job))throw Error('Motion graphics plan is missing.');
     return {...output,summary:output?.summary||'Motion graphics skipped; preserved original visuals.',decisions:[],skipRationale:output?.skipRationale||'Motion graphics skipped'};
    }
    return {...output,summary:'Apply planned motion graphics',decisions:output?.decisions||[]};
   }
   case 'findBroll':{
    const isPreset=!!(job.presetId||project.editingJob?.presetId);
    try{
     const output=saved||await plan(stage,project,job,signal);await checkpoint(output);
     if(!output.decisions?.length&&!output.requests?.length){
      if(!canSkipSupportingStage(stage,project,output,job))throw Error('No relevant B-roll candidates were found.');
      return {...output,summary:output.summary||'No B-roll needed for this footage.',decisions:[],skipRationale:output.skipRationale||'No B-roll requested or candidates found'};
     }
     const ready=await prepare(output,project,checkpoint,signal);
     if(!ready.decisions?.length&&isPreset){
      return {...ready,summary:'No matching B-roll footage was found; moving to next step.',decisions:[],skipRationale:'No matching B-roll candidates available'};
     }
     return ready;
    }catch(err){
     if(isPreset)return {summary:'B-roll was unavailable or skipped for this footage; moving to next step.',decisions:[],skipRationale:'B-roll unavailable: '+(err instanceof Error?err.message:'tool failed')};
     throw err;
    }
   }
   case 'applyBroll':{
    const output=job.stages.find(s=>s.id==='findBroll')?.output;
    if(!output?.decisions?.length){
     if(!canSkipSupportingStage(stage,project,output,job))throw Error('No selected B-roll is available.');
     return {...output,summary:output?.summary||'B-roll skipped; preserved original footage.',decisions:[],skipRationale:output?.skipRationale||'B-roll skipped'};
    }
    return {...output,summary:'Insert selected B-roll with original dialogue preserved',decisions:output.decisions.map(d=>d.op==='addClip'?{...d,volume:0,audioRole:'background' as const}:d)};
   }
   case 'applyRequestedEdits':{
    const output=saved||await plan(stage,project,job,signal);
    if(!output.decisions?.length&&!output.requests?.length&&!output.questions?.length)throw Error(output.summary||'AI did not return any actionable requested edits.');
    if(output.sourceDecisionCount===undefined)output.sourceDecisionCount=output.decisions?.length||0;
    await checkpoint(output);
    const toolProject=output.preparedApplied?project:buildStageProject(project,{summary:output.summary,decisions:(output.decisions||[]).slice(0,output.sourceDecisionCount)});
    return prepare(output,toolProject,checkpoint,signal);
   }
   case 'applyZooms':{
    const isPreset=!!(job.presetId||project.editingJob?.presetId);
    try{
     const output=saved||await plan(stage,project,job,signal);
     if(!output.decisions?.length&&!canSkipSupportingStage(stage,project,output,job))throw Error('No zoom keyframes planned.');
     return {...output,summary:output.summary||'No zooms needed; preserved framing.',decisions:output.decisions||[],skipRationale:output.skipRationale||(isPreset&&!output.decisions?.length?'No zooms planned':undefined)};
    }catch(err){
     if(isPreset)return {summary:'Zooms skipped; preserved framing and moving to next step.',decisions:[],skipRationale:'Zooms skipped: '+(err instanceof Error?err.message:'plan failed')};
     throw err;
    }
   }
   case 'applyEffects':{
    const output=saved||await plan(stage,project,job,signal);
    const footageClips=analysisFootage(project,job.selection);
    const hasTransitions=(output.decisions||[]).some(d=>d.op==='addTransition');
    if(footageClips.length<=1&&!hasTransitions&&!output.decisions?.length){
     return {
      ...output,
      summary:output.summary||'Preserved continuous footage without artificial transitions.',
      skipRationale:output.skipRationale||'Single continuous uncut clip',
      decisions:[{op:'setAudioDucking',enabled:true}]
     };
    }
    return output;
   }
   case 'applySoundEffects':{
    const isPreset=!!(job.presetId||project.editingJob?.presetId);
    try{
     const output=saved||await plan(stage,project,job,signal);await checkpoint(output);
     if(!output.decisions?.length&&!output.requests?.length){
      if(!canSkipSupportingStage(stage,project,output,job))throw Error('No sound effects planned.');
      return {...output,summary:output.summary||'No sound effects needed; preserved original audio.',decisions:[],skipRationale:output.skipRationale||'No SFX planned'};
     }
     const ready=await prepare(output,project,checkpoint,signal);
     ready.decisions=ready.decisions?.map(d=>d.op==='addClip'?{...d,audioRole:'sfx',volume:Math.min(.25,d.volume??.15)}:d);
     if(!ready.decisions?.length&&isPreset){
      return {...ready,summary:'No sound effects found; preserved original audio.',decisions:[],skipRationale:'No SFX prepared'};
     }
     return ready;
    }catch(err){
     if(isPreset)return {summary:'Sound effects were unavailable or skipped; preserved original audio and moving to next step.',decisions:[],skipRationale:'SFX unavailable: '+(err instanceof Error?err.message:'tool failed')};
     throw err;
    }
   }
   case 'validateEdit':{
    const result=validateCompletedJob(project,job);
    // Exercise the same compositor used by preview and offline MP4 export at edited timestamps.
    await loadEditorStudioFonts(project);await document.fonts.ready;
    let decodeError:Error|undefined;
    const compositor=new Compositor(repository,error=>{decodeError=error;}),canvas=document.createElement('canvas');canvas.width=360;canvas.height=640;
    try{
     const times=[...new Set(job.stages.flatMap(s=>(s.output?.evidence||[]).flatMap(e=>{const c=project.clips[e.clipId];return c?[c.startTime+Math.min(c.duration/2,.6)]:[];})))];
     for(const time of times){
      const deadline=Date.now()+20000;while(!compositor.sync(project,time,false)){signal.throwIfAborted();if(decodeError)throw decodeError;if(Date.now()>deadline)throw Error('Edited media could not be decoded for preview. Retry or relink the asset.');await new Promise(resolve=>setTimeout(resolve,40));}
      compositor.render(canvas,project,time);
     }
    }finally{compositor.dispose();}
    return result;
   }
  }
 };
 const execute:typeof executeStage=async(stage,project,job,signal,checkpoint)=>{
  const status=async()=>{const token=(await supabase.auth.getSession()).data.session?.access_token||authToken;if(!token)return;const response=await fetch('/api/editor/ai-budget?'+new URLSearchParams({projectId:project.id,jobId:job.id}),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000),cache:'no-store'});if(response.ok)return await response.json() as NonNullable<StageOutput['tokenBudget']>;};
  try{const output=await executeStage(stage,project,job,signal,checkpoint);if(['analyzeFootage','planMotionGraphics','findBroll','applyZooms','applySoundEffects','applyEffects','applyRequestedEdits'].includes(stage))return {...output,tokenBudget:await status().catch(()=>undefined)};return output;}
  catch(error){const tokenBudget=await status().catch(()=>undefined);if(error instanceof Error&&tokenBudget)Object.assign(error,{tokenBudget});throw error;}
 };
 const run=()=>runEditingJob({getProject:store.getSnapshot,interacting:()=>store.interacting,persist,execute},initial,signal);
 if(typeof navigator!=='undefined'&&navigator.locks)return navigator.locks.request('kreovar-ai-edit:'+scope,{ifAvailable:true},lock=>{if(!lock)throw Error('This project already has an AI edit running in another tab.');return run();});
 return run();
}

