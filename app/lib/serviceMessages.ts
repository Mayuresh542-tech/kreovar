/** Product copy only. Internal adapter IDs and authored content are never rewritten. */
const serviceNames=/\b(?:groq|radox|eleven\s?labs|voice[.\s-]?ai|openai|openrouter|gemini|anthropic|claude|qwen|gpt-oss|whisper|faster-whisper|nemotron|nvidia|llama|pollinations|replicate|fal\.ai)(?:\b|_)/i;
export function serviceLabel(key:string){
 const labels:Record<string,string>={groq:'Editing & content service',radox:'Legacy editing service',gemini:'Content & image service',voiceai:'Voice service',elevenlabs:'Legacy voice service',openrouter:'Development AI service',pollinations:'Image service',remotion_render:'Video renderer',local:'Local speech service'};
 return labels[key]||'AI service';
}
export function publicErrorMessage(value:unknown,fallback='This request could not be completed. Please retry.'){
 if(typeof value!=='string'||!value.trim())return fallback;
 if(!serviceNames.test(value))return value.slice(0,2000);
 if(/local speech|local transcription/i.test(value)&&/unavailable/i.test(value))return 'Local speech processing is unavailable. Check the local speech setup. No external service was called.';
 if(/not.configured|missing|disabled|auth|credential|api.key|permission|blocked/i.test(value))return 'This feature is temporarily unavailable. Please contact support.';
 if(/rate.limit|quota|allowance|billing|too many|request.limit/i.test(value))return 'This feature is busy or has reached its allowance. Please try again later.';
 if(/timed.out|timeout/i.test(value))return 'This request took too long. Please retry. Saved changes are preserved.';
 return fallback;
}
export function publicServiceText(value:unknown){
 if(typeof value!=='string')return '';
 // Older saved jobs included an adapter/model prefix; remove that entire prefix.
 const text=value.replace(/^Groq(?: fallback)?\s*·[^\n]*?\.\s+/i,'');
 return serviceNames.test(text)?publicErrorMessage(text):text;
}
export function publicErrorCode(code:unknown){return typeof code==='string'?code.replace(/^(?:GROQ|RADOX|GEMINI|ELEVENLABS|VOICEAI|OPENAI)_/,'AI_'):code;}
