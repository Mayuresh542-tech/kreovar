import {saveStudioAsset} from "@/app/lib/server/assetStore";
import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/app/lib/server/adminAuth";

export const dynamic = "force-dynamic";

async function postHandler(req: NextRequest) {
  try {
    const adminDb = getAdminClient();
    const token=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if(!token)return NextResponse.json({error:"Sign in to upload media."},{status:401});
    const {data:auth,error:authError}=await adminDb.auth.getUser(token);
    if(authError||!auth.user)return NextResponse.json({error:"Your session expired. Sign in again."},{status:401});
    const userId=auth.user.id;
    if(Number(req.headers.get("content-length"))>101*1024*1024)return NextResponse.json({error:"File exceeds 100MB limit."},{status:413});

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: "No video file provided." }, { status: 400 });
    }

    const mimeType = file.type || "video/mp4";
    const validMimes = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/ogg"];

    if (!validMimes.includes(mimeType)) {
      return NextResponse.json(
        { error: "Invalid video format. Please upload MP4, WebM, or MOV files." },
        { status: 400 }
      );
    }

    // Max 100MB
    const MAX_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File exceeds 100MB limit. Please compress or select a smaller clip." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const asset=await saveStudioAsset(userId,buffer,mimeType,file.name);
    const fileName=asset.id,videoUrl=asset.url;

    return NextResponse.json({
      success: true,
      asset,
      url: videoUrl,
      video: {
        id: fileName,
        title: file.name,
        thumbnail: "",
        videoUrl,
        sizeBytes: file.size,
        duration: 0,
        source: "upload",
      },
    });
  } catch (err: any) {
    console.error("[Media Upload] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error during video upload." },
      { status: 500 }
    );
  }
}

export const POST = withSafeResponse(withBoundedRequest(postHandler));
