import {withUsage} from '@/app/lib/server/planUsage';
import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/app/lib/server/adminAuth";
import { allowedDownloadUrl, fetchBrollDownload } from "@/app/lib/server/brollDownload";

export const dynamic = "force-dynamic";
export const maxDuration = 90;
async function getHandler(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return NextResponse.json({ error: "Sign in to download B-roll." }, { status: 401 });
    const { data, error } = await getAdminClient().auth.getUser(token);
    if (error || !data.user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });
    const raw = req.nextUrl.searchParams.get("url") || "", name = (req.nextUrl.searchParams.get("filename") || "veelox-broll").slice(0, 200);
    try { allowedDownloadUrl(raw); }
    catch { return NextResponse.json({ error: "This B-roll link is not supported for downloading." }, { status: 400 }); }
    return await fetchBrollDownload(raw, name, AbortSignal.any([req.signal, AbortSignal.timeout(80000)]));
  } catch (error) {
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    return NextResponse.json({ error: timeout ? "Download timed out. Please retry." : error instanceof Error ? error.message : "Could not download this B-roll file." }, { status: timeout ? 504 : 502 });
  }
}

export const GET = withSafeResponse(withUsage(getHandler,'stock'));
