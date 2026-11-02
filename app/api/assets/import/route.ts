import {withUsage} from '@/app/lib/server/planUsage';
import {NextRequest,NextResponse} from "next/server";
import {getAuthenticatedUserId} from "@/app/lib/server/adminAuth";
import {saveStudioAsset} from "@/app/lib/server/assetStore";
import {allowedDownloadUrl,fetchBrollDownload} from "@/app/lib/server/brollDownload";
import {withSafeResponse} from "@/app/lib/server/safeResponse";
import {withBoundedRequest} from "@/app/lib/server/boundedRequest";
export const maxDuration=120;
export const POST=withSafeResponse(withBoundedRequest(withUsage(async(req:NextRequest)=>{const userId=await getAuthenticatedUserId(req);if(!userId)return NextResponse.json({error:"Sign in to save stock footage."},{status:401});const body=await req.json();if(typeof body.url!=="string"||typeof body.name!=="string"||body.name.length>180||!Number.isFinite(body.duration)||body.duration<=0||body.duration>86400)return NextResponse.json({error:"Choose a stock clip with a valid duration."},{status:400});let url:URL;try{url=allowedDownloadUrl(body.url);}catch{return NextResponse.json({error:"Unsupported stock source."},{status:400});}const response=await fetchBrollDownload(url.href,body.name,AbortSignal.any([req.signal,AbortSignal.timeout(85000)]));const asset=await saveStudioAsset(userId,Buffer.from(await response.arrayBuffer()),response.headers.get("Content-Type")||"video/mp4",body.name,url.hostname==="cdn.pixabay.com"?"pixabay":"pexels",{duration:body.duration});return NextResponse.json({asset});},'stock')));
