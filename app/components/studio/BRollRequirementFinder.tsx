"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { BRollVideoItem } from "@/app/api/broll/search/route";

interface BRollRequirementFinderProps {
  rawVideoUrl?: string | null;
  onSelectCutaway: (videoUrl: string, title?: string) => void;
  activeVideoUrl?: string | null;
}

const REQUIREMENT_PRESETS = [
  { label: "⚡ Hook Shock", query: "Shocked face reaction" },
  { label: "💻 Hacker Code", query: "Hacker coding terminal" },
  { label: "📈 Market Drop", query: "Stock market crash chart" },
  { label: "🌆 Sunset Drone", query: "Drone city skyline sunset" },
  { label: "💸 Money Fall", query: "Cash money falling" },
  { label: "🏎️ Supercar", query: "Luxury sports car speed" },
  { label: "🎙️ Studio Mic", query: "Podcast microphone neon" },
  { label: "📱 Phone Scroll", query: "Smartphone scrolling hand" },
];

export default function BRollRequirementFinder({
  rawVideoUrl,
  onSelectCutaway,
  activeVideoUrl,
}: BRollRequirementFinderProps) {
  const [requirementQuery, setRequirementQuery] = useState("cinematic city drone");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [videos, setVideos] = useState<BRollVideoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [previewModalVideo, setPreviewModalVideo] = useState<BRollVideoItem | null>(null);
  const [selectedCutaways, setSelectedCutaways] = useState<Array<{ id: string; title: string; url: string }>>([]);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const fetchRequirementBRoll = useCallback(
    async (queryText: string, orient: "portrait" | "landscape") => {
      if (!queryText.trim()) return;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/broll/search?query=${encodeURIComponent(queryText)}&orientation=${orient}&per_page=12`
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to search B-roll footage.");
        }
        setVideos(data.videos || []);
      } catch (err: any) {
        setError(err.message || "Failed to search B-roll for this requirement.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    let ignore = false;
    async function init() {
      if (!ignore) {
        await fetchRequirementBRoll("cinematic city drone", orientation);
      }
    }
    void init();
    return () => {
      ignore = true;
    };
  }, [fetchRequirementBRoll, orientation]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (requirementQuery.trim()) {
      fetchRequirementBRoll(requirementQuery.trim(), orientation);
    }
  }

  function handleTagClick(tagQuery: string) {
    setRequirementQuery(tagQuery);
    fetchRequirementBRoll(tagQuery, orientation);
  }

  function handleAddCutaway(vid: BRollVideoItem) {
    onSelectCutaway(vid.videoUrl, vid.title || requirementQuery);
    setSelectedCutaways((prev) => {
      if (prev.some((c) => c.url === vid.videoUrl)) return prev;
      return [...prev, { id: vid.id, title: requirementQuery, url: vid.videoUrl }];
    });
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              <span className="text-[11px] font-mono uppercase font-bold tracking-wider text-slate-500">
                SCENE REQUIREMENT B-ROLL FINDER
              </span>
            </div>
            <h3 className="font-heading text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Search B-Roll Cutaways by Narrative Requirement
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">
              Type what visual you need for your cutaway scenes (e.g. dramatic crypto crash, luxury yacht, or hacker coding).
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/broll"
              target="_blank"
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 hover:text-slate-900 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <span>🔍</span>
              <span>Full B-Roll Page ↗</span>
            </Link>
          </div>
        </div>

        {/* Dedicated Requirement Search Bar */}
        <form onSubmit={handleSearchSubmit} className="relative w-full">
          <div className="relative flex items-center">
            <span className="absolute left-4 text-base text-slate-400 pointer-events-none">
              🔍
            </span>
            <input
              ref={searchInputRef}
              type="text"
              value={requirementQuery}
              onChange={(e) => setRequirementQuery(e.target.value)}
              placeholder="Search B-roll requirement (e.g. 'crypto crash red chart', 'hacker terminal coding', 'drone sunset city')..."
              className="w-full pl-11 pr-28 sm:pr-32 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-slate-900 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 transition-all font-sans"
            />
            <button
              type="submit"
              disabled={loading}
              className="absolute right-2 px-3.5 sm:px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? "Searching…" : "Find B-Roll"}
            </button>
          </div>
        </form>

        {/* Quick Requirement Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mr-1">
            Scene Presets:
          </span>
          {REQUIREMENT_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => handleTagClick(preset.query)}
              className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                requirementQuery.toLowerCase() === preset.query.toLowerCase()
                  ? "bg-slate-900 border-slate-900 text-white font-medium shadow-xs"
                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Selected Cutaways Tray (if any chosen) */}
      {selectedCutaways.length > 0 && (
        <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-blue-900 font-bold">🎬 Attached Cutaways ({selectedCutaways.length}):</span>
            <div className="flex flex-wrap gap-1.5">
              {selectedCutaways.map((c) => (
                <span
                  key={c.url}
                  className="px-2 py-0.5 rounded-full bg-blue-100 border border-blue-200 text-blue-800 text-[10px] font-mono font-medium"
                >
                  {c.title}
                </span>
              ))}
            </div>
          </div>
          {rawVideoUrl && (
            <button
              type="button"
              onClick={() => onSelectCutaway(rawVideoUrl, "Original Raw Footage")}
              className="text-xs font-mono text-slate-600 hover:text-slate-900 underline cursor-pointer shrink-0"
            >
              Reset to Raw Footage
            </button>
          )}
        </div>
      )}

      {/* Orientation & Stats Controls */}
      <div className="flex items-center justify-between text-xs px-1">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-medium text-[11px]">Format:</span>
          <div className="inline-flex rounded-lg bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setOrientation("portrait");
                fetchRequirementBRoll(requirementQuery, "portrait");
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                orientation === "portrait"
                  ? "bg-white text-slate-900 shadow-xs font-semibold"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              📱 9:16 Vertical
            </button>
            <button
              type="button"
              onClick={() => {
                setOrientation("landscape");
                fetchRequirementBRoll(requirementQuery, "landscape");
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                orientation === "landscape"
                  ? "bg-sky-500 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              🖥️ 16:9 Landscape
            </button>
          </div>
        </div>

        <span className="text-slate-400 font-mono text-[11px]">
          {loading ? "Searching…" : `${videos.length} B-Roll clips ready`}
        </span>
      </div>

      {/* Error alert */}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          ⚠️ {error}
        </div>
      )}

      {/* Video Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className={`rounded-2xl bg-[#12151E] animate-pulse border border-[#202534] ${
                orientation === "portrait" ? "aspect-[9/16]" : "aspect-[16/9]"
              }`}
            />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-2">
          <span className="text-2xl">🔍</span>
          <p className="text-xs text-slate-300 font-medium">No cutaways found for this requirement.</p>
          <p className="text-[11px] text-slate-500">Try broader terms like &ldquo;car&rdquo;, &ldquo;city&rdquo;, &ldquo;coding&rdquo;, or &ldquo;money&rdquo;.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {videos.map((vid) => {
            const isHovered = hoveredId === vid.id;
            const isCurrentActive = activeVideoUrl === vid.videoUrl;

            return (
              <motion.div
                key={vid.id}
                onMouseEnter={() => setHoveredId(vid.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`group relative rounded-2xl overflow-hidden bg-[#10131B] border transition-all ${
                  isCurrentActive
                    ? "border-emerald-500 ring-2 ring-emerald-500/30"
                    : "border-[#202534] hover:border-sky-500/60"
                } ${orientation === "portrait" ? "aspect-[9/16]" : "aspect-[16/9]"}`}
              >
                {/* Media Thumbnail or Live Hover Video */}
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
                    alt={vid.title || "Cutaway"}
                    className="absolute inset-0 w-full h-full object-cover z-0 transition-transform duration-300 group-hover:scale-105"
                  />
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/50 z-10 pointer-events-none" />

                {/* Top Badges */}
                <div className="relative z-20 p-2.5 flex items-center justify-between">
                  <span className="text-[9px] font-mono font-bold bg-black/60 px-1.5 py-0.5 rounded text-white">
                    {vid.duration ? `${vid.duration}s` : "HD"}
                  </span>
                  {isCurrentActive && (
                    <span className="text-[9px] font-mono font-bold bg-emerald-500 text-zinc-950 px-1.5 py-0.5 rounded shadow">
                      Active ✓
                    </span>
                  )}
                </div>

                {/* Bottom Actions */}
                <div className="relative z-20 p-2.5 space-y-1.5">
                  <div className="text-[10px] text-slate-300 truncate">
                    By {vid.creatorName}
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleAddCutaway(vid)}
                      className="flex-1 py-1.5 px-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-[10px] transition-colors cursor-pointer shadow-sm flex items-center justify-center gap-1"
                    >
                      <span>🎬</span>
                      <span>{isCurrentActive ? "Selected" : "Use Cutaway"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewModalVideo(vid)}
                      className="py-1.5 px-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-semibold text-[10px] transition-colors cursor-pointer"
                    >
                      👁️
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Video Preview Modal */}
      <AnimatePresence>
        {previewModalVideo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-xl bg-[#0D0F15] border border-[#202534] rounded-3xl overflow-hidden shadow-2xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">Cutaway Preview</h4>
                  <p className="text-xs text-slate-400">Creator: {previewModalVideo.creatorName}</p>
                </div>
                <button
                  onClick={() => setPreviewModalVideo(null)}
                  className="p-1.5 rounded-lg bg-[#1A1F2C] text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="relative aspect-video rounded-xl overflow-hidden bg-black flex items-center justify-center">
                <video
                  src={previewModalVideo.videoUrl}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    handleAddCutaway(previewModalVideo);
                    setPreviewModalVideo(null);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs transition-colors cursor-pointer shadow-md"
                >
                  Apply Cutaway to Studio
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
