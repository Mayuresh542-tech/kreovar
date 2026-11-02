"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { useAuthGate } from "../lib/useAuthGate";
import StudioShell from "../components/StudioShell";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import ContentKitPanel, { type ContentKit } from "../components/ContentKitPanel";

interface CompetitorVideo {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  views: number;
  likes: number;
  publishedAt: string | null;
  url: string;
  isShort?: boolean;
}

interface TitleFormula {
  formula: string;
  example: string;
}

interface CompetitorAnalysis {
  whatsWorking: string[];
  contentGaps: string[];
  titleFormulas: TitleFormula[];
  missedOpportunities?: string[];
}

interface Cache {
  niche: string;
  videos: CompetitorVideo[];
  averageViews: number;
  analysis: CompetitorAnalysis | null;
  savedAt: number;
}

const CACHE_KEY = "fretrend_competitors_cache_v1";
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

const EXAMPLES = [
  "AI Tools",
  "Personal Finance",
  "Fitness",
  "Productivity",
  "Gaming",
  "Video Editing",
];

function formatCompact(n: number): string {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "") + "K";
  return String(n);
}

function uploadAgo(iso: string | null): string {
  if (!iso) return "recently";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "recently";
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  if (days < 365) {
    const mo = Math.floor(days / 30);
    return `${mo}mo ago`;
  }
  const yr = Math.floor(days / 365);
  return `${yr}y ago`;
}

type FormatFilter = "All" | "YouTube" | "Shorts" | "Long-form";

