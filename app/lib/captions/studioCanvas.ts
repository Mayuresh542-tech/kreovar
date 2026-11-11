import {captionFontFamily,textDirection} from './languages';
import {captionMotion,captionLoop,type CaptionStudioDesign,type StudioGradient} from './studioDesign';
import type {CaptionStyleConfig} from './templates';
import type {CaptionSegment} from './presets';
import {DEFAULT_CAPTION_TEMPLATES} from './templates';
import {referenceCaptionTemplate} from './referenceTemplates';
import {normalizeCaptionPresetId} from '../editor/model';

export function resolveCaptionStyle(segment:CaptionSegment,global:CaptionStyleConfig):CaptionStyleConfig{
 const normId = segment.templateId ? normalizeCaptionPresetId(segment.templateId) : undefined;
 const selected=normId?(referenceCaptionTemplate(normId)||referenceCaptionTemplate('study-'+normId.replace(/^study-/,''))||DEFAULT_CAPTION_TEMPLATES.find(t=>t.id===normId||t.id===segment.templateId))?.style:undefined;
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

interface StudioWordLayout {
 word: string;
 start: number;
 end: number;
 text: string;
 letters: string[];
 charWidths?: number[];
 index: number;
 emphasis: boolean;
 font: string;
 fontSize: number;
 weight: number;
 italic?: boolean;
 spacing: number;
 width: number;
 fontCss: string;
 dir: 'ltr' | 'rtl';
}
interface StudioWordPlacement {
 word: StudioWordLayout;
 x: number;
 angle: number;
 relative: number;
 fs: number;
 ww: number;
}
interface StudioRowLayout {
 boxX: number;
 y: number;
 rowWidth: number;
 lineHeight: number;
 edgeRow: boolean;
 words: StudioWordPlacement[];
}
interface StudioCaptionLayout {
 scale: number;
 fit: number;
 spacing: number;
 words: StudioWordLayout[];
 rows: StudioRowLayout[];
}
const studioLayoutCache = new Map<string, StudioCaptionLayout>();
const MAX_STUDIO_LAYOUTS = 64;

function studioLayoutKey(segment: CaptionSegment, style: CaptionStyleConfig, width: number, height: number) {
 const d = style.studio || {};
 const wordsKey = segment.words?.length ? segment.words.map(w => `${w.word}:${w.start}:${w.end}`).join('\x1f') : segment.text;
 return `${width}x${height}\0${segment.id}\0${segment.start}\0${segment.end}\0${wordsKey}\0${segment.emphasizedWords?.join(',') ?? ''}\0${segment.templateId ?? ''}\0${style.fontSize}\0${style.fontWeight}\0${style.fontFamily}\0${style.fontAccent?.font ?? ''}:${style.fontAccent?.weight ?? ''}\0${style.letterSpacing}\0${style.lineSpacing}\0${style.maxWordsPerLine}\0${style.textTransform}\0${style.highlightingMode}\0${style.highlightWords}\0${style.position}\0${style.positionYPercent ?? ''}\0${style.alignment}\0${JSON.stringify(d)}`;
}

function buildStudioLayout(ctx: CanvasRenderingContext2D, segment: CaptionSegment, style: CaptionStyleConfig, width: number, height: number): StudioCaptionLayout | null {
 const d = style.studio || {}, scale = Math.min(width, height) / 720, size = style.fontSize * scale;
 const source = segment.words?.length ? segment.words : segment.text.split(/\s+/).filter(Boolean).map((word, i, all) => ({ word, start: segment.start + (segment.end - segment.start) * i / all.length, end: segment.start + (segment.end - segment.start) * (i + 1) / all.length }));
 if (!source.length) return null;
 const key = studioLayoutKey(segment, style, width, height);
 const cached = studioLayoutCache.get(key);
 if (cached) return cached;

 const count = source.length, gap = size * .28, spacing = (parseFloat(style.letterSpacing) || 0) * size;
 const requested = (style.highlightWords || '').split(',').map(w => w.trim().toLocaleLowerCase()).filter(Boolean);
 ctx.letterSpacing = '0px';
 const words: StudioWordLayout[] = source.map((w, index) => {
  const manual = isEmphasis(segment, d, index, count) || !segment.emphasizedWords && requested.includes(w.word.toLocaleLowerCase().replace(/[\p{P}]/gu, ''));
  const edge = !!d.edgeFont && (index === 0 || index === count - 1), emphasis = manual, font = emphasis ? (d.emphasisFont || style.fontAccent?.font || style.fontFamily) : edge ? d.edgeFont! : style.fontFamily;
  const fontSize = size * (emphasis ? (d.emphasisScale || 1) : edge ? d.edgeScale || 1 : 1), weight = emphasis ? (d.emphasisWeight || style.fontAccent?.weight || style.fontWeight) : style.fontWeight;
  const casing = emphasis && d.emphasisCase ? d.emphasisCase : d.lowercase ? 'lowercase' : style.textTransform;
  const text = casing === 'uppercase' ? w.word.toLocaleUpperCase() : casing === 'lowercase' ? w.word.toLocaleLowerCase() : casing === 'capitalize' ? w.word.charAt(0).toUpperCase() + w.word.slice(1) : w.word;
  const italic = emphasis ? d.emphasisItalic : edge ? d.edgeItalic : d.italic, wordSpacing = emphasis && d.emphasisLetterSpacing !== undefined ? d.emphasisLetterSpacing * size : spacing;
  const resolvedFamily = captionFontFamily(font, text);
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${fontSize}px ${resolvedFamily}`;
  const letters = Array.from(text);
  return { ...w, text, letters, index, emphasis, font, fontSize, weight, italic, spacing: wordSpacing, width: (ctx.measureText(text).width + Math.max(0, letters.length - 1) * wordSpacing) * (d.scaleX ?? 1), fontCss: resolvedFamily, dir: textDirection(text) };
 });
 const lines: StudioWordLayout[][] = [];
 if (d.layout === 'hero') {
  const ordinary = words.filter(w => !w.emphasis), hero = words.filter(w => w.emphasis), pivot = hero[0]?.index ?? count;
  if (d.heroPlacement === 'banner') { if (ordinary.length) lines.push(ordinary); if (hero.length) lines.push(hero); }
  else { const before = ordinary.filter(w => w.index < pivot), after = ordinary.filter(w => w.index >= pivot); if (before.length) lines.push(before); if (hero.length) lines.push(hero); if (after.length) lines.push(after); }
 } else if (d.layout === 'dynamic') {
  const split = Math.max(2, Math.ceil(words.length / 2)); lines.push(words.slice(0, 1)); if (words.length > 1) lines.push(words.slice(1, split)); if (words.length > split) lines.push(words.slice(split));
 } else if (d.layout === 'stacked') {
  const split = Math.max(1, Math.round(words.length * (d.rowSplit ?? .6))); lines.push(words.slice(0, split)); if (words.length > split) lines.push(words.slice(split));
 } else {
  let row: StudioWordLayout[] = [], used = 0; for (const word of words) { if (row.length && (row.length >= style.maxWordsPerLine || used + gap + word.width > width * .86)) { lines.push(row); row = []; used = 0; } row.push(word); used += word.width + gap; } if (row.length) lines.push(row);
 }
 const metrics = lines.map((row, i) => ({ margin: (d.rowMargins?.[i] || 0) * size, height: Math.max(...row.map(w => w.fontSize)) * Math.max(.6, style.lineSpacing), width: row.reduce((n, w) => n + w.width, 0) + gap * (row.length - 1) }));
 const unscaled = metrics.reduce((n, m) => n + m.height + m.margin, 0), blockWidth = Math.max(...metrics.map(m => m.width)), fit = Math.min(1, width * .86 / Math.max(1, blockWidth + Math.abs(d.rowOffset || 0) * size * 2), height * .84 / Math.max(1, unscaled));
 const total = unscaled * fit, pct = style.position === 'top' ? 18 : style.position === 'center' ? 50 : style.position === 'bottom' ? 80 : style.positionYPercent ?? 80;
 const cy = clamp(height * pct / 100, total / 2 + size * .7, height - total / 2 - size * .7), cx = clamp(d.positionXPercent ?? 50, 5, 95) * width / 100;
 const rtlSegment = textDirection(segment.text) === 'rtl';
 let rowTop = cy - total / 2;
 const rows: StudioRowLayout[] = lines.map((row, lineIndex) => {
  const metric = metrics[lineIndex], factor = fit, rowWidth = metric.width * factor, lineHeight = metric.height * factor;
  let x = style.alignment === 'left' ? width * .07 : style.alignment === 'right' ? width * .93 - rowWidth : clamp(cx - rowWidth / 2, width * .03, width * .97 - rowWidth);
  if (d.layout === 'split') x = lineIndex % 2 ? width * .93 - rowWidth : width * .07;
  if (d.layout === 'hero' && d.heroPlacement !== 'banner' && !row.some(w => w.emphasis)) x = cx - blockWidth * factor / 2 + (lineIndex === 0 ? 0 : blockWidth * factor - rowWidth);
  const edgeRow = d.layout === 'dynamic' && (lineIndex === 0 || lineIndex === lines.length - 1); if (edgeRow) x += (lineIndex === 0 ? -1 : 1) * (d.rowOffset || 0) * size * factor;
  rowTop += metric.margin * factor; const y = rowTop + lineHeight / 2; rowTop += lineHeight;
  const boxX = x;
  const spreadGap = d.spread && row.length > 1 ? Math.max(gap * factor, (width * .86 - row.reduce((n, w) => n + w.width * factor, 0)) / (row.length - 1)) : gap * factor;
  const banner = d.layout === 'hero' && d.heroPlacement === 'banner' && !row.some(w => w.emphasis), bannerPivot = banner ? Math.max(1, row.findIndex((w, i) => i > 0 && w.index > row[i - 1].index + 1)) : -1;
  const bannerPivotWord = bannerPivot >= 0 ? row[bannerPivot] : undefined;
  if (banner) x = cx - blockWidth * factor / 2;
  const ordered = rtlSegment ? [...row].reverse() : row;
  const arc = (d.arc || 0) * Math.PI / 180;
  const placedWords: StudioWordPlacement[] = ordered.map(word => {
   if (banner && word === bannerPivotWord) { const rightWidth = row.slice(bannerPivot).reduce((sum, w) => sum + w.width * factor, 0) + gap * factor * (row.length - bannerPivot - 1); x = cx + blockWidth * factor / 2 - rightWidth; }
   const fs = word.fontSize * factor, ww = word.width * factor;
   if (d.letterBoxes && !word.charWidths) {
    ctx.font = `${word.italic ? 'italic ' : ''}${word.weight} ${fs}px ${word.fontCss}`;
    ctx.letterSpacing = word.spacing * factor + 'px';
    word.charWidths = word.letters.map(char => ctx.measureText(char).width);
   }
   const relative = (x + ww / 2 - width / 2) / (width * .86), angle = relative * arc;
   const placement: StudioWordPlacement = { word, x, angle, relative, fs, ww };
   x += ww + spreadGap;
   return placement;
  });
  return { boxX, y, rowWidth, lineHeight, edgeRow, words: placedWords };
 });

 const layout: StudioCaptionLayout = { scale, fit, spacing, words, rows };
 if (studioLayoutCache.size >= MAX_STUDIO_LAYOUTS) { const first = studioLayoutCache.keys().next().value; if (first !== undefined) studioLayoutCache.delete(first); }
 studioLayoutCache.set(key, layout);
 return layout;
}

/** One deterministic drawing path for studio preview, template samples and video export. */
export function drawStudioCaption(ctx:CanvasRenderingContext2D,segment:CaptionSegment,style:CaptionStyleConfig,time:number,width:number,height:number){
 const layout=buildStudioLayout(ctx,segment,style,width,height);if(!layout)return;
 const d=style.studio||{},scale=layout.scale,factor=layout.fit,spacing=layout.spacing,words=layout.words;
 const current=words.findIndex(w=>time>=w.start&&time<w.end);
 const arc=(d.arc||0)*Math.PI/180,sinHalfArc=Math.sin(Math.abs(arc)/2);
 const elapsed=time-segment.start,remaining=segment.end-time;
 const duration=Math.max(.04,Math.min(d.transitionDuration??style.animationSpeed,(segment.end-segment.start)/2));

 for(const row of layout.rows){
  ctx.save();
  if(style.containerBg&&style.containerBg!=='transparent'){ctx.fillStyle=style.containerBg;rounded(ctx,row.boxX-10*scale,row.y-row.lineHeight/2-4*scale,row.rowWidth+20*scale,row.lineHeight+8*scale,(d.backgroundRadius??6)*scale);}
  for(const item of row.words){
   const word=item.word,n=word.index,fs=item.fs,ww=item.ww,own=(d.transitionTarget||'all')==='all'||word.emphasis;
   const active=style.highlightingMode==='cumulative'?time>=word.start:style.highlightingMode==='current-word'?n===current:style.highlightingMode==='alternating'?n%2===0:style.highlightingMode==='full-line'?true:word.emphasis;
   const wordStyle=segment.wordStyles?.[n];
   const p=wordStyle?.entrance?captionMotion(wordStyle.entrance,(time-word.start)/duration,n):own?captionMotion(d.entrance||'none',elapsed/duration,n):captionMotion('none',1),out=own?captionMotion(d.exit||'none',remaining/duration,n):captionMotion('none',1),loop=own?captionLoop(d.hold||'none',elapsed,n):captionLoop('none',0);
   ctx.save();
   ctx.font=d.hold==='font-shuffle'?`${word.weight} ${fs}px ${['Inter','Montserrat','Instrument Serif'][Math.floor(elapsed*2+n)%3]}`:`${word.italic?'italic ':''}${word.weight} ${fs}px ${word.fontCss}`;
   ctx.textAlign='center';ctx.textBaseline='middle';ctx.direction=word.dir;ctx.letterSpacing=word.spacing*factor+'px';
   ctx.globalAlpha=clamp(p.alpha*out.alpha*((d.spotlight||segment.wordStyles?.[current]?.spotlight)&&current>=0&&n!==current?.3:1),0,1);
   if(style.animation==='word-by-word'&&time<word.start)ctx.globalAlpha=0;
   ctx.translate(item.x+ww/2+(p.x+out.x+loop.x)*fs,row.y+(p.y+out.y+loop.y)*fs+Math.abs(item.relative)*sinHalfArc*fs*1.6);
   ctx.rotate((p.rotation+out.rotation+loop.rotation+(row.edgeRow?d.rowRotation||0:0))*Math.PI/180+item.angle);ctx.scale(p.scale*out.scale*loop.scale*(d.scaleX??1),p.scale*out.scale*loop.scale);
   const blur=p.blur+out.blur;
   if(blur>0)ctx.filter=`blur(${blur*scale}px)`;
   else if(ctx.filter!=='none')ctx.filter='none';
   let color=active?style.highlightColor:style.textColor;if(d.hold==='rainbow')color=`hsl(${(elapsed*60+n*24)%360} 90% 65%)`;
   const reveal=Math.min(p.reveal,out.reveal),letters=word.letters,text=reveal<1?letters.slice(0,Math.ceil(letters.length*reveal)).join(''):word.text;
   if(active&&style.highlightBg){ctx.fillStyle=style.highlightBg;rounded(ctx,-ww/2-4*scale,-fs*.65,ww+8*scale,fs*1.3,4*scale);}
   if(d.letterBoxes&&word.charWidths){ctx.fillStyle=d.letterBoxColor||'#00000088';let left=-ww/2;for(let ci=0;ci<letters.length;ci++){const cw=word.charWidths[ci];rounded(ctx,left-1*scale,-fs*.6,cw+2*scale,fs*1.2,2*scale);left+=cw+spacing*factor;}}
   if(d.depth&&(d.depthTarget!=='emphasis'||word.emphasis)){const steps=Math.min(16,Math.max(1,Math.ceil(d.depth))),angle=(d.depthAngle??45)*Math.PI/180;ctx.fillStyle=d.depthColor||'#000000';for(let j=steps;j>0;j--)ctx.fillText(text,Math.cos(angle)*j*scale,Math.sin(angle)*j*scale);}
   const glow=d.glowTarget==='emphasis'&&!word.emphasis?0:d.glow;
   ctx.shadowColor=glow?d.glowColor||color:style.shadowColor||'transparent';ctx.shadowBlur=(glow||style.shadowBlur||0)*scale;ctx.shadowOffsetX=(style.shadowOffsetX||0)*scale;ctx.shadowOffsetY=(style.shadowOffsetY||0)*scale;
   if(style.strokeWidth){ctx.strokeStyle=style.strokeColor||'#000000';ctx.lineWidth=style.strokeWidth*scale*2;ctx.lineJoin='round';ctx.strokeText(text,0,0);}
   ctx.fillStyle=fillGradient(ctx,word.emphasis?d.emphasisGradient||d.gradient:d.gradient,color,ww,fs);ctx.fillText(text,0,0);
   if(d.underline||word.emphasis&&d.emphasisUnderline){ctx.shadowBlur=0;ctx.strokeStyle=d.underlineColor||color;ctx.lineWidth=Math.max(1,fs*.045);ctx.beginPath();ctx.moveTo(-ww/2,fs*.58);ctx.lineTo(ww/2,fs*.58);ctx.stroke();}
   ctx.restore();
  }
  ctx.restore();
 }
}
