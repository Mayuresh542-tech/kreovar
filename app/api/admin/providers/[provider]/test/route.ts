import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../../lib/server/adminAuth";
import {
  recordAuditLog,
  testProviderConnection,
} from "../../../../../lib/server/providerRegistry";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/providers/[provider]/test
 * Executes a server-side lightweight verification test against the provider.
 */
async function postHandler(
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
    const testKey = body.testKey ? String(body.testKey).trim() : undefined;

    const result = await testProviderConnection(providerKey, testKey);

    // Update test status in database
    await db
      .from("provider_configs")
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_status: result.success ? "connected" : "error",
        last_error: result.success ? null : result.message,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("provider_key", providerKey);

    await recordAuditLog({
      adminUserId: user.id,
      action: "provider_tested",
      providerKey,
      metadata: {
        success: result.success,
        latencyMs: result.latencyMs,
        message: result.message,
      },
    });

    return NextResponse.json({
      success: result.success,
      message: result.message,
      latencyMs: result.latencyMs,
      status: result.success ? "connected" : "error",
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: err?.message || "Connection test failed",
        latencyMs: 0,
      },
      { status: 500 }
    );
  }
}

export const POST = withSafeResponse(withBoundedRequest(postHandler));
