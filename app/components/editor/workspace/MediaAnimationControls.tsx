"use client";
import {useState} from 'react';
import {Play,RotateCcw,Sparkles} from 'lucide-react';
import {useProject} from '@/app/lib/editor/store';
import {MEDIA_MOTIONS,MEDIA_LOOPS,MEDIA_EASINGS,MEDIA_MOTION_LABELS,DEFAULT_MEDIA_ANIMATION,setMediaAnimation,clearMediaAnimation,mediaAnimationTiming,type MediaAnimation,type MediaMotion} from '@/app/lib/editor/mediaAnimation';
import type {Clip} from '@/app/lib/editor/model';
import {useEditor} from './EditorContext';
import './media-animation.css';

type Phase='entrance'|'exit'|'loop';
function motionLabel(motion:MediaMotion,phase:Phase){const label=MEDIA_MOTION_LABELS[motion];if(motion.startsWith('slide-'))return `Slide ${phase==='entrance'?'from':'to'} ${motion.slice(6)}`;return label;}
function AnimationForm({clip,phase}:{clip:Clip;phase:Phase}){
 const {run,playback}=useEditor();
 const [draft,setDraft]=useState<MediaAnimation>(()=>clip.mediaAnimation?{...clip.mediaAnimation}:{...DEFAULT_MEDIA_ANIMATION,entrance:'none',exit:'none'});
 const patch=(changes:Partial<MediaAnimation>)=>setDraft(value=>({...value,...changes}));
 const active=draft[phase],durationKey=phase==='entrance'?'entranceDuration':phase==='exit'?'exitDuration':'loopDuration';
 const changed=JSON.stringify(draft)!==JSON.stringify(clip.mediaAnimation||{...DEFAULT_MEDIA_ANIMATION,entrance:'none',exit:'none'});
 const timing=mediaAnimationTiming({...clip,mediaAnimation:draft}),compressed=timing.entrance+timing.exit<((draft.entrance==='none'?0:draft.entranceDuration)+(draft.exit==='none'?0:draft.exitDuration))-.001;
 function preview(){const times=mediaAnimationTiming(clip),start=phase==='exit'?clip.startTime+Math.max(0,clip.duration-times.exit-.15):phase==='loop'?clip.startTime+times.entrance:clip.startTime;playback.set(start,true);}
 return <>
  <div className="vx-media-animation-grid" role="group" aria-label={phase==='loop'?'Loop animation presets':phase==='entrance'?'Entrance animation presets':'Exit animation presets'}>
   {(phase==='loop'?MEDIA_LOOPS:MEDIA_MOTIONS).map(preset=><button type="button" key={preset} className="vx-media-animation-option" aria-pressed={active===preset} aria-label={phase==='loop'?`${preset[0].toUpperCase()+preset.slice(1)} loop`:motionLabel(preset as MediaMotion,phase)} onClick={()=>patch({[phase]:preset})}>
    <span className="vx-media-animation-demo" data-motion={preset} data-phase={phase} aria-hidden="true"><span/></span>
    <span>{phase==='loop'?preset[0].toUpperCase()+preset.slice(1):motionLabel(preset as MediaMotion,phase)}</span>
   </button>)}
  </div>
  {active!=='none'&&<label className="vx-field vx-media-animation-duration"><span>{phase==='loop'?'Loop cycle':'Duration'}<output>{draft[durationKey].toFixed(2)}s</output></span><input type="range" aria-label={phase==='loop'?'Loop cycle duration':phase==='entrance'?'Entrance animation duration':'Exit animation duration'} min={phase==='loop'?.5:.05} max={phase==='loop'?6:3} step={.05} value={draft[durationKey]} onChange={event=>patch({[durationKey]:Number(event.target.value)})}/></label>}
  {phase!=='loop'&&active!=='none'&&<label className="vx-field"><span>Easing</span><select aria-label="Media animation easing" value={draft.easing} onChange={event=>patch({easing:event.target.value as MediaAnimation['easing']})}>{MEDIA_EASINGS.map(value=><option value={value} key={value}>{value==='smooth'?'Smooth':value==='ease-out'?'Ease out':value==='overshoot'?'Spring':'Linear'}</option>)}</select></label>}
  {compressed&&<p className="vx-hint">In and Out timings will fit this short clip automatically.</p>}
  <div className="vx-media-animation-actions"><button className="vx-primary" type="button" disabled={!changed} onClick={()=>run(project=>setMediaAnimation(project,clip.id,draft))}>Apply animation</button><button className="vx-secondary" type="button" disabled={!clip.mediaAnimation||changed} onClick={preview}><Play size={13}/> Preview</button></div>
  {changed&&<small className="vx-media-animation-pending" role="status">Apply to preview your changes.</small>}
  {clip.mediaAnimation&&<button type="button" className="vx-media-animation-remove" onClick={()=>run(project=>clearMediaAnimation(project,clip.id))}><RotateCcw size={12}/> Remove media animation</button>}
 </>;
}
export default function MediaAnimationControls({clipId}:{clipId:string}){
 const {store}=useEditor(),project=useProject(store),clip=project.clips[clipId],asset=clip?.assetId?project.assets[clip.assetId]:undefined;
 const [phase,setPhase]=useState<Phase>('entrance');
 if(!clip||!asset||!['image','video'].includes(asset.kind))return null;
 return <section className="vx-property-section vx-media-animation" aria-label="Media animation controls"><h3><Sparkles size={14}/> Animation <span>Manual</span></h3><p className="vx-hint">Add motion to this clip. Existing keyframes and audio stay as they are.</p><div className="vx-media-animation-phases" role="group" aria-label="Animation phase">{(['entrance','exit','loop'] as const).map(value=><button type="button" key={value} aria-pressed={phase===value} onClick={()=>setPhase(value)}>{value==='entrance'?'In':value==='exit'?'Out':'Loop'}{clip.mediaAnimation?.[value]&&clip.mediaAnimation[value]!=='none'&&<i aria-label="Applied"/>}</button>)}</div><AnimationForm key={JSON.stringify(clip.mediaAnimation)||'none'} clip={clip} phase={phase}/></section>;
}
