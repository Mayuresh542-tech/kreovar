import {withUsage} from '@/app/lib/server/planUsage';
import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildVoiceInstruction, DEFAULT_BRAND_VOICE } from "../../lib/brandVoice";
import { generateGroqJson } from "../../lib/server/groqService";
import {
  deductCreditsForContentKit,
  completeCreditTransaction,
  refundCreditsForContentKit,
} from "../../lib/server/usageCreditCompat";
import { CONTENT_KIT_COST } from "../../config/credits";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function resolveVoiceInstruction(token?: string | null): Promise<{ voiceInstruction: string; userId: string | null }> {
  if (!token) return { voiceInstruction: buildVoiceInstruction(DEFAULT_BRAND_VOICE, null), userId: null };

  const db = adminClient();
  if (!db) return { voiceInstruction: buildVoiceInstruction(DEFAULT_BRAND_VOICE, null), userId: null };

  try {
    const { data: userData, error: userErr } = await db.auth.getUser(token);
    if (userErr || !userData.user) {
      return { voiceInstruction: buildVoiceInstruction(DEFAULT_BRAND_VOICE, null), userId: null };
    }
    const userId = userData.user.id;
    const { data } = await db
      .from("profiles")
      .select("brand_voice, brand_voice_custom")
      .eq("id", userId)
      .maybeSingle();

    return {
      voiceInstruction: buildVoiceInstruction(data?.brand_voice, data?.brand_voice_custom),
      userId,
    };
  } catch {
    return { voiceInstruction: buildVoiceInstruction(DEFAULT_BRAND_VOICE, null), userId: null };
  }
}

export interface ContentKit {
  titles: string[];
  hooks: string[];
  thumbnail_ideas: string[];
  why_trending: string;
  content_angles: string[];
  best_format: string;
  catch_window: string;
  virality_tips: string[];
  script: string;
}

const KIT_ARRAY_FIELDS=["titles","hooks","thumbnail_ideas","content_angles","virality_tips"] as const;
const KIT_TEXT_FIELDS=["why_trending","best_format","catch_window","script"] as const;
const CONTENT_KIT_SCHEMA={type:"object",additionalProperties:false,required:[...KIT_ARRAY_FIELDS,...KIT_TEXT_FIELDS],properties:Object.fromEntries([...KIT_ARRAY_FIELDS.map(name=>[name,{type:"array",items:{type:"string"}}]),...KIT_TEXT_FIELDS.map(name=>[name,{type:"string"}])])};
type GenerationMode = "kit" | "ideas" | "script";
function stageFields(mode: GenerationMode){
  return mode === "ideas" ? {arrays:["titles","hooks","content_angles"],text:["best_format"]} : mode === "script" ? {arrays:["hooks"],text:["script"]} : {arrays:[...KIT_ARRAY_FIELDS],text:[...KIT_TEXT_FIELDS]};
}

function validateContentKit(kit:ContentKit, mode: GenerationMode){
  const fields = stageFields(mode);
  for(const field of fields.arrays as (keyof Pick<ContentKit,"titles"|"hooks"|"content_angles"|"thumbnail_ideas"|"virality_tips">)[])if(!Array.isArray(kit[field]) || !kit[field].length || kit[field].some(value=>typeof value!=="string" || !value.trim()))throw new Error("AI returned an incomplete Content Kit.");
  for(const field of fields.text as (keyof Pick<ContentKit,"script"|"best_format"|"why_trending"|"catch_window">)[])if(typeof kit[field]!=="string" || !kit[field].trim())throw new Error("AI returned an incomplete Content Kit.");
}

function buildPrompt(
  topic: string,
  niche: string,
  score: number,
  durationLabel: string,
  wordCount: number,
  format: string,
  voiceInstruction: string
): { prompt: string; systemInstruction: string } {
  const systemInstruction = `You are an elite viral content strategist and scriptwriter for Kreovar. ${voiceInstruction}
Rules:
1. Ground all analysis and scripts in the actual trending topic provided.
2. Do NOT hallucinate unverified statistics, fake subscriber counts, or fake view metrics.
3. Return STRICTLY valid JSON matching the requested fields.`;

  const prompt = `Generate a complete viral content kit for this trending topic: "${topic}" in the "${niche}" niche with a virality score of ${score}/100.

Return ONLY a JSON object with these EXACT fields:
- "titles": array of 5 high-CTR, curiosity-driven YouTube and social titles.
- "hooks": array of 3 scroll-stopping opening lines (delivered within the first 3 seconds).
- "thumbnail_ideas": array of 2 descriptive sentences detailing high-contrast thumbnail concepts (subject, emotion, colors, and 2-4 word text overlay).
- "why_trending": one clear, insightful paragraph explaining the cultural or technical catalyst driving interest in this topic right now.
- "content_angles": array of 3 distinct, contrarian or high-value angles to cover this topic differently from competitors.
- "best_format": string specifying the optimal format (e.g., "Shorts / Reels (60s)" or "Long-form Explainer (8-10m)") with a 1-sentence rationale.
- "catch_window": string estimating how many days before this trend inflection peaks (e.g. "3-5 days before mainstream saturation").
- "virality_tips": array of 3 tactical tips to maximize watch time and viewer retention on this topic.
- "script": a complete, ready-to-record spoken script for a ${durationLabel} video targeting approximately ${wordCount} words. Format it with section labels on their own lines:
HOOK:
[hook lines]
INTRO:
[context setup]
MAIN CONTENT:
[core insights and breakdown]
CTA:
[call to action]

Use natural transitions and concise spoken cadence.`;

  return { prompt, systemInstruction };
}

