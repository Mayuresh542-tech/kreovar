import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { NextRequest, NextResponse } from "next/server";
import { searchCuratedBroll, BrollNiche } from "@/app/lib/assets/curatedBrollCatalog";

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
  source: "pexels" | "upload" | "curated";
}

async function getHandler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawQuery = searchParams.get("query") || "business technology";
    const query = typeof rawQuery === "string" ? rawQuery.slice(0, 100).trim() : "business technology";
    const category = searchParams.get("category") as BrollNiche | null;
    const pageNum = Math.max(1, Math.min(100, parseInt(searchParams.get("page") || "1", 10) || 1));
    const perPageNum = Math.max(1, Math.min(50, parseInt(searchParams.get("per_page") || "12", 10) || 12));
    const orientation = (searchParams.get("orientation") === "landscape" ? "landscape" : "portrait") as "portrait" | "landscape";

    const pexelsKey = process.env.PEXELS_API_KEY;

    // If external Pexels API key is not configured, seamlessly return curated B-roll library
    if (!pexelsKey) {
      const curated = searchCuratedBroll(query, {
        category: category || undefined,
        orientation,
        limit: perPageNum,
      });

      return NextResponse.json({
        success: true,
        videos: curated,
        totalResults: curated.length,
        page: pageNum,
        perPage: perPageNum,
        source: "curated",
      });
    }

    const pexelsUrl = `https://api.pexels.com/videos/search?query=${encodeURIComponent(
      query
    )}&orientation=${orientation}&per_page=${perPageNum}&page=${pageNum}`;

    const res = await fetch(pexelsUrl, {
      headers: {
        Authorization: pexelsKey,
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("[Pexels API] Request error:", res.status, errText);
      // Fallback to curated catalog rather than returning an error to user
      const curated = searchCuratedBroll(query, {
        category: category || undefined,
        orientation,
        limit: perPageNum,
      });
      return NextResponse.json({
        success: true,
        videos: curated,
        totalResults: curated.length,
        page: pageNum,
        perPage: perPageNum,
        source: "curated",
      });
    }

    const data = await res.json();
    const rawVideos = data.videos || [];

    if (!rawVideos.length) {
      const curated = searchCuratedBroll(query, {
        category: category || undefined,
        orientation,
        limit: perPageNum,
      });
      return NextResponse.json({
        success: true,
        videos: curated,
        totalResults: curated.length,
        page: pageNum,
        perPage: perPageNum,
        source: "curated",
      });
    }

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
      page: pageNum,
      perPage: perPageNum,
      source: "pexels",
    });
  } catch (err: any) {
    console.error("[Pexels API] Unexpected error:", err);
    // Graceful fallback to curated catalog
    const curated = searchCuratedBroll("", { limit: 12 });
    return NextResponse.json({
      success: true,
      videos: curated,
      totalResults: curated.length,
      page: 1,
      perPage: 12,
      source: "curated",
    });
  }
}

export const GET = withSafeResponse(getHandler);
