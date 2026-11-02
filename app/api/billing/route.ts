import {usageStatus} from "@/app/lib/server/planUsage";
import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getPlan, PLANS } from "@/app/config/plans";
import { reconcileWhopPurchases } from "@/app/lib/server/whopService";
import { calculateContentKitAllowance } from "@/app/config/credits";

import { hasUnlimitedCredits, UNLIMITED_CREDIT_BALANCE } from "@/app/lib/server/creditService";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getHandler(req: NextRequest) {
  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Server missing Supabase configuration" },
        { status: 500 }
      );
    }

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await db.auth.getUser(token);
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Invalid session token" }, { status: 401 });
    }

    const userId = authData.user.id;
    const userEmail = authData.user.email ?? "";

    if(authData.user.email_confirmed_at && userEmail) await reconcileWhopPurchases(userEmail);

    // 1. Fetch user's subscription record
    let { data: sub, error: subError } = await db
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError) throw new Error("Could not load billing information.");
    if (sub?.source === "whop") {
      const { data: fresh, error } = await db.rpc("refresh_kreovar_whop_credits", { p_user_id: userId });
      if (error || !fresh) throw new Error("Could not refresh billing information.");
      sub = fresh;
    }
    // 2. Fetch user's credit transactions
    const { data: txs } = await db
      .from("credit_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    // Compute credit sum if needed
    const totalTransactionsCredits = (txs || []).reduce((acc: number, t: any) => acc + (t.amount || 0), 0);

    // Determine active subscription info
    const entitlement = await usageStatus(userId);
    
    const planId = entitlement.plan;
    const {data:grant,error:grantError}=await db.from("admin_plan_grants").select("expires_at").eq("user_id",userId).gt("expires_at",new Date().toISOString()).maybeSingle();
    if(grantError)throw new Error("Could not load account access.");
    const manualGrant=planId==="pro" && Boolean(grant) && !(sub?.source==="whop" && sub?.status==="active" && sub?.current_period_end>new Date().toISOString());

    const status = manualGrant ? "active" : sub?.status || "active";
    const source = manualGrant ? "admin" : sub?.source || "direct"; // "direct" | "whop"
    const sourceDisplay = manualGrant ? "Complimentary Pro access" : source === "whop" ? "Whop Subscription" : "Direct / Main Site";
    const planConfig = getPlan(planId) || PLANS.free;
    const unlimited = await hasUnlimitedCredits(userId);
    const credits = unlimited ? UNLIMITED_CREDIT_BALANCE : sub?.credits ?? planConfig.monthlyCredits;

    return NextResponse.json({
      subscription: {
        id: sub?.id || null,
        plan: planId,
        planName: planConfig.name,
        price: manualGrant ? 0 : sub?.billing_cycle === "yearly" ? planConfig.yearlyPrice : planConfig.price,
        displayPrice: manualGrant ? "Complimentary" : sub?.billing_cycle === "yearly" ? planConfig.yearlyDisplayPrice : planConfig.displayPrice,
        billingPeriod: sub?.billing_cycle || planConfig.billingPeriod,
        source,
        sourceDisplay,
        status,
        credits,
        unlimited,
        contentKitAllowance: calculateContentKitAllowance(credits),
        renewalDate: manualGrant ? grant?.expires_at : sub?.current_period_end || null,
        manualGrant,
        startDate: sub?.current_period_start || sub?.created_at || null,
        externalCustomerId: sub?.external_customer_id || null,
      },
      user: {
        id: userId,
        email: userEmail,
      },
      recentTransactions: txs || [],
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load billing information" },
      { status: 500 }
    );
  }
}

export const GET = withSafeResponse(getHandler);
