import { unwrapWebhook } from "@whop/sdk/helpers";
import { whopClient, whopCycle } from "./whopCheckout";
import { createAdminSupabaseClient } from "./admin";
import { PLANS, PlanConfig } from "../../config/plans";

export function isWhopConfigured():boolean {return Boolean(process.env.WHOP_API_KEY?.trim() && process.env.WHOP_ACCOUNT_ID);}
export async function getWhopCompanyInfo():Promise<{connected:boolean;companyId?:string;title?:string;route?:string;currency?:string;email?:string;errorMessage?:string}> {
  if(!isWhopConfigured())return {connected:false,errorMessage:"Whop account configuration is missing."};
  try {const account=await whopClient().accounts.retrieve({id:process.env.WHOP_ACCOUNT_ID!});return {connected:true,companyId:account.id,title:account.title,route:account.route,currency:"usd"};}
  catch{return {connected:false,errorMessage:"Whop account verification failed. Check server configuration."};}
}
export async function getWhopProducts():Promise<Array<{id:string;name:string;visibility:string;price?:number}>> {
  if(!isWhopConfigured())return [];
  try {const page=await whopClient().products.list({account_id:process.env.WHOP_ACCOUNT_ID,first:50});return page.data.map(p=>({id:p.id,name:p.title,visibility:p.visibility||"unknown"}));}catch{return [];}
}
/** Standard Webhooks: verify all signature headers and reject stale deliveries. */
export function verifyWhopSignature(rawBody:string, signatureHeader:string|null, secret?:string, headers?:Record<string,string>):boolean {
  if(!signatureHeader || !headers)return false;
  try {unwrapWebhook(rawBody,{headers,key:secret||process.env.WHOP_WEBHOOK_SECRET});return true;} catch{return false;}
}

/**
 * Map a Whop membership / plan name to an internal Veelox plan.
 */
export function resolveWhopPlan(productOrPlanName?: string): PlanConfig {
  const name = (productOrPlanName || "").toLowerCase();
  if (name.includes("studio") || name.includes("agency") || name.includes("enterprise")) {
    return PLANS.studio;
  }
  // Default to Creator tier for paid Whop purchases
  return PLANS.creator;
}

export interface WhopWebhookPayload {
  action: string;
  data: {
    id: string; // membership or payment id
    user_id?: string;
    email?: string;
    status?: string; // active, past_due, canceled, expired
    product_id?: string;
    product_name?: string;
    plan_name?: string;
    current_period_start?: number | string;
    current_period_end?: number | string;
    [key: string]: any;
  };
  event_id?: string;
  [key: string]: any;
}

/**
 * Handle incoming Whop webhook event idempotently.
 * 1. Checks if event has already been processed.
 * 2. Matches a confirmed account to the provider-verified payment email.
 * 3. Updates unified `subscriptions` table with source='whop'.
 * 4. Preserves balances; unconfirmed credit allowances are not granted.
 */
