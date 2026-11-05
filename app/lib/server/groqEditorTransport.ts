import {getProviderCredential,recordProviderUsage} from './providerRegistry';
import {reserveEditorTokens,settleEditorTokens,worstCaseTokens} from './editorTokenBudget';
import type {EditorJsonOptions} from './radoxService';

type GroqCode='GROQ_SCHEMA_REJECTED'|'GROQ_NOT_CONFIGURED'|'GROQ_AUTH_FAILED'|'GROQ_MODEL_BLOCKED'|'GROQ_ALLOWANCE_REACHED'|'GROQ_RATE_LIMIT'|'GROQ_REQUEST_REJECTED'|'GROQ_REQUEST_CAPACITY'|'GROQ_INVALID_RESPONSE'|'GROQ_INVALID_OBSERVATIONS'|'GROQ_MODEL_MISMATCH'|'GROQ_UNAVAILABLE';
const messages:Record<GroqCode,string>={
 GROQ_NOT_CONFIGURED:'AI editing is temporarily unavailable. Please contact support.',
 GROQ_AUTH_FAILED:'AI editing could not connect. Please contact support.',
 GROQ_MODEL_BLOCKED:'AI editing is temporarily unavailable. Please contact support.',
 GROQ_ALLOWANCE_REACHED:'AI editing has reached its service allowance. Please try again later.',
 GROQ_RATE_LIMIT:'AI editing is busy. Retry after the indicated wait.',
 GROQ_SCHEMA_REJECTED:'Frame analysis could not be completed. Please retry this stage.',
 GROQ_REQUEST_REJECTED:'AI editing could not process this request. Please retry this stage.',
 GROQ_REQUEST_CAPACITY:'This edit is too large to process at once. Try fewer source clips.',
 GROQ_INVALID_RESPONSE:'AI editing returned incomplete data. Saved changes are preserved; retry this stage.',
 GROQ_INVALID_OBSERVATIONS:'The footage could not be analyzed reliably. Please retry this stage.',
 GROQ_MODEL_MISMATCH:'AI editing could not validate its response. Please retry this stage.',
 GROQ_UNAVAILABLE:'AI editing could not complete this request. Please retry later.',
};
export class GroqEditorError extends Error {
 constructor(readonly code:GroqCode,readonly status=503,readonly retryAfterSeconds?:number){super(messages[code]);this.name='GroqEditorError';}
}
const object=(v:unknown):Record<string,unknown>|null=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
const count=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e9?Math.floor(n):null;
async function readResponse(response:Response){
 const reader=response.body?.getReader();if(!reader)return null;
 const chunks:Uint8Array[]=[];let bytes=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1024*1024){await reader.cancel();return null;}chunks.push(value);}return object(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{return null;}
}

/** Each model request owns its reservation and settlement. Unknown outcomes
 * retain their reservation; a following step must pass the same budget gate.
 */
export async function requestGroqEditorJson<T>(options:EditorJsonOptions,body:Record<string,unknown>,request:{model:string;maxOutput:number;timeoutMs:number;operation?:string;credential?:string}):Promise<T>{
 options.signal?.throwIfAborted();
 const key=request.credential||await getProviderCredential('groq');if(!key)throw new GroqEditorError('GROQ_NOT_CONFIGURED');
 options.signal?.throwIfAborted();
 const lease=options.editingBudget&&options.userId?await reserveEditorTokens(options.userId,options.editingBudget,worstCaseTokens(body,request.maxOutput)):undefined;
 await options.observer?.before(body,request.maxOutput);
 const start=Date.now(),operation=request.operation||options.operation||'editor_ai_edit';
 const log=(status:'error'|'success',units:number,errorMessage?:string)=>recordProviderUsage({providerKey:'groq',operation,userId:options.userId,units,unitType:'tokens',status,durationMs:Date.now()-start,...(errorMessage?{errorMessage}:{})});
 let response:Response;
 try{response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},redirect:'error',body:JSON.stringify(body),signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(request.timeoutMs)]):AbortSignal.timeout(request.timeoutMs),cache:'no-store'});}catch(error){await log('error',0,'GROQ_NETWORK_ERROR');if(options.signal?.aborted)throw options.signal.reason;if(error instanceof Error&&error.name==='AbortError')throw error;throw new GroqEditorError('GROQ_UNAVAILABLE');}
 const raw=await readResponse(response),usage=object(raw?.usage),input=count(usage?.prompt_tokens),output=count(usage?.completion_tokens),reported=count(usage?.total_tokens),rejected=!response.ok&&[400,401,402,403,404,413,429].includes(response.status),total=reported??(input!==null&&output!==null?input+output:rejected?0:null);
 if(lease&&options.editingBudget&&options.userId)await settleEditorTokens(options.userId,options.editingBudget,lease,total);
 await options.observer?.after({total,input,output});
 options.signal?.throwIfAborted();
 const fail=async(code:GroqCode,status=503,retryAfterSeconds?:number):Promise<never>=>{await log('error',total??0,code+'; http='+response.status);throw new GroqEditorError(code,status,retryAfterSeconds);};
 if(!response.ok){
  const errorCode=object(raw?.error)?.code;
  if(response.status===403&&(errorCode==='model_permission_blocked_project'||errorCode==='model_permission_blocked_org'))return fail('GROQ_MODEL_BLOCKED');
  if(response.status===401||response.status===403)return fail('GROQ_AUTH_FAILED');
  if(response.status===402)return fail('GROQ_ALLOWANCE_REACHED');
  if(response.status===429){const retry=response.headers.get('retry-after'),seconds=retry&&/^\d+(?:\.\d+)?$/.test(retry)?Math.ceil(Number(retry)):undefined;return fail('GROQ_RATE_LIMIT',429,seconds&&seconds<=86400?seconds:undefined);}
  if(response.status===400&&errorCode==='json_validate_failed')return fail('GROQ_SCHEMA_REJECTED',502);
  if(response.status===400)return fail('GROQ_REQUEST_REJECTED',502);
  if(response.status===413)return fail('GROQ_REQUEST_CAPACITY',413);
  return fail('GROQ_UNAVAILABLE');
 }
 if(raw?.model!==request.model)return fail('GROQ_MODEL_MISMATCH',502);
 const choice=Array.isArray(raw?.choices)?object(raw.choices[0]):null,message=object(choice?.message);
 if(choice?.finish_reason!=='stop'||typeof message?.content!=='string'||!message.content.trim())return fail('GROQ_INVALID_RESPONSE',502);
 let result:unknown;try{result=JSON.parse(message.content);}catch{return fail('GROQ_INVALID_RESPONSE',502);}
 if(!object(result))return fail('GROQ_INVALID_RESPONSE',502);
 options.signal?.throwIfAborted();await log('success',total??0);
 return result as T;
}
