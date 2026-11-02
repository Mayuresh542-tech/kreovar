import {NextRequest,NextResponse} from "next/server";
import {getAdminClient,getAuthenticatedUserId} from "@/app/lib/server/adminAuth";
import {getStudioAsset} from "@/app/lib/server/assetStore";
import {STUDIO_BUCKET} from "@/app/lib/server/assetPolicy";
import {withSafeResponse} from "@/app/lib/server/safeResponse";
export const dynamic="force-dynamic";
export const GET=withSafeResponse(async(req:NextRequest,context:{params:Promise<{id:string}>})=>{
 const userId=await getAuthenticatedUserId(req);if(!userId)return NextResponse.json({error:"Sign in to access this asset."},{status:401});
 const {id}=await context.params;if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:"Asset unavailable."},{status:404});
 const row=await getStudioAsset(userId,id);if(!row)return NextResponse.json({error:"Asset unavailable."},{status:404});
 if(!row.storage_path.startsWith(userId+"/"))return NextResponse.json({error:"Asset unavailable."},{status:404});
 const signed=await getAdminClient().storage.from(STUDIO_BUCKET).createSignedUrl(row.storage_path,120,req.nextUrl.searchParams.get("download")==="1"?{download:row.filename}:{});
 if(signed.error||!signed.data)throw new Error("Could not load this asset.");
 if(req.nextUrl.searchParams.get('preview')==='1')return NextResponse.json({url:signed.data.signedUrl,expiresIn:120},{headers:{'Cache-Control':'private, no-store'}});
 return NextResponse.redirect(signed.data.signedUrl,302);
});
