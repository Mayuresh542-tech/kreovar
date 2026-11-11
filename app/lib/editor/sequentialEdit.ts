import {STAGE_CAPABILITIES} from './editingCapabilities';
import type {EditorProject, MediaAsset} from './model';
import {projectDuration, VALID_CAPTION_PRESETS, type CaptionPresetId, type CaptionDecision, isKnownCaptionPreset, normalizeCaptionPresetId} from './model';
import {referenceCaptionTemplate} from '../captions/referenceTemplates';
import {DEFAULT_CAPTION_TEMPLATES} from '../captions/templates';
import {GRAPHIC_KINDS} from './motionGraphics';

export {VALID_CAPTION_PRESETS, type CaptionPresetId, type CaptionDecision, isKnownCaptionPreset, normalizeCaptionPresetId};
import type {EditDecision} from './ai';
import {applyEditDecisionList} from './ai';
import {validateAiPlan, aiProjectSnapshot} from './aiValidation';
import {addAsset} from './operations';
import {setCaptionMotion} from './captionMotion';
import type {AssetRole} from '../assets/types';
import type {AiToolRequest} from './aiTools';
import {speechContext} from './speechContext';

export const EDIT_OPERATIONS = ['captions','motionGraphics','broll','zooms','soundEffects','effects','requestedEdits'] as const;
export type EditOperation = typeof EDIT_OPERATIONS[number];
export const EDIT_STAGES = ['analyzeFootage','applyCaptions','planMotionGraphics','applyMotionGraphics','findBroll','applyBroll','applyZooms','applySoundEffects','applyEffects','applyRequestedEdits','validateEdit'] as const;
export type EditStage = typeof EDIT_STAGES[number];
export type StageStatus = 'pending'|'planning'|'executing'|'validating'|'committing'|'completed'|'failed'|'cancelled';
export const STAGE_LABELS:Record<EditStage,string> = {
 applyRequestedEdits:'Apply requested edits',analyzeFootage:'Analyze footage',applyCaptions:'Apply animated captions',planMotionGraphics:'Plan motion graphics',applyMotionGraphics:'Apply motion graphics',findBroll:'Find relevant B-roll',applyBroll:'Insert B-roll',applyZooms:'Apply subtle zooms',applySoundEffects:'Apply sound effects',applyEffects:'Apply effects and transitions',validateEdit:'Validate timeline and media'
};
export interface PipelinePreset {id:string;name:string;instruction:string;operations:EditOperation[];captionTemplate:string}
export const PIPELINE_PRESETS:PipelinePreset[] = [
 {id:'engaging',name:'Engaging talking head',instruction:'Add animated captions, motion graphics, relevant B-roll and subtle zoom effects.',operations:['captions','motionGraphics','broll','zooms'],captionTemplate:'signature-poppins'},
 {id:'hormozi',name:'Hormozi Viral',instruction:'Add bold high-energy pop captions, dynamic punch zooms, callout accents and restrained sound effects.',operations:['captions','motionGraphics','zooms','soundEffects'],captionTemplate:'study-hormozi-style'},
 {id:'podcast-pro',name:'Smart Podcast',instruction:'Add clean spotlight captions, subtle conversation zooms, audio ducking and smooth transitions.',operations:['captions','zooms','effects'],captionTemplate:'study-ali-abdaal'},
 {id:'mrbeast',name:'MrBeast Energy',instruction:'Add bouncy colorful captions, rapid B-roll cutaways, graphic stats and subtle zoom pulses.',operations:['captions','motionGraphics','broll','zooms'],captionTemplate:'study-mr-beast-style-2'},
 {id:'documentary',name:'Cinematic Doc',instruction:'Add wide-spaced cinematic subtitles, archival B-roll overlays, slow zoom-in holds and smooth crossfades.',operations:['captions','broll','zooms','effects'],captionTemplate:'study-thora-cinematic'},
 {id:'clean',name:'Clean Minimal',instruction:'Add readable animated subtitles. Preserve the original footage, dialogue and framing.',operations:['captions'],captionTemplate:'study-clean-motion'},
 {id:'punchy',name:'Caption emphasis',instruction:'Add animated captions, sparse motion graphic callouts, subtle zooms and restrained sound effects.',operations:['captions','motionGraphics','zooms','soundEffects'],captionTemplate:'signature-poppins'}
];
export interface StageOutput {
 sourceDecisionCount?:number;
 removedClipIds?:string[];
 projectEvidence?:{tracks:string;settings:string;transitions:string};
 tokenBudget?:{usedTokens:number;reservedTokens:number;limit:number};
 animateCaptions?:boolean;
 preparedApplied?:boolean;
 summary:string;
 questions?:string[];
 skipRationale?:string;
 decisions?:EditDecision[]; assets?:MediaAsset[];
 prepared?:{assetId:string;role:AssetRole;decisions:EditDecision[];media?:MediaAsset;sourceLabel?:string;selection?:{candidateId:string;startTime:number;relevanceScore:number|null;reason:string}}[];
 requests?:AiToolRequest[]; operations?:EditOperation[];
 analysis?:{duration:number;footageIds:string[];speechSegments:number;sampledFrames:number;assetIds:string[]};
 evidence?:{clipId:string;contentId?:string;assetId?:string;kind:string;signature:string;visible?:boolean}[];
 degradationNotices?: PipelineDegradationNotice[];
 skippedNotes?: string[];
}
export interface PipelineDegradationNotice {
 stage: 'findBroll' | 'applyBroll' | 'applySoundEffects' | 'applyZooms' | 'applyCaptions' | 'planMotionGraphics' | EditStage;
 status: 'skipped' | 'partial_failure';
 reason: string;
 suggestedAction?: string;
 timestamp?: number;
}

