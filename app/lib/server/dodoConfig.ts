import type {BillingCycle} from '../../config/plans';

export function getDodoConfig(){
 if(process.env.DODO_SANDBOX_ENABLED!=='true'||process.env.DODO_PAYMENTS_ENVIRONMENT!=='test_mode')throw Error('Dodo sandbox is disabled.');
 const apiKey=process.env.DODO_PAYMENTS_API_KEY?.trim();
 if(!apiKey||!/^dodo_test_[A-Za-z0-9._-]{10,300}$/.test(apiKey))throw Error('A Dodo TEST API key is required.');
 return {baseUrl:'https://test.dodopayments.com',apiKey};
}
export function dodoProduct(cycle:BillingCycle){
 getDodoConfig();const id=cycle==='yearly'?process.env.DODO_YEARLY_PRODUCT_ID:process.env.DODO_MONTHLY_PRODUCT_ID;
 if(!id||!/^pdt_[A-Za-z0-9_-]{1,100}$/.test(id))throw Error('Configure both Dodo sandbox products.');
 return id;
}
export const checkoutIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function dodoReturnUrl(id:string){
 if(!checkoutIdPattern.test(id))throw Error('Invalid checkout reference.');
 const raw=process.env.DODO_RETURN_ORIGIN||'',url=new URL(raw);
 if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!(url.protocol==='https:'||(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname))))throw Error('Configure a trusted return origin.');
 return url.origin+'/settings/billing/test?checkout='+id;
}
export function safeDodoCheckoutUrl(value:string){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.hostname!=='test.checkout.dodopayments.com'||url.username||url.password||url.port)throw Error('Invalid Dodo TEST checkout link.');
 return url.toString();
}
