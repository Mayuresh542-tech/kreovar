import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthenticatedUserId } from "@/app/lib/server/adminAuth";
import { DEFAULT_CAPTION_TEMPLATES, CaptionTemplate } from "@/app/lib/captions/templates";
import { ALL_CAPTION_TEMPLATES } from "@/app/lib/captions/referenceTemplates";

export const dynamic = "force-dynamic";

async function getHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
      return NextResponse.json({ error: "Invalid template identifier." }, { status: 400 });
    }
    const sysMatch = ALL_CAPTION_TEMPLATES.find((t) => t.id === id);
    if (sysMatch) {
      return NextResponse.json({ success: true, template: sysMatch });
    }

    const userId = await getAuthenticatedUserId(req);
    if (userId && !/^[0-9a-f-]{36}$/i.test(userId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function patchHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
      return NextResponse.json({ error: "Invalid template identifier." }, { status: 400 });
    }
    const userId = await getAuthenticatedUserId(req);
    if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { name, category, description, style } = body;

    if (name !== undefined && (typeof name !== "string" || !name.trim() || name.length > 100)) {
      return NextResponse.json({ error: "Invalid template name." }, { status: 400 });
    }
    if (category !== undefined && (typeof category !== "string" || category.length > 50)) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    }
    if (description !== undefined && (typeof description !== "string" || description.length > 500)) {
      return NextResponse.json({ error: "Invalid description." }, { status: 400 });
    }
    if (style !== undefined && (!style || typeof style !== "object" || Array.isArray(style) || Object.keys(style).length > 100)) {
      return NextResponse.json({ error: "Invalid style configuration." }, { status: 400 });
    }

    const adminDb = getAdminClient();
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (name) updatePayload.name = name.trim();
    if (category) updatePayload.category = category.trim();
    if (description !== undefined) updatePayload.description = description.trim();
    if (style) updatePayload.style = style;

    const { data, error } = await adminDb
      .from("caption_templates")
      .update(updatePayload)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to update caption template." }, { status: 500 });
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
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function deleteHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
      return NextResponse.json({ error: "Invalid template identifier." }, { status: 400 });
    }
    const userId = await getAuthenticatedUserId(req);
    if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminDb = getAdminClient();
    const { error } = await adminDb
      .from("caption_templates")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: "Failed to delete caption template." }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const PATCH = withSafeResponse(withBoundedRequest(patchHandler));

export const DELETE = withSafeResponse(withBoundedRequest(deleteHandler));

export const GET = withSafeResponse(getHandler);
