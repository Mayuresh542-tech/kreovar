"use client";
import {useMemo,useState} from 'react';
import {Play,RotateCcw,Search,Sparkles} from 'lucide-react';
import {useProject} from '@/app/lib/editor/store';
import {CAPCUT_COMBO_PRESETS,MEDIA_MOTIONS,MEDIA_LOOPS,MEDIA_EASINGS,MEDIA_MOTION_CATALOG,MEDIA_LOOP_CATALOG,MEDIA_MOTION_LABELS,MEDIA_LOOP_LABELS,DEFAULT_MEDIA_ANIMATION,setMediaAnimation,clearMediaAnimation,mediaAnimationTiming,type MediaAnimation,type MediaMotion,type MediaLoop} from '@/app/lib/editor/mediaAnimation';
import type {Clip} from '@/app/lib/editor/model';
import {useEditor} from './EditorContext';
import './media-animation.css';

type Phase='entrance'|'exit'|'loop';
const ANIM_CATS=['all','basic','slide','swing','zoom','spin','fx','wipe','ken-burns'] as const;
function motionLabel(motion:MediaMotion,phase:Phase){const label=MEDIA_MOTION_LABELS[motion];if(motion.startsWith('slide-'))return `Slide ${phase==='entrance'?'from':'to'} ${motion.slice(6)}`;return label;}
function AnimationForm({clip,phase}:{clip:Clip;phase:Phase}){
 const {run,playback}=useEditor();
 const [draft,setDraft]=useState<MediaAnimation>(()=>clip.mediaAnimation?{...clip.mediaAnimation}:{...DEFAULT_MEDIA_ANIMATION,entrance:'none',exit:'none'});
 const [category,setCategory]=useState<(typeof ANIM_CATS)[number]>('all');
 const [query,setQuery]=useState('');
 const patch=(changes:Partial<MediaAnimation>)=>setDraft(value=>({...value,...changes}));
 const active=draft[phase],durationKey=phase==='entrance'?'entranceDuration':phase==='exit'?'exitDuration':'loopDuration';
 const changed=JSON.stringify(draft)!==JSON.stringify(clip.mediaAnimation||{...DEFAULT_MEDIA_ANIMATION,entrance:'none',exit:'none'});
 const timing=mediaAnimationTiming({...clip,mediaAnimation:draft}),compressed=timing.entrance+timing.exit<((draft.entrance==='none'?0:draft.entranceDuration)+(draft.exit==='none'?0:draft.exitDuration))-.001;
 function preview(){const times=mediaAnimationTiming(clip),start=phase==='exit'?clip.startTime+Math.max(0,clip.duration-times.exit-.15):phase==='loop'?clip.startTime+times.entrance:clip.startTime;playback.set(start,true);}
 const filteredPresets = useMemo(() => {
  const q = query.trim().toLowerCase();
  if (phase === 'loop') {
   return MEDIA_LOOPS.filter((id) => {
    const meta = MEDIA_LOOP_CATALOG.find((m) => m.id === id);
    return !q || id.includes(q) || (meta?.label.toLowerCase().includes(q) ?? false) || (meta?.shortDesc.toLowerCase().includes(q) ?? false);
   });
  }
  return MEDIA_MOTIONS.filter((id) => {
   const meta = MEDIA_MOTION_CATALOG.find((m) => m.id === id);
   if (category !== 'all' && meta?.category !== category && id !== 'none') return false;
   if (!q) return true;
   return id.includes(q) || (meta?.label.toLowerCase().includes(q) ?? false) || (meta?.shortDesc.toLowerCase().includes(q) ?? false);
  });
 }, [phase, category, query]);
 return <>
  <div className="vx-media-animation-combos">
   <span className="vx-hint">CapCut Quick Combos (1-click apply):</span>
   <div className="vx-media-combo-row">
    {CAPCUT_COMBO_PRESETS.slice(0, 6).map((combo) => (
     <button
      key={combo.id}
      type="button"
      className="vx-media-combo-pill"
      title={combo.description}
      onClick={() => {
       setDraft({ ...combo.animation });
       run((project) => setMediaAnimation(project, clip.id, combo.animation));
      }}
     >
      {combo.name}
     </button>
    ))}
   </div>
  </div>
  <div className="vx-media-animation-filter">
   <label className="vx-media-search">
    <Search size={12} />
    <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={phase === 'loop' ? 'Search loops & combos...' : 'Search 43 CapCut motions...'} aria-label="Search animations" />
   </label>
   {phase !== 'loop' && (
    <div className="vx-media-cat-pills" role="group" aria-label="Filter animation category">
     {ANIM_CATS.map((cat) => (
      <button key={cat} type="button" aria-pressed={category === cat} onClick={() => setCategory(cat)}>
       {cat === 'ken-burns' ? 'Ken Burns' : cat[0].toUpperCase() + cat.slice(1)}
      </button>
     ))}
    </div>
   )}
  </div>
  <div className="vx-media-animation-grid" role="group" aria-label={phase==='loop'?'Loop animation presets':phase==='entrance'?'Entrance animation presets':'Exit animation presets'}>
   {filteredPresets.map(preset=>{
    const meta = phase === 'loop' ? MEDIA_LOOP_CATALOG.find((m) => m.id === preset) : MEDIA_MOTION_CATALOG.find((m) => m.id === preset);
    const label = phase === 'loop' ? MEDIA_LOOP_LABELS[preset as MediaLoop] || preset : motionLabel(preset as MediaMotion, phase);
    return <button type="button" key={preset} title={meta?.shortDesc || label} className="vx-media-animation-option" aria-pressed={active===preset} aria-label={phase==='loop'?`${label} loop`:label} onClick={()=>patch({[phase]:preset})}>
     <span className="vx-media-animation-demo" data-motion={preset} data-phase={phase} aria-hidden="true"><span/></span>
     <span>{label}</span>
    </button>;
   })}
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
