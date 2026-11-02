import { withSafeResponse } from "@/app/lib/server/safeResponse";
import { NextRequest, NextResponse } from "next/server";
import { verifyServerAdmin } from "@/app/lib/server/admin";
import { PLANS } from "@/app/config/plans";

export const dynamic = "force-dynamic";

async function getHandler(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const { db } = await verifyServerAdmin(authHeader);

    // 1. Fetch all users from auth.users (service role only)
    const { data: usersData, error: usersErr } = await db.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersErr) throw usersErr;
    const users = usersData.users || [];

    // 2. Fetch all subscriptions
    const { data: subsData, error: subsErr } = await db
      .from("subscriptions")
      .select("*");
    if (subsErr) throw subsErr;
    const subscriptions = subsData || [];

    // 3. Fetch credit transactions
    const { data: txsData } = await db
      .from("credit_transactions")
      .select("*");
    const creditTxs = txsData || [];

    // 4. Fetch platform activity
    const [searchesRes, kitsRes] = await Promise.all([
      db.from("searches").select("*", { count: "exact", head: true }),
      db.from("content_kits").select("*", { count: "exact", head: true }),
    ]);

    const totalSearches = searchesRes.count || 0;
    const totalContentKits = kitsRes.count || 0;
    const totalAiGenerations = totalSearches + totalContentKits;

    // Map subscriptions by user_id
    const subByUserId = new Map<string, any>();
    for (const sub of subscriptions) {
      subByUserId.set(sub.user_id, sub);
    }

    // Classify users into MAIN SITE vs WHOP
    const mainSiteUsers: any[] = [];
    const whopUsers: any[] = [];

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    for (const u of users) {
      const sub = subByUserId.get(u.id);
      const isWhop = sub?.source === "whop";

      const userRecord = {
        id: u.id,
        email: u.email || "(no email)",
        createdAt: u.created_at,
        lastSignIn: u.last_sign_in_at,
        source: isWhop ? "whop" : "direct",
        plan: (sub?.plan || "free").toLowerCase(),
        status: sub?.status || (sub ? "active" : "free_tier"),
        credits: sub?.credits ?? 30,
        isPaying: sub && sub.plan !== "free" && sub.status === "active",
      };

      if (isWhop) {
        whopUsers.push(userRecord);
      } else {
        mainSiteUsers.push(userRecord);
      }
    }

    // Helper to calculate segment statistics
    function calculateSegment(userList: any[]) {
      const total = userList.length;
      const active = userList.filter(
        (u) => u.lastSignIn && new Date(u.lastSignIn).getTime() >= thirtyDaysAgo
      ).length;
      const paid = userList.filter((u) => u.isPaying).length;
      const free = userList.filter((u) => !u.isPaying).length;
      const creator = userList.filter((u) => u.plan === "creator").length;
      const studio = userList.filter((u) => u.plan === "studio").length;
      const recentSignups = userList.filter(
        (u) => u.createdAt && new Date(u.createdAt).getTime() >= sevenDaysAgo
      ).length;
      const activeSubscriptions = userList.filter((u) => u.status === "active" && u.plan !== "free").length;

      // Revenue estimate based on plan price
      const revenue = userList.reduce((acc, u) => {
        if (!u.isPaying) return acc;
        if (u.plan === "creator") return acc + PLANS.creator.price;
        if (u.plan === "studio") return acc + PLANS.studio.price;
        return acc;
      }, 0);

      return {
        total,
        active,
        paid,
        free,
        creator,
        studio,
        recentSignups,
        activeSubscriptions,
        revenue,
        recentUsers: userList
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 5),
      };
    }

    const mainSiteStats = calculateSegment(mainSiteUsers);
    const whopStats = calculateSegment(whopUsers);

    // Calculate credits consumed from negative credit transactions
    const creditsConsumed = Math.abs(
      creditTxs
        .filter((t) => t.amount < 0)
        .reduce((sum, t) => sum + t.amount, 0)
    );

    const totalUsers = users.length;
    const totalPayingUsers = mainSiteStats.paid + whopStats.paid;
    const totalActiveSubscriptions = mainSiteStats.activeSubscriptions + whopStats.activeSubscriptions;
    const directRevenue = mainSiteStats.revenue;
    const whopRevenue = whopStats.revenue;
    const totalRevenue = directRevenue + whopRevenue;
    const newUsers = mainSiteStats.recentSignups + whopStats.recentSignups;
    const conversionRate = totalUsers > 0 ? ((totalPayingUsers / totalUsers) * 100).toFixed(1) : "0.0";

    return NextResponse.json({
      topLevel: {
        totalUsers,
        totalPayingUsers,
        activeSubscriptions: totalActiveSubscriptions,
        totalRevenue,
        directRevenue,
        whopRevenue,
        creditsConsumed,
        aiGenerations: totalAiGenerations,
        newUsers,
        conversionRate: `${conversionRate}%`,
      },
      columns: {
        mainSite: mainSiteStats,
        whop: whopStats,
      },
    });
  } catch (err: any) {
    const status = err.message?.includes("Forbidden")
      ? 403
      : err.message?.includes("Missing") || err.message?.includes("Invalid")
      ? 401
      : 500;
    return NextResponse.json({ error: err.message || "Failed to load admin dashboard" }, { status });
  }
}

export const GET = withSafeResponse(getHandler);
