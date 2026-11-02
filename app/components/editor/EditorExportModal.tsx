"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { VeeloxTimelineProject, AspectRatio } from "@/app/lib/timeline/types";
import { exportToSRT, exportToVTT, exportToASS } from "@/app/lib/captions/subtitlesParser";

export interface RenderJobState {
  jobId: string;
  status: "idle" | "queued" | "processing" | "completed" | "failed";
  progress: number; // 0 to 100
  outputUrl?: string;
  error?: string;
  duration?: number;
  aspectRatio?: string;
}

export type SocialExportPreset =
  | "tiktok"
  | "reels"
  | "shorts"
  | "youtube"
  | "instagram_square"
  | "custom";

interface EditorExportModalProps {
  isOpen: boolean;
  jobState: RenderJobState;
  timeline: VeeloxTimelineProject;
  onClose: () => void;
  onStartRender: (settings: {
    resolution: { width: number; height: number };
    fps: number;
    quality: "low" | "medium" | "high";
    aspectRatio: AspectRatio;
  }) => void;
  onRetry: () => void;
  onCreateAnother: () => void;
}

export default function EditorExportModal({
  isOpen,
  jobState,
  timeline,
  onClose,
  onStartRender,
  onRetry,
  onCreateAnother,
}: EditorExportModalProps) {
  // Preset selection
  const [selectedPreset, setSelectedPreset] = useState<SocialExportPreset>("shorts");
  const [resolutionPreset, setResolutionPreset] = useState<"720p" | "1080p" | "1440p" | "4k">("1080p");
  const [fps, setFps] = useState<24 | 30 | 60>(30);
  const [quality, setQuality] = useState<"low" | "medium" | "high">("high");

  if (!isOpen) return null;

  const isRendering =
    jobState.status === "queued" || jobState.status === "processing";
  const isCompleted = jobState.status === "completed" && Boolean(jobState.outputUrl);
  const isFailed = jobState.status === "failed";
  const isConfiguring = !isRendering && !isCompleted && !isFailed;

  // Handle Preset selection
  function handleSelectPreset(preset: SocialExportPreset) {
    setSelectedPreset(preset);
    if (preset === "shorts" || preset === "reels" || preset === "tiktok") {
      setResolutionPreset("1080p");
      setFps(30);
      setQuality("high");
    } else if (preset === "youtube") {
      setResolutionPreset("1080p");
      setFps(60);
      setQuality("high");
    } else if (preset === "instagram_square") {
      setResolutionPreset("1080p");
      setFps(30);
    }
  }

  // Export Audio Only (download voiceover/music mix or voiceover audio)
  function handleExportAudioOnly() {
    const voTrack = timeline.tracks.find((t) => t.type === "voiceover");
    const musTrack = timeline.tracks.find((t) => t.type === "music");
    const audioUrl = voTrack?.items?.[0]?.source || musTrack?.items?.[0]?.source;
    if (audioUrl) {
      const a = document.createElement("a");
      a.href = audioUrl;
      a.download = `audio_${timeline.title || "export"}.mp3`;
      a.target = "_blank";
      a.click();
    } else {
      alert("No audio track found on timeline to download.");
    }
  }

  // Export Subtitles File (SRT, VTT, or ASS)
  function handleExportSubtitles(format: "srt" | "vtt" | "ass") {
    const captionTrack = timeline.tracks.find((t) => t.type === "captions");
    if (!captionTrack || captionTrack.items.length === 0) {
      alert("No captions found on timeline to export.");
      return;
    }

    const exportable = captionTrack.items.map((c) => ({
      text: c.source,
      startTime: c.startTime,
      endTime: c.endTime,
    }));

    let output = "";
    let mimeType = "text/plain";
    if (format === "srt") {
      output = exportToSRT(exportable);
    } else if (format === "vtt") {
      output = exportToVTT(exportable);
      mimeType = "text/vtt";
    } else if (format === "ass") {
      output = exportToASS(exportable, timeline.resolution.width, timeline.resolution.height);
    }

    const blob = new Blob([output], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subtitles_${timeline.id || "export"}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleStartExport() {
    const res =
      resolutionPreset === "720p"
        ? timeline.aspectRatio === "16:9"
          ? { width: 1280, height: 720 }
          : { width: 720, height: 1280 }
        : resolutionPreset === "1440p"
        ? timeline.aspectRatio === "16:9"
          ? { width: 2560, height: 1440 }
          : { width: 1440, height: 2560 }
        : resolutionPreset === "4k"
        ? timeline.aspectRatio === "16:9"
          ? { width: 3840, height: 2160 }
          : { width: 2160, height: 3840 }
        : timeline.aspectRatio === "16:9"
        ? { width: 1920, height: 1080 }
        : timeline.aspectRatio === "1:1"
        ? { width: 1080, height: 1080 }
        : { width: 1080, height: 1920 };

    onStartRender({
      resolution: res,
      fps,
      quality,
      aspectRatio: timeline.aspectRatio,
    });
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-xl rounded-2xl bg-white border border-slate-200/80 shadow-2xl p-6 overflow-hidden flex flex-col gap-4 text-left"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center text-sm font-bold shadow-xs">
                ⚡
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Kreovar Export Engine</h3>
                <span className="text-[10px] font-mono text-slate-500">
                  {isRendering
                    ? "Server-side compositing in progress..."
                    : isCompleted
                    ? "Render complete ✓"
                    : "Configure export format, resolution, and frame rate"}
                </span>
              </div>
            </div>

            {!isRendering && (
              <button
                type="button"
                onClick={onClose}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-500 hover:text-slate-900 flex items-center justify-center text-xs cursor-pointer transition-colors"
              >
                ✕
              </button>
            )}
          </div>

          {/* 1. CONFIGURATION VIEW */}
          {isConfiguring && (
            <div className="flex flex-col gap-4">
              {/* Social Presets */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold">
                  Social Export Presets
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: "shorts", label: "YouTube Shorts", icon: "🔴" },
                    { id: "reels", label: "Instagram Reels", icon: "📸" },
                    { id: "tiktok", label: "TikTok", icon: "🎵" },
                    { id: "youtube", label: "YouTube 16:9", icon: "▶️" },
                    { id: "instagram_square", label: "Square 1:1", icon: "⏹️" },
                    { id: "custom", label: "Custom Settings", icon: "⚙️" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectPreset(p.id as SocialExportPreset)}
                      className={`p-2 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition-colors ${
                        selectedPreset === p.id
                          ? "bg-slate-900 border-slate-900 text-white shadow-xs font-semibold"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300"
                      }`}
                    >
                      <span>{p.icon}</span>
                      <span className="text-[11px] font-medium truncate">{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Resolution & FPS */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-mono text-slate-400 uppercase">Resolution</label>
                  <div className="grid grid-cols-4 gap-1">
                    {(["720p", "1080p", "1440p", "4k"] as const).map((res) => (
                      <button
                        key={res}
                        type="button"
                        onClick={() => setResolutionPreset(res)}
                        className={`py-1 rounded-lg text-xs font-mono font-medium cursor-pointer transition-colors ${
                          resolutionPreset === res
                            ? "bg-slate-900 text-white shadow-xs font-semibold"
                            : "bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300"
                        }`}
                      >
                        {res}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-mono text-slate-400 uppercase">Frame Rate</label>
                  <div className="grid grid-cols-3 gap-1">
                    {([24, 30, 60] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFps(f)}
                        className={`py-1 rounded-lg text-xs font-mono font-medium cursor-pointer transition-colors ${
                          fps === f
                            ? "bg-slate-900 text-white shadow-xs font-semibold"
                            : "bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300"
                        }`}
                      >
                        {f} FPS
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Codec & Bitrate Specs Banner */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-3 gap-2 text-center text-[10px] font-mono">
                <div>
                  <span className="text-slate-400 block">FORMAT</span>
                  <span className="font-semibold text-slate-800">MP4 (H.264)</span>
                </div>
                <div>
                  <span className="text-slate-400 block">AUDIO</span>
                  <span className="font-semibold text-emerald-600">AAC 192kbps</span>
                </div>
                <div>
                  <span className="text-slate-400 block">ASPECT</span>
                  <span className="font-semibold text-slate-800">{timeline.aspectRatio}</span>
                </div>
              </div>

              {/* Secondary Direct Exports: Audio & Subtitles */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono text-slate-400 uppercase">Other Exports:</span>
                  <button
                    type="button"
                    onClick={handleExportAudioOnly}
                    className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-[10px] font-mono text-slate-700 border border-slate-200 cursor-pointer transition-colors"
                  >
                    🎵 Audio (MP3)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportSubtitles("srt")}
                    className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-[10px] font-mono text-slate-700 border border-slate-200 cursor-pointer transition-colors"
                  >
                    💬 Subtitles (SRT)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportSubtitles("vtt")}
                    className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-[10px] font-mono text-slate-700 border border-slate-200 cursor-pointer transition-colors"
                  >
                    VTT
                  </button>
                </div>
              </div>

              {/* Primary Start Render CTA */}
              <button
                type="button"
                onClick={handleStartExport}
                className="w-full py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-colors"
              >
                <span>⚡</span>
                <span>START VIDEO RENDER (25 Credits)</span>
              </button>
            </div>
          )}

          {/* 2. RENDERING PROGRESS VIEW */}
          {isRendering && (
            <div className="flex flex-col items-center justify-center py-8 gap-5 text-center">
              <div className="relative w-20 h-20 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-slate-200" />
                <div
                  className="absolute inset-0 rounded-full border-4 border-slate-900 border-t-transparent animate-spin"
                  style={{ animationDuration: "1.2s" }}
                />
                <span className="text-sm font-mono font-bold text-slate-900">
                  {jobState.progress}%
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-slate-900">
                  Rendering Video... {jobState.progress}%
                </span>
                <span className="text-xs font-mono text-slate-500">
                  {jobState.progress < 30
                    ? "Downloading B-roll assets and voiceover..."
                    : jobState.progress < 60
                    ? "Applying animations & kinetic subtitle overlays..."
                    : jobState.progress < 90
                    ? "Compositing multi-tracks and sidechain audio ducking..."
                    : "Finalizing H.264 encode and uploading..."}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                <motion.div
                  className="bg-slate-900 h-full rounded-full"
                  animate={{ width: `${Math.max(5, jobState.progress)}%` }}
                  transition={{ ease: "easeInOut", duration: 0.3 }}
                />
              </div>

              <span className="text-[11px] font-mono text-slate-400">
                Job ID: {jobState.jobId.slice(0, 12)}... · Do not close this window
              </span>
            </div>
          )}

          {/* 3. COMPLETED VIEW */}
          {isCompleted && (
            <div className="flex flex-col gap-4">
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                  ✓
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-emerald-900">Your video is ready!</h4>
                  <span className="text-[11px] text-emerald-700">
                    Compiled successfully with H.264 video, AAC audio, and kinetic captions.
                  </span>
                </div>
              </div>

              {/* Video Player */}
              <div className="relative aspect-[9/16] max-h-72 w-full mx-auto rounded-xl overflow-hidden bg-black border border-slate-200 shadow-md">
                <video
                  src={jobState.outputUrl}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                <a
                  href={jobState.outputUrl}
                  download="veelox-video.mp4"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:flex-1 py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-colors"
                >
                  <span>⬇</span>
                  <span>DOWNLOAD VIDEO (MP4)</span>
                </a>

                <button
                  type="button"
                  onClick={onCreateAnother}
                  className="w-full sm:w-auto py-2.5 px-4 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-medium text-xs cursor-pointer transition-colors"
                >
                  Create Another Video
                </button>
              </div>
            </div>
          )}

          {/* 4. FAILED VIEW */}
          {isFailed && (
            <div className="flex flex-col gap-4 py-3">
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3">
                <span className="text-rose-600 text-lg">⚠️</span>
                <div className="flex flex-col gap-1">
                  <h4 className="text-xs font-semibold text-rose-900">Rendering Encountered an Error</h4>
                  <p className="text-[11px] text-rose-700">
                    {jobState.error || "Failed to encode video frames with FFmpeg."}
                  </p>
                  <span className="text-[10px] font-mono text-emerald-600 mt-1 font-medium">
                    ✓ 25 credits have been automatically refunded to your balance.
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-medium text-slate-700 cursor-pointer transition-colors"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={onRetry}
                  className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-medium text-white shadow-xs cursor-pointer transition-colors"
                >
                  Retry Render
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
