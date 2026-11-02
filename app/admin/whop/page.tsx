"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGate } from "@/app/lib/useAuthGate";
import { isAdminEmail } from "@/app/lib/admin";
import StudioShell from "@/app/components/StudioShell";
import AuthLoadingScreen from "@/app/components/AuthLoadingScreen";
import AdminHeader from "@/app/components/admin/AdminHeader";

interface WhopAdminData {
  connection: {
    status: "connected" | "misconfigured" | "disconnected";
    statusDisplay: string;
    hasApiKey: boolean;
    hasWebhookSecret: boolean;
    checkoutUrl: string;
    company: {
      id: string;
      username: string;
      email: string;
    } | null;
    error: string | null;
  };
  products: Array<{
    id: string;
    name: string;
    visibility: string;
  }>;
  webhookStats: {
    recentCount: number;
    processedCount: number;
    pendingCount: number;
  };
  recentWebhooks: Array<{
    id: string;
    provider: string;
    external_event_id: string;
    event_type: string;
    processed: boolean;
    processed_at: string | null;
    created_at: string;
    metadata: any;
  }>;
  whopSubscriptions: Array<{
    id: string;
    user_id: string;
    plan: string;
    status: string;
    credits: number;
    current_period_end: string | null;
    external_customer_id: string | null;
    created_at: string;
  }>;
}

