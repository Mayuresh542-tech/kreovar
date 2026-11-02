import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {getAdminClient} from '../adminAuth';
export type Kind='preset'|'job'|'analysis'|'budget';
export interface Document<T>{revision:number;value:T}
export interface ReferenceStore {get<T>(owner:string,kind:Kind,key:string):Promise<Document<T>|undefined>;list<T>(owner:string,kind:Kind):Promise<T[]>;cas<T>(owner:string,kind:Kind,key:string,revision:number,value:T):Promise<boolean>}
const safe=(s:string)=>{if(!/^[a-zA-Z0-9:_-]{1,160}$/.test(s))throw Error('Invalid reference storage key.');return s;};
export class LocalReferenceStore implements ReferenceStore {
 constructor(private root=path.join(os.tmpdir(),'kreovar-reference-presets-'+createHash('sha256').update(process.cwd()).digest('hex').slice(0,12))){}
 private file(owner:string,kind:Kind,key:string){return path.join(this.root,safe(owner),kind,encodeURIComponent(safe(key))+'.json');}
 async get<T>(owner:string,kind:Kind,key:string):Promise<Document<T>|undefined>{try{return JSON.parse(await fs.readFile(this.file(owner,kind,key),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}}
 async list<T>(owner:string,kind:Kind){const folder=path.dirname(this.file(owner,kind,'index'));let names:string[];try{names=await fs.readdir(folder);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}return (await Promise.all(names.filter(n=>n.endsWith('.json')).map(async n=>(JSON.parse(await fs.readFile(path.join(folder,n),'utf8')) as Document<T>).value)));}
 async cas<T>(owner:string,kind:Kind,key:string,revision:number,value:T){const file=this.file(owner,kind,key),lock=file+'.lock';await fs.mkdir(path.dirname(file),{recursive:true});let handle;try{handle=await fs.open(lock,'wx');}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')return false;throw e;}try{const old=await this.get<T>(owner,kind,key);if((old?.revision||0)!==revision)return false;const temp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify({revision:revision+1,value}),{mode:0o600});await fs.rename(temp,file);return true;}finally{await handle.close();await fs.unlink(lock);}}
}
export class DatabaseReferenceStore implements ReferenceStore {
 async get<T>(owner:string,kind:Kind,key:string):Promise<Document<T>|undefined>{const {data,error}=await getAdminClient().from('reference_preset_documents').select('revision,payload').eq('owner_id',owner).eq('kind',kind).eq('key',key).maybeSingle();if(error)throw Error('Reference persistence is unavailable. Apply the reviewed feature migration before enabling this feature.');return data?{revision:Number(data.revision),value:data.payload as T}:undefined;}
 async list<T>(owner:string,kind:Kind){const {data,error}=await getAdminClient().from('reference_preset_documents').select('payload').eq('owner_id',owner).eq('kind',kind).limit(100);if(error)throw Error('Reference registry is unavailable.');return (data||[]).map(d=>d.payload as T);}
 async cas<T>(owner:string,kind:Kind,key:string,revision:number,value:T){const {data,error}=await getAdminClient().rpc('reference_document_cas',{p_owner:owner,p_kind:kind,p_key:key,p_revision:revision,p_payload:value});if(error)throw Error('Reference progress could not be saved.');return data===true;}
}
export function referenceStore():ReferenceStore {if(process.env.NODE_ENV==='development'&&process.env.REFERENCE_PRESET_LOCAL_STORE==='true')return new LocalReferenceStore();return new DatabaseReferenceStore();}
export async function mutate<T>(store:ReferenceStore,owner:string,kind:Kind,key:string,update:(old:T|undefined)=>T):Promise<T>{for(let attempt=0;attempt<8;attempt++){const old=await store.get<T>(owner,kind,key),next=update(old?.value);if(await store.cas(owner,kind,key,old?.revision||0,next))return next;await new Promise(r=>setTimeout(r,10+attempt*10));}throw Error('This reference job changed concurrently. Reload and retry.');}
