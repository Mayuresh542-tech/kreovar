import {createHash} from "node:crypto";
import {getAdminClient} from "./adminAuth";
import {assetExtensions,assetFilename,assetMetadata,STUDIO_BUCKET,validateAssetBytes} from "./assetPolicy";
import type {StudioAsset} from "../assets/types";
export interface AssetRow {id:string;user_id:string;kind:StudioAsset["kind"];filename:string;mime:string;size_bytes:number;storage_path:string;source:string;metadata:Record<string,unknown>;created_at:string;status:string}
export function assetView(row:AssetRow):StudioAsset{return {id:row.id,kind:row.kind,name:row.filename,mime:row.mime,size:Number(row.size_bytes),url:"/api/assets/"+row.id+"/file",source:row.source,duration:Number(row.metadata?.duration)||0,width:Number(row.metadata?.width)||0,height:Number(row.metadata?.height)||0,metadata:row.metadata||{},created_at:row.created_at};}
export async function saveStudioAsset(userId:string,bytes:Buffer,mime:string,name:string,source="upload",metadata:unknown={}):Promise<StudioAsset>{
 const caption=validateAssetBytes(bytes,mime),extra={...assetMetadata(metadata),...caption};
 const kind=mime.startsWith("video/")?"video":mime.startsWith("audio/")?"audio":mime.startsWith("image/")?"image":mime==="text/plain"?"document":"caption";
 const hash=createHash("sha256").update(bytes).digest("hex"),storagePath=userId+"/"+hash+"."+assetExtensions[mime],db=getAdminClient();
 const bucket=await db.storage.getBucket(STUDIO_BUCKET);if(bucket.error||!bucket.data||bucket.data.public)throw new Error("Private asset storage is unavailable.");
 const reserved=await db.rpc("reserve_studio_asset",{p_user_id:userId,p_hash:hash,p_kind:kind,p_filename:assetFilename(name,mime),p_mime:mime,p_bytes:bytes.length,p_path:storagePath,p_source:source,p_metadata:extra});
 if(reserved.error||!reserved.data)throw new Error(reserved.error?.message?.includes("ASSET_QUOTA_EXCEEDED")?"Your Asset Library reached its 2 GB limit.":"Could not reserve this asset. Please retry.");
 const row=(Array.isArray(reserved.data)?reserved.data[0]:reserved.data) as AssetRow;
 if(!row?.id||row.user_id!==userId||!row.storage_path?.startsWith(userId+"/"))throw new Error("Invalid asset reservation.");
 if(row.status==="ready")return assetView(row);
 const storage=db.storage.from(STUDIO_BUCKET),upload=await storage.upload(row.storage_path,bytes,{contentType:row.mime,upsert:false});
 if(upload.error){const info=await storage.info(row.storage_path);if(info.error||Number(info.data?.size)!==Number(row.size_bytes))throw new Error("Asset upload failed. Please retry.");}
 const ready=await db.from("studio_assets").update({status:"ready"}).eq("id",row.id).eq("user_id",userId).select().single();
 if(ready.error||!ready.data)throw new Error("The upload could not be saved to your library. Please retry.");
 return assetView(ready.data as AssetRow);
}
export async function getStudioAsset(userId:string,id:string){const result=await getAdminClient().from("studio_assets").select("*").eq("id",id).eq("user_id",userId).eq("status","ready").maybeSingle();if(result.error)throw new Error("Could not load your asset.");return result.data as AssetRow|null;}