export async function processWhopWebhook(rawEvent:WhopWebhookPayload,eventId:string):Promise<{success:boolean;message:string;duplicate?:boolean}> {
  const db=createAdminSupabaseClient();
  const eventType=rawEvent.type||rawEvent.action||"unknown";
  if(!["payment.succeeded","membership.activated","membership.updated","membership.deactivated","membership.went_valid","membership.went_invalid"].includes(eventType))return {success:true,message:"Unsupported webhook event ignored."};
  const {data:claimed,error:claimError}=await db.rpc("claim_whop_webhook_event",{p_event_id:eventId,p_event_type:eventType});
  if(claimError)throw new Error("Could not securely claim webhook event.");
  if(!claimed)return {success:true,duplicate:true,message:"Event already processed or processing."};
  try{
    const membershipId=eventType==="payment.succeeded"?rawEvent.data?.membership_id:rawEvent.data?.id;
    if(typeof membershipId!=="string" || !/^mem_[a-zA-Z0-9]+$/.test(membershipId))throw new Error("Missing subscription membership.");
    // Read current provider state so delayed events cannot restore expired access.
    const membership=await whopClient().memberships.retrieve({id:membershipId});
    const cycle=whopCycle(membership.plan_id);
    if(!cycle || membership.account.id!==process.env.WHOP_ACCOUNT_ID)throw new Error("Membership does not belong to a configured Kreovar plan.");
    let targetUserId:string|null=null;
    const {data:existing,error:existingError}=await db.from("subscriptions").select("user_id").eq("source","whop").eq("external_subscription_id",membershipId).maybeSingle();
    if(existingError)throw new Error("Could not match subscription.");
    // Subsequent lifecycle updates keep the owner established from the paid receipt.
    if(eventType!=="payment.succeeded")targetUserId=existing?.user_id||null;
    if(!targetUserId){
      const client=whopClient();
      const payment=eventType==="payment.succeeded" && typeof rawEvent.data.id==="string" && /^pay_[a-zA-Z0-9]+$/.test(rawEvent.data.id)
        ? await client.payments.retrieve({id:rawEvent.data.id})
        : (await client.payments.list({account_id:process.env.WHOP_ACCOUNT_ID,membership_id:membershipId,status:"paid",first:1})).data[0];
      if(!payment || payment.status!=="paid" || payment.auto_refunded || payment.account_id!==process.env.WHOP_ACCOUNT_ID || payment.membership_id!==membershipId)throw new Error("A verified successful payment is required.");
      const email=typeof payment.customer_email==="string"?payment.customer_email.trim().toLowerCase():"";
      if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("The payment email could not be verified.");
      for(let page=1;page<=100;page++){
        const {data,error}=await db.auth.admin.listUsers({page,perPage:1000});
        if(error)throw new Error("Could not match buyer account.");
        const user=data.users.find(u=>u.email_confirmed_at && u.email?.trim().toLowerCase()===email);
        if(user){targetUserId=user.id;break;}if(data.users.length<1000)break;
      }
      if(!targetUserId){
        const {error}=await db.from("webhook_events").update({metadata:{pending_email:email,pending_membership_id:membershipId,pending_payment_id:payment.id}}).eq("provider","whop").eq("external_event_id",eventId);
        if(error)throw new Error("Could not retain pending purchase.");
        throw new Error("Create and confirm a Kreovar account with the payment email.");
      }
      const {data:auth,error:authError}=await db.auth.admin.getUserById(targetUserId);
      if(authError || !auth.user?.email_confirmed_at || auth.user.email?.trim().toLowerCase()!==email)throw new Error("A confirmed account matching the payment email is required.");
    }else{
      const {data:auth,error:authError}=await db.auth.admin.getUserById(targetUserId);
      if(authError||!auth.user?.email_confirmed_at)throw new Error("A confirmed purchase account is required.");
    }
    const {error}=await db.rpc("apply_kreovar_whop_membership",{p_event_id:eventId,p_user_id:targetUserId,p_membership_id:membershipId,p_customer_id:membership.user_id,p_status:membership.status,p_cycle:cycle,p_period_start:membership.current_period_start,p_period_end:membership.current_period_end,p_provider_updated_at:membership.updated_at});
    if(error)throw new Error("Could not apply verified subscription.");
    return {success:true,message:"Verified subscription updated."};
  }catch(error){
    await db.from("webhook_events").update({processed:false,processing_until:null}).eq("provider","whop").eq("external_event_id",eventId);
    throw error;
  }
}

/** Recover paid purchases after the buyer signs up/confirms the checkout email. */
export async function reconcileWhopPurchases(email:string):Promise<void>{
  const normalized=email.trim().toLowerCase();if(!normalized)return;
  const db=createAdminSupabaseClient();
  const {data,error}=await db.from("webhook_events").select("external_event_id,metadata").eq("provider","whop").eq("processed",false).eq("metadata->>pending_email",normalized).limit(5);
  if(error)throw new Error("Could not check pending purchases.");
  for(const event of data||[]){
    const metadata=event.metadata;
    if(typeof metadata?.pending_payment_id!=="string"||typeof metadata.pending_membership_id!=="string")continue;
    await processWhopWebhook({action:"payment.succeeded",data:{id:metadata.pending_payment_id,membership_id:metadata.pending_membership_id}},event.external_event_id);
  }
}
