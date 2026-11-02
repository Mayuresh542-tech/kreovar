import {NextRequest,NextResponse} from "next/server";
import {getAuthenticatedUserId} from "@/app/lib/server/adminAuth";
import {prepareAssetUpload,completeAssetUpload} from "@/app/lib/server/assetUpload";
import {withBoundedRequest} from "@/app/lib/server/boundedRequest";
import {withSafeResponse} from "@/app/lib/server/safeResponse";
export const runtime="nodejs";
export const maxDuration=60;
export const POST=withSafeResponse(withBoundedRequest(async(req:NextRequest)=>{
 const userId=await getAuthenticatedUserId(req);if(!userId)return NextResponse.json({error:"Sign in to upload assets."},{status:401});
 let input;try{input=await req.json();}catch{return NextResponse.json({error:"Invalid upload request."},{status:400});}
 if(!input||typeof input!=="object"||Array.isArray(input))return NextResponse.json({error:"Invalid upload request."},{status:400});
 try{
  if(input.action==="prepare")return NextResponse.json(await prepareAssetUpload(userId,input),{headers:{"Cache-Control":"private, no-store"}});
  if(input.action==="complete")return NextResponse.json({asset:await completeAssetUpload(userId,input.id)});
  return NextResponse.json({error:"Invalid upload action."},{status:400});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Upload failed. Please retry."},{status:422});}
}));
