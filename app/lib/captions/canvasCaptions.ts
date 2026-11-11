import {drawStudioCaption,resolveCaptionStyle} from './studioCanvas';
import {wordHighlight,distinctHighlight} from "./highlighting";
import {captionFontFamily,textDirection} from "./languages";
import {wordTypography} from "./typography";
import type {CaptionSegment} from "./presets";
import {type CaptionStyleConfig} from "./templates";
import {VALID_CAPTION_PRESETS,type CaptionPresetId,type CaptionDecision,isKnownCaptionPreset,normalizeCaptionPresetId} from "../editor/model";

export {VALID_CAPTION_PRESETS,type CaptionPresetId,type CaptionDecision,isKnownCaptionPreset,normalizeCaptionPresetId};
type CachedSimpleWord = { word: string; start: number; end: number; text: string; width: number; font: string; index: number };
type CachedSimpleLayout = {
  scale: number;
  size: number;
  spacing: number;
  gap: number;
  lineHeight: number;
  rtl: boolean;
  rows: { y: number; xStart: number; rowWidth: number; words: CachedSimpleWord[] }[];
};
const simpleLayoutCache = new Map<string, CachedSimpleLayout>();
const MAX_SIMPLE_LAYOUTS = 64;

function buildSimpleLayout(ctx: CanvasRenderingContext2D, segment: CaptionSegment, style: CaptionStyleConfig, width: number, height: number): CachedSimpleLayout {
  const wordsKey = segment.words?.length ? segment.words.map(w => `${w.word}:${w.start}:${w.end}`).join("\x1f") : segment.text;
  const cacheKey = `${width}x${height}\0${segment.id}\0${segment.start}\0${segment.end}\0${wordsKey}\0${style.fontSize}\0${style.letterSpacing}\0${style.fontWeight}\0${style.fontFamily}\0${style.fontAccent?.font ?? ""}:${style.fontAccent?.weight ?? ""}\0${style.textTransform}\0${style.maxWordsPerLine}\0${style.lineSpacing}\0${style.position}\0${style.positionYPercent ?? ""}\0${style.alignment}`;
  const cached = simpleLayoutCache.get(cacheKey);
  if (cached) return cached;

  const scale = Math.min(width, height) / 720, size = style.fontSize * scale, spacing = (parseFloat(style.letterSpacing) || 0) * size;
  const rawWords = segment.words?.length ? segment.words : segment.text.split(/\s+/).filter(Boolean).map((word, i, all) => ({ word, start: segment.start + (segment.end - segment.start) * i / all.length, end: segment.start + (segment.end - segment.start) * (i + 1) / all.length }));
  const transform = (word: string) => style.textTransform === "uppercase" ? word.toUpperCase() : style.textTransform === "capitalize" ? word.charAt(0).toUpperCase() + word.slice(1) : word;
  ctx.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
  const gap = ctx.measureText(" ").width + spacing;
  const words: CachedSimpleWord[] = rawWords.map((w, index) => {
    const t = wordTypography(style.fontFamily, style.fontWeight, style.fontAccent, index, rawWords.length);
    const font = `${t.weight} ${size}px ${captionFontFamily(t.font, w.word)}`;
    const text = transform(w.word);
    ctx.font = font;
    return { word: w.word, start: w.start, end: w.end, text, width: ctx.measureText(text).width, font, index };
  });
  const lines: CachedSimpleWord[][] = []; let line: CachedSimpleWord[] = [], used = 0;
  for (const word of words) {
    const n = word.width + spacing;
    if (line.length && (line.length >= style.maxWordsPerLine || used + n + gap > width * .86)) { lines.push(line); line = []; used = 0; }
    line.push(word); used += n + gap;
  }
  if (line.length) lines.push(line);
  const lineHeight = size * style.lineSpacing, totalHeight = lines.length * lineHeight, percent = style.position === "top" ? 18 : style.position === "center" ? 50 : style.position === "custom" ? (style.positionYPercent ?? 78) : 80;
  const center = Math.max(totalHeight / 2 + size, Math.min(height - totalHeight / 2 - size, height * percent / 100));
  const rtl = textDirection(segment.text) === 'rtl';
  const rows = lines.map((row, li) => {
    const rowWidth = row.reduce((sum, word) => sum + word.width + spacing, 0) + gap * (row.length - 1);
    let xStart = style.alignment === "left" ? width * .07 : style.alignment === "right" ? width * .93 - rowWidth : (width - rowWidth) / 2;
    const xBase = xStart;
    if (rtl) xStart += rowWidth;
    const y = center + (li - (lines.length - 1) / 2) * lineHeight;
    return { y, xStart, xBox: xBase, rowWidth, words: row, gap };
  });
  const layout: CachedSimpleLayout = { scale, size, spacing, gap, lineHeight, rtl, rows: rows.map(({ y, xStart, rowWidth, words: rWords }) => ({ y, xStart, rowWidth, words: rWords })) };
  if (simpleLayoutCache.size >= MAX_SIMPLE_LAYOUTS) { const first = simpleLayoutCache.keys().next().value; if (first !== undefined) simpleLayoutCache.delete(first); }
  simpleLayoutCache.set(cacheKey, layout);
  return layout;
}

