import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {getAccessToken,getAuthenticatedUserId} from "@/app/lib/server/adminAuth";
import {legacyStoragePath} from "@/app/lib/media/legacyStorage";
import {withSafeResponse} from "@/app/lib/server/safeResponse";
export const dynamic="force-dynamic";
export const GET=withSafeResponse(async(req:NextRequest)=>{
 const token=getAccessToken(req),user=await getAuthenticatedUserId(req);if(!token||!user)return NextResponse.json({error:"Sign in to access media."},{status:401});
 let media;try{media=legacyStoragePath(req.nextUrl.searchParams.get("url")||"");}catch{return NextResponse.json({error:"Media unavailable."},{status:404});}
 if(!media)return NextResponse.json({error:"Media unavailable."},{status:404});
 // Sign with the caller's JWT, never the service role: Storage RLS must approve ownership.
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:"Bearer "+token}}});
 const signed=await db.storage.from(media.bucket).createSignedUrl(media.path,120);
 if(signed.error||!signed.data)return NextResponse.json({error:"Media unavailable."},{status:404});
 return NextResponse.redirect(signed.data.signedUrl,302);
});
