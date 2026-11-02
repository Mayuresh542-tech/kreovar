import {withUsage} from '@/app/lib/server/planUsage';
import {readFile} from "node:fs/promises";
import path from "node:path";
import {NextRequest,NextResponse} from "next/server";
import {BUILTIN_SFX} from "@/app/lib/assets/builtinSfx";
import {getAuthenticatedUserId} from "@/app/lib/server/adminAuth";
import {saveStudioAsset} from "@/app/lib/server/assetStore";
import {withSafeResponse} from "@/app/lib/server/safeResponse";
import {withBoundedRequest} from "@/app/lib/server/boundedRequest";
export const runtime="nodejs";
export const POST=withSafeResponse(withBoundedRequest(withUsage(async(req:NextRequest)=>{
 const user=await getAuthenticatedUserId(req);if(!user)return NextResponse.json({error:"Sign in to import sound effects."},{status:401});
 const body=await req.json().catch(()=>({}));
 const sound=BUILTIN_SFX.find(s=>s.id===body.soundId);if(!sound)return NextResponse.json({error:"Choose a built-in sound effect."},{status:400});
 // Paths come only from the bundled manifest, never from request input.
 const bytes=await readFile(path.join(process.cwd(),"public",sound.url));
 if(body.download===true)return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"audio/wav","Content-Disposition":`attachment; filename="${sound.id}.wav"`,"Cache-Control":"private, no-store"}});
 const asset=await saveStudioAsset(user,bytes,"audio/wav",sound.name+".wav","builtin",{duration:sound.duration});
 return NextResponse.json({asset},{headers:{"Cache-Control":"private, no-store"}});
},'stock')));
