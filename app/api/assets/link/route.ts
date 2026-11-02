import {NextRequest,NextResponse} from "next/server";
import {getAdminClient,getAuthenticatedUserId} from "@/app/lib/server/adminAuth";
import {getStudioAsset} from "@/app/lib/server/assetStore";
import {requireOwnedProject} from "@/app/lib/server/projectAccess";
import {withSafeResponse} from "@/app/lib/server/safeResponse";
import {withBoundedRequest} from "@/app/lib/server/boundedRequest";
export const POST=withSafeResponse(withBoundedRequest(async(req:NextRequest)=>{
 const userId=await getAuthenticatedUserId(req);if(!userId)return NextResponse.json({error:"Sign in to add assets."},{status:401});
 const {assetId,projectId,role}=await req.json();if(typeof assetId!=="string"||!/^[0-9a-f-]{36}$/i.test(assetId)||typeof projectId!=="string"||!['raw_footage','broll_assets','voiceovers','thumbnails','backgrounds','sfx_assets','captions'].includes(role))return NextResponse.json({error:"Invalid asset link."},{status:400});
 const db=getAdminClient();try{await requireOwnedProject(db,userId,projectId);}catch{return NextResponse.json({error:"Project unavailable."},{status:404});}
 const asset=await getStudioAsset(userId,assetId);if(!asset)return NextResponse.json({error:"Asset unavailable."},{status:404});
 const expected=role==='captions'?'caption':role==='voiceovers'||role==='sfx_assets'?'audio':role==='thumbnails'?'image':role==='backgrounds'?asset.kind:'video';
 if(expected!==asset.kind||role==='backgrounds'&&!['video','image'].includes(asset.kind))return NextResponse.json({error:"This asset cannot be used in that section."},{status:400});
 const saved=await db.from("project_asset_links").upsert({user_id:userId,project_id:projectId,asset_id:assetId,role},{onConflict:"project_id,asset_id,role"});if(saved.error)throw new Error("Could not link this asset.");
 return NextResponse.json({success:true});
}));
