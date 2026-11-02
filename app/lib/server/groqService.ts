import { getProviderCredential, recordProviderUsage } from "./providerRegistry";
import {GroqCapacityError,readGroqCapacity,GroqRateLimitError,readGroqRateLimit} from "./groqCapacity";
export type GroqOperation="content_kit_generation"|"editor_ai_edit";
export const GROQ_MODELS:Record<GroqOperation,string>={content_kit_generation:"openai/gpt-oss-20b",editor_ai_edit:"openai/gpt-oss-120b"};
export interface GroqJsonOptions {prompt:string;systemInstruction?:string;temperature?:number;maxTokens?:number;userId?:string|null;operation:GroqOperation;signal?:AbortSignal;schema?:Record<string,unknown>;reasoningEffort?:"low"|"medium"|"high";}
export async function generateGroqJson<T>(options:GroqJsonOptions):Promise<T>{
  options.signal?.throwIfAborted();
  const key=await getProviderCredential("groq");if(!key)throw new Error("GROQ_NOT_CONFIGURED");
  const model=GROQ_MODELS[options.operation];if(!model)throw new Error("Unsupported Groq operation.");
  const start=Date.now();
  const response=await fetch("https://api.groq.com/openai/v1/chat/completions",{
    method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify({model,messages:[{role:"system",content:(options.systemInstruction||"Return valid JSON.")+" Return only the requested JSON object."},{role:"user",content:options.prompt}],
      temperature:options.temperature??.3,max_completion_tokens:options.maxTokens??6144,
      reasoning_effort:options.reasoningEffort??(options.operation==="content_kit_generation"?"low":"medium"),
      response_format:options.schema?{type:"json_schema",json_schema:{name:"content_kit",strict:true,schema:options.schema}}:{type:"json_object"}}),
    signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(70000)]):AbortSignal.timeout(70000),cache:"no-store",
  });
  if(!response.ok){
    const capacity=response.status===413?await readGroqCapacity(response):undefined;
    const rateLimit=response.status===429?await readGroqRateLimit(response):undefined;
    const message=response.status===413?"GROQ_REQUEST_TOO_LARGE":response.status===429?"Groq rate limit reached. Please try again later.":response.status===401||response.status===403?"INVALID_GROQ_KEY":"Groq could not complete this request. Please retry.";
    await recordProviderUsage({providerKey:"groq",operation:options.operation,userId:options.userId,units:0,unitType:"tokens",status:"error",durationMs:Date.now()-start,errorMessage:capacity?message+"; requestChars="+((options.systemInstruction?.length||0)+options.prompt.length)+"; maxCompletion="+(options.maxTokens??6144)+"; limitTokens="+(capacity.limitTokens??"unknown")+"; requestedTokens="+(capacity.requestedTokens??"unknown"):rateLimit?message+"; "+JSON.stringify(rateLimit):message});
    if(capacity)throw new GroqCapacityError(capacity);
    if(rateLimit)throw new GroqRateLimitError(rateLimit);
    throw new Error(message);
  }
  const data=await response.json().catch(()=>null),choice=data?.choices?.[0];
  if(choice?.finish_reason!=="stop" || typeof choice.message?.content!=="string" || !choice.message.content.trim()){
    const finish=["length","content_filter","tool_calls","stop"].includes(choice?.finish_reason)?choice.finish_reason:"unexpected";
    await recordProviderUsage({providerKey:"groq",operation:options.operation,userId:options.userId,units:Number.isFinite(data?.usage?.total_tokens)?data.usage.total_tokens:0,unitType:"tokens",status:"error",durationMs:Date.now()-start,errorMessage:"GROQ_INCOMPLETE_RESPONSE; finish="+finish+"; maxCompletion="+(options.maxTokens??6144)});
    throw new Error("Groq returned an incomplete response. Please retry.");
  }
  let result:T;try{result=JSON.parse(choice.message.content);}catch{throw new Error("Groq returned malformed structured data. Please retry.");}
  if(!result || typeof result!=="object" || Array.isArray(result))throw new Error("Groq returned invalid structured data. Please retry.");
  await recordProviderUsage({providerKey:"groq",operation:options.operation,userId:options.userId,units:data?.usage?.total_tokens||0,unitType:"tokens",status:"success",durationMs:Date.now()-start});
  return result;
}
