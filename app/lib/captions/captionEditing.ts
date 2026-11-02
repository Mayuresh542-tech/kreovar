import type {CaptionSegment} from './presets';
const valid=(s:CaptionSegment)=>Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.start>=0&&s.end>s.start;
export function shiftCaptionTimes(rows:CaptionSegment[],delta:number,limit=60){
 if(!Number.isFinite(delta)||Math.abs(delta)>10)throw Error('Use a caption delay from -5 to +5 seconds.');
 if(rows.some(s=>s.start+delta< -1e-7||s.end+delta>limit+1e-7))throw Error('This delay would move captions outside the video.');
 return rows.map(s=>({...s,start:Math.max(0,s.start+delta),end:s.end+delta,words:s.words.map(w=>({...w,start:Math.max(0,w.start+delta),end:w.end+delta}))}));
}
export function removeCaptionPunctuation(rows:CaptionSegment[]){
 const clean=(s:string)=>s.replace(/\p{P}+/gu,'');
 return rows.map(s=>({...s,text:clean(s.text),words:s.words.map(w=>({...w,word:clean(w.word)})).filter(w=>w.word.trim()),emphasizedWords:[]})).filter(s=>s.text.trim());
}
export function closeCaptionGaps(rows:CaptionSegment[]){const sorted=[...rows].sort((a,b)=>a.start-b.start);return sorted.map((s,i)=>i<sorted.length-1&&s.end<sorted[i+1].start?{...s,end:sorted[i+1].start}:s);}
export function regroupCaptions(rows:CaptionSegment[],wordsPerGroup:number,maxChars:number){
 if(!Number.isInteger(wordsPerGroup)||wordsPerGroup<1||wordsPerGroup>12||!Number.isInteger(maxChars)||maxChars<5||maxChars>120)throw Error('Choose 1–12 words and 5–120 characters per caption.');
 if(rows.some(s=>!s.words.length))throw Error('Regrouping needs real word timings. SRT/script captions can be split manually.');
 const source=[...rows].sort((a,b)=>a.start-b.start).flatMap(s=>s.words.map((w,i)=>({w,source:s,emphasis:!!s.emphasizedWords?.includes(i),wordStyle:s.wordStyles?.[i]})));
 const result:CaptionSegment[]=[],group:typeof source=[];
 const flush=()=>{if(!group.length)return;const first=group[0].source;result.push({...first,id:first.id+'-group-'+result.length,start:group[0].w.start,end:group.at(-1)!.w.end,text:group.map(v=>v.w.word).join(' '),words:group.map(v=>({...v.w})),emphasizedWords:group.flatMap((v,i)=>v.emphasis?[i]:[]),wordStyles:Object.fromEntries(group.flatMap((v,i)=>v.wordStyle?[[i,v.wordStyle]]:[]))});group.length=0;};
 for(const item of source){if(group.length&&(group.length>=wordsPerGroup||group.map(v=>v.w.word).join(' ').length+1+item.w.word.length>maxChars||item.w.start-group.at(-1)!.w.end>.7||item.source.templateId!==group[0].source.templateId))flush();group.push(item);}flush();
 if(result.some(s=>!valid(s)))throw Error('Word timings need correction before regrouping.');return result;
}
export function splitCaption(rows:CaptionSegment[],id:string,index?:number){
 const at=rows.findIndex(s=>s.id===id),s=rows[at];if(!s)throw Error('Caption unavailable.');
 const strings=s.text.trim().split(/\s+/),cut=index??Math.ceil(strings.length/2);if(cut<=0||cut>=strings.length)throw Error('This caption needs at least two words to split.');
 const timing=s.words.length===strings.length?s.words:undefined,mid=timing?timing[cut].start:s.start+(s.end-s.start)*cut/strings.length;
 if(mid<=s.start||mid>=s.end)throw Error('No valid split point.');
 const styles=Object.entries(s.wordStyles||{});
 const a={...s,end:mid,text:strings.slice(0,cut).join(' '),words:timing?timing.slice(0,cut):[],emphasizedWords:s.emphasizedWords?.filter(i=>i<cut),wordStyles:Object.fromEntries(styles.filter(([i])=>Number(i)<cut))},b={...s,id:s.id+'-split-'+crypto.randomUUID(),start:mid,text:strings.slice(cut).join(' '),words:timing?timing.slice(cut):[],emphasizedWords:s.emphasizedWords?.filter(i=>i>=cut).map(i=>i-cut),wordStyles:Object.fromEntries(styles.filter(([i])=>Number(i)>=cut).map(([i,v])=>[Number(i)-cut,v]))};
 return [...rows.slice(0,at),a,b,...rows.slice(at+1)];
}
export function mergeCaptionNext(rows:CaptionSegment[],id:string){
 const at=rows.findIndex(s=>s.id===id),a=rows[at],b=rows[at+1];if(!a||!b)throw Error('Choose a caption with a following line.');if(b.start<a.end-1e-6)throw Error('Overlapping captions cannot be merged.');
 const offset=a.words.length||a.text.trim().split(/\s+/).length;
 return [...rows.slice(0,at),{...a,end:b.end,text:a.text+' '+b.text,words:a.words.length&&b.words.length?[...a.words,...b.words]:[],emphasizedWords:[...(a.emphasizedWords||[]),...(b.emphasizedWords||[]).map(i=>i+offset)],wordStyles:{...a.wordStyles,...Object.fromEntries(Object.entries(b.wordStyles||{}).map(([i,v])=>[Number(i)+offset,v]))}},...rows.slice(at+2)];
}
export function editCaptionWord(segment:CaptionSegment,index:number,patch:{word?:string;start?:number;end?:number}){
 if(!segment.words[index])throw Error('This caption has no individual word timings.');
 const next={...segment.words[index],...patch};if(!next.word.trim()||/\s/.test(next.word.trim()))throw Error('Enter a single word. Use line text editing for multiple words.');
 if(!Number.isFinite(next.start)||!Number.isFinite(next.end)||next.start<segment.start||next.end>segment.end||next.end<=next.start||index>0&&next.start<segment.words[index-1].end-1e-6||index<segment.words.length-1&&next.end>segment.words[index+1].start+1e-6)throw Error('Keep word timings ordered inside the caption interval.');
 const words=segment.words.map((w,i)=>i===index?next:w);return {...segment,words,text:words.map(w=>w.word).join(' ')};
}
