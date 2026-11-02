import {applyEditDecisionList,type EditDecision,type EditDecisionList} from './ai';
import {validateAiPlan} from './aiValidation';
import {validateAiTools,mainFootage,type AiToolRequest} from './aiTools';
import {speechContext} from './speechContext';
import {projectDuration,type EditorProject,type MediaAsset,type Clip} from './model';
import {addAsset} from './operations';
import {editorialBeats} from './editorialSense';
import {AI_EDIT_STYLE_RECIPES} from '../captions/aiEditStyles';

export const AUTO_EDIT_STYLES=[
 {id:'ai-choice',name:'Let AI choose',description:'Understand the clip, match captions and find supporting footage',templateId:'clean-sub',scale:1.08},
 ...AI_EDIT_STYLE_RECIPES,
 {id:'clean',name:'Clean Story',description:'Clear captions · gentle motion',templateId:'clean-sub',scale:1.08},
 {id:'social',name:'Bold Social',description:'Punchy captions · short zoom pulses',templateId:'hormozi-punch',scale:1.16},
 {id:'editorial',name:'Editorial',description:'Paired fonts · measured pacing',templateId:'editorial-serif',scale:1.1},
 {id:'cinema',name:'Soft Cinema',description:'Quiet captions · slow push-ins',templateId:'quiet-luxury',scale:1.12},
] as const;
export interface AutoEditOptions {
 styleId:string;intensity:'subtle'|'balanced'|'punchy';captions:boolean;zooms:boolean;
 transitions:boolean;removeFillers:boolean;broll?:boolean;motionGraphics?:boolean;animateOverlays?:boolean;surfaces?:boolean;captionColor:string;musicAssetId:string;cutawayAssetId:string;
}
export const DEFAULT_AUTO_EDIT:AutoEditOptions={styleId:'ai-choice',broll:true,intensity:'balanced',captions:true,zooms:true,transitions:false,removeFillers:false,motionGraphics:true,animateOverlays:true,surfaces:true,captionColor:'',musicAssetId:'',cutawayAssetId:''};
export interface AutoCut {key:string;word:string;start:number;end:number}
const overlaps=(a:Clip,b:Clip)=>a.startTime<b.startTime+b.duration-1e-6&&a.startTime+a.duration>b.startTime+1e-6;
function styleFor(options:AutoEditOptions){const style=AUTO_EDIT_STYLES.find(s=>s.id===options.styleId);if(!style)throw Error('Choose an edit style.');if(!['subtle','balanced','punchy'].includes(options.intensity))throw Error('Choose an edit intensity.');if(options.captionColor&&!/^#[0-9a-f]{6}$/i.test(options.captionColor))throw Error('Choose a valid caption text color.');return style;}
function scopedFootage(p:EditorProject,selection:string[]){
 const all=mainFootage(p).filter(c=>!p.assets[c.assetId!].stockKey);
 const scoped=selection.length?all.filter(c=>selection.includes(c.id)):all;
 if(!scoped.length)throw Error(selection.length?'Select main footage clips to use Auto edit.':'Add footage to the timeline first.');
 const targets=scoped.filter(c=>!p.tracks[c.trackId].locked);
 if(!targets.length)throw Error('Unlock the selected footage first.');
 return targets;
}
function scopedCaptions(p:EditorProject,footage:Clip[]){return Object.values(p.clips).filter(c=>c.contentId&&p.captions[c.contentId]&&!p.tracks[c.trackId].hidden&&footage.some(v=>c.startTime>=v.startTime-1e-6&&c.startTime+c.duration<=v.startTime+v.duration+1e-6));}
const listFor=(p:EditorProject,decisions:EditDecision[]):EditDecisionList=>({version:1,projectId:p.id,baseRevision:p.revision,decisions});

/** No provider calls: preparation is an explicit, separately approved step. */
export function createAutoEditPlan(project:EditorProject,options:AutoEditOptions,selection:string[]=[]){
 const style=styleFor(options),decisions:EditDecision[]=[],notes:string[]=[];
 if(!mainFootage(project).length&&!selection.length){
  const originals=Object.values(project.assets).filter(a=>a.kind==='video'&&!a.stockKey&&a.duration>0).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
  if(!originals.length)throw Error('Upload footage to your project first.');
  decisions.push({op:'appendSequence',assetIds:originals.map(a=>a.id)});
 }
 const list=listFor(project,decisions),base=applyEditDecisionList(project,list),footage=scopedFootage(base,selection);
 if(projectDuration(base)>60)throw Error('Trim the timeline to 60 seconds before Auto edit.');
 const toolRequests:AiToolRequest[]=[];
 if(options.captions){
  for(const clip of footage){
   const hasCaptions=Object.values(base.clips).some(c=>c.contentId&&base.captions[c.contentId]&&overlaps(c,clip));
   if(!hasCaptions)toolRequests.push({type:'captions',clipId:clip.id,templateId:style.templateId,placementId:'caption-safe'});
   else notes.push('Existing captions are reused; partially captioned clips are not transcribed again.');
  }
 }
 if(toolRequests.length>6)throw Error('Auto edit can transcribe up to six clips at once. Select fewer clips.');
 validateAiTools(toolRequests,base,[]);
 // Sequence operations allocate fresh IDs. Resolve those IDs at preparation time.
 if(decisions.some(d=>d.op==='appendSequence')&&toolRequests.length)toolRequests.splice(0,toolRequests.length,{type:'captions',scope:'footage',templateId:style.templateId,placementId:'caption-safe'});
 return {summary:`Prepare a ${style.name} edit at ${options.intensity} intensity. Preserve original speech, framing, manual media and timing unless you approve individual cuts.`,list,toolRequests,notes:[...new Set(notes)]};
}

/** Recognized timed hesitation tokens only; caption gaps are never called silence. */
export function autoEditCutCandidates(p:EditorProject,selection:string[]=[]):AutoCut[]{
 const footage=scopedFootage(p,selection),words=speechContext(p).flatMap(c=>c.words||[]),fps=p.settings.fps,seen=new Set<string>(),result:AutoCut[]=[];
 for(const w of words){
  const word=w.word.toLowerCase().replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu,'');
  if(!/^(um+|uh+|erm+|hmm+)$/.test(word))continue;
  const start=Math.ceil((w.start-1e-7)*fps)/fps,end=Math.floor((w.end+1e-7)*fps)/fps;
  if(end-start<1/fps-1e-6||!footage.some(c=>start>=c.startTime&&end<=c.startTime+c.duration))continue;
  if(words.some(other=>other!==w&&other.start<end-1e-6&&other.end>start+1e-6&&(other.start!==w.start||other.end!==w.end||other.word!==w.word)))continue;
  // Ripple cuts shift every downstream track, so selected-only edits cannot cut unrelated footage.
  if(selection.length&&mainFootage(p).some(c=>!selection.includes(c.id)&&c.startTime+c.duration>start))continue;
  const key=`${start.toFixed(6)}:${end.toFixed(6)}:${word}`;
  if(seen.has(key))continue;
  try{validateAiPlan({summary:'Review timed filler',decisions:[{op:'rippleCut',ranges:[{start,end}]}]},p);}catch{continue;}
  seen.add(key);result.push({key,word:w.word,start,end});
 }
 return result.sort((a,b)=>a.start-b.start).slice(0,12);
}

/** Return the actual reviewed document: generated caption IDs must never be replayed. */
export function finishAutoEditPlan(snapshot:EditorProject,baseList:EditDecisionList,assets:MediaAsset[],toolDecisions:EditDecision[],options:AutoEditOptions,selection:string[]=[],approvedCuts:ReadonlySet<string>=new Set()){
 const style=styleFor(options),augmented=assets.reduce((p,a)=>addAsset(p,a),snapshot);
 const prefix=[...baseList.decisions,...toolDecisions];
 const initial=validateAiPlan({summary:'Prepared footage and transcription',decisions:prefix},augmented);
 const staged=applyEditDecisionList(augmented,initial.list),footage=scopedFootage(staged,selection);
 const decisions:EditDecision[]=[],notes:string[]=[],fps=staged.settings.fps;
 const captions=scopedCaptions(staged,footage),editable=captions.filter(c=>!staged.tracks[c.trackId].locked);
 if(options.captions&&editable.length){
  decisions.push({op:'applyCaptionTemplate',clipIds:editable.map(c=>c.id),templateId:style.templateId});
  if(options.captionColor)for(const c of editable)decisions.push({op:'changeText',clipId:c.id,text:staged.captions[c.contentId!].text,style:{color:options.captionColor}});
 }
 if(options.captions&&captions.length!==editable.length)notes.push('Locked captions keep their original styling.');
 if(options.captions&&!captions.length)notes.push('No timed captions are available yet.');
 const speech=speechContext(staged).flatMap(c=>c.words||[]);
 const editorial=editorialBeats(staged,footage);
 if(options.motionGraphics){
  const graphics=options.intensity==='subtle'?editorial.slice(0,1):editorial.slice(0,options.intensity==='punchy'?3:2);
  const textTrack=staged.trackOrder.map(id=>staged.tracks[id]).find(t=>t.kind==='text'&&!t.locked&&!t.hidden);
  for(const beat of graphics){
   if(!textTrack||textTrack.clipIds.some(id=>{const c=staged.clips[id];return c.startTime<beat.end&&c.startTime+c.duration>beat.start;}))continue;
   decisions.push({op:'addGraphic',kind:beat.numeric?'stat':'callout',text:beat.text,startTime:beat.start,duration:Math.min(4,beat.end-beat.start),accent:options.captionColor||'#c8ff00',motion:options.styleId==='social'?'pop':'slide-up'});
   notes.push(`${beat.start.toFixed(2)}s: ${beat.reason} — “${beat.text}”. Review placement; faces were not detected.`);
  }
  if(!editorial.length)notes.push('No timed emphasis cues were found. No decorative callouts were invented.');
 }
 if(options.zooms){
  const spacing=options.intensity==='punchy'?4:options.intensity==='subtle'?10:7;
  const scale=Math.min(1.22,style.scale+(options.intensity==='punchy'?.03:options.intensity==='subtle'?-.03:0));
  let last=-Infinity,total=0;
  for(const c of footage){
   if(c.zooms?.length||c.keyframes?.length){notes.push('Existing zooms and keyframed motion are preserved.');continue;}
   const beats=editorial.filter(w=>w.start>=c.startTime&&w.end<=c.startTime+c.duration).map(w=>w.start);
   // Without a transcript, one opening zoom is based on clip timing, never inferred content.
   if(!beats.length){beats.push(c.startTime);notes.push(speech.length?'A single opening push-in is used where no emphasis cue was found.':'Opening zooms without word timing use clip timing, not scene detection.');}
   for(const beat of beats){
    const start=Math.ceil((beat-1e-7)*fps)/fps,end=Math.floor((Math.min(start+(options.styleId==='cinema'?2.5:1.2),c.startTime+c.duration)+1e-7)*fps)/fps;
    if(start-last<spacing||end-start<.5||total>=8)continue;
    decisions.push({op:'addZoom',clipId:c.id,startTime:start,endTime:end,fromScale:1,toScale:scale,easing:'smooth',returnToStart:true,focusX:0,focusY:0});last=start;total++;
   }
  }
 }
 if(options.transitions){for(let i=1;i<footage.length;i++){
  const a=footage[i-1],b=footage[i];if(a.trackId!==b.trackId||Math.abs(a.startTime+a.duration-b.startTime)>1e-6)continue;
  if(Object.values(staged.transitions).some(t=>t.fromClipId===a.id||t.toClipId===b.id))continue;
  const duration=Math.min(.25,a.duration/3,b.duration/3);if(duration<1/fps)continue;
  decisions.push({op:'addTransition',fromClipId:a.id,toClipId:b.id,kind:'dissolve',duration});
 }}
 const start=Math.min(...footage.map(c=>c.startTime)),end=Math.max(...footage.map(c=>c.startTime+c.duration));
 if(options.musicAssetId){
  const a=staged.assets[options.musicAssetId],track=staged.trackOrder.map(id=>staged.tracks[id]).find(t=>t.kind==='audio'&&!t.locked&&!t.hidden&&!t.muted);
  if(!a||a.kind!=='audio'||!(a.duration>0)||!track)throw Error('Choose project audio and an unlocked, audible audio track.');
  const existing=Object.values(staged.clips).find(c=>c.assetId===a.id&&c.audioRole==='background');
  if(existing)notes.push('This background music is already on the timeline; it was not duplicated.');
  else decisions.push({op:'addClip',assetId:a.id,trackId:track.id,startTime:start,duration:Math.min(a.duration,end-start),volume:.12,audioRole:'background'},{op:'setAudioDucking',enabled:true});
 }
 if(options.cutawayAssetId){
  const a=staged.assets[options.cutawayAssetId],track=staged.trackOrder.map(id=>staged.tracks[id]).find(t=>t.kind==='overlay'&&!t.locked&&!t.hidden);
  if(!a||!['video','image'].includes(a.kind)||!track)throw Error('Choose project video/image media and an unlocked overlay track.');
  if(footage.some(c=>c.assetId===a.id))throw Error('Choose separate cutaway media, not the main footage.');
  const target=footage.find(c=>c.duration>=2);if(!target)throw Error('A custom cutaway needs at least two seconds of footage.');
  const cue=editorial.find(b=>b.start>=target.startTime&&b.start+1<=target.startTime+target.duration);
  const at=cue?.start??target.startTime+Math.min(1,target.duration/4),duration=Math.min(3,target.startTime+target.duration-at,a.kind==='image'?3:a.duration);
  if(duration<1/fps)throw Error('The custom cutaway has no usable duration.');
  if(Object.values(staged.clips).some(c=>c.trackId===track.id&&c.startTime<at+duration&&c.startTime+c.duration>at))throw Error('The overlay track is occupied at the cutaway time. Move that media first.');
  if(a.kind==='image'&&options.animateOverlays)decisions.push({op:'addOverlay',assetId:a.id,trackId:track.id,startTime:at,duration,motion:options.styleId==='social'?'pop':'slide-up'});
  else decisions.push({op:'addClip',assetId:a.id,trackId:track.id,startTime:at,duration,volume:0});
  notes.push(cue?'Your chosen media is timed to a transcript cue. Relevance still comes from your media choice.':'Custom cutaway placement uses clip timing. Relevance comes from your media choice.');
 }
 const candidates=options.removeFillers?autoEditCutCandidates(staged,selection):[];
 const ranges=candidates.filter(c=>approvedCuts.has(c.key)).map(({start,end})=>({start,end}));
 if(ranges.length)decisions.push({op:'rippleCut',ranges});
 if(options.removeFillers&&!candidates.length)notes.push('No safe, timed hesitation words found. No silence or speech was guessed.');
 const validated=validateAiPlan({summary:`${style.name} · ${options.intensity}`,decisions},staged);
 const reviewed=applyEditDecisionList(staged,validated.list);
 if(prefix.length+decisions.length>100)throw Error('This edit has too many steps. Select fewer clips.');
 return {reviewed,candidates,notes:[...new Set(notes)],prepared:{assets,list:listFor(snapshot,[...prefix,...validated.list.decisions])}};
}
