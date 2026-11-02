import {legacyStorageEndpoint} from "../media/legacyStorage";
import {originalCache} from './originalCache';
import {cacheRead} from './cache';
import {loadCloudOriginal} from './cloudMedia';
import {assetHeaders} from '../assets/client';
import type {MediaAsset} from './model';
export async function readOriginal(asset:MediaAsset,signal:AbortSignal):Promise<Blob>{
 if(!asset.libraryId)return loadOriginal(asset,signal);
 signal.throwIfAborted();
 let headers:{Authorization:string};
 try{headers=await assetHeaders();}catch(error){originalCache.clear();throw error;}
 signal.throwIfAborted();
 const key=JSON.stringify([asset.libraryId,asset.size,asset.mime,asset.localKey,asset.cloud?.path,asset.id,asset.url]);
 return originalCache.read(headers.Authorization,key,shared=>loadOriginal(asset,shared,headers),signal);
}
async function loadOriginal(asset:MediaAsset,signal:AbortSignal,authorization?:{Authorization:string}):Promise<Blob>{
 signal.throwIfAborted();
 let blob=asset.localKey?await cacheRead<Blob>('media',asset.localKey).catch(()=>undefined):undefined;
 if(!blob&&asset.cloud)blob=await loadCloudOriginal(asset,signal);
 if(!blob){
  const url=asset.libraryId?'/api/assets/'+encodeURIComponent(asset.libraryId)+'/file':asset.url?legacyStorageEndpoint(asset.url):undefined;
  if(!url||url.startsWith('blob:'))throw new Error('Original missing: '+asset.name+'. Relink it in Media.');
  const headers=asset.libraryId||url.startsWith("/api/media/legacy?")?(authorization||await assetHeaders()):undefined;
  const response=await fetch(url,{headers,signal:AbortSignal.any([signal,AbortSignal.timeout(120000)])});
  if(!response.ok)throw new Error('Could not load original: '+asset.name);
  if(Number(response.headers.get('content-length'))>100*1024*1024)throw new Error('An original exceeds 100 MB.');
  const reader=response.body?.getReader();if(!reader)throw new Error('Original is empty: '+asset.name);
  const chunks:Uint8Array<ArrayBuffer>[]=[];let size=0;
  try{while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>100*1024*1024)throw new Error('An original exceeds 100 MB.');chunks.push(new Uint8Array(value));}}catch(error){await reader.cancel().catch(()=>{});throw error;}
  blob=new Blob(chunks,{type:asset.mime});
 }
 signal.throwIfAborted();if(!blob.size||blob.size>100*1024*1024||(asset.size&&blob.size!==asset.size))throw new Error('Original is incomplete or too large: '+asset.name);
 return blob;
}
