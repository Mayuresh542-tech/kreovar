import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export interface BRollVideoItem {
  id: string;
  title?: string;
  thumbnail: string;
  videoUrl: string;
  duration: number;
  width: number;
  height: number;
  creatorName: string;
  creatorUrl: string;
  source: "pexels" | "upload";
}

async function getHandler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query") || "business technology";
    const page = searchParams.get("page") || "1";
    const perPage = searchParams.get("per_page") || "12";
    const orientation = searchParams.get("orientation") || "portrait";

    const pexelsKey =
      process.env.PEXELS_API_KEY;

    if (!pexelsKey) {
      return NextResponse.json(
        { error: "Stock footage search is temporarily unavailable.", videos: [] },
        { status: 503 }
      );
    }

    const pexelsUrl = `https://api.pexels.com/videos/search?query=${encodeURIComponent(
      query
    )}&orientation=${orientation}&per_page=${perPage}&page=${page}`;

    const res = await fetch(pexelsUrl, {
      headers: {
        Authorization: pexelsKey,
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("[Pexels API] Request error:", res.status, errText);
      return NextResponse.json(
        { error: "Stock footage search could not complete. Please retry.", videos: [] },
        { status: res.status }
      );
    }

    const data = await res.json();
    const rawVideos = data.videos || [];

    const videos: BRollVideoItem[] = rawVideos.map((v: any) => {
      // Find the best quality video file matching orientation (prefer 720p/1080p MP4)
      const files: any[] = v.video_files || [];
      const isLandscape = orientation === "landscape";
      const matchedFile = isLandscape
        ? files.find((f) => f.width > f.height && (f.quality === "hd" || f.width >= 1280)) ||
          files.find((f) => f.width > f.height) ||
          files[0]
        : files.find((f) => f.width < f.height && (f.quality === "hd" || f.height >= 720)) ||
          files.find((f) => f.width < f.height) ||
          files[0];


      return {
        id: String(v.id),
        title: query,
        thumbnail: v.image,
        videoUrl: matchedFile?.link || v.video_files?.[0]?.link || "",
        duration: v.duration,
        width: matchedFile?.width || v.width,
        height: matchedFile?.height || v.height,
        creatorName: v.user?.name || "Stock creator",
        creatorUrl: v.user?.url || "https://www.pexels.com",
        source: "pexels",
      };
    });

    return NextResponse.json({
      success: true,
      videos,
      totalResults: data.total_results || 0,
      page: Number(page),
      perPage: Number(perPage),
    });
  } catch (err: any) {
    console.error("[Pexels API] Unexpected error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to search stock videos.", videos: [] },
      { status: 500 }
    );
  }
}

export const GET = withSafeResponse(getHandler);
