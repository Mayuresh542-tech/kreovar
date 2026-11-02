import {dimensions,type EditorProject,type TextStyle} from './model';
import type {CaptionStyleConfig} from '../captions/templates';
export function editorStyleFromStudio(s:CaptionStyleConfig,p:EditorProject):TextStyle{
 const scale=Math.min(...dimensions[p.settings.aspectRatio])/720,size=s.fontSize*scale;
 return {font:s.fontFamily,fontAccent:s.fontAccent||null,size,weight:s.fontWeight,align:s.alignment,color:s.textColor,background:s.containerBg||'transparent',stroke:s.strokeColor||'#000000',strokeWidth:(s.strokeWidth||0)*scale,shadow:(s.shadowBlur||0)*scale,letterSpacing:(parseFloat(s.letterSpacing)||0)*size,lineHeight:s.lineSpacing,casing:s.textTransform,maxWordsPerLine:s.maxWordsPerLine,gradient:s.studio?.gradient?{angle:s.studio.gradient.angle,stops:s.studio.gradient.stops||[{offset:0,color:s.studio.gradient.from},{offset:1,color:s.studio.gradient.to}]}:null};
}
export function studioStyleFromEditor(s:CaptionStyleConfig,patch:Partial<TextStyle>,p:EditorProject):CaptionStyleConfig{
 const scale=Math.min(...dimensions[p.settings.aspectRatio])/720,next={...s};
 if(patch.font!==undefined)next.fontFamily=patch.font;if(patch.size!==undefined)next.fontSize=Math.max(8,Math.min(160,patch.size/scale));if(patch.weight!==undefined)next.fontWeight=patch.weight;if(patch.align!==undefined)next.alignment=patch.align;
 if(patch.color!==undefined)next.textColor=patch.color;if(patch.background!==undefined)next.containerBg=patch.background;if(patch.stroke!==undefined)next.strokeColor=patch.stroke;if(patch.strokeWidth!==undefined)next.strokeWidth=patch.strokeWidth/scale;
 if(patch.shadow!==undefined)next.shadowBlur=patch.shadow/scale;if(patch.letterSpacing!==undefined)next.letterSpacing=patch.letterSpacing/Math.max(1,next.fontSize*scale)+'em';if(patch.lineHeight!==undefined)next.lineSpacing=patch.lineHeight;if(patch.casing!==undefined)next.textTransform=patch.casing;if(patch.maxWordsPerLine!==undefined)next.maxWordsPerLine=patch.maxWordsPerLine;if(patch.fontAccent!==undefined)next.fontAccent=patch.fontAccent;
 if(patch.gradient!==undefined)next.studio={...next.studio,gradient:patch.gradient?{angle:patch.gradient.angle,from:patch.gradient.stops[0].color,to:patch.gradient.stops.at(-1)!.color,stops:patch.gradient.stops}:null};
 return next;
}
