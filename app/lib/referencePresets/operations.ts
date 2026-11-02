import {applyEditDecisionList,type EditDecision} from '../editor/ai';
import {validateAiPlan,aiProjectSnapshot} from '../editor/aiValidation';
import {addAsset,addCaption,changeClipProperty} from '../editor/operations';
import {setCaptionMotion} from '../editor/captionMotion';
import {projectDuration,dimensions,type EditorProject} from '../editor/model';
import {captionStyle,type StyleSpec,type MediaAnalysis,type ReferenceStage,type ReferenceOutput,type Word} from './model';
import {mainFootage} from '../editor/aiTools';
export function supportedStagePlan(stage:ReferenceStage,project:EditorProject,value:unknown,spec:StyleSpec,analysis?:MediaAnalysis){
 const validated=validateAiPlan(value,project),decisions=validated.list.decisions;
 if(stage==='applyPacing'&&decisions.length>1)throw Error('Apply pacing as one validated cut batch.');
 const allowed:Partial<Record<ReferenceStage,string[]>>={applyPacing:['rippleCut'],applyMotionGraphics:['addGraphic','addShape'],findBroll:[],applyZoomsTransitions:['addZoom','addTransition'],applySoundEffects:['addClip']};
 if(!allowed[stage]||decisions.some(d=>!allowed[stage]!.includes(d.op)))throw Error('The reference plan contains an operation outside this stage.');
 const end=projectDuration(project);
 for(const d of decisions){
  if('startTime'in d&&typeof d.startTime==='number'&&(d.startTime<0||d.startTime>=end||'duration'in d&&typeof d.duration==='number'&&d.startTime+d.duration>end+.001))throw Error('Reference effects must fit the current footage.');
  if(d.op==='addZoom'&&(!spec.zooms.enabled||d.fromScale!==1||d.toScale<=1.005||d.toScale>spec.zooms.maximumScale||d.returnToStart!==true||d.endTime-d.startTime<.5||!mainFootage(project).some(c=>c.id===d.clipId)))throw Error('The zoom does not follow the reference constraints.');
  if(d.op==='addTransition'&&(!spec.transitions.enabled||d.kind!==spec.transitions.kind||d.duration>spec.transitions.duration))throw Error('The transition differs from the reference specification.');
  if(d.op==='addGraphic'&&(!spec.graphics.kinds.includes(d.kind)||d.accent!==spec.graphics.accent||d.motion!==spec.graphics.motion))throw Error('The graphic differs from the cached reference language.');
  if(d.op==='addShape'&&(d.motion!==spec.graphics.motion||d.style?.fill!==spec.graphics.accent))throw Error('Reference shapes need real animation.');
  if(d.op==='rippleCut'){
   if(!analysis)throw Error('Verified pause analysis is unavailable.');const candidates=safePauseCuts(analysis,spec);
   if(d.ranges.some(r=>!candidates.some(c=>Math.abs(c.start-r.start)<.0001&&Math.abs(c.end-r.end)<.0001))||d.ranges.reduce((n,r)=>n+r.end-r.start,0)>end*spec.pacing.maxRemovalRatio)throw Error('Cuts must use measured silence without removing speech.');
  }
 }
 const graphics=decisions.filter(d=>d.op==='addGraphic'||d.op==='addShape');if(graphics.length>Math.max(1,Math.ceil(end*spec.graphics.maximumPerMinute/60)))throw Error('The reference plan adds too many motion graphics.');
 const zooms=decisions.filter((d):d is Extract<EditDecision,{op:'addZoom'}>=>d.op==='addZoom').sort((a,b)=>a.startTime-b.startTime);if(zooms.some((z,i)=>i>0&&z.startTime-zooms[i-1].startTime<spec.zooms.minimumInterval))throw Error('Reference zooms are too frequent.');
 return validated;
}
export function safePauseCuts(a:MediaAnalysis,s:StyleSpec){return a.silences.filter(r=>r.end-r.start>=s.pacing.minimumPause).map(r=>({start:r.start+s.pacing.padding,end:r.end-s.pacing.padding})).filter(r=>r.end-r.start>=.1&&!a.words.some(w=>w.end>r.start-.03&&w.start<r.end+.03));}
export function applyReferenceDecisions(p:EditorProject,output:ReferenceOutput){const augmented=Object.values(output.media||{}).reduce((next,a)=>addAsset(next,a),p);if(!output.decisions?.length)return augmented;return applyEditDecisionList(augmented,validateAiPlan({summary:output.summary,decisions:output.decisions},augmented).list);}
export function createReferenceCaptions(p:EditorProject,analysis:MediaAnalysis,spec:StyleSpec){
 if(!analysis.words.length)throw Error('Real timed speech is required for reference captions.');
 let next=p;const size=Math.min(...dimensions[p.settings.aspectRatio]);
 for(const clip of mainFootage(p)){
  const words=analysis.words.filter(w=>w.end>clip.sourceStart&&w.start<clip.sourceEnd).map(w=>({...w,start:Math.max(clip.sourceStart,w.start),end:Math.min(clip.sourceEnd,w.end)}));let group:Word[]=[];
  const flush=()=>{if(!group.length)return;const start=group[0].start,end=group[group.length-1].end,duration=(end-start)/clip.speed;if(duration>=1/p.settings.fps){const before=next;next=addCaption(next,group.map(w=>w.word).join(' '),clip.startTime+(start-clip.sourceStart)/clip.speed,duration,captionStyle(spec,size),group.map(w=>({word:w.word,start:(w.start-start)/clip.speed,end:(w.end-start)/clip.speed})));const id=Object.keys(next.clips).find(id=>!before.clips[id])!;next=changeClipProperty(next,id,{transform:{...next.clips[id].transform,y:spec.caption.y}});}group=[];};
  for(const word of words){if(group.length&&word.start-group[group.length-1].end>.5)flush();group.push(word);if(group.length>=spec.caption.wordsPerCaption)flush();}flush();
 }
 if(Object.keys(next.captions).length===Object.keys(p.captions).length)throw Error('No visible captions were created.');return next;
}
export function animateReferenceCaptions(p:EditorProject,s:StyleSpec){const ids=Object.values(p.clips).filter(c=>c.contentId&&p.captions[c.contentId]).map(c=>c.id);return setCaptionMotion(p,ids,s.caption.motion,s.caption.highlightColor);}
export function validateReferenceTimeline(p:EditorProject,s:StyleSpec){
 aiProjectSnapshot(p);const duration=projectDuration(p);if(duration<=0||duration>60.1)throw Error('The reference timeline duration is invalid.');
 const clips=Object.values(p.clips),visible=clips.filter(c=>!p.tracks[c.trackId].hidden&&c.transform.opacity>0);
 for(const c of clips){if(c.startTime<0||c.startTime+c.duration>duration+.001||c.assetId&&!p.assets[c.assetId]||c.assetId&&p.assets[c.assetId].kind!=='image'&&c.sourceEnd>p.assets[c.assetId].duration+.04)throw Error('An edited timeline element has invalid timing or media.');}
 if(s.caption.enabled&&!visible.some(c=>c.contentId&&p.captions[c.contentId]))throw Error('Reference captions are missing.');
 if(s.caption.enabled&&visible.filter(c=>c.contentId&&p.captions[c.contentId]).some(c=>{const caption=p.captions[c.contentId!];return caption.motion!==s.caption.motion||caption.style.font!==s.caption.font||caption.style.color!==s.caption.color||Math.abs(c.transform.y-s.caption.y)>.001;}))throw Error('Caption style or animation differs from the cached reference.');
 if(s.transitions.enabled&&!Object.values(p.transitions).some(t=>t.kind===s.transitions.kind&&t.duration>0&&t.duration<=s.transitions.duration&&visible.some(c=>c.id===t.fromClipId)&&visible.some(c=>c.id===t.toClipId)))throw Error('Required reference transitions are missing.');
 if(s.graphics.enabled&&!visible.some(c=>(c.graphic||c.shape)&&c.keyframes?.length))throw Error('Reference motion graphics are missing.');
 if(s.broll.enabled&&!visible.some(c=>c.assetId&&p.tracks[c.trackId].kind==='overlay'&&c.volume===0))throw Error('Reference B-roll is missing.');
 if(s.zooms.enabled&&!visible.some(c=>c.zooms?.length))throw Error('Reference zooms are missing.');
 if(s.sound.enabled&&!clips.some(c=>c.audioRole==='sfx'&&c.volume>0&&!p.tracks[c.trackId].muted))throw Error('Reference sound effects are missing.');
 return {clipIds:clips.map(c=>c.id),duration,revision:p.revision};
}
