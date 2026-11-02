import { requireOwnedProject } from "@/app/lib/server/projectAccess";
import {saveStudioAsset} from "@/app/lib/server/assetStore";
import {exportToSRT} from "@/app/lib/captions/subtitlesParser";
import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthenticatedUserId } from "@/app/lib/server/adminAuth";
import { groupWordsIntoSegments, createSegmentsFromTranscript, CaptionPresetId, CAPTION_PRESETS } from "@/app/lib/captions/presets";

export const dynamic = "force-dynamic";

async function postHandler(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);
    const adminDb = getAdminClient();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      voiceGenerationId,
      projectId,
      preset: rawPreset,
      words: fallbackWords,
      transcript: fallbackTranscript,
    }: {
      voiceGenerationId?: string;
      projectId?: string;
      preset?: CaptionPresetId;
      words?: Array<{ word: string; start: number; end: number }>;
      transcript?: string;
    } = body;

    try { await requireOwnedProject(adminDb, userId, projectId); }
    catch { return NextResponse.json({error:"This project is unavailable."},{status:404}); }

    // 1. Fetch voice generation record if available
    let voiceRecord: any = null;
    if (voiceGenerationId && !voiceGenerationId.startsWith("local_")) {
      const { data } = await adminDb
        .from("voice_generations")
        .select("*")
        .eq("id", voiceGenerationId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!data) return NextResponse.json({error:"This voiceover is unavailable."},{status:404});
      voiceRecord = data;
    }

    const words = Array.isArray(voiceRecord?.words) && voiceRecord.words.length > 0
      ? voiceRecord.words
      : (Array.isArray(fallbackWords) && fallbackWords.length > 0 ? fallbackWords : []);
    const transcript = voiceRecord?.script_text || fallbackTranscript || "";

    if (words.length === 0 && !transcript) {
      return NextResponse.json(
        { error: "Words or transcript are required to generate auto captions." },
        { status: 400 }
      );
    }

    const preset = rawPreset && CAPTION_PRESETS[rawPreset] ? rawPreset : "clean";

    // 2. Group into structured caption segments with word-level timing
    // If words exist, use them; otherwise synthesize timed segments from the raw transcript
    const segments = words.length > 0
      ? groupWordsIntoSegments(words, 4)
      : createSegmentsFromTranscript(transcript);


    const subtitle=exportToSRT(segments.map(s=>({text:s.text,startTime:s.start,endTime:s.end})));
    const asset=await saveStudioAsset(userId,Buffer.from(subtitle),"application/x-subrip","Captions","captions",{captionPreset:preset,timingSource:words.length?"speech":"estimated"});
    // 3. Store in public.caption_generations
    const validVoiceGenId = voiceRecord?.id || null;
    const { data: captionRecord, error: insertErr } = await adminDb
      .from("caption_generations")
      .insert({
        project_id: projectId || voiceRecord?.project_id || null,
        voice_generation_id: validVoiceGenId,
        user_id: userId,
        transcript,
        segments,
        words,
        preset,
        status: "completed",
      })
      .select()
      .single();

    if (insertErr) {
      throw new Error("Caption metadata could not be saved.");
    }

    return NextResponse.json({
      success: true,
      asset,
      captionGeneration: captionRecord || {
        id: `local_${Date.now()}`,
        voice_generation_id: validVoiceGenId,
        transcript,
        segments,
        words,
        preset,
      },
      segments,
      words,
      preset,
    });
  } catch (err: any) {
    console.error("[Captions API] Generation failed:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to generate auto captions." },
      { status: 500 }
    );
  }
}

export const POST = withSafeResponse(withBoundedRequest(postHandler));
