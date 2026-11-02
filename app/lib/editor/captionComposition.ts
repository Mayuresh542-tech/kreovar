import type {EditorProject} from './model';
import {preserveCaptionAnchors} from './captionAnchors';
import {editorStyleFromStudio} from './captionStyleBridge';
import {readStudioData,readStudioStyle,resolvedStudioStyle,studioSegment} from './editorCaptionStudio';
import {resolveCaptionStyle} from '../captions/studioCanvas';
import {CAPTION_IN_OUT,type CaptionTransition} from '../captions/studioDesign';

const EMPHASIS_FONTS=['Inter','Montserrat','Poppins','Caveat'] as const;
export interface CaptionComposition {
 xPercent?:number;yPercent?:number;fontSize?:number;fontWeight?:number;maxWordsPerLine?:number;
 alignment?:'left'|'center'|'right';textColor?:string;emphasisColor?:string;
 emphasisWeight?:number;emphasisItalic?:boolean;emphasisScale?:number;emphasisFont?:typeof EMPHASIS_FONTS[number];
 emphasizedWords?:number[];build?:'accumulate'|'all';entrance?:CaptionTransition;exit?:CaptionTransition;transitionDuration?:number;
 layout?:'inline'|'stacked'|'hero'|'split'|'dynamic';
}
const fields=['xPercent','yPercent','fontSize','fontWeight','maxWordsPerLine','alignment','textColor','emphasisColor','emphasisWeight','emphasisItalic','emphasisScale','emphasisFont','emphasizedWords','build','entrance','exit','transitionDuration','layout'];
/** Closed AI presentation boundary. No arbitrary CSS, fonts, media or code is accepted. */
export function readCaptionComposition(value:unknown):CaptionComposition {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid caption composition.');
 const raw=value as Record<string,unknown>,out:Record<string,unknown>={};
 if(!Object.keys(raw).length||Object.keys(raw).some(k=>!fields.includes(k)))throw Error('Unsupported caption composition field.');
 const number=(key:string,min:number,max:number,integer=false)=>{if(raw[key]===undefined)return;const v=raw[key];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||integer&&!Number.isInteger(v))throw Error('Caption composition number is outside its supported range.');out[key]=v;};
 number('xPercent',5,95);number('yPercent',8,92);number('fontSize',8,160);number('fontWeight',100,900);number('maxWordsPerLine',1,8,true);number('emphasisWeight',100,900);number('emphasisScale',.8,1.6);number('transitionDuration',.05,1);
 const choice=(key:string,values:readonly string[])=>{if(raw[key]===undefined)return;if(typeof raw[key]!=='string'||!values.includes(raw[key]))throw Error('Unsupported caption composition option.');out[key]=raw[key];};
 choice('alignment',['left','center','right']);choice('build',['accumulate','all']);choice('layout',['inline','stacked','hero','split','dynamic']);choice('emphasisFont',EMPHASIS_FONTS);choice('entrance',CAPTION_IN_OUT);choice('exit',CAPTION_IN_OUT);
 for(const key of ['textColor','emphasisColor'])if(raw[key]!==undefined){if(typeof raw[key]!=='string'||!/^#[0-9a-f]{6}$/i.test(raw[key]))throw Error('Caption colors require a six-digit hex color.');out[key]=raw[key];}
 if(raw.emphasisItalic!==undefined){if(typeof raw.emphasisItalic!=='boolean')throw Error('Invalid caption emphasis.');out.emphasisItalic=raw.emphasisItalic;}
 if(raw.emphasizedWords!==undefined){if(!Array.isArray(raw.emphasizedWords)||raw.emphasizedWords.length>100||raw.emphasizedWords.some(v=>!Number.isInteger(v)||v<0||v>100))throw Error('Invalid emphasized word indexes.');out.emphasizedWords=[...new Set(raw.emphasizedWords)];}
 if(!Object.keys(out).length)throw Error('Specify at least one caption composition field.');return out as CaptionComposition;
}
/** Restyles one existing caption without rewriting speech, timings, or source animation clocks. */
export function composeCaption(project:EditorProject,clipId:string,presentation:CaptionComposition):EditorProject {
 const p=readCaptionComposition(presentation),clip=project.clips[clipId],caption=clip?.contentId?project.captions[clip.contentId]:undefined;
 if(!caption||!project.tracks[clip.trackId]||project.tracks[clip.trackId].locked)throw Error('Choose an unlocked caption clip.');
 const count=caption.words?.length||caption.text.trim().split(/\s+/).filter(Boolean).length;
 if(p.emphasizedWords?.some(i=>i>=count))throw Error('Emphasis must target an existing caption word.');
 const base=resolveCaptionStyle(studioSegment(project,clip),resolvedStudioStyle(caption));
 const studio={...base.studio,
  ...(p.xPercent===undefined?{}:{positionXPercent:p.xPercent}),...(p.layout===undefined?{}:{layout:p.layout}),
  ...(p.emphasisWeight===undefined?{}:{emphasisWeight:p.emphasisWeight}),...(p.emphasisItalic===undefined?{}:{emphasisItalic:p.emphasisItalic}),
  ...(p.emphasisScale===undefined?{}:{emphasisScale:p.emphasisScale}),...(p.emphasisFont===undefined?{}:{emphasisFont:p.emphasisFont}),
  ...(p.entrance===undefined?{}:{entrance:p.entrance}),...(p.exit===undefined?{}:{exit:p.exit}),...(p.transitionDuration===undefined?{}:{transitionDuration:p.transitionDuration}),
  ...(p.textColor===undefined?{}:{gradient:null}),...(p.emphasisColor===undefined?{}:{emphasisGradient:null}),
 };
 const style=readStudioStyle({...base,studio,
  ...(p.yPercent===undefined?{}:{position:'custom',positionYPercent:p.yPercent}),
  ...(p.fontSize===undefined?{}:{fontSize:p.fontSize}),...(p.fontWeight===undefined?{}:{fontWeight:p.fontWeight}),
  ...(p.maxWordsPerLine===undefined?{}:{maxWordsPerLine:p.maxWordsPerLine}),...(p.alignment===undefined?{}:{alignment:p.alignment}),
  ...(p.textColor===undefined?{}:{textColor:p.textColor}),...(p.emphasisColor===undefined?{}:{highlightColor:p.emphasisColor}),...((p.emphasisColor===undefined&&p.emphasizedWords===undefined)?{}:{highlightingMode:'keyword'}),
  ...(p.build===undefined?{}:{animation:p.build==='accumulate'?'word-by-word':'fade'}),
 });
 const data=readStudioData({...caption.studioData,styleOverride:style,...(p.emphasizedWords===undefined?{}:{emphasizedWords:p.emphasizedWords})});
 let next:EditorProject={...project,captions:{...project.captions,[caption.id]:{...caption,studioStyle:style,studioData:data,style:editorStyleFromStudio(style,project)}}};
 next=preserveCaptionAnchors(project,next,[clipId]);
 if(p.xPercent!==undefined||p.yPercent!==undefined){const current=next.clips[clipId],transform={...current.transform,...(p.xPercent===undefined?{}:{x:0}),...(p.yPercent===undefined?{}:{y:0})};
  // Explicit layout replaces the baseline position while keeping relative authored motion.
  const keyframes=current.keyframes?.map(f=>({...f,value:{...f.value,...(p.xPercent===undefined?{}:{x:f.value.x-current.transform.x}),...(p.yPercent===undefined?{}:{y:f.value.y-current.transform.y})}}));
  next={...next,clips:{...next.clips,[clipId]:{...current,transform,...(keyframes?{keyframes}:{})}}};
 }
 return next;
}
