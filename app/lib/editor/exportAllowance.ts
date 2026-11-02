import {assetHeaders} from '../assets/client';
import type {UsageStatus} from '../../config/allowances';
export async function getUsageStatus(signal?:AbortSignal):Promise<UsageStatus>{const response=await fetch('/api/usage',{headers:await assetHeaders(),cache:'no-store',signal});const data=await response.json();if(!response.ok)throw new Error(data.error||'Usage could not be checked.');return data;}
async function request(body:unknown,signal?:AbortSignal){const response=await fetch('/api/usage/export',{method:'POST',headers:{...await assetHeaders(),'Content-Type':'application/json'},body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000),keepalive:!signal});const data=await response.json();if(!response.ok)throw new Error(data.error||'Export allowance could not be checked.');return data;}
export async function withExportAllowance<T>(options:{resolution:number;fps:number;duration:number;projectId?:string},signal:AbortSignal,render:()=>Promise<T>):Promise<T>{
 signal.throwIfAborted();const lease=await request({action:'reserve',...options},signal);let completed=false;
 try{signal.throwIfAborted();const result=await render();signal.throwIfAborted();await request({action:'complete',id:lease.id});completed=true;return result;}
 finally{if(!completed)await request({action:'refund',id:lease.id}).catch(()=>{});if(typeof window!=='undefined')window.dispatchEvent(new Event('kreovar_usage_changed'));}
}
