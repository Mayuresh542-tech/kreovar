import {publicErrorMessage} from '../serviceMessages';
import {reserveEditorTokens,settleEditorTokens,worstCaseTokens,type EditingBudget} from './editorTokenBudget';
import {getProviderCredential,recordProviderUsage} from './providerRegistry';
import type {FootageFrame} from '../editor/footageContext';
import {RADOX_API_BASE,EDITOR_AI_MODEL,EDITOR_AI_MAX_TOKENS,type EditorReferenceImage} from './radoxConfig';

type RadoxCode='RADOX_MAINTENANCE'|'RADOX_NOT_CONFIGURED'|'RADOX_AUTH_FAILED'|'RADOX_MODEL_UNAVAILABLE'|'RADOX_ALLOWANCE_REACHED'|'RADOX_RATE_LIMIT'|'RADOX_REQUEST_CAPACITY'|'RADOX_INCOMPLETE_RESPONSE'|'RADOX_INVALID_RESPONSE'|'RADOX_MODEL_MISMATCH'|'RADOX_UNAVAILABLE';
const messages:Record<RadoxCode,string>={
 RADOX_MAINTENANCE:'The AI editing service is temporarily upgrading. Your timeline is unchanged. Retry when the service is available; no other model was used.',
 RADOX_NOT_CONFIGURED:'Claude editing is not configured. The owner can add the Radox key in Admin → API Providers.',
 RADOX_AUTH_FAILED:'The AI provider rejected the configured key. The owner needs to check the Radox credentials.',
 RADOX_MODEL_UNAVAILABLE:'Claude Opus 5.5 is not available through the configured Radox account. The owner needs to enable this exact model or connect an endpoint that offers it. No other model was used.',
 RADOX_ALLOWANCE_REACHED:'The AI provider allowance is exhausted or requires billing. Contact the owner before adding paid capacity.',
 RADOX_RATE_LIMIT:'The AI provider request limit was reached. Please retry after the indicated wait.',
 RADOX_REQUEST_CAPACITY:'The AI provider rejected this planning request size. Your timeline is unchanged.',
 RADOX_INCOMPLETE_RESPONSE:'The AI response was cut short. Your timeline is unchanged; try a smaller editing request.',
 RADOX_INVALID_RESPONSE:'The AI provider returned invalid structured data. Your timeline is unchanged.',
 RADOX_MODEL_MISMATCH:'The provider returned a different model than Claude Opus 5.5. The edit was rejected and no alternative model was accepted.',
 RADOX_UNAVAILABLE:'The AI provider could not complete this request. Your timeline is unchanged; please retry later.',
};
export class RadoxEditorError extends Error {
 constructor(readonly code:RadoxCode,readonly status=503,readonly retryAfterSeconds?:number){super(publicErrorMessage(messages[code]));this.name='RadoxEditorError';}
}
export interface EditorJsonOptions {observer?:{before:(body:unknown,maxOutput:number)=>Promise<void>;after:(usage:{total:number|null;input:number|null;output:number|null})=>Promise<void>};editingBudget?:EditingBudget;prompt:string;systemInstruction:string;userId?:string|null;signal?:AbortSignal;referenceImages?:EditorReferenceImage[];maxTokens?:number;footageFrames?:FootageFrame[];candidateImages?:{candidateId:string;data:string}[];operation?:'editor_ai_edit'|'editor_broll_pick'}

async function boundedJson(response:Response){
 const reader=response.body?.getReader();if(!reader)return null;
 const chunks:Uint8Array[]=[];let bytes=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1024*1024){await reader.cancel();return null;}chunks.push(value);}return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;}catch{return null;}
}
function object(value:unknown):Record<string,unknown>|null{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;}
function tokenCount(value:unknown){return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1e9?Math.floor(value):0;}

