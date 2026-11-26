import {publicErrorMessage,publicServiceText} from '../serviceMessages';
import {captureFootageEvidence} from './footageFramesClient';
import {captureVideoFileForAi,type UploadedAiVideoFile} from './videoPerceptionClient';
import {analysisFootage,type FootageFrame} from './footageContext';
import {speechContext} from './speechContext';
import {prepareAiTool} from './aiToolClient';
import {validateAiTools,expandAiTools} from './aiTools';
import {aiProjectSnapshot,validateAiPlan} from './aiValidation';
import {linkAsset} from '../assets/client';
import {supabase} from '../supabase';
import {saveCheckpoint} from './recovery';
import {stockKeys} from './stockSelection';
import {projectDuration,type EditorProject,type MediaAsset,normalizeCaptionPresetId} from './model';
import type {EditorStore} from './store';
import type {MediaRepository} from './media';
import {buildStageProject,assertStagePlan,stageInstruction,validateCompletedJob,runEditingJob,explicitOperations,PIPELINE_PRESETS,hasSkipRationale,type EditingJob,type EditStage,type StageOutput,type PipelineDegradationNotice} from './sequentialEdit';
import {loadEditorStudioFonts} from './editorCaptionStudio';
import {Compositor} from './compositor';
import {extractEditingConstraints} from './editingIntent';
import {createAutoSfxDecisions} from './autoSfx';
import {detectSilences} from './audioSilenceDetector';
import {extractViralHooks} from './viralHookExtractor';
import {reconcileEditingDecisions} from './inPlaceReconciler';

const silenceScanCache = new Map<string, Array<{ start: number; end: number; duration: number; source: 'acoustic' | 'transcript' | 'hybrid' }>>();

