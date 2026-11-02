import {assertVideoDuration} from "@/app/lib/editor/limits";
import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/app/lib/server/adminAuth";
import { generateAutoTimeline, PlannerInput } from "@/app/lib/timeline/planner";

export const dynamic = "force-dynamic";

/**
 * Generates an automated, production-ready timeline from script, voiceover,
 * B-roll footage, kinetic captions, and background music.
 */
async function postHandler(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized.", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const body: PlannerInput = await req.json().catch(() => ({}));
    if (!body.scriptText && (!body.scenes || body.scenes.length === 0)) {
      return NextResponse.json(
        { error: "Script text or scenes are required to plan video editing.", code: "EMPTY_INPUT" },
        { status: 400 }
      );
    }

    const timeline = generateAutoTimeline({
      projectId: body.projectId || `proj_${Date.now()}`,
      title: body.title || "AI Edited Video",
      scriptText: body.scriptText,
      scenes: body.scenes,
      voiceover: body.voiceover,
      brollClips: body.brollClips,
      rawVideoUrl: body.rawVideoUrl,
      captions: body.captions,
      music: body.music,
      aspectRatio: body.aspectRatio || "9:16",
    });

    try{assertVideoDuration(timeline.duration);}catch{return NextResponse.json({error:"Videos up to 60 seconds are supported. Use a shorter script or footage."},{status:400});}
    return NextResponse.json({
      success: true,
      timeline,
    });
  } catch (err: any) {
    console.error("[Compile Timeline API] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to compile AI timeline." },
      { status: 500 }
    );
  }
}

export const POST = withSafeResponse(withBoundedRequest(postHandler));
