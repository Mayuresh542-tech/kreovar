import type {Clip,EditorProject} from './model';

export interface MediaCard {width:number;height?:number;radius?:number;shadow?:number;fit?:'cover'|'contain';background?:string}
export interface VisualEffect {blur?:number;scale?:number;opacity?:number}
export interface VisualEffectRange extends VisualEffect {sourceStart:number;sourceEnd:number;rampIn?:number;rampOut?:number}
export interface VisualEdge extends VisualEffect {sourceDuration:number}
/** Source-clock effects and media framing; independent of any particular style or edit timing. */
export interface VisualTreatment {card?:MediaCard;effects?:VisualEffectRange[];entrance?:VisualEdge;exit?:VisualEdge}
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const smooth=(v:number)=>{const p=clamp(v,0,1);return p*p*(3-2*p);};
function record(value:unknown){if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid visual treatment.');return value as Record<string,unknown>;}
function number(value:unknown,min:number,max:number){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error('Visual treatment number is outside its supported range.');return value;}
function effect(value:Record<string,unknown>):VisualEffect{return {...(value.blur===undefined?{}:{blur:number(value.blur,0,24)}),...(value.scale===undefined?{}:{scale:number(value.scale,.8,1.25)}),...(value.opacity===undefined?{}:{opacity:number(value.opacity,0,1)})};}
function edge(value:unknown):VisualEdge{const e=record(value);return {sourceDuration:number(e.sourceDuration,.05,3),...effect(e)};}
export function readVisualTreatment(value:unknown):VisualTreatment{
 const raw=record(value),result:VisualTreatment={};
 if(raw.card!==undefined){const c=record(raw.card);if(c.fit!==undefined&&!['cover','contain'].includes(String(c.fit)))throw Error('Unsupported media-card fit.');if(c.background!==undefined&&(typeof c.background!=='string'||!/^#[0-9a-f]{6}$/i.test(c.background)))throw Error('Media-card backgrounds require a six-digit hex color.');result.card={width:number(c.width,.15,1),...(c.height===undefined?{}:{height:number(c.height,.1,1)}),...(c.radius===undefined?{}:{radius:number(c.radius,0,80)}),...(c.shadow===undefined?{}:{shadow:number(c.shadow,0,80)}),...(c.fit===undefined?{}:{fit:c.fit as 'cover'|'contain'}),...(c.background===undefined?{}:{background:c.background as string})};}
 if(raw.effects!==undefined){if(!Array.isArray(raw.effects)||raw.effects.length>12)throw Error('Use at most twelve visual-effect ranges.');result.effects=raw.effects.map(value=>{const e=record(value),sourceStart=number(e.sourceStart,0,86400),sourceEnd=number(e.sourceEnd,0,86400);if(sourceEnd<=sourceStart)throw Error('Visual effects need a positive source interval.');const rampIn=e.rampIn===undefined?undefined:number(e.rampIn,0,Math.min(3,sourceEnd-sourceStart)),rampOut=e.rampOut===undefined?undefined:number(e.rampOut,0,Math.min(3,sourceEnd-sourceStart));if((rampIn||0)+(rampOut||0)>sourceEnd-sourceStart+1e-6)throw Error('Visual effect ramps cannot exceed their source interval.');return {sourceStart,sourceEnd,...(rampIn===undefined?{}:{rampIn}),...(rampOut===undefined?{}:{rampOut}),...effect(e)};}).sort((a,b)=>a.sourceStart-b.sourceStart);if(result.effects.some((e,i)=>i>0&&e.sourceStart<result.effects![i-1].sourceEnd))throw Error('Visual-effect ranges may not overlap.');}
 if(raw.entrance!==undefined)result.entrance=edge(raw.entrance);if(raw.exit!==undefined)result.exit=edge(raw.exit);
 if(!Object.keys(result).length)throw Error('Specify card framing or at least one visual effect.');return result;
}
export function visualTreatmentAt(clip:Pick<Clip,'sourceStart'|'sourceEnd'|'startTime'|'speed'|'visualTreatment'>,timelineTime:number){
 const treatment=clip.visualTreatment,clock=clip.sourceStart+Math.max(0,timelineTime-clip.startTime)*clip.speed;let blur=0,scale=1,opacity=1;
 const blend=(e:VisualEffect,amount:number)=>{blur=Math.max(blur,(e.blur||0)*amount);scale*=1+((e.scale??1)-1)*amount;opacity*=1+((e.opacity??1)-1)*amount;};
 for(const range of treatment?.effects||[]){if(clock<range.sourceStart||clock>=range.sourceEnd)continue;const incoming=range.rampIn?smooth((clock-range.sourceStart)/range.rampIn):1,outgoing=range.rampOut?smooth((range.sourceEnd-clock)/range.rampOut):1;blend(range,Math.min(incoming,outgoing));}
 if(treatment?.entrance)blend(treatment.entrance,1-smooth((clock-clip.sourceStart)/treatment.entrance.sourceDuration));
 if(treatment?.exit)blend(treatment.exit,1-smooth((clip.sourceEnd-clock)/treatment.exit.sourceDuration));
 return {blur:clamp(blur,0,24),scale:clamp(scale,.5,2),opacity:clamp(opacity,0,1)};
}
function rounded(ctx:CanvasRenderingContext2D,x:number,y:number,width:number,height:number,radius:number){ctx.beginPath();ctx.roundRect(x,y,width,height,Math.min(radius,width/2,height/2));}
/** Draws the real source media. The same canvas operation runs for preview and offline export. */
export function drawVisualMedia(ctx:CanvasRenderingContext2D,image:CanvasImageSource,sourceWidth:number,sourceHeight:number,width:number,height:number,treatment?:VisualTreatment){
 const card=treatment?.card;
 if(!card){const ratio=Math.min(width/sourceWidth,height/sourceHeight),w=sourceWidth*ratio,h=sourceHeight*ratio;ctx.drawImage(image,-w/2,-h/2,w,h);return {width:w,height:h};}
 const w=width*card.width,h=card.height?height*card.height:Math.min(height*.85,w*sourceHeight/sourceWidth),unit=Math.min(width,height)/720,radius=(card.radius??12)*unit,shadow=(card.shadow??0)*unit;
 ctx.save();ctx.fillStyle=card.background||'#10151b';ctx.shadowColor='rgba(0,0,0,.4)';ctx.shadowBlur=shadow;ctx.shadowOffsetY=shadow*.3;rounded(ctx,-w/2,-h/2,w,h,radius);ctx.fill();ctx.restore();
 ctx.save();rounded(ctx,-w/2,-h/2,w,h,radius);ctx.clip();ctx.fillStyle=card.background||'#10151b';ctx.fillRect(-w/2,-h/2,w,h);const ratio=(card.fit||'cover')==='cover'?Math.max(w/sourceWidth,h/sourceHeight):Math.min(w/sourceWidth,h/sourceHeight),drawWidth=sourceWidth*ratio,drawHeight=sourceHeight*ratio;ctx.drawImage(image,-drawWidth/2,-drawHeight/2,drawWidth,drawHeight);ctx.restore();return {width:w,height:h};
}

/** A validated operation shared by AI planning and preparation; never mutates source media. */
export function setVisualTreatment(p:EditorProject,id:string,value:unknown):EditorProject{
 const c=p.clips[id],track=c&&p.tracks[c.trackId];if(!c||!track||track.locked||!c.assetId||!['video','image'].includes(p.assets[c.assetId]?.kind))throw Error('Select an unlocked video or image clip.');
 const visualTreatment=readVisualTreatment(value);
 if(visualTreatment.effects?.some(e=>e.sourceStart<c.sourceStart-1e-6||e.sourceEnd>c.sourceEnd+1e-6))throw Error('Visual effects must fit inside the clip source interval.');
 if([visualTreatment.entrance,visualTreatment.exit].some(e=>e&&e.sourceDuration>c.sourceEnd-c.sourceStart+1e-6))throw Error('Visual entrance or exit is longer than its clip.');
 return {...p,clips:{...p.clips,[id]:{...c,visualTreatment}}};
}
