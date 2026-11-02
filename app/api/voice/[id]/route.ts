import { withSafeResponse } from "@/app/lib/server/safeResponse";
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

    const { data: record, error } = await adminDb
      .from("voice_generations")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error || !record) {
      return NextResponse.json({ error: "Voice generation not found" }, { status: 404 });
    }

    return NextResponse.json({ voiceGeneration: record });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

export const GET = withSafeResponse(getHandler);
