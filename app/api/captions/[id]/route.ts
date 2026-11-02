import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthenticatedUserId } from "@/app/lib/server/adminAuth";

export const dynamic = "force-dynamic";

async function getHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getAuthenticatedUserId(req);
    const adminDb = getAdminClient();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: captionRecord, error } = await adminDb
      .from("caption_generations")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error || !captionRecord) {
      return NextResponse.json({ error: "Caption generation not found" }, { status: 404 });
    }

    return NextResponse.json({ captionGeneration: captionRecord });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

async function patchHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getAuthenticatedUserId(req);
    const adminDb = getAdminClient();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { segments, preset, styleOverride } = body;

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (segments !== undefined) updatePayload.segments = segments;
    if (preset !== undefined) updatePayload.preset = preset;
    if (styleOverride !== undefined) updatePayload.style_override = styleOverride;

    const { data: updatedRecord, error: updateErr } = await adminDb
      .from("caption_generations")
      .update(updatePayload)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      captionGeneration: updatedRecord,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

export const PATCH = withSafeResponse(withBoundedRequest(patchHandler));

export const GET = withSafeResponse(getHandler);
