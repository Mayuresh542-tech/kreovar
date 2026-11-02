import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { generateGeminiJson } from "@/app/lib/server/geminiService";
import { getAuthenticatedUserId } from "@/app/lib/server/adminAuth";

export const dynamic = "force-dynamic";

export interface ThumbnailVariant {
  id: string;
  title: string;
  style: string;
  headlineText: string;
  badgeText?: string;
  visualDescription: string;
  backgroundGradient: string;
  imageUrl: string;
  contrastScore: number;
}

const STOCK_BACKGROUNDS = [
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1280&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1280&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1280&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1280&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1280&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1280&auto=format&fit=crop&q=80",
];

const GENERATION_AVAILABLE = false;

async function postHandler(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return NextResponse.json({ error: "Please sign in to generate thumbnails." }, { status: 401 });
  if (!GENERATION_AVAILABLE) return NextResponse.json({ error: "Thumbnail generation is coming soon.", code: "COMING_SOON" }, { status: 503 });
    const body = await req.json().catch(() => ({}));
    const { prompt, style = "youtube_bold", scriptContext } = body;

    const topic = (prompt || scriptContext || "AI Tools Revolution").trim();

    const systemInstruction = `You are a world-class YouTube thumbnail and visual media designer.
Generate 3 distinct, high-CTR thumbnail concepts for the video topic.
Return strictly a JSON object with a "variants" array containing 3 objects:
- "title": short creative title
- "headlineText": 2-4 punchy, high-contrast words for the thumbnail overlay (all caps)
- "badgeText": optional 1-2 word alert badge (e.g. "NEW", "10X", "WARNING")
- "visualDescription": description of the subject, lighting, and composition
- "contrastScore": number between 85 and 99 representing CTR score`;

    const aiPrompt = `Generate 3 high-CTR thumbnail variants for this video:
Topic: "${topic}"
Visual Style: "${style}"
Additional Context: "${scriptContext || "N/A"}"`;

    let variants: ThumbnailVariant[] = [];

    try {
      const result = await generateGeminiJson<{
        variants: Array<{
          title: string;
          headlineText: string;
          badgeText?: string;
          visualDescription: string;
          contrastScore: number;
        }>;
      }>({
        prompt: aiPrompt,
        systemInstruction,
        temperature: 0.8,
        userId: userId || undefined,
        operation: "thumbnail_generation",
      });

      if (Array.isArray(result.variants) && result.variants.length > 0) {
        variants = result.variants.map((v, idx) => ({
          id: `thumb_${Date.now()}_${idx}`,
          title: v.title || `Variant ${idx + 1}`,
          style,
          headlineText: v.headlineText || topic.slice(0, 20).toUpperCase(),
          badgeText: v.badgeText || (idx === 0 ? "DON'T MISS" : idx === 1 ? "10X" : "NEW"),
          visualDescription: v.visualDescription || "Bold high-contrast studio subject with cinematic rim lighting",
          backgroundGradient:
            idx === 0
              ? "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)"
              : idx === 1
              ? "linear-gradient(135deg, #18181b 0%, #27272a 100%)"
              : "linear-gradient(135deg, #09090b 0%, #172554 100%)",
          imageUrl: STOCK_BACKGROUNDS[idx % STOCK_BACKGROUNDS.length],
          contrastScore: v.contrastScore || 92 + idx * 2,
        }));
      }
    } catch (aiErr) {
      console.warn("[Thumbnail API] AI generation failed:", aiErr);
      return NextResponse.json({ error: "Thumbnail concepts are temporarily unavailable. Please retry." }, { status: 503 });
    }

    if (variants.length === 0) {
      return NextResponse.json({ error: "The provider returned no thumbnail concepts. Please retry." }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      variants,
      topic,
    });
  } catch (error: any) {
    console.error("[Thumbnail API] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate thumbnails" },
      { status: 500 }
    );
  }
}

export const POST = withSafeResponse(withBoundedRequest(postHandler));
