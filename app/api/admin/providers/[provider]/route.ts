import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/server/adminAuth";
import { recordAuditLog } from "../../../../lib/server/providerRegistry";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/providers/[provider]
 * Updates provider non-secret configuration or toggles enabled/disabled state.
 */
async function patchHandler(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { db, user } = auth;
  const resolvedParams = await params;
  const providerKey = resolvedParams.provider;

  try {
    const body = await req.json().catch(() => ({}));
    const { enabled, config } = body;

    const { data: existing, error: fetchErr } = await db
      .from("provider_configs")
      .select("*")
      .eq("provider_key", providerKey)
      .maybeSingle();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Provider not found." }, { status: 404 });
    }

    const updates: Record<string, any> = {
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    let action = "config_updated";

    if (typeof enabled === "boolean") {
      updates.enabled = enabled;
      action = enabled ? "provider_enabled" : "provider_disabled";
    }

    if (config && typeof config === "object") {
      updates.config = {
        ...(existing.config || {}),
        ...config,
      };
    }

    const { data: updated, error: updateErr } = await db
      .from("provider_configs")
      .update(updates)
      .eq("provider_key", providerKey)
      .select()
      .single();

    if (updateErr) throw updateErr;

    await recordAuditLog({
      adminUserId: user.id,
      action,
      providerKey,
      metadata: {
        enabled: updates.enabled,
        configChanged: Boolean(config),
      },
    });

    return NextResponse.json({ ok: true, provider: updated });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to update provider" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/providers/[provider]
 * Clears encrypted credentials, disables provider, and records audit log.
 */
async function deleteHandler(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { db, user } = auth;
  const resolvedParams = await params;
  const providerKey = resolvedParams.provider;

  try {
    const { data: existing } = await db
      .from("provider_configs")
      .select("*")
      .eq("provider_key", providerKey)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Provider not found." }, { status: 404 });
    }

    // Clear secret and mark disabled
    const { error: updateErr } = await db
      .from("provider_configs")
      .update({
        encrypted_api_key: null,
        enabled: false,
        last_test_status: "untested",
        last_error: null,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("provider_key", providerKey);

    if (updateErr) throw updateErr;

    await recordAuditLog({
      adminUserId: user.id,
      action: "key_removed",
      providerKey,
      metadata: {
        action: "Removed encrypted credentials and disabled provider",
      },
    });

    return NextResponse.json({
      ok: true,
      message: `Credentials for ${providerKey} have been securely removed.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to delete provider credentials" },
      { status: 500 }
    );
  }
}

export const PATCH = withSafeResponse(withBoundedRequest(patchHandler));

export const DELETE = withSafeResponse(withBoundedRequest(deleteHandler));
