import {withUsage} from '@/app/lib/server/planUsage';
import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/app/lib/server/adminAuth";
import { generateGeminiContent } from "@/app/lib/server/geminiService";

export const dynamic = "force-dynamic";

async function postHandler(req: NextRequest) {
  let userId: string | null = null;

  try {
    // 1. Authenticate user server-side
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    const adminDb = getAdminClient();

    if (token) {
      const { data: { user }, error: authErr } = await adminDb.auth.getUser(token);
      if (!authErr && user) {
        userId = user.id;
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to use AI generation." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { systemPrompt, userPrompt, temperature, jsonMode } = body;

    if (!userPrompt || typeof userPrompt !== "string" || userPrompt.length > 24000 || (systemPrompt != null && (typeof systemPrompt !== "string" || systemPrompt.length > 12000)) || (temperature != null && (typeof temperature !== "number" || !Number.isFinite(temperature) || temperature < 0 || temperature > 2))) {
      return NextResponse.json({ error: "userPrompt is required." }, { status: 400 });
    }

    // 2. Generate with server-side Google Gemini
    try {
      const content = await generateGeminiContent({
        prompt: userPrompt,
        systemInstruction: systemPrompt || "You are an expert creator assistant for Kreovar.",
        temperature: temperature ?? 0.7,
        jsonMode: Boolean(jsonMode),
        userId: userId ?? null,
      });

      return NextResponse.json({
        content,
        isDevelopmentMode: false,
        providerUsed: "gemini",
      });
    } catch (geminiErr: any) {
      console.warn("[AI API] Gemini completion failed, checking fallback:", geminiErr.message);

      return NextResponse.json({ error: "AI generation is temporarily unavailable." }, { status: 503 });
    }
  } catch (err: any) {
    console.error("[AI API] Error during completion:", err.message);

    return NextResponse.json({ error: "AI generation is temporarily unavailable." }, { status: 503 });
  }
}

export const POST = withSafeResponse(withBoundedRequest(withUsage(postHandler,'kit')));
