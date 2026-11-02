import type {EditorProject} from './model';
/** Real timed words support keyword edits, never claims of measured silence or visual understanding. */
export function speechContext(project:EditorProject){
 return Object.values(project.clips).filter(c=>c.contentId&&project.captions[c.contentId]&&!project.tracks[c.trackId].hidden).sort((a,b)=>a.startTime-b.startTime).map(c=>{
  const caption=project.captions[c.contentId!];
  const words=caption.words?.filter(w=>w.end>c.sourceStart&&w.start<c.sourceEnd).map(w=>({word:w.word,start:Math.max(c.startTime,c.startTime+(w.start-c.sourceStart)/c.speed),end:Math.min(c.startTime+c.duration,c.startTime+(w.end-c.sourceStart)/c.speed)}));
  return {clipId:c.id,start:c.startTime,end:c.startTime+c.duration,text:caption.text,...(words?.length?{words}:{})};
 });
}
