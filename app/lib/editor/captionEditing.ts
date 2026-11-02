import {mergeCaptions,changeText} from './operations';
import {MAX_VIDEO_SECONDS} from './limits';
import type {EditorProject} from './model';
export function editCaption(p:EditorProject,id:string,text:string,start:number,end:number):EditorProject{
 const c=p.clips[id];if(!c?.contentId||!p.captions[c.contentId])throw new Error('This caption is unavailable.');
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>MAX_VIDEO_SECONDS||end-start<1/p.settings.fps-1e-7)throw new Error('Use a valid start and end within 60 seconds, at least one frame apart.');
 if(text.length>5000)throw new Error('Caption text is too long.');
 const next=changeText(p,id,text);
 if(start!==c.startTime||end!==c.startTime+c.duration){const layer=next.captions[c.contentId];next.captions={...next.captions,[c.contentId]:{...layer,words:undefined}};}
 return {...next,clips:{...next.clips,[id]:{...next.clips[id],startTime:start,duration:end-start,sourceStart:0,sourceEnd:end-start}}};
}

/** Join only adjacent lines on the same track without crossing a long silence. */
export function nextCaptionToMerge(p:EditorProject,id:string){
 const c=p.clips[id];if(!c?.contentId||!p.captions[c.contentId]||p.tracks[c.trackId].locked)return;
 const rows=Object.values(p.clips).filter(row=>row.trackId===c.trackId&&row.contentId&&p.captions[row.contentId]).sort((a,b)=>a.startTime-b.startTime),next=rows[rows.findIndex(row=>row.id===id)+1];
 if(!next||next.startTime<c.startTime+c.duration-1e-6||next.startTime-c.startTime-c.duration>.35||next.startTime+next.duration-c.startTime>5)return;
 const a=p.captions[c.contentId],b=p.captions[next.contentId!];
 if((a.text+' '+b.text).length>84||JSON.stringify(a.style)!==JSON.stringify(b.style)||JSON.stringify(c.transform)!==JSON.stringify(next.transform))return;
 return next.id;
}
export function mergeCaptionWithNext(p:EditorProject,id:string){const next=nextCaptionToMerge(p,id);if(!next)throw new Error('Choose adjacent unlocked caption lines with matching styles, up to 84 characters and five seconds.');return mergeCaptions(p,[id,next]);}
