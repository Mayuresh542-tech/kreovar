
import {type Clip,type EditorProject,type Transform} from './model';

export type ZoomStyle = 'punch-in' | 'smooth-push' | 'snap-in' | 'slow-pull-back';

export interface ZoomMotion {
 sourceStart:number; sourceEnd:number;
 fromScale:number; toScale:number;
 easing:'linear'|'smooth'; returnToStart:boolean;
 focusX:number; focusY:number;
 style?:ZoomStyle;
}
const finite=(n:number)=>Number.isFinite(n);
export function validateZoom(value:ZoomMotion):ZoomMotion{
 const z=value;
 if(!z||![z.sourceStart,z.sourceEnd,z.fromScale,z.toScale,z.focusX,z.focusY].every(finite)||z.sourceStart<0||z.sourceEnd<=z.sourceStart||z.fromScale<1||z.fromScale>2||z.toScale<1||z.toScale>2||Math.abs(z.focusX)>.4||Math.abs(z.focusY)>.4||!['linear','smooth'].includes(z.easing)||typeof z.returnToStart!=='boolean')throw Error('Invalid zoom motion. Use scales from 1× to 2× and an interval inside the footage.');
 if(z.style&&!['punch-in','smooth-push','snap-in','slow-pull-back'].includes(z.style))throw Error('Invalid zoom style.');
 return {...z};
}
/** Source-clock motion survives split, trim, ripple cut, move, and speed changes. */
export function zoomTransform(clip:Clip,time:number):Transform{
 const clock=clip.sourceStart+Math.max(0,time-clip.startTime)*clip.speed;
 const z=clip.zooms?.filter(z=>clock>=z.sourceStart).sort((a,b)=>a.sourceStart-b.sourceStart).at(-1);
 if(!z)return clip.transform;

 const duration=Math.max(1e-6,z.sourceEnd-z.sourceStart);
 const elapsed=clock-z.sourceStart;
 const t=Math.max(0,Math.min(1,elapsed/duration));

 // Default vertical focal anchor shifts toward upper-third eye-line (anchorY = 0.36 -> y offset -0.14)
 const focusX=z.focusX;
 const focusY=(z.focusY!==undefined&&z.focusY!==0)?z.focusY:-0.14;

 // If clock has reached or passed sourceEnd:
 if(clock>=z.sourceEnd){
  if(z.returnToStart){
   // Hard cut (0ms) reset back to 1.0x on cut boundary - NEVER rubber-band animate back down
   return clip.transform;
  }
  // Hold final framing
  const finalMultiplier=z.toScale;
  return {
   ...clip.transform,
   scale:clip.transform.scale*finalMultiplier,
   x:clip.transform.x+focusX*(1-finalMultiplier),
   y:clip.transform.y+focusY*(1-finalMultiplier)
  };
 }

 let multiplier:number;
 const style=z.style;

 if(style==='punch-in'){
  // Hard-cut impact zoom: 0ms instantaneous jump to target scale, flat hold
  multiplier=z.toScale;
 }else if(style==='snap-in'){
  // Ease-out expo whip zoom (0.22s, 6-7 frames at 30fps), flat hold, zero overshoot
  const whipDuration=Math.min(0.22,duration*0.4);
  if(elapsed<whipDuration){
   const p=elapsed/whipDuration;
   const easeOutExpo=1-Math.pow(2,-10*p);
   const clampedEase=Math.max(0,Math.min(1,easeOutExpo));
   multiplier=z.fromScale+(z.toScale-z.fromScale)*clampedEase;
  }else{
   multiplier=z.toScale;
  }
 }else if(style==='smooth-push'){
  // Subtle Ken Burns creep over segment
  const eased=z.easing==='linear'?t:t*t*(3-2*t);
  multiplier=z.fromScale+(z.toScale-z.fromScale)*eased;
 }else if(style==='slow-pull-back'){
  // Smooth pull back from reveal/intro framing down to base framing
  const eased=z.easing==='linear'?t:t*t*(3-2*t);
  multiplier=z.fromScale+(z.toScale-z.fromScale)*eased;
 }else{
  // Fallback for legacy zoom pulse (if style was omitted)
  const progress=z.returnToStart?(t<=.5?t*2:(1-t)*2):t;
  const eased=z.easing==='smooth'?progress*progress*(3-2*progress):progress;
  multiplier=z.fromScale+(z.toScale-z.fromScale)*eased;
 }

 return {
  ...clip.transform,
  scale:clip.transform.scale*multiplier,
  x:clip.transform.x+focusX*(1-multiplier),
  y:clip.transform.y+focusY*(1-multiplier)
 };
}

export function addZoom(p:EditorProject,id:string,startTime:number,endTime:number,fromScale=1,toScale=1.15,returnToStart=false,easing:ZoomMotion['easing']='smooth',focusX=0,focusY=0,style?:ZoomStyle):EditorProject{
 const c=p.clips[id],track=c&&p.tracks[c.trackId],asset=c?.assetId?p.assets[c.assetId]:undefined;
 if(!c||!track||track.locked||!asset||asset.kind==='audio')throw Error('Choose unlocked video or image footage for zooms.');
 const frame=1/p.settings.fps;
 if(!finite(startTime)||!finite(endTime)||startTime<c.startTime-1e-6||endTime>c.startTime+c.duration+1e-6||endTime-startTime<frame)throw Error('Keep the zoom interval inside its clip, at least one frame long.');
 const zoom=validateZoom({sourceStart:c.sourceStart+(startTime-c.startTime)*c.speed,sourceEnd:c.sourceStart+(endTime-c.startTime)*c.speed,fromScale,toScale,easing,returnToStart,focusX,focusY,...(style?{style}:{})});
 if((c.zooms?.length||0)>=60)throw Error('Use at most 60 zooms per clip.');
 if(c.zooms?.some(z=>zoom.sourceStart<z.sourceEnd-1e-6&&zoom.sourceEnd>z.sourceStart+1e-6))throw Error('Zoom intervals cannot overlap. Clear or adjust the existing zoom first.');
 return {...p,clips:{...p.clips,[id]:{...c,zooms:[...(c.zooms||[]),zoom].sort((a,b)=>a.sourceStart-b.sourceStart)}}};
}
export function clearZooms(p:EditorProject,id:string):EditorProject{
 const c=p.clips[id];if(!c||p.tracks[c.trackId].locked)throw Error('Choose unlocked footage to clear zooms.');
 return {...p,clips:{...p.clips,[id]:{...c,zooms:undefined}}};
}