export interface SequentialEditResult {
 timeline: EditorProject;
 notices: PipelineDegradationNotice[];
 success: boolean;
 skippedNotes?: string[];
 message?: string;
}

export interface EditingStage {id:EditStage;key:string;status:StageStatus;attempts:number;output?:StageOutput;error?:string}
export interface EditingJob {
 tokenBudget?:{usedTokens:number;reservedTokens:number;limit:number};
 requiresNewJob?:boolean;
 version:1;id:string;projectId:string;instructions:string;presetId?:string;captionTemplate:string;selection:string[];
 currentStage?:EditStage;status:'ready'|'running'|'failed'|'cancelled'|'completed';
 completedStages:EditStage[];failedStages:EditStage[];timelineRevision:number;initialRevision:number;
 appliedOperations:string[];generatedAssets:string[];errors:string[];stages:EditingStage[];createdAt:string;
 degradationNotices?: PipelineDegradationNotice[];
 skippedNotes?: string[];
 completionMessage?: string;
}
export function stagesFor(operations:EditOperation[]):EditStage[]{
 if(operations.includes('requestedEdits')){if(operations.length!==1)throw Error('Custom requestedEdits must run alone, not mixed with preset stages.');return ['analyzeFootage','applyRequestedEdits','validateEdit'];}
 return ['analyzeFootage',...(operations.includes('captions')?['applyCaptions' as const]:[]),...(operations.includes('motionGraphics')?['planMotionGraphics' as const,'applyMotionGraphics' as const]:[]),...(operations.includes('broll')?['findBroll' as const,'applyBroll' as const]:[]),...(operations.includes('zooms')?['applyZooms' as const]:[]),...(operations.includes('soundEffects')?['applySoundEffects' as const]:[]),...(operations.includes('effects')?['applyEffects' as const]:[]),'validateEdit'];
}
export function createEditingJob(project:EditorProject,instructions:string,selection:string[],preset?:PipelinePreset):EditingJob{
 if(!instructions.trim()||instructions.length>2000)throw Error('Describe your edit in 1–2000 characters.');
 const id=crypto.randomUUID();
 return {version:1,id,projectId:project.id,instructions:instructions.trim(),presetId:preset?.id,captionTemplate:preset?.captionTemplate||'signature-poppins',selection:[...selection],status:'ready',completedStages:[],failedStages:[],timelineRevision:project.revision,initialRevision:project.revision,appliedOperations:[],generatedAssets:[],errors:[],createdAt:new Date().toISOString(),stages:stagesFor(preset?.operations||['requestedEdits']).map(stage=>({id:stage,key:id+':'+stage,status:'pending',attempts:0}))};
}
export function readRequestedOperations(value:unknown):EditOperation[]{
 if(!Array.isArray(value)||!value.length||value.some(x=>!EDIT_OPERATIONS.includes(x))||new Set(value).size!==value.length)throw Error('AI could not identify supported editing operations. Describe captions, motion graphics, B-roll, zooms, sound effects, transitions or custom timeline edits.');
 if(value.includes('requestedEdits')&&value.length!==1)throw Error('Use requestedEdits alone for mixed custom work.');
 return value;
}
/** Resolve only unambiguous explicit commands locally. All free-form/negative requests use AI analysis. */
export function explicitOperations(instructions:string):EditOperation[]|undefined{
 let remaining=instructions.toLowerCase();const operations:EditOperation[]=[];
 const phrases:[EditOperation,RegExp][]=[['captions',/(?:animated\s+|readable\s+)?captions?/g],['motionGraphics',/(?:sparse\s+)?motion graphics?(?: callouts?)?/g],['broll',/(?:relevant\s+)?b[ -]?roll/g],['zooms',/(?:subtle\s+)?zoom(?: effects?)?s?/g],['soundEffects',/(?:restrained\s+)?(?:sound effects?|sfx)/g]];
 for(const [operation,pattern] of phrases){if(pattern.test(remaining)){operations.push(operation);pattern.lastIndex=0;remaining=remaining.replace(pattern,' ');}}
 remaining=remaining.replace(/\b(add|apply|insert|and|please)\b|[,.;+&]/g,'').trim();
 return remaining||!operations.length?undefined:operations;
}
/** Enforced on the server as well as the client. A stage cannot perform another stage's work. */
export function assertStagePlan(stage:EditStage,decisions:EditDecision[],requests:AiToolRequest[],project:EditorProject){
 const capability=STAGE_CAPABILITIES[stage];if(!capability)throw Error('This stage does not need an AI call.');
 if(decisions.some(d=>!capability.operations.includes(d.op)))throw Error('AI returned an operation outside the current editing stage.');
 if(requests.some(r=>!capability.tools.includes(r.type)))throw Error('AI requested a tool outside the current stage.');
 if(stage==='findBroll'&&requests.some(r=>r.type!=='captions'&&(!['overlay','image'].includes(project.tracks[r.trackId]?.kind)||('treatment'in r&&r.treatment==='overlay'))))throw Error('B-roll must use a visible supporting footage track.');
 for(const d of decisions){
  if(d.op==='addClip'){
   const kind=project.assets[d.assetId]?.kind,track=project.tracks[d.trackId];
   if(stage==='findBroll'&&(!['video','image'].includes(kind)||!['overlay','image'].includes(track?.kind)||d.volume!==0))throw Error('B-roll requires real muted visual media on a supporting track.');
   if(stage==='applySoundEffects'&&(kind!=='audio'||d.audioRole!=='sfx'||d.volume===undefined||d.volume<=0||d.volume>.35))throw Error('Sound effects require real audio with restrained gain.');
  }
  if(stage==='applyZooms'&&d.op==='addZoom'&&(d.toScale>1.18||d.fromScale>1.18||d.endTime-d.startTime<.4))throw Error('Use restrained zooms of at most 1.18×.');
 }
 if(stage==='applyZooms'&&decisions.length>Math.max(1,Math.ceil(projectDuration(project)/6)))throw Error('Too many zooms. Use sparse emphasis moments.');
}
export function stageInstruction(stage:EditStage,job:EditingJob){
 const rule:Partial<Record<EditStage,string>>={
  analyzeFootage:'Analyze only. Return empty decisions and toolRequests, plus requiredOperations containing only the explicitly requested operations from captions,motionGraphics,broll,zooms,soundEffects,effects,requestedEdits. Use requestedEdits ALONE for trim/split/cut/sequence/removal/reordering, text edits or placement, keyframes/animation/overlays/visual treatment, track/settings/aspect-ratio edits, voiceover, stock motion, image requests, or mixed work involving any of those. That stage can perform all 28 native operations and prepare media itself; do not combine it with other operation groups. If no original video exists, use ONLY requestedEdits and project metadata for text/image/audio-only or empty projects, including captions for an existing audio clip. Use a captions request with that actual audio clipId; scope:footage means video clips only. Honor negation. General requests for an engaging edit may use captions,motionGraphics,broll,zooms. Explain the real duration, available transcript, sampled footage and assets. Do not claim scene boundaries or audio analysis that were not supplied.',
  planMotionGraphics:'Plan ONLY sparse animated addGraphic or addShape operations using exact speech context and current footage. Include a supported motion preset for every graphic. Keep captions readable. No tools, captions, zooms or inserted media.',
  findBroll:'Select ONLY relevant B-roll. Prefer real existing visual assets with addClip; otherwise return broll or library toolRequests with real catalog IDs or transcript-grounded search queries, startTime, explicit duration, volume:0, and an unlocked supporting overlay/image track. B-roll must cover only part of the footage, preserve dialogue, and fit the timeline. Never invent URLs.',
  applyZooms:'Return ONLY addZoom operations on original video clips. Use exact emphasis moments, at most 1.18x scale, at least 0.4 seconds per zoom, at most one per six seconds. Preserve source timing and audio.',
  applySoundEffects:'Return ONLY sfx/library toolRequests or addClip for real audio. Use audio tracks, audioRole:sfx and volume 0.08–0.25. Fit effects inside footage. No generated audio or voiceover.',
  applyRequestedEdits:'Fulfil the user request using supported native decisions and toolRequests. This stage supports all listed operations, captions/SFX/library/B-roll/stock-motion/voiceover, and images ONLY if imageGenerationAvailable=true. Never enable services or invent tools. Use actual clip IDs, source ranges and transcript. Respect locked/hidden tracks, selected clips and existing manual work unless replacement is requested. Direct decisions run first, media preparation/insertion afterward, in one atomic timeline change. Caption tools read the post-edit source timing; use scope:footage for captions after split/append when new clip IDs are unknown. Remove existing overlapping captions only if the user requested replacement. Combine all ripple cuts into ONE LAST direct decision; other direct-operation times refer to the current pre-cut timeline, while tool insertion times refer to the final post-cut timeline. Do not add direct generated captions at post-cut times: use the captions tool after cuts. Never guess new IDs or measured silences. An empty plan must explain why the requested edit cannot safely be performed; do not call it complete.',
  applyEffects:'Return ONLY requested addTransition, changeClipProperty or setAudioDucking operations. Preserve source timing and dialogue. No new captions, graphics or media.'
 };
 return `Sequential editing stage: ${stage}. ${rule[stage]||''}\nUser instructions (apply ONLY the current stage): ${job.instructions}`;
}
export const SKIP_RATIONALE = /preserve|framing|no suitable|no (?:speech\s+)?emphasis|no (?:speech|dialogue)|no b-roll|no motion|no sound|no addition|skip|not appropriate|unnecessary/i;

