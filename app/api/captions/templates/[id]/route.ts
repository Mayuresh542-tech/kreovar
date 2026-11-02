import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthenticatedUserId } from "@/app/lib/server/adminAuth";
import { DEFAULT_CAPTION_TEMPLATES, CaptionTemplate } from "@/app/lib/captions/templates";

export const dynamic = "force-dynamic";

async function getHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sysMatch = DEFAULT_CAPTION_TEMPLATES.find((t) => t.id === id);
    if (sysMatch) {
      return NextResponse.json({ success: true, template: sysMatch });
    }

    const userId = await getAuthenticatedUserId(req);
    const adminDb = getAdminClient();

    let query = adminDb.from("caption_templates").select("*").eq("id", id);
    if (userId) {
      query = query.or(`is_public.eq.true,user_id.eq.${userId}`);
    } else {
      query = query.eq("is_public", true);
    }

    const { data, error } = await query.maybeSingle();
    if (error || !data) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const template: CaptionTemplate = {
      id: data.id,
      name: data.name,
      category: data.category as any,
      tagline: data.description || "Custom Creator Preset",
      description: data.description || "",
      isCustom: true,
      userId: data.user_id,
      style: data.style,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    return NextResponse.json({ success: true, template });
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
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { name, category, description, style } = body;

    const adminDb = getAdminClient();
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (name) updatePayload.name = name;
    if (category) updatePayload.category = category;
    if (description !== undefined) updatePayload.description = description;
    if (style) updatePayload.style = style;

    const { data, error } = await adminDb
      .from("caption_templates")
      .update(updatePayload)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const updatedTemplate: CaptionTemplate = {
      id: data.id,
      name: data.name,
      category: data.category as any,
      tagline: data.description || "Custom Creator Preset",
      description: data.description || "",
      isCustom: true,
      userId: data.user_id,
      style: data.style,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    return NextResponse.json({ success: true, template: updatedTemplate });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

async function deleteHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminDb = getAdminClient();
    const { error } = await adminDb
      .from("caption_templates")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

export const PATCH = withSafeResponse(withBoundedRequest(patchHandler));

export const DELETE = withSafeResponse(withBoundedRequest(deleteHandler));

export const GET = withSafeResponse(getHandler);
