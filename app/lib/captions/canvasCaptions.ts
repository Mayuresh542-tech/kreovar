import {drawStudioCaption,resolveCaptionStyle} from './studioCanvas';
import {wordHighlight,distinctHighlight} from "./highlighting";
import {captionFontFamily,textDirection} from "./languages";
import {wordTypography} from "./typography";
import type {CaptionSegment} from "./presets";
import {type CaptionStyleConfig} from "./templates";
/** Shared by the on-video preview and fixed-frame export. All coordinates scale from a 720px short edge. */
export function drawCaptions(ctx:CanvasRenderingContext2D,segments:CaptionSegment[],style:CaptionStyleConfig,time:number,width:number,height:number){
 const segment=segments.find(s=>time>=s.start&&time<s.end);if(!segment)return;
 style=resolveCaptionStyle(segment,style);
 if(style.studio||segment.emphasizedWords||segment.styleOverride||segment.templateId||segment.wordStyles){ctx.save();try{drawStudioCaption(ctx,segment,style,time,width,height);}finally{ctx.restore();}return;}
 const scale=Math.min(width,height)/720,size=style.fontSize*scale,spacing=(parseFloat(style.letterSpacing)||0)*size;
 const words=segment.words?.length?segment.words:segment.text.split(/\s+/).filter(Boolean).map((word,i,all)=>({word,start:segment.start+(segment.end-segment.start)*i/all.length,end:segment.start+(segment.end-segment.start)*(i+1)/all.length}));
 const transform=(word:string)=>style.textTransform==="uppercase"?word.toUpperCase():style.textTransform==="capitalize"?word.charAt(0).toUpperCase()+word.slice(1):word;
 ctx.save();ctx.font=`${style.fontWeight} ${size}px ${style.fontFamily}`;ctx.textBaseline="middle";ctx.textAlign="left";
 const setFont=(index:number)=>{const t=wordTypography(style.fontFamily,style.fontWeight,style.fontAccent,index,words.length);ctx.font=`${t.weight} ${size}px ${captionFontFamily(t.font,words[index].word)}`;};
 const measure=(word:typeof words[number])=>{setFont(words.indexOf(word));return ctx.measureText(transform(word.word)).width;};
 const gap=ctx.measureText(" ").width+spacing,lines:typeof words[]=[];let line:typeof words=[],used=0;
 for(const word of words){const n=measure(word)+spacing;if(line.length&&(line.length>=style.maxWordsPerLine||used+n+gap>width*.86)){lines.push(line);line=[];used=0;}line.push(word);used+=n+gap;}if(line.length)lines.push(line);
 const lineHeight=size*style.lineSpacing,totalHeight=lines.length*lineHeight,percent=style.position==="top"?18:style.position==="center"?50:style.position==="custom"?(style.positionYPercent??78):80;
 const center=Math.max(totalHeight/2+size,Math.min(height-totalHeight/2-size,height*percent/100));
 for(let li=0;li<lines.length;li++){
  const row=lines[li],rowWidth=row.reduce((sum,word)=>sum+measure(word)+spacing,0)+gap*(row.length-1);let x=style.alignment==="left"?width*.07:style.alignment==="right"?width*.93-rowWidth:(width-rowWidth)/2;const y=center+(li-(lines.length-1)/2)*lineHeight;
  if(style.containerBg&&style.containerBg!=="transparent"){ctx.fillStyle=style.containerBg;ctx.fillRect(x-10*scale,y-lineHeight/2,rowWidth+20*scale,lineHeight);}
  const rtl=textDirection(segment.text)==='rtl';if(rtl)x+=rowWidth;
  for(const word of row){const text=transform(word.word),wordWidth=measure(word),current=time>=word.start&&time<word.end,future=time<word.start,index=words.indexOf(word),highlight=wordHighlight(style.highlightingMode,word.word,index,current,style.highlightWords,!future);
   ctx.save();setFont(index);ctx.direction=textDirection(word.word);const elapsed=Math.max(0,time-word.start),p=Math.min(1,elapsed/Math.max(.01,style.animationSpeed));let zoom=1,dy=0;
   if(current){if(style.animation==="pop")zoom=1+.2*Math.sin(p*Math.PI);if(style.animation==="scale")zoom=1.15;if(style.animation==="bounce")dy=-size*.2*Math.sin(p*Math.PI);}
   if(style.animation==="slide-up"||style.animation==="slide-down")dy=(style.animation==="slide-up"?1:-1)*size*.25*(1-Math.min(1,(time-segment.start)/Math.max(.01,style.animationSpeed)));
   if(style.animation==="word-by-word"&&future)ctx.globalAlpha=0;
   if(style.animation==="fade")ctx.globalAlpha=current?1:.85;
   ctx.translate(rtl?x-wordWidth/2:x+wordWidth/2,y+dy);ctx.scale(zoom,zoom);
   if(current&&style.highlightBg){ctx.fillStyle=style.highlightBg;ctx.fillRect(-wordWidth/2-3*scale,-size*.65,wordWidth+6*scale,size*1.3);}
   ctx.shadowColor=style.shadowColor||"transparent";ctx.shadowBlur=(style.shadowBlur||0)*scale;ctx.shadowOffsetX=(style.shadowOffsetX||0)*scale;ctx.shadowOffsetY=(style.shadowOffsetY||0)*scale;
   if(style.strokeWidth&&style.strokeColor){ctx.strokeStyle=style.strokeColor;ctx.lineWidth=style.strokeWidth*scale*2;ctx.lineJoin="round";ctx.strokeText(text,-wordWidth/2,0,width*.86);}
   ctx.fillStyle=highlight?(style.highlightingMode==='full-line'?style.highlightColor:distinctHighlight(style.textColor,style.highlightColor)):style.textColor;ctx.fillText(style.animation==="type"?text.slice(0,Math.ceil(text.length*p)):text,-wordWidth/2,0,width*.86);ctx.restore();x+=(rtl?-1:1)*(wordWidth+spacing+gap);
  }
 }
 ctx.restore();
}