export function hasSkipRationale(output?: StageOutput): boolean {
 if (!output) return false;
 if (typeof output.skipRationale === 'string' && output.skipRationale.trim().length > 0) return true;
 if (output.summary && SKIP_RATIONALE.test(output.summary)) return true;
 return false;
}

export function permitsZeroAdditions(stage: EditStage, before: EditorProject, output: StageOutput, job?: EditingJob): boolean {
 if (!['applyMotionGraphics', 'applyBroll', 'applyZooms', 'applySoundEffects', 'applyEffects'].includes(stage)) return false;
 if (projectDuration(before) < 4.0) return true;
 if (hasSkipRationale(output)) return true;
 const isPreset = !!(job?.presetId || before.editingJob?.presetId);
 if (isPreset) return true;
 if (['findBroll', 'applyBroll', 'applySoundEffects', 'applyEffects'].includes(stage)) return true;
 const initialSpeechSegments = job?.stages?.find(s => s.id === 'analyzeFootage')?.output?.analysis?.speechSegments ?? before.editingJob?.stages?.find(s => s.id === 'analyzeFootage')?.output?.analysis?.speechSegments;
 const noSpeech = initialSpeechSegments === 0 || speechContext(before).length === 0;
 if (noSpeech) {
  const instructions = job?.instructions || before.editingJob?.instructions || '';
  if (instructions) {
   const explicitZooms = stage === 'applyZooms' && /\bzooms?\b/i.test(instructions);
   const explicitGraphics = stage === 'applyMotionGraphics' && /\b(?:motion\s*graphics?|callouts?|shapes?)\b/i.test(instructions);
   const explicitBroll = stage === 'applyBroll' && /\bb[ -]?roll\b/i.test(instructions);
   const explicitSfx = stage === 'applySoundEffects' && /\b(?:sound\s*effects?|sfx)\b/i.test(instructions);
   if (explicitZooms || explicitGraphics || explicitBroll || explicitSfx) return false;
  }
  return true;
 }
 return false;
}

