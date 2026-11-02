"use client";
import ObjectAnimationControls from './ObjectAnimationControls';
import {useState} from 'react';
import {usePlayback,useProject} from '@/app/lib/editor/store';
import {MOTION_PRESETS,applyMotionPreset,captureKeyframe,keyframeTransform,setTransformKeyframes,type MotionEasing} from '@/app/lib/editor/keyframes';
import {useEditor} from './EditorContext';
export default function KeyframeControls({clipId}:{clipId:string}){
 const {store,playback,run}=useEditor(),p=useProject(store),{time}=usePlayback(playback),c=p.clips[clipId];
 const [ease,setEase]=useState<MotionEasing>('smooth');if(!c)return null;
 const inside=time>=c.startTime&&time<c.startTime+c.duration,t=keyframeTransform(c,time);
 return <section className="vx-property-section"><h3>{c.assetId?"Advanced keyframes":"Animation & keyframes"}</h3>{!c.assetId&&<ObjectAnimationControls clipId={clipId}/>}<p className="vx-hint">Animate position, scale, rotation and opacity. Preview and export share these keyframes.</p><label className="vx-field"><span>Animation preset · replaces current keyframes</span><select aria-label="Animation preset" value="" onChange={e=>{if(e.target.value)run(p=>applyMotionPreset(p,clipId,e.target.value as typeof MOTION_PRESETS[number]));}}><option value="">Choose motion</option>{MOTION_PRESETS.map(v=><option key={v} value={v}>{v.replaceAll('-',' ')}</option>)}</select></label><label className="vx-field"><span>Keyframe easing</span><select aria-label="Keyframe easing" value={ease} onChange={e=>setEase(e.target.value as MotionEasing)}>{['linear','smooth','ease-out','overshoot'].map(v=><option key={v}>{v}</option>)}</select></label>
 <fieldset disabled={!inside} className="vx-field-grid">{(['x','y','scale','rotation','opacity'] as const).map(key=><label className="vx-field" key={key}><span>Animated {key}</span><input type="number" aria-label={`Animated ${key}`} step={key==='rotation'?1:.01} value={Number(t[key].toFixed(3))} onChange={e=>{const value=e.target.valueAsNumber;if(Number.isFinite(value))run(p=>captureKeyframe(p,clipId,time,{...t,[key]:value},ease));}}/></label>)}</fieldset>
 <button className="vx-secondary vx-wide" disabled={!inside} onClick={()=>run(p=>captureKeyframe(p,clipId,time,t,ease))}>Add keyframe at playhead</button>{!inside&&<p className="vx-hint">Place the playhead inside this clip to add keyframes.</p>}
 {(c.keyframes||[]).filter(f=>f.sourceTime>=c.sourceStart&&f.sourceTime<=c.sourceEnd).map(f=>{const at=c.startTime+(f.sourceTime-c.sourceStart)/c.speed;return <div className="vx-quick-actions" key={f.sourceTime}><button onClick={()=>playback.set(at,false)}>◆ {at.toFixed(2)}s · {f.easing}</button><button aria-label={`Remove keyframe at ${at.toFixed(2)} seconds`} onClick={()=>run(p=>setTransformKeyframes(p,clipId,(p.clips[clipId].keyframes||[]).filter(k=>k.sourceTime!==f.sourceTime)))}>Remove</button></div>;})}
 {!!c.keyframes?.length&&<button className="vx-secondary vx-wide" onClick={()=>run(p=>setTransformKeyframes(p,clipId,[]))}>Clear keyframes</button>}
 </section>;
}