export async function generateEditorJson<T>(options:EditorJsonOptions):Promise<T>{
 options.signal?.throwIfAborted();
 const key=await getProviderCredential('radox');if(!key)throw new RadoxEditorError('RADOX_NOT_CONFIGURED');
 const images=options.referenceImages||[],footage=options.footageFrames||[],candidates=options.candidateImages||[];
 const operation=options.operation||'editor_ai_edit';
 if(footage.length>6||candidates.length>6||[...footage,...candidates].some(f=>f.data.length>48000||!/^[A-Za-z0-9+/]*={0,2}$/.test(f.data)))throw new RadoxEditorError('RADOX_REQUEST_CAPACITY',413);
 if(images.length>6||images.some(i=>i.mediaType!=='image/jpeg'||i.data.length>50000||!/^[A-Za-z0-9+/]*={0,2}$/.test(i.data)))throw new RadoxEditorError('RADOX_REQUEST_CAPACITY',413);
 const content:({type:'text';text:string}|{type:'image_url';image_url:{url:string}})[]=[{type:'text',text:options.prompt}];
 for(const image of images)content.push({type:'text',text:`PRIVATE STYLE REFERENCE ${image.styleId}, observed sample approximately ${image.timeSecondsApprox}s. Appearance reference only; never reuse its text, people or media in the edit.`},{type:'image_url',image_url:{url:`data:${image.mediaType};base64,${image.data}`}});
 for(const frame of footage)content.push({type:'text',text:'CURRENT FOOTAGE FRAME '+JSON.stringify({clipId:frame.clipId,timelineTime:frame.timelineTime,sourceTime:frame.sourceTime})+'. Actual user footage sample, distinct from style references. Describe only what is visible; this is not continuous video or audio.'},{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+frame.data}});
 for(const candidate of candidates)content.push({type:'text',text:'B-ROLL CANDIDATE '+candidate.candidateId+'. Evaluate relevance to the supplied speech; the still image does not establish video motion.'},{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+candidate.data}});
 const maxOutputTokens=Math.min(EDITOR_AI_MAX_TOKENS,Math.max(1024,options.maxTokens??EDITOR_AI_MAX_TOKENS));
 const requestBody={model:EDITOR_AI_MODEL,messages:[{role:'system',content:options.systemInstruction+' Return only the complete requested JSON object.'},{role:'user',content:content.length>1?content:options.prompt}],max_tokens:maxOutputTokens,response_format:{type:'json_object'},stream:false};
 const lease=options.editingBudget&&options.userId?await reserveEditorTokens(options.userId,options.editingBudget,worstCaseTokens(requestBody,maxOutputTokens)):undefined;
 await options.observer?.before(requestBody,maxOutputTokens);
 const start=Date.now();let response:Response;
 try{response=await fetch(RADOX_API_BASE+'/chat/completions',{
  method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},redirect:'error',
  body:JSON.stringify(requestBody),
  signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(70000)]):AbortSignal.timeout(70000),cache:'no-store',
 });}catch(error){if(error instanceof Error&&['AbortError','TimeoutError'].includes(error.name))throw error;await recordProviderUsage({providerKey:'radox',operation,userId:options.userId,units:0,unitType:'tokens',status:'error',durationMs:Date.now()-start,errorMessage:'RADOX_NETWORK_ERROR'});throw new RadoxEditorError('RADOX_UNAVAILABLE');}
 const raw=object(await boundedJson(response)),usage=object(raw?.usage),units=tokenCount(usage?.total_tokens)||(tokenCount(usage?.prompt_tokens)+tokenCount(usage?.completion_tokens));
 if(lease&&options.editingBudget&&options.userId){const validCount=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0;const known=validCount(usage?.total_tokens)||(validCount(usage?.prompt_tokens)&&validCount(usage?.completion_tokens));const rejected=!response.ok&&([401,402,403,404,413,429].includes(response.status)||object(raw?.error)?.code==='service_upgrading');await settleEditorTokens(options.userId,options.editingBudget,lease,known?units:rejected?0:null);}
 if(options.observer){const count=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0?Math.floor(n):null;const input=count(usage?.prompt_tokens),output=count(usage?.completion_tokens),reported=count(usage?.total_tokens);const rejected=!response.ok&&([401,402,403,404,413,429].includes(response.status)||object(raw?.error)?.code==='service_upgrading');await options.observer.after({total:reported??(input!==null&&output!==null?input+output:rejected?0:null),input,output});}
 const fail=async(code:RadoxCode,status=503,retryAfterSeconds?:number):Promise<never>=>{await recordProviderUsage({providerKey:'radox',operation,userId:options.userId,units,unitType:'tokens',status:'error',durationMs:Date.now()-start,errorMessage:code+'; http='+response.status});throw new RadoxEditorError(code,status,retryAfterSeconds);};
 if(!response.ok){
  const code=object(raw?.error)?.code;
  if(response.status===503&&code==='service_upgrading')return fail('RADOX_MAINTENANCE',503);
  if(code==='model_not_found'||response.status===404)return fail('RADOX_MODEL_UNAVAILABLE');
  if(response.status===401||response.status===403)return fail('RADOX_AUTH_FAILED');
  if(response.status===402)return fail('RADOX_ALLOWANCE_REACHED');
  if(response.status===413)return fail('RADOX_REQUEST_CAPACITY',413);
  if(response.status===429){const value=response.headers.get('retry-after'),seconds=value&&/^\d+(?:\.\d+)?$/.test(value)?Math.ceil(Number(value)):undefined;return fail('RADOX_RATE_LIMIT',429,seconds&&seconds<=86400?seconds:undefined);}
  return fail('RADOX_UNAVAILABLE');
 }
 if(raw?.model!==EDITOR_AI_MODEL)return fail('RADOX_MODEL_MISMATCH',502);
 const choice=Array.isArray(raw?.choices)?object(raw.choices[0]):null,message=object(choice?.message);
 if(choice?.finish_reason!=='stop'||typeof message?.content!=='string'||!message.content.trim())return fail('RADOX_INCOMPLETE_RESPONSE',502);
 let result:unknown;try{result=JSON.parse(message.content);}catch{return fail('RADOX_INVALID_RESPONSE',502);}
 if(!object(result))return fail('RADOX_INVALID_RESPONSE',502);
 await recordProviderUsage({providerKey:'radox',operation,userId:options.userId,units,unitType:'tokens',status:'success',durationMs:Date.now()-start});
 return result as T;
}