export function buildStageProject(project:EditorProject,output:StageOutput){
 const augmented=(output.assets||[]).reduce((p,a)=>addAsset(p,a),project);
 const decisions=output.decisions||[],count=output.sourceDecisionCount;
 if(count!==undefined&&(!Number.isInteger(count)||count<0||count>decisions.length))throw Error('Invalid prepared-edit boundary.');
 const direct=count===undefined?decisions:decisions.slice(0,count),validated=validateAiPlan({summary:output.summary,decisions:direct},augmented);
 let next=applyEditDecisionList(augmented,validated.list);
 if(count!==undefined&&count<decisions.length){const additions=validateAiPlan({summary:output.summary,decisions:decisions.slice(count)},next);next=applyEditDecisionList(next,additions.list);}
 if(output.animateCaptions){const ids=Object.values(next.clips).filter(c=>c.contentId&&next.captions[c.contentId]&&(!project.clips[c.id]||(output.decisions||[]).some(d=>d.op==='applyCaptionTemplate'&&d.clipIds.includes(c.id)))).map(c=>c.id);if(ids.length)next=setCaptionMotion(next,ids,'pop');}
 return next;
}
function projectEvidence(p:EditorProject){return {tracks:JSON.stringify([p.tracks,p.trackOrder]),settings:JSON.stringify(p.settings),transitions:JSON.stringify(p.transitions)};}
function clipSignature(p:EditorProject,id:string){const c=p.clips[id];return JSON.stringify([c,c?.contentId?p.captions[c.contentId]||p.textLayers[c.contentId]:undefined]);}
export function validateStageChanges(stage:EditStage,before:EditorProject,after:EditorProject,output:StageOutput,job?:EditingJob){
 aiProjectSnapshot(after);
 const custom=stage==='applyRequestedEdits';
 if(custom&&!output.questions?.length&&JSON.stringify([before.clips,before.tracks,before.trackOrder,before.settings,before.transitions,before.textLayers,before.captions])===JSON.stringify([after.clips,after.tracks,after.trackOrder,after.settings,after.transitions,after.textLayers,after.captions]))throw Error('Requested edits did not change the timeline.');
 const changed=Object.values(after.clips).filter(c=>!before.clips[c.id]||clipSignature(before,c.id)!==clipSignature(after,c.id)||custom&&JSON.stringify(before.tracks[c.trackId])!==JSON.stringify(after.tracks[c.trackId]));
 const visible=changed.filter(c=>!after.tracks[c.trackId].hidden&&c.transform.opacity>0&&c.duration>=1/after.settings.fps&&c.startTime>=0&&c.startTime+c.duration<=projectDuration(before)+.04);
 if(['applyCaptions','applyMotionGraphics','applyBroll','applyZooms'].includes(stage)&&visible.length!==changed.length)throw Error('An edit is hidden or outside the footage duration.');
 if(stage==='applyCaptions'){
  const hasValidVisibleCaption=visible.some(c=>c.contentId&&after.captions[c.contentId])||(output.decisions?.some(d=>d.op==='applyCaptionTemplate')&&Object.values(after.clips).some(c=>c.contentId&&after.captions[c.contentId]));
  const isResilient=!!(job?.presetId||before.editingJob?.presetId||(job?.stages&&job.stages.length>3));
  const speechSegments=job?.stages?.find(s=>s.id==='analyzeFootage')?.output?.analysis?.speechSegments??before.editingJob?.stages?.find(s=>s.id==='analyzeFootage')?.output?.analysis?.speechSegments;
  const noSpeech=speechSegments===0||speechContext(before).length===0;
  const permitsZeroCaptions=(isResilient&&noSpeech)||projectDuration(before)<4.0||speechSegments===0||hasSkipRationale(output);
  if(!hasValidVisibleCaption&&!permitsZeroCaptions)throw Error('Captions were not applied visibly with valid timing.');
  if(visible.some(c=>c.contentId&&after.captions[c.contentId]&&!after.captions[c.contentId].text.trim()))throw Error('Captions were not applied visibly with valid timing.');
  for (const c of visible.filter(c => c.contentId && after.captions[c.contentId])) {
   const cap = after.captions[c.contentId!];
   if (cap.templateId && !isKnownCaptionPreset(cap.templateId)) {
    cap.templateId = normalizeCaptionPresetId(cap.templateId);
   }
  }
 }
 if(stage==='applyMotionGraphics'&&!visible.some(c=>(c.graphic||c.shape)&&c.keyframes?.length)){
  if(!permitsZeroAdditions(stage,before,output,job))throw Error('No visible animated motion graphic was created.');
 }
 if(stage==='applyBroll'&&!visible.some(c=>c.assetId&&after.assets[c.assetId]&&['image','overlay'].includes(after.tracks[c.trackId].kind)&&c.volume===0)){
  if(!permitsZeroAdditions(stage,before,output,job))throw Error('No valid muted B-roll was inserted.');
 }
 if(stage==='applyZooms'&&!visible.some(c=>c.zooms?.length&&JSON.stringify(c.zooms)!==JSON.stringify(before.clips[c.id]?.zooms))){
  if(!permitsZeroAdditions(stage,before,output,job))throw Error('No zoom keyframes were applied.');
 }
 if(stage==='applySoundEffects'&&!changed.some(c=>c.assetId&&after.assets[c.assetId]?.kind==='audio'&&c.audioRole==='sfx'&&c.volume>0&&c.volume<=.35&&!after.tracks[c.trackId].muted&&!after.tracks[c.trackId].hidden&&c.startTime+c.duration<=projectDuration(before)+.04)){
  if(!permitsZeroAdditions(stage,before,output,job))throw Error('No audible, synchronized sound effect was inserted.');
 }
 if(stage==='applyEffects'&&JSON.stringify(before.clips)===JSON.stringify(after.clips)&&JSON.stringify(before.transitions)===JSON.stringify(after.transitions)&&JSON.stringify(before.settings)===JSON.stringify(after.settings)){if(!permitsZeroAdditions(stage,before,output,job))throw Error('Requested effects did not change the timeline.');}
 // Supporting edits must preserve original dialogue, placement and duration.
 if(['applyCaptions','applyMotionGraphics','applyBroll','applyZooms','applySoundEffects'].includes(stage))for(const c of Object.values(before.clips).filter(c=>c.assetId&&before.assets[c.assetId]?.kind==='video'&&before.tracks[c.trackId].kind==='video')){
  const n=after.clips[c.id];if(!n||['assetId','trackId','volume','startTime','duration','sourceStart','sourceEnd','speed'].some(k=>n[k as keyof typeof n]!==c[k as keyof typeof c]))throw Error('This stage would alter original footage or dialogue timing.');
 }
 return {...output,...(custom?{projectEvidence:projectEvidence(after),removedClipIds:Object.keys(before.clips).filter(id=>!after.clips[id])}:{}),evidence:changed.map(c=>({clipId:c.id,assetId:c.assetId,contentId:c.contentId,kind:after.tracks[c.trackId].kind,signature:clipSignature(after,c.id),...(custom?{visible:!after.tracks[c.trackId].hidden&&c.transform.opacity>0}:{})}))};
}
export function validateCompletedJob(project:EditorProject,job:EditingJob){
 aiProjectSnapshot(project);
 for(const stage of job.stages.filter(s=>s.id!=='validateEdit')){
  if(stage.status!=='completed')throw Error(STAGE_LABELS[stage.id]+' is incomplete.');
  if(stage.output?.projectEvidence&&JSON.stringify(stage.output.projectEvidence)!==JSON.stringify(projectEvidence(project)))throw Error('Committed track, output or transition state changed. Review '+STAGE_LABELS[stage.id]+'.');
  for(const id of stage.output?.removedClipIds||[])if(project.clips[id])throw Error('A removed clip was restored after the committed edit.');
  for(const e of stage.output?.evidence||[]){
   const c=project.clips[e.clipId];if(!c||(!project.tracks[c.trackId].hidden&&c.transform.opacity>0)!==(e.visible??true)||clipSignature(project,c.id)!==e.signature)throw Error('A committed edit changed or is no longer visible. Review '+STAGE_LABELS[stage.id]+'.');
   if(c.assetId&&!project.assets[c.assetId])throw Error('An edited media asset is missing.');
  }
 }
 const hasClarification=job.stages.some(s=>s.output?.questions&&s.output.questions.length>0);
 const hasLegitimateSkipOrPreset=!!job.presetId||job.stages.some(s=>['applyMotionGraphics','applyBroll','applyZooms','applySoundEffects','applyEffects'].includes(s.id)&&permitsZeroAdditions(s.id,project,s.output||{summary:''},job))||(job.completedStages?.includes('analyzeFootage')&&!job.stages.some(s=>s.id==='applyRequestedEdits'));
 if(!job.appliedOperations.length||project.revision<=job.initialRevision){
  if(!hasClarification&&!hasLegitimateSkipOrPreset)throw Error('No requested edits were committed.');
 }
 if(hasClarification){
  const clarificationSummary=job.stages.find(s=>s.output?.questions?.length)?.output?.summary;
  return {summary:clarificationSummary||'Clarification questions returned.'};
 }
 // Strict Caption Template Enforcement & Zero-Hallucinated Text Linting
 for (const c of Object.values(project.clips)) {
  const isCaption = (c.trackId && project.tracks[c.trackId]?.kind === 'caption') || (c.contentId && project.captions[c.contentId]);
  if (isCaption && c.contentId && project.captions[c.contentId]) {
   const cap = project.captions[c.contentId];
   const currentTpl = (cap as { templateId?: string }).templateId;
   if (!currentTpl || !isKnownCaptionPreset(currentTpl)) {
    const fallback: CaptionPresetId = 'study-hormozi-style';
    (cap as { templateId?: string }).templateId = fallback;
    const ref = referenceCaptionTemplate(fallback) || DEFAULT_CAPTION_TEMPLATES[0];
    if (ref) {
     cap.studioStyle = { ...ref.style };
    }
   }
  }
  const isTextTrack = c.trackId && project.tracks[c.trackId]?.kind === 'text';
  if (isTextTrack && c.contentId && project.textLayers[c.contentId] && !project.captions[c.contentId]) {
   const isStandardLowerThird = c.graphic && GRAPHIC_KINDS.includes(c.graphic.kind);
   if (!isStandardLowerThird) {
    delete project.clips[c.id];
    if (project.tracks[c.trackId]) {
     project.tracks[c.trackId].clipIds = project.tracks[c.trackId].clipIds.filter(id => id !== c.id);
    }
    delete project.textLayers[c.contentId];
    if (!job.degradationNotices) job.degradationNotices = [];
    job.degradationNotices.push({
     stage: 'applyCaptions',
     status: 'skipped',
     reason: 'Blocked arbitrary floating text on text track; only standard lower-third presets and transcript captions are permitted.',
     suggestedAction: 'Spoken dialogue captions are displayed with engaging typography.',
     timestamp: Date.now()
    });
   }
  }
 }

 const allNotices: PipelineDegradationNotice[] = [
  ...(job.degradationNotices || []),
  ...job.stages.flatMap(s => s.output?.degradationNotices || [])
 ];
 const uniqueNotices = Array.from(new Map(allNotices.map(n => [`${n.stage}:${n.reason}`, n])).values());
 job.degradationNotices = uniqueNotices;
 if (uniqueNotices.length > 0) {
  const skippedNotes = uniqueNotices.map(n => {
   if (n.stage === 'applyBroll' || n.stage === 'findBroll') {
    return `⚠️ B-Roll: Suitable 9:16 stock clip nahi mila, isliye original footage ko intact maintain kiya gaya.`;
   }
   if (n.stage === 'applySoundEffects') {
    return `⚠️ SFX: Sound effect asset unavailable ya boundary timing hone ke karan sound bypass kar di gayi.`;
   }
   if (n.stage === 'applyZooms') {
    return `⚠️ Zooms: Framing change skip kiya gaya taaki natural balance bana rahe.`;
   }
   if (n.stage === 'planMotionGraphics' || n.stage === 'applyMotionGraphics') {
    return `⚠️ Motion Graphics: Visual clutter avoid karne ke liye graphics bypass kiye gaye.`;
   }
   return `⚠️ ${STAGE_LABELS[n.stage as EditStage] || n.stage}: ${n.reason}`;
  });
  job.skippedNotes = skippedNotes;
  job.completionMessage = "Video edit complete! Yahan kuch non-critical tasks hain jo skip huye:";
  return {
   summary: 'All requested stages validated with adjustments. Preview and export use this saved timeline. Export the MP4 to verify the encoded result.',
   degradationNotices: uniqueNotices,
   skippedNotes
  };
 }
 return {summary:'All requested stages validated. Preview and export use this saved timeline. Export the MP4 to verify the encoded result.'};
}

