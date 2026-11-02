
import {NextRequest,NextResponse} from 'next/server';
import {requireAdmin} from '@/app/lib/server/adminAuth';
import {isAdminEmail} from '@/app/lib/admin';
import {withSafeResponse} from '@/app/lib/server/safeResponse';
import {withBoundedRequest} from '@/app/lib/server/boundedRequest';
import {CONTROL_KEYS,validLimits,errorCategory} from '@/app/lib/adminControls';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const text=(s:unknown,max:number)=>typeof s==='string'?s.trim().slice(0,max):'';
export const GET=withSafeResponse(async(req:NextRequest)=>{
 const auth=await requireAdmin(req);if('error'in auth)return auth.error;const{db}=auth;
 const section=req.nextUrl.searchParams.get('section')||'overview';
 const days=Number(req.nextUrl.searchParams.get('days')||30);
 if(![7,30,90].includes(days))return json({error:'Choose 7, 30 or 90 days.'},400);
 const since=new Date(Date.now()-days*86400000).toISOString();
 if(section==='announcements'||section==='controls'||section==='activity'){
  const table=section==='announcements'?'admin_announcements':section==='controls'?'admin_feature_controls':'admin_activity';
  const {data,error}=await db.from(table).select('*').order(section==='controls'?'updated_at':'created_at',{ascending:false}).limit(100);
  if(error)throw error;return json({items:section==="announcements"?data.map(r=>({...r,expired:r.expires_at?new Date(r.expires_at).getTime()<=Date.now():false})):data});
 }
 if(section==='errors'){
  const [usage,renders]=await Promise.all([
   db.from('provider_usage_logs').select('id,user_id,provider_key,operation,status,error_message,created_at').neq('status','success').gte('created_at',since).order('created_at',{ascending:false}).limit(100),
   db.from('render_jobs').select('id,user_id,status,error,created_at').eq('status','failed').gte('created_at',since).order('created_at',{ascending:false}).limit(100)
  ]);
  if(usage.error||renders.error)throw usage.error||renders.error;
  return json({items:[...(usage.data||[]).map(r=>({id:r.id,userId:r.user_id,source:r.provider_key,operation:r.operation,reason:errorCategory(r.error_message),at:r.created_at})),...(renders.data||[]).map(r=>({id:r.id,userId:r.user_id,source:'Renderer',operation:'Export',reason:errorCategory(r.error),at:r.created_at}))].sort((a,b)=>b.at.localeCompare(a.at)),scope:'Latest 100 provider failures and 100 failed server renders in selected period'});
 }
 if(section==='subscriptions'){
  const [subs,events,grants]=await Promise.all([
   db.from('subscriptions').select('user_id,plan,status,source,billing_cycle,current_period_end,updated_at').order('updated_at',{ascending:false}).limit(200),
   db.from('webhook_events').select('id,event_type,processed,created_at,processed_at').eq('provider','whop').order('created_at',{ascending:false}).limit(100),
   db.from('admin_plan_grants').select('user_id,expires_at,reason').order('updated_at',{ascending:false}).limit(200)
  ]);
  for(const r of [subs,events,grants])if(r.error)throw r.error;
  return json({items:subs.data,events:events.data,grants:grants.data});
 }
 if(section==='users'||section==='overview'){
  const users=[];
  for(let page=1;;page++){
   const{data,error}=await db.auth.admin.listUsers({page,perPage:1000});if(error)throw error;
   users.push(...data.users);if(data.users.length<1000)break;
  }
  const search=text(req.nextUrl.searchParams.get('search'),254).toLowerCase();
  if(section==='users'){
   const filtered=users.filter(u=>!search||(u.email||'').toLowerCase().includes(search)||u.id.includes(search)).sort((a,b)=>b.created_at.localeCompare(a.created_at));
   const page=Math.max(1,Math.min(Math.ceil(filtered.length/25)||1,Number(req.nextUrl.searchParams.get('page'))||1));
   const rows=await Promise.all(filtered.slice((page-1)*25,page*25).map(async u=>{
    const{data,error}=await db.rpc('kreovar_usage_status',{p_user_id:u.id});if(error)throw error;
    return{id:u.id,email:u.email,joined:u.created_at,lastSignIn:u.last_sign_in_at,suspended:u.app_metadata?.admin_suspended===true,usage:data};
   }));
   return json({items:rows,page,totalPages:Math.ceil(filtered.length/25)||1,total:filtered.length});
  }
  const [requests,failures,subs,newUsers,usage]=await Promise.all([
   db.from('provider_usage_logs').select('id',{count:'exact',head:true}).gte('created_at',since),
   db.from('provider_usage_logs').select('id',{count:'exact',head:true}).gte('created_at',since).neq('status','success'),
   db.from('subscriptions').select('user_id,source,plan,status,current_period_end,external_subscription_id'),
   Promise.resolve(users.filter(u=>u.created_at>=since).length),
   db.from('provider_usage_logs').select('estimated_cost,provider_key,units,unit_type').gte('created_at',since).order('created_at',{ascending:false}).limit(5000)
  ]);
  for(const r of [requests,failures,subs,usage])if(r.error)throw r.error;
  const {data:grants,error:grantError}=await db.from('admin_plan_grants').select('user_id').gt('expires_at',new Date().toISOString());if(grantError)throw grantError;
  const paidRows=(subs.data||[]).filter(s=>s.source==='whop'&&s.status==='active'&&s.external_subscription_id&&s.plan!=='free'&&s.current_period_end>new Date().toISOString());
  const paid=paidRows.length,proUsers=new Set([...paidRows.map(s=>s.user_id),...(grants||[]).map(g=>g.user_id)]).size;
  const costs=(usage.data||[]).filter(r=>typeof r.estimated_cost==='number');
  return json({totalUsers:users.length,newUsers,activeUsers:users.filter(u=>u.last_sign_in_at&&u.last_sign_in_at>=since).length,paidSubscriptions:paid,proUsers,freeUsers:users.length-proUsers,manualGrants:grants?.length||0,requests:requests.count,failures:failures.count,estimatedCost:costs.length?costs.reduce((n,r)=>n+Number(r.estimated_cost),0):null,costRecords:costs.length,costSample:usage.data?.length,costTruncated:(requests.count||0)>5000,days});
 }
 return json({error:'Unknown section.'},400);
});
export const POST=withSafeResponse(withBoundedRequest(async(req:NextRequest)=>{
 const auth=await requireAdmin(req);if('error'in auth)return auth.error;const{db,user}=auth;
 const b=await req.json().catch(()=>null);if(!b||typeof b!=='object')return json({error:'Invalid request.'},400);
 if(b.action==='announcement'){
  const title=text(b.title,101),body=text(b.body,2001);
  if(!title||title.length>100||!body||body.length>2000||typeof b.published!=='boolean'||(b.id&&!uuid(b.id)))return json({error:'Title: 1–100 characters. Message: 1–2,000 characters.'},400);
  const expires=b.expiresAt?new Date(b.expiresAt):null;
  if(expires&&(!Number.isFinite(expires.getTime())||expires.getTime()<=Date.now()))return json({error:'Expiry must be in the future.'},400);
  const row={title,body,published:b.published,expires_at:expires?.toISOString()||null,updated_by:user.id,updated_at:new Date().toISOString()};
  const result=b.id?await db.from('admin_announcements').update(row).eq('id',b.id).select('id').single():await db.from('admin_announcements').insert(row).select('id').single();
  if(result.error)throw result.error;return json({ok:true});
 }
 if(b.action==='control'){
  if(!CONTROL_KEYS.includes(b.key)||typeof b.enabled!=='boolean')return json({error:'Invalid control.'},400);
  const message=text(b.message,201);if(message.length>200)return json({error:'Message is too long.'},400);
  const{error}=await db.from('admin_feature_controls').upsert({key:b.key,value:{enabled:b.enabled,message},updated_by:user.id,updated_at:new Date().toISOString()});if(error)throw error;
  return json({ok:true});
 }
 if(b.action==='limits'){
  if(!['free','pro'].includes(b.plan)||!validLimits(b.limits))return json({error:'Every allowance must be a whole number from 0 to 10,000,000 or null for unlimited.'},400);
  const{error}=await db.from('admin_feature_controls').upsert({key:'limits_'+b.plan,value:b.limits,updated_by:user.id,updated_at:new Date().toISOString()});if(error)throw error;return json({ok:true});
 }
 if(['grant','revoke','suspend','reactivate'].includes(b.action)){
  if(!uuid(b.userId))return json({error:'Invalid user.'},400);
  const reason=text(b.reason,301);if(reason.length<3||reason.length>300)return json({error:'Add a reason (3–300 characters).'},400);
  const{data:target,error}=await db.auth.admin.getUserById(b.userId);if(error||!target.user)return json({error:'User not found.'},404);
  if(isAdminEmail(target.user.email))return json({error:'Administrator accounts cannot be changed here.'},403);
  if(b.action==='grant'||b.action==='revoke'){
   const expires=b.action==='revoke'?new Date():new Date(b.expiresAt);
   if(!Number.isFinite(expires.getTime())||(b.action==='grant'&&(expires.getTime()<=Date.now()||expires.getTime()>Date.now()+366*86400000)))return json({error:'Choose an expiry within the next year.'},400);
   const{error}=await db.from('admin_plan_grants').upsert({user_id:b.userId,expires_at:expires.toISOString(),reason,updated_by:user.id,updated_at:new Date().toISOString()});if(error)throw error;
  }else{
   // Record the attempt first: a failed Auth write is never a silent unaudited operation.
   const{data:attempt,error:ae}=await db.from('admin_activity').insert({actor_id:user.id,action:b.action+':requested',target:b.userId,detail:{reason}}).select('id').single();if(ae)throw ae;
   const{error}=await db.auth.admin.updateUserById(b.userId,{ban_duration:b.action==='suspend'?'876000h':'none',app_metadata:{...target.user.app_metadata,admin_suspended:b.action==='suspend'}});
   const{error:logError}=await db.from('admin_activity').insert({actor_id:user.id,action:b.action+(error?':failed':':completed'),target:b.userId,detail:{requestId:attempt.id}});
   if(error||logError)throw error||logError;
  }
  return json({ok:true});
 }
 return json({error:'Unknown action.'},400);
}));
