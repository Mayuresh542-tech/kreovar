import type {CaptionSegment} from './presets';
const tagged=(s:CaptionSegment)=>s.words.map((word,i)=>({word,emphasis:!!s.emphasizedWords?.includes(i),style:s.wordStyles?.[i]}));
const wordsChanged=(s:CaptionSegment,entries:ReturnType<typeof tagged>)=>({...s,words:entries.map(v=>v.word),text:entries.map(v=>v.word.word).join(' '),emphasizedWords:entries.flatMap((v,i)=>v.emphasis?[i]:[]),wordStyles:Object.fromEntries(entries.flatMap((v,i)=>v.style?[[i,v.style]]:[]))});
export function deleteCaptionWord(rows:CaptionSegment[],id:string,index:number){return rows.flatMap(s=>s.id!==id?[s]:s.words.length>1?[wordsChanged(s,tagged(s).filter((_,i)=>i!==index))]:[]);}
export function moveBoundaryWord(rows:CaptionSegment[],id:string,index:number,direction:'previous'|'next'){
 const at=rows.findIndex(s=>s.id===id),s=rows[at],target=rows[at+(direction==='previous'?-1:1)];
 if(!s||!target||!s.words[index]||!target.words.length)throw Error('Both caption lines need word timings.');
 if(direction==='previous'&&index!==0||direction==='next'&&index!==s.words.length-1)throw Error('Move the first word to the previous line or the last word to the next line.');
 const entry=tagged(s)[index],word=entry.word,remaining=tagged(s).filter((_,i)=>i!==index),nextSource=wordsChanged(s,remaining),nextTarget=wordsChanged(target,direction==='previous'?[...tagged(target),entry]:[entry,...tagged(target)]);
 if(direction==='previous'){nextTarget.end=word.end;if(remaining.length)nextSource.start=remaining[0].word.start;}else{nextTarget.start=word.start;if(remaining.length)nextSource.end=remaining.at(-1)!.word.end;}
 return rows.flatMap(row=>row.id===target.id?[nextTarget]:row.id===s.id?remaining.length?[nextSource]:[]:[row]);
}
export function replaceCaptionText(rows:CaptionSegment[],search:string,replacement:string){
 if(!search||search.length>200||replacement.length>200)throw Error('Enter a search term up to 200 characters.');
 return rows.map(s=>{if(!s.text.includes(search))return s;const text=s.text.replaceAll(search,replacement),tokens=text.trim().split(/\s+/).filter(Boolean),same=tokens.length===s.words.length;return {...s,text,words:same?s.words.map((w,i)=>({...w,word:tokens[i]})):[],emphasizedWords:same?s.emphasizedWords:undefined,wordStyles:same?s.wordStyles:undefined};}).filter(s=>s.text.trim());
}
