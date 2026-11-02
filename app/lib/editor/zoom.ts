
import {type Clip,type EditorProject,type Transform} from './model';
export interface ZoomMotion {
 sourceStart:number; sourceEnd:number;
 fromScale:number; toScale:number;
 easing:'linear'|'smooth'; returnToStart:boolean;
 focusX:number; focusY:number;
}
const finite=(n:number)=>Number.isFinite(n);
export function validateZoom(value:ZoomMotion):ZoomMotion{
 const z=value;
 if(!z||![z.sourceStart,z.sourceEnd,z.fromScale,z.toScale,z.focusX,z.focusY].every(finite)||z.sourceStart<0||z.sourceEnd<=z.sourceStart||z.fromScale<1||z.fromScale>2||z.toScale<1||z.toScale>2||Math.abs(z.focusX)>.4||Math.abs(z.focusY)>.4||!['linear','smooth'].includes(z.easing)||typeof z.returnToStart!=='boolean')throw Error('Invalid zoom motion. Use scales from 1× to 2× and an interval inside the footage.');
 return {...z};
}
/** Source-clock motion survives split, trim, ripple cut, move, and speed changes. */
export function zoomTransform(clip:Clip,time:number):Transform{
 const clock=clip.sourceStart+Math.max(0,time-clip.startTime)*clip.speed;
 const z=clip.zooms?.filter(z=>clock>=z.sourceStart).sort((a,b)=>a.sourceStart-b.sourceStart).at(-1);
 if(!z)return clip.transform;
 const t=Math.max(0,Math.min(1,(clock-z.sourceStart)/(z.sourceEnd-z.sourceStart)));
 const progress=z.returnToStart?(t<=.5?t*2:(1-t)*2):t;
 const eased=z.easing==='smooth'?progress*progress*(3-2*progress):progress;
 const multiplier=z.fromScale+(z.toScale-z.fromScale)*eased;
 return {...clip.transform,scale:clip.transform.scale*multiplier,x:clip.transform.x+z.focusX*(1-multiplier),y:clip.transform.y+z.focusY*(1-multiplier)};
}
export function addZoom(p:EditorProject,id:string,startTime:number,endTime:number,fromScale=1,toScale=1.15,returnToStart=false,easing:ZoomMotion['easing']='smooth',focusX=0,focusY=0):EditorProject{
 const c=p.clips[id],track=c&&p.tracks[c.trackId],asset=c?.assetId?p.assets[c.assetId]:undefined;
 if(!c||!track||track.locked||!asset||asset.kind==='audio')throw Error('Choose unlocked video or image footage for zooms.');
 const frame=1/p.settings.fps;
 if(!finite(startTime)||!finite(endTime)||startTime<c.startTime-1e-6||endTime>c.startTime+c.duration+1e-6||endTime-startTime<frame)throw Error('Keep the zoom interval inside its clip, at least one frame long.');
 const zoom=validateZoom({sourceStart:c.sourceStart+(startTime-c.startTime)*c.speed,sourceEnd:c.sourceStart+(endTime-c.startTime)*c.speed,fromScale,toScale,easing,returnToStart,focusX,focusY});
 if((c.zooms?.length||0)>=12)throw Error('Use at most 12 zooms per clip.');
 if(c.zooms?.some(z=>zoom.sourceStart<z.sourceEnd-1e-6&&zoom.sourceEnd>z.sourceStart+1e-6))throw Error('Zoom intervals cannot overlap. Clear or adjust the existing zoom first.');
 return {...p,clips:{...p.clips,[id]:{...c,zooms:[...(c.zooms||[]),zoom].sort((a,b)=>a.sourceStart-b.sourceStart)}}};
}
export function clearZooms(p:EditorProject,id:string):EditorProject{
 const c=p.clips[id];if(!c||p.tracks[c.trackId].locked)throw Error('Choose unlocked footage to clear zooms.');
 return {...p,clips:{...p.clips,[id]:{...c,zooms:undefined}}};
}
