import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { NextRequest, NextResponse } from "next/server";
import { positivePage } from "@/app/lib/server/adminUserUsage";
import { requireAdmin } from "../../../lib/server/adminAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/usage
 * Retrieves provider usage metrics, character/token aggregates, and filtered logs.
 */
async function getHandler(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { db } = auth;

  try {
    const { searchParams } = new URL(req.url);
    const providerFilter = searchParams.get("provider");
    const operationFilter = searchParams.get("operation");
    const statusFilter = searchParams.get("status");
    const page = positivePage(searchParams.get("page"));
    const limit = Math.min(100, Math.max(10, positivePage(searchParams.get("limit") || "25")));
    const offset = (page - 1) * limit;

    // Fetch all logs for summary aggregation (up to 5000 records)
    const { data: allLogs, error: aggError } = await db
      .from("provider_usage_logs")
      .select("provider_key, operation, units, unit_type, status, estimated_cost, duration_ms, created_at")
      .order("created_at", { ascending: false })
      .limit(5000);

    if (aggError) throw aggError;

    const logs = allLogs || [];

    // Calculate aggregated metrics
    let totalRequests = logs.length;
    let successfulRequests = 0;
    let totalCharacters = 0;
    let totalTokens = 0;
    let totalRenders = 0;
    let totalEstimatedCost = 0;
    let hasCostConfigured = false;

    const providerCounts: Record<string, { requests: number; units: number; cost: number }> = {};

    for (const log of logs) {
      if (log.status === "success") successfulRequests++;
      if (log.unit_type === "characters") totalCharacters += log.units;
      if (log.unit_type === "tokens") totalTokens += log.units;
      if (log.unit_type === "renders") totalRenders += log.units;
      if (typeof log.estimated_cost === "number") {
        totalEstimatedCost += log.estimated_cost;
        hasCostConfigured = true;
      }

      if (!providerCounts[log.provider_key]) {
        providerCounts[log.provider_key] = { requests: 0, units: 0, cost: 0 };
      }
      providerCounts[log.provider_key].requests++;
      providerCounts[log.provider_key].units += log.units;
      if (typeof log.estimated_cost === "number") {
        providerCounts[log.provider_key].cost += log.estimated_cost;
      }
    }

    const successRate = totalRequests > 0 ? Math.round((successfulRequests / totalRequests) * 100) : 100;

    // Build filtered query for table pagination
    let query = db
      .from("provider_usage_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (providerFilter && providerFilter !== "all") {
      query = query.eq("provider_key", providerFilter);
    }
    if (operationFilter && operationFilter !== "all") {
      query = query.eq("operation", operationFilter);
    }
    if (statusFilter && statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data: pageLogs, count: totalFiltered, error: pageError } = await query;
    if (pageError) throw pageError;

    return NextResponse.json({
      summary: {
        totalRequests,
        successfulRequests,
        successRate,
        totalCharacters,
        totalTokens,
        totalRenders,
        estimatedCost: hasCostConfigured ? Number(totalEstimatedCost.toFixed(4)) : null,
        providerCounts,
      },
      logs: pageLogs || [],
      pagination: {
        page,
        limit,
        total: totalFiltered ?? 0,
        totalPages: Math.ceil((totalFiltered ?? 0) / limit),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to load usage telemetry" },
      { status: 500 }
    );
  }
}

export const GET = withSafeResponse(getHandler);
