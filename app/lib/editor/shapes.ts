import {type EditorProject,type Clip,type Transform,defaultTransform,uid,dimensions} from './model';
import {addTrack} from './operations';
import {readStrokePath,drawStrokePath,type StrokePathStyle,type StrokeDrawContext} from './strokePath';
export const SHAPE_KINDS=['rectangle','ellipse','triangle','arrow','line','star'] as const;
export type ShapeKind=typeof SHAPE_KINDS[number];
export interface ShapeStyle {kind:ShapeKind;width:number;height:number;fill:string;stroke:string;strokeWidth:number;radius:number;shadow:number;outlineOnly?:boolean;glow?:number;strokePath?:StrokePathStyle}
export const defaultShape:ShapeStyle={kind:'rectangle',width:.32,height:.2,fill:'#5b63f6',stroke:'#ffffff',strokeWidth:0,radius:.15,shadow:0};
export function readShape(value:unknown):ShapeStyle{
 const s=value as ShapeStyle;
 if(!s||!SHAPE_KINDS.includes(s.kind)||!Number.isFinite(s.width)||s.width<.01||s.width>2||!Number.isFinite(s.height)||s.height<.005||s.height>2||!/^#[\da-f]{6}$/i.test(s.fill)||!/^#[\da-f]{6}$/i.test(s.stroke)||!Number.isFinite(s.strokeWidth)||s.strokeWidth<0||s.strokeWidth>40||!Number.isFinite(s.radius)||s.radius<0||s.radius>.5||!Number.isFinite(s.shadow)||s.shadow<0||s.shadow>80)throw Error('Choose a valid shape size, colour and outline.');
 if(s.outlineOnly!==undefined&&typeof s.outlineOnly!=='boolean'||s.glow!==undefined&&(!Number.isFinite(s.glow)||s.glow<0||s.glow>80))throw Error('Choose a valid shape outline and stroke glow.');
 const strokePath=s.strokePath===undefined?undefined:readStrokePath(s.strokePath);
 return {...(strokePath?{strokePath,outlineOnly:s.outlineOnly??true}:s.outlineOnly===undefined?{}:{outlineOnly:s.outlineOnly}),...(s.glow===undefined?{}:{glow:s.glow}),kind:s.kind,width:s.width,height:s.height,fill:s.fill,stroke:s.stroke,strokeWidth:s.strokeWidth,radius:s.radius,shadow:s.shadow};
}
/** Pure native shape operation; no bitmap assets, uploads or remote requests. */
export function addShape(p:EditorProject,kind:ShapeKind,startTime:number,duration=3,patch:Partial<ShapeStyle>={},pose:Partial<Transform>={}):EditorProject{
 if(!Number.isFinite(startTime)||startTime<0||!Number.isFinite(duration)||duration<1/p.settings.fps||startTime+duration>60)throw Error('Keep shapes inside the 60-second edit.');
 const transform={...defaultTransform,...pose};if(Object.values(transform).some(n=>!Number.isFinite(n))||Math.abs(transform.x)>2||Math.abs(transform.y)>2||transform.scale<.05||transform.scale>10||Math.abs(transform.rotation)>3600||transform.opacity<0||transform.opacity>1)throw Error('Invalid shape transform.');
 const shape=readShape({...defaultShape,...(kind==='line'?{height:.015,strokeWidth:6}:{}),...patch,kind});
 const isShapeTrack=(id:string)=>{const t=p.tracks[id];return t.kind==='overlay'&&(t.name==='Shapes'||t.clipIds.length>0)&&t.clipIds.every(clipId=>!!p.clips[clipId]?.shape);};
 // Dedicated shape layers sit above media in the timeline without moving existing tracks.
 const lastMedia=p.trackOrder.reduce((last,id,index)=>['video','image','overlay'].includes(p.tracks[id].kind)&&!isShapeTrack(id)?index:last,-1);
 let next=p,track=p.trackOrder.map(id=>p.tracks[id]).find(t=>isShapeTrack(t.id)&&p.trackOrder.indexOf(t.id)>lastMedia&&!t.hidden&&!t.locked&&!t.clipIds.some(id=>{const c=p.clips[id];return c.startTime<startTime+duration&&c.startTime+c.duration>startTime;}));
 if(!track){next=addTrack(p,'overlay');track=next.tracks[next.trackOrder.at(-1)!];const trackOrder=next.trackOrder.filter(id=>id!==track!.id);trackOrder.splice(lastMedia+1,0,track.id);next={...next,trackOrder,tracks:{...next.tracks,[track.id]:{...track,name:'Shapes'}}};track=next.tracks[track.id];}
 const id=uid(),clip:Clip={id,trackId:track.id,name:kind[0].toUpperCase()+kind.slice(1),startTime,duration,sourceStart:0,sourceEnd:duration,transform,shape,volume:0,speed:1,fadeIn:0,fadeOut:0,effects:{brightness:0,contrast:0,saturation:0,blur:0}};
 return {...next,clips:{...next.clips,[id]:clip},tracks:{...next.tracks,[track.id]:{...track,clipIds:[...track.clipIds,id]}}};
}
export function changeShape(p:EditorProject,id:string,patch:Partial<ShapeStyle>):EditorProject{const c=p.clips[id];if(!c?.shape||p.tracks[c.trackId].locked)throw Error('Select an unlocked shape.');return {...p,clips:{...p.clips,[id]:{...c,shape:readShape({...c.shape,...patch})}}};}
export function shapeDimensions(shape:ShapeStyle,ratio:EditorProject['settings']['aspectRatio']){const [w,h]=dimensions[ratio];return {width:w*shape.width,height:h*shape.height};}
export function drawShape(ctx:CanvasRenderingContext2D,s:ShapeStyle,width:number,height:number,context?:StrokeDrawContext){
 const x=-width/2,y=-height/2;ctx.save();ctx.fillStyle=s.fill;ctx.strokeStyle=s.stroke;ctx.lineWidth=s.strokeWidth;ctx.lineJoin='round';ctx.lineCap='round';ctx.shadowColor='#00000066';ctx.shadowBlur=s.shadow;ctx.shadowOffsetY=s.shadow*.2;if(s.glow){ctx.shadowColor=s.stroke;ctx.shadowBlur=s.glow;ctx.shadowOffsetY=0;}
 if(s.strokePath){try{drawStrokePath(ctx,s.strokePath,width,height,context,!s.outlineOnly,s.strokeWidth>0);}finally{ctx.restore();}return;}ctx.beginPath();
 if(s.kind==='rectangle')ctx.roundRect(x,y,width,height,Math.min(width,height)*s.radius);
 else if(s.kind==='ellipse')ctx.ellipse(0,0,width/2,height/2,0,0,Math.PI*2);
 else if(s.kind==='line'){ctx.moveTo(x,0);ctx.lineTo(-x,0);ctx.strokeStyle=s.fill;ctx.lineWidth=Math.max(1,s.strokeWidth);ctx.stroke();ctx.restore();return;}
 else if(s.kind==='triangle'){ctx.moveTo(0,y);ctx.lineTo(-x,-y);ctx.lineTo(x,-y);ctx.closePath();}
 else if(s.kind==='arrow'){ctx.moveTo(x,y*.35);ctx.lineTo(width*.1,y*.35);ctx.lineTo(width*.1,y);ctx.lineTo(-x,0);ctx.lineTo(width*.1,-y);ctx.lineTo(width*.1,-y*.35);ctx.lineTo(x,-y*.35);ctx.closePath();}
 else {for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?.45:1,px=Math.cos(a)*width/2*r,py=Math.sin(a)*height/2*r;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}ctx.closePath();}
 if(!s.outlineOnly)ctx.fill();if(s.strokeWidth)ctx.stroke();ctx.restore();
}
