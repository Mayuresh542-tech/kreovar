"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGate } from "@/app/lib/useAuthGate";
import { isAdminEmail } from "@/app/lib/admin";
import StudioShell from "@/app/components/StudioShell";
import AuthLoadingScreen from "@/app/components/AuthLoadingScreen";
import AdminHeader from "@/app/components/admin/AdminHeader";

interface AnalyticsData {
  userAnalytics: {
    totalUsers: number;
    activeUsers: number;
    returningUsers: number;
    userGrowth: string;
    newUsersLast30Days: number;
  };
  sourceAnalytics: {
    mainSiteUsers: number;
    whopUsers: number;
    mainSitePercentage: string;
    whopPercentage: string;
    directConversionRate: string;
    whopConversionRate: string;
    directVsWhopGrowth: string;
  };
  revenueAnalytics: {
    totalRevenue: string;
    directRevenue: string;
    whopRevenue: string;
    arpu: string;
    revenueByPlan: {
      free: string;
      creator: string;
      studio: string;
    };
    revenueOverTime: string;
  };
  subscriptionAnalytics: {
    free: number;
    creator: number;
    studio: number;
    active: number;
    cancelled: number;
    expired: number;
    renewed: string | number;
  };
  productAnalytics: {
    contentKitsGenerated: number;
    trendSearches: number;
    aiGenerations: number;
    creditsConsumed: number;
    mostUsedFeatures: Array<{ feature: string; count: number }> | string;
    usagePerPlan: {
      free: string;
      creator: string;
      studio: string;
    };
  };
}

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const { status, session } = useAuthGate();
  const isAdmin = status === "authed" && isAdminEmail(session?.user?.email);

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthed" || (status === "authed" && !isAdmin)) {
      router.replace("/dashboard");
    }
  }, [status, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin || !session) return;
    loadAnalytics();
  }, [isAdmin, session]);

  async function loadAnalytics() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/analytics", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Server error ${res.status}`);
      }

      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }

  if (!isAdmin) {
    return <AuthLoadingScreen label="Authorizing analytics telemetry access…" />;
  }

  return (
    <StudioShell active="settings">
      <div className="max-w-7xl mx-auto w-full py-6 space-y-8">
        <AdminHeader
          title="Platform Intelligence &amp; Analytics Engine"
          subtitle="Comprehensive analytics calculated from live database records across user acquisition, channel revenue, and product consumption."
          badge="DATABASE TELEMETRY"
        />

        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
            ⚠️ {error}
          </div>
        )}

        {/* 1. USER ANALYTICS */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#202534] pb-2">
            <h2 className="text-base font-bold text-white font-heading flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              <span>User Analytics</span>
            </h2>
            <span className="text-[11px] font-mono text-slate-500">Cohort &amp; Activity Ledger</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            <div className="p-4 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-1">
              <span className="text-[10px] font-mono uppercase text-slate-400">Total Users</span>
              <div className="text-2xl font-black text-white font-mono">
                {loading ? "…" : data?.userAnalytics.totalUsers ?? 0}
              </div>
              <span className="text-[10px] text-slate-500">All registered accounts</span>
            </div>

            <div className="p-4 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-1">
              <span className="text-[10px] font-mono uppercase text-slate-400">Active Users (30d)</span>
              <div className="text-2xl font-black text-emerald-400 font-mono">
                {loading ? "…" : data?.userAnalytics.activeUsers ?? 0}
              </div>
              <span className="text-[10px] text-slate-500">Authenticated recently</span>
            </div>

            <div className="p-4 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-1">
              <span className="text-[10px] font-mono uppercase text-slate-400">Returning Users</span>
              <div className="text-2xl font-black text-sky-400 font-mono">
                {loading ? "…" : data?.userAnalytics.returningUsers ?? 0}
              </div>
              <span className="text-[10px] text-slate-500">Multi-session retention</span>
            </div>

            <div className="p-4 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-1">
              <span className="text-[10px] font-mono uppercase text-slate-400">User Growth</span>
              <div className="text-2xl font-black text-purple-300 font-mono">
                {loading ? "…" : data?.userAnalytics.userGrowth}
              </div>
              <span className="text-[10px] text-slate-500">Month-over-month rate</span>
            </div>

            <div className="p-4 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-1 col-span-2 sm:col-span-1">
              <span className="text-[10px] font-mono uppercase text-slate-400">New Users (30d)</span>
              <div className="text-2xl font-black text-white font-mono">
                +{loading ? "…" : data?.userAnalytics.newUsersLast30Days ?? 0}
              </div>
              <span className="text-[10px] text-slate-500">Acquired this period</span>
            </div>
          </div>
        </section>

        {/* 2. SOURCE ANALYTICS (Direct vs Whop) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#202534] pb-2">
            <h2 className="text-base font-bold text-white font-heading flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Source Analytics (Direct Website vs. Whop Store)</span>
            </h2>
            <span className="text-[11px] font-mono text-slate-500">Channel Attribution</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Direct Channel Performance */}
            <div className="p-5 rounded-2xl bg-[#0D0F15] border border-sky-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-sky-400 uppercase">
                  Direct Main Website Channel
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">
                  {loading ? "…" : data?.sourceAnalytics.mainSitePercentage} of users
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[#12151E] border border-[#202534]">
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Total Direct Users</span>
                  <span className="text-xl font-bold font-mono text-white">
                    {loading ? "…" : data?.sourceAnalytics.mainSiteUsers}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[#12151E] border border-[#202534]">
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Paid Conversion</span>
                  <span className="text-xl font-bold font-mono text-emerald-400">
                    {loading ? "…" : data?.sourceAnalytics.directConversionRate}
                  </span>
                </div>
              </div>
            </div>

            {/* Whop Channel Performance */}
            <div className="p-5 rounded-2xl bg-[#0D0F15] border border-amber-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-amber-400 uppercase">
                  Whop Community Store Channel
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  {loading ? "…" : data?.sourceAnalytics.whopPercentage} of users
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[#12151E] border border-[#202534]">
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Total Whop Users</span>
                  <span className="text-xl font-bold font-mono text-white">
                    {loading ? "…" : data?.sourceAnalytics.whopUsers}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[#12151E] border border-[#202534]">
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Paid Conversion</span>
                  <span className="text-xl font-bold font-mono text-emerald-400">
                    {loading ? "…" : data?.sourceAnalytics.whopConversionRate}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. REVENUE ANALYTICS */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#202534] pb-2">
            <h2 className="text-base font-bold text-white font-heading flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Revenue Analytics</span>
            </h2>
            <span className="text-[11px] font-mono text-slate-500">Live MRR Aggregation</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
            <div className="p-4 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-1">
              <span className="text-[10px] font-mono uppercase text-slate-400">Total Revenue</span>
              <div className="text-xl font-black text-white font-mono">
                {loading ? "…" : data?.revenueAnalytics.totalRevenue}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-1">
              <span className="text-[10px] font-mono uppercase text-slate-400">Direct Revenue</span>
              <div className="text-xl font-black text-sky-400 font-mono">
                {loading ? "…" : data?.revenueAnalytics.directRevenue}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-1">
              <span className="text-[10px] font-mono uppercase text-slate-400">Whop Revenue</span>
              <div className="text-xl font-black text-amber-400 font-mono">
                {loading ? "…" : data?.revenueAnalytics.whopRevenue}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-1">
              <span className="text-[10px] font-mono uppercase text-slate-400">Creator Tier ($19)</span>
              <div className="text-xl font-black text-white font-mono">
                {loading ? "…" : data?.revenueAnalytics.revenueByPlan.creator}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-1">
              <span className="text-[10px] font-mono uppercase text-slate-400">Studio Tier ($49)</span>
              <div className="text-xl font-black text-white font-mono">
                {loading ? "…" : data?.revenueAnalytics.revenueByPlan.studio}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-1">
              <span className="text-[10px] font-mono uppercase text-slate-400">ARPU (Per Paid)</span>
              <div className="text-xl font-black text-emerald-400 font-mono">
                {loading ? "…" : data?.revenueAnalytics.arpu}
              </div>
            </div>
          </div>
        </section>

        {/* 4. SUBSCRIPTION ANALYTICS */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#202534] pb-2">
            <h2 className="text-base font-bold text-white font-heading flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400" />
              <span>Subscription Distribution</span>
            </h2>
            <span className="text-[11px] font-mono text-slate-500">Plan Status Breakdown</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            <div className="p-3.5 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-0.5">
              <span className="text-[10px] font-mono uppercase text-slate-400">Free Tier</span>
              <div className="text-lg font-bold text-white font-mono">
                {loading ? "…" : data?.subscriptionAnalytics.free}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-0.5">
              <span className="text-[10px] font-mono uppercase text-slate-400">Creator Tier</span>
              <div className="text-lg font-bold text-sky-400 font-mono">
                {loading ? "…" : data?.subscriptionAnalytics.creator}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-0.5">
              <span className="text-[10px] font-mono uppercase text-slate-400">Studio Tier</span>
              <div className="text-lg font-bold text-amber-400 font-mono">
                {loading ? "…" : data?.subscriptionAnalytics.studio}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-0.5">
              <span className="text-[10px] font-mono uppercase text-slate-400">Active</span>
              <div className="text-lg font-bold text-emerald-400 font-mono">
                {loading ? "…" : data?.subscriptionAnalytics.active}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-0.5">
              <span className="text-[10px] font-mono uppercase text-slate-400">Cancelled</span>
              <div className="text-lg font-bold text-rose-400 font-mono">
                {loading ? "…" : data?.subscriptionAnalytics.cancelled}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-0.5">
              <span className="text-[10px] font-mono uppercase text-slate-400">Expired</span>
              <div className="text-lg font-bold text-slate-400 font-mono">
                {loading ? "…" : data?.subscriptionAnalytics.expired}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-0.5">
              <span className="text-[10px] font-mono uppercase text-slate-400">Renewed</span>
              <div className="text-lg font-bold text-cyan-400 font-mono">
                {loading ? "…" : data?.subscriptionAnalytics.renewed}
              </div>
            </div>
          </div>
        </section>

        {/* 5. PRODUCT ANALYTICS */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#202534] pb-2">
            <h2 className="text-base font-bold text-white font-heading flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>Product Analytics &amp; Feature Consumption</span>
            </h2>
            <span className="text-[11px] font-mono text-slate-500">Live AI Activity</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-1">
              <span className="text-[10px] font-mono uppercase text-slate-400">Content Kits Generated</span>
              <div className="text-2xl font-black text-white font-mono">
                {loading ? "…" : data?.productAnalytics.contentKitsGenerated}
              </div>
              <span className="text-[10px] text-slate-500">Full scripts &amp; hooks created</span>
            </div>

            <div className="p-4 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-1">
              <span className="text-[10px] font-mono uppercase text-slate-400">Trend Searches</span>
              <div className="text-2xl font-black text-white font-mono">
                {loading ? "…" : data?.productAnalytics.trendSearches}
              </div>
              <span className="text-[10px] text-slate-500">Niche radar queries executed</span>
            </div>

            <div className="p-4 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-1">
              <span className="text-[10px] font-mono uppercase text-slate-400">Total AI Generations</span>
              <div className="text-2xl font-black text-sky-400 font-mono">
                {loading ? "…" : data?.productAnalytics.aiGenerations}
              </div>
              <span className="text-[10px] text-slate-500">Gemini model calls</span>
            </div>

            <div className="p-4 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-1">
              <span className="text-[10px] font-mono uppercase text-slate-400">Credits Consumed</span>
              <div className="text-2xl font-black text-amber-400 font-mono">
                {loading ? "…" : data?.productAnalytics.creditsConsumed.toLocaleString()}
              </div>
              <span className="text-[10px] text-slate-500">Server-side ledger deductions</span>
            </div>
          </div>
        </section>

      </div>
    </StudioShell>
  );
}
