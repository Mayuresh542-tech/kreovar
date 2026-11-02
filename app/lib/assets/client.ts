import {uploadMime} from "./uploadPolicy";
import {supabase} from "../supabase";
import type {StudioAsset,AssetRole} from "./types";
export async function assetHeaders(){const {data,error}=await supabase.auth.getSession();if(error||!data.session)throw new Error("Sign in to access your assets.");return {Authorization:"Bearer "+data.session.access_token};}
export async function assetResponse(response:Response){const data=await response.json().catch(()=>({error:"Upload service did not respond. Please retry."}));if(!response.ok)throw new Error(data.error||"Asset request failed.");return data;}
export async function uploadAssetFile(file:File,metadata:Record<string,unknown>={},signal?:AbortSignal,onProgress?:(message:string)=>void):Promise<StudioAsset>{
 if(!file.size||file.size>100*1024*1024)throw new Error("Choose a non-empty file up to 100 MB.");
 signal=signal?AbortSignal.any([signal,AbortSignal.timeout(180000)]):AbortSignal.timeout(180000);
 const mime=uploadMime(file),headers={...await assetHeaders(),"Content-Type":"application/json"};
 onProgress?.("Preparing private upload…");
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await file.arrayBuffer())),b=>b.toString(16).padStart(2,"0")).join("");
 const request=async(body:Record<string,unknown>)=>assetResponse(await fetch("/api/assets/upload",{method:"POST",headers,body:JSON.stringify(body),signal}));
 const prepared=await request({action:"prepare",hash,mime,name:file.name,size:file.size,metadata});
 if(prepared.asset)return prepared.asset;
 onProgress?.("Uploading "+file.name+"…");
 const response=await fetch(prepared.signedUrl,{method:"PUT",headers:{"Content-Type":mime,"x-upsert":"false"},body:file,signal});
 // A retry can encounter the same immutable object. Finalization verifies its bytes.
 if(!response.ok){const failure=await response.json().catch(()=>({}));if(response.status!==409&&failure.statusCode!=="409"&&failure.error!=="Duplicate")throw new Error("File upload failed. Please retry.");}
 onProgress?.("Verifying and saving "+file.name+"…");
 return (await request({action:"complete",id:prepared.id})).asset;
}
export async function listAssets(params:URLSearchParams,signal?:AbortSignal):Promise<{assets:StudioAsset[];nextOffset:number|null}>{return assetResponse(await fetch("/api/assets?"+params,{headers:await assetHeaders(),signal,cache:"no-store"}));}
export async function downloadAsset(asset:StudioAsset){const response=await fetch(asset.url,{headers:await assetHeaders(),signal:AbortSignal.timeout(120000)});if(!response.ok)throw new Error("This asset could not be downloaded.");const blob=await response.blob();if(!blob.size||blob.size!==asset.size)throw new Error("The asset download is incomplete.");const url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download=asset.name;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
export async function importStockAsset(url:string,name:string,duration:number):Promise<StudioAsset>{const data=await assetResponse(await fetch("/api/assets/import",{method:"POST",headers:{...await assetHeaders(),"Content-Type":"application/json"},body:JSON.stringify({url,name,duration})}));return data.asset;}
export async function getAsset(id:string):Promise<StudioAsset>{const data=await assetResponse(await fetch("/api/assets/"+encodeURIComponent(id),{headers:await assetHeaders(),cache:"no-store"}));return data.asset;}
export async function linkAsset(projectId:string,role:AssetRole,assetId:string,signal?:AbortSignal){
 const requestSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000);
 requestSignal.throwIfAborted();const headers={...await assetHeaders(),"Content-Type":"application/json"};requestSignal.throwIfAborted();
 const result=await assetResponse(await fetch("/api/assets/link",{method:"POST",headers,body:JSON.stringify({projectId,role,assetId}),signal:requestSignal}));requestSignal.throwIfAborted();if(result?.error)throw new Error(result.error);return result;
}
export function projectAssetItem(asset:StudioAsset){return {id:asset.id,libraryId:asset.id,name:asset.name,title:asset.name,url:asset.url,audio_url:asset.url,image_url:asset.url,mime:asset.mime,size:asset.size,duration:asset.duration,source:asset.source,created_at:asset.created_at,segments:asset.metadata.segments||[]};}

export async function saveTextAsset(tool:"trends"|"ideas"|"script",title:string,text:string,topic=title):Promise<StudioAsset>{const result=await assetResponse(await fetch("/api/assets/text",{method:"POST",headers:{...await assetHeaders(),"Content-Type":"application/json"},body:JSON.stringify({tool,title:title.slice(0,160),text,topic:topic.slice(0,1000)})}));return result.asset;}
