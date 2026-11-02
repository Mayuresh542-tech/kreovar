import {createHmac,timingSafeEqual} from 'node:crypto';
import {getDodoConfig} from './dodoConfig';

/** Standard Webhooks authentication. Parsing happens only after raw-body verification. */
export function verifyDodoWebhook(body:string,headers:Record<string,string>,now=Date.now()){
 try{
  getDodoConfig();const secret=process.env.DODO_PAYMENTS_WEBHOOK_KEY?.trim();
  const id=headers['webhook-id'],stamp=headers['webhook-timestamp'],signatures=headers['webhook-signature'];
  if(!secret?.startsWith('whsec_')||!id||id.length>200||!/^\d{10,12}$/.test(stamp||'')||!signatures||signatures.length>2000||Math.abs(now/1000-Number(stamp))>300)return false;
  const key=Buffer.from(secret.slice(6),'base64');if(key.length<16)return false;
  const expected=createHmac('sha256',key).update(id+'.'+stamp+'.'+body).digest();
  return signatures.split(' ').some(part=>{const [version,value]=part.split(',');if(version!=='v1'||!value)return false;const signature=Buffer.from(value,'base64');return signature.length===expected.length&&timingSafeEqual(signature,expected);});
 }catch{return false;}
}
