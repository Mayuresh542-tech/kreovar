import {NextRequest,NextResponse} from "next/server";
import {getAdminClient,getAuthenticatedUserId} from "@/app/lib/server/adminAuth";
import {STUDIO_BUCKET,assetExtensions} from "@/app/lib/server/assetPolicy";
import {voiceFileAsset} from "@/app/lib/server/voiceFile";
import {withSafeResponse} from "@/app/lib/server/safeResponse";
export const dynamic="force-dynamic";
export const GET=withSafeResponse(async(req:NextRequest,context:{params:Promise<{id:string}>})=>{
 const user=await getAuthenticatedUserId(req);if(!user)return NextResponse.json({error:"Sign in to access this voiceover."},{status:401});
 const {id}=await context.params;if(!/^[a-f0-9-]{36}$/i.test(id))return NextResponse.json({error:"Voiceover unavailable."},{status:404});
 const db=getAdminClient(),result=await db.from("voice_generations").select("id,duration,created_at,settings").eq("id",id).eq("user_id",user).eq("status","completed").maybeSingle();
 const record=result.data,asset=record?voiceFileAsset(record):null,media=record?.settings?.media;
 if(result.error||!asset||media.path!==user+"/voice/"+id+"."+assetExtensions[asset.mime])return NextResponse.json({error:"Voiceover unavailable."},{status:404});
 const bucket=await db.storage.getBucket(STUDIO_BUCKET);if(bucket.error||bucket.data?.public!==false)throw new Error("Private voice storage is unavailable.");
 const signed=await db.storage.from(STUDIO_BUCKET).createSignedUrl(media.path,120);if(signed.error||!signed.data)throw new Error("Voiceover file could not load.");
 return NextResponse.redirect(signed.data.signedUrl,302);
});
