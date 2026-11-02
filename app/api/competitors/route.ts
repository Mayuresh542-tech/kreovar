import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "../../lib/crypto";

// Reads request headers (for the per-user key fallback) and hits the YouTube
// Data API at request time, so it must never be prerendered/cached.
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const MAX_RESULTS = 10;

function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Resolve the YouTube Data API key. The server-wide `YOUTUBE_API_KEY` env var
 * wins; if it's unset we fall back to the caller's own stored key (verified via
 * their bearer token, decrypted server-side). The DB read is defensive: a
 * missing `youtube_api_key` column (migration 0008 not yet run) is treated as
 * "no fallback" rather than an error.
 */
async function resolveYouTubeKey(req: NextRequest): Promise<string | null> {
  const envKey = process.env.YOUTUBE_API_KEY?.trim();
  if (envKey) return envKey;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  try {
    const db = adminClient();
    const { data: userData, error: userErr } = await db.auth.getUser(token);
    if (userErr || !userData.user) return null;

    const { data, error } = await db
      .from("api_keys")
      .select("youtube_api_key")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (error || !data?.youtube_api_key) return null;

    return decrypt(data.youtube_api_key).trim() || null;
  } catch {
    return null;
  }
}

export interface CompetitorVideo {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  views: number;
  likes: number;
  publishedAt: string | null;
  url: string;
}

interface SearchItem {
  id?: { videoId?: string };
}

interface VideoItem {
  id: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: Record<string, { url?: string } | undefined>;
  };
  statistics?: { viewCount?: string; likeCount?: string };
}

/** Translate a failed YouTube API response into a friendly, typed error. */
async function youtubeError(res: Response): Promise<NextResponse> {
  const body = await res.json().catch(() => null);
  const reason: string | undefined = body?.error?.errors?.[0]?.reason;

  if (res.status === 403) {
    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
      return NextResponse.json(
        { error: "YouTube API quota exceeded for today — try again later." },
        { status: 429 },
      );
    }
    // keyInvalid / accessNotConfigured / forbidden
    return NextResponse.json({ error: "invalid_youtube_key" }, { status: 403 });
  }
  if (res.status === 400) {
    return NextResponse.json({ error: "invalid_youtube_key" }, { status: 400 });
  }
  return NextResponse.json(
    { error: body?.error?.message ?? "YouTube request failed." },
    { status: res.status },
  );
}

async function postHandler(req: NextRequest) {
  try {
    const { niche } = await req.json();
    if (!niche?.trim()) {
      return NextResponse.json({ error: "Niche is required" }, { status: 400 });
    }
    const query = String(niche).trim();

    const apiKey = await resolveYouTubeKey(req);
    if (!apiKey) {
      return NextResponse.json({ error: "missing_youtube_key" }, { status: 400 });
    }

    // 1) Find the top videos in the niche, ordered by view count.
    const searchParams = new URLSearchParams({
      part: "snippet",
      q: query,
      type: "video",
      order: "viewCount",
      maxResults: String(MAX_RESULTS),
      relevanceLanguage: "en",
      regionCode: "US",
      key: apiKey,
    });

    let searchRes: Response;
    try {
      searchRes = await fetch(`${SEARCH_URL}?${searchParams}`, { signal: AbortSignal.timeout(10000) });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        return NextResponse.json({ error: "YouTube timed out — try again." }, { status: 504 });
      }
      throw err;
    }
    if (!searchRes.ok) return youtubeError(searchRes);

    const searchData = await searchRes.json();
    const ids: string[] = (searchData.items ?? [])
      .map((it: SearchItem) => it.id?.videoId)
      .filter((v: string | undefined): v is string => Boolean(v));

    if (ids.length === 0) {
      return NextResponse.json({ videos: [], averageViews: 0 });
    }

    // 2) Hydrate each video with statistics (viewCount, likeCount).
    const videoParams = new URLSearchParams({
      part: "snippet,statistics",
      id: ids.join(","),
      key: apiKey,
    });

    let videosRes: Response;
    try {
      videosRes = await fetch(`${VIDEOS_URL}?${videoParams}`, { signal: AbortSignal.timeout(10000) });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        return NextResponse.json({ error: "YouTube timed out — try again." }, { status: 504 });
      }
      throw err;
    }
    if (!videosRes.ok) return youtubeError(videosRes);

    const videosData = await videosRes.json();
    const videos: CompetitorVideo[] = (videosData.items ?? [])
      .map((item: VideoItem) => {
        const sn = item.snippet ?? {};
        const st = item.statistics ?? {};
        const thumb =
          sn.thumbnails?.medium?.url ??
          sn.thumbnails?.high?.url ??
          sn.thumbnails?.default?.url ??
          "";
        return {
          id: item.id,
          title: sn.title ?? "Untitled",
          channel: sn.channelTitle ?? "Unknown channel",
          thumbnail: thumb,
          views: Number(st.viewCount ?? 0),
          likes: Number(st.likeCount ?? 0),
          publishedAt: sn.publishedAt ?? null,
          url: `https://www.youtube.com/watch?v=${item.id}`,
        };
      })
      .sort((a: CompetitorVideo, b: CompetitorVideo) => b.views - a.views);

    const averageViews = videos.length
      ? Math.round(videos.reduce((sum, v) => sum + v.views, 0) / videos.length)
      : 0;

    return NextResponse.json({ videos, averageViews });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withSafeResponse(withBoundedRequest(postHandler));
