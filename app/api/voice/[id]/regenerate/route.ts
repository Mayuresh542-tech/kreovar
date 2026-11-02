import {reserveUsage,finishUsage,usageError,PlanLimitError} from '@/app/lib/server/planUsage';
import {saveStudioAsset} from "@/app/lib/server/assetStore";
import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthenticatedUserId } from "@/app/lib/server/adminAuth";
import { getTTSProvider } from "@/app/lib/server/tts/registry";
import { CURATED_VOICES } from "@/app/lib/server/tts/voices";

export const dynamic = "force-dynamic";

async function postHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let usageUser:string|undefined,usageId:string|undefined,usageDone=false;
  try {
    const { id } = await params;
    const userId = await getAuthenticatedUserId(req);
    const adminDb = getAdminClient();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: existing, error: fetchErr } = await adminDb
      .from("voice_generations")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Voice generation record not found." }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      sceneId,
      text,
      voiceConfig,
    }: {
      sceneId?: string;
      text?: string;
      voiceConfig?: {
        voiceId?: string;
        speed?: number;
        stability?: number;
        similarityBoost?: number;
        language?: string;
        emotion?: string;
      };
    } = body;

    const ttsProvider = await getTTSProvider();
    const voiceId = voiceConfig?.voiceId || existing.voice_id || CURATED_VOICES[0].id;
    const speed = voiceConfig?.speed ?? existing.settings?.speed ?? 1.0;
    const stability = voiceConfig?.stability ?? existing.settings?.stability ?? 0.5;

    // SCENE-LEVEL REGENERATION:
    if (sceneId) {
      const currentScenes: any[] = Array.isArray(existing.scenes) ? [...existing.scenes] : [];
      const sceneIndex = currentScenes.findIndex((s) => s.id === sceneId);
      const textToUse = text?.trim() || (sceneIndex >= 0 ? currentScenes[sceneIndex].text : "");

      if (!textToUse) {
        return NextResponse.json({ error: "Scene text cannot be empty." }, { status: 400 });
      }

      usageUser=userId;usageId=(await reserveUsage(userId,{voice_characters:Array.from(textToUse).length})).reservationId;
      const sceneSpeech = await ttsProvider.generateSpeech(textToUse, {
        voiceId,
        speed,
        stability,
        language: voiceConfig?.language || existing.language,
        emotion: voiceConfig?.emotion,
      });

      const sceneAsset = await saveStudioAsset(userId,
        sceneSpeech.audioBuffer,
        sceneSpeech.mimeType,
        `scene_${sceneId}`, "voiceover", {duration:sceneSpeech.duration}
      );
      const sceneAudioUrl=sceneAsset.url;

      const updatedScene = {
        id: sceneId,
        label: sceneIndex >= 0 ? currentScenes[sceneIndex].label : `Scene`,
        text: textToUse,
        audioUrl: sceneAudioUrl,
        duration: sceneSpeech.duration,
        words: sceneSpeech.words,
      };

      if (sceneIndex >= 0) {
        currentScenes[sceneIndex] = updatedScene;
      } else {
        currentScenes.push(updatedScene);
      }

      const {error:sceneSaveError}=await adminDb
        .from("voice_generations")
        .update({
          scenes: currentScenes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", userId);

      if(sceneSaveError)throw new Error("Regenerated scene could not be saved.");
      await finishUsage(userId,usageId!,true);usageDone=true;
      return NextResponse.json({
        asset:sceneAsset,
        success: true,
        scene: updatedScene,
        scenes: currentScenes,
      });
    }

    // FULL SCRIPT REGENERATION:
    const fullText = text?.trim() || existing.script_text;
    usageUser=userId;usageId=(await reserveUsage(userId,{voice_characters:Array.from(fullText).length})).reservationId;
    const speech = await ttsProvider.generateSpeech(fullText, {
      voiceId,
      speed,
      stability,
      language: voiceConfig?.language || existing.language,
      emotion: voiceConfig?.emotion,
    });

    const audioAsset = await saveStudioAsset(userId,
      speech.audioBuffer,
      speech.mimeType,
      "Voiceover", "voiceover", {duration:speech.duration}
    );
    const newAudioUrl=audioAsset.url;

    const { data: updatedRecord, error: updateErr } = await adminDb
      .from("voice_generations")
      .update({
        voice_id: voiceId,
        audio_url: newAudioUrl,
        duration: speech.duration,
        words: speech.words,
        script_text: fullText,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    await finishUsage(userId,usageId,true);usageDone=true;
    return NextResponse.json({
      success: true,
      asset:audioAsset,
      voiceGeneration: updatedRecord,
      audioUrl: newAudioUrl,
      duration: speech.duration,
      words: speech.words,
    });
  } catch (err: any) {
    if(err instanceof PlanLimitError)return usageError(err);
    return NextResponse.json(
      { error: err?.message || "Failed to regenerate voice." },
      { status: 500 }
    );
  }finally{if(usageUser&&usageId&&!usageDone)await finishUsage(usageUser,usageId,false).catch(()=>{});}
}

export const POST = withSafeResponse(withBoundedRequest(postHandler));
