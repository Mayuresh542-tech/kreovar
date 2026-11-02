import {NextRequest,NextResponse} from "next/server";
import {getAuthenticatedUserId} from "@/app/lib/server/adminAuth";
import {getStudioAsset,assetView} from "@/app/lib/server/assetStore";
import {withSafeResponse} from "@/app/lib/server/safeResponse";
export const GET=withSafeResponse(async(req:NextRequest,context:{params:Promise<{id:string}>})=>{const userId=await getAuthenticatedUserId(req);if(!userId)return NextResponse.json({error:"Sign in to access this asset."},{status:401});const {id}=await context.params;if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:"Asset unavailable."},{status:404});const row=await getStudioAsset(userId,id);return row?NextResponse.json({asset:assetView(row)}):NextResponse.json({error:"Asset unavailable."},{status:404});});
