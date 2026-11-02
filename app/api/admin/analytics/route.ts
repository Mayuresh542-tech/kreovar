import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { NextRequest, NextResponse } from "next/server";
import { verifyServerAdmin } from "@/app/lib/server/admin";
import { PLANS } from "@/app/config/plans";

export const dynamic = "force-dynamic";

async function getHandler(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const { db } = await verifyServerAdmin(authHeader);

    // 1. Fetch Users
    const { data: usersData, error: usersErr } = await db.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersErr) throw usersErr;
    const users = usersData.users || [];

    // 2. Fetch Subscriptions
    const { data: subsData } = await db.from("subscriptions").select("*");
    const subs = subsData || [];

    // 3. Fetch Credit Transactions
    const { data: txsData } = await db.from("credit_transactions").select("*");
    const creditTxs = txsData || [];

    // 4. Fetch Platform Activity (Content Kits & Searches)
    const [kitsRes, searchesRes] = await Promise.all([
      db.from("content_kits").select("id, user_id, niche, created_at").limit(1000),
      db.from("searches").select("id, user_id, niche, created_at").limit(1000),
    ]);
    const contentKits = kitsRes.data || [];
    const searches = searchesRes.data || [];

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000;

    // --- USER ANALYTICS ---
    const totalUsers = users.length;
    const activeUsers = users.filter(
      (u) => u.last_sign_in_at && new Date(u.last_sign_in_at).getTime() >= thirtyDaysAgo
    ).length;

    // Returning users: signed in at least once and created > 24 hours before last sign in
    const returningUsers = users.filter((u) => {
      if (!u.last_sign_in_at || !u.created_at) return false;
      const created = new Date(u.created_at).getTime();
      const last = new Date(u.last_sign_in_at).getTime();
      return last - created > 24 * 60 * 60 * 1000;
    }).length;

    const usersLast30Days = users.filter(
      (u) => u.created_at && new Date(u.created_at).getTime() >= thirtyDaysAgo
    ).length;
    const usersPrevious30Days = users.filter((u) => {
      if (!u.created_at) return false;
      const t = new Date(u.created_at).getTime();
      return t >= sixtyDaysAgo && t < thirtyDaysAgo;
    }).length;

    const userGrowthRate =
      usersPrevious30Days > 0
        ? `${(((usersLast30Days - usersPrevious30Days) / usersPrevious30Days) * 100).toFixed(1)}%`
        : usersLast30Days > 0
        ? "+100%"
        : "Data not available yet";

    // --- SOURCE ANALYTICS ---
    const subUserIdsWhop = new Set(subs.filter((s) => s.source === "whop").map((s) => s.user_id));
    const whopUsersCount = users.filter((u) => subUserIdsWhop.has(u.id)).length;
    const directUsersCount = totalUsers - whopUsersCount;

    const whopPaidCount = subs.filter((s) => s.source === "whop" && s.status === "active" && s.plan !== "free").length;
    const directPaidCount = subs.filter((s) => s.source === "direct" && s.status === "active" && s.plan !== "free").length;

    const directConversionRate = directUsersCount > 0 ? `${((directPaidCount / directUsersCount) * 100).toFixed(1)}%` : "0.0%";
    const whopConversionRate = whopUsersCount > 0 ? `${((whopPaidCount / whopUsersCount) * 100).toFixed(1)}%` : "0.0%";

    // --- REVENUE ANALYTICS ---
    const directRevenue = subs
      .filter((s) => s.source === "direct" && s.status === "active")
      .reduce((sum, s) => {
        if (s.plan === "creator") return sum + PLANS.creator.price;
        if (s.plan === "studio") return sum + PLANS.studio.price;
        return sum;
      }, 0);

    const whopRevenue = subs
      .filter((s) => s.source === "whop" && s.status === "active")
      .reduce((sum, s) => {
        if (s.plan === "creator") return sum + PLANS.creator.price;
        if (s.plan === "studio") return sum + PLANS.studio.price;
        return sum;
      }, 0);

    const totalRevenue = directRevenue + whopRevenue;
    const totalPayingUsers = directPaidCount + whopPaidCount;
    const arpu = totalPayingUsers > 0 ? `$${(totalRevenue / totalPayingUsers).toFixed(2)}` : "Data not available yet";

    const revenueByPlan = {
      free: 0,
      creator: subs.filter((s) => s.status === "active" && s.plan === "creator").length * PLANS.creator.price,
      studio: subs.filter((s) => s.status === "active" && s.plan === "studio").length * PLANS.studio.price,
    };

    // --- SUBSCRIPTION ANALYTICS ---
    const freeSubsCount = totalUsers - totalPayingUsers;
    const creatorSubsCount = subs.filter((s) => s.plan === "creator").length;
    const studioSubsCount = subs.filter((s) => s.plan === "studio").length;

    const activeSubsCount = subs.filter((s) => s.status === "active").length;
    const cancelledSubsCount = subs.filter((s) => s.status === "canceled").length;
    const expiredSubsCount = subs.filter((s) => s.status === "expired" || s.status === "past_due").length;
    const renewedSubsCount = subs.filter((s) => s.status === "active" && s.current_period_end).length;

    // --- PRODUCT ANALYTICS ---
    const totalContentKits = contentKits.length;
    const totalSearches = searches.length;
    const totalAiGenerations = totalContentKits + totalSearches;
    const totalCreditsConsumed = Math.abs(
      creditTxs
        .filter((t) => t.amount < 0)
        .reduce((sum, t) => sum + t.amount, 0)
    );

    // Feature usage count
    const featureCount = new Map<string, number>();
    for (const t of creditTxs) {
      if (t.feature) {
        featureCount.set(t.feature, (featureCount.get(t.feature) || 0) + 1);
      }
    }
    const mostUsedFeatures = Array.from(featureCount.entries())
      .map(([feature, count]) => ({ feature, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return NextResponse.json({
      userAnalytics: {
        totalUsers,
        activeUsers,
        returningUsers,
        userGrowth: userGrowthRate,
        newUsersLast30Days: usersLast30Days,
      },
      sourceAnalytics: {
        mainSiteUsers: directUsersCount,
        whopUsers: whopUsersCount,
        mainSitePercentage: totalUsers > 0 ? `${((directUsersCount / totalUsers) * 100).toFixed(1)}%` : "0%",
        whopPercentage: totalUsers > 0 ? `${((whopUsersCount / totalUsers) * 100).toFixed(1)}%` : "0%",
        directConversionRate,
        whopConversionRate,
        directVsWhopGrowth:
          whopUsersCount > 0
            ? `${directUsersCount}:${whopUsersCount} ratio`
            : "Data not available yet",
      },
      revenueAnalytics: {
        totalRevenue: `$${totalRevenue.toLocaleString()}`,
        directRevenue: `$${directRevenue.toLocaleString()}`,
        whopRevenue: `$${whopRevenue.toLocaleString()}`,
        arpu,
        revenueByPlan: {
          free: "$0",
          creator: `$${revenueByPlan.creator.toLocaleString()}`,
          studio: `$${revenueByPlan.studio.toLocaleString()}`,
        },
        revenueOverTime: totalRevenue > 0 ? "Current monthly ARR rate active" : "Data not available yet",
      },
      subscriptionAnalytics: {
        free: freeSubsCount,
        creator: creatorSubsCount,
        studio: studioSubsCount,
        active: activeSubsCount,
        cancelled: cancelledSubsCount,
        expired: expiredSubsCount,
        renewed: renewedSubsCount > 0 ? renewedSubsCount : "Data not available yet",
      },
      productAnalytics: {
        contentKitsGenerated: totalContentKits,
        trendSearches: totalSearches,
        aiGenerations: totalAiGenerations,
        creditsConsumed: totalCreditsConsumed,
        mostUsedFeatures:
          mostUsedFeatures.length > 0 ? mostUsedFeatures : "Data not available yet",
        usagePerPlan: {
          free: "Active discovery mode",
          creator: "Automated radar & gap analysis",
          studio: "High-volume studio pipelines",
        },
      },
    });
  } catch (err: any) {
    const status = err.message?.includes("Forbidden")
      ? 403
      : err.message?.includes("Missing") ||
        err.message?.includes("Invalid") ||
        err.message?.includes("token")
      ? 401
      : 500;
    return NextResponse.json({ error: err.message || "Failed to load analytics" }, { status });
  }
}

export const GET = withSafeResponse(getHandler);
