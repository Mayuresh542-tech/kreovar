"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { useAuthGate } from "../lib/useAuthGate";
import StudioShell from "../components/StudioShell";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import ContentKitPanel, { DURATIONS, type ContentKit } from "../components/ContentKitPanel";
import {
  type AlertTrend,
  readNicheCache,
  writeNicheCache,
  clearNicheCache,
  fetchNicheTrends,
  freshness,
  writeAlertsSummary,
} from "../lib/alerts";

interface NicheState {
  trends: AlertTrend[];
  savedAt: number;
  loading: boolean;
  error?: string;
}

const SOURCE_STYLES: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  "Google Trends": { color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", dot: "bg-blue-400" },
  HackerNews:      { color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20", dot: "bg-orange-400" },
  Reddit:          { color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20", dot: "bg-rose-400" },
  YouTube:         { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", dot: "bg-red-400" },
  "Google News":   { color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20", dot: "bg-cyan-400" },
};

function momentumLabel(score: number): { label: string; text: string; bg: string } {
  if (score >= 85) return { label: "🔥 Surging (+380%)", text: "text-rose-300", bg: "bg-rose-500/15 border-rose-500/30" };
  if (score >= 65) return { label: "📈 High Velocity", text: "text-sky-300", bg: "bg-sky-500/10 border-sky-500/40 shadow-[0_0_12px_rgba(14,165,233,0.2)]" };
  return { label: "🌱 Fresh Signal", text: "text-emerald-300", bg: "bg-emerald-950/60 border-emerald-500/30" };
}

export default function Alerts() {
  const router = useRouter();
  const { status, session } = useAuthGate();

  const [niches, setNiches] = useState<string[] | null>(null);
  const [alerts, setAlerts] = useState<Record<string, NicheState>>({});
  const [newNiche, setNewNiche] = useState("");
  const [adding, setAdding] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("All");

  // AI Content Kit panel state
  const [kitOpen, setKitOpen] = useState(false);
  const [kitStarted, setKitStarted] = useState(false);
  const [kitDuration, setKitDuration] = useState(60);
  const [kitTrend, setKitTrend] = useState<AlertTrend | null>(null);
  const [kitNiche, setKitNiche] = useState("");
  const [kitLoading, setKitLoading] = useState(false);
  const [kitData, setKitData] = useState<ContentKit | null>(null);
  const [kitError, setKitError] = useState<string | null>(null);
  const [needKey, setNeedKey] = useState(false);
  const [savingKit, setSavingKit] = useState(false);
  const [savedKit, setSavedKit] = useState(false);
  const [userCredits, setUserCredits] = useState<number | undefined>(undefined);

  // Read status tracking
  const [readTrends, setReadTrends] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (status === "unauthed") router.replace("/login");
  }, [status, router]);

  const loadNiche = useCallback(async (niche: string, force = false) => {
    const cached = force ? null : readNicheCache(niche);
    if (cached) {
      setAlerts((prev) => ({
        ...prev,
        [niche]: { trends: cached.trends, savedAt: cached.savedAt, loading: false },
      }));
      return;
    }
    setAlerts((prev) => ({
      ...prev,
      [niche]: { trends: prev[niche]?.trends ?? [], savedAt: prev[niche]?.savedAt ?? 0, loading: true },
    }));
    try {
      const trends = await fetchNicheTrends(niche);
      const savedAt = Date.now();
      writeNicheCache({ niche, trends, savedAt });
      setAlerts((prev) => ({ ...prev, [niche]: { trends, savedAt, loading: false } }));
    } catch {
      setAlerts((prev) => ({
        ...prev,
        [niche]: {
          trends: prev[niche]?.trends ?? [],
          savedAt: prev[niche]?.savedAt ?? 0,
          loading: false,
          error: "Couldn't load trends — try refreshing.",
        },
      }));
    }
  }, []);

  const loadedRef = useRef(false);
  useEffect(() => {
    if (status !== "authed" || !session || loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      const { data } = await supabase
        .from("saved_niches")
        .select("niche")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: true });
      const list = (data ?? []).map((r: { niche: string }) => r.niche);
      setNiches(list);
      list.forEach((n) => void loadNiche(n));
    })();
  }, [status, session, loadNiche]);

  useEffect(() => {
    if (niches === null) return;
    let total = 0;
    for (const n of niches) {
      const entry = alerts[n];
      if (!entry?.trends) continue;
      total += entry.trends.length;
    }
    writeAlertsSummary({
      total,
      niches: niches.length,
      savedAt: Date.now(),
    });
  }, [niches, alerts]);

  async function addNiche() {
    const trimmed = newNiche.trim().toLowerCase();
    if (!trimmed || !session || niches?.includes(trimmed)) return;
    setAdding(true);
    try {
      await supabase.from("saved_niches").insert({ user_id: session.user.id, niche: trimmed });
      setNiches((prev) => [...(prev ?? []), trimmed]);
      setNewNiche("");
      void loadNiche(trimmed, true);
    } catch {
      // ignore
    } finally {
      setAdding(false);
    }
  }

  async function removeNiche(n: string) {
    if (!session) return;
    clearNicheCache(n);
    setNiches((prev) => (prev ?? []).filter((x) => x !== n));
    setAlerts((prev) => {
      const next = { ...prev };
      delete next[n];
      return next;
    });
    try {
      await supabase.from("saved_niches").delete().eq("user_id", session.user.id).eq("niche", n);
    } catch {
      // ignore
    }
  }

  function openKit(trend: AlertTrend, nicheName: string) {
    setKitTrend(trend);
    setKitNiche(nicheName);
    setKitOpen(true);
    setKitStarted(false);
    setKitData(null);
    setKitError(null);
    setNeedKey(false);
    setSavedKit(false);
    setReadTrends((prev) => new Set(prev).add(trend.title));
  }

  async function runKit() {
    if (!kitTrend) return;
    const dur = DURATIONS.find((d) => d.seconds === kitDuration) ?? DURATIONS[1];
    setKitLoading(true);
    setKitStarted(true);
    setKitError(null);
    setNeedKey(false);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch("/api/content-kit", {
        method: "POST",
        headers,
        body: JSON.stringify({
          topic: kitTrend.title,
          niche: kitNiche || "general",
          duration: kitDuration,
          targetWords: dur.words,
          format: dur.format,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "missing_key") {
          setNeedKey(true);
          return;
        }
        if (data.error === "invalid_key") {
          throw new Error("AI service authentication failed. Please verify API configuration.");
        }
        if (typeof data.creditsRemaining === "number") {
          setUserCredits(data.creditsRemaining);
        }
        throw new Error(data.error ?? "Failed to generate content kit.");
      }
      if (typeof data.creditsRemaining === "number") {
        setUserCredits(data.creditsRemaining);
      }
      setKitData(data.kit);
    } catch (err) {
      setKitError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setKitLoading(false);
    }
  }

  async function saveReport() {
    if (!kitData || !kitTrend) return;
    setSavingKit(true);
    setKitError(null);
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      const user = s?.user;
      if (!user) {
        setKitError("Log in to save reports.");
        return;
      }
      await supabase.from("content_kits").insert({
        user_id: user.id,
        topic: kitTrend.title,
        niche: kitNiche || null,
        virality_score: kitTrend.trendScore,
        kit: kitData,
      });
      setSavedKit(true);
    } catch (err) {
      setKitError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSavingKit(false);
    }
  }

  const allOpportunities = useMemo(() => {
    if (!niches) return [];
    const list: { trend: AlertTrend; niche: string; savedAt: number }[] = [];
    niches.forEach((n) => {
      const nState = alerts[n];
      if (nState?.trends) {
        nState.trends.forEach((t) => {
          list.push({ trend: t, niche: n, savedAt: nState.savedAt });
        });
      }
    });
    list.sort((a, b) => b.trend.trendScore - a.trend.trendScore);
    return list;
  }, [niches, alerts]);

  const filteredOpportunities = useMemo(() => {
    if (activeFilter === "All") return allOpportunities;
    return allOpportunities.filter((item) => item.niche.toLowerCase() === activeFilter.toLowerCase());
  }, [allOpportunities, activeFilter]);

  if (status !== "authed") {
    return <AuthLoadingScreen label={status === "loading" ? "Loading alerts…" : "Redirecting…"} />;
  }

  return (
    <StudioShell active="alerts">
      <div className="max-w-7xl mx-auto w-full space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1A2030] pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider bg-sky-500/10 border border-sky-500/20 text-sky-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                Live Radar Surveillance
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-3">
              <span>Trend Radar Alerts</span>
              {allOpportunities.length > 0 && (
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  {allOpportunities.length} Active Signals
                </span>
              )}
            </h1>
            <p className="text-slate-400 text-xs mt-0.5">
              Automated algorithmic surveillance across your monitored niches. Breakout topics are caught before saturation.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => niches?.forEach((n) => void loadNiche(n, true))}
              className="px-3.5 py-2 rounded-lg text-xs font-medium bg-[#11141E] hover:bg-[#161B28] border border-[#202738] text-slate-300 hover:text-white transition-colors flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <span>↻</span>
              <span>Refresh Radar</span>
            </button>
          </div>
        </div>

        {/* Section 1: Monitored Niches Management */}
        <div className="p-5 sm:p-6 rounded-2xl bg-[#0D1017] border border-[#1A2030]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white flex items-center gap-2">
                <span>🎯</span>
                <span>Monitored Niches</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 font-sans">
                Niches monitored for sudden velocity breakouts (e.g. AI Tools, Solana, Video Editing).
              </p>
            </div>

            {/* Quick Add Niche Input */}
            <div className="flex items-center gap-2 max-w-sm w-full">
              <input
                type="text"
                value={newNiche}
                onChange={(e) => setNewNiche(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addNiche()}
                placeholder="Add niche (e.g. AI Tools)…"
                className="flex-1 px-3.5 py-2 bg-[#11141E] border border-[#1E2536] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
              />
              <button
                onClick={addNiche}
                disabled={adding || !newNiche.trim()}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-sky-500 hover:bg-sky-400 text-white shadow-sm disabled:opacity-40 transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                + Add
              </button>
            </div>
          </div>

          {/* Niches Pills */}
          {!niches ? (
            <div className="h-10 bg-white/[0.02] rounded-xl animate-pulse" />
          ) : niches.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-xs text-slate-400 mb-3">No monitored niches saved yet. Start tracking a niche to receive alerts!</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {["AI", "Gaming", "Technology", "Video Editing", "Finance"].map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setNewNiche(s);
                      setTimeout(() => {
                        addNiche();
                      }, 50);
                    }}
                    className="text-xs font-mono px-3 py-1.5 rounded-xl bg-[#12151E] border border-[#202534] hover:border-sky-500/40 text-slate-300 hover:text-white transition cursor-pointer"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5">
              {niches.map((n) => {
                const count = alerts[n]?.trends?.length ?? 0;
                const isLoading = alerts[n]?.loading;

                return (
                  <div
                    key={n}
                    className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#12151E] border border-sky-500/30 text-sky-300 text-xs font-mono shadow-[0_0_12px_rgba(14,165,233,0.15)]"
                  >
                    <span className="capitalize font-semibold">{n}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-950 text-sky-300 font-bold tabular-nums border border-sky-500/40">
                      {isLoading ? "…" : count}
                    </span>
                    <button
                      onClick={() => removeNiche(n)}
                      className="text-slate-500 hover:text-rose-400 transition-colors ml-1 text-xs leading-none cursor-pointer"
                      title="Remove niche"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 2: Radar Feed */}
        <div className="flex flex-col gap-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse shadow-[0_0_8px_rgba(14,165,233,0.8)]" />
              <h2 className="text-lg font-bold text-white tracking-tight font-heading">Active Radar Signals</h2>
            </div>

            {/* Filter Tabs by Niche */}
            {niches && niches.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 font-mono text-xs">
                <button
                  onClick={() => setActiveFilter("All")}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    activeFilter === "All"
                      ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white font-bold shadow-[0_0_12px_rgba(14,165,233,0.35)]"
                      : "bg-[#0D0F15] text-slate-400 hover:text-white border border-[#202534]"
                  }`}
                >
                  All ({allOpportunities.length})
                </button>
                {niches.map((n) => (
                  <button
                    key={n}
                    onClick={() => setActiveFilter(n)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap capitalize cursor-pointer ${
                      activeFilter.toLowerCase() === n.toLowerCase()
                        ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white font-bold shadow-[0_0_12px_rgba(14,165,233,0.35)]"
                        : "bg-[#0D0F15] text-slate-400 hover:text-white border border-[#202534]"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>

          {allOpportunities.length === 0 ? (
            <div className="py-20 text-center rounded-3xl bg-[#0D0F15] border border-[#202534] shadow-[0_16px_50px_rgba(0,0,0,0.5)]">
              <div className="w-14 h-14 rounded-2xl bg-sky-500/10 text-sky-400 flex items-center justify-center mx-auto mb-4 text-2xl border border-sky-500/30 shadow-[0_0_20px_rgba(14,165,233,0.25)]">
                🔔
              </div>
              <h3 className="text-base font-bold text-white mb-1 font-heading">Radar Surveillance Active</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No new momentum surges detected at this instant. Real-time feeds refresh continuously.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {filteredOpportunities.map((item, i) => {
                const { trend, niche: itemNiche, savedAt } = item;
                const src = SOURCE_STYLES[trend.source] ?? SOURCE_STYLES["Google Trends"];
                const mom = momentumLabel(trend.trendScore);
                const isUnread = !readTrends.has(trend.title);

                return (
                  <motion.div
                    key={`${trend.source}-${trend.title}-${i}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    className={`p-5 sm:p-6 rounded-2xl bg-[#0D0F15] border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-5 group shadow-[0_8px_30px_rgba(0,0,0,0.4)] ${
                      isUnread
                        ? "border-sky-500/40 shadow-[0_0_24px_-8px_rgba(14,165,233,0.3)] relative"
                        : "border-[#202534] hover:border-sky-500/30"
                    }`}
                  >
                    {/* Unread Glowing Dot */}
                    {isUnread && (
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-sky-400 animate-pulse hidden sm:block shadow-[0_0_8px_rgba(14,165,233,0.8)]" />
                    )}

                    <div className="flex-1 min-w-0 sm:pl-3">
                      <div className="flex items-center flex-wrap gap-2 mb-2.5">
                        {isUnread && (
                          <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/40 shadow-[0_0_10px_rgba(14,165,233,0.2)]">
                            SIGNAL DETECTED
                          </span>
                        )}
                        <span className={`flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-0.5 rounded-full border ${src.color} ${src.bg} ${src.border}`}>
                          <span className={`w-1 h-1 rounded-full ${src.dot}`} />
                          {trend.source}
                        </span>
                        <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-[#12151E] border border-[#202534] text-slate-400 capitalize">
                          {itemNiche}
                        </span>
                        <span className={`text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full border ${mom.bg} ${mom.text}`}>
                          {mom.label}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {freshness(savedAt)}
                        </span>
                      </div>

                      <h3 className="text-sm sm:text-base font-bold text-white mb-2 leading-snug group-hover:text-sky-300 transition-colors font-heading">
                        {trend.url ? (
                          <a
                            href={trend.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-sky-300 transition-colors"
                          >
                            {trend.title}
                          </a>
                        ) : (
                          trend.title
                        )}
                      </h3>

                      <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
                        <span className="font-bold text-sky-400 tabular-nums">{trend.trendScore}/100 Virality</span>
                        <span>•</span>
                        <span>High audience click intent</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-[#202534]">
                      <button
                        onClick={() => openKit(trend, itemNiche)}
                        className="w-full sm:w-auto px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider bg-white hover:bg-slate-100 text-zinc-950 font-bold shadow-[0_0_24px_rgba(255,255,255,0.2)] transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                      >
                        <span>Create Content</span>
                        <span className="text-sky-500">✨</span>
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

      {/* AI Content Kit Modal */}
      <ContentKitPanel
        open={kitOpen}
        onClose={() => setKitOpen(false)}
        topic={kitTrend?.title ?? ""}
        niche={kitNiche || "general"}
        score={kitTrend?.trendScore ?? 0}
        started={kitStarted}
        duration={kitDuration}
        onDurationChange={setKitDuration}
        onGenerate={runKit}
        onReconfigure={() => setKitStarted(false)}
        loading={kitLoading}
        needKey={needKey}
        error={kitError}
        kit={kitData}
        saving={savingKit}
        saved={savedKit}
        onSave={saveReport}
        onRetry={runKit}
        creditsRemaining={userCredits}
        onCreditsUpdate={(c) => setUserCredits(c)}
      />
      </div>
    </StudioShell>
  );
}