/** Shared by the on-video preview and fixed-frame export. All coordinates scale from a 720px short edge. */
export function drawCaptions(ctx:CanvasRenderingContext2D,segments:CaptionSegment[],style:CaptionStyleConfig,time:number,width:number,height:number){
 const segment=segments.find(s=>time>=s.start&&time<s.end);if(!segment)return;
 style=resolveCaptionStyle(segment,style);
 if(style.studio||segment.emphasizedWords||segment.styleOverride||segment.templateId||segment.wordStyles){ctx.save();try{drawStudioCaption(ctx,segment,style,time,width,height);}finally{ctx.restore();}return;}
 ctx.save();
 ctx.textBaseline="middle";ctx.textAlign="left";
 const layout=buildSimpleLayout(ctx,segment,style,width,height);
 const {scale,size,spacing,gap,lineHeight,rtl,rows}=layout;
 for(let li=0;li<rows.length;li++){
  const row=rows[li],{y,rowWidth}=row;
  let x=row.xStart;
  const xBox=rtl?x-rowWidth:x;
  if(style.containerBg&&style.containerBg!=="transparent"){ctx.fillStyle=style.containerBg;ctx.fillRect(xBox-10*scale,y-lineHeight/2,rowWidth+20*scale,lineHeight);}
  for(const word of row.words){const {text,width:wordWidth,font,index}=word,current=time>=word.start&&time<word.end,future=time<word.start,highlight=wordHighlight(style.highlightingMode,word.word,index,current,style.highlightWords,!future);
   ctx.save();ctx.font=font;ctx.direction=textDirection(word.word);const elapsed=Math.max(0,time-word.start),p=Math.min(1,elapsed/Math.max(.01,style.animationSpeed));let zoom=1,dy=0;
   if(current){if(style.animation==="pop")zoom=1+.2*Math.sin(p*Math.PI);if(style.animation==="scale")zoom=1.15;if(style.animation==="bounce")dy=-size*.2*Math.sin(p*Math.PI);}
   if(style.animation==="slide-up"||style.animation==="slide-down")dy=(style.animation==="slide-up"?1:-1)*size*.25*(1-Math.min(1,(time-segment.start)/Math.max(.01,style.animationSpeed)));
   if(style.animation==="word-by-word"&&future)ctx.globalAlpha=0;
   if(style.animation==="fade")ctx.globalAlpha=current?1:.85;
   ctx.translate(rtl?x-wordWidth/2:x+wordWidth/2,y+dy);ctx.scale(zoom,zoom);
   if(current&&style.highlightBg){ctx.fillStyle=style.highlightBg;ctx.fillRect(-wordWidth/2-3*scale,-size*.65,wordWidth+6*scale,size*1.3);}
   ctx.shadowColor=style.shadowColor||"transparent";ctx.shadowBlur=(style.shadowBlur||0)*scale;ctx.shadowOffsetX=(style.shadowOffsetX||0)*scale;ctx.shadowOffsetY=(style.shadowOffsetY||0)*scale;
   const maxSafeWordWidth=Math.max(wordWidth*1.3,width*.86);
   if(style.strokeWidth&&style.strokeColor){ctx.strokeStyle=style.strokeColor;ctx.lineWidth=style.strokeWidth*scale*2;ctx.lineJoin="round";ctx.miterLimit=2;ctx.strokeText(text,-wordWidth/2,0,maxSafeWordWidth);}
   ctx.fillStyle=highlight?(style.highlightingMode==='full-line'?style.highlightColor:distinctHighlight(style.textColor,style.highlightColor)):style.textColor;ctx.fillText(style.animation==="type"?text.slice(0,Math.ceil(text.length*p)):text,-wordWidth/2,0,maxSafeWordWidth);ctx.restore();x+=(rtl?-1:1)*(wordWidth+spacing+gap);
  }
 }
 ctx.restore();
}
