/** Safe numeric diagnostics only: never expose provider text, org IDs or prompts. */
export interface GroqCapacity {limitTokens?:number;requestedTokens?:number}
export class GroqCapacityError extends Error {
 readonly capacity:GroqCapacity;
 constructor(capacity:GroqCapacity={}){super('GROQ_REQUEST_TOO_LARGE');this.name='GroqCapacityError';this.capacity=capacity;}
}
const positive=(s:string|null|undefined)=>s&&/^\d+$/.test(s)&&Number(s)>0&&Number(s)<=1e9?Number(s):undefined;
export interface GroqRateLimit {resource:'tokens'|'requests'|'unknown';period:'minute'|'day'|'unknown';limit?:number;used?:number;requested?:number;retryAfterSeconds?:number}
export class GroqRateLimitError extends Error{constructor(readonly rateLimit:GroqRateLimit){super('Groq rate limit reached. Please try again later.');this.name='GroqRateLimitError';}}
async function errorText(response:Response){const reader=response.body?.getReader();if(!reader)return '';const chunks:Uint8Array[]=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();return '';}chunks.push(value);}const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));return typeof data?.error?.message==='string'?data.error.message:'';}catch{return '';}}
export async function readGroqCapacity(response:Response):Promise<GroqCapacity>{
 const result:GroqCapacity={},header=positive(response.headers.get('x-ratelimit-limit-tokens'));if(header)result.limitTokens=header;
 try{const reader=response.body?.getReader();if(!reader)return result;const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();return result;}chunks.push(value);}
  const data=JSON.parse(Buffer.concat(chunks).toString('utf8')),message=typeof data?.error?.message==='string'?data.error.message:'';
  const limit=positive(message.match(/\blimit\s*:?\s*(\d+)/i)?.[1]),requested=positive(message.match(/\brequested\s*:?\s*(\d+)/i)?.[1]);
  if(limit)result.limitTokens=limit;if(requested)result.requestedTokens=requested;
 }catch{/* Unavailable diagnostics never expose the provider response. */}return result;
}
export async function readGroqRateLimit(response:Response):Promise<GroqRateLimit>{
 const message=await errorText(response),match=message.match(/\b(tokens|requests) per (minute|day)\b/i),retry=response.headers.get('retry-after'),seconds=retry&&/^\d+(?:\.\d+)?$/.test(retry)?Math.ceil(Number(retry)):undefined;
 return {resource:match?match[1].toLowerCase() as 'tokens'|'requests':'unknown',period:match?match[2].toLowerCase() as 'minute'|'day':'unknown',...Object.fromEntries(['limit','used','requested'].map(k=>[k,positive(message.match(new RegExp('\\b'+k+'\\s*:?\\s*(\\d+)','i'))?.[1])]).filter(([,v])=>v!==undefined)),...(seconds&&seconds<=86400?{retryAfterSeconds:seconds}:{})};
}
