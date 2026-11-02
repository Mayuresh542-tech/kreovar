import {getAdminClient} from './adminAuth';
import type {DodoCheckout,DodoSnapshot,DodoStore} from './dodoSandbox';
type DbRow={id:string;user_id:string;email:string;cycle:'monthly'|'yearly';product_id:string;session_id?:string;subscription_id?:string;state:DodoSnapshot;checked_at?:string;last_webhook_at?:string};
const decode=(row:DbRow|null):DodoCheckout|null=>row?{...row.state,id:row.id,userId:row.user_id,email:row.email,cycle:row.cycle,productId:row.product_id,sessionId:row.session_id,subscriptionId:row.subscription_id||row.state.subscriptionId,checkedAt:row.checked_at,lastWebhookAt:row.last_webhook_at}:null;
/** Separate service-only ledger; this adapter never writes subscriptions, grants or usage. */
export function dodoStore():DodoStore{
 const db=getAdminClient();
 return {
  async create(row){const {error}=await db.from('dodo_sandbox_checkouts').insert({id:row.id,user_id:row.userId,email:row.email,cycle:row.cycle,product_id:row.productId,state:{status:'pending',paid:false}});if(error)throw Error('Could not save test checkout.');},
  async attachSession(id,sessionId){const {data,error}=await db.from('dodo_sandbox_checkouts').update({session_id:sessionId}).eq('id',id).select('id').single();if(error||!data)throw Error('Could not save test session.');},
  async get(id,userId){let q=db.from('dodo_sandbox_checkouts').select('*').eq('id',id);if(userId)q=q.eq('user_id',userId);const {data,error}=await q.maybeSingle();if(error)throw Error('Test billing storage is unavailable.');return decode(data);},
  async find(kind,value){const column=kind==='sessionId'?'session_id':kind==='subscriptionId'?'subscription_id':'state->>paymentId';const {data,error}=await db.from('dodo_sandbox_checkouts').select('*').eq(column,value).maybeSingle();if(error)throw Error('Test billing storage is unavailable.');return decode(data);},
  async hasEvent(id){const {data,error}=await db.from('dodo_sandbox_events').select('event_id').eq('event_id',id).maybeSingle();if(error)throw Error('Test webhook storage is unavailable.');return !!data;},
  async snapshot(id,state,checkedAt,eventId){const {data,error}=await db.rpc('kreovar_apply_dodo_sandbox_snapshot',{p_checkout_id:id,p_state:state,p_checked_at:checkedAt,p_event_id:eventId||null});if(error||!data)throw Error('Could not persist verified test billing.');return data as {duplicate:boolean};}
 };
}
