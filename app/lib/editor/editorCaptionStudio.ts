import {type EditorProject,type Clip,type Caption,defaultTransform} from './model';
import {editorStyleFromStudio} from './captionStyleBridge';
import {CAPTION_IN_OUT} from '../captions/studioDesign';
import {addCaption,removeClip} from './operations';
import {keyframeTransform} from './keyframes';
import type {CaptionSegment} from '../captions/presets';
import {DEFAULT_CAPTION_TEMPLATES,type CaptionStyleConfig} from '../captions/templates';
import {referenceCaptionTemplate,ALL_CAPTION_TEMPLATES} from '../captions/referenceTemplates';
import {loadCaptionDocumentFonts} from '../captions/studioFonts';
export type StudioCaptionData=Pick<CaptionSegment,'templateId'|'styleOverride'|'emphasizedWords'|'wordStyles'>;
function safe(value:unknown,depth=0):unknown{
 if(depth>7)throw Error('Caption style is too deeply nested.');
 if(value===null||value===undefined||typeof value==='boolean')return value;
 if(typeof value==='string'){if(value.length>600)throw Error('Caption style text is too long.');return value;}
 if(typeof value==='number'){if(!Number.isFinite(value)||Math.abs(value)>86400)throw Error('Invalid caption style number.');return value;}
 if(Array.isArray(value)){if(value.length>500)throw Error('Caption style has too many items.');return value.map(v=>safe(v,depth+1));}
 if(typeof value!=='object')throw Error('Invalid caption style.');
 const out:Record<string,unknown>={};if(Object.keys(value).length>100)throw Error('Caption style has too many fields.');for(const [k,v]of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(k))throw Error('Invalid caption style field.');out[k]=safe(v,depth+1);}return out;
}
export function readStudioStyle(value:unknown):CaptionStyleConfig{
 const s=safe(value) as CaptionStyleConfig;
 if(!s||typeof s.fontFamily!=='string'||s.fontFamily.length>200||!Number.isFinite(s.fontSize)||s.fontSize<8||s.fontSize>160||!Number.isFinite(s.fontWeight)||s.fontWeight<100||s.fontWeight>900||!['top','center','bottom','custom'].includes(s.position)||!['left','center','right'].includes(s.alignment)||!['none','uppercase','capitalize'].includes(s.textTransform)||!['keyword','current-word','alternating','full-line','cumulative'].includes(s.highlightingMode)||!Number.isFinite(s.animationSpeed)||s.animationSpeed<.01||s.animationSpeed>10||!Number.isInteger(s.maxWordsPerLine)||s.maxWordsPerLine<1||s.maxWordsPerLine>100||!Number.isFinite(s.lineSpacing)||s.lineSpacing<.5||s.lineSpacing>3||typeof s.textColor!=='string'||typeof s.highlightColor!=='string'||typeof s.letterSpacing!=='string'||!Number.isFinite(parseFloat(s.letterSpacing))||Math.abs(parseFloat(s.letterSpacing))>1)throw Error('Invalid Caption Studio style.');
 return s;
}
export function readStudioData(value:unknown):StudioCaptionData{
 const d=safe(value) as StudioCaptionData;if(!d||typeof d!=='object'||Array.isArray(d))throw Error('Invalid caption word styling.');
 if(d.templateId!==undefined&&(typeof d.templateId!=='string'||!studioTemplate(d.templateId)))throw Error('Unknown line template.');
 if(d.emphasizedWords!==undefined&&(!Array.isArray(d.emphasizedWords)||d.emphasizedWords.some(n=>!Number.isInteger(n)||n<0||n>499)))throw Error('Invalid emphasized word indexes.');
 if(d.wordStyles!==undefined){if(!d.wordStyles||typeof d.wordStyles!=='object'||Array.isArray(d.wordStyles))throw Error('Invalid word effects.');for(const [k,v]of Object.entries(d.wordStyles))if(!/^\d+$/.test(k)||Number(k)>499||!v||typeof v!=='object'||v.entrance!==undefined&&!CAPTION_IN_OUT.includes(v.entrance)||v.spotlight!==undefined&&typeof v.spotlight!=='boolean')throw Error('Invalid word effect.');}
 if(d.styleOverride){const base=DEFAULT_CAPTION_TEMPLATES.find(t=>t.id==='clean-sub')!.style;readStudioStyle({...base,...d.styleOverride});}return d;
}
export function studioSegment(p:EditorProject,c:Clip):CaptionSegment{
 const caption=p.captions[c.contentId!],all=caption.words||[],indices=all.map((w,i)=>({w,i})).filter(({w})=>w.end>c.sourceStart&&w.start<c.sourceEnd),data=caption.studioData||{};
 const words=indices.map(({w})=>({word:w.word,start:Math.max(c.startTime,c.startTime+(w.start-c.sourceStart)/c.speed),end:Math.min(c.startTime+c.duration,c.startTime+(w.end-c.sourceStart)/c.speed)}));
 return {id:c.id,text:words.length?words.map(w=>w.word).join(' '):caption.text,start:c.startTime,end:c.startTime+c.duration,words,...data,...(data.emphasizedWords?{emphasizedWords:indices.map(({i},n)=>data.emphasizedWords!.includes(i)?n:-1).filter(n=>n>=0)}:{}),...(data.wordStyles?{wordStyles:Object.fromEntries(indices.filter(({i})=>data.wordStyles![i]).map(({i})=>[indices.findIndex(v=>v.i===i),data.wordStyles![i]]))}:{})};
}
export function studioCaptions(p:EditorProject){return Object.values(p.clips).filter(c=>c.contentId&&p.captions[c.contentId]).sort((a,b)=>a.startTime-b.startTime).map(c=>studioSegment(p,c));}
export function applyStudioStyle(p:EditorProject,ids:string[],style:CaptionStyleConfig):EditorProject{
 const clean=readStudioStyle(style);let next=p;for(const id of ids){const c=next.clips[id],caption=c?.contentId?next.captions[c.contentId]:undefined;if(!caption||next.tracks[c.trackId].locked)throw Error('Choose unlocked caption clips.');next={...next,clips:{...next.clips,[id]:{...c,transform:caption.studioStyle?c.transform:{...c.transform,x:0,y:0}}},captions:{...next.captions,[caption.id]:{...caption,style:editorStyleFromStudio(clean,next),studioStyle:clean}}};}return next;
}
export function replaceStudioCaptions(p:EditorProject,ids:string[],segments:CaptionSegment[],fallback:CaptionStyleConfig):EditorProject{
 const originals=new Map(ids.map(id=>[id,p.clips[id]])),first=originals.values().next().value as Clip|undefined;
 if(!first)throw Error('Add captions first.');for(const c of originals.values())if(!c||!c.contentId||!p.captions[c.contentId]||p.tracks[c.trackId].locked)throw Error('Unlock the caption tracks before editing.');
 let next=p;for(const id of ids)next=removeClip(next,id);
 for(const s of segments){if(!s.text.trim()||!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.start<0||s.end<=s.start||s.end>60||s.id.length>200||['__proto__','prototype','constructor'].includes(s.id)||next.clips[s.id])throw Error('Invalid caption timing or identifier.');
  const old=originals.get(s.id),oldCaption=old?.contentId?p.captions[old.contentId]:undefined,style=oldCaption?.studioStyle||fallback,sourceWords=s.words.map(w=>({word:w.word,start:w.start-s.start,end:w.end-s.start}));
  const before=next;next=addCaption(next,s.text,s.start,s.end-s.start,oldCaption?.style||{font:'Inter',size:48},sourceWords.length?sourceWords:undefined);const generated=Object.keys(next.clips).find(id=>!before.clips[id])!,c=next.clips[generated],contentId=c.contentId!,clips={...next.clips};delete clips[generated];
  const sourceKeys=old?.keyframes?.filter(k=>k.sourceTime>=old.sourceStart&&k.sourceTime<=old.sourceEnd).map(k=>({...k,sourceTime:(k.sourceTime-old.sourceStart)/old.speed}));
  if(old?.keyframes?.length&&!sourceKeys?.some(k=>k.sourceTime===0))sourceKeys?.unshift({sourceTime:0,value:keyframeTransform(old,old.startTime),easing:'linear'});
  clips[s.id]={...c,id:s.id,trackId:old?.trackId||first.trackId,transform:oldCaption?.studioStyle&&old?old.transform:{...defaultTransform},...(sourceKeys?.length?{keyframes:sourceKeys}:{})};
  const tracks={...next.tracks};tracks[c.trackId]={...tracks[c.trackId],clipIds:tracks[c.trackId].clipIds.filter(id=>id!==generated)};const target=clips[s.id].trackId;tracks[target]={...tracks[target],clipIds:[...tracks[target].clipIds,s.id]};
  const data:StudioCaptionData={...(s.templateId?{templateId:s.templateId}:{}),...(s.styleOverride?{styleOverride:s.styleOverride}:{}),...(s.emphasizedWords?{emphasizedWords:s.emphasizedWords}:{}),...(s.wordStyles?{wordStyles:s.wordStyles}:{})};
  next={...next,tracks,clips,captions:{...next.captions,[contentId]:{...oldCaption,...next.captions[contentId],id:contentId,words:sourceWords.length?sourceWords:undefined,studioStyle:readStudioStyle(style),studioData:readStudioData(data)}}};
 }
 return next;
}
export async function loadEditorStudioFonts(p:EditorProject){await Promise.all(Object.values(p.clips).filter(c=>c.contentId&&p.captions[c.contentId]?.studioStyle).map(c=>loadCaptionDocumentFonts([studioSegment(p,c)],p.captions[c.contentId!].studioStyle!)));}
export function resolvedStudioStyle(caption:Caption):CaptionStyleConfig{return caption.studioStyle||DEFAULT_CAPTION_TEMPLATES.find(t=>t.id==='clean-sub')!.style;}
export function studioTemplate(id:string){return referenceCaptionTemplate(id)||ALL_CAPTION_TEMPLATES.find(t=>t.id===id);}
export function studioCaptionBounds(style:CaptionStyleConfig,width:number,height:number){const y=style.position==='top'?18:style.position==='center'?50:style.position==='bottom'?80:style.positionYPercent??80;return{x:(style.studio?.positionXPercent??50)/100*width,y:y/100*height,width:width*.86,height:Math.min(height*.7,style.fontSize*Math.min(width,height)/720*(style.studio?.emphasisScale||1)*3)};}
