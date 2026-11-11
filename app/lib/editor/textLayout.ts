
import {captionVisualAnchor} from './captionAnchors';
import {dimensions,type EditorProject,type TextStyle,type TextLayer,type Clip} from './model';
export type MeasureText=(text:string)=>number;
export function styledText(layer:TextLayer){
 return layer.style.casing==='uppercase'?layer.text.toUpperCase():layer.style.casing==='capitalize'?layer.text.replace(/\b\w/g,c=>c.toUpperCase()):layer.text;
}
const graphemeSegmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
/** Shared word/grapheme wrapping for preview, export and conservative placement estimation. */
export function wrapText(content:string,width:number,measure:MeasureText){
 const lines:string[]=[];
 const graphemes=(s:string)=>graphemeSegmenter?[...graphemeSegmenter.segment(s)].map(v=>v.segment):Array.from(s);
 for(const paragraph of content.split('\n')){
  let line='';
  for(const word of paragraph.split(/\s+/).filter(Boolean)){
   const candidate=line?line+' '+word:word;
   if(measure(candidate)<=width){line=candidate;continue;}
   if(line){lines.push(line);line='';}
   if(measure(word)<=width){line=word;continue;}
   for(const char of graphemes(word)){if(line&&measure(line+char)>width){lines.push(line);line='';}line+=char;}
  }
  lines.push(line);
 }
 return lines.length?lines:[''];
}
export function estimateMeasure(style:TextStyle):MeasureText{
 return text=>Array.from(text).reduce((n,c)=>n+style.size*(/\s/.test(c)?.35:/[^\u0000-\u024f]/.test(c)?1:/[MW@#]/.test(c)?.95:/[A-Z]/.test(c)?.74:.64)+Math.max(0,style.letterSpacing),0);
}
export function estimatedTextBox(layer:TextLayer,width:number){
 const estimateStyle=layer.style.fontAccent?{...layer.style,size:layer.style.size*1.15}:layer.style;
 const rawMeasure=estimateMeasure(estimateStyle),measure=(text:string)=>rawMeasure(text)+(layer.style.maxWordsPerLine&&text.trim().split(/\s+/).length>layer.style.maxWordsPerLine?width:0),maxWidth=width*(layer.style.maxWidth??.86),lines=wrapText(styledText(layer),Math.max(1,maxWidth-32),measure);
 return {width:layer.style.maxWidth?maxWidth:Math.max(40,...lines.map(measure))+32,height:lines.length*estimateStyle.size*layer.style.lineHeight+24+2*(layer.style.strokeWidth+layer.style.shadow),lines:lines.length};
}
export function textBounds(p:EditorProject,c:Clip,layer:TextLayer){
 const [w,h]=dimensions[p.settings.aspectRatio],b=estimatedTextBox(layer,w),t=c.transform,r=t.rotation*Math.PI/180;
 const width=(Math.abs(b.width*Math.cos(r))+Math.abs(b.height*Math.sin(r)))*t.scale,height=(Math.abs(b.height*Math.cos(r))+Math.abs(b.width*Math.sin(r)))*t.scale;
 const anchor=captionVisualAnchor(p,c);return {left:w*anchor.x-width/2,right:w*anchor.x+width/2,top:h*anchor.y-height/2,bottom:h*anchor.y+height/2};
}
