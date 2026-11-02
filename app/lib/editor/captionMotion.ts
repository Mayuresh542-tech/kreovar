import {type Caption,type CaptionMotion,type Clip,type EditorProject} from "./model";
/** No synthesized timings: edited/manual/SRT captions fall back to a full line. */
export function captionMotionFrame(caption:Caption,clip:Clip,time:number){
 const clock=clip.sourceStart+(time-clip.startTime)*clip.speed;
 const words=caption.words?.filter(w=>Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.end>=w.start);
 const timed=!!words?.length&&words.map(w=>w.word).join(" ").trim()===caption.text.trim();
 const motion=caption.motion||"none";
 return {text:motion==="word-reveal"&&timed?words!.filter(w=>w.start<=clock).map(w=>w.word).join(" "):caption.text,
 active:motion==="karaoke"&&timed?words!.findIndex(w=>clock>=w.start&&clock<w.end):-1,
 scale:motion==="pop"?1-.12*Math.pow(1-Math.max(0,Math.min(1,(time-clip.startTime)/.16)),3):1};
}
export function setCaptionMotion(p:EditorProject,ids:string[],motion:CaptionMotion,highlightColor="#d9ff43"):EditorProject{
 if(!["none","pop","word-reveal","karaoke"].includes(motion)||!/^#[0-9a-f]{6}$/i.test(highlightColor))throw new Error("Choose a supported caption animation and colour.");
 const captions={...p.captions};
 for(const id of new Set(ids)){const c=p.clips[id];if(!c?.contentId||!captions[c.contentId]||p.tracks[c.trackId].locked)throw new Error("Select unlocked captions.");const caption=captions[c.contentId];captions[c.contentId]={...caption,motion,highlightColor,...(caption.studioStyle?{studioStyle:{...caption.studioStyle,highlightColor,highlightingMode:motion==="karaoke"?"current-word":"full-line",animation:motion==="word-reveal"?"word-by-word":motion==="pop"?"pop":"fade",studio:{...caption.studioStyle.studio,entrance:motion==="pop"?"pop":"none",hold:"none"}}}:{})};}
 return {...p,captions};
}
