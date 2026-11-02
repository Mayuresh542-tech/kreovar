import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";
import { NextRequest, NextResponse } from "next/server";
import { verifyServerAdmin } from "@/app/lib/server/admin";
import { PLANS } from "@/app/config/plans";

export const dynamic = "force-dynamic";

async function getHandler(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const { db } = await verifyServerAdmin(authHeader);

    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const sourceFilter = (searchParams.get("source") || "all").toLowerCase();
    const planFilter = (searchParams.get("plan") || "all").toLowerCase();
    const statusFilter = (searchParams.get("status") || "all").toLowerCase();
    const sortBy = searchParams.get("sort") || "joined_desc";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "15", 10)));

    // Fetch auth users
    const { data: usersData, error: usersErr } = await db.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersErr) throw usersErr;
    const authUsers = usersData.users || [];

    // Fetch subscriptions
    const { data: subsData } = await db.from("subscriptions").select("*");
    const subs = subsData || [];
    const subMap = new Map<string, any>();
    for (const s of subs) {
      subMap.set(s.user_id, s);
    }

    // Transform into unified user items
    let items = authUsers.map((u) => {
      const sub = subMap.get(u.id);
      const isWhop = sub?.source === "whop";
      const source = isWhop ? "whop" : "direct";
      const sourceBadge = isWhop ? "WHOP" : "MAIN SITE";
      const plan = (sub?.plan || "free").toLowerCase();
      const status = sub?.status || (sub ? "active" : "free");
      const credits = sub?.credits ?? 30;

      let revenue = 0;
      if (plan === "creator") revenue = PLANS.creator.price;
      if (plan === "studio") revenue = PLANS.studio.price;

      return {
        id: u.id,
        email: u.email || "(no email)",
        source,
        sourceBadge,
        plan,
        status,
        credits,
        joined: u.created_at,
        lastActive: u.last_sign_in_at || null,
        revenue,
        externalCustomerId: sub?.external_customer_id || null,
      };
    });

    // 1. Search Filter
    if (search) {
      items = items.filter(
        (u) =>
          u.email.toLowerCase().includes(search) ||
          u.id.toLowerCase().includes(search)
      );
    }

    // 2. Source Filter
    if (sourceFilter !== "all") {
      items = items.filter((u) => u.source === sourceFilter);
    }

    // 3. Plan Filter
    if (planFilter !== "all") {
      items = items.filter((u) => u.plan === planFilter);
    }

    // 4. Status Filter
    if (statusFilter !== "all") {
      items = items.filter((u) => u.status === statusFilter);
    }

    // 5. Sorting
    items.sort((a, b) => {
      switch (sortBy) {
        case "joined_asc":
          return new Date(a.joined).getTime() - new Date(b.joined).getTime();
        case "credits_desc":
          return b.credits - a.credits;
        case "credits_asc":
          return a.credits - b.credits;
        case "revenue_desc":
          return b.revenue - a.revenue;
        case "last_active_desc":
          return (
            (b.lastActive ? new Date(b.lastActive).getTime() : 0) -
            (a.lastActive ? new Date(a.lastActive).getTime() : 0)
          );
        case "joined_desc":
        default:
          return new Date(b.joined).getTime() - new Date(a.joined).getTime();
      }
    });

    const totalCount = items.length;
    const totalPages = Math.ceil(totalCount / limit);
    const paginatedItems = items.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      users: paginatedItems,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    });
  } catch (err: any) {
    const status = err.message?.includes("Forbidden")
      ? 403
      : err.message?.includes("Missing") || err.message?.includes("Invalid")
      ? 401
      : 500;
    return NextResponse.json({ error: err.message || "Failed to list users" }, { status });
  }
}

/**
 * Admin action on user (grant credits or adjust plan)
 */
async function postHandler(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const { db } = await verifyServerAdmin(authHeader);

    const body = await req.json().catch(() => ({}));
    const { action, userId, creditAdjustment, newPlan } = body;

    if (!userId) {
      return NextResponse.json({ error: "Target userId is required" }, { status: 400 });
    }

    if (action === "adjust_credits") {
      const amount = parseInt(creditAdjustment, 10);
      if (isNaN(amount) || amount === 0) {
        return NextResponse.json({ error: "Valid creditAdjustment number is required" }, { status: 400 });
      }

      // Record transaction
      await db.from("credit_transactions").insert({
        user_id: userId,
        amount,
        type: "adjustment",
        feature: "admin_manual_grant",
      });

      // Update subscription credits
      const { data: existingSub } = await db
        .from("subscriptions")
        .select("id, credits")
        .eq("user_id", userId)
        .maybeSingle();

      if (existingSub) {
        const updatedCredits = Math.max(0, (existingSub.credits || 0) + amount);
        await db.from("subscriptions").update({ credits: updatedCredits }).eq("id", existingSub.id);
      }

      return NextResponse.json({ ok: true, message: `Successfully adjusted credits by ${amount}` });
    }

    if (action === "change_plan") {
      if (!newPlan || !["free", "creator", "studio"].includes(newPlan.toLowerCase())) {
        return NextResponse.json({ error: "Invalid plan specified" }, { status: 400 });
      }

      const planConfig = PLANS[newPlan.toLowerCase() as keyof typeof PLANS];

      const { data: existingSub } = await db
        .from("subscriptions")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (existingSub) {
        await db
          .from("subscriptions")
          .update({
            plan: newPlan.toLowerCase(),
            credits: planConfig.monthlyCredits,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingSub.id);
      } else {
        await db.from("subscriptions").insert({
          user_id: userId,
          source: "direct",
          plan: newPlan.toLowerCase(),
          status: "active",
          credits: planConfig.monthlyCredits,
        });
      }

      return NextResponse.json({ ok: true, message: `Successfully updated user plan to ${planConfig.name}` });
    }

    return NextResponse.json({ error: "Unsupported admin action" }, { status: 400 });
  } catch (err: any) {
    const status = err.message?.includes("Forbidden") ? 403
      : err.message?.includes("Missing authentication") || err.message?.includes("Invalid") ? 401 : 500;
    return NextResponse.json({ error: err.message || "Failed to execute admin action" }, { status });
  }
}

export const POST = withSafeResponse(withBoundedRequest(postHandler));

export const GET = withSafeResponse(getHandler);
