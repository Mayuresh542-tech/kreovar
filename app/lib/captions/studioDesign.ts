export const CAPTION_IN_OUT=['none','fade','pop','zoom','scale','slide-up','slide-down','slide-left','slide-right','rise-up','rise-down','blur-rise','hook-left','hook-right','punch','slam','wobble','drop','bounce','spin-in','typewriter','type-on','expand','flicker','glitch','soft-focus'] as const;
export const CAPTION_LOOPS=['none','float','pulse','sway','drift','wave','jitter','shake','rainbow','font-shuffle'] as const;
export type CaptionTransition=typeof CAPTION_IN_OUT[number];
export type CaptionLoop=typeof CAPTION_LOOPS[number];
export interface StudioGradient {from:string;to:string;angle:number;stops?:{offset:number;color:string}[]}
export interface CaptionStudioDesign {
 italic?:boolean;emphasisItalic?:boolean;
 layout?:'inline'|'stacked'|'hero'|'split'|'dynamic';positionXPercent?:number;
 rowSplit?:number;heroPlacement?:'banner'|'triptych';
 edgeFont?:string;edgeScale?:number;edgeItalic?:boolean;
 rowOffset?:number;rowRotation?:number;rowMargins?:number[];
 emphasisLetterSpacing?:number;scaleX?:number;glowTarget?:'all'|'emphasis';underlineColor?:string;
 emphasisFont?:string;emphasisWeight?:number;emphasisScale?:number;emphasisCase?:'none'|'uppercase'|'lowercase'|'capitalize';
 emphasisSelection?:'none'|'first'|'last'|'middle'|'middle-pair'|'second-row'|'alternating';spotlight?:boolean;
 gradient?:StudioGradient|null;emphasisGradient?:StudioGradient|null;
 underline?:boolean;emphasisUnderline?:boolean;lowercase?:boolean;spread?:boolean;arc?:number;
 depth?:number;depthAngle?:number;depthColor?:string;depthTarget?:'all'|'emphasis';glow?:number;glowColor?:string;
 letterBoxes?:boolean;letterBoxColor?:string;backgroundRadius?:number;
 entrance?:CaptionTransition;exit?:CaptionTransition;hold?:CaptionLoop;transitionDuration?:number;
 transitionTarget?:'all'|'emphasis';
}
export function captionMotion(kind:CaptionTransition,progress:number,index=0){
 const p=Math.max(0,Math.min(1,progress)),ease=1-Math.pow(1-p,3),n=1-ease;
 let x=0,y=0,scale=1,rotation=0,alpha=1,blur=0,reveal=1;
 switch(kind){
 case 'fade':alpha=p;break;
 case 'pop':scale=p===1?1:Math.max(.05,ease+.2*Math.sin(p*Math.PI));alpha=Math.min(1,p*4);break;
 case 'zoom':scale=1+n*.6;alpha=p;break;
 case 'scale':scale=.2+ease*.8;alpha=p;break;
 case 'slide-up':case 'rise-up':y=n*(kind==='rise-up'?1.2:.6);alpha=p;break;
 case 'slide-down':case 'rise-down':y=-n*(kind==='rise-down'?1.2:.6);alpha=p;break;
 case 'slide-left':x=n;alpha=p;break;case 'slide-right':x=-n;alpha=p;break;
 case 'blur-rise':y=n*.6;blur=n*12;alpha=p;break;
 case 'hook-left':case 'hook-right':x=n*(kind==='hook-left'?-1:1);rotation=n*(kind==='hook-left'?-25:25);alpha=p;break;
 case 'punch':scale=1+n*.5*Math.sin(p*9);alpha=Math.min(1,p*4);break;
 case 'slam':scale=1+n*1.4;y=-n*.4;alpha=p;break;
 case 'wobble':rotation=Math.sin(p*18)*n*12;alpha=p;break;
 case 'drop':y=-n*1.7;rotation=n*12;alpha=p;break;
 case 'bounce':y=-Math.abs(Math.sin(p*3*Math.PI))*n*.7;alpha=p;break;
 case 'spin-in':rotation=n*-180;scale=.1+ease*.9;alpha=p;break;
 case 'typewriter':case 'type-on':reveal=p;break;
 case 'expand':scale=.4+ease*.6;alpha=p;break;
 case 'flicker':alpha=p===1?1:(Math.floor(p*10)%2?.3:1)*Math.min(1,p*3);break;
 case 'glitch':x=Math.sin((index+1)*19+p*60)*n*.15;alpha=p;break;
 case 'soft-focus':blur=n*16;alpha=p;break;
 }
 return {x,y,scale,rotation,alpha,blur,reveal};
}
export function captionLoop(kind:CaptionLoop,time:number,index=0){
 let x=0,y=0,scale=1,rotation=0;const a=time*Math.PI*2;
 switch(kind){case 'float':y=Math.sin(a*.5)*.1;break;case 'pulse':scale=1+Math.sin(a*.7)*.04;break;case 'sway':rotation=Math.sin(a*.4)*3;break;case 'drift':x=Math.sin(a*.2)*.1;break;case 'wave':y=Math.sin(a+index*.7)*.1;break;case 'jitter':x=Math.sin(Math.floor(time*12)+index*37)*.025;y=Math.cos(Math.floor(time*12)+index*19)*.025;break;case 'shake':rotation=Math.sin(a*5)*2;break;}
 return {x,y,scale,rotation};
}
