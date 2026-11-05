/** Native bounded clipping geometry. All points are local media fractions, never SVG or executable code. */
export interface MaskPoint {x:number;y:number}
export interface MaskKeyframe {sourceTime:number;progress:number;easing?:'linear'|'smooth'}
export interface VisualMask {
 kind:'circle'|'rounded-rect'|'polygon'|'stepped'|'torn-paper';
 progress?:number;keyframes?:MaskKeyframe[];direction?:'left'|'right'|'up'|'down';
 radius?:number;points?:MaskPoint[];steps?:number;seed?:number;roughness?:number;
}
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
function object(value:unknown){if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid clipping mask.');return value as Record<string,unknown>;}
function number(value:unknown,min:number,max:number){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error('Clipping mask value is outside its supported range.');return value;}
function fields(raw:Record<string,unknown>,allowed:string[]){if(Object.keys(raw).some(k=>!allowed.includes(k)))throw Error('Unsupported clipping mask field.');}
const cross=(a:MaskPoint,b:MaskPoint,c:MaskPoint)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function validatePolygon(points:MaskPoint[]){
 let area=0;
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length];
  if(Math.hypot(a.x-b.x,a.y-b.y)<1e-6)throw Error('Polygon vertices must be distinct.');
  area+=a.x*b.y-b.x*a.y;
  for(let j=i+1;j<points.length;j++){
   if(j===i+1||i===0&&j===points.length-1)continue;
   const c=points[j],d=points[(j+1)%points.length];
   const intersects=cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0&&Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))&&Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y))<=Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y));
   if(intersects)throw Error('Polygon edges must not intersect.');
  }
 }
 if(Math.abs(area)<.0001)throw Error('A clipping polygon needs a visible area.');
}
export function readVisualMask(value:unknown):VisualMask {
 const raw=object(value),kind=raw.kind;
 if(!['circle','rounded-rect','polygon','stepped','torn-paper'].includes(String(kind)))throw Error('Unsupported clipping mask kind.');
 const extra=kind==='rounded-rect'?['radius']:kind==='polygon'?['points']:kind==='stepped'?['steps']:kind==='torn-paper'?['seed','roughness']:[];
 fields(raw,['kind','progress','keyframes','direction',...extra]);
 const mask:VisualMask={kind:kind as VisualMask['kind']};
 if(raw.progress!==undefined)mask.progress=number(raw.progress,0,1);
 if(raw.direction!==undefined){if(!['left','right','up','down'].includes(String(raw.direction)))throw Error('Unsupported mask reveal direction.');mask.direction=raw.direction as VisualMask['direction'];}
 if(raw.radius!==undefined)mask.radius=number(raw.radius,0,.5);
 if(raw.steps!==undefined){mask.steps=number(raw.steps,2,16);if(!Number.isInteger(mask.steps))throw Error('Mask steps must be an integer.');}
 if(raw.seed!==undefined){mask.seed=number(raw.seed,0,4294967295);if(!Number.isInteger(mask.seed))throw Error('Mask seed must be an integer.');}
 if(raw.roughness!==undefined)mask.roughness=number(raw.roughness,0,.15);
 if(kind==='polygon'){
  if(!Array.isArray(raw.points)||raw.points.length<3||raw.points.length>24)throw Error('Use three to twenty-four polygon vertices.');
  mask.points=raw.points.map(value=>{const p=object(value);fields(p,['x','y']);return {x:number(p.x,0,1),y:number(p.y,0,1)};});validatePolygon(mask.points);
 }
 if(raw.keyframes!==undefined){
  if(!Array.isArray(raw.keyframes)||!raw.keyframes.length||raw.keyframes.length>48)throw Error('Use one to forty-eight mask keyframes.');
  mask.keyframes=raw.keyframes.map(value=>{const f=object(value);fields(f,['sourceTime','progress','easing']);if(f.easing!==undefined&&!['linear','smooth'].includes(String(f.easing)))throw Error('Unsupported mask easing.');return {sourceTime:number(f.sourceTime,0,86400),progress:number(f.progress,0,1),...(f.easing===undefined?{}:{easing:f.easing as 'linear'|'smooth'})};}).sort((a,b)=>a.sourceTime-b.sourceTime);
  if(mask.keyframes.some((f,i)=>i>0&&f.sourceTime-mask.keyframes![i-1].sourceTime<1e-7))throw Error('Mask keyframe times must be unique.');
 }
 return mask;
}
/** Source clock survives clip moves, trims, splits and playback-speed changes. Before the first keyframe its value holds. */
export function maskProgressAt(mask:VisualMask,sourceTime:number){
 const frames=mask.keyframes;if(!frames?.length)return mask.progress??1;
 const before=frames.filter(f=>f.sourceTime<=sourceTime).at(-1),after=frames.find(f=>f.sourceTime>sourceTime);
 if(!before)return frames[0].progress;if(!after)return before.progress;
 const p=clamp((sourceTime-before.sourceTime)/(after.sourceTime-before.sourceTime)),q=after.easing==='smooth'?p*p*(3-2*p):p;
 return clamp(before.progress+(after.progress-before.progress)*q);
}
function random(seed:number){let state=seed>>>0;return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
/** Direction identifies the entering edge: left/right/top(up)/bottom(down). Endpoints are exactly empty/full. */
export function maskRevealPolygon(mask:VisualMask,progress:number):MaskPoint[]{
 const p=clamp(progress);if(p===1)return [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
 if(p===0)return [{x:0,y:0},{x:0,y:0},{x:0,y:0}];
 const edge:MaskPoint[]=[];
 if(mask.kind==='stepped'){
  const steps=mask.steps??6;
  for(let i=0;i<steps;i++){const x=clamp(p*1.35-.35*i/(steps-1));edge.push({x,y:i/steps},{x,y:(i+1)/steps});}
 }else if(mask.kind==='torn-paper'){
  const next=random(mask.seed??1),roughness=mask.roughness??.06,envelope=Math.sin(p*Math.PI);
  for(let i=0;i<=32;i++){const y=i/32;edge.push({x:clamp(p+((next()*2-1)*roughness+(y-.5)*.45)*envelope),y});}
 }else edge.push({x:p,y:0},{x:p,y:1});
 const polygon=[{x:0,y:0},...edge,{x:0,y:1}];
 return polygon.map(({x,y})=>mask.direction==='right'?{x:1-x,y}:mask.direction==='up'?{x:y,y:x}:mask.direction==='down'?{x:y,y:1-x}:{x,y});
}
function polygon(ctx:CanvasRenderingContext2D,points:MaskPoint[],width:number,height:number){ctx.beginPath();points.forEach((p,i)=>{const x=(p.x-.5)*width,y=(p.y-.5)*height;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.closePath();}
/** Clips the real media/card and its accents; callers own save/restore. */
export function applyVisualMask(ctx:CanvasRenderingContext2D,mask:VisualMask,width:number,height:number,sourceTime:number){
 const progress=maskProgressAt(mask,sourceTime);
 if(mask.kind==='circle'){ctx.beginPath();ctx.arc(0,0,Math.min(width,height)*.5*progress,0,Math.PI*2);ctx.clip();return;}
 if(mask.kind==='polygon'){polygon(ctx,mask.points!,width,height);ctx.clip();}
 if(mask.kind==='rounded-rect'){ctx.beginPath();ctx.roundRect(-width/2,-height/2,width,height,Math.min(width,height)*(mask.radius??.15));ctx.clip();}
 if(progress<1||mask.kind==='stepped'||mask.kind==='torn-paper'){polygon(ctx,maskRevealPolygon(mask,progress),width,height);ctx.clip();}
}
