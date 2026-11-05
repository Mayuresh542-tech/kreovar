import {captionFontFamily,textDirection} from './languages';
import {captionMotion,captionLoop,type CaptionStudioDesign,type StudioGradient} from './studioDesign';
import type {CaptionStyleConfig} from './templates';
import type {CaptionSegment} from './presets';
import {DEFAULT_CAPTION_TEMPLATES} from './templates';
import {referenceCaptionTemplate} from './referenceTemplates';

export function resolveCaptionStyle(segment:CaptionSegment,global:CaptionStyleConfig):CaptionStyleConfig{
 const selected=segment.templateId?(referenceCaptionTemplate(segment.templateId)||DEFAULT_CAPTION_TEMPLATES.find(t=>t.id===segment.templateId))?.style:undefined;
 const base=selected||global,override=segment.styleOverride;
 return override?{...base,...override,studio:{...base.studio,...override.studio}}:base;
}

function fillGradient(ctx:CanvasRenderingContext2D,g:StudioGradient|null|undefined,color:string,w:number,h:number){
 if(!g)return color;const angle=g.angle*Math.PI/180,dx=Math.cos(angle)*w/2,dy=Math.sin(angle)*h/2,gradient=ctx.createLinearGradient(-dx,-dy,dx,dy);for(const stop of g.stops||[{offset:0,color:g.from},{offset:1,color:g.to}])gradient.addColorStop(clamp(stop.offset,0,1),stop.color);return gradient;
}
function rounded(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){ctx.beginPath();ctx.roundRect(x,y,w,h,Math.min(r,w/2,h/2));ctx.fill();}
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
function isEmphasis(s:CaptionSegment,d:CaptionStudioDesign,index:number,count:number){
 if(s.emphasizedWords)return s.emphasizedWords.includes(index);
 if(d.emphasisSelection==='first')return index===0;
 if(d.emphasisSelection==='second-row')return index>=Math.max(1,Math.round(count*(d.rowSplit??.4)));
 if(d.emphasisSelection==='middle-pair')return index===Math.floor(count/2)||index===Math.max(0,Math.floor(count/2)-1);
 if(d.emphasisSelection==='last')return index===count-1;
 if(d.emphasisSelection==='middle')return index===Math.floor(count/2);
 if(d.emphasisSelection==='alternating')return index%2===0;
 return false;
}
/** One deterministic drawing path for studio preview, template samples and video export. */
export function drawStudioCaption(ctx:CanvasRenderingContext2D,segment:CaptionSegment,style:CaptionStyleConfig,time:number,width:number,height:number){
 const d=style.studio||{},scale=Math.min(width,height)/720,size=style.fontSize*scale;
 const source=segment.words?.length?segment.words:segment.text.split(/\s+/).filter(Boolean).map((word,i,all)=>({word,start:segment.start+(segment.end-segment.start)*i/all.length,end:segment.start+(segment.end-segment.start)*(i+1)/all.length}));
 if(!source.length)return;
 const count=source.length,current=source.findIndex(w=>time>=w.start&&time<w.end),gap=size*.28,spacing=(parseFloat(style.letterSpacing)||0)*size;
 const requested=(style.highlightWords||'').split(',').map(w=>w.trim().toLocaleLowerCase()).filter(Boolean);
 const words=source.map((w,index)=>{
  const manual=isEmphasis(segment,d,index,count)||!segment.emphasizedWords&&requested.includes(w.word.toLocaleLowerCase().replace(/[\p{P}]/gu,''));
  const active=style.highlightingMode==='cumulative'?time>=w.start:style.highlightingMode==='current-word'?index===current:style.highlightingMode==='alternating'?index%2===0:style.highlightingMode==='full-line'?true:manual;
  const edge=!!d.edgeFont&&(index===0||index===count-1),emphasis=manual,font=emphasis?(d.emphasisFont||style.fontAccent?.font||style.fontFamily):edge?d.edgeFont!:style.fontFamily;
  const fontSize=size*(emphasis?(d.emphasisScale||1):edge?d.edgeScale||1:1),weight=emphasis?(d.emphasisWeight||style.fontAccent?.weight||style.fontWeight):style.fontWeight;
  const casing=emphasis&&d.emphasisCase?d.emphasisCase:d.lowercase?'lowercase':style.textTransform;
  const text=casing==='uppercase'?w.word.toLocaleUpperCase():casing==='lowercase'?w.word.toLocaleLowerCase():casing==='capitalize'?w.word.charAt(0).toLocaleUpperCase()+w.word.slice(1):w.word;
  const italic=emphasis?d.emphasisItalic:edge?d.edgeItalic:d.italic,wordSpacing=emphasis&&d.emphasisLetterSpacing!==undefined?d.emphasisLetterSpacing*size:spacing;
  ctx.font=`${italic?'italic ':''}${weight} ${fontSize}px ${captionFontFamily(font,text)}`;ctx.letterSpacing='0px';
  return {...w,text,index,active,emphasis,font,fontSize,weight,italic,spacing:wordSpacing,width:(ctx.measureText(text).width+Math.max(0,Array.from(text).length-1)*wordSpacing)*(d.scaleX??1)};
 });
 const lines:typeof words[]=[];
 if(d.layout==='hero'){
  const ordinary=words.filter(w=>!w.emphasis),hero=words.filter(w=>w.emphasis),pivot=hero[0]?.index??count;
  if(d.heroPlacement==='banner'){if(ordinary.length)lines.push(ordinary);if(hero.length)lines.push(hero);}
  else {const before=ordinary.filter(w=>w.index<pivot),after=ordinary.filter(w=>w.index>=pivot);if(before.length)lines.push(before);if(hero.length)lines.push(hero);if(after.length)lines.push(after);}
 }else if(d.layout==='dynamic'){
  const split=Math.max(2,Math.ceil(words.length/2));lines.push(words.slice(0,1));if(words.length>1)lines.push(words.slice(1,split));if(words.length>split)lines.push(words.slice(split));
 }else if(d.layout==='stacked'){
  const split=Math.max(1,Math.round(words.length*(d.rowSplit??.6)));lines.push(words.slice(0,split));if(words.length>split)lines.push(words.slice(split));
 }else{
  let row:typeof words=[],used=0;for(const word of words){if(row.length&&(row.length>=style.maxWordsPerLine||used+gap+word.width>width*.86)){lines.push(row);row=[];used=0;}row.push(word);used+=word.width+gap;}if(row.length)lines.push(row);
 }
 const metrics=lines.map((row,i)=>({margin:(d.rowMargins?.[i]||0)*size,height:Math.max(...row.map(w=>w.fontSize))*Math.max(.6,style.lineSpacing),width:row.reduce((n,w)=>n+w.width,0)+gap*(row.length-1)}));
 const unscaled=metrics.reduce((n,m)=>n+m.height+m.margin,0),blockWidth=Math.max(...metrics.map(m=>m.width)),fit=Math.min(1,width*.86/Math.max(1,blockWidth+Math.abs(d.rowOffset||0)*size*2),height*.84/Math.max(1,unscaled));
 const total=unscaled*fit,pct=style.position==='top'?18:style.position==='center'?50:style.position==='bottom'?80:style.positionYPercent??80;
 const cy=clamp(height*pct/100,total/2+size*.7,height-total/2-size*.7),cx=clamp(d.positionXPercent??50,5,95)*width/100;
 let rowTop=cy-total/2;
 for(let lineIndex=0;lineIndex<lines.length;lineIndex++){
  const row=lines[lineIndex],metric=metrics[lineIndex],factor=fit,rowWidth=metric.width*factor,lineHeight=metric.height*factor;
  let x=style.alignment==='left'?width*.07:style.alignment==='right'?width*.93-rowWidth:clamp(cx-rowWidth/2,width*.03,width*.97-rowWidth);
  if(d.layout==='split')x=lineIndex%2?width*.93-rowWidth:width*.07;
  if(d.layout==='hero'&&d.heroPlacement!=='banner'&&!row.some(w=>w.emphasis))x=cx-blockWidth*factor/2+(lineIndex===0?0:blockWidth*factor-rowWidth);
  const edgeRow=d.layout==='dynamic'&&(lineIndex===0||lineIndex===lines.length-1);if(edgeRow)x+=(lineIndex===0?-1:1)*(d.rowOffset||0)*size*factor;
  rowTop+=metric.margin*factor;const y=rowTop+lineHeight/2;rowTop+=lineHeight;
  ctx.save();
  if(style.containerBg&&style.containerBg!=='transparent'){ctx.fillStyle=style.containerBg;rounded(ctx,x-10*scale,y-lineHeight/2-4*scale,rowWidth+20*scale,lineHeight+8*scale,(d.backgroundRadius??6)*scale);}
  const spreadGap=d.spread&&row.length>1?Math.max(gap*factor,(width*.86-row.reduce((n,w)=>n+w.width*factor,0))/(row.length-1)):gap*factor;
  const banner=d.layout==='hero'&&d.heroPlacement==='banner'&&!row.some(w=>w.emphasis),bannerPivot=banner?Math.max(1,row.findIndex((w,i)=>i>0&&w.index>row[i-1].index+1)):-1;
  if(banner)x=cx-blockWidth*factor/2;
  for(const word of textDirection(segment.text)==='rtl'?[...row].reverse():row){
   if(banner&&row.indexOf(word)===bannerPivot){const rightWidth=row.slice(bannerPivot).reduce((sum,w)=>sum+w.width*factor,0)+gap*factor*(row.length-bannerPivot-1);x=cx+blockWidth*factor/2-rightWidth;}
   const n=word.index,fs=word.fontSize*factor,ww=word.width*factor,own=(d.transitionTarget||'all')==='all'||word.emphasis;
   const duration=Math.max(.04,Math.min(d.transitionDuration??style.animationSpeed,(segment.end-segment.start)/2));
   const elapsed=time-segment.start,remaining=segment.end-time,wordStyle=segment.wordStyles?.[n];
   const p=wordStyle?.entrance?captionMotion(wordStyle.entrance,(time-word.start)/duration,n):own?captionMotion(d.entrance||'none',elapsed/duration,n):captionMotion('none',1),out=own?captionMotion(d.exit||'none',remaining/duration,n):captionMotion('none',1),loop=own?captionLoop(d.hold||'none',elapsed,n):captionLoop('none',0);
   const arc=(d.arc||0)*Math.PI/180,relative=(x+ww/2-width/2)/(width*.86),angle=relative*arc;
   ctx.save();ctx.font=`${word.italic?'italic ':''}${word.weight} ${fs}px ${captionFontFamily(word.font,word.text)}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.direction=textDirection(word.text);ctx.letterSpacing=word.spacing*factor+'px';
   ctx.globalAlpha=clamp(p.alpha*out.alpha*((d.spotlight||segment.wordStyles?.[current]?.spotlight)&&current>=0&&n!==current ? .3 : 1),0,1);
   if(style.animation==='word-by-word'&&time<word.start)ctx.globalAlpha=0;
   ctx.translate(x+ww/2+(p.x+out.x+loop.x)*fs,y+(p.y+out.y+loop.y)*fs+Math.abs(relative)*Math.sin(Math.abs(arc)/2)*fs*1.6);
   ctx.rotate((p.rotation+out.rotation+loop.rotation+(edgeRow?d.rowRotation||0:0))*Math.PI/180+angle);ctx.scale(p.scale*out.scale*loop.scale*(d.scaleX??1),p.scale*out.scale*loop.scale);
   ctx.filter=p.blur+out.blur>0?`blur(${(p.blur+out.blur)*scale}px)`:'none';
   let color=word.active?style.highlightColor:style.textColor;if(d.hold==='rainbow')color=`hsl(${(elapsed*60+n*24)%360} 90% 65%)`;
   if(d.hold==='font-shuffle')ctx.font=`${word.weight} ${fs}px ${['Inter','Montserrat','Instrument Serif'][Math.floor(elapsed*2+n)%3]}`;
   const reveal=Math.min(p.reveal,out.reveal),letters=Array.from(word.text),text=reveal<1?letters.slice(0,Math.ceil(letters.length*reveal)).join(''):word.text;
   if(word.active&&style.highlightBg){ctx.fillStyle=style.highlightBg;rounded(ctx,-ww/2-4*scale,-fs*.65,ww+8*scale,fs*1.3,4*scale);}
   if(d.letterBoxes){ctx.fillStyle=d.letterBoxColor||'#00000088';let left=-ww/2;for(const char of letters){const cw=ctx.measureText(char).width;rounded(ctx,left-1*scale,-fs*.6,cw+2*scale,fs*1.2,2*scale);left+=cw+spacing*factor;}}
   if(d.depth&&(d.depthTarget!=='emphasis'||word.emphasis)){const steps=Math.min(16,Math.max(1,Math.ceil(d.depth))),angle=(d.depthAngle??45)*Math.PI/180;ctx.fillStyle=d.depthColor||'#000000';for(let j=steps;j>0;j--)ctx.fillText(text,Math.cos(angle)*j*scale,Math.sin(angle)*j*scale);}
   const glow=d.glowTarget==='emphasis'&&!word.emphasis?0:d.glow;
   ctx.shadowColor=glow?d.glowColor||color:style.shadowColor||'transparent';ctx.shadowBlur=(glow||style.shadowBlur||0)*scale;ctx.shadowOffsetX=(style.shadowOffsetX||0)*scale;ctx.shadowOffsetY=(style.shadowOffsetY||0)*scale;
   if(style.strokeWidth){ctx.strokeStyle=style.strokeColor||'#000000';ctx.lineWidth=style.strokeWidth*scale*2;ctx.lineJoin='round';ctx.strokeText(text,0,0);}
   ctx.fillStyle=fillGradient(ctx,word.emphasis?d.emphasisGradient||d.gradient:d.gradient,color,ww,fs);ctx.fillText(text,0,0);
   if(d.underline||word.emphasis&&d.emphasisUnderline){ctx.shadowBlur=0;ctx.strokeStyle=d.underlineColor||color;ctx.lineWidth=Math.max(1,fs*.045);ctx.beginPath();ctx.moveTo(-ww/2,fs*.58);ctx.lineTo(ww/2,fs*.58);ctx.stroke();}
   ctx.restore();x+=ww+spreadGap;
  }
  ctx.restore();
 }
}
