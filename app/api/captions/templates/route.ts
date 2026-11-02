import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthenticatedUserId } from "@/app/lib/server/adminAuth";
import { DEFAULT_CAPTION_TEMPLATES, CaptionTemplate } from "@/app/lib/captions/templates";

export const dynamic = "force-dynamic";

async function getHandler(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);
    const adminDb = getAdminClient();

    let userTemplates: CaptionTemplate[] = [];

    if (userId) {
      const { data, error } = await adminDb
        .from("caption_templates")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        userTemplates = data.map((row: any) => ({
          id: row.id,
          name: row.name,
          category: (row.category || "Custom") as any,
          tagline: row.description || "Custom Creator Preset",
          description: row.description || "",
          isCustom: true,
          userId: row.user_id,
          style: row.style || {},
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));
      }
    }

    return NextResponse.json({
      success: true,
      systemTemplates: DEFAULT_CAPTION_TEMPLATES,
      userTemplates,
      totalTemplates: DEFAULT_CAPTION_TEMPLATES.length + userTemplates.length,
    });
  } catch (err: any) {
    console.error("[Captions API] Error fetching templates:", err);
    return NextResponse.json(
      {
        success: true,
        systemTemplates: DEFAULT_CAPTION_TEMPLATES,
        userTemplates: [],
        totalTemplates: DEFAULT_CAPTION_TEMPLATES.length,
      },
      { status: 200 }
    );
  }
}

async function postHandler(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to save custom caption templates." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { name, category, description, style } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Template name is required." },
        { status: 400 }
      );
    }

    if (!style || typeof style !== "object") {
      return NextResponse.json(
        { error: "Template style configuration is required." },
        { status: 400 }
      );
    }

    const adminDb = getAdminClient();
    const { data, error } = await adminDb
      .from("caption_templates")
      .insert({
        user_id: userId,
        name: name.trim(),
        category: category || "Custom",
        description: description || `Custom ${name.trim()} caption style`,
        style,
        is_public: false,
      })
      .select()
      .single();

    if (error) {
      console.error("[Captions API] Error creating template:", error);
      return NextResponse.json(
        { error: error.message || "Failed to save caption template." },
        { status: 500 }
      );
    }

    const createdTemplate: CaptionTemplate = {
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

    return NextResponse.json({
      success: true,
      template: createdTemplate,
    });
  } catch (err: any) {
    console.error("[Captions API] Failed to create template:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export const POST = withSafeResponse(withBoundedRequest(postHandler));

export const GET = withSafeResponse(getHandler);
