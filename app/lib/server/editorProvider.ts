import {generateEditorJson,RadoxEditorError} from './radoxService';
import type {EditorFallbackOptions} from './editorFallbackOptions';
import type {EditorVisualContext} from './editorVisualObservations';
import {EDITOR_AI_MODEL} from './radoxConfig';
import {generateGroqEditorJson} from './groqEditorFallback';
export {GroqEditorError} from './groqEditorFallback';

export interface EditorProviderChoice {provider:'radox'|'groq';fallbackReason?:string;visualContext?:EditorVisualContext}
export interface EditorProviderResult<T> extends EditorProviderChoice {value:T;model:string;attempts:number;imageCount:number;visionModel?:string;visualObservationCount?:number}
const fallbackCodes=new Set(['RADOX_MAINTENANCE','RADOX_UNAVAILABLE','RADOX_MODEL_UNAVAILABLE','RADOX_NOT_CONFIGURED','RADOX_RATE_LIMIT']);

/** One outage fallback, never a validation/auth/billing/budget bypass. Passing
 * the successful choice keeps a validation correction on that provider.
 */
export async function generateEditPlanJson<T>(options:EditorFallbackOptions,preferred?:EditorProviderChoice):Promise<EditorProviderResult<T>>{
 options.signal?.throwIfAborted();
 let attempts=0,reason=preferred?.fallbackReason;
 if(preferred?.provider!=='groq'){
  try{
   attempts++;
   const signal=options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000);
   const value=await generateEditorJson<T>({...options,signal});
   options.signal?.throwIfAborted();
   return {value,provider:'radox',model:EDITOR_AI_MODEL,attempts,imageCount:(options.referenceImages?.length||0)+(options.footageFrames?.length||0)+(options.candidateImages?.length||0)};
  }catch(error){
   options.signal?.throwIfAborted();
   if(error instanceof RadoxEditorError&&fallbackCodes.has(error.code))reason=error.code;
   else if(error instanceof Error&&error.name==='TimeoutError')reason='RADOX_TIMEOUT';
   else throw error;
  }
 }
 options.signal?.throwIfAborted();
 const result=await generateGroqEditorJson<T>(options,preferred?.visualContext);
 return {...result,provider:'groq',fallbackReason:reason,attempts:attempts+result.attempts};
}

export function editorProviderSummary(summary:string,choice:EditorProviderChoice&{model:string;visionModel?:string}){
 if(choice.provider!=='groq')return summary;
 const model=choice.model==='openai/gpt-oss-120b'?'GPT-OSS 120B':choice.model==='qwen/qwen3.8-27b'?'Qwen 3.8 27B':choice.model;
 return `Groq fallback · ${choice.visionModel?"Qwen vision → ":""}${model}. ${summary}`.slice(0,2000);
}
