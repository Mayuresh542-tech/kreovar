"use client";
import {serviceLabel} from "@/app/lib/serviceMessages";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGate } from "@/app/lib/useAuthGate";
import { isAdminEmail } from "@/app/lib/admin";
import UserUsageTable from "@/app/components/admin/UserUsageTable";
import StudioShell from "@/app/components/StudioShell";
import AuthLoadingScreen from "@/app/components/AuthLoadingScreen";

interface UsageLog {
  id: string;
  provider_key: string;
  operation: string;
  user_id: string | null;
  units: number;
  unit_type: string;
  status: "success" | "error";
  estimated_cost: number | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
}

interface UsageSummary {
  totalRequests: number;
  totalCharacters?: number;
  totalTokens?: number;
  elevenlabsChars?: number;
  groqTokens?: number;
  estimatedCost?: number | null;
  totalEstimatedCost?: number;
}

export default function AdminUsagePage() {
  const router = useRouter();
  const { status, session } = useAuthGate();
  const isAdmin = status === "authed" && isAdminEmail(session?.user?.email);

  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [providerFilter, setProviderFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (status === "unauthed" || (status === "authed" && !isAdmin)) {
      router.replace("/dashboard");
    }
  }, [status, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin || !session) return;
    loadUsageData();
  }, [isAdmin, session, page, providerFilter, statusFilter]);

  async function loadUsageData() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "25",
      });
      if (providerFilter !== "all") params.set("provider", providerFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/admin/usage?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load usage data");
      }

      const data = await res.json();
      setLogs(data.logs || []);
      setSummary(data.summary || null);
      setTotalCount(data.pagination?.total ?? 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!isAdmin) {
    return <AuthLoadingScreen label={status === "loading" ? "Validating root credentials…" : "Redirecting…"} />;
  }

  const totalPages = Math.ceil(totalCount / 25) || 1;

  return (
    <StudioShell active="admin-usage">
      <div className="space-y-6 max-w-6xl w-full pb-20">
          <div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight">API Usage & Consumption</h2>
            <p className="text-sm text-slate-400 mt-1">
              User allowances and recorded provider requests across content, voice, captions and editing.
            </p>
          </div>

          {session && <UserUsageTable token={session.access_token} />}

          <p className="text-xs text-slate-400">Provider metrics below summarize recent recorded requests. User allowances above cover the full current allowance period.</p>
          {/* Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Total Requests */}
            <div className="bg-[#0D0F15] border border-[#202534] rounded-xl p-4">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Recent Requests</span>
              <div className="text-2xl font-bold text-white font-mono mt-1">
                {summary ? summary.totalRequests.toLocaleString() : "—"}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Live API queries</span>
            </div>

            {/* Voice Units */}
            <div className="bg-[#0D0F15] border border-[#202534] rounded-xl p-4">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Voice Units</span>
              <div className="text-2xl font-bold text-sky-400 font-mono mt-1">
                {summary ? (summary.totalCharacters ?? summary.elevenlabsChars ?? 0).toLocaleString() : "—"}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Characters synthesized</span>
            </div>

            {/* AI Tokens */}
            <div className="bg-[#0D0F15] border border-[#202534] rounded-xl p-4">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">AI Tokens</span>
              <div className="text-2xl font-bold text-indigo-400 font-mono mt-1">
                {summary ? (summary.totalTokens ?? summary.groqTokens ?? 0).toLocaleString() : "—"}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">LLM inference units</span>
            </div>

            {/* Estimated Cost */}
            <div className="bg-[#0D0F15] border border-[#202534] rounded-xl p-4">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Estimated Cost</span>
              <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">
                {summary && (summary.estimatedCost != null || (summary.totalEstimatedCost && summary.totalEstimatedCost > 0))
                  ? `$${(summary.estimatedCost ?? summary.totalEstimatedCost ?? 0).toFixed(3)}`
                  : "Not configured"}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Based on provider rates</span>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0D0F15] border border-[#202534] rounded-xl p-3.5">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">Provider:</span>
                <select
                  value={providerFilter}
                  onChange={(e) => {
                    setProviderFilter(e.target.value);
                    setPage(1);
                  }}
                  className="bg-[#12151E] border border-[#202534] text-xs text-white rounded-lg px-2.5 py-1.5 outline-none focus:border-sky-500"
                >
                  <option value="all">All Providers</option>
                  <option value="gemini">Content service</option>
                  <option value="voiceai">Voice service</option>
                  <option value="local">Local transcription</option>
                  <option value="elevenlabs">Legacy voice service</option>
                  <option value="groq">Editing &amp; content service</option>
                  <option value="pollinations">Image service</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="bg-[#12151E] border border-[#202534] text-xs text-white rounded-lg px-2.5 py-1.5 outline-none focus:border-sky-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="success">Success</option>
                  <option value="error">Error</option>
                </select>
              </div>
            </div>

            <span className="text-xs text-slate-500 font-mono">
              Showing {logs.length} of {totalCount} logs
            </span>
          </div>

          {/* Logs Table */}
          <div className="bg-[#0D0F15] border border-[#202534] rounded-xl overflow-hidden shadow-sm">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading usage telemetry…</div>
            ) : error ? (
              <div className="p-6 text-center text-xs text-rose-400">{error}</div>
            ) : logs.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500">
                No usage logs recorded yet. Logs will appear automatically when voice or AI operations run.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#12151E] text-slate-400 border-b border-[#202534] uppercase font-mono text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Provider</th>
                      <th className="py-3 px-4">Operation</th>
                      <th className="py-3 px-4">Units</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Duration</th>
                      <th className="py-3 px-4">Est. Cost</th>
                      <th className="py-3 px-4">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#202534]/60">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-[#12151E]/50 transition">
                        <td className="py-3 px-4 font-semibold text-white capitalize">
                          <span className="px-2 py-0.5 rounded bg-[#161A26] border border-[#202534] text-[11px] font-mono">
                            {serviceLabel(log.provider_key)}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-300">
                          {log.operation}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-300">
                          {log.units > 0 ? `${log.units.toLocaleString()} ${log.unit_type}` : "—"}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase font-mono ${
                              log.status === "success"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${log.status === "success" ? "bg-emerald-400" : "bg-rose-400"}`} />
                            {log.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400">
                          {log.duration_ms ? `${log.duration_ms}ms` : "—"}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-300">
                          {log.estimated_cost !== null && log.estimated_cost > 0
                            ? `$${Number(log.estimated_cost).toFixed(4)}`
                            : "—"}
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px]">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            <div className="flex items-center justify-between p-3.5 bg-[#12151E] border-t border-[#202534] text-xs">
              <button
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg bg-[#161A26] border border-[#202534] text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Previous
              </button>

              <span className="text-slate-400 font-mono text-[11px]">
                Page {page} of {totalPages}
              </span>

              <button
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg bg-[#161A26] border border-[#202534] text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Next
              </button>
            </div>
          </div>
      </div>
    </StudioShell>
  );
}

