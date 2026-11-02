import { supabase } from "../supabase";
import { cacheRead, cacheWrite } from "./cache";
import type { EditorProject, MediaAsset } from "./model";
import { MAX_EDITOR_FILE, validateEditorFile } from "../server/editorMediaPolicy";

export type CloudOriginal = {bucket:"editor-media";path:string;sourceKey:string;projectId:string};
const extensionMime:Record<string,string>={mp4:"video/mp4",webm:"video/webm",mov:"video/quicktime",mp3:"audio/mpeg",wav:"audio/wav",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp"};
async function authorization(userId?:string) {
  const {data,error}=await supabase.auth.getSession();
  if(error||!data.session||(userId&&data.session.user.id!==userId))throw new Error("Sign in to sync or load cloud originals.");
  return {Authorization:`Bearer ${data.session.access_token}`};
}
async function request(data:Record<string,unknown>,headers:Record<string,string>,signal:AbortSignal){
  const response=await fetch("/api/editor/media",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify(data),signal});
  const result=await response.json();if(!response.ok)throw new Error(result.error||"Media sync failed.");return result;
}
export function withKnownCloudOriginals(project:EditorProject,known:Map<string,CloudOriginal>):EditorProject {
  const assets={...project.assets};
  for(const asset of Object.values(assets)){
    const cloud=known.get(asset.id+":"+asset.localKey);
    if(cloud&&cloud.sourceKey===asset.localKey)assets[asset.id]={...asset,cloud};
  }
  return {...project,assets};
}
export async function syncCloudOriginals(project:EditorProject,userId:string,known:Map<string,CloudOriginal>,signal:AbortSignal,onProgress:(message:string)=>void):Promise<EditorProject> {
  const headers=await authorization(userId),assets={...project.assets};
  for(const asset of Object.values(assets)){
    signal.throwIfAborted();
    if(asset.libraryId||!asset.localKey)continue;
    const knownKey=`${asset.id}:${asset.localKey}`,previous=known.get(knownKey)||asset.cloud;
    if(previous&&previous.sourceKey===asset.localKey&&previous.projectId===project.id&&previous.path.startsWith(`${userId}/${project.id}/`)){assets[asset.id]={...asset,cloud:previous};continue;}
    const file=await cacheRead<Blob>("media",asset.localKey) || (asset.cloud ? await loadCloudOriginal(asset) : undefined);
    if(!file)throw new Error(`${asset.name}: original missing on this device. Relink it to sync.`);
    const mime=extensionMime[asset.name.split(".").at(-1)?.toLowerCase()||""]||asset.mime;
    validateEditorFile(file.size,mime);
    const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(asset.localKey));
    const version=Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,"0")).join("").slice(0,32);
    const payload={projectId:project.id,assetId:asset.id,version,mime,size:file.size};
    onProgress(`Syncing original: ${asset.name}`);
    const result=await request(payload,headers,signal);
    if(!result.exists){
      const url=new URL(result.signedUrl),base=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
      if(url.origin!==base.origin||!url.pathname.startsWith("/storage/v1/object/upload/sign/editor-media/"))throw new Error("Invalid cloud upload destination.");
      const uploaded=await fetch(url,{method:"PUT",headers:{"Content-Type":mime,"x-upsert":"false","cache-control":"max-age=0"},body:file,signal});
      if(!uploaded.ok&&uploaded.status!==409)throw new Error(`${asset.name}: upload failed. Please retry cloud save.`);
      await request({...payload,complete:true},headers,signal);
    }
    const cloud:CloudOriginal={bucket:"editor-media",path:result.path,sourceKey:asset.localKey,projectId:project.id};
    known.set(knownKey,cloud);assets[asset.id]={...asset,cloud};
  }
  return {...project,assets};
}

export async function loadCloudOriginal(asset:MediaAsset,parentSignal?:AbortSignal):Promise<Blob> {
  if(!asset.cloud)throw new Error(`Missing original: ${asset.name}. Relink it in Media.`);
  const headers=await authorization(),signal=parentSignal?AbortSignal.any([parentSignal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000);
  const response=await fetch(`/api/editor/media?${new URLSearchParams({projectId:asset.cloud.projectId,path:asset.cloud.path})}`,{headers,signal,cache:"no-store"});
  const result=await response.json();if(!response.ok)throw new Error(result.error||"Cloud original could not be loaded.");
  const url=new URL(result.url),base=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  if(url.origin!==base.origin||!url.pathname.startsWith("/storage/v1/object/sign/editor-media/"))throw new Error("Invalid cloud original destination.");
  const download=await fetch(url,{signal});if(!download.ok)throw new Error(`${asset.name}: cloud original download failed.`);
  const reader=download.body?.getReader();if(!reader)throw new Error("Cloud original is empty.");
  let size=0;const chunks:Uint8Array<ArrayBuffer>[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_EDITOR_FILE){await reader.cancel();throw new Error("Cloud original exceeds the size limit.");}chunks.push(new Uint8Array(value));}
  if(!size||(asset.size&&size!==asset.size))throw new Error(`${asset.name}: cloud original is incomplete.`);
  const blob=new Blob(chunks,{type:download.headers.get("content-type")||asset.mime});
  if(asset.localKey)await cacheWrite("media",asset.localKey,blob).catch(()=>{});
  return blob;
}
