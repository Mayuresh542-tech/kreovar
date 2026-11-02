"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import StudioShell from "../components/StudioShell";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import { useAuthGate } from "../lib/useAuthGate";
import { BRollVideoItem } from "../api/broll/search/route";

import BRollDownloadButton from "../components/BRollDownloadButton";
import {
  Search,
  Film,
  Sparkles,
  Check,
  Copy,
  ExternalLink,
  SlidersHorizontal,
  Video,
} from "lucide-react";

const REQUIREMENT_CATEGORIES = [
  {
    category: "Viral Hooks & Interrupts",
    icon: "⚡",
    queries: ["Shocked reaction", "Money falling cash", "Fast zoom explosion", "Broken glass crash"],
  },
  {
    category: "AI & Technology",
    icon: "💻",
    queries: ["Hacker coding terminal", "Artificial intelligence neural", "Futuristic neon city", "Cyberpunk data"],
  },
  {
    category: "Finance & Crypto",
    icon: "📈",
    queries: ["Stock market crash red", "Crypto trading chart", "Luxury sports car", "Gold vault wealth"],
  },
  {
    category: "Creator & Lifestyle",
    icon: "🎙️",
    queries: ["Podcast studio microphone", "Aesthetic coffee desk", "Modern office meeting", "Fitness training gym"],
  },
  {
    category: "Cinematic Drone & Travel",
    icon: "🌆",
    queries: ["Drone skyline sunset", "Moody mountain fog", "Highway traffic neon", "Ocean waves aerial"],
  },
];