export default function Competitors() {
  const router = useRouter();
  const { status, session } = useAuthGate();

  const [niche, setNiche] = useState("");
  const [searched, setSearched] = useState(false);
  const [cachedNiche, setCachedNiche] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [videos, setVideos] = useState<CompetitorVideo[]>([]);
  const [averageViews, setAverageViews] = useState(0);

  const [formatFilter, setFormatFilter] = useState<FormatFilter>("All");

  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<CompetitorAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState("");

  // Content Kit modal state
  const [kitOpen, setKitOpen] = useState(false);
  const [kitTopic, setKitTopic] = useState("");
  const [kitStarted, setKitStarted] = useState(false);
  const [kitDuration, setKitDuration] = useState<number>(60);
  const [kitLoading, setKitLoading] = useState(false);
  const [kitError, setKitError] = useState<string | null>(null);
  const [kitData, setKitData] = useState<ContentKit | null>(null);
  const [savingKit, setSavingKit] = useState(false);
  const [savedKit, setSavedKit] = useState(false);
  const [userCredits, setUserCredits] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (status === "unauthed") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const cache: Cache = JSON.parse(raw);
      if (Date.now() - cache.savedAt < CACHE_TTL) {
        setTimeout(() => {
          setNiche(cache.niche);
          setCachedNiche(cache.niche);
          setVideos(cache.videos ?? []);
          setAverageViews(cache.averageViews ?? 0);
          setAnalysis(cache.analysis ?? null);
          setSearched(true);
        }, 0);
      }
    } catch {
      // ignore
    }
  }, []);

  function writeCache(update: Partial<Cache> & { niche: string; videos: CompetitorVideo[] }) {
    try {
      const payload: Cache = {
        niche: update.niche,
        videos: update.videos,
        averageViews: update.averageViews ?? averageViews,
        analysis: update.analysis !== undefined ? update.analysis : analysis,
        savedAt: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }

  async function runAnalysis(query: string, vids: CompetitorVideo[]) {
    setAnalyzing(true);
    setAnalysisError("");

    try {
      const { data: { session: sess } } = await supabase.auth.getSession();
      if (!sess) {
        return;
      }

      const res = await fetch("/api/competitors/analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sess.access_token}`,
        },
        body: JSON.stringify({ niche: query, videos: vids }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to analyze competitors.");
      }
      setAnalysis(data.analysis);
      writeCache({ niche: query, videos: vids, analysis: data.analysis });
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function analyze(forceNiche?: string) {
    const query = (forceNiche ?? niche).trim();
    if (!query) return;

    setLoading(true);
    setSearched(true);
    setError("");
    setVideos([]);
    setAverageViews(0);
    setAnalysis(null);
    setAnalysisError("");

    try {
      const { data: { session: sess } } = await supabase.auth.getSession();
      const res = await fetch("/api/competitors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sess ? { Authorization: `Bearer ${sess.access_token}` } : {}),
        },
        body: JSON.stringify({ niche: query }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "missing_youtube_key") {
          throw new Error("No YouTube API key configured. Add your key in Settings to inspect YouTube competitors.");
        }
        if (data.error === "invalid_youtube_key") {
          throw new Error("The YouTube API key was rejected. Check your key in Settings.");
        }
        throw new Error(data.error ?? "Failed to fetch competitors.");
      }

      const rawVids: CompetitorVideo[] = data.videos ?? [];
      const taggedVids: CompetitorVideo[] = rawVids.map((v) => {
        const titleLower = v.title.toLowerCase();
        const isShort = titleLower.includes("#shorts") || titleLower.includes("shorts") || titleLower.includes("short");
        return { ...v, isShort };
      });

      setVideos(taggedVids);
      setAverageViews(data.averageViews ?? 0);
      setCachedNiche(query);
      writeCache({ niche: query, videos: taggedVids, averageViews: data.averageViews ?? 0, analysis: null });

      if (taggedVids.length > 0) void runAnalysis(query, taggedVids);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }

  // Filtered videos based on format
  const filteredVideos = videos.filter((v) => {
    if (formatFilter === "All" || formatFilter === "YouTube") return true;
    if (formatFilter === "Shorts") return !!v.isShort;
    if (formatFilter === "Long-form") return !v.isShort;
    return true;
  });

  const topViews = videos.length ? Math.max(...videos.map((v) => v.views)) : 0;

  // Content Kit trigger
  function openContentKit(topicName: string) {
    setKitTopic(topicName);
    setKitOpen(true);
    setKitStarted(false);
    setKitData(null);
    setKitError(null);
    setSavedKit(false);
  }

  async function runKit() {
    if (!kitTopic) return;
    setKitLoading(true);
    setKitStarted(true);
    setKitError(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch("/api/content-kit", {
        method: "POST",
        headers,
        body: JSON.stringify({
          topic: kitTopic,
          niche: cachedNiche || niche || "general",
          duration: kitDuration,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.error === "missing_key") {
          throw new Error("AI Content Kit generation is temporarily unavailable. Please retry.");
        }
        if (typeof data.creditsRemaining === "number") {
          setUserCredits(data.creditsRemaining);
        }
        throw new Error(data.error ?? "Failed to generate kit");
      }
      if (typeof data.creditsRemaining === "number") {
        setUserCredits(data.creditsRemaining);
      }
      setKitData(data.kit);
    } catch (err) {
      setKitError(err instanceof Error ? err.message : "Failed to generate kit");
    } finally {
      setKitLoading(false);
    }
  }

  async function saveKitReport() {
    if (!session || !kitData) return;
    setSavingKit(true);
    try {
      const { error: saveErr } = await supabase.from("content_kits").insert({
        user_id: session.user.id,
        topic: kitTopic,
        niche: cachedNiche || niche || "general",
        virality_score: 92,
        kit: kitData,
      });
      if (saveErr) throw saveErr;
      setSavedKit(true);
    } catch (err) {
      alert("Failed to save report: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setSavingKit(false);
    }
  }

  if (status !== "authed") {
    return <AuthLoadingScreen label={status === "loading" ? "Loading session…" : "Redirecting…"} />;
  }

  return (
    <StudioShell active="competitors">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        {/* Spotlight YouTube Channel Research Banner */}
        <div className="w-full rounded-2xl bg-[#12151E] border border-[#202534] p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-slate-400 text-xs font-mono font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                YouTube Data API v3
              </span>
              <span className="text-slate-600 font-mono text-xs">•</span>
              <span className="text-slate-400 font-mono text-xs">Competitor Intelligence</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Competitor Tracking &amp; Gap Analysis</h1>
            <p className="text-xs text-slate-400">
              Benchmark viral videos, extract winning title formulas, and uncover high-opportunity content gaps.
            </p>
          </div>

          {/* Search Input in Card */}
          <div className="flex items-center gap-2 max-w-md w-full">
            <div className="relative w-full">
              <input
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && analyze()}
                placeholder="Search YouTube channels, topics, or niches..."
                className="w-full pl-3.5 pr-8 py-2.5 text-xs bg-[#0D0F15] border border-[#202534] focus:border-sky-500/70 focus:ring-1 focus:ring-sky-500/20 rounded-xl text-white placeholder-slate-500 outline-none transition font-sans"
              />
              {niche && (
                <button
                  onClick={() => setNiche("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              onClick={() => analyze()}
              disabled={loading || !niche.trim()}
              className="px-4 py-2.5 bg-sky-500 hover:bg-sky-400 text-xs font-semibold text-white rounded-xl shadow-sm transition-colors shrink-0 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              {loading ? (
                <>
                  <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  <span>Searching…</span>
                </>
              ) : (
                <span>Search</span>
              )}
            </button>
          </div>
        </div>

        {/* Example Niche Pills */}
        <div className="flex items-center flex-wrap gap-2 text-xs text-slate-400 font-mono">
          <span className="text-slate-500 uppercase tracking-wider text-[10px] font-semibold">Recommended:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => {
                setNiche(ex);
                analyze(ex);
              }}
              className={`px-3 py-1.5 rounded-xl text-[11px] border transition cursor-pointer ${
                cachedNiche === ex
                  ? "bg-sky-500/10 text-sky-300 border-sky-500/40 shadow-[0_0_12px_rgba(14,165,233,0.2)] font-semibold"
                  : "bg-[#12151E] border-[#202534] text-slate-300 hover:text-white hover:border-[#2A3144]"
              }`}
            >
              + {ex}
            </button>
          ))}
        </div>

        {/* Page Title & Subtitle */}
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Competitor Intelligence
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 font-poppins">
            {cachedNiche ? `Benchmarking top YouTube creators in "${cachedNiche}"` : "See what's working in your niche."}
          </p>
        </div>

        {/* 4 Compact Summary Metrics */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Average Views */}
          <div className="bg-[#0D1017] border border-[#1A2030] rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Avg. Views</span>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-2xl font-bold font-mono text-white">
                {videos.length > 0 ? formatCompact(averageViews) : "—"}
              </span>
              {videos.length > 0 && (
                <span className="text-[10px] font-medium text-emerald-400 font-mono">
                  Live
                </span>
              )}
            </div>
          </div>

          {/* Peak Views */}
          <div className="bg-[#0D1017] border border-[#1A2030] rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Peak Views</span>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-2xl font-bold font-mono text-white">
                {videos.length > 0 ? formatCompact(topViews) : "—"}
              </span>
              <span className="text-[10px] font-medium text-slate-500 font-mono">
                {videos.length > 0 ? "Top" : "Awaiting"}
              </span>
            </div>
          </div>

          {/* Analyzed Videos */}
          <div className="bg-[#0D1017] border border-[#1A2030] rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Analyzed Videos</span>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-2xl font-bold font-mono text-white">
                {videos.length > 0 ? videos.length : "0"}
              </span>
              <span className="text-[10px] font-medium text-slate-500 font-mono">
                {videos.length > 0 ? "In niche" : "Standby"}
              </span>
            </div>
          </div>

          {/* Upload Pattern */}
          <div className="bg-[#0D1017] border border-[#1A2030] rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Upload Pattern</span>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-xl font-bold font-mono text-white">
                {videos.length > 0 ? "3-4 / week" : "—"}
              </span>
              <span className="text-[10px] font-medium text-sky-400 font-mono">
                {videos.length > 0 ? "Optimal" : "Standby"}
              </span>
            </div>
          </div>
        </section>

        {/* Error Message */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
            <button
              onClick={() => analyze()}
              className="px-3 py-1 rounded-lg bg-[#12151E] hover:bg-[#1B2030] border border-[#202534] text-white font-mono text-[11px] cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading Skeletons */}
        {loading && (
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 xl:col-span-8 h-96 bg-[#0D0F15] border border-[#202534] rounded-2xl animate-pulse" />
            <div className="col-span-12 xl:col-span-4 h-96 bg-[#0D0F15] border border-[#202534] rounded-2xl animate-pulse" />
          </div>
        )}

        {/* Empty State before search */}
        {!loading && !searched && (
          <div className="py-20 text-center rounded-3xl bg-[#0D0F15] border border-[#202534] shadow-[0_16px_50px_rgba(0,0,0,0.5)]">
            <div className="w-14 h-14 rounded-2xl bg-sky-500/10 text-sky-400 flex items-center justify-center mx-auto mb-4 text-2xl border border-sky-500/20 shadow-[0_0_20px_rgba(14,165,233,0.25)]">
              📊
            </div>
            <h3 className="text-lg font-bold text-white mb-1 font-heading">Benchmark YouTube In Any Niche</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mb-6">
              Enter a topic or select a recommended niche above to benchmark views, extract title formulas, and uncover content gaps.
            </p>
            <button
              onClick={() => {
                setNiche("AI Tools");
                analyze("AI Tools");
              }}
              className="px-6 py-3 rounded-full bg-white hover:bg-slate-100 text-zinc-950 font-bold text-xs uppercase tracking-wider shadow-[0_0_24px_rgba(255,255,255,0.25)] transition cursor-pointer active:scale-95"
            >
              Benchmark AI Tools →
            </button>
          </div>
        )}

        {/* DUAL COLUMN INTELLIGENCE VIEW */}
        {!loading && (searched || videos.length > 0) && (
          <div className="grid grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN: Competitor Video Research Table (8 cols) */}
            <section className="col-span-12 xl:col-span-8 bg-[#0D0F15] border border-[#202534] rounded-2xl flex flex-col overflow-hidden shadow-[0_16px_50px_rgba(0,0,0,0.5)]">
              {/* Table Toolbar & Filters */}
              <div className="p-4 border-b border-[#202534] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-white mr-1 font-heading">Top Videos</span>
                  <div className="flex items-center bg-[#12151E] p-1 rounded-xl border border-[#202534] text-xs">
                    {(["All", "YouTube", "Shorts", "Long-form"] as FormatFilter[]).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setFormatFilter(tab)}
                        className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
                          formatFilter === tab
                            ? "bg-sky-500/10 border border-sky-500/40 text-sky-300 font-bold shadow-[0_0_10px_rgba(14,165,233,0.2)]"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  Displaying <span className="text-white font-semibold">{filteredVideos.length}</span> of {videos.length} results
                </div>
              </div>

              {/* Video Research Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="text-[10px] font-mono uppercase text-slate-400 border-b border-[#202534] bg-[#12151E]">
                      <th className="py-3 px-4 font-semibold">Video</th>
                      <th className="py-3 px-3 font-semibold">Channel</th>
                      <th className="py-3 px-3 font-semibold">Views</th>
                      <th className="py-3 px-3 font-semibold">Age</th>
                      <th className="py-3 px-3 font-semibold">Format</th>
                      <th className="py-3 px-3 font-semibold">Topic</th>
                      <th className="py-3 px-4 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#202534] font-normal">
                    {filteredVideos.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-slate-500 text-xs">
                          No videos match the selected filter.
                        </td>
                      </tr>
                    ) : (
                      filteredVideos.map((v) => (
                        <tr key={v.id} className="hover:bg-[#161A26] transition-colors group">
                          <td className="py-3.5 px-4 max-w-[260px]">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-[#12151E] border border-[#202534] shrink-0 flex items-center justify-center text-slate-400 group-hover:border-sky-500/40 transition overflow-hidden">
                                {v.thumbnail ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover" />
                                ) : (
                                  <svg className="w-4 h-4 text-sky-400" fill="currentColor" viewBox="0 0 24 24">
                                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                                  </svg>
                                )}
                              </div>
                              <a
                                href={v.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-white truncate group-hover:text-sky-300 transition block"
                                title={v.title}
                              >
                                {v.title}
                              </a>
                            </div>
                          </td>
                          <td className="py-3.5 px-3 text-slate-300 whitespace-nowrap">{v.channel}</td>
                          <td className="py-3.5 px-3 font-mono font-semibold text-white whitespace-nowrap">
                            {formatCompact(v.views)}
                          </td>
                          <td className="py-3.5 px-3 text-slate-400 whitespace-nowrap">
                            {uploadAgo(v.publishedAt)}
                          </td>
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            {v.isShort ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/30">
                                Short
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#12151E] text-slate-300 border border-[#202534]">
                                Long
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-3 text-slate-400 whitespace-nowrap text-[11px]">
                            {cachedNiche || "General"}
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <button
                              onClick={() => openContentKit(v.title)}
                              title="Generate Content Kit for this video"
                              className="px-2.5 py-1 rounded-lg text-xs font-mono font-semibold text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 transition mr-1.5 cursor-pointer shadow-[0_0_10px_rgba(14,165,233,0.2)]"
                            >
                              Kit →
                            </button>
                            <a
                              href={v.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open on YouTube"
                              className="inline-block p-1.5 text-slate-400 hover:text-white transition"
                            >
                              ↗
                            </a>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* RIGHT COLUMN: AI Research Intelligence Panel (4 cols) */}
            <section className="col-span-12 xl:col-span-4 bg-[#0D0F15] border border-[#202534] rounded-2xl p-6 flex flex-col justify-between space-y-6 shadow-[0_16px_50px_rgba(0,0,0,0.5)]">
              {/* Section Heading */}
              <div className="flex items-center justify-between border-b border-[#202534] pb-3.5">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                  </svg>
                  <h2 className="text-xs font-bold font-mono tracking-wider text-white uppercase">
                    AI Research Intelligence
                  </h2>
                </div>
                <span className={`inline-block w-2 h-2 rounded-full ${analyzing ? "bg-amber-400 animate-ping" : "bg-sky-400 animate-pulse"}`}></span>
              </div>

              {/* Analyzing Status */}
              {analyzing && (
                <div className="p-4 rounded-xl bg-[#12151E] border border-[#202534] text-center space-y-2">
                  <div className="w-5 h-5 rounded-full border-2 border-sky-500/30 border-t-sky-400 animate-spin mx-auto" />
                  <p className="text-xs font-mono text-sky-300 animate-pulse">
                    Synthesizing intelligence with Gemini AI…
                  </p>
                </div>
              )}

              {/* Error Status */}
              {analysisError && !analyzing && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center justify-between">
                  <span>{analysisError}</span>
                  <button
                    onClick={() => runAnalysis(cachedNiche, videos)}
                    className="px-2.5 py-1 rounded-lg bg-[#12151E] text-white border border-[#202534] font-mono text-[10px] cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Structured Intelligence Sections */}
              <div className="space-y-4 text-xs">
                {/* Section 1: What's Working */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-sky-400 font-semibold text-[11px] uppercase tracking-wide">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                    </svg>
                    <span>What&apos;s Working</span>
                  </div>
                  <div className="text-slate-300 leading-relaxed bg-[#12151E] p-3 rounded-xl border border-[#202534] space-y-1.5">
                    {analysis?.whatsWorking && analysis.whatsWorking.length > 0 ? (
                      analysis.whatsWorking.map((w, idx) => (
                        <p key={idx} className="flex items-start gap-1.5">
                          <span className="text-sky-400">•</span>
                          <span>{w}</span>
                        </p>
                      ))
                    ) : (
                      <p className="text-slate-400">
                        Short-form proof, real-world examples, and side-by-side tool comparisons retain highest audience retention.
                      </p>
                    )}
                  </div>
                </div>

                {/* Section 2: Content Gaps */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-[11px] uppercase tracking-wide">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                    </svg>
                    <span>Content Gaps</span>
                  </div>
                  <div className="text-slate-300 leading-relaxed bg-[#12151E] p-3 rounded-xl border border-[#202534] space-y-1.5">
                    {analysis?.contentGaps && analysis.contentGaps.length > 0 ? (
                      analysis.contentGaps.map((g, idx) => (
                        <p key={idx} className="flex items-start gap-1.5">
                          <span className="text-amber-400">•</span>
                          <span>{g}</span>
                        </p>
                      ))
                    ) : (
                      <p className="text-slate-400">
                        Lack of candid cost breakdown comparisons and beginner daily workflow step-by-steps.
                      </p>
                    )}
                  </div>
                </div>

                {/* Section 3: Title Formulas */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-cyan-400 font-semibold text-[11px] uppercase tracking-wide">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                    </svg>
                    <span>Title Formulas</span>
                  </div>
                  <div className="space-y-1.5 bg-[#12151E] p-3 rounded-xl border border-[#202534] text-slate-300 font-mono text-[11px]">
                    {analysis?.titleFormulas && analysis.titleFormulas.length > 0 ? (
                      analysis.titleFormulas.map((tf, idx) => (
                        <div key={idx} className="hover:text-white transition">
                          &ldquo;{tf.formula}&rdquo;
                        </div>
                      ))
                    ) : (
                      <>
                        <div className="hover:text-white transition">&ldquo;[Tool] vs [Tool]: Don&apos;t make this mistake&rdquo;</div>
                        <div className="hover:text-white transition">&ldquo;How I edit 10x faster using [X]&rdquo;</div>
                        <div className="hover:text-white transition">&ldquo;The best [Niche] tool nobody is talking about&rdquo;</div>
                      </>
                    )}
                  </div>
                </div>

                {/* Section 4: Missed Opportunities */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-sky-400 font-semibold text-[11px] uppercase tracking-wide">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                    </svg>
                    <span>Missed Opportunities</span>
                  </div>
                  <div className="text-slate-300 leading-relaxed bg-[#12151E] p-3 rounded-xl border border-[#202534]">
                    <p className="text-slate-400">
                      {cachedNiche
                        ? `Niche-specific setups and automated faceless workflows for "${cachedNiche}".`
                        : "Niche-specific editing setups (gaming, travel vlogs, faceless accounts)."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Bottom Action CTA */}
              <div className="pt-2">
                <button
                  onClick={() => openContentKit(cachedNiche ? `${cachedNiche} Trend Guide` : "AI Tools Trend Guide")}
                  className="w-full py-3 px-4 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs rounded-full transition flex items-center justify-center gap-2 tracking-wider uppercase shadow-[0_0_24px_rgba(14,165,233,0.35)] cursor-pointer active:scale-95"
                >
                  <span>Generate Content Kit</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"></path>
                  </svg>
                </button>
              </div>
            </section>
          </div>
        )}

        {/* Content Kit Panel Modal */}
        <ContentKitPanel
          open={kitOpen}
          onClose={() => setKitOpen(false)}
          topic={kitTopic}
          niche={cachedNiche || niche || "general"}
          score={94}
          started={kitStarted}
          duration={kitDuration}
          onDurationChange={setKitDuration}
          onGenerate={runKit}
          onReconfigure={() => setKitStarted(false)}
          loading={kitLoading}
          error={kitError}
          kit={kitData}
          saving={savingKit}
          saved={savedKit}
          onSave={saveKitReport}
          onRetry={runKit}
          creditsRemaining={userCredits}
          onCreditsUpdate={(c) => setUserCredits(c)}
        />
      </div>
    </StudioShell>
  );
}
