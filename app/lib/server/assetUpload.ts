import {createHash} from "node:crypto";
import {getAdminClient} from "./adminAuth";
import {assetExtensions,assetFilename,assetMetadata,MAX_STUDIO_FILE,STUDIO_BUCKET,validateAssetBytes} from "./assetPolicy";
import {assetView,type AssetRow} from "./assetStore";

export async function prepareAssetUpload(userId:string,input:Record<string,unknown>){
 const {hash,mime,name,size}=input;
 if(typeof hash!=="string"||!/^[a-f0-9]{64}$/.test(hash)||typeof mime!=="string"||!assetExtensions[mime]||typeof name!=="string"||name.length>512||typeof size!=="number"||!Number.isInteger(size)||size<=0||size>MAX_STUDIO_FILE)throw new Error("Invalid upload. Choose a supported file up to 100 MB.");
 if(["application/x-subrip","text/vtt"].includes(mime)&&size>1048576)throw new Error("Caption files support up to 1 MB.");
 const db=getAdminClient(),bucket=await db.storage.getBucket(STUDIO_BUCKET);
 if(bucket.error||!bucket.data||bucket.data.public)throw new Error("Private asset storage is unavailable.");
 const kind=mime.startsWith("video/")?"video":mime.startsWith("audio/")?"audio":mime.startsWith("image/")?"image":mime==="text/plain"?"document":"caption";
 const path=userId+"/"+hash+"."+assetExtensions[mime];
 const reservation=await db.rpc("reserve_studio_asset",{p_user_id:userId,p_hash:hash,p_kind:kind,p_filename:assetFilename(name,mime),p_mime:mime,p_bytes:size,p_path:path,p_source:"upload",p_metadata:assetMetadata(input.metadata)});
 if(reservation.error||!reservation.data)throw new Error(reservation.error?.message?.includes("ASSET_QUOTA_EXCEEDED")?"Your Asset Library reached its 2 GB limit.":"Could not reserve this upload. Please retry.");
 const row=(Array.isArray(reservation.data)?reservation.data[0]:reservation.data) as AssetRow;
 if(!row?.id||row.user_id!==userId||row.storage_path!==path||Number(row.size_bytes)!==size||row.mime!==mime)throw new Error("Invalid upload reservation.");
 if(row.status==="ready")return {asset:assetView(row)};
 const signed=await db.storage.from(STUDIO_BUCKET).createSignedUploadUrl(path,{upsert:false});
 if(signed.error||!signed.data)throw new Error("Could not prepare private upload. Please retry.");
 return {id:row.id,signedUrl:signed.data.signedUrl,path};
}
export async function completeAssetUpload(userId:string,id:unknown){
 if(typeof id!=="string"||!/^[0-9a-f-]{36}$/i.test(id))throw new Error("Invalid upload identifier.");
 const db=getAdminClient(),result=await db.from("studio_assets").select("*").eq("id",id).eq("user_id",userId).maybeSingle(),row=result.data as AssetRow|null;
 if(result.error||!row||row.user_id!==userId||!row.storage_path.startsWith(userId+"/"))throw new Error("Upload unavailable.");
 if(row.status==="ready")return assetView(row);
 if(row.status!=="pending"||!assetExtensions[row.mime]||Number(row.size_bytes)<=0||Number(row.size_bytes)>MAX_STUDIO_FILE)throw new Error("Invalid upload reservation.");
 const bucket=await db.storage.getBucket(STUDIO_BUCKET);if(bucket.error||bucket.data?.public!==false)throw new Error("Private asset storage is unavailable.");
 const storage=db.storage.from(STUDIO_BUCKET),info=await storage.info(row.storage_path);
 if(info.error||Number(info.data?.size)!==Number(row.size_bytes))throw new Error("Upload incomplete. Select the file again to retry.");
 const downloaded=await storage.download(row.storage_path);if(downloaded.error||!downloaded.data||downloaded.data.size!==Number(row.size_bytes))throw new Error("Could not verify upload. Please retry.");
 const bytes=Buffer.from(await downloaded.data.arrayBuffer()),caption=validateAssetBytes(bytes,row.mime);
 const hash=createHash("sha256").update(bytes).digest("hex");
 if(row.storage_path!==userId+"/"+hash+"."+assetExtensions[row.mime])throw new Error("Upload integrity check failed. Select the original file again.");
 const ready=await db.from("studio_assets").update({status:"ready",metadata:{...assetMetadata(row.metadata),...caption}}).eq("id",row.id).eq("user_id",userId).eq("status","pending").select().single();
 if(ready.error||!ready.data)throw new Error("The upload could not be saved. Please retry.");
 return assetView(ready.data as AssetRow);
}