async function postHandler(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { topic, niche, score } = body;
    const mode: GenerationMode = body.mode ?? "kit";
    if (!["kit", "ideas", "script"].includes(mode)) return NextResponse.json({error:"Invalid generation mode"},{status:400});

    if (!topic || typeof topic !== "string" || !topic.trim()) {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 });
    }

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim() || null;

    if (!token) {
      return NextResponse.json(
        { error: "Authentication required to generate Content Kits.", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const { voiceInstruction, userId } = await resolveVoiceInstruction(token);
    if (!userId) {
      return NextResponse.json(
        { error: "Valid user session required to generate Content Kits.", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // 1. Server-side credit balance check and atomic reservation/deduction
    const cleanTopic = String(topic).trim();
    const deductResult = await deductCreditsForContentKit(userId, cleanTopic);

    if (!deductResult.success) {
      return NextResponse.json(
        {
          error: "You need 5 credits to generate a Content Kit.",
          code: "INSUFFICIENT_CREDITS",
          creditsRemaining: deductResult.creditsRemaining,
          requiredCredits: CONTENT_KIT_COST,
        },
        { status: 402 }
      );
    }

    const durationSec = typeof body.duration === "number" ? body.duration : null;
    const durationLabel = String(
      body.durationLabel || (durationSec ? `${durationSec}-second` : "60-second")
    ).trim();
    const rawWordCount =
      body.wordCount ?? body.targetWords ?? (durationSec ? Math.round(durationSec * 2.5) : 150);
    const safeWordCount = Number.isFinite(rawWordCount) ? Math.round(rawWordCount) : 150;
    const format = String(
      body.format || (durationSec && durationSec >= 180 ? "long-form" : "short-form")
    ).trim();

    const fullPrompt = buildPrompt(
      cleanTopic,
      String(niche ?? "").trim() || "general",
      Number.isFinite(score) ? Math.round(score) : 75,
      durationLabel,
      safeWordCount,
      format,
      voiceInstruction
    );

    const systemInstruction = fullPrompt.systemInstruction;
    const prompt = mode === "ideas"
      ? `Create content ideas about the following topic in the ${String(niche || "general")} niche: ${JSON.stringify(cleanTopic)}. Return ONLY JSON with titles (5 strings), hooks (3 strings), content_angles (3 strings), best_format (one string). Do not write a script. Every required field must be present.`
      : mode === "script"
      ? `Write a ready-to-record ${format} script about ${JSON.stringify(cleanTopic)} for a ${durationLabel} video, approximately ${safeWordCount} words. Tone: ${String(body.tone || "Engaging")}. Return exactly this JSON structure: {"script":"Write the ENTIRE spoken script here including HOOK, INTRO, MAIN CONTENT and CTA sections, separated by escaped newlines", "hooks":["Opening hook 1", "Opening hook 2", "Opening hook 3"]}. The script field is mandatory and is the main deliverable. Write script first, then hooks. Do not return hooks alone.`
      : fullPrompt.prompt;

    try {
      // Test hook for failure simulation
      if (body.testSimulateFailure === true || req.headers.get("x-simulate-failure") === "true") {
        throw new Error("Simulated generation failure for testing auto-refund");
      }

      const kit = await generateGroqJson<ContentKit>({
        prompt,
        systemInstruction,
        temperature: 0.3,
        userId,
        operation: "content_kit_generation",
        signal: req.signal,
        // Stage responses use JSON mode with server validation; Groq strict schemas intermittently reject valid stage requests.
        schema: mode === "kit" ? CONTENT_KIT_SCHEMA : undefined,
        maxTokens: 6144,
      });

      validateContentKit(kit, mode);

      // Mark transaction completed
      await completeCreditTransaction(deductResult.transactionId);

      return NextResponse.json({
        kit,
        creditsRemaining: deductResult.creditsRemaining,
        creditsUsed: 0,
        transactionId: deductResult.transactionId,
      });
    } catch (aiErr: any) {
      console.warn("[Content Kit API] Generation failed, automatically refunding 5 credits:", aiErr?.message);

      // 4. Automatically refund 5 credits and record the failed/refunded transaction
      const refundResult = await refundCreditsForContentKit(
        userId,
        deductResult.transactionId,
        aiErr?.message || "generation_failed"
      );

      if (aiErr?.message === "GROQ_NOT_CONFIGURED") {
        return NextResponse.json(
          {
            error: "Groq API key is not configured.",
            code: "MISSING_KEY",
            refunded: true,
            creditsRemaining: refundResult.creditsRemaining,
          },
          { status: 503 }
        );
      }

      if (aiErr?.message === "INVALID_GROQ_KEY") {
        return NextResponse.json(
          {
            error: "The configured Groq API key is invalid.",
            code: "INVALID_KEY",
            refunded: true,
            creditsRemaining: refundResult.creditsRemaining,
          },
          { status: 401 }
        );
      }

      const safeMessage =
        aiErr?.message?.includes("rate limit")
          ? "AI capacity reached — please wait a few seconds and try again."
          : aiErr?.message || "Failed to generate Content Kit. Your allowance has been restored.";

      return NextResponse.json(
        {
          error: safeMessage,
          refunded: true,
          creditsRemaining: refundResult.creditsRemaining,
        },
        { status: 503 }
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withSafeResponse(withBoundedRequest(withUsage(postHandler,'content')));



