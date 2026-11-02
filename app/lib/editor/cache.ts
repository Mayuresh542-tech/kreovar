let database:Promise<IDBDatabase>|undefined;
function openDb(){
  if(!database)database=new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open("veelox-editor-v1",1);
    request.onupgradeneeded=()=>{request.result.createObjectStore("media");request.result.createObjectStore("projects");};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error("IndexedDB is unavailable."));
  }).catch(error=>{database=undefined;throw error;});
  return database;
}
export async function cacheRead<T>(store:"media"|"projects",key:string):Promise<T|undefined>{
  const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readonly"),r=tx.objectStore(store).get(key);r.onsuccess=()=>resolve(r.result as T|undefined);r.onerror=()=>reject(r.error);});
}
export async function cacheWrite(store:"media"|"projects",key:string,value:unknown):Promise<void>{
  const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error("Device storage is full."));tx.onabort=()=>reject(tx.error||new Error("Save aborted."));});
}
export const cacheKey=(userId:string|undefined,projectId:string)=>`${userId||"guest"}:${projectId}`;

export async function cacheWriteBatch(store:'media'|'projects',entries:[string,unknown][]):Promise<void>{
 const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');for(const [key,value] of entries)tx.objectStore(store).put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('Device storage is full.'));tx.onabort=()=>reject(tx.error||new Error('Recovery save was interrupted.'));});
}

/** Delete only records in this user's namespace; never clear the shared database. */
export async function clearAccountCache(userId:string):Promise<string[]>{
 const db=await openDb(),ids=new Set<string>();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(['media','projects'],'readwrite');
  for(const store of ['media','projects']){
   const request=tx.objectStore(store).openCursor();
   request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const key=String(cursor.key);if(key.startsWith(userId+':')){ids.add(key.slice(userId.length+1).split(':')[0]);cursor.delete();}cursor.continue();};
  }
  tx.oncomplete=()=>resolve([...ids]);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
}
