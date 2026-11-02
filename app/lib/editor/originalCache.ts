type Pending = {controller:AbortController;promise:Promise<Blob>;users:number};
/** Session memory only. No private media, credentials or signed URLs are persisted. */
export class OriginalCache {
 private scope='';private blobs=new Map<string,{blob:Blob;time:number}>();private pending=new Map<string,Pending>();private bytes=0;
 constructor(private budget=160*1024*1024,private ttl=5*60*1000){}
 clear(){for(const item of this.pending.values())item.controller.abort();this.pending.clear();this.blobs.clear();this.bytes=0;this.scope='';}
 async read(scope:string,key:string,load:(signal:AbortSignal)=>Promise<Blob>,signal:AbortSignal):Promise<Blob>{
  signal.throwIfAborted();if(scope!==this.scope){this.clear();this.scope=scope;}
  const cached=this.blobs.get(key);
  if(cached){this.blobs.delete(key);if(Date.now()-cached.time<this.ttl){this.blobs.set(key,{...cached,time:Date.now()});return cached.blob;}this.bytes-=cached.blob.size;}
  let task=this.pending.get(key);
  if(!task){
   const controller=new AbortController();
   const created:Pending={controller,users:0,promise:Promise.resolve(undefined as unknown as Blob)};
   created.promise=Promise.resolve().then(()=>{controller.signal.throwIfAborted();return load(controller.signal);}).then(blob=>{
    controller.signal.throwIfAborted();
    if(blob.size&&blob.size<=this.budget&&this.pending.get(key)===created&&this.scope===scope){
     while(this.bytes+blob.size>this.budget||this.blobs.size>=32){const oldest=this.blobs.keys().next().value;if(oldest===undefined)break;this.bytes-=this.blobs.get(oldest)!.blob.size;this.blobs.delete(oldest);}
     this.blobs.set(key,{blob,time:Date.now()});this.bytes+=blob.size;
    }return blob;
   }).finally(()=>{if(this.pending.get(key)===created)this.pending.delete(key);});
   this.pending.set(key,created);task=created;
  }
  const item=task;item.users++;
  return new Promise<Blob>((resolve,reject)=>{
   let settled=false;
   const finish=(error:unknown,blob?:Blob)=>{if(settled)return;settled=true;signal.removeEventListener('abort',cancel);item.users--;if(item.users===0&&this.pending.get(key)===item){this.pending.delete(key);item.controller.abort();}if(error)reject(error);else resolve(blob!);};
   const cancel=()=>finish(signal.reason||new DOMException('Cancelled','AbortError'));
   signal.addEventListener('abort',cancel,{once:true});item.promise.then(blob=>finish(undefined,blob),error=>finish(error));if(signal.aborted)cancel();
  });
 }
}
export const originalCache=new OriginalCache();
