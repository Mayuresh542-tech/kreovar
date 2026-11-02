import {getDodoConfig} from './dodoConfig';
export interface DodoRequestOptions {method?:'GET'|'POST';body?:Record<string,unknown>;signal?:AbortSignal}
export type DodoRequest=(resource:string,options?:DodoRequestOptions)=>Promise<Record<string,unknown>>;
/** Fixed sandbox origin, no redirects, bounded requests, no provider-body/credential logging. */
export const dodoRequest:DodoRequest=async(resource,options={})=>{
 const config=getDodoConfig();
 if(!/^\/(?:checkouts|products|payments|subscriptions)(?:\/[A-Za-z0-9_-]{1,120})?$/.test(resource))throw Error('Unsupported sandbox request.');
 const response=await fetch(config.baseUrl+resource,{method:options.method||'GET',headers:{Authorization:'Bearer '+config.apiKey,'Content-Type':'application/json'},...(options.body?{body:JSON.stringify(options.body)}:{}),signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(6500)]):AbortSignal.timeout(6500),redirect:'error',cache:'no-store'});
 if(!response.ok)throw Error(response.status===429?'Dodo test capacity reached. Retry later.':'Dodo sandbox could not complete this request.');
 const text=await response.text();if(text.length>1024*1024)throw Error('Invalid sandbox response.');
 const value:unknown=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid sandbox response.');
 return value as Record<string,unknown>;
};
