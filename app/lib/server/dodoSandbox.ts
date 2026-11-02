import {randomUUID} from 'node:crypto';
import {getPlan,type BillingCycle} from '../../config/plans';
import {checkoutIdPattern,dodoProduct,dodoReturnUrl,getDodoConfig,safeDodoCheckoutUrl} from './dodoConfig';
import {dodoRequest,type DodoRequest} from './dodoApi';
import {dodoStore} from './dodoStore';

export interface DodoSnapshot {status:string;paid:boolean;paymentId?:string;paymentCreatedAt?:string;subscriptionId?:string;customerId?:string;paymentStatus?:string;subscriptionStatus?:string;periodEnd?:string;cancelAtPeriodEnd?:boolean;eventReceipt?:{paymentId:string;createdAt:string;status:string}}
export interface DodoCheckout extends DodoSnapshot {id:string;userId:string;email:string;cycle:BillingCycle;productId:string;sessionId?:string;checkedAt?:string;lastWebhookAt?:string}
export interface DodoStore {
 create(row:DodoCheckout):Promise<void>;attachSession(id:string,sessionId:string):Promise<void>;
 get(id:string,userId?:string):Promise<DodoCheckout|null>;find(kind:'sessionId'|'subscriptionId'|'paymentId',value:string):Promise<DodoCheckout|null>;
 hasEvent(id:string):Promise<boolean>;snapshot(id:string,state:DodoSnapshot,checkedAt:string,eventId?:string):Promise<{duplicate:boolean}>;
}
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const identifier=(v:unknown,prefix:string)=>typeof v==='string'&&new RegExp('^'+prefix+'_[A-Za-z0-9_-]{1,120}$').test(v)?v:null;
const email=(v:unknown)=>typeof v==='string'?v.trim().toLowerCase():'';
export function publicDodoCheckout(row:DodoCheckout){return {id:row.id,cycle:row.cycle,status:row.status,paid:row.paid,subscriptionId:row.subscriptionId||null,paymentStatus:row.paymentStatus||null,subscriptionStatus:row.subscriptionStatus||null,periodEnd:row.periodEnd||null,cancelAtPeriodEnd:row.cancelAtPeriodEnd||false,verifiedAt:row.checkedAt||null,lastWebhookAt:row.lastWebhookAt||null,environment:'test_mode' as const,realAccessGranted:false as const};}

