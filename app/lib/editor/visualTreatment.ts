import type {Clip,EditorProject} from './model';
import {readVisualMask,applyVisualMask,type VisualMask} from './visualMasks';
import {drawChromaticMedia,type RgbOffset} from './chromatic';

export interface MediaCard {width:number;height?:number;radius?:number;shadow?:number;fit?:'cover'|'contain';background?:string}
export interface VisualEffect {blur?:number;scale?:number;opacity?:number;rgbOffset?:RgbOffset}
export interface VisualEffectRange extends VisualEffect {sourceStart:number;sourceEnd:number;rampIn?:number;rampOut?:number}
/** sourceTime anchors the original entrance start or exit end, so a later trim/split never restarts it. */
export interface VisualEdge extends VisualEffect {sourceDuration:number;sourceTime?:number}
/** Source-clock effects, native clipping and media framing; independent of a style or particular edit timing. */
export interface VisualTreatment {card?:MediaCard;mask?:VisualMask;effects?:VisualEffectRange[];entrance?:VisualEdge;exit?:VisualEdge}
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const smooth=(v:number)=>{const p=clamp(v,0,1);return p*p*(3-2*p);};
function record(value:unknown){if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid visual treatment.');return value as Record<string,unknown>;}
function fields(raw:Record<string,unknown>,allowed:readonly string[]){if(Object.keys(raw).some(k=>!allowed.includes(k)))throw Error('Unsupported visual treatment field.');}
function number(value:unknown,min:number,max:number){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error('Visual treatment number is outside its supported range.');return value;}
const effectFields=['blur','scale','opacity','rgbOffset'];
function effect(value:Record<string,unknown>):VisualEffect {
 const result:VisualEffect={};
 if(value.blur!==undefined)result.blur=number(value.blur,0,24);
 if(value.scale!==undefined)result.scale=number(value.scale,.8,1.25);
 if(value.opacity!==undefined)result.opacity=number(value.opacity,0,1);
 if(value.rgbOffset!==undefined){const offset=record(value.rgbOffset);fields(offset,['x','y']);result.rgbOffset={x:number(offset.x,-24,24),y:number(offset.y,-24,24)};}
 if(!Object.keys(result).length)throw Error('Specify at least one visual-effect property.');
 return result;
}
function edge(value:unknown):VisualEdge {const e=record(value);fields(e,['sourceDuration','sourceTime',...effectFields]);return {sourceDuration:number(e.sourceDuration,.05,3),...(e.sourceTime===undefined?{}:{sourceTime:number(e.sourceTime,0,86400)}),...effect(e)};}
export function readVisualTreatment(value:unknown):VisualTreatment {
 const raw=record(value),result:VisualTreatment={};fields(raw,['card','mask','effects','entrance','exit']);
 if(raw.card!==undefined){
  const c=record(raw.card);fields(c,['width','height','radius','shadow','fit','background']);
  if(c.fit!==undefined&&!['cover','contain'].includes(String(c.fit)))throw Error('Unsupported media-card fit.');
  if(c.background!==undefined&&(typeof c.background!=='string'||!/^#[0-9a-f]{6}$/i.test(c.background)))throw Error('Media-card backgrounds require a six-digit hex color.');
  result.card={width:number(c.width,.15,1),...(c.height===undefined?{}:{height:number(c.height,.1,1)}),...(c.radius===undefined?{}:{radius:number(c.radius,0,80)}),...(c.shadow===undefined?{}:{shadow:number(c.shadow,0,80)}),...(c.fit===undefined?{}:{fit:c.fit as 'cover'|'contain'}),...(c.background===undefined?{}:{background:c.background as string})};
 }
 if(raw.mask!==undefined)result.mask=readVisualMask(raw.mask);
 if(raw.effects!==undefined){
  if(!Array.isArray(raw.effects)||!raw.effects.length||raw.effects.length>12)throw Error('Use one to twelve visual-effect ranges.');
  result.effects=raw.effects.map(value=>{
   const e=record(value);fields(e,['sourceStart','sourceEnd','rampIn','rampOut',...effectFields]);
   const sourceStart=number(e.sourceStart,0,86400),sourceEnd=number(e.sourceEnd,0,86400);if(sourceEnd<=sourceStart)throw Error('Visual effects need a positive source interval.');
   const rampIn=e.rampIn===undefined?undefined:number(e.rampIn,0,Math.min(3,sourceEnd-sourceStart)),rampOut=e.rampOut===undefined?undefined:number(e.rampOut,0,Math.min(3,sourceEnd-sourceStart));
   if((rampIn||0)+(rampOut||0)>sourceEnd-sourceStart+1e-6)throw Error('Visual effect ramps cannot exceed their source interval.');
   return {sourceStart,sourceEnd,...(rampIn===undefined?{}:{rampIn}),...(rampOut===undefined?{}:{rampOut}),...effect(e)};
  }).sort((a,b)=>a.sourceStart-b.sourceStart);
  if(result.effects.some((e,i)=>i>0&&e.sourceStart<result.effects![i-1].sourceEnd))throw Error('Visual-effect ranges may not overlap.');
 }
 if(raw.entrance!==undefined)result.entrance=edge(raw.entrance);if(raw.exit!==undefined)result.exit=edge(raw.exit);
 if(!Object.keys(result).length)throw Error('Specify card framing, clipping or at least one visual effect.');return result;
}
/** Capture legacy implicit edge anchors before the clip source interval changes. Ranges and mask frames remain untouched. */
export function anchorVisualTreatment(clip:Pick<Clip,'sourceStart'|'sourceEnd'|'visualTreatment'>):VisualTreatment|undefined {
 const t=clip.visualTreatment;if(!t)return undefined;
 return {...t,...(t.entrance?{entrance:{...t.entrance,sourceTime:t.entrance.sourceTime??clip.sourceStart}}:{}),...(t.exit?{exit:{...t.exit,sourceTime:t.exit.sourceTime??clip.sourceEnd}}:{})};
}
export function visualTreatmentAt(clip:Pick<Clip,'sourceStart'|'sourceEnd'|'startTime'|'speed'|'visualTreatment'>,timelineTime:number){
 const treatment=clip.visualTreatment,clock=clip.sourceStart+Math.max(0,timelineTime-clip.startTime)*clip.speed;let blur=0,scale=1,opacity=1,rgbX=0,rgbY=0;
 const blend=(e:VisualEffect,amount:number)=>{blur=Math.max(blur,(e.blur||0)*amount);scale*=1+((e.scale??1)-1)*amount;opacity*=1+((e.opacity??1)-1)*amount;rgbX+=(e.rgbOffset?.x||0)*amount;rgbY+=(e.rgbOffset?.y||0)*amount;};
 for(const range of treatment?.effects||[]){if(clock<range.sourceStart||clock>=range.sourceEnd)continue;const incoming=range.rampIn?smooth((clock-range.sourceStart)/range.rampIn):1,outgoing=range.rampOut?smooth((range.sourceEnd-clock)/range.rampOut):1;blend(range,Math.min(incoming,outgoing));}
 if(treatment?.entrance)blend(treatment.entrance,1-smooth((clock-(treatment.entrance.sourceTime??clip.sourceStart))/treatment.entrance.sourceDuration));
 if(treatment?.exit)blend(treatment.exit,1-smooth(((treatment.exit.sourceTime??clip.sourceEnd)-clock)/treatment.exit.sourceDuration));
 return {blur:clamp(blur,0,24),scale:clamp(scale,.5,2),opacity:clamp(opacity,0,1),...(rgbX||rgbY?{rgbOffset:{x:clamp(rgbX,-24,24),y:clamp(rgbY,-24,24)}}:{})};
}
function rounded(ctx:CanvasRenderingContext2D,x:number,y:number,width:number,height:number,radius:number){ctx.beginPath();ctx.roundRect(x,y,width,height,Math.min(radius,width/2,height/2));}
/** Draws actual source media. Preview and offline MP4 export use this same canvas operation and source clock. */
export function drawVisualMedia(ctx:CanvasRenderingContext2D,image:CanvasImageSource,sourceWidth:number,sourceHeight:number,width:number,height:number,treatment?:VisualTreatment,sourceTime=0,rgbOffset?:RgbOffset){
 const card=treatment?.card,unit=Math.min(width,height)/720;
 const draw=(x:number,y:number,w:number,h:number)=>{if(rgbOffset)drawChromaticMedia(ctx,image,x,y,w,h,{x:rgbOffset.x*unit,y:rgbOffset.y*unit});else ctx.drawImage(image,x,y,w,h);};
 if(!card){
  const ratio=Math.min(width/sourceWidth,height/sourceHeight),w=sourceWidth*ratio,h=sourceHeight*ratio;
  if(treatment?.mask){ctx.save();applyVisualMask(ctx,treatment.mask,w,h,sourceTime);draw(-w/2,-h/2,w,h);ctx.restore();}else draw(-w/2,-h/2,w,h);
  return {width:w,height:h};
 }
 const w=width*card.width,h=card.height?height*card.height:Math.min(height*.85,w*sourceHeight/sourceWidth),radius=(card.radius??12)*unit,shadow=(card.shadow??0)*unit;
 if(treatment?.mask){ctx.save();applyVisualMask(ctx,treatment.mask,w,h,sourceTime);}
 ctx.save();ctx.fillStyle=card.background||'#10151b';ctx.shadowColor='rgba(0,0,0,.4)';ctx.shadowBlur=shadow;ctx.shadowOffsetY=shadow*.3;rounded(ctx,-w/2,-h/2,w,h,radius);ctx.fill();ctx.restore();
 ctx.save();rounded(ctx,-w/2,-h/2,w,h,radius);ctx.clip();ctx.fillStyle=card.background||'#10151b';ctx.fillRect(-w/2,-h/2,w,h);
 const ratio=(card.fit||'cover')==='cover'?Math.max(w/sourceWidth,h/sourceHeight):Math.min(w/sourceWidth,h/sourceHeight),drawWidth=sourceWidth*ratio,drawHeight=sourceHeight*ratio;draw(-drawWidth/2,-drawHeight/2,drawWidth,drawHeight);ctx.restore();
 if(treatment?.mask)ctx.restore();return {width:w,height:h};
}

/** Source-authored curves may extend beyond a trimmed/split visible interval, but never beyond the original video. */
export function setVisualTreatment(p:EditorProject,id:string,value:unknown):EditorProject {
 const c=p.clips[id],track=c&&p.tracks[c.trackId];if(!c||!track||track.locked||!c.assetId||!['video','image'].includes(p.assets[c.assetId]?.kind))throw Error('Select an unlocked video or image clip.');
 const asset=p.assets[c.assetId],parsed=readVisualTreatment(value),maxSource=asset.kind==='video'?asset.duration:86400;
 if(parsed.effects?.some(e=>e.sourceEnd>maxSource+1e-6))throw Error('Visual effects must fit inside the original media source interval.');
 if(parsed.mask?.keyframes?.some(f=>f.sourceTime>maxSource+1e-6))throw Error('Mask keyframes must fit inside the original media source interval.');
 for(const [name,e] of [['entrance',parsed.entrance],['exit',parsed.exit]] as const){
  if(!e)continue;
  if(e.sourceTime===undefined&&e.sourceDuration>c.sourceEnd-c.sourceStart+1e-6)throw Error('Visual entrance or exit is longer than its clip.');
  const anchor=e.sourceTime??(name==='entrance'?c.sourceStart:c.sourceEnd),start=name==='entrance'?anchor:anchor-e.sourceDuration,end=name==='entrance'?anchor+e.sourceDuration:anchor;
  if(start< -1e-6||end>maxSource+1e-6)throw Error('Visual entrance or exit must fit inside the original media source interval.');
 }
 const visualTreatment=anchorVisualTreatment({...c,visualTreatment:parsed});
 return {...p,clips:{...p.clips,[id]:{...c,visualTreatment}}};
}

/** New inserts begin at source zero; retained/trimmed clips use original source bounds instead. */
export function assertInsertedVisualTreatment(treatment:VisualTreatment|undefined,duration:number){
 if(!treatment)return;
 const fail=()=>{throw Error('Inserted-media animation must stay inside its source duration.');};
 if(!Number.isFinite(duration)||duration<=0)fail();
 if(treatment.effects?.some(e=>e.sourceEnd>duration+1e-7)||treatment.mask?.keyframes?.some(f=>f.sourceTime>duration+1e-7))fail();
 for(const [kind,edge] of [['entrance',treatment.entrance],['exit',treatment.exit]] as const){
  if(!edge)continue;const anchor=edge.sourceTime??(kind==='entrance'?0:duration),start=kind==='entrance'?anchor:anchor-edge.sourceDuration,end=kind==='entrance'?anchor+edge.sourceDuration:anchor;
  if(start< -1e-7||end>duration+1e-7)fail();
 }
}