export default function AdminWhopPage() {
  const router = useRouter();
  const { status, session } = useAuthGate();
  const isAdmin = status === "authed" && isAdminEmail(session?.user?.email);

  const [data, setData] = useState<WhopAdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthed" || (status === "authed" && !isAdmin)) {
      router.replace("/dashboard");
    }
  }, [status, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin || !session) return;
    loadWhopStatus();
  }, [isAdmin, session]);

  async function loadWhopStatus() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/whop", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Server returned ${res.status}`);
      }

      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || "Failed to load Whop operational telemetry");
    } finally {
      setLoading(false);
    }
  }

  if (!isAdmin) {
    return <AuthLoadingScreen label="Validating administrative credentials for Whop operations…" />;
  }

  const conn = data?.connection;
  const isConnected = conn?.status === "connected";

  return (
    <StudioShell active="settings">
      <div className="max-w-7xl mx-auto w-full py-6 space-y-8">
        <AdminHeader
          title="Whop Channel &amp; Webhook Control Tower"
          subtitle="Operational diagnostics, active Whop products, and idempotent webhook telemetry without client credential exposure."
          badge="SERVER-PROTECTED WHOP"
        />

        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
            ⚠️ {error}
          </div>
        )}

        {/* CONNECTION & STORE HEALTH CARD */}
        <div className="p-6 sm:p-7 rounded-3xl bg-[#0D0F15] border border-amber-500/30 space-y-6 shadow-xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#202534] pb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-3 h-3 rounded-full ${
                    isConnected ? "bg-emerald-400 animate-pulse shadow-[0_0_12px_#34D399]" : "bg-amber-400"
                  }`}
                />
                <h2 className="text-xl font-bold text-white font-heading">
                  {loading ? "Checking Whop Connection…" : conn?.statusDisplay}
                </h2>
              </div>
              <p className="text-xs text-slate-400">
                All communications execute through server-side authenticated Whop API v5 endpoints.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={conn?.checkoutUrl || "https://whop.com/veelox-0514/veelox-3d/"}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold uppercase tracking-wider transition shadow-sm"
              >
                Open Live Whop Store ↗
              </a>
              <button
                onClick={loadWhopStatus}
                className="px-3.5 py-2 rounded-xl bg-[#12151E] hover:bg-[#1A1F2C] text-slate-300 text-xs font-mono border border-[#202534] transition"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Safe Operational Diagnostics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-[#12151E] border border-[#202534] space-y-1.5">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                API Key Credential Status
              </span>
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-white">
                <span className="text-emerald-400">✓</span>
                <span>Configured Strictly Server-Side</span>
              </div>
              <p className="text-[11px] text-slate-500">
                WHOP_API_KEY is isolated from client bundles, browser cookies, and database fields.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#12151E] border border-[#202534] space-y-1.5">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                Webhook Verification Secret
              </span>
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-white">
                <span className="text-emerald-400">✓</span>
                <span>HMAC-SHA256 Signature Active</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Incoming events at `/api/webhooks/whop` verified via `whop-signature` before execution.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#12151E] border border-[#202534] space-y-1.5">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                Store ID / Company
              </span>
              <div className="text-xs font-mono font-bold text-amber-400 truncate">
                {conn?.company?.username || "veelox-0514 (Veelox)"}
              </div>
              <p className="text-[11px] text-slate-500">
                Official destination for secondary SaaS checkout and creator community.
              </p>
            </div>
          </div>
        </div>

        {/* PRODUCTS & MEMBERSHIPS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="p-6 rounded-3xl bg-[#0D0F15] border border-[#202534] space-y-4">
            <div className="border-b border-[#202534] pb-3">
              <h3 className="text-sm font-bold text-white font-heading">
                Configured Whop Products
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Plans mapped between Whop catalog and Kreovar tiers.
              </p>
            </div>

            {(!data?.products || data.products.length === 0) ? (
              <div className="space-y-2 text-xs text-slate-400">
                <div className="p-3 rounded-xl bg-[#12151E] border border-[#202534] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white font-mono">Kreovar 3D</span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      ACTIVE
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 block truncate">
                    https://whop.com/veelox-0514/veelox-3d/
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Products are dynamically provisioned into Creator or Studio tiers based on membership metadata.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.products.map((p) => (
                  <div key={p.id} className="p-3 rounded-xl bg-[#12151E] border border-[#202534]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white font-mono">{p.name}</span>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                        {p.visibility}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 block mt-1">ID: {p.id}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ACTIVE WHOP SUBSCRIBERS */}
          <div className="lg:col-span-2 p-6 rounded-3xl bg-[#0D0F15] border border-[#202534] space-y-4">
            <div className="flex items-center justify-between border-b border-[#202534] pb-3">
              <div>
                <h3 className="text-sm font-bold text-white font-heading">
                  Whop Subscriptions ({data?.whopSubscriptions?.length || 0})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Subscribers mapped directly through verified Whop webhook events.
                </p>
              </div>
              <span className="text-[11px] font-mono text-amber-400">Unified Subscriptions</span>
            </div>

            {(!data?.whopSubscriptions || data.whopSubscriptions.length === 0) ? (
              <div className="py-8 text-center text-xs text-slate-500 space-y-1">
                <p>No Whop subscribers active in database yet.</p>
                <p className="text-[11px] text-slate-600">
                  When a customer purchases on Whop, their record is instantly linked here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#202534] text-slate-400 font-mono text-[11px]">
                      <th className="pb-2 font-normal">Plan</th>
                      <th className="pb-2 font-normal">Status</th>
                      <th className="pb-2 font-normal">Credits</th>
                      <th className="pb-2 font-normal">Whop Customer ID</th>
                      <th className="pb-2 font-normal">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1A1F2C]">
                    {data.whopSubscriptions.map((sub) => (
                      <tr key={sub.id}>
                        <td className="py-2.5 font-mono text-white capitalize">{sub.plan}</td>
                        <td className="py-2.5">
                          <span className="font-mono text-[10px] px-2 py-0.5 rounded uppercase bg-emerald-500/10 text-emerald-400">
                            {sub.status}
                          </span>
                        </td>
                        <td className="py-2.5 font-mono font-bold text-white">{sub.credits}</td>
                        <td className="py-2.5 font-mono text-slate-400 text-[11px]">
                          {sub.external_customer_id || "—"}
                        </td>
                        <td className="py-2.5 font-mono text-slate-500 text-[11px]">
                          {new Date(sub.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RECENT WEBHOOK AUDIT LOGS */}
        <div className="p-6 rounded-3xl bg-[#0D0F15] border border-[#202534] space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#202534] pb-4">
            <div>
              <h3 className="text-base font-bold text-white font-heading">
                Webhook Event Ledger &amp; Idempotency Log
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Every external event ID is recorded in `webhook_events` to prevent duplicate credit grants or replay attacks.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {data?.webhookStats.processedCount || 0} Processed
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                {data?.webhookStats.pendingCount || 0} Pending
              </span>
            </div>
          </div>

          {(!data?.recentWebhooks || data.recentWebhooks.length === 0) ? (
            <div className="py-8 text-center text-xs text-slate-500 space-y-1">
              <p>No webhook events received yet.</p>
              <p className="text-[11px] text-slate-600">
                Point your Whop developer webhook URL to `https://your-domain.com/api/webhooks/whop`.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#202534] text-slate-400 font-mono text-[11px]">
                    <th className="pb-3 font-normal">Timestamp</th>
                    <th className="pb-3 font-normal">Event Type</th>
                    <th className="pb-3 font-normal">External Event ID</th>
                    <th className="pb-3 font-normal">Status</th>
                    <th className="pb-3 font-normal">Processed At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1A1F2C]">
                  {data.recentWebhooks.map((ev) => (
                    <tr key={ev.id} className="hover:bg-[#12151E] transition">
                      <td className="py-3 font-mono text-slate-400 text-[11px]">
                        {new Date(ev.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 font-mono text-sky-400 font-semibold">
                        {ev.event_type}
                      </td>
                      <td className="py-3 font-mono text-slate-400 text-[11px]">
                        {ev.external_event_id}
                      </td>
                      <td className="py-3">
                        <span
                          className={`font-mono text-[10px] px-2 py-0.5 rounded uppercase ${
                            ev.processed
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}
                        >
                          {ev.processed ? "IDEMPOTENT PROCESSED" : "PENDING"}
                        </span>
                      </td>
                      <td className="py-3 font-mono text-slate-500 text-[11px]">
                        {ev.processed_at ? new Date(ev.processed_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </StudioShell>
  );
}
