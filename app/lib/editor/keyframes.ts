import {type Clip,type EditorProject,type Transform,clamp} from './model';
export const MOTION_PRESETS=['slide-up','slide-left','pop','float','spin-in'] as const;
export type MotionPreset=typeof MOTION_PRESETS[number];
export type MotionEasing='linear'|'smooth'|'ease-out'|'overshoot';
export interface TransformKeyframe {sourceTime:number;value:Transform;easing:MotionEasing}
const keys=['x','y','scale','rotation','opacity'] as const;
export function readKeyframes(value:unknown):TransformKeyframe[]{
 if(!Array.isArray(value)||value.length>96)throw Error('Use at most 96 transform keyframes.');
 const result=value.map(raw=>{const frame=raw as TransformKeyframe,t=frame?.value;
  if(!frame||!t||!Number.isFinite(frame.sourceTime)||frame.sourceTime<0||frame.sourceTime>86400||!keys.every(k=>Number.isFinite(t[k]))||Math.abs(t.x)>2||Math.abs(t.y)>2||t.scale<.05||t.scale>10||Math.abs(t.rotation)>3600||t.opacity<0||t.opacity>1||!['linear','smooth','ease-out','overshoot'].includes(frame.easing))throw Error('Invalid transform keyframe.');
  return {sourceTime:frame.sourceTime,value:{x:t.x,y:t.y,scale:t.scale,rotation:t.rotation,opacity:t.opacity},easing:frame.easing};
 }).sort((a,b)=>a.sourceTime-b.sourceTime);
 if(result.some((f,i)=>i>0&&Math.abs(f.sourceTime-result[i-1].sourceTime)<1e-7))throw Error('Keyframe times must be unique.');
 return result;
}
function easing(kind:MotionEasing,p:number){if(p===0||p===1)return p;switch(kind){case'linear':return p;case'ease-out':return 1-Math.pow(1-p,3);case'overshoot':{const t=p-1;return 1+2.70158*t*t*t+1.70158*t*t;}default:return p*p*(3-2*p);}}
/** Source-clock animation survives split, trim, move and speed changes. */
export function keyframeTransform(clip:Clip,time:number):Transform{
 const frames=clip.keyframes;if(!frames?.length)return clip.transform;
 const clock=clip.sourceStart+Math.max(0,time-clip.startTime)*clip.speed;
 const before=frames.filter(f=>f.sourceTime<=clock).at(-1),after=frames.find(f=>f.sourceTime>clock);
 if(!before)return {...clip.transform};if(!after)return {...before.value};
 const p=clamp((clock-before.sourceTime)/(after.sourceTime-before.sourceTime),0,1),q=easing(after.easing,p),out={...clip.transform};
 for(const key of keys)out[key]=before.value[key]+(after.value[key]-before.value[key])*q;
 return {...out,scale:clamp(out.scale,.05,10),opacity:clamp(out.opacity,0,1)};
}
function editable(p:EditorProject,id:string){const c=p.clips[id];if(!c||p.tracks[c.trackId].locked||p.tracks[c.trackId].kind==='audio')throw Error('Select an unlocked visual clip.');return c;}
export function setTransformKeyframes(p:EditorProject,id:string,value:unknown):EditorProject{
 const c=editable(p,id),keyframes=readKeyframes(value);
 return {...p,clips:{...p.clips,[id]:{...c,keyframes:keyframes.length?keyframes:undefined}}};
}
export function captureKeyframe(p:EditorProject,id:string,time:number,value:Transform,ease:MotionEasing='smooth'){
 const c=editable(p,id);if(time<c.startTime||time>=c.startTime+c.duration)throw Error('Place the playhead inside the selected clip.');
 const sourceTime=c.sourceStart+Math.round((time-c.startTime)*p.settings.fps)/p.settings.fps*c.speed;
 const frames=(c.keyframes||[]).filter(f=>Math.abs(f.sourceTime-sourceTime)>c.speed/p.settings.fps/2);
 if(!frames.length&&sourceTime>c.sourceStart+1e-6)frames.push({sourceTime:c.sourceStart,value:{...c.transform},easing:'linear'});
 return setTransformKeyframes(p,id,[...frames,{sourceTime,value,easing:ease}]);
}
export function applyMotionPreset(p:EditorProject,id:string,preset:MotionPreset):EditorProject{
 const c=editable(p,id);if(!MOTION_PRESETS.includes(preset))throw Error('Choose a supported motion preset.');
 const t={...c.transform},duration=c.sourceEnd-c.sourceStart,enter=Math.min(.38*c.speed,duration*.22),exit=Math.min(.25*c.speed,duration*.18);
 const a={...t,opacity:0},b={...t,opacity:0};
 if(preset==='slide-up'){a.y+=.08;b.y-=.025;}if(preset==='slide-left'){a.x+=.14;b.x-=.05;}
 if(preset==='pop'){a.scale=Math.max(.05,t.scale*.68);b.scale=t.scale*.94;}
 if(preset==='spin-in'){a.rotation-=12;a.scale=t.scale*.8;b.rotation+=4;}
 const keyframes:TransformKeyframe[]=[{sourceTime:c.sourceStart,value:a,easing:'linear'},{sourceTime:c.sourceStart+enter,value:t,easing:preset==='pop'?'overshoot':'ease-out'}];
 if(preset==='float')keyframes.push({sourceTime:c.sourceStart+duration*.5,value:{...t,y:t.y-.025},easing:'smooth'});
 keyframes.push({sourceTime:c.sourceEnd-exit,value:t,easing:'smooth'},{sourceTime:c.sourceEnd,value:b,easing:'smooth'});
 return setTransformKeyframes(p,id,keyframes);
}
