"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { BRollVideoItem } from "@/app/api/broll/search/route";
import BRollDownloadButton from "../BRollDownloadButton";

interface BRollManagerProps {
  initialQuery?: string;
  activeVideoUrl?: string | null;
  onSelectVideo: (videoUrl: string, title?: string) => void;
  authToken?: string | null;
}

const QUICK_TAGS = [
  "Technology",
  "Business",
  "AI Coding",
  "City Drone",
  "Cyberpunk",
  "Luxury",
  "Office",
  "Nature",
  "Abstract",
];

export default function BRollManager({
  initialQuery = "technology",
  activeVideoUrl,
  onSelectVideo,
  authToken,
}: BRollManagerProps) {
  const [activeTab, setActiveTab] = useState<"pexels" | "upload" | "library">("pexels");
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [stockVideos, setStockVideos] = useState<BRollVideoItem[]>([]);
  const [loadingPexels, setLoadingPexels] = useState(false);
  const [pexelsError, setPexelsError] = useState<string | null>(null);

  // Upload State
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedVideos, setUploadedVideos] = useState<BRollVideoItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch Pexels stock videos
  const searchPexels = useCallback(async (term: string) => {
    setLoadingPexels(true);
    setPexelsError(null);
    try {
      const res = await fetch(
        `/api/broll/search?query=${encodeURIComponent(term)}&orientation=portrait&per_page=12`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load stock videos");
      }
      setStockVideos(data.videos || []);
    } catch (err: any) {
      setPexelsError(err.message || "Failed to search stock footage.");
    } finally {
      setLoadingPexels(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function init() {
      if (!ignore) {
        await searchPexels(initialQuery);
      }
    }
    void init();
    return () => {
      ignore = true;
    };
  }, [initialQuery, searchPexels]);

  // Video File Upload Handler
  async function handleFileUpload(file: File) {
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const headers: Record<string, string> = {};
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      const res = await fetch("/api/media/upload", {
        method: "POST",
        headers,
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to upload video.");
      }

      const newVideo: BRollVideoItem = {
        id: data.video.id,
        title: file.name,
        thumbnail: "",
        videoUrl: data.video.videoUrl,
        duration: 0,
        width: 1080,
        height: 1920,
        creatorName: "You",
        creatorUrl: "#",
        source: "upload",
      };

      setUploadedVideos((prev) => [newVideo, ...prev]);
      onSelectVideo(data.video.videoUrl, file.name);
    } catch (err: any) {
      setUploadError(err.message || "Upload failed. Please try a smaller video clip.");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      void handleFileUpload(e.dataTransfer.files[0]);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header & Mode Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <span>🎬</span>
            <span>Visual B-Roll &amp; Video Footage</span>
          </h3>
          <p className="text-xs text-slate-500 font-sans mt-0.5">
            Search vertical stock clips or upload your own raw footage cutaways.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("pexels")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "pexels"
                ? "bg-slate-900 text-white shadow-xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>🔍 Stock B-Roll</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("upload")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "upload"
                ? "bg-slate-900 text-white shadow-xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>📤 Upload Video</span>
          </button>

          {uploadedVideos.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab("library")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === "library"
                  ? "bg-slate-900 text-white shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>📁 My Clips ({uploadedVideos.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Selected Video Banner */}
      {activeVideoUrl && (
        <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-blue-900 font-medium">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            <span>Active Background Video Assigned &amp; Synchronized with Preview</span>
          </div>
          <button
            type="button"
            onClick={() => onSelectVideo("")}
            className="text-[11px] font-mono text-slate-500 hover:text-rose-600 cursor-pointer"
          >
            ✕ Remove Video
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: PEXELS STOCK B-ROLL SEARCH */}
      {/* ========================================================================= */}
      {activeTab === "pexels" && (
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                🔍
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void searchPexels(searchQuery)}
                placeholder="Search vertical stock clips (e.g. AI, cyber, drone, business)..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-slate-900 text-xs sm:text-sm text-slate-900 focus:outline-none transition-colors"
              />
            </div>
            <button
              type="button"
              onClick={() => void searchPexels(searchQuery)}
              disabled={loadingPexels}
              className="px-4 py-2.5 rounded-xl font-medium text-xs bg-slate-900 hover:bg-slate-800 text-white transition-all cursor-pointer shrink-0 disabled:opacity-50 shadow-xs"
            >
              {loadingPexels ? "Searching..." : "Search"}
            </button>
          </div>

          {/* Quick Keyword Pills */}
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] font-mono uppercase text-slate-400 mr-1">Trending:</span>
            {QUICK_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  setSearchQuery(tag);
                  void searchPexels(tag);
                }}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-[11px] font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer shadow-2xs"
              >
                {tag}
              </button>
            ))}
          </div>

          {pexelsError && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              ⚠️ {pexelsError}
            </div>
          )}

          {/* Video Grid */}
          {loadingPexels ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 py-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[9/16] rounded-2xl bg-slate-200/60 border border-slate-200 animate-pulse"
                />
              ))}
            </div>
          ) : stockVideos.length === 0 ? (
            <div className="p-10 rounded-2xl bg-white border border-dashed border-slate-200 text-center text-slate-500 text-xs">
              No stock videos found for &quot;{searchQuery}&quot;. Try a different keyword or upload your video!
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {stockVideos.map((video) => {
                const isSelected = activeVideoUrl === video.videoUrl;

                return (
                  <motion.div
                    key={video.id}
                    whileHover={{ scale: 1.02 }}
                    className={`group relative aspect-[9/16] rounded-2xl overflow-hidden border transition-all cursor-pointer bg-slate-900 shadow-2xs ${
                      isSelected
                        ? "border-slate-900 ring-2 ring-slate-900"
                        : "border-slate-200 hover:border-slate-400 hover:shadow-md"
                    }`}
                    onClick={() => onSelectVideo(video.videoUrl, video.title)}
                  >
                    {/* Video thumbnail with hover preview */}
                    <img
                      src={video.thumbnail}
                      alt={video.title || "Stock B-roll"}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />

                    {/* Duration badge */}
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-sm border border-white/10 text-[10px] font-mono text-white">
                      ⏱ {video.duration}s
                    </div>

                    {/* Selected badge */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-slate-900 text-white font-bold text-[10px] font-mono shadow-xs border border-white/20">
                        ✓ ACTIVE
                      </div>
                    )}

                    {/* Bottom overlay with creator credit & action */}
                    <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col justify-end">
                      <span className="text-[10px] font-mono text-slate-300 truncate mb-1">
                        By {video.creatorName}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectVideo(video.videoUrl, video.title);
                        }}
                        className={`w-full py-1.5 rounded-lg text-[10px] font-medium uppercase tracking-wider transition-all cursor-pointer ${
                          isSelected
                            ? "bg-slate-900 text-white"
                            : "bg-white/90 hover:bg-white text-slate-900"
                        }`}
                      >
                        {isSelected ? "✓ Active Background" : "Select B-Roll"}
                      </button>
                      <BRollDownloadButton url={video.videoUrl} name={`broll-${video.id}-${video.title || "broll"}`} authToken={authToken} className="mt-1 w-full py-1.5 rounded-lg text-[10px] font-medium bg-white/20 text-white flex items-center justify-center gap-1 disabled:opacity-50" />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: UPLOAD USER VIDEO */}
      {/* ========================================================================= */}
      {activeTab === "upload" && (
        <div className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                void handleFileUpload(e.target.files[0]);
              }
            }}
          />

          {/* Drag & Drop Upload Zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="p-10 rounded-2xl bg-[#0D0F15] border-2 border-dashed border-[#202534] hover:border-sky-500/50 transition-all text-center flex flex-col items-center justify-center gap-3 cursor-pointer group"
          >
            <div className="w-14 h-14 rounded-2xl bg-[#12151E] group-hover:bg-sky-500/10 border border-[#202534] group-hover:border-sky-500/30 flex items-center justify-center text-2xl transition-all">
              {uploading ? (
                <span className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                "🎥"
              )}
            </div>

            <div>
              <h4 className="font-heading font-bold text-sm text-white mb-1">
                {uploading ? "Uploading Video Footage to Cloud..." : "Drag and drop your video file here"}
              </h4>
              <p className="text-xs text-slate-400 font-sans max-w-sm">
                Supports MP4, WebM, and MOV formats up to 100MB. Uploaded footage is securely saved in your cloud storage.
              </p>
            </div>

            <button
              type="button"
              disabled={uploading}
              className="px-5 py-2 rounded-full font-bold text-xs uppercase tracking-wider bg-white hover:bg-slate-100 text-zinc-950 transition-all cursor-pointer disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Browse Video Files"}
            </button>
          </div>

          {uploadError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              ⚠️ {uploadError}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: USER'S UPLOADED CLIPS LIBRARY */}
      {/* ========================================================================= */}
      {activeTab === "library" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {uploadedVideos.map((clip) => {
              const isSelected = activeVideoUrl === clip.videoUrl;

              return (
                <div
                  key={clip.id}
                  className={`aspect-[9/16] rounded-2xl overflow-hidden border transition-all cursor-pointer relative bg-zinc-950 ${
                    isSelected ? "border-sky-400" : "border-[#202534] hover:border-slate-700"
                  }`}
                  onClick={() => onSelectVideo(clip.videoUrl, clip.title)}
                >
                  <video
                    src={clip.videoUrl}
                    className="w-full h-full object-cover"
                    muted
                    loop
                    playsInline
                  />

                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-zinc-950/80 backdrop-blur-sm text-[10px] font-mono text-white">
                    User Footage
                  </div>

                  <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black to-transparent">
                    <span className="text-[11px] font-sans font-bold text-white block truncate mb-1">
                      {clip.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectVideo(clip.videoUrl, clip.title)}
                      className={`w-full py-1 rounded text-[10px] font-mono font-bold uppercase ${
                        isSelected ? "bg-sky-500 text-white" : "bg-white text-zinc-950"
                      }`}
                    >
                      {isSelected ? "Active" : "Select"}
                    </button>
                    <BRollDownloadButton url={clip.videoUrl} name={clip.title || "veelox-footage"} authToken={authToken} className="mt-1 w-full py-1 rounded text-[10px] font-medium bg-white/20 text-white flex items-center justify-center gap-1 disabled:opacity-50" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