export default function BRollPage() {
  const { status } = useAuthGate();
  const router = useRouter();

  // Search State
  const [requirementQuery, setRequirementQuery] = useState("cinematic city drone");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [videos, setVideos] = useState<BRollVideoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredVideoId, setHoveredVideoId] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [previewingVideo, setPreviewingVideo] = useState<BRollVideoItem | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const fetchBRoll = useCallback(
    async (queryText: string, orient: "portrait" | "landscape") => {
      if (!queryText.trim()) return;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/broll/search?query=${encodeURIComponent(queryText)}&orientation=${orient}&per_page=16`
        );
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to fetch B-roll footage.");
        }

        setVideos(data.videos || []);
      } catch (err: any) {
        setError(err.message || "Failed to search B-roll footage. Please try another query.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    let ignore = false;
    async function loadInitial() {
      if (!ignore) {
        await fetchBRoll("cinematic city drone", orientation);
      }
    }
    void loadInitial();
    return () => {
      ignore = true;
    };
  }, [fetchBRoll, orientation]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (requirementQuery.trim()) {
      fetchBRoll(requirementQuery.trim(), orientation);
    }
  }

  function handleSelectTag(tag: string) {
    setRequirementQuery(tag);
    fetchBRoll(tag, orientation);
  }

  function handleCopyLink(url: string) {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2500);
  }

  if (status !== "authed") {
    return <AuthLoadingScreen label="Loading B-Roll Studio…" />;
  }

  return (
    <StudioShell active="broll">
      <div className="max-w-7xl mx-auto w-full py-6 space-y-6">
        {/* Top Header Card */}
        <div className="p-6 sm:p-8 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                <span className="text-[11px] font-mono uppercase font-semibold tracking-wider text-slate-500">
                  Visual Assets &amp; Cutaways
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight font-heading">
                B-roll Library
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 max-w-2xl mt-1.5 leading-relaxed">
                Search, preview and download stock footage.
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <Link
                href="/create"
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs sm:text-sm flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Create Video</span>
              </Link>
              <Link
                href="/projects"
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs sm:text-sm flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
              >
                <Video className="w-3.5 h-3.5" />
                <span>Projects</span>
              </Link>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mt-6 pt-6 border-t border-slate-100">
            <form onSubmit={handleSearchSubmit} className="relative w-full">
              <div className="relative flex items-center">
                <Search className="absolute left-4 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={requirementQuery}
                  onChange={(e) => setRequirementQuery(e.target.value)}
                  placeholder="Describe your scene cutaway (e.g. 'luxury sports car accelerating', 'stock chart crash', 'coding dark room')..."
                  className="w-full pl-11 pr-32 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-slate-900 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 transition-all font-sans"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="absolute right-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {loading ? "Searching..." : "Find Cutaways"}
                </button>
              </div>
            </form>

            {/* Quick Requirement Chips */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mr-1">
                Suggested:
              </span>
              {REQUIREMENT_CATEGORIES.flatMap((cat) => cat.queries).slice(0, 8).map((q) => {
                const isSelected = requirementQuery.toLowerCase() === q.toLowerCase();
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleSelectTag(q)}
                    className={`text-xs px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-slate-900 border-slate-900 text-white font-medium shadow-xs"
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900"
                    }`}
                  >
                    {q}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Filter & Aspect Ratio Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200/80 p-4 rounded-2xl shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Framing:</span>
            </span>
            <div className="inline-flex flex-wrap rounded-xl bg-slate-100 p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setOrientation("portrait");
                  fetchBRoll(requirementQuery, "portrait");
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                  orientation === "portrait"
                    ? "bg-white text-slate-900 shadow-xs font-semibold"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <span>📱</span>
                <span>9:16 Vertical (Reels / TikTok)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setOrientation("landscape");
                  fetchBRoll(requirementQuery, "landscape");
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                  orientation === "landscape"
                    ? "bg-white text-slate-900 shadow-xs font-semibold"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <span>🖥️</span>
                <span>16:9 Landscape (YouTube)</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
            <span>High-Def Stock Library</span>
            <span>•</span>
            <span className="text-emerald-600 font-bold">{videos.length} Assets Found</span>
          </div>
        </div>

        {/* Category Explorer */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {REQUIREMENT_CATEGORIES.map((cat) => (
            <div
              key={cat.category}
              className="p-4 rounded-2xl bg-white border border-slate-200/80 space-y-2.5 shadow-2xs hover:border-slate-300 transition-colors"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                <span>{cat.icon}</span>
                <span className="truncate">{cat.category}</span>
              </div>
              <div className="flex flex-col gap-1">
                {cat.queries.slice(0, 3).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleSelectTag(q)}
                    className="text-left text-[11px] text-slate-500 hover:text-blue-600 truncate py-0.5 transition-colors cursor-pointer"
                  >
                    ↳ {q}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button
              onClick={() => setError(null)}
              className="text-rose-500 hover:text-rose-800 font-mono text-xs cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {videos.length>0&&!loading&&<p className="text-sm text-slate-500">Videos provided by <a href="https://www.pexels.com" target="_blank" rel="noreferrer" className="underline">Pexels</a></p>}
        {/* Video Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-base text-slate-900 flex items-center gap-2">
              <span>Matching Cutaways</span>
              <span className="text-xs font-mono text-slate-400 font-normal">
                ({requirementQuery})
              </span>
            </h3>
            {loading && (
              <span className="text-xs font-mono text-blue-600 animate-pulse">
                Fetching high-definition cutaways…
              </span>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className={`rounded-2xl bg-slate-200/60 animate-pulse border border-slate-200 ${
                    orientation === "portrait" ? "aspect-[9/16]" : "aspect-[16/9]"
                  }`}
                />
              ))}
            </div>
          ) : videos.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-white border border-slate-200/80 space-y-3 shadow-2xs">
              <span className="text-3xl">🔍</span>
              <h4 className="text-sm font-bold text-slate-900">No B-Roll found for this requirement</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Try searching for broader keywords like &ldquo;drone&rdquo;, &ldquo;coding&rdquo;, &ldquo;office&rdquo;, or &ldquo;luxury&rdquo;.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {videos.map((vid) => {
                const isHovered = hoveredVideoId === vid.id;
                return (
                  <motion.div
                    key={vid.id}
                    onMouseEnter={() => setHoveredVideoId(vid.id)}
                    onMouseLeave={() => setHoveredVideoId(null)}
                    className={`group relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-200 hover:border-slate-400 hover:shadow-md flex flex-col justify-between transition-all ${
                      orientation === "portrait" ? "aspect-[9/16]" : "aspect-[16/9]"
                    }`}
                  >
                    {/* Video Player / Thumbnail */}
                    {isHovered && vid.videoUrl ? (
                      <video
                        src={vid.videoUrl}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="absolute inset-0 w-full h-full object-cover z-0"
                      />
                    ) : (
                      <img
                        src={vid.thumbnail}
                        alt={vid.title || "B-roll cutaway"}
                        className="absolute inset-0 w-full h-full object-cover z-0 transition-transform duration-500 group-hover:scale-105"
                      />
                    )}

                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/50 z-10 pointer-events-none" />

                    {/* Top Badges */}
                    <div className="relative z-20 p-3 flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/10 text-white">
                        {vid.duration ? `${vid.duration}s` : "HD"}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyLink(vid.videoUrl);
                        }}
                        className="text-[10px] font-mono bg-black/60 hover:bg-black/90 text-slate-300 hover:text-white px-2 py-0.5 rounded-full border border-white/10 transition-colors cursor-pointer flex items-center gap-1"
                      >
                        {copiedUrl === vid.videoUrl ? (
                          <>
                            <Check className="w-2.5 h-2.5 text-emerald-400" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-2.5 h-2.5" />
                            <span>Link</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Bottom Details & Actions */}
                    <div className="relative z-20 p-3 space-y-2">
                      <div className="text-[11px] font-medium text-slate-200 line-clamp-1">
                        By {vid.creatorName}
                      </div>

                      <div className="grid grid-cols-1 gap-1.5">




                        <button
                          type="button"
                          onClick={() => setPreviewingVideo(vid)}
                          className="py-1.5 px-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[10px] font-medium text-center transition-all cursor-pointer border border-white/10"
                        >
                          Preview
                        </button>
                      </div>
                      <BRollDownloadButton url={vid.videoUrl} name={`broll-${vid.id}-${vid.title || "broll"}`} className="w-full py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-[11px] font-medium flex items-center justify-center gap-1.5 disabled:opacity-50" />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Video Full Modal Preview */}
        <AnimatePresence>
          {previewingVideo && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xl p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 font-heading">B-Roll Cutaway Preview</h3>
                    <p className="text-xs text-slate-500">Attribution: {previewingVideo.creatorName}</p>
                  </div>
                  <button
                    onClick={() => setPreviewingVideo(null)}
                    className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="relative aspect-video rounded-2xl overflow-hidden bg-black flex items-center justify-center shadow-inner">
                  <video
                    src={previewingVideo.videoUrl}
                    controls
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <BRollDownloadButton key={previewingVideo.id} url={previewingVideo.videoUrl} name={`broll-${previewingVideo.id}-${previewingVideo.title || "broll"}`} className="text-xs font-medium text-slate-700 hover:text-slate-900 flex items-center gap-1.5 disabled:opacity-50" />

                  <div className="flex items-center gap-2">



                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>


    </StudioShell>
  );
}
