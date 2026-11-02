import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../lib/server/adminAuth";
import {
  getAllProviders,
  maskApiKey,
  recordAuditLog,
  testProviderConnection,
} from "../../../lib/server/providerRegistry";
import { encrypt } from "../../../lib/crypto";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/providers
 * Returns all registered providers with safe metadata (never plaintext keys).
 */
async function getHandler(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const providers = await getAllProviders();
    return NextResponse.json({ providers });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to load providers" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/providers
 * Configures or replaces credentials for a provider.
 * The API key is encrypted at rest using AES-256-GCM.
 */
async function postHandler(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { db, user } = auth;

  try {
    const body = await req.json().catch(() => ({}));
    const { providerKey, apiKey, config, testBeforeSave } = body;

    if (!providerKey || typeof providerKey !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid providerKey." },
        { status: 400 }
      );
    }

    // Optional pre-save connection test
    if (testBeforeSave && apiKey) {
      const testResult = await testProviderConnection(providerKey, apiKey.trim());
      if (!testResult.success) {
        return NextResponse.json(
          {
            error: `Connection test failed: ${testResult.message}`,
            testFailed: true,
          },
          { status: 422 }
        );
      }
    }

    // Fetch existing provider config
    const { data: existing } = await db
      .from("provider_configs")
      .select("*")
      .eq("provider_key", providerKey)
      .maybeSingle();

    const updatePayload: Record<string, any> = {
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    let action = "provider_configured";

    if (typeof apiKey === "string" && apiKey.trim()) {
      const trimmed = apiKey.trim();
      updatePayload.encrypted_api_key = encrypt(trimmed);
      updatePayload.last_test_status = "connected";
      updatePayload.last_tested_at = new Date().toISOString();
      updatePayload.last_error = null;
      if (existing?.encrypted_api_key) {
        action = "key_replaced";
      }
    }

    if (config && typeof config === "object") {
      updatePayload.config = {
        ...(existing?.config || {}),
        ...config,
      };
    }

    let savedRecord;
    if (existing) {
      const { data, error } = await db
        .from("provider_configs")
        .update(updatePayload)
        .eq("provider_key", providerKey)
        .select()
        .single();
      if (error) throw error;
      savedRecord = data;
    } else {
      const { data, error } = await db
        .from("provider_configs")
        .insert({
          provider_key: providerKey,
          category: body.category || "ai",
          name: body.name || providerKey,
          enabled: true,
          created_by: user.id,
          ...updatePayload,
        })
        .select()
        .single();
      if (error) throw error;
      savedRecord = data;
    }

    // Record sanitized audit event
    await recordAuditLog({
      adminUserId: user.id,
      action,
      providerKey,
      metadata: {
        maskedKey: apiKey ? maskApiKey(apiKey) : undefined,
        configUpdated: Boolean(config),
      },
    });

    return NextResponse.json({
      ok: true,
      provider: {
        provider_key: savedRecord.provider_key,
        category: savedRecord.category,
        name: savedRecord.name,
        enabled: savedRecord.enabled,
        status: savedRecord.enabled ? "connected" : "disabled",
        maskedKey: apiKey ? maskApiKey(apiKey) : undefined,
        config: savedRecord.config,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to configure provider" },
      { status: 500 }
    );
  }
}

export const POST = withSafeResponse(withBoundedRequest(postHandler));

export const GET = withSafeResponse(getHandler);
