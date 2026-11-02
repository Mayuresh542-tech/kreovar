"use client";
import UsageSummary from '@/app/components/UsageSummary';

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { useAuthGate } from "@/app/lib/useAuthGate";
import StudioShell from "@/app/components/StudioShell";
import AuthLoadingScreen from "@/app/components/AuthLoadingScreen";
import { WHOP_DEFAULT_CHECKOUT_URL } from "@/app/config/plans";

interface BillingData {
  subscription: {
    id: string | null;
    plan: string;
    planName: string;
    price: number;
    displayPrice: string;
    billingPeriod: string;
    source: "direct" | "whop";
    sourceDisplay: string;
    status: string;
    credits: number;
    unlimited?: boolean;
    renewalDate: string | null;
    startDate: string | null;
  };
  recentTransactions: Array<{
    id: string;
    amount: number;
    type: string;
    feature: string | null;
    status?: string;
    created_at: string;
  }>;
}

function BillingContent() {
  const router = useRouter();
  const { status, session } = useAuthGate();
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (status === "unauthed") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authed" || !session) return;
    fetch("/api/billing", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => { if (!res.ok) throw new Error("Billing unavailable"); return res.json(); })
      .then((json) => {
        if (json) setData(json);
      })
      .catch((err) => {
        setLoadError(true);
        console.error("Failed to fetch billing:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [status, session]);

  if (status !== "authed" || loading) {
    return <AuthLoadingScreen label="Loading billing information…" />;
  }

  if (loadError || !data) return <StudioShell active="billing"><p role="alert">Billing information could not be loaded. Please refresh to retry.</p></StudioShell>;

  const sub = data.subscription;
  const isPaidPlan = sub?.plan === "pro" || sub?.plan === "creator" || sub?.plan === "studio";
  const planDisplayName = sub.planName;
  const planPrice = sub.displayPrice;
  const planBillingPeriod = isPaidPlan ? (sub.billingPeriod === "yearly" ? "/year" : "/month") : "/forever";
  const creditsAmount = sub.credits;
  const renewalDateFormatted = sub?.renewalDate
    ? new Date(sub.renewalDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Not scheduled";

  const subscriptionSource = sub?.sourceDisplay || "Direct / Main Site";

  // Real or fallback transactions
  const displayTransactions =
    data?.recentTransactions && data.recentTransactions.length > 0
      ? data.recentTransactions.map((tx) => ({
          id: tx.id,
          date: new Date(tx.created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
          plan: tx.feature || "Subscription",
          amount: `${tx.amount > 0 ? "+" : ""}${tx.amount ?? 0} credits`,
          status: tx.status || tx.type,
        }))
      : [];

  return (
    <StudioShell active="billing">
      <div className="max-w-4xl mx-auto w-full space-y-8 pb-16 pt-2">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Billing &amp; Subscription
          </h1>
          <p className="text-sm text-slate-500">
            Manage your plan, monthly allowances and billing details.
          </p>
        </div>

        <UsageSummary/>
        {/* Current Plan Card (Screen 8) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 space-y-6 shadow-xs">
          {/* Card Top: Plan Name, Price, and Manage Plan Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
            <div>
              <span className="text-xs font-medium text-slate-400 block mb-1">
                Current Plan
              </span>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-bold text-slate-900">
                  {planDisplayName}
                </h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {sub.status}
                </span>
              </div>
              <div className="mt-1 flex items-baseline gap-1 text-slate-900 font-semibold text-lg">
                <span>{planPrice}</span>
                <span className="text-xs text-slate-400 font-normal">
                  {planBillingPeriod}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/pricing"
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs sm:text-sm transition-colors shadow-xs"
              >
                Manage Plan
              </Link>
            </div>
          </div>

          {/* Card Middle: Credits, Next Billing Date, and Source */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-1">
            {/* Credits */}
            <div>
              <span className="text-xs text-slate-400 block mb-1">Legacy credit balance</span>
              <div className="text-2xl font-bold text-slate-900">
                {sub?.unlimited ? "Unlimited" : creditsAmount.toLocaleString()}
              </div>
              <span className="text-xs text-slate-400 mt-1 block">
                Historical balance; current tool allowances are shown above.
              </span>
            </div>

            {/* Next Billing Date */}
            <div>
              <span className="text-xs text-slate-400 block mb-1">
                Next Billing Date
              </span>
              <div className="text-base font-semibold text-slate-900">
                {renewalDateFormatted}
              </div>
              <span className="text-xs text-slate-400 mt-1 block">
                {sub.renewalDate && isPaidPlan ? `${planPrice} per billing period` : "No scheduled payment"}
              </span>
            </div>

            {/* Subscription Source */}
            <div>
              <span className="text-xs text-slate-400 block mb-1">
                Subscription Source
              </span>
              <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{subscriptionSource}</span>
              </div>
              {sub?.source === "whop" && (
                <a
                  href={WHOP_DEFAULT_CHECKOUT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline mt-1 inline-flex items-center gap-1"
                >
                  <span>Open Whop Hub</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Billing History Section (Screen 8) */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900">
            Credit History
          </h2>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-medium">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Feature</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayTransactions.length === 0 && <tr><td colSpan={4} className="px-5 py-3">No credit transactions yet.</td></tr>}
                  {displayTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-slate-700">
                        {tx.date}
                      </td>
                      <td className="px-5 py-3.5 text-slate-900 font-medium">
                        {tx.plan}
                      </td>
                      <td className="px-5 py-3.5 text-slate-700 font-mono">
                        {tx.amount}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </StudioShell>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<AuthLoadingScreen label="Loading billing information…" />}>
      <BillingContent />
    </Suspense>
  );
}
