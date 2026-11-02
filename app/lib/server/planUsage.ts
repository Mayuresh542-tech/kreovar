import {NextRequest,NextResponse} from 'next/server';
import {getAdminClient,getAuthenticatedUserId} from './adminAuth';
import {USAGE_LABELS,type UsageFeature,type UsageStatus} from '../../config/allowances';
export class PlanLimitError extends Error {constructor(message:string,public status=402,public feature?:string){super(message);}}
export async function usageStatus(userId:string):Promise<UsageStatus>{const {data,error}=await getAdminClient().rpc('kreovar_usage_status',{p_user_id:userId});if(error||!data)throw new PlanLimitError('Usage could not be checked. Please retry.',503);return data;}
export async function reserveUsage(userId:string,amounts:Partial<Record<UsageFeature,number>>){
 const {data,error}=await getAdminClient().rpc('kreovar_reserve_usage',{p_user_id:userId,p_amounts:amounts});
 if(error||!data)throw new PlanLimitError('Usage could not be reserved. Please retry.',503);
 if(!data.allowed)throw new PlanLimitError(`${USAGE_LABELS[data.feature as UsageFeature]||'Usage'} allowance reached. Wait for your next allowance period or upgrade your plan.`,402,data.feature);
 return data as UsageStatus&{reservationId:string};
}
export async function finishUsage(userId:string,id:string,success:boolean,exportOnly=false){
 // Settlement is idempotent. Retry a transient transport error, never reserve twice.
 for(let attempt=0;attempt<3;attempt++){
  try{
   const {data,error}=await getAdminClient().rpc('kreovar_finish_usage',{p_user_id:userId,p_id:id,p_success:success,p_export_only:exportOnly});
   if(!error){if(data!==true)throw new PlanLimitError('Usage reservation expired or could not be confirmed. Please retry.',409);return;}
  }catch(error){if(error instanceof PlanLimitError)throw error;}
 }
 throw new PlanLimitError('Usage could not be confirmed. Please retry.',503);
}
export const usageError=(error:unknown)=>NextResponse.json({error:error instanceof PlanLimitError?error.message:'Usage service is unavailable. Please retry.',code:error instanceof PlanLimitError&&error.status===402?'PLAN_LIMIT_REACHED':'USAGE_UNAVAILABLE',...(error instanceof PlanLimitError&&error.feature?{feature:error.feature}:{})},{status:error instanceof PlanLimitError?error.status:503});
type Handler=(req:NextRequest)=>Promise<Response>;
export function withUsage(handler:Handler,kind:'content'|'voice'|'ai'|'stock'|'server-export'|'ideas'|'script'|'kit'){
 return async(req:NextRequest)=>{
  let user:string|null=null,id:string|undefined,done=false;
  try{
   user=await getAuthenticatedUserId(req);if(!user)return NextResponse.json({error:'Sign in to continue.'},{status:401});
   let amounts:Partial<Record<UsageFeature,number>>;
   if(kind==='stock'){const raw=req.method==='GET'&&req.nextUrl.pathname==='/api/broll/download'?req.nextUrl.searchParams.get('url'):null;if(raw){try{const url=new URL(raw),base=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);if(url.origin===base.origin&&url.pathname.startsWith('/storage/'))return handler(req);}catch{}}amounts={stock_downloads:1};}
   else if(kind==='ai')amounts={ai_edits:1};
   else if(kind==='ideas')amounts={content_ideas:1};
   else if(kind==='script')amounts={content_scripts:1};
   else if(kind==='kit')amounts={content_ideas:1,content_scripts:1};
   else if(kind==='server-export'){const status=await usageStatus(user);if(status.maxResolution<1080)throw new PlanLimitError('Use browser export at 720p on Free, or upgrade for server MP4 finishing.');amounts={exports:1};}
   else{
    const body=await req.clone().json().catch(()=>null);if(!body)return NextResponse.json({error:'Invalid generation request.'},{status:400});
    if(kind==='voice'){const text=typeof body.text==='string'?body.text.trim():'';const script=text||(Array.isArray(body.scenes)?body.scenes.map((s:{text?:unknown})=>typeof s?.text==='string'?s.text:'').join(' '):'');if(!script.trim())return NextResponse.json({error:'Enter text to generate a voiceover.'},{status:400});amounts={voice_characters:Array.from(script).length};}
    else amounts=body.mode==='ideas'?{content_ideas:1}:body.mode==='script'?{content_scripts:1}:{content_ideas:1,content_scripts:1};
   }
   const lease=await reserveUsage(user,amounts);id=lease.reservationId;
   req.signal.throwIfAborted();
   const response=await handler(req);
   req.signal.throwIfAborted();
   if(!response.ok){await finishUsage(user,id,false);done=true;return response;}
   const isJson=(response.headers.get('content-type')||'').includes('json');
   if(isJson||kind==='ai'){
    const result=await response.clone().json().catch(()=>null);
    if(!result||typeof result!=='object'||result.error||result.success===false||result.isDevelopmentMode===true)throw new PlanLimitError('Generation did not return a usable result. Please retry.',502);
    if(kind==='ai'&&!(Array.isArray(result.list?.decisions)&&result.list.decisions.length||Array.isArray(result.toolRequests)&&result.toolRequests.length)){
     await finishUsage(user,id,false);done=true;return response;
    }
   }
   if((kind==='stock'||kind==='server-export')&&response.body&&!isJson){
    const reader=response.body.getReader(),uid=user,reservation=id;let settled=false,bytes=0;
    const settle=async(success:boolean)=>{if(!settled){await finishUsage(uid,reservation,success);settled=true;}};
    const stream=new ReadableStream({async pull(controller){try{req.signal.throwIfAborted();const result=await reader.read();if(result.done){if(!bytes)throw new Error('Download was empty.');req.signal.throwIfAborted();await settle(true);controller.close();}else{bytes+=result.value.byteLength;controller.enqueue(result.value);}}catch(error){await reader.cancel(error).catch(()=>{});await settle(false).catch(()=>{});controller.error(error);}},async cancel(reason){await reader.cancel(reason).catch(()=>{});await settle(false).catch(()=>{});}});
    done=true;return new Response(stream,{status:response.status,headers:response.headers});
   }
   await finishUsage(user,id,true);done=true;return response;
  }catch(error){return usageError(error);}finally{if(user&&id&&!done)await finishUsage(user,id,false).catch(()=>{});}
 };
}
