import {readSpeechLanguage} from "../captions/speechLanguages";
import {normalizeHinglishWords,normalizeHinglishText} from "../editor/hinglishNormalizer";
/** Server-side ASR adapter. No translation, key logging, or provider fallback. */
export class SpeechProviderError extends Error {
 constructor(message:string,readonly status:number,readonly retryAfter?:string){super(message);this.name='SpeechProviderError';}
}
export async function transcribeWithGroq(audio:Buffer,mime:string,key:string,signal:AbortSignal,language?:string){
 const languageHint=readSpeechLanguage(language);
 signal.throwIfAborted();
 if(!audio.length||audio.length>25*1024*1024)throw new SpeechProviderError('Speech audio must be non-empty and under 25 MB.',413);
 const extension:Record<string,string>={'audio/wav':'wav','audio/x-wav':'wav','audio/mpeg':'mp3','audio/mp3':'mp3','audio/mp4':'m4a','audio/flac':'flac','audio/ogg':'ogg','audio/webm':'webm'};
 const ext=extension[mime.split(';')[0].toLowerCase()];
 if(!ext)throw new SpeechProviderError('Extract speech audio in a supported browser before generating captions. Try updated Chrome or Edge.',415);
 if(!key.trim())throw new SpeechProviderError('Speech transcription is not configured.',503);
 const form=new FormData();form.append('file',new Blob([new Uint8Array(audio)],{type:mime}),'speech.'+ext);
 if(languageHint&&languageHint!=='hinglish')form.append('language',languageHint);
 if(languageHint==='hinglish'){
  form.append('prompt','Transcribe the Hindi and English speech using clean Latin/English alphabets (Hinglish/Roman Hindi), maintaining accurate word-level timestamps. Example: yaar, bhai, kya kar raha hai, matlab, bilkul, kaise ho, sahi hai, accha.');
 }
 form.append('model','whisper-large-v3');form.append('response_format','verbose_json');form.append('timestamp_granularities[]','word');form.append('timestamp_granularities[]','segment');form.append('temperature','0');
 const response=await fetch('https://api.groq.com/openai/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+key},body:form,signal:AbortSignal.any([signal,AbortSignal.timeout(45000)]),cache:'no-store'});
 if(!response.ok){
  const failure=await response.json().catch(()=>null);
  if(response.status===403&&["model_permission_blocked_project","model_permission_blocked_org"].includes(failure?.error?.code))throw new SpeechProviderError("Speech model is disabled in Groq settings. An admin must enable whisper-large-v3.",503);
  const retry=response.headers.get('retry-after');const retryAfter=retry&&/^\d{1,5}$/.test(retry)?String(Math.min(Number(retry),86400)):undefined;
  if(response.status===429)throw new SpeechProviderError('Speech transcription capacity reached. Please retry later.',429,retryAfter);
  if(response.status===401||response.status===403)throw new SpeechProviderError('Speech provider credentials are unavailable. Contact support.',503);
  throw new SpeechProviderError('Speech provider could not transcribe this audio. Please retry.',response.status===400?422:502);
 }
 const data=await response.json().catch(()=>null);signal.throwIfAborted();
 if(!data||!Array.isArray(data.words)||data.words.length>20000)throw new SpeechProviderError('Speech provider returned no usable word timing.',422);
 const words=data.words.map((w:{word?:unknown;start?:unknown;end?:unknown})=>{
  if(typeof w.word!=='string'||!w.word.trim()||typeof w.start!=='number'||typeof w.end!=='number'||!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<0||w.end<w.start||w.end>240.5)throw new SpeechProviderError('Speech provider returned invalid word timing. Please retry.',422);
  return {text:w.word.trim(),start:w.start,end:w.end,type:'word'};
 });
 // Whisper alignment can overlap across segment boundaries. Merge measured spans
 // in spoken order; never sort words or invent replacement timestamps.
 const aligned:typeof words=[];
 for(const word of words){let item=word;while(aligned.length&&item.start<aligned[aligned.length-1].end){const previous=aligned.pop()!;item={...item,text:previous.text+' '+item.text,start:Math.min(previous.start,item.start),end:Math.max(previous.end,item.end)};}aligned.push(item);}
 const normalizedWords = languageHint === 'hinglish' ? normalizeHinglishWords(aligned) : aligned;
 const rawText = typeof data.text === 'string' ? data.text : words.map((w: { text: string }) => w.text).join(' ');
 const normalizedText = languageHint === 'hinglish' ? normalizeHinglishText(rawText) : rawText;
 return {
  words: normalizedWords,
  text: normalizedText,
  language_code: languageHint === 'hinglish' ? 'hin-Latn' : (typeof data.language === 'string' ? data.language : 'und'),
  audio_duration_secs: typeof data.duration === 'number' && Number.isFinite(data.duration) ? data.duration : words.at(-1)?.end || 0
 };
}
