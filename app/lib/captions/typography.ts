import {captionFontFamily,loadScriptFonts} from "./languages";
/** The last word keeps its accent font throughout playback; timings never change typography. */
export interface FontAccent {font:string;weight:number}
export function readFontAccent(value:unknown):FontAccent|null{
 if(value===null)return null;
 if(!value||typeof value!=='object')throw Error('Invalid accent font.');
 const v=value as Record<string,unknown>;
 if(typeof v.font!=='string'||!['Caveat','Dancing Script','Playfair Display','Poppins'].includes(v.font)||typeof v.weight!=='number'||![400,500,600,700].includes(v.weight))throw Error('Unsupported accent font.');
 return {font:v.font,weight:v.weight};
}
export function wordTypography(font:string,weight:number,accent:FontAccent|null|undefined,index:number,count:number){
 return accent&&index===count-1?{font:accent.font,weight:accent.weight}:{font,weight};
}
export function fontRequests(font:string,weight:number,size:number,accent?:FontAccent|null){return [weight+' '+size+'px '+font,...(accent?[accent.weight+' '+size+'px "'+accent.font+'"']:[])];}
export async function loadCaptionFonts(font:string,weight:number,size:number,accent?:FontAccent|null,sample=""){
 await loadScriptFonts(sample);
 const families=captionFontFamily(font,sample),paired=accent?{...accent,font:accent.font}:accent;
 await Promise.all(fontRequests(families,weight,size,paired).map(spec=>document.fonts.load(spec,sample||" ")));await document.fonts.ready;
}
/** Measure every run with its own font before wrapping. Shared by editor preview and export. */
export function mixedTextLines(ctx:CanvasRenderingContext2D,text:string,size:number,font:string,weight:number,accent:FontAccent|null|undefined,width:number,maxWords=1000,totalWords=text.trim().split(/\s+/).length){
 const rows:{text:string;width:number;font:string;index:number}[][]=[];let row:typeof rows[number]=[],used=0,index=0;
 ctx.font=weight+' '+size+'px "'+font+'"';const gap=ctx.measureText(' ').width;
 const push=()=>{rows.push(row);row=[];used=0;};
 for(const paragraph of text.split('\n')){
  for(const word of paragraph.split(/\s+/).filter(Boolean)){
   const type=wordTypography(font,weight,accent,index,totalWords),spec=type.weight+' '+size+'px '+captionFontFamily(type.font,word);ctx.font=spec;
   const chunks:string[]=[];let chunk='';
   const chars=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(word)].map(s=>s.segment):Array.from(word);
   for(const char of chars){if(chunk&&ctx.measureText(chunk+char).width>width){chunks.push(chunk);chunk='';}chunk+=char;}if(chunk)chunks.push(chunk);
   for(let i=0;i<chunks.length;i++){const value=chunks[i],n=ctx.measureText(value).width;if(row.length&&(row.length>=maxWords||used+gap+n>width))push();if(row.length)used+=gap;row.push({text:value,width:n,font:spec,index});used+=n;if(i<chunks.length-1)push();}
   index++;
  }
  push();
 }
 return {rows,gap};
}
