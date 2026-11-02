import {NextRequest,NextResponse} from "next/server";
import {getAuthenticatedUserId} from "@/app/lib/server/adminAuth";
import {saveStudioAsset} from "@/app/lib/server/assetStore";
import {withSafeResponse} from "@/app/lib/server/safeResponse";
import {withBoundedRequest} from "@/app/lib/server/boundedRequest";
export const POST=withSafeResponse(withBoundedRequest(async(req:NextRequest)=>{
 const user=await getAuthenticatedUserId(req);if(!user)return NextResponse.json({error:"Sign in to save your work."},{status:401});
 const body=await req.json().catch(()=>({}));
 if(!['trends','ideas','script'].includes(body.tool)||typeof body.title!=="string"||!body.title.trim()||body.title.length>160||typeof body.text!=="string"||!body.text.trim()||body.text.length>20000)return NextResponse.json({error:"Choose a valid trend, idea or script."},{status:400});
 const topic=typeof body.topic==="string"?body.topic.slice(0,1000):body.title;
 const text=body.text.trim(),bytes=Buffer.from(body.tool.toUpperCase()+"\n"+topic+"\n\n"+text);
 const asset=await saveStudioAsset(user,bytes,"text/plain",body.tool+"-"+body.title,"workflow",{toolType:body.tool,topic,text});
 return NextResponse.json({asset},{headers:{"Cache-Control":"private, no-store"}});
}));
