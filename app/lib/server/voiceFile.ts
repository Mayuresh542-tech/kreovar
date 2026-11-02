import {getAdminClient} from "./adminAuth";
import {STUDIO_BUCKET,assetFilename,assetExtensions,validateAssetBytes} from "./assetPolicy";
import type {StudioAsset} from "../assets/types";
export interface VoiceMedia {path:string;name:string;mime:string;size:number}
export async function storeVoiceFile(user:string,id:string,bytes:Buffer,mime:string,name:string){
 if(!mime.startsWith("audio/"))throw new Error("Voice generation returned invalid audio.");validateAssetBytes(bytes,mime);
 const db=getAdminClient(),bucket=await db.storage.getBucket(STUDIO_BUCKET);if(bucket.error||bucket.data?.public!==false)throw new Error("Private voice storage is unavailable.");
 const media:VoiceMedia={path:user+"/voice/"+id+"."+assetExtensions[mime],name:assetFilename(name,mime),mime,size:bytes.length};
 const result=await db.storage.from(STUDIO_BUCKET).upload(media.path,bytes,{contentType:mime,upsert:false});if(result.error)throw new Error("Voiceover could not be saved.");return media;
}
export function voiceFileAsset(record:{id:string;duration:number;created_at:string;settings?:{media?:VoiceMedia}}):StudioAsset|null{
 const media=record.settings?.media;if(!media||!media.mime?.startsWith("audio/")||!assetExtensions[media.mime]||!Number.isFinite(media.size)||media.size<=0)return null;
 return {id:record.id,kind:"audio",name:media.name,mime:media.mime,size:media.size,url:"/api/voice/"+record.id+"/file",source:"voice",duration:Number(record.duration)||0,width:0,height:0,metadata:{},created_at:record.created_at};
}
