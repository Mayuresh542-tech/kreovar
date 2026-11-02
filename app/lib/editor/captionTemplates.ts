import type {EditorProject,TextStyle} from "./model";
import {dimensions} from "./model";
import type {CaptionTemplate} from "../captions/templates";
import {ALL_CAPTION_TEMPLATES as DEFAULT_CAPTION_TEMPLATES} from "../captions/referenceTemplates";
import {addCaption,changeText,changeClipProperty} from "./operations";
export function captionTemplateStyle(template:CaptionTemplate,project:EditorProject):TextStyle{
 const s=template.style,scale=Math.min(...dimensions[project.settings.aspectRatio])/720;
 const size=Math.max(8,Math.min(400,s.fontSize*scale));
 return {fontAccent:s.fontAccent||null,maxWordsPerLine:s.maxWordsPerLine,gradient:null,font:s.fontFamily.split(",")[0].replace(/['"]/g,"").trim(),size,weight:s.fontWeight,align:s.alignment,color:s.highlightingMode==="full-line"?s.highlightColor:s.textColor,background:s.containerBg||"transparent",stroke:s.strokeColor||"#000000",strokeWidth:(s.strokeWidth||0)*scale,shadow:(s.shadowBlur||0)*scale,letterSpacing:(parseFloat(s.letterSpacing)||0)*size,lineHeight:s.lineSpacing,casing:s.textTransform};
}
export function applyCaptionTemplate(project:EditorProject,ids:string[],template:CaptionTemplate):EditorProject{
 if(!ids.length)throw new Error("Add or select captions before applying a template.");
 const style=captionTemplateStyle(template,project),s=template.style;
 const y=(s.position==="top"?18:s.position==="center"?50:s.position==="custom"?(s.positionYPercent??80):80)/100-.5;
 return [...new Set(ids)].reduce((p,id)=>{const clip=p.clips[id],caption=clip?.contentId?p.captions[clip.contentId]:undefined;if(!caption)throw new Error("Select caption clips to apply a caption template.");const styled=changeClipProperty(changeText(p,id,caption.text,style),id,{transform:{...clip.transform,x:0,y:s.studio?0:y,scale:1,rotation:0}});return {...styled,captions:{...styled.captions,[caption.id]:{...styled.captions[caption.id],studioStyle:s.studio?s:undefined,studioData:undefined,motion:s.highlightingMode==='current-word'?'karaoke':(caption.motion==='karaoke'?'none':caption.motion||'none'),highlightMode:s.highlightingMode,highlightWords:s.highlightWords||'',highlightColor:s.highlightColor}}};},project);
}

export function addTemplatedCaption(project:EditorProject,text:string,time:number,duration:number,templateId?:string,words?:import("./model").CaptionWord[]):EditorProject{
 const template=templateId?DEFAULT_CAPTION_TEMPLATES.find(t=>t.id===templateId):undefined;
 if(templateId&&!template)throw new Error('Unknown caption template.');
 const next=addCaption(project,text,time,duration,{},words);
 return template?applyCaptionTemplate(next,Object.keys(next.clips).filter(id=>!project.clips[id]),template):next;
}
