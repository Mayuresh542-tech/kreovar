import {withUsage} from '@/app/lib/server/planUsage';
import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildVoiceInstruction, DEFAULT_BRAND_VOICE } from "../../lib/brandVoice";
import { generateGeminiJson } from "../../lib/server/geminiService";

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

export interface PlatformSection {
  label: string;
  kind: "text" | "list";
  value: string | string[];
}

interface PlatformSpec {
  name: string;
  guidance: string;
}

const PLATFORM_SPECS: Record<string, PlatformSpec> = {
  youtube: {
    name: "YouTube",
    guidance: `Optimize for a long-form YouTube video. Return these sections, in this order:
- { "label": "Title", "kind": "text", "value": a compelling, SEO-aware long-form title (50-70 characters) }
- { "label": "Description", "kind": "text", "value": a full description — a strong opening line, 2-3 sentences of context, a short bulleted list of what's covered, and a subscribe CTA }
- { "label": "Full Script", "kind": "text", "value": a complete spoken script with labeled HOOK, INTRO, MAIN CONTENT and CTA sections, each label on its own line separated by newlines }
- { "label": "Tags", "kind": "list", "value": 10-15 SEO tags as plain keywords with NO # symbol }`,
  },
  tiktok: {
    name: "TikTok",
    guidance: `Optimize for TikTok — vertical, fast, native and high-energy. Return these sections, in this order:
- { "label": "Hook", "kind": "text", "value": one punchy scroll-stopping line delivered in the first 2 seconds }
- { "label": "Script (15-60s)", "kind": "text", "value": a fast-paced, conversational spoken script sized for a 15-60 second video }
- { "label": "Trending Sounds", "kind": "list", "value": 3-4 suggested trending audio/sound styles that fit this content }
- { "label": "Hashtags", "kind": "list", "value": 5-8 hashtags mixing niche-specific and broad-reach tags, each including the # symbol }`,
  },
  reels: {
    name: "Instagram Reels",
    guidance: `Optimize for Instagram Reels. Return these sections, in this order:
- { "label": "Hook", "kind": "text", "value": a first-3-seconds hook combining a visual idea and a spoken line }
- { "label": "Caption", "kind": "text", "value": a catchy caption with tasteful emojis and a clear call to action }
- { "label": "Script (15-45s)", "kind": "text", "value": a short, punchy spoken script for a 15-45 second Reel }
- { "label": "Hashtags", "kind": "list", "value": 8-12 relevant hashtags, each including the # symbol }`,
  },
  twitter: {
    name: "Twitter / X",
    guidance: `Optimize for Twitter/X. Return these sections, in this order:
- { "label": "Single Viral Tweet", "kind": "text", "value": one punchy standalone tweet under 280 characters }
- { "label": "Thread", "kind": "list", "value": a 5-7 tweet thread that builds a narrative; each array item is ONE tweet prefixed like "1/", "2/" and kept under 280 characters }`,
  },
  linkedin: {
    name: "LinkedIn",
    guidance: `Optimize for LinkedIn — professional, insightful and value-first. Return these sections, in this order:
- { "label": "Hook", "kind": "text", "value": a scroll-stopping first line that earns the "see more" click }
- { "label": "Post", "kind": "text", "value": a professional, value-focused post with short paragraphs separated by newlines, a genuine insight or angle, and a closing question or takeaway }
- { "label": "Hashtags", "kind": "list", "value": 3-5 professional hashtags, each including the # symbol }`,
  },
};

async function postHandler(req: NextRequest) {
  try {
    const { topic, niche, score, platform } = await req.json();

    const cleanTopic = String(topic ?? "").trim();
    if (!cleanTopic) {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 });
    }
    const spec = PLATFORM_SPECS[String(platform ?? "").trim()];
    if (!spec) {
      return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
    }

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim() || null;
    const { voiceInstruction, userId } = await resolveVoiceInstruction(token);
    if (!userId) return NextResponse.json({ error: "Sign in to generate a platform kit." }, { status: 401 });

    const systemInstruction = `You are a platform-native content strategist. ${voiceInstruction} Keep this brand voice while respecting each platform's native format, length, and best practices.`;

    const prompt = `Repurpose this trending topic specifically for ${spec.name}:
Topic: "${cleanTopic}"
Niche: ${niche || "general"}
Virality score: ${Number.isFinite(score) ? Math.round(score) : 80}/100

${spec.guidance}

Return ONLY a JSON object shaped { "sections": [ ... ] }. Every section must have "label" (string), "kind" ("text" or "list"), and "value" (a string for "text", an array of strings for "list"). No markdown fences.`;

    try {
      const parsed = await generateGeminiJson<{ sections: any[] }>({
        prompt,
        systemInstruction,
        temperature: 0.75,
        userId,
        operation: `platform_repurpose_${platform}`,
      });

      const rawSections = Array.isArray(parsed?.sections) ? parsed.sections : [];
      const sections: PlatformSection[] = rawSections
        .map((s) => {
          const obj = (s ?? {}) as Record<string, unknown>;
          const label = String(obj.label ?? "").trim();
          const kind: "text" | "list" = obj.kind === "list" ? "list" : "text";
          let value: string | string[];
          if (kind === "list") {
            value = Array.isArray(obj.value)
              ? obj.value.map((v) => String(v).trim()).filter(Boolean)
              : obj.value
              ? [String(obj.value).trim()]
              : [];
          } else {
            value = Array.isArray(obj.value)
              ? obj.value.map((v) => String(v)).join("\n")
              : String(obj.value ?? "").trim();
          }
          return { label, kind, value };
        })
        .filter((s) => s.label && (Array.isArray(s.value) ? s.value.length > 0 : s.value.length > 0));

      return NextResponse.json({ sections });
    } catch (aiErr: any) {
      console.warn("[Platform Kit API] Gemini error:", aiErr.message);

      if (process.env.NODE_ENV === "development") {
        return NextResponse.json({
          sections: [
            { label: "Headline Hook", kind: "text", value: `How ${cleanTopic} is taking over ${spec.name}` },
            { label: "Core Takeaway", kind: "text", value: `Creators in ${niche || "tech"} are leveraging this shift to build massive engagement.` },
            { label: "Suggested Hashtags", kind: "list", value: [`#${niche || "trending"}`, `#${cleanTopic.replace(/\s+/g, "")}`, "#VeeloxAI"] },
          ],
          isDevelopmentMode: true,
        });
      }

      return NextResponse.json(
        { error: "Platform repurposing is temporarily unavailable. Please retry." },
        { status: 503 }
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withSafeResponse(withBoundedRequest(withUsage(postHandler,'script')));