export interface PipelineRuntime {
 getProject:()=>EditorProject;interacting:()=>boolean;
 persist:(project:EditorProject,job:EditingJob)=>Promise<void>;
 execute:(stage:EditStage,project:EditorProject,job:EditingJob,signal:AbortSignal,checkpoint:(output:StageOutput)=>Promise<void>)=>Promise<StageOutput>;
}
function abortable<T>(work:Promise<T>,signal:AbortSignal):Promise<T>{
 return new Promise((resolve,reject)=>{const cancel=()=>reject(signal.reason);signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();work.then(resolve,reject).finally(()=>signal.removeEventListener('abort',cancel));});
}
/** One awaited handler at a time. Timeline plus operation ledger are committed in the same document. */
export async function runEditingJob(runtime:PipelineRuntime,initial:EditingJob,signal:AbortSignal){
 if(initial.requiresNewJob)throw Error('Review the manual changes and start a new AI edit.');
 let job=structuredClone(initial);
 async function save(project:EditorProject){await runtime.persist(project,job);job=structuredClone(runtime.getProject().editingJob!);}
 try{
  for(let index=0;index<job.stages.length;index++){
   let stage=job.stages[index];if(stage.status==='completed')continue;
   signal.throwIfAborted();const before=runtime.getProject();
   if(runtime.interacting()||before.revision!==job.timelineRevision)throw Error('Timeline changed outside this job. Start a new edit after reviewing the saved changes.');
   job.status='running';job.currentStage=stage.id;stage.status='planning';stage.error=undefined;stage.attempts++;await save(before);
   stage=job.stages[index];stage.status='executing';await save(runtime.getProject());
   const stageSignal=AbortSignal.any([signal,AbortSignal.timeout(180000)]);
   const checkpoint=async(output:StageOutput)=>{stageSignal.throwIfAborted();job.stages[index].output=output;await save(runtime.getProject());};
   let output:StageOutput;
   try{
    output=await abortable(runtime.execute(stage.id,runtime.getProject(),job,stageSignal,checkpoint),stageSignal);
   }catch(err){
    if(signal.aborted)throw err;
    const isPreset=!!(job.presetId||before.editingJob?.presetId);
    const isEnrichment=['findBroll','applyBroll','applySoundEffects','applyEffects'].includes(stage.id);
    const isSupportingStage=['applyCaptions','planMotionGraphics','applyMotionGraphics','findBroll','applyBroll','applyZooms','applySoundEffects','applyEffects'].includes(stage.id);
    if((isPreset&&isSupportingStage)||isEnrichment){
     output={
      summary:`${STAGE_LABELS[stage.id]} was unavailable or skipped for this footage; moving to next step.`,
      decisions:stage.id==='applyEffects'?[{op:'setAudioDucking',enabled:true}]:[],
      skipRationale:`${STAGE_LABELS[stage.id]} skipped: `+(err instanceof Error?err.message:'stage execution failed'),
      degradationNotices: [{
       stage: stage.id,
       status: 'skipped',
       reason: `${STAGE_LABELS[stage.id]}: ` + (err instanceof Error ? err.message : 'stage execution failed'),
       suggestedAction: stage.id === 'findBroll' || stage.id === 'applyBroll'
        ? 'Check stock footage query or manually upload B-roll media.'
        : stage.id === 'applySoundEffects'
        ? 'Check SFX audio availability in project assets.'
        : 'Review footage properties or retry stage.',
       timestamp: Date.now()
      }]
     };
    }else{
     throw err;
    }
   }
   if(output.tokenBudget)job.tokenBudget=output.tokenBudget;
   if(output.degradationNotices?.length)job.degradationNotices=[...(job.degradationNotices||[]),...output.degradationNotices];
   signal.throwIfAborted();stage=job.stages[index];stage.status='validating';stage.output=output;await save(runtime.getProject());
   const base=runtime.getProject();if(base.revision!==job.timelineRevision||runtime.interacting())throw Error('Timeline changed during this stage. Start a fresh edit.');
   let changes=!!output.decisions?.length&&!['analyzeFootage','planMotionGraphics','findBroll'].includes(stage.id);
   let next=changes?buildStageProject(base,output):base;
   try{
    stage.output=validateStageChanges(stage.id,base,next,output,job);
   }catch(valErr){
    if(signal.aborted)throw valErr;
    const isResilient=!!(job.presetId||before.editingJob?.presetId||job.stages.length>3);
    const isSupportingStage=['applyCaptions','planMotionGraphics','applyMotionGraphics','findBroll','applyBroll','applyZooms','applySoundEffects','applyEffects'].includes(stage.id);
    if(isResilient&&isSupportingStage){
     output={
      summary:`${STAGE_LABELS[stage.id]} was unavailable or skipped for this footage; moving to next step.`,
      decisions:stage.id==='applyEffects'?[{op:'setAudioDucking',enabled:true}]:[],
      skipRationale:`${STAGE_LABELS[stage.id]} skipped: `+(valErr instanceof Error?valErr.message:'validation failed'),
      degradationNotices: [{
       stage: stage.id,
       status: 'skipped',
       reason: `${STAGE_LABELS[stage.id]}: ` + (valErr instanceof Error ? valErr.message : 'validation check failed; preserved baseline timeline'),
       suggestedAction: 'Review timeline track and clip properties.',
       timestamp: Date.now()
      }]
     };
     changes=false;
     next=base;
     stage.output=validateStageChanges(stage.id,base,base,output,job);
    }else{
     throw valErr;
    }
   }
   if(stage.id==='analyzeFootage'){
    if(!job.stages.some(s=>s.id==='applyRequestedEdits')){
     const configuredOps = [...new Set(job.stages.map(s => {
       if (s.id === 'applyCaptions') return 'captions' as const;
       if (s.id === 'planMotionGraphics' || s.id === 'applyMotionGraphics') return 'motionGraphics' as const;
       if (s.id === 'findBroll' || s.id === 'applyBroll') return 'broll' as const;
       if (s.id === 'applyZooms') return 'zooms' as const;
       if (s.id === 'applySoundEffects') return 'soundEffects' as const;
       if (s.id === 'applyEffects') return 'effects' as const;
       return null;
     }).filter((op): op is ('captions' | 'motionGraphics' | 'broll' | 'zooms' | 'soundEffects' | 'effects') => op !== null))];
     const preset=PIPELINE_PRESETS.find(p=>p.id===job.presetId);
     const operations=(job.presetId && configuredOps.length > 0) ? configuredOps : (preset?.operations||readRequestedOperations(output.operations));
     job.stages=stagesFor(operations).map(id=>job.stages.find(s=>s.id===id)||{id,key:job.id+':'+id,status:'pending',attempts:0});stage=job.stages[index];
    }
   }
   stage.status='committing';await save(base);
   stage=job.stages[index];stage.status='completed';job.completedStages=[...new Set([...job.completedStages,stage.id])];job.failedStages=job.failedStages.filter(id=>id!==stage.id);
   if(changes)job.appliedOperations=[...new Set([...job.appliedOperations,stage.key])];
   job.generatedAssets=[...new Set([...job.generatedAssets,...(output.assets||[]).map(a=>a.id),...(output.prepared||[]).map(a=>a.assetId)])];
   if(stage.id==='validateEdit'){job.status='completed';job.currentStage=undefined;}
   await save(next);
  }
 }catch(error){
  if(error&&typeof error==='object'&&'tokenBudget'in error)job.tokenBudget=(error as {tokenBudget:EditingJob['tokenBudget']}).tokenBudget;
  const message=error instanceof Error?error.message:'Editing stage failed.';job.status=signal.aborted?'cancelled':'failed';job.errors=[...job.errors.slice(-19),message];
  if(runtime.getProject().revision!==job.timelineRevision)job.requiresNewJob=true;
  const stage=job.stages.find(s=>s.id===job.currentStage);if(stage&&stage.status!=='completed'){stage.status=signal.aborted?'cancelled':'failed';stage.error=signal.aborted?'Operation cancelled. Committed stages are saved.':message;job.failedStages=[...new Set([...job.failedStages,stage.id])];}
  await save(runtime.getProject());
 }
 return job;
}

