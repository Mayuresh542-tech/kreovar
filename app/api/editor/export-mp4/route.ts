import {withUsage} from '@/app/lib/server/planUsage';
import {NextRequest,NextResponse} from "next/server";
import {getAuthenticatedUserId,getAdminClient} from "@/app/lib/server/adminAuth";
import {requireOwnedProject} from "@/app/lib/server/projectAccess";
import {withBoundedRequest} from "@/app/lib/server/boundedRequest";
import {withSafeResponse} from "@/app/lib/server/safeResponse";
import {finalizeEditorMp4} from "@/app/lib/server/render/editorAudio";
export const runtime="nodejs";export const maxDuration=180;
const active=new Set<string>();
export const POST=withSafeResponse(withBoundedRequest(withUsage(async(req:NextRequest)=>{
 const userId=await getAuthenticatedUserId(req);if(!userId)return NextResponse.json({error:"Sign in to export MP4."},{status:401});
 if(process.env.NEXT_PUBLIC_SERVER_MP4_ENABLED==="false")return NextResponse.json({error:"MP4 finishing is unavailable on this host. Choose WebM export."},{status:503});
 if(active.has(userId)||active.size>=2)return NextResponse.json({error:"An export is already processing. Please retry shortly."},{status:429});
 active.add(userId);
 try{const form=await req.formData(),file=form.get("recording"),metadata=form.get("project");
  if(!(file instanceof File)||!file.size||file.size>100*1048576||typeof metadata!=="string"||metadata.length>256*1024)return NextResponse.json({error:"Invalid or oversized export."},{status:400});
  const fps=Number(form.get("fps")||30);if(![24,30,60].includes(fps))return NextResponse.json({error:"Invalid export frame rate."},{status:400});
  let project;try{project=JSON.parse(metadata);}catch{return NextResponse.json({error:"Invalid project."},{status:400});}
  try{await requireOwnedProject(getAdminClient(),userId,project.id);}catch{return NextResponse.json({error:"Project unavailable."},{status:404});}
  const bytes=await finalizeEditorMp4(userId,project,Buffer.from(await file.arrayBuffer()),AbortSignal.any([req.signal,AbortSignal.timeout(165000)]),fps);
  return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"video/mp4","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch(e){const message=e instanceof Error?e.message:"Export could not be completed.";return NextResponse.json({error:message},{status:422});}
 finally{active.delete(userId);}
},'server-export')));
