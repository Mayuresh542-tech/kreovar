import {speechContext} from './speechContext';
import {type EditorProject,type Clip} from './model';
export interface EditorialBeat {start:number;end:number;text:string;reason:string;numeric:boolean}
/** Observable transcript cues, never invented visual understanding or silence detection. */
export function editorialBeats(p:EditorProject,footage:Clip[]):EditorialBeat[]{
 const seen=new Set<string>(),candidates:EditorialBeat[]=[];
 for(const line of speechContext(p)){
  if(!line.words?.length)continue;
  for(let i=0;i<line.words.length;i++){
   const w=line.words[i],token=w.word.replace(/[\p{P}]/gu,'').toLocaleLowerCase(),numeric=/\p{N}/u.test(token);
   if(!numeric&&!/^(important|remember|tip|step|key|focus|because|first|second|third|zaroori|jaruri|dhyan|yaad|pehle|पहले|जरूरी|याद|ध्यान|सीख|पहला|दूसरा)$/iu.test(token))continue;
   const source=footage.find(c=>w.start>=c.startTime&&w.end<=c.startTime+c.duration);if(!source)continue;
   const phrase=[];for(const word of line.words.slice(i,i+5)){phrase.push(word);if(/[.!?।]$/.test(word.word))break;}
   const text=phrase.map(w=>w.word).join(' '),start=w.start,end=Math.min(source.startTime+source.duration,Math.max(w.end+.8,Math.min(start+3.2,phrase.at(-1)!.end+.25)));
   if(end-start<.8||text.length>80||seen.has(text.toLocaleLowerCase()))continue;
   seen.add(text.toLocaleLowerCase());candidates.push({start,end,text,reason:numeric?'A number stated in the timed transcript':'An emphasis cue stated in the timed transcript',numeric});
  }
 }
 const chosen:EditorialBeat[]=[];for(const beat of candidates.sort((a,b)=>a.start-b.start))if(chosen.every(b=>Math.abs(b.start-beat.start)>=5&&!(b.start<beat.end&&b.end>beat.start))){chosen.push(beat);if(chosen.length===3)break;}
 return chosen;
}
