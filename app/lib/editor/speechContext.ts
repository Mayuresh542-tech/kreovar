import type {EditorProject} from './model';

type SpeechContextItem = {
  clipId: string;
  start: number;
  end: number;
  text: string;
  words?: { word: string; start: number; end: number }[];
};

const speechContextCache = new WeakMap<
  EditorProject,
  {
    revision: number;
    clipsRef: EditorProject['clips'];
    captionsRef: EditorProject['captions'];
    tracksRef: EditorProject['tracks'];
    trackSig: string;
    clipCount: number;
    captionCount: number;
    items: SpeechContextItem[];
  }
>();

function keyCount(obj: Record<string, unknown>): number {
  let count = 0;
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) count++;
  }
  return count;
}

function trackFlagsSignature(tracks: EditorProject['tracks']): string {
  let sig = '';
  for (const id in tracks) {
    const t = tracks[id];
    sig += `${id}:${t.hidden ? 1 : 0}${t.muted ? 1 : 0};`;
  }
  return sig;
}

/** Real timed words support keyword edits, never claims of measured silence or visual understanding. */
export function speechContext(project:EditorProject){
 const clipCount = keyCount(project.clips);
 const captionCount = keyCount(project.captions);
 const trackSig = trackFlagsSignature(project.tracks);
 const cached = speechContextCache.get(project);
 if (
   cached &&
   cached.revision === project.revision &&
   cached.clipsRef === project.clips &&
   cached.captionsRef === project.captions &&
   cached.tracksRef === project.tracks &&
   cached.trackSig === trackSig &&
   cached.clipCount === clipCount &&
   cached.captionCount === captionCount
 ) {
   return cached.items;
 }
 const items = Object.values(project.clips).filter(c=>c.contentId&&project.captions[c.contentId]&&!project.tracks[c.trackId]?.hidden).sort((a,b)=>a.startTime-b.startTime).map(c=>{
  const caption=project.captions[c.contentId!];
  const words=caption.words?.filter(w=>w.end>c.sourceStart&&w.start<c.sourceEnd).map(w=>({word:w.word,start:Math.max(c.startTime,c.startTime+(w.start-c.sourceStart)/c.speed),end:Math.min(c.startTime+c.duration,c.startTime+(w.end-c.sourceStart)/c.speed)}));
  return {clipId:c.id,start:c.startTime,end:c.startTime+c.duration,text:caption.text,...(words?.length?{words}:{})};
 });
 speechContextCache.set(project, {
   revision: project.revision,
   clipsRef: project.clips,
   captionsRef: project.captions,
   tracksRef: project.tracks,
   trackSig,
   clipCount,
   captionCount,
   items,
 });
 return items;
}