export function createDodoSandboxService({store,request}:{store:DodoStore;request:DodoRequest}){
 async function create(userId:string,buyerEmail:string,cycle:BillingCycle,signal?:AbortSignal){
  getDodoConfig();if(!['monthly','yearly'].includes(cycle)||!buyerEmail||!userId)throw Error('Choose a valid billing cycle.');
  const productId=dodoProduct(cycle),plan=getPlan('pro')!,amount=(cycle==='yearly'?plan.yearlyPrice:plan.price)*100;
  const product=await request('/products/'+productId,{signal}),price=object(product.price);
  if(product.product_id!==productId||price.type!=='recurring_price'||price.currency!=='USD'||price.price!==amount||price.payment_frequency_count!==1||price.payment_frequency_interval!==(cycle==='yearly'?'Year':'Month'))throw Error('Dodo test product does not match the Kreovar plan.');
  const id=randomUUID(),returnUrl=dodoReturnUrl(id),row:DodoCheckout={id,userId,email:email(buyerEmail),cycle,productId,status:'pending',paid:false};
  await store.create(row);
  const session=await request('/checkouts',{method:'POST',signal,body:{product_cart:[{product_id:productId,quantity:1}],customer:{email:row.email},return_url:returnUrl,metadata:{app:'kreovar',environment:'test_mode',kreovar_checkout_id:id,kreovar_billing_cycle:cycle}}});
  const sessionId=identifier(session.session_id,'cks');if(!sessionId||typeof session.checkout_url!=='string')throw Error('Dodo did not return a test checkout.');
  const checkoutUrl=safeDodoCheckoutUrl(session.checkout_url);await store.attachSession(id,sessionId);
  return {...publicDodoCheckout({...row,sessionId}),checkoutUrl};
 }
 async function sync(row:DodoCheckout,signal?:AbortSignal,eventId?:string,eventPaymentId?:string){
  getDodoConfig();const checkedAt=new Date().toISOString();
  if(!row.sessionId)throw Error('This test checkout was not initialized. Start a new checkout.');
  const session=await request('/checkouts/'+row.sessionId,{signal});if(session.id!==row.sessionId)throw Error('Sandbox checkout identity mismatch.');
  const paymentId=identifier(eventPaymentId||row.paymentId||session.payment_id,'pay');
  let state:DodoSnapshot={status:session.payment_status==='failed'?'failed':session.payment_status==='cancelled'?'cancelled':'pending',paid:false,paymentStatus:typeof session.payment_status==='string'?session.payment_status:'pending'};
  if(paymentId){
   async function boundPayment(id:string){
    const payment=await request('/payments/'+id,{signal}),customer=object(payment.customer);
    const subId=identifier(payment.subscription_id,'sub')||(Array.isArray(payment.subscription_ids)&&payment.subscription_ids.length===1?identifier(payment.subscription_ids[0],'sub'):null);
    const sameInitial=payment.checkout_session_id===row.sessionId&&session.payment_id===id;
    const sameRenewal=!!row.subscriptionId&&subId===row.subscriptionId&&customer.customer_id===row.customerId;
    if(payment.payment_id!==id||email(customer.email)!==row.email||(!sameInitial&&!sameRenewal)||typeof payment.created_at!=='string'||!Number.isFinite(Date.parse(payment.created_at)))throw Error('Sandbox receipt does not match this account and checkout.');
    return {payment,customer,subId};
   }
   let bound=await boundPayment(paymentId);
   const eventReceipt=eventId?{paymentId,createdAt:String(bound.payment.created_at),status:String(bound.payment.status)}:undefined;
   // Delayed failures/refunds remain in the event ledger, never replacing a newer cycle's receipt.
   if(row.paymentId&&row.paymentCreatedAt&&Date.parse(row.paymentCreatedAt)>Date.parse(String(bound.payment.created_at)))bound=await boundPayment(row.paymentId);
   const {payment,customer,subId}=bound,selectedPaymentId=String(payment.payment_id);
   const paymentStatus=typeof payment.status==='string'?payment.status:'pending';
   const refunded=payment.refund_status==='full'||payment.refund_status==='partial'||(Array.isArray(payment.refunds)&&payment.refunds.some(r=>object(r).status==='succeeded'));
   state={...state,paymentId:selectedPaymentId,paymentCreatedAt:String(payment.created_at),paymentStatus,customerId:identifier(customer.customer_id,'cus')||undefined,status:refunded?'refunded':paymentStatus==='failed'?'failed':paymentStatus==='cancelled'?'cancelled':'pending',paid:paymentStatus==='succeeded'&&!refunded,...(eventReceipt?{eventReceipt}:{})};
   if(subId){
    const subscription=await request('/subscriptions/'+subId,{signal}),subCustomer=object(subscription.customer),plan=getPlan('pro')!,expected=(row.cycle==='yearly'?plan.yearlyPrice:plan.price)*100;
    if(subscription.subscription_id!==subId||subscription.product_id!==row.productId||subscription.product_id!==dodoProduct(row.cycle)||subCustomer.customer_id!==customer.customer_id||email(subCustomer.email)!==row.email||subscription.quantity!==1||subscription.currency!=='USD'||subscription.recurring_pre_tax_amount!==expected)throw Error('Sandbox subscription does not match the configured plan.');
    const subscriptionStatus=String(subscription.status),periodEnd=typeof subscription.next_billing_date==='string'?subscription.next_billing_date:'';
    if(!['pending','active','on_hold','cancelled','expired','failed','paused','past_due'].includes(subscriptionStatus))throw Error('Unsupported sandbox subscription state.');
    if(!Number.isFinite(Date.parse(periodEnd)))throw Error('Invalid sandbox subscription period.');
    const status=refunded?'refunded':paymentStatus==='failed'?'failed':subscriptionStatus!=='active'?subscriptionStatus:!state.paid?'pending':Date.parse(periodEnd)<=Date.now()?'expired':'active';
    state={...state,status,subscriptionId:subId,subscriptionStatus,periodEnd,cancelAtPeriodEnd:subscription.cancel_at_next_billing_date===true};
   }
  }
  await store.snapshot(row.id,state,checkedAt,eventId);
  const saved=await store.get(row.id);if(!saved)throw Error('Test checkout unavailable.');return publicDodoCheckout(saved);
 }
 async function reconcile(id:string,userId:string,signal?:AbortSignal){
  if(!checkoutIdPattern.test(id))throw Error('Test checkout unavailable.');
  const row=await store.get(id,userId);if(!row)throw Error('Test checkout unavailable.');return sync(row,signal);
 }
 async function webhook(event:Record<string,unknown>,eventId:string,signal?:AbortSignal){
  getDodoConfig();if(!/^(?:payment\.(?:succeeded|failed|processing|cancelled)|subscription\.(?:active|renewed|on_hold|failed|cancelled|expired|updated|plan_changed|paused|past_due|unpaused)|refund\.succeeded)$/.test(String(event.type)))return {ignored:true};
  if(await store.hasEvent(eventId))return {duplicate:true};
  const data=object(event.data),metadata=object(data.metadata),id=metadata.kreovar_checkout_id;
  let row=typeof id==='string'&&checkoutIdPattern.test(id)?await store.get(id):null;
  const sessionId=identifier(data.checkout_session_id,'cks'),subscriptionId=identifier(data.subscription_id,'sub');
  if(!row&&sessionId)row=await store.find('sessionId',sessionId);
  if(!row&&subscriptionId)row=await store.find('subscriptionId',subscriptionId);
  const paymentId=/^(payment\.|refund\.)/.test(String(event.type))?identifier(data.payment_id,'pay'):null;
  if(!row&&paymentId)row=await store.find('paymentId',paymentId);
  if(!row&&paymentId){
   const payment=await request('/payments/'+paymentId,{signal});
   if(payment.payment_id!==paymentId)throw Error('Sandbox receipt identity mismatch.');
   const paymentSession=identifier(payment.checkout_session_id,'cks'),paymentSubscription=identifier(payment.subscription_id,'sub');
   if(paymentSession)row=await store.find('sessionId',paymentSession);
   if(!row&&paymentSubscription)row=await store.find('subscriptionId',paymentSubscription);
  }
  if(!row)return {ignored:true};
  await sync(row,signal,eventId,paymentId||undefined);return {received:true};
 }
 return {create,reconcile,webhook};
}
export function dodoSandboxService(){return createDodoSandboxService({store:dodoStore(),request:dodoRequest});}
