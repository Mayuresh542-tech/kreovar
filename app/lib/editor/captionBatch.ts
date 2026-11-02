import {addCaption} from './operations';
import type {EditorProject} from './model';
import type {TimedCaption} from './captionTiming';
export interface CaptionBatch {clipId:string;signature:string;captions:TimedCaption[]}
export function captionSourceSignature(p:EditorProject,id:string){const c=p.clips[id],a=c?.assetId?p.assets[c.assetId]:undefined;return JSON.stringify([c,a?{id:a.id,localKey:a.localKey,libraryId:a.libraryId,sourceKey:a.cloud?.sourceKey,size:a.size,duration:a.duration}:null]);}
export function checkCaptionSources(p:EditorProject,ids:string[]){
 if(!ids.length||new Set(ids).size!==ids.length)throw new Error('Choose footage to transcribe.');
 if(!Object.values(p.tracks).some(t=>t.kind==='caption'&&!t.locked))throw new Error('Add or unlock a caption track first.');
 for(const id of ids){const c=p.clips[id],a=c?.assetId?p.assets[c.assetId]:undefined;if(!c||!a||a.kind==='image'||p.tracks[c.trackId].locked)throw new Error('Choose unlocked audio/video clips.');
  if(c.startTime+c.duration>60+.000001)throw new Error('Caption generation supports a timeline up to 60 seconds.');
  if(Object.values(p.clips).some(cap=>cap.contentId&&p.captions[cap.contentId]&&cap.startTime<c.startTime+c.duration&&cap.startTime+cap.duration>c.startTime))throw new Error('Captions already overlap this footage. Remove the older caption clips before generating again.');
 }
}
export function applyCaptionBatch(p:EditorProject,batches:CaptionBatch[]){
 checkCaptionSources(p,batches.map(b=>b.clipId));
 for(const batch of batches){if(captionSourceSignature(p,batch.clipId)!==batch.signature)throw new Error('Source footage changed during transcription. Generate captions again.');const clip=p.clips[batch.clipId];if(!batch.captions.length||batch.captions.some(c=>!c.text.trim()||!Number.isFinite(c.start)||!Number.isFinite(c.duration)||c.duration<=0||c.start<clip.startTime-.001||c.start+c.duration>clip.startTime+clip.duration+.001))throw new Error('Transcription timing falls outside its source clip.');}
 return batches.reduce((q,b)=>{const clip=p.clips[b.clipId];return b.captions.reduce((next,c)=>{const duration=Math.min(clip.duration,Math.max(1/p.settings.fps,c.duration)),start=Math.max(clip.startTime,Math.min(c.start,clip.startTime+clip.duration-duration));return addCaption(next,c.text,start,duration,{},c.words?.map(w=>({...w,start:Math.max(0,w.start+c.start-start),end:Math.min(duration,w.end+c.start-start)})).filter(w=>w.end>=w.start));},q);},p);
}
