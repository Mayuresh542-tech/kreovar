import {addText,addClip} from './operations';
import {applyMotionPreset,type MotionPreset} from './keyframes';
import {type EditorProject,dimensions} from './model';
export const GRAPHIC_KINDS=['label','lower-third','stat','callout'] as const;
export type GraphicKind=typeof GRAPHIC_KINDS[number];
export interface MotionGraphic {kind:GraphicKind;accent:string;panel:string}
export function readMotionGraphic(value:unknown):MotionGraphic{const g=value as MotionGraphic;if(!g||!GRAPHIC_KINDS.includes(g.kind)||!/^#[\da-f]{6}$/i.test(g.accent)||!/^#[\da-f]{6}([\da-f]{2})?$/i.test(g.panel))throw Error('Invalid motion graphic.');return {kind:g.kind,accent:g.accent,panel:g.panel};}
export function addMotionGraphic(p:EditorProject,kind:GraphicKind,text:string,startTime:number,duration:number,accent='#c8ff00',motion:MotionPreset='slide-up'){
 readMotionGraphic({kind,accent,panel:'#111827e8'});
 if(!text.trim()||text.length>120||!Number.isFinite(startTime)||startTime<0||!Number.isFinite(duration)||duration<.5||duration>12||startTime+duration>60)throw Error('Keep graphics short and inside the 60-second edit.');
 const [width,height]=dimensions[p.settings.aspectRatio],size=Math.round(Math.min(width,height)*(kind==='stat'?.085:.047));
 const track=p.trackOrder.map(id=>p.tracks[id]).find(t=>t.kind==='text'&&!t.hidden&&!t.locked);if(!track)throw Error('Add or unlock a visible text track for graphics.');
 const next=addText(p,text,startTime,{font:'Inter',size,weight:kind==='stat'?800:600,color:'#ffffff',background:'transparent',maxWidth:kind==='lower-third'?.65:.58},false,duration,track.id),id=Object.keys(next.clips).find(id=>!p.clips[id])!,c=next.clips[id];
 if(Object.values(p.clips).some(old=>old.trackId===c.trackId&&old.startTime<startTime+duration&&old.startTime+old.duration>startTime))throw Error('The text track is occupied at this graphic time.');
 const positioned:EditorProject={...next,clips:{...next.clips,[id]:{...c,graphic:{kind,accent,panel:'#111827e8'},transform:{...c.transform,y:kind==='lower-third'?.23:-.28}}}};
 return applyMotionPreset(positioned,id,motion);
}
export function addAnimatedOverlay(p:EditorProject,assetId:string,trackId:string,startTime:number,duration:number,motion:MotionPreset='pop'){
 const asset=p.assets[assetId],track=p.tracks[trackId];
 if(!asset||asset.kind!=='image'||!track||!['overlay','image'].includes(track.kind)||track.hidden||track.locked)throw Error('Choose an image and a visible unlocked image/overlay track.');
 if(!Number.isFinite(startTime)||startTime<0||!Number.isFinite(duration)||duration<.5||duration>12||startTime+duration>60)throw Error('Keep image overlays inside the 60-second edit.');
 if(track.clipIds.some(id=>{const c=p.clips[id];return c.startTime<startTime+duration&&c.startTime+c.duration>startTime;}))throw Error('The overlay track is occupied at this time.');
 const next=addClip(p,assetId,trackId,startTime,{duration,sourceEnd:duration,transform:{x:.25,y:-.06,scale:.32,rotation:0,opacity:1},volume:0}),id=Object.keys(next.clips).find(id=>!p.clips[id])!;
 return applyMotionPreset(next,id,motion);
}
/** Original code-drawn shapes; no external artwork, bitmap templates or remote assets. */
export function drawGraphicPanel(ctx:CanvasRenderingContext2D,g:MotionGraphic,width:number,height:number,time:number){
 const pad=Math.max(12,height*.16),x=-width/2-pad,y=-height/2-pad,w=width+pad*2,h=height+pad*2;
 ctx.save();ctx.fillStyle=g.panel;ctx.beginPath();ctx.roundRect(x,y,w,h,Math.min(20,h*.16));ctx.fill();ctx.fillStyle=g.accent;
 if(g.kind==='lower-third'){ctx.fillRect(x,y,Math.max(5,pad*.3),h);ctx.fillRect(x,y+h-3,w,3);}
 else if(g.kind==='stat'){ctx.fillRect(x+pad,y+h-6,Math.max(2,(w-pad*2)*Math.min(1,Math.max(0,time)/.7)),5);}
 else if(g.kind==='callout'){ctx.beginPath();ctx.moveTo(x+w*.15,y+h);ctx.lineTo(x+w*.15+pad,y+h+pad);ctx.lineTo(x+w*.15+pad*1.6,y+h);ctx.fill();}
 else ctx.fillRect(x+pad,y+5,Math.min(w-pad*2,48),4);
 ctx.restore();return {width:w,height:h};
}
