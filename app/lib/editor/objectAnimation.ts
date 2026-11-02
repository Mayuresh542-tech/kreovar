import {type EditorProject,type Transform} from './model';
import {setTransformKeyframes,type TransformKeyframe,type MotionEasing} from './keyframes';
export const OBJECT_MOTIONS=['none','fade','slide-up','slide-down','slide-left','slide-right','pop','spin'] as const;
export const OBJECT_LOOPS=['none','float','pulse','sway'] as const;
export interface ObjectAnimation {entrance:typeof OBJECT_MOTIONS[number];exit:typeof OBJECT_MOTIONS[number];hold:typeof OBJECT_LOOPS[number];entranceDuration:number;exitDuration:number;easing:MotionEasing}
export const defaultObjectAnimation:ObjectAnimation={entrance:'fade',exit:'fade',hold:'none',entranceDuration:.35,exitDuration:.25,easing:'smooth'};
function outside(t:Transform,kind:ObjectAnimation['entrance'],exit=false){const v={...t};if(kind==='none')return v;v.opacity=0;const direction=exit?-1:1;if(kind==='slide-up')v.y+=.1*direction;if(kind==='slide-down')v.y-=.1*direction;if(kind==='slide-left')v.x+=.14*direction;if(kind==='slide-right')v.x-=.14*direction;if(kind==='pop')v.scale=Math.max(.05,t.scale*.65);if(kind==='spin'){v.rotation-=18*direction;v.scale=Math.max(.05,t.scale*.8);}return v;}
/** Generates ordinary source-clock keyframes, shared by all visual object types. */
export function applyObjectAnimation(p:EditorProject,id:string,options:ObjectAnimation):EditorProject{
 const c=p.clips[id];if(!c||p.tracks[c.trackId].locked||p.tracks[c.trackId].kind==='audio')throw Error('Select an unlocked visual object.');
 if(!OBJECT_MOTIONS.includes(options.entrance)||!OBJECT_MOTIONS.includes(options.exit)||!OBJECT_LOOPS.includes(options.hold)||!['linear','smooth','ease-out','overshoot'].includes(options.easing)||![options.entranceDuration,options.exitDuration].every(n=>Number.isFinite(n)&&n>=.05&&n<=3))throw Error('Choose a supported motion and durations from 0.05–3 seconds.');
 const span=c.sourceEnd-c.sourceStart;if(span<=0)throw Error('The object has no usable duration.');const t={...c.transform},rawIn=options.entrance==='none'?0:options.entranceDuration*c.speed,rawOut=options.exit==='none'?0:options.exitDuration*c.speed,factor=rawIn+rawOut>span*.8?span*.8/(rawIn+rawOut):1,enter=rawIn*factor,exit=rawOut*factor,holdStart=enter,holdEnd=span-exit;
 const frames:TransformKeyframe[]=[],put=(at:number,value:Transform,easing:MotionEasing=options.easing)=>{const sourceTime=c.sourceStart+at,old=frames.findIndex(f=>Math.abs(f.sourceTime-sourceTime)<1e-7);const f={sourceTime,value,easing};if(old>=0)frames[old]=f;else frames.push(f);};
 put(0,outside(t,options.entrance),'linear');if(enter)put(enter,t);
 if(options.hold!=='none'&&holdEnd>holdStart){const cycles=Math.max(1,Math.min(8,Math.round((holdEnd-holdStart)/c.speed/2))),steps=cycles*4;for(let i=0;i<=steps;i++){const phase=i/steps*Math.PI*2*cycles,v={...t};if(options.hold==='float')v.y-=Math.sin(phase)*.02;if(options.hold==='pulse')v.scale=Math.min(10,t.scale*(1+(1-Math.cos(phase))*.025));if(options.hold==='sway')v.rotation+=Math.sin(phase)*3;put(holdStart+(holdEnd-holdStart)*i/steps,v,'smooth');}}
 put(holdEnd,t);put(span,outside(t,options.exit,true));return setTransformKeyframes(p,id,frames);
}
