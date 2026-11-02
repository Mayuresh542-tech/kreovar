import {withUsage} from '@/app/lib/server/planUsage';
import {randomUUID} from "node:crypto";
import {storeVoiceFile,voiceFileAsset,type VoiceMedia} from "@/app/lib/server/voiceFile";
import {STUDIO_BUCKET} from "@/app/lib/server/assetPolicy";
import {saveStudioAsset} from "@/app/lib/server/assetStore";
import { requireOwnedProject } from "@/app/lib/server/projectAccess";
import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthenticatedUserId } from "@/app/lib/server/adminAuth";
import { getTTSProvider } from "@/app/lib/server/tts/registry";
import { CURATED_VOICES } from "@/app/lib/server/tts/voices";
import {
  deductCreditsForVoice,
  refundCreditsForVoice,
  completeCreditTransaction,
} from "@/app/lib/server/usageCreditCompat";
import { VOICE_SYNTHESIS_COST } from "@/app/config/credits";

export const dynamic = "force-dynamic";

export interface SceneInput {
  id: string;
  label?: string;
  text: string;
}

export interface GeneratedSceneVoice {
  id: string;
  label?: string;
  text: string;
  audioUrl: string;
  duration: number;
  words: Array<{ word: string; start: number; end: number }>;
}

async function postHandler(req: NextRequest) {
  const startTime = Date.now();
  let userId: string | null = null;
  let transactionId: string | undefined;
  let creditsReserved = false;
  let privateMedia:VoiceMedia|undefined;
  let generationSaved=false;

  try {
    // 1. Authenticate user server-side via token / session cookie / dev fallback
    userId = await getAuthenticatedUserId(req);
    const adminDb = getAdminClient();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to generate voiceover.", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      projectId,
      text,
      scenes: rawScenes,
      voiceConfig,
      saveToLibrary,
    }: {
      saveToLibrary?: boolean;
      projectId?: string;
      text?: string;
      scenes?: SceneInput[];
      voiceConfig?: {
        voiceId?: string;
        speed?: number;
        stability?: number;
        similarityBoost?: number;
        language?: string;
        emotion?: string;
      };
    } = body;

    // Validate script text
    const cleanText = (text || "").trim();
    const hasScenes = Array.isArray(rawScenes) && rawScenes.length > 0;

    if (!cleanText && !hasScenes) {
      return NextResponse.json(
        { error: "Script text is required for voice generation.", code: "EMPTY_SCRIPT" },
        { status: 400 }
      );
    }

    try { await requireOwnedProject(adminDb, userId, projectId); }
    catch { return NextResponse.json({error:"This project is unavailable."},{status:404}); }

    // 2. Validate credits and atomically deduct server-side
    const scriptToCharge = cleanText || rawScenes!.map((s) => s.text).join(" ");
    const deductResult = await deductCreditsForVoice(userId, scriptToCharge);

    if (!deductResult.success) {
      return NextResponse.json(
        {
          error: deductResult.error || `You need ${VOICE_SYNTHESIS_COST} credits to generate a Voiceover.`,
          code: "INSUFFICIENT_CREDITS",
          creditsRemaining: deductResult.creditsRemaining,
          requiredCredits: VOICE_SYNTHESIS_COST,
        },
        { status: 402 }
      );
    }

    transactionId = deductResult.transactionId;
    creditsReserved = true;

    // 3. Resolve TTS Provider
    const ttsProvider = await getTTSProvider();
    const voiceId = voiceConfig?.voiceId || CURATED_VOICES[0].id;
    const selectedVoice = CURATED_VOICES.find((v) => v.id === voiceId) || CURATED_VOICES[0];

    // 4. Generate Main Audio
    const mainSpeech = await ttsProvider.generateSpeech(scriptToCharge, {
      voiceId,
      speed: voiceConfig?.speed ?? 1.0,
      stability: voiceConfig?.stability ?? 0.5,
      similarityBoost: voiceConfig?.similarityBoost ?? 0.75,
      language: voiceConfig?.language,
      emotion: voiceConfig?.emotion,
    });

    const generationId=randomUUID(),standalone=saveToLibrary===false&&!projectId;
    let libraryAsset;
    if(standalone){privateMedia=await storeVoiceFile(userId,generationId,mainSpeech.audioBuffer,mainSpeech.mimeType,selectedVoice.name+" Voiceover");libraryAsset=voiceFileAsset({id:generationId,duration:mainSpeech.duration,created_at:new Date().toISOString(),settings:{media:privateMedia}})!;}
    else libraryAsset=await saveStudioAsset(userId, mainSpeech.audioBuffer, mainSpeech.mimeType, "Voiceover", mainSpeech.provider, {duration:mainSpeech.duration});
    const mainAudioUrl = libraryAsset.url;

    // 5. Structure Scene-Level Breakdown from the synthesized words
    const generatedScenes: GeneratedSceneVoice[] = [];
    if (hasScenes) {
      let wordCursor = 0;
      for (const scene of rawScenes!) {
        const sceneText = scene.text.trim();
        if (!sceneText) continue;

        const sceneWordTokens = sceneText.split(/\s+/).filter(Boolean);
        const sceneCount = sceneWordTokens.length;
        const matchedWords = mainSpeech.words.slice(wordCursor, wordCursor + sceneCount);
        wordCursor += sceneCount;

        const sceneStart = matchedWords.length > 0 ? matchedWords[0].start : 0;
        const sceneEnd = matchedWords.length > 0 ? matchedWords[matchedWords.length - 1].end : sceneCount * 0.38;
        const sceneDuration = Number(Math.max(1, sceneEnd - sceneStart).toFixed(2));

        generatedScenes.push({
          id: scene.id,
          label: scene.label || `Scene ${generatedScenes.length + 1}`,
          text: sceneText,
          audioUrl: mainAudioUrl,
          duration: sceneDuration,
          words: matchedWords.length > 0 ? matchedWords : sceneWordTokens.map((w, wi) => ({
            word: w,
            start: Number((wi * 0.38).toFixed(2)),
            end: Number(((wi + 1) * 0.38).toFixed(2)),
          })),
        });
      }
    }

    // 6. Store metadata in database (public.voice_generations)
    const { data: voiceRecord, error: dbErr } = await adminDb
      .from("voice_generations")
      .insert({
        id:generationId,
        project_id: projectId || null,
        user_id: userId,
        provider: ttsProvider.name.toLowerCase().includes("voice")
          ? "voiceai"
          : ttsProvider.name.toLowerCase().includes("elevenlabs")
          ? "elevenlabs"
          : "mock",
        voice_id: voiceId,
        voice_name: selectedVoice.name,
        language: voiceConfig?.language || selectedVoice.language,
        settings: {
          ...(privateMedia?{media:privateMedia}:{}),
          speed: voiceConfig?.speed ?? 1.0,
          stability: voiceConfig?.stability ?? 0.5,
          similarityBoost: voiceConfig?.similarityBoost ?? 0.75,
          emotion: voiceConfig?.emotion ?? "neutral",
        },
        script_text: scriptToCharge,
        audio_url: mainAudioUrl,
        duration: mainSpeech.duration,
        scenes: generatedScenes,
        words: mainSpeech.words,
        status: "completed",
        credits_used: 0,
      })
      .select()
      .single();

    if (dbErr) {
      throw new Error("Voiceover metadata could not be saved.");
    }

    generationSaved=true;
    // Mark credit transaction completed
    if (transactionId) {
      await completeCreditTransaction(transactionId, voiceRecord?.id);
    }

    return NextResponse.json({
      success: true,
      voiceGeneration: voiceRecord || {
        id: `local_${Date.now()}`,
        audio_url: mainAudioUrl,
        duration: mainSpeech.duration,
        words: mainSpeech.words,
        scenes: generatedScenes,
      },
      asset: libraryAsset,
      audioUrl: mainAudioUrl,
      duration: mainSpeech.duration,
      words: mainSpeech.words,
      scenes: generatedScenes,
      providerUsed: mainSpeech.provider,
      isDevelopmentMode: false,
      creditsUsed: 0,
      creditsRemaining: deductResult.creditsRemaining,
      generationTimeMs: Date.now() - startTime,
    });
  } catch (err: any) {
    console.error("[Voice API] Generation failed:", err?.message || err);

    if(privateMedia&&!generationSaved)await getAdminClient().storage.from(STUDIO_BUCKET).remove([privateMedia.path]).catch(()=>{});
    let refunded = false;
    // Auto refund deducted credits upon failure
    if (userId && creditsReserved) {
      try {
        const refund = await refundCreditsForVoice(
          userId,
          transactionId,
          err?.message || "voice_generation_failed"
        );
        refunded = refund.success;
      } catch (refundErr) {
        console.error("[Voice API] Refund failed:", refundErr);
      }
    }

    return NextResponse.json(
      {
        error: refunded ? "Voice generation failed. Your allowance has been restored." : "Voice generation failed. Please retry.",
        code: "GENERATION_FAILED",
        refunded,
        details: err?.message,
      },
      { status: 500 }
    );
  }
}

export const POST = withSafeResponse(withBoundedRequest(withUsage(postHandler,'voice')));
