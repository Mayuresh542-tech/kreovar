"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGate } from "@/app/lib/useAuthGate";
import { isAdminEmail } from "@/app/lib/admin";
import StudioShell from "@/app/components/StudioShell";
import AuthLoadingScreen from "@/app/components/AuthLoadingScreen";

interface SystemCheck {
  id: string;
  name: string;
  category: "infrastructure" | "ai" | "voice" | "render" | "storage";
  status: "healthy" | "degraded" | "unconfigured" | "error" | "unknown";
  latency_ms: number | null;
  message: string;
  lastChecked: string;
}

export default function AdminSystemPage() {
  const router = useRouter();
  const { status, session } = useAuthGate();
  const isAdmin = status === "authed" && isAdminEmail(session?.user?.email);

  const [checks, setChecks] = useState<SystemCheck[]>([]);
  const [systemStatus, setSystemStatus] = useState<string>("unknown");
  const [lastTimestamp, setLastTimestamp] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [diagnosticRunning, setDiagnosticRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthed" || (status === "authed" && !isAdmin)) {
      router.replace("/dashboard");
    }
  }, [status, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin || !session) return;
    runDiagnostic();
  }, [isAdmin, session]);

  async function runDiagnostic() {
    setDiagnosticRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/system", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Diagnostic check failed");
      }

      const data = await res.json();
      setChecks(data.checks || []);
      setSystemStatus(data.systemStatus || "unknown");
      setLastTimestamp(data.timestamp || new Date().toISOString());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setDiagnosticRunning(false);
    }
  }

  if (!isAdmin) {
    return <AuthLoadingScreen label={status === "loading" ? "Validating root credentials…" : "Redirecting…"} />;
  }

  return (
    <StudioShell active="admin-system">
      <div className="space-y-6 max-w-6xl w-full pb-20">
          <div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight">Infrastructure & Pipeline Health</h2>
            <p className="text-sm text-slate-400 mt-1">
              Live zero-overhead health probes verifying database connectivity, authentication, encryption, and generation engines.
            </p>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
              {error}
            </div>
          )}

          {/* Diagnostic Cards Grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-36 rounded-xl bg-[#0D0F15] border border-[#202534] animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {checks.map((chk) => {
                const isOk = chk.status === "healthy";
                const isUnconfigured = chk.status === "unconfigured";
                const isDegraded = chk.status === "degraded";

                return (
                  <div
                    key={chk.id}
                    className="bg-[#0D0F15] border border-[#202534] rounded-xl p-5 flex flex-col justify-between hover:border-[#2A3144] transition-all shadow-sm"
                  >
                    <div>
                      {/* Top status indicator */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500">
                          {chk.category}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isOk
                                ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                                : isUnconfigured
                                ? "bg-amber-400"
                                : isDegraded
                                ? "bg-amber-500"
                                : "bg-rose-400"
                            }`}
                          />
                          <span
                            className={`text-xs font-semibold capitalize ${
                              isOk
                                ? "text-emerald-400"
                                : isUnconfigured
                                ? "text-amber-400"
                                : isDegraded
                                ? "text-amber-400"
                                : "text-rose-400"
                            }`}
                          >
                            {chk.status}
                          </span>
                        </div>
                      </div>

                      {/* Name */}
                      <h3 className="text-base font-bold text-white tracking-tight">{chk.name}</h3>

                      {/* Message */}
                      <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{chk.message}</p>
                    </div>

                    {/* Footer: Latency & Timestamp */}
                    <div className="mt-4 pt-3 border-t border-[#202534]/60 flex items-center justify-between text-[11px] font-mono">
                      <span className="text-slate-500">
                        {chk.latency_ms !== null ? (
                          <span className="text-slate-300">
                            Latency: <span className="text-white font-semibold">{chk.latency_ms}ms</span>
                          </span>
                        ) : (
                          <span className="text-slate-600">No ping probe</span>
                        )}
                      </span>

                      <span className="text-slate-500 text-[10px]">
                        {new Date(chk.lastChecked).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Diagnostic Note */}
          <div className="bg-[#12151E] border border-[#202534] rounded-xl p-4 text-xs text-slate-400 flex items-start gap-3">
            <span className="text-base text-sky-400">ℹ</span>
            <p className="leading-relaxed">
              Diagnostic probes are authenticated, server-side tests designed with zero payload overhead. Voice and AI
              probes query account metadata and model availability endpoints without consuming text-to-speech character
              quota or generation credits. Last diagnostic ran at {lastTimestamp ? new Date(lastTimestamp).toLocaleString() : "—"}.
            </p>
          </div>
      </div>
    </StudioShell>
  );
}
