import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { NextRequest, NextResponse } from "next/server";
import { verifyServerAdmin } from "@/app/lib/server/admin";
import { WHOP_DEFAULT_CHECKOUT_URL } from "@/app/config/plans";
import { getWhopCompanyInfo, getWhopProducts } from "@/app/lib/server/whopService";

export const dynamic = "force-dynamic";

async function getHandler(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const { db } = await verifyServerAdmin(authHeader);

    const hasApiKey = Boolean(process.env.WHOP_API_KEY);
    const hasWebhookSecret = Boolean(process.env.WHOP_WEBHOOK_SECRET);
    const checkoutUrl = WHOP_DEFAULT_CHECKOUT_URL;

    // Test connection to Whop API safely server-side
    let whopConnected = false;
    let whopCompany: any = null;
    let whopProducts: any[] = [];
    let connectionError: string | null = null;

    if (hasApiKey) {
      try {
        const companyInfo = await getWhopCompanyInfo();
        whopConnected = companyInfo.connected;
        if (companyInfo.connected) {
          whopCompany = {
            id: companyInfo.companyId || "verified",
            username: companyInfo.title || "Kreovar Store",
            email: companyInfo.email || "(store admin)",
          };
        } else {
          connectionError = companyInfo.errorMessage || "Whop API connection failed";
        }
      } catch (err: any) {
        connectionError = err.message || "Could not authenticate with Whop API";
      }

      // Try fetching products
      try {
        whopProducts = await getWhopProducts();
      } catch {
        // Safe fallback
      }
    }

    // Fetch recent webhook events from database
    const { data: webhooks } = await db
      .from("webhook_events")
      .select("id, provider, external_event_id, event_type, processed, processed_at, created_at, metadata")
      .eq("provider", "whop")
      .order("created_at", { ascending: false })
      .limit(20);

    // Fetch Whop customers & subscriptions from database
    const { data: whopSubs } = await db
      .from("subscriptions")
      .select("id, user_id, plan, status, credits, current_period_end, external_customer_id, external_subscription_id, created_at")
      .eq("source", "whop")
      .order("created_at", { ascending: false });

    const totalProcessedWebhooks = (webhooks || []).filter((w) => w.processed).length;
    const totalPendingWebhooks = (webhooks || []).filter((w) => !w.processed).length;

    return NextResponse.json({
      connection: {
        status: whopConnected ? "connected" : hasApiKey ? "misconfigured" : "disconnected",
        statusDisplay: whopConnected
          ? "Whop API Connected"
          : hasApiKey
          ? "Connection Attempt Failed"
          : "API Key Missing",
        hasApiKey,
        hasWebhookSecret,
        checkoutUrl,
        company: whopCompany,
        error: connectionError,
      },
      products: whopProducts,
      webhookStats: {
        recentCount: webhooks?.length || 0,
        processedCount: totalProcessedWebhooks,
        pendingCount: totalPendingWebhooks,
      },
      recentWebhooks: webhooks || [],
      whopSubscriptions: whopSubs || [],
    });
  } catch (err: any) {
    const status = err.message?.includes("Forbidden")
      ? 403
      : err.message?.includes("Missing") ||
        err.message?.includes("Invalid") ||
        err.message?.includes("token")
      ? 401
      : 500;
    return NextResponse.json({ error: err.message || "Failed to load Whop operational status" }, { status });
  }
}

export const GET = withSafeResponse(getHandler);