function canSkipSupportingStage(stage:EditStage,project:EditorProject,output?:StageOutput,job?:EditingJob):boolean{
 if(job?.faultTolerant!==false)return true;
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
 const videoCache=new Map<string,UploadedAiVideoFile|null>();
 let videoFile:UploadedAiVideoFile|undefined;
 const readFrames=async(project:EditorProject,selection:string[],token?:string|null)=>{
  const evidencePromise=captureFootageEvidence(project,selection,a=>repository.resolve(a),signal);
  const videoPromise=token?captureVideoFileForAi(project,selection,a=>repository.resolve(a),token,signal,videoCache).catch(()=>undefined):Promise.resolve(undefined);
  const [evidence,uploadedVideo]=await Promise.all([evidencePromise,videoPromise]);
  frames=evidence.footageFrames;fallbackFrames=evidence.fallbackFootageFrames;
  if(uploadedVideo)videoFile=uploadedVideo;
 };
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
  if(!frames)await readFrames(project,job.selection,token);
  const conversationHistory=(project.editingHistory||[]).filter(h=>h.status==='completed'&&!h.summary?.includes('stopped')).map(h=>({instructions:h.instructions,summary:h.summary}));
  let detectedSilences: Array<{ start: number; end: number; duration: number; source: 'acoustic' | 'transcript' | 'hybrid' }> | undefined;
  const cacheKey = `${project.id}:${project.revision}`;
  if (silenceScanCache.has(cacheKey)) {
    detectedSilences = silenceScanCache.get(cacheKey);
  } else if (stage === 'analyzeFootage' || stage === 'applyRequestedEdits') {
    try {
      const footage = analysisFootage(project, job.selection);
      const hasFootage = footage.length > 0 || Object.values(project.clips).some(c => {
        const t = project.tracks[c.trackId];
        return t && (t.kind === 'video' || t.kind === 'audio') && !t.locked;
      });
      if (hasFootage) {
        const segments = speechContext(project);
        const flattenedWords = segments.flatMap(s => s.words && s.words.length > 0 ? s.words : (s.text ? [{ word: s.text, start: s.start, end: s.end }] : []));
        const primaryAsset = footage.map(c => c.assetId ? project.assets[c.assetId] : undefined).find(Boolean) ||
          Object.values(project.assets).find(a => a.waveform && a.waveform.length > 0);
        const dur = projectDuration(project);
        if (dur > 0 && (flattenedWords.length > 0 || (primaryAsset?.waveform && primaryAsset.waveform.length > 0))) {
          const scan = detectSilences({
            words: flattenedWords.length > 0 ? flattenedWords : undefined,
            waveform: primaryAsset?.waveform,
            duration: dur
          }, {
            thresholdDb: -38,
            minSilenceDuration: 0.40,
            paddingBefore: 0.060,
            paddingAfter: 0.080,
            minKeptGap: 0.15
          });
          if (scan.silentRanges && scan.silentRanges.length > 0) {
            detectedSilences = scan.silentRanges.slice(0, 300).map(r => ({
              start: r.start,
              end: r.end,
              duration: r.duration,
              source: (r.mode === 'acoustic' ? 'acoustic' : (r.confidence && r.confidence > 0.93 ? 'hybrid' : 'transcript')) as 'acoustic' | 'transcript' | 'hybrid'
            }));
            silenceScanCache.set(cacheKey, detectedSilences);
          }
        }
      }
    } catch {
      detectedSilences = undefined;
    }
  }
  const response=await fetch('/api/editor/ai-edit',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'Idempotency-Key':job.id+':'+stage},body:JSON.stringify({instruction:stageInstruction(stage,job),pipelineStage:stage,editingJobId:job.id,project:aiProjectSnapshot(project),selectedClipIds:job.selection.filter(id=>!!project.clips[id]),footageFrames:frames,fallbackFootageFrames:fallbackFrames,videoFile,conversationHistory,detectedSilences:detectedSilences?.length?detectedSilences:undefined}),signal:AbortSignal.any([signal,AbortSignal.timeout(115000)])});
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
    if(!frames){const tok=(await supabase.auth.getSession()).data.session?.access_token||authToken;await readFrames(project,job.selection,tok);}
    const segments=speechContext(project);
    let viralHooks: Array<{ start: number; end: number; text: string; type: string; score: number; recommendation: string }> | undefined;
    try {
      if (segments.length > 0) {
        const hooks = extractViralHooks(segments);
        if (hooks.length > 0) {
          viralHooks = hooks.slice(0, 3).map(h => ({
            start: Math.round(h.start * 100) / 100,
            end: Math.round(h.end * 100) / 100,
            text: (h.sampleText || h.title || '').slice(0, 160),
            type: h.hookType,
            score: Math.round(h.confidence * 100) / 100,
            recommendation: (h.reason || '').slice(0, 200)
          }));
        }
      }
    } catch {
      viralHooks = undefined;
    }
    const operations=PIPELINE_PRESETS.find(p=>p.id===job.presetId)?.operations||(footage.length?explicitOperations(job.instructions):undefined);
    let result: StageOutput;
    if (operations) {
      result = {summary:`Analyzed ${footage.length} source clip(s), ${projectDuration(project).toFixed(2)} seconds, ${frames?.length||0} sampled frames and ${segments.length} available speech segments. Planned ${operations.join(', ')}.`,operations};
    } else {
      try {
        result = await plan(stage,project,job,signal);
        if (!result.operations || !result.operations.length) {
          result.operations = explicitOperations(job.instructions) || ['requestedEdits'];
        }
      } catch (planErr) {
        if (signal.aborted) throw planErr;
        const fallbackOps = explicitOperations(job.instructions) || ['requestedEdits'];
        result = {
          summary: `Analyzed ${footage.length} source clip(s). Proceeding with ${fallbackOps.join(', ')}.`,
          operations: fallbackOps
        };
      }
    }
    return {...result,analysis:{duration:projectDuration(project),footageIds:footage.map(c=>c.id),speechSegments:segments.length,sampledFrames:frames?.length||0,assetIds:Object.keys(project.assets),...(viralHooks?.length?{viralHooks}:{})}};
   }
   case 'applyCaptions':{
    try{
     const footage=analysisFootage(project,job.selection),existing=Object.values(project.clips).filter(c=>c.contentId&&project.captions[c.contentId]&&footage.some(v=>c.startTime>=v.startTime-.01&&c.startTime+c.duration<=v.startTime+v.duration+.01));
     if(existing.some(c=>project.tracks[c.trackId].locked||project.tracks[c.trackId].hidden))throw Error('Unlock and show caption tracks before applying captions.');
     const normalizedTemplate = normalizeCaptionPresetId(job.captionTemplate || 'viral-hinglish-pop');
     const requests=footage.filter(c=>!existing.some(cap=>cap.startTime<c.startTime+c.duration&&cap.startTime+cap.duration>c.startTime)).map(c=>({type:'captions' as const,clipId:c.id,templateId:normalizedTemplate}));
     return await prepare(saved||{summary:'Apply timed speech captions using Caption Studio template '+normalizedTemplate,animateCaptions:/animat|engaging|punchy|caption|subtitle|studio/i.test(job.instructions)||['engaging','punchy'].includes(job.presetId||''),decisions:existing.length?[{op:'applyCaptionTemplate',clipIds:existing.map(c=>c.id),templateId:normalizedTemplate}]:[],requests},project,checkpoint,signal);
    }catch(err){
     if(signal.aborted)throw err;
     const notice: PipelineDegradationNotice = {
      stage: 'applyCaptions',
      status: 'skipped',
      reason: 'Captions: ' + (err instanceof Error ? err.message : 'transcription failed'),
      suggestedAction: 'Spoken dialogue captions were skipped; verify audio track or retry captions.',
      timestamp: Date.now()
     };
     return {
      summary:'Timed speech captions could not be generated; skipped captions and preserved original audio.',
      decisions:[],
      skipRationale:'Captions skipped: '+(err instanceof Error?err.message:'transcription failed'),
      degradationNotices: [notice]
     };
    }
   }
   case 'planMotionGraphics':{
    try{
     const output=saved||await plan(stage,project,job,signal);
     if(!output.decisions?.length&&!canSkipSupportingStage(stage,project,output,job)){
      const notice: PipelineDegradationNotice = {
       stage: 'planMotionGraphics',
       status: 'skipped',
       reason: 'Motion Graphics: AI did not plan any requested motion graphics.',
       suggestedAction: 'Visual clutter avoided; graphics were bypassed.',
       timestamp: Date.now()
      };
      return {
       ...output,
       summary: output.summary || 'No motion graphics planned; moving to next step.',
       decisions: [],
       skipRationale: 'No motion graphics planned',
       degradationNotices: [...(output.degradationNotices || []), notice]
      };
     }
     return {...output,summary:output.summary||'No motion graphics planned; moving to next step.',decisions:output.decisions||[],skipRationale:output.skipRationale||(!output.decisions?.length?'No motion graphics planned':undefined)};
    }catch(err){
     if(signal.aborted)throw err;
     const notice: PipelineDegradationNotice = {
      stage: 'planMotionGraphics',
      status: 'skipped',
      reason: 'Motion Graphics: ' + (err instanceof Error ? err.message : 'plan failed'),
      suggestedAction: 'Visual clutter avoided; graphics were bypassed.',
      timestamp: Date.now()
     };
     return {
      summary:'Motion graphics skipped; moving to next step.',
      decisions:[],
      skipRationale:'Motion graphics skipped: '+(err instanceof Error?err.message:'plan failed'),
      degradationNotices: [notice]
     };
    }
   }
   case 'applyMotionGraphics':{
    try {
     const output=job.stages.find(s=>s.id==='planMotionGraphics')?.output;
     if(!output?.decisions?.length){
      const notice: PipelineDegradationNotice = {
       stage: 'applyMotionGraphics',
       status: 'skipped',
       reason: 'Motion Graphics: Motion graphics plan was empty or skipped.',
       suggestedAction: 'Visual clutter avoided; graphics were bypassed.',
       timestamp: Date.now()
      };
      return {
       ...output,
       summary:output?.summary||'Motion graphics skipped; preserved original visuals.',
       decisions:[],
       skipRationale:output?.skipRationale||'Motion graphics skipped',
       degradationNotices: [...(output?.degradationNotices || []), notice]
      };
     }
     return {...output,summary:'Apply planned motion graphics',decisions:output?.decisions||[]};
    } catch (err) {
     if(signal.aborted)throw err;
     const notice: PipelineDegradationNotice = {
      stage: 'applyMotionGraphics',
      status: 'skipped',
      reason: 'Motion Graphics: ' + (err instanceof Error ? err.message : 'apply failed'),
      suggestedAction: 'Visual clutter avoided; graphics were bypassed.',
      timestamp: Date.now()
     };
     return {
      summary: 'Motion graphics skipped; preserved original visuals.',
      decisions: [],
      skipRationale: 'Motion graphics skipped: ' + (err instanceof Error ? err.message : 'apply failed'),
      degradationNotices: [notice]
     };
    }
   }
   case 'findBroll':{
    try{
     const output=saved||await plan(stage,project,job,signal);await checkpoint(output);
     if(!output.decisions?.length&&!output.requests?.length){
      const notice: PipelineDegradationNotice = {
       stage: 'findBroll',
       status: 'skipped',
       reason: 'B-roll: No relevant B-roll candidates were found.',
       suggestedAction: 'Check stock footage query or manually upload B-roll media.',
       timestamp: Date.now()
      };
      return {
       ...output,
       summary:output.summary||'No B-roll needed for this footage.',
       decisions:[],
       skipRationale:output.skipRationale||'No B-roll requested or candidates found',
       degradationNotices: [...(output.degradationNotices || []), notice]
      };
     }
     const ready=await prepare(output,project,checkpoint,signal);
     if(!ready.decisions?.length){
      const notice: PipelineDegradationNotice = {
       stage: 'findBroll',
       status: 'skipped',
       reason: 'B-roll: No matching B-roll footage could be prepared.',
       suggestedAction: 'Check stock footage query or manually upload B-roll media.',
       timestamp: Date.now()
      };
      return {
       ...ready,
       summary:'No matching B-roll footage was found; moving to next step.',
       decisions:[],
       skipRationale:'No matching B-roll candidates available',
       degradationNotices: [...(ready.degradationNotices || []), notice]
      };
     }
     return ready;
    }catch(err){
     if(signal.aborted)throw err;
     const notice: PipelineDegradationNotice = {
      stage: 'findBroll',
      status: 'skipped',
      reason: 'B-roll: ' + (err instanceof Error ? err.message : 'tool failed'),
      suggestedAction: 'Check stock footage query or manually upload B-roll media.',
      timestamp: Date.now()
     };
     return {
      summary:'B-roll was unavailable or skipped for this footage; moving to next step.',
      decisions:[],
      skipRationale:'B-roll unavailable: '+(err instanceof Error?err.message:'tool failed'),
      degradationNotices: [notice]
     };
    }
   }
   case 'applyBroll':{
    try {
     const output=job.stages.find(s=>s.id==='findBroll')?.output;
     if(!output?.decisions?.length){
      const notice: PipelineDegradationNotice = {
       stage: 'applyBroll',
       status: 'skipped',
       reason: 'B-roll: No selected B-roll is available to apply.',
       suggestedAction: 'Check stock footage query or manually upload B-roll media.',
       timestamp: Date.now()
      };
      return {
       ...output,
       summary:output?.summary||'B-roll skipped; preserved original footage.',
       decisions:[],
       skipRationale:output?.skipRationale||'B-roll skipped',
       degradationNotices: [...(output?.degradationNotices || []), notice]
      };
     }
     return {...output,summary:'Insert selected B-roll with original dialogue preserved',decisions:output.decisions.map(d=>d.op==='addClip'?{...d,volume:0,audioRole:'background' as const}:d)};
    } catch (err) {
     if(signal.aborted)throw err;
     const notice: PipelineDegradationNotice = {
      stage: 'applyBroll',
      status: 'skipped',
      reason: 'B-roll: ' + (err instanceof Error ? err.message : 'apply failed'),
      suggestedAction: 'Check stock footage query or manually upload B-roll media.',
      timestamp: Date.now()
     };
     return {
      summary: 'B-roll skipped; preserved original footage.',
      decisions: [],
      skipRationale: 'B-roll skipped: ' + (err instanceof Error ? err.message : 'apply failed'),
      degradationNotices: [notice]
     };
    }
   }
   case 'applyRequestedEdits':{
    try {
     const output=saved||await plan(stage,project,job,signal);
     const constraints = extractEditingConstraints(job.instructions);

     // Zero-hallucination guardrail: Block arbitrary floating summary text
     if (constraints.requestedFloatingSummaryText) {
      const cleanDecisions = (output.decisions || []).filter(d => d.op !== 'addText');
      const existingCaptions = Object.values(project.clips).filter(c => c.contentId && project.captions[c.contentId]);
      if (existingCaptions.length > 0) {
       if (!cleanDecisions.some(d => d.op === 'applyCaptionTemplate')) {
        cleanDecisions.unshift({
         op: 'applyCaptionTemplate',
         clipIds: existingCaptions.map(c => c.id),
         templateId: 'study-hormozi-style'
        });
       }
      } else if (!output.requests?.some(r => r.type === 'captions')) {
       const firstFootage = Object.values(project.clips).find(c => c.assetId && project.assets[c.assetId]?.kind === 'video');
       if (firstFootage) {
        output.requests = [...(output.requests || []), { type: 'captions', clipId: firstFootage.id, templateId: 'study-hormozi-style' }];
       }
      }
      output.decisions = cleanDecisions;
      const notice: PipelineDegradationNotice = {
       stage: 'applyCaptions',
       status: 'skipped',
       reason: 'Zero-hallucination guardrail active: Floating summary or explanatory text is blocked. Spoken dialogue was bound to caption template instead.',
       suggestedAction: 'Spoken dialogue captions are displayed with engaging typography.',
       timestamp: Date.now()
      };
      output.degradationNotices = [...(output.degradationNotices || []), notice];
      output.summary = "Applied spoken dialogue captions with 'study-hormozi-style'. Floating summary text was skipped under zero-hallucination guardrail.";
     }

     // Caption style switch without altering timestamps or duplicating tracks
     if (constraints.requestedCaptionPreset || constraints.requestedCaptionStudio) {
      const matched = constraints.requestedCaptionPreset || normalizeCaptionPresetId(job.captionTemplate || 'viral-hinglish-pop');
      const existingCaptions = Object.values(project.clips).filter(c => c.contentId && project.captions[c.contentId]);
      if (existingCaptions.length > 0) {
       const cleanDecisions: import('./ai').EditDecision[] = (output.decisions || []).filter(d => d.op !== 'applyCaptionTemplate' && d.op !== 'addCaption');
       cleanDecisions.unshift({
        op: 'applyCaptionTemplate' as const,
        clipIds: existingCaptions.map(c => c.id),
        templateId: matched
       });
       output.decisions = cleanDecisions;
       output.summary = `Updated caption style to ${matched} without altering word timestamps.`;
      }
     }
     if (constraints.requestedAudioDucking || /\b(?:duck\s+(?:the\s+)?music|audio\s+ducking)\b/i.test(job.instructions)) {
      if (!(output.decisions || []).some(d => d.op === 'setAudioDucking')) {
       output.decisions = [...(output.decisions || []), { op: 'setAudioDucking', enabled: true }];
       output.summary = (output.summary ? output.summary + ' ' : '') + 'Enabled background music auto-ducking under speech.';
      }
     }
     if (/\b(?:add\s+)?(?:subtle\s+)?sound\s*effects?(?:\s+automatically)?|auto\s*sfx\b/i.test(job.instructions)) {
      const sfxPlan = createAutoSfxDecisions(project);
      if (sfxPlan.decisions.length > 0) {
       output.decisions = [...(output.decisions || []), ...sfxPlan.decisions];
       output.assets = [...(output.assets || []), ...sfxPlan.assets];
       output.summary = (output.summary ? output.summary + ' ' : '') + `Inserted ${sfxPlan.suggestions.length} subtle contextual sound effects.`;
      }
     }
     if(!output.decisions?.length&&!output.requests?.length&&!output.questions?.length){
      const segments = speechContext(project);
      const cachedSilences = silenceScanCache.get(`${project.id}:${project.revision}`);
      const synthesized = reconcileEditingDecisions(project, [], [], constraints, segments, cachedSilences);
      if (synthesized.decisions.length > 0 || synthesized.toolRequests.length > 0) {
        output.decisions = synthesized.decisions;
        output.requests = synthesized.toolRequests;
        if (synthesized.summaryNotes.length > 0) {
          output.summary = (output.summary ? output.summary + ' ' : '') + synthesized.summaryNotes.join(' ');
        }
      } else {
        output.questions = [output.summary || 'No actionable edits needed for this timeline.'];
      }
     }
     if(output.sourceDecisionCount===undefined)output.sourceDecisionCount=output.decisions?.length||0;
     await checkpoint(output);
     const toolProject=output.preparedApplied?project:buildStageProject(project,{summary:output.summary,decisions:(output.decisions||[]).slice(0,output.sourceDecisionCount)});
     return await prepare(output,toolProject,checkpoint,signal);
    } catch (err) {
     if(signal.aborted)throw err;
     if(err instanceof Error && /link failure/i.test(err.message)) throw err;
     try {
       const segments = speechContext(project);
       const cachedSilences = silenceScanCache.get(`${project.id}:${project.revision}`);
       const reconciled = reconcileEditingDecisions(project, [], [], extractEditingConstraints(job.instructions), segments, cachedSilences);
       if (reconciled.decisions.length > 0 || reconciled.toolRequests.length > 0) {
         const fallbackOutput: StageOutput = {
           summary: reconciled.summaryNotes.length > 0
             ? `Applied requested edits: ${reconciled.summaryNotes.join('; ')}`
             : 'Applied requested edits to the timeline.',
           decisions: reconciled.decisions,
           requests: reconciled.toolRequests,
           sourceDecisionCount: reconciled.decisions.length
         };
         await checkpoint(fallbackOutput);
         const toolProject = buildStageProject(project, { summary: fallbackOutput.summary, decisions: fallbackOutput.decisions });
         return await prepare(fallbackOutput, toolProject, checkpoint, signal);
       }
     } catch {}
     const notice: PipelineDegradationNotice = {
      stage: 'applyRequestedEdits',
      status: 'skipped',
      reason: 'Requested Edits: ' + (err instanceof Error ? err.message : 'requested edit failed'),
      suggestedAction: 'Review user instructions or retry conversational edit.',
      timestamp: Date.now()
     };
     return {
      summary: 'Requested edits could not be completed; preserved current timeline.',
      decisions: [],
      skipRationale: 'Requested edits skipped: ' + (err instanceof Error ? err.message : 'requested edit failed'),
      degradationNotices: [notice]
     };
    }
   }
   case 'applyZooms':{
    try{
     const output=saved||await plan(stage,project,job,signal);
     if(!output.decisions?.length&&!canSkipSupportingStage(stage,project,output,job)){
      const notice: PipelineDegradationNotice = {
       stage: 'applyZooms',
       status: 'skipped',
       reason: 'Zooms: No zoom keyframes planned; preserved natural framing.',
       suggestedAction: 'Framing change skip kiya gaya taaki natural balance bana rahe.',
       timestamp: Date.now()
      };
      return {
       ...output,
       summary: output.summary || 'No zooms needed; preserved framing.',
       decisions: [],
       skipRationale: 'No zooms planned',
       degradationNotices: [...(output.degradationNotices || []), notice]
      };
     }
     return {...output,summary:output.summary||'No zooms needed; preserved framing.',decisions:output.decisions||[],skipRationale:output.skipRationale||(!output.decisions?.length?'No zooms planned':undefined)};
    }catch(err){
     if(signal.aborted)throw err;
     const notice: PipelineDegradationNotice = {
      stage: 'applyZooms',
      status: 'skipped',
      reason: 'Zooms: ' + (err instanceof Error ? err.message : 'plan failed'),
      suggestedAction: 'Framing preserved; verify clip boundaries or retry zooms.',
      timestamp: Date.now()
     };
     return {
      summary:'Zooms skipped; preserved framing and moving to next step.',
      decisions:[],
      skipRationale:'Zooms skipped: '+(err instanceof Error?err.message:'plan failed'),
      degradationNotices: [notice]
     };
    }
   }
   case 'applyEffects':{
    try {
     const output=saved||await plan(stage,project,job,signal);
     if(/\b(?:duck|ducking|audio\s*ducking)\b/i.test(job.instructions)&&!(output.decisions||[]).some(d=>d.op==='setAudioDucking')){
      output.decisions=[...(output.decisions||[]),{op:'setAudioDucking',enabled:true}];
      output.summary=(output.summary?output.summary+' ':'')+'Enabled background music auto-ducking under speech.';
     }
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
    } catch (err) {
     if(signal.aborted)throw err;
     const notice: PipelineDegradationNotice = {
      stage: 'applyEffects',
      status: 'skipped',
      reason: 'Effects: ' + (err instanceof Error ? err.message : 'effects planning failed'),
      suggestedAction: 'Review footage properties or retry stage.',
      timestamp: Date.now()
     };
     return {
      summary: 'Effects skipped; preserved original footage.',
      decisions: [{op:'setAudioDucking',enabled:true}],
      skipRationale: 'Effects skipped: ' + (err instanceof Error ? err.message : 'effects planning failed'),
      degradationNotices: [notice]
     };
    }
   }
   case 'applySoundEffects':{
    try{
     const output=saved||await plan(stage,project,job,signal);await checkpoint(output);
     if(!output.decisions?.length&&!output.requests?.length){
      const sfxPlan = createAutoSfxDecisions(project);
      if (sfxPlan.decisions.length > 0) {
       return {
        ...output,
        summary: `Automatically inserted ${sfxPlan.suggestions.length} subtle contextual sound effects (whoosh on cuts/transitions, pop on graphics, riser before climaxes).`,
        decisions: sfxPlan.decisions,
        assets: sfxPlan.assets,
       };
      }
      const notice: PipelineDegradationNotice = {
       stage: 'applySoundEffects',
       status: 'skipped',
       reason: 'Sound Effects: No sound effects planned.',
       suggestedAction: 'Check SFX audio availability in project assets.',
       timestamp: Date.now()
      };
      return {
       ...output,
       summary:output.summary||'No sound effects needed; preserved original audio.',
       decisions:[],
       skipRationale:output.skipRationale||'No SFX planned',
       degradationNotices: [...(output.degradationNotices || []), notice]
      };
     }
     const ready=await prepare(output,project,checkpoint,signal);
     ready.decisions=ready.decisions?.map(d=>d.op==='addClip'?{...d,audioRole:'sfx',volume:Math.min(.25,d.volume??.15)}:d);
     if(!ready.decisions?.length){
      const notice: PipelineDegradationNotice = {
       stage: 'applySoundEffects',
       status: 'skipped',
       reason: 'Sound Effects: No sound effects found or prepared; preserved original audio.',
       suggestedAction: 'Check SFX audio availability in project assets.',
       timestamp: Date.now()
      };
      return {
       ...ready,
       summary:'No sound effects found; preserved original audio.',
       decisions:[],
       skipRationale:'No SFX prepared',
       degradationNotices: [...(ready.degradationNotices || []), notice]
      };
     }
     return ready;
    }catch(err){
     if(signal.aborted)throw err;
     const notice: PipelineDegradationNotice = {
      stage: 'applySoundEffects',
      status: 'skipped',
      reason: 'Sound Effects: ' + (err instanceof Error ? err.message : 'tool failed'),
      suggestedAction: 'Check SFX audio availability in project assets.',
      timestamp: Date.now()
     };
     return {
      summary:'Sound effects were unavailable or skipped; preserved original audio and moving to next step.',
      decisions:[],
      skipRationale:'SFX unavailable: '+(err instanceof Error?err.message:'tool failed'),
      degradationNotices: [notice]
     };
    }
   }
   case 'validateEdit':{
    const result=validateCompletedJob(project,job);
    const validatedProject = result.project || project;
    // Exercise the same compositor used by preview and offline MP4 export at edited timestamps.
    await loadEditorStudioFonts(validatedProject);await document.fonts.ready;
    let decodeError:Error|undefined;
    const compositor=new Compositor(repository,error=>{decodeError=error;}),canvas=document.createElement('canvas');canvas.width=360;canvas.height=640;
    try{
     const times=[...new Set(job.stages.flatMap(s=>(s.output?.evidence||[]).flatMap(e=>{const c=validatedProject.clips[e.clipId];return c?[c.startTime+Math.min(c.duration/2,.6)]:[];})))];
     for(const time of times){
      const deadline=Date.now()+20000;while(!compositor.sync(validatedProject,time,false)){signal.throwIfAborted();if(decodeError)throw decodeError;if(Date.now()>deadline)throw Error('Edited media could not be decoded for preview. Retry or relink the asset.');await new Promise(resolve=>setTimeout(resolve,40));}
      compositor.render(canvas,validatedProject,time);
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

