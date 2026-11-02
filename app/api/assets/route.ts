import {NextRequest,NextResponse} from "next/server";
import {getAdminClient,getAuthenticatedUserId} from "@/app/lib/server/adminAuth";
import {assetView,saveStudioAsset} from "@/app/lib/server/assetStore";
import {withSafeResponse} from "@/app/lib/server/safeResponse";
import {withBoundedRequest} from "@/app/lib/server/boundedRequest";
export const dynamic="force-dynamic";
export const maxDuration=120;
export const GET=withSafeResponse(async(req:NextRequest)=>{
 const userId=await getAuthenticatedUserId(req);if(!userId)return NextResponse.json({error:"Sign in to view your assets."},{status:401});
 const params=req.nextUrl.searchParams,offset=Number(params.get("offset")||0),kind=params.get("kind"),query=params.get("query")||"";
 if(!Number.isInteger(offset)||offset<0||offset>10000||query.length>100||kind&&!['image','audio','video','caption','document'].includes(kind))return NextResponse.json({error:"Invalid asset search."},{status:400});
 let dbQuery=getAdminClient().from("studio_assets").select("*").eq("user_id",userId).eq("status","ready").order("created_at",{ascending:false}).order("id",{ascending:false});
 if(kind)dbQuery=dbQuery.eq("kind",kind);if(query)dbQuery=dbQuery.ilike("filename","%"+query.replace(/[%_\\]/g," ")+"%");
 const result=await dbQuery.range(offset,offset+47);if(result.error)throw new Error("Asset search failed.");
 return NextResponse.json({assets:(result.data||[]).map(assetView),nextOffset:result.data?.length===48?offset+48:null});
});
export const POST=withSafeResponse(withBoundedRequest(async(req:NextRequest)=>{
 const userId=await getAuthenticatedUserId(req);if(!userId)return NextResponse.json({error:"Sign in to upload assets."},{status:401});
 const form=await req.formData(),file=form.get("file");if(!(file instanceof File)||!file.size||file.size>100*1024*1024)return NextResponse.json({error:"Choose a supported file up to 100 MB."},{status:400});
 let metadata:unknown={};try{metadata=JSON.parse(String(form.get("metadata")||"{}"));}catch{return NextResponse.json({error:"Invalid asset metadata."},{status:400});}
 const mime=/\.srt$/i.test(file.name)?"application/x-subrip":/\.vtt$/i.test(file.name)?"text/vtt":file.type;
 try{return NextResponse.json({asset:await saveStudioAsset(userId,Buffer.from(await file.arrayBuffer()),mime,file.name,typeof (metadata as Record<string,unknown>)?.sourcePage==="string" && String((metadata as Record<string,unknown>).sourcePage).startsWith("https://pixabay.com/") ? "pixabay" : "upload",metadata)});}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Asset upload failed."},{status:422});}
}));
