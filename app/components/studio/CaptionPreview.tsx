"use client";

import React, { useRef, useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CaptionPresetId,
  CaptionPosition,
  CaptionSegment,
  CAPTION_PRESETS,
} from "@/app/lib/captions/presets";

interface CaptionPreviewProps {
  audioUrl?: string;
  videoUrl?: string | null;
  onVideoChange?: (videoUrl: string | null, title?: string) => void;
  segments: CaptionSegment[];
  activePresetId: CaptionPresetId;
  onPresetChange: (presetId: CaptionPresetId) => void;
  captionPosition?: CaptionPosition;
  onPositionChange?: (position: CaptionPosition) => void;
  currentTime: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onRestart: () => void;
  onTimeUpdate?: (time: number) => void;
  duration?: number;
  onDurationChange?: (duration: number) => void;
  onOpenBRollSelector?: () => void;
  authToken?: string | null;
}

export default function CaptionPreview({
  audioUrl,
  videoUrl,
  onVideoChange,
  segments,
  activePresetId,
  onPresetChange,
  captionPosition = "center",
  onPositionChange,
  currentTime,
  isPlaying,
  onTogglePlay,
  onRestart,
  onTimeUpdate,
  duration = 0,
  onDurationChange,
  onOpenBRollSelector,
  authToken,
}: CaptionPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [videoDuration, setVideoDuration] = useState<number>(duration || 0);

  const preset = CAPTION_PRESETS[activePresetId] || CAPTION_PRESETS.clean;

  // Sync background video element play/pause
  useEffect(() => {
    if (!videoElRef.current) return;
    if (isPlaying) {
      videoElRef.current.play().catch(() => {});
    } else {
      videoElRef.current.pause();
    }
  }, [isPlaying]);

  // Sync seek/currentTime changes to video element
  useEffect(() => {
    if (videoElRef.current && Math.abs(videoElRef.current.currentTime - currentTime) > 0.3) {
      videoElRef.current.currentTime = currentTime;
    }
  }, [currentTime]);

  // High-precision playback clock: drives currentTime when video is playing or in ticker mode
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      if (videoElRef.current && !videoElRef.current.paused) {
        const ct = videoElRef.current.currentTime;
        onTimeUpdate?.(Number(ct.toFixed(2)));
      } else if (!videoUrl && !audioUrl) {
        // Fallback ticker if neither video nor audio is attached
        const maxDur = videoDuration > 0 ? videoDuration : (segments[segments.length - 1]?.end || 20);
        const nextTime = Number((currentTime + 0.08).toFixed(2));
        if (nextTime >= maxDur) {
          onTimeUpdate?.(0);
          onTogglePlay();
        } else {
          onTimeUpdate?.(nextTime);
        }
      }
    }, 60);

    return () => clearInterval(interval);
  }, [isPlaying, videoUrl, audioUrl, currentTime, videoDuration, segments, onTimeUpdate, onTogglePlay]);

  // Handle Video Upload directly from preview
  async function handleVideoUpload(file: File) {
    if (!file) return;

    const validMimes = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/ogg"];
    if (!validMimes.includes(file.type) && !file.name.match(/\.(mp4|webm|mov|mkv|avi)$/i)) {
      setUploadError("Please upload an MP4, WebM, or MOV video file.");
      return;
    }

    setIsUploading(true);
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

      if (data.video?.videoUrl && onVideoChange) {
        onVideoChange(data.video.videoUrl, file.name);
      }
    } catch (err: any) {
      setUploadError(err?.message || "Failed to upload video.");
    } finally {
      setIsUploading(false);
    }
  }

  // Drag and Drop handlers
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      void handleVideoUpload(file);
    }
  }

  // Robust active subtitle segment matching
  const activeSegment = useMemo(() => {
    if (!segments || segments.length === 0) return null;

    // 1. Direct timestamp match
    const exact = segments.find(
      (seg) => currentTime >= seg.start && currentTime <= seg.end
    );
    if (exact) return exact;

    // 2. Tolerance gap match: if currentTime is between segment and next segment
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const nextSeg = segments[i + 1];
      if (currentTime >= seg.start && (!nextSeg || currentTime < nextSeg.start)) {
        return seg;
      }
    }

    // 3. Before first segment
    if (currentTime < segments[0].start) {
      return segments[0];
    }

    // 4. Default to last segment
    return segments[segments.length - 1];
  }, [segments, currentTime]);

  // Robust word list generation (handles empty/missing word arrays seamlessly)
  const displayWords = useMemo(() => {
    if (!activeSegment) return [];
    if (Array.isArray(activeSegment.words) && activeSegment.words.length > 0) {
      return activeSegment.words;
    }

    // Fallback: split text into words and assign proportional timestamps
    const rawWords = activeSegment.text.trim().split(/\s+/).filter(Boolean);
    const segDur = Math.max(0.4, activeSegment.end - activeSegment.start);
    const wordDur = segDur / Math.max(1, rawWords.length);

    return rawWords.map((word, idx) => ({
      word,
      start: Number((activeSegment.start + idx * wordDur).toFixed(2)),
      end: Number((activeSegment.start + (idx + 1) * wordDur).toFixed(2)),
    }));
  }, [activeSegment]);

  // Position class for vertical layout
  const positionClass =
    captionPosition === "top"
      ? "top-[18%]"
      : captionPosition === "bottom"
      ? "bottom-[22%]"
      : "top-[48%] -translate-y-1/2";

  // Scaled responsive font sizes for standard 310px preview container
  const scaledFontSize =
    preset.id === "creator"
      ? "21px"
      : preset.id === "bold"
      ? "20px"
      : preset.id === "highlight"
      ? "18px"
      : preset.id === "clean"
      ? "16px"
      : "14px";

  const totalEffectiveDuration =
    videoDuration > 0
      ? videoDuration
      : duration > 0
      ? duration
      : segments[segments.length - 1]?.end || 20;

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Hidden File Input for Direct Video Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            void handleVideoUpload(e.target.files[0]);
          }
        }}
      />

      {/* 9:16 Vertical Video Frame (Interactive Dropzone) */}
      <div
        ref={containerRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative w-full max-w-[310px] aspect-[9/16] rounded-3xl bg-zinc-950 border transition-all duration-200 shadow-[0_16px_50px_rgba(0,0,0,0.7)] overflow-hidden flex flex-col justify-between p-4 select-none group ${
          isDragging
            ? "border-sky-400 ring-4 ring-sky-500/20 scale-[1.01]"
            : "border-[#202534] hover:border-slate-700"
        }`}
      >
        {/* Background Video OR Gradient Canvas */}
        {videoUrl ? (
          <>
            <video
              ref={videoElRef}
              src={videoUrl}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              loop={false}
              muted={audioUrl ? true : isMuted}
              playsInline
              onTimeUpdate={(e) => {
                onTimeUpdate?.(Number(e.currentTarget.currentTime.toFixed(2)));
              }}
              onLoadedMetadata={(e) => {
                const dur = e.currentTarget.duration;
                if (dur && !isNaN(dur)) {
                  setVideoDuration(dur);
                  onDurationChange?.(dur);
                }
              }}
              onEnded={() => {
                if (isPlaying) onTogglePlay();
              }}
            />
            <div className="absolute inset-0 bg-black/40 pointer-events-none" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-b from-sky-950/20 via-zinc-950 to-purple-950/20 pointer-events-none" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(14,165,233,0.12),transparent_70%)] pointer-events-none" />
          </>
        )}

        {/* Drag Over Overlay Notice */}
        {isDragging && (
          <div className="absolute inset-0 z-40 bg-sky-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-sky-400 rounded-3xl pointer-events-none">
            <span className="text-4xl mb-2 animate-bounce">📥</span>
            <span className="text-sm font-heading font-bold text-white">Drop Your Video Here</span>
            <span className="text-xs text-sky-200 mt-1 font-mono">MP4, WebM or MOV</span>
          </div>
        )}

        {/* Uploading State Overlay */}
        {isUploading && (
          <div className="absolute inset-0 z-40 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
            <span className="w-8 h-8 border-3 border-sky-400 border-t-transparent rounded-full animate-spin mb-3" />
            <span className="text-xs font-heading font-bold text-white">Uploading Your Video...</span>
            <span className="text-[11px] font-mono text-slate-400 mt-1">Applying to 9:16 Canvas</span>
          </div>
        )}

        {/* Top Video Canvas Overlay: Aspect Ratio Badge, Audio Mute, and Current Time */}
        <div className="relative z-10 flex items-center justify-between text-[10px] font-mono text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-full bg-[#08090C]/85 border border-[#202534] backdrop-blur-sm flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${videoUrl ? "bg-emerald-400 animate-pulse" : "bg-sky-400"}`} />
              <span>{videoUrl ? "FOOTAGE ATTACHED" : "9:16 VERTICAL"}</span>
            </span>

            {videoUrl && onVideoChange && (
              <button
                type="button"
                onClick={() => onVideoChange(null)}
                title="Remove video"
                className="px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 transition text-[9px] cursor-pointer"
              >
                ✕ Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {videoUrl && !audioUrl && (
              <button
                type="button"
                onClick={() => setIsMuted((m) => !m)}
                title={isMuted ? "Unmute video audio" : "Mute video audio"}
                className="px-2 py-0.5 rounded-full bg-[#08090C]/85 border border-[#202534] hover:text-white backdrop-blur-sm cursor-pointer transition-colors"
              >
                {isMuted ? "🔇 Muted" : "🔊 Sound"}
              </button>
            )}

            <span className="px-2 py-0.5 rounded-full bg-[#08090C]/85 border border-[#202534] backdrop-blur-sm">
              {currentTime.toFixed(1)}s / {totalEffectiveDuration.toFixed(1)}s
            </span>
          </div>
        </div>

        {/* Center Prompt when NO video is selected */}
        {!videoUrl && !isDragging && !isUploading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-5 text-center pointer-events-auto">
            <div className="p-4 rounded-2xl bg-[#0D0F15]/90 border border-[#202534] backdrop-blur-md max-w-[260px] space-y-2.5 shadow-xl">
              <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center text-lg mx-auto">
                🎬
              </div>
              <div>
                <h4 className="font-heading font-bold text-xs text-white">Put Your Video Here</h4>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Upload your video clip or choose viral stock B-Roll
                </p>
              </div>

              <div className="flex flex-col gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2 px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-[11px] shadow-[0_0_16px_rgba(14,165,233,0.35)] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>📤</span>
                  <span>Upload My Video</span>
                </button>

                {onOpenBRollSelector && (
                  <button
                    type="button"
                    onClick={onOpenBRollSelector}
                    className="w-full py-1.5 px-3 rounded-xl bg-[#12151E] hover:bg-[#1A1F2C] border border-[#202534] text-slate-300 hover:text-white font-semibold text-[10px] transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span>🔍</span>
                    <span>Browse Stock B-Roll</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Captions Display Area */}
        <div className={`absolute left-3 right-3 z-30 flex justify-center pointer-events-none transition-all duration-300 ${positionClass}`}>
          <AnimatePresence mode="wait">
            {activeSegment ? (
              <motion.div
                key={activeSegment.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.1 }}
                style={{
                  backgroundColor: preset.containerBg || "transparent",
                  fontFamily: preset.fontFamily,
                  textTransform: preset.textTransform,
                  letterSpacing: preset.letterSpacing || "normal",
                  lineHeight: preset.lineHeight || "1.3",
                }}
                className="px-3.5 py-1.5 rounded-2xl text-center flex flex-wrap justify-center items-center gap-x-1.5 gap-y-1 backdrop-blur-sm max-w-[94%] drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]"
              >
                {displayWords.map((w, wIdx) => {
                  const isWordActive =
                    currentTime >= w.start &&
                    (currentTime <= w.end ||
                      (wIdx === displayWords.length - 1 && currentTime <= activeSegment.end));

                  let activeClasses = "";
                  const activeInlineStyle: React.CSSProperties = {
                    color: preset.textColor,
                    fontWeight: preset.fontWeight,
                    fontSize: scaledFontSize,
                    textShadow: "0 2px 8px rgba(0,0,0,0.9)",
                  };

                  if (isWordActive) {
                    if (preset.animation === "pop") {
                      activeClasses = "scale-110 drop-shadow-[0_4px_14px_rgba(250,204,21,0.8)]";
                      activeInlineStyle.color = preset.highlightColor;
                    } else if (preset.animation === "bounce") {
                      activeClasses = "scale-115 -translate-y-1 drop-shadow-[0_4px_16px_rgba(74,222,128,0.85)]";
                      activeInlineStyle.color = preset.highlightColor;
                    } else if (preset.animation === "marker") {
                      activeClasses = "rounded px-1.5 shadow-sm";
                      activeInlineStyle.backgroundColor = preset.highlightBg || "#38BDF8";
                      activeInlineStyle.color = preset.highlightColor || "#090A0F";
                    } else {
                      // glow / clean
                      activeClasses = "drop-shadow-[0_0_14px_rgba(56,189,248,0.9)]";
                      activeInlineStyle.color = preset.highlightColor;
                    }
                  } else {
                    activeInlineStyle.opacity = preset.id === "minimal" ? 0.7 : 0.95;
                  }

                  return (
                    <motion.span
                      key={`${w.word}-${wIdx}-${activeSegment.id}`}
                      style={activeInlineStyle}
                      className={`inline-block transition-all duration-75 ${activeClasses}`}
                    >
                      {w.word}
                    </motion.span>
                  );
                })}
              </motion.div>
            ) : (
              <div className="text-slate-500 text-[11px] font-mono uppercase tracking-wider bg-black/40 px-2.5 py-1 rounded-full backdrop-blur-sm">
                {isPlaying ? "•••" : "Captions appear on playback"}
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Timeline Scrubber & Quick Overlay Controls */}
        <div className="relative z-20 space-y-2 pt-2">
          {/* Seek progress slider */}
          <div className="flex items-center gap-2 px-1">
            <input
              type="range"
              min={0}
              max={totalEffectiveDuration > 0 ? totalEffectiveDuration : 10}
              step={0.05}
              value={currentTime}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                onTimeUpdate?.(val);
                if (videoElRef.current) {
                  videoElRef.current.currentTime = val;
                }
              }}
              className="w-full h-1 bg-[#202534] rounded-lg appearance-none cursor-pointer accent-sky-400 hover:accent-sky-300"
            />
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                onRestart();
                if (videoElRef.current) videoElRef.current.currentTime = 0;
              }}
              title="Restart playback"
              className="w-8 h-8 rounded-full bg-[#08090C]/85 border border-[#202534] text-slate-300 hover:text-white flex items-center justify-center text-xs backdrop-blur-sm cursor-pointer"
            >
              ⏮
            </button>

            <button
              type="button"
              onClick={onTogglePlay}
              className="px-4 py-1.5 rounded-full bg-white/95 hover:bg-white text-zinc-950 font-bold text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(255,255,255,0.4)] flex items-center gap-1.5 backdrop-blur-sm cursor-pointer"
            >
              <span>{isPlaying ? "⏸ Pause" : "▶ Play Preview"}</span>
            </button>

            {videoUrl ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Change video"
                className="w-8 h-8 rounded-full bg-[#08090C]/85 border border-[#202534] text-slate-300 hover:text-white flex items-center justify-center text-xs backdrop-blur-sm cursor-pointer"
              >
                🔄
              </button>
            ) : (
              <div className="w-8" />
            )}
          </div>
        </div>
      </div>

      {/* Upload error banner if any */}
      {uploadError && (
        <div className="w-full max-w-[310px] p-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] text-center">
          {uploadError}
        </div>
      )}

      {/* Video Action Bar right below the canvas */}
      <div className="w-full max-w-[310px] flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 py-2 px-3 rounded-xl bg-[#12151E] hover:bg-[#1B2030] border border-[#202534] hover:border-sky-500/50 text-white text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
        >
          <span>📤</span>
          <span>{videoUrl ? "Change Video" : "Upload Video"}</span>
        </button>

        {onOpenBRollSelector && (
          <button
            type="button"
            onClick={onOpenBRollSelector}
            className="flex-1 py-2 px-3 rounded-xl bg-[#12151E] hover:bg-[#1B2030] border border-[#202534] hover:border-sky-500/50 text-slate-300 hover:text-white text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
          >
            <span>🎬</span>
            <span>Stock B-Roll</span>
          </button>
        )}
      </div>

      {/* Dedicated Caption Placement Bar */}
      <div className="w-full max-w-[310px] p-3 rounded-2xl bg-[#0D0F15] border border-[#202534] flex flex-col gap-2">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="text-slate-400 font-bold uppercase tracking-wider">
            Caption Placement
          </span>
          <span className="text-sky-400 font-semibold capitalize">
            {captionPosition === "center" ? "Middle (Viral)" : captionPosition}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => onPositionChange && onPositionChange("top")}
            className={`py-1.5 px-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
              captionPosition === "top"
                ? "bg-sky-500 text-white shadow-[0_0_12px_rgba(14,165,233,0.4)]"
                : "bg-[#12151E] border border-[#202534] text-slate-400 hover:text-white"
            }`}
          >
            <span>⬆️ Top</span>
            <span className="text-[9px] opacity-75 font-mono">Hook Header</span>
          </button>

          <button
            type="button"
            onClick={() => onPositionChange && onPositionChange("center")}
            className={`py-1.5 px-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
              captionPosition === "center"
                ? "bg-sky-500 text-white shadow-[0_0_12px_rgba(14,165,233,0.4)]"
                : "bg-[#12151E] border border-[#202534] text-slate-400 hover:text-white"
            }`}
          >
            <span>🎯 Middle</span>
            <span className="text-[9px] opacity-75 font-mono">Eye-Level (Viral)</span>
          </button>

          <button
            type="button"
            onClick={() => onPositionChange && onPositionChange("bottom")}
            className={`py-1.5 px-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
              captionPosition === "bottom"
                ? "bg-sky-500 text-white shadow-[0_0_12px_rgba(14,165,233,0.4)]"
                : "bg-[#12151E] border border-[#202534] text-slate-400 hover:text-white"
            }`}
          >
            <span>⬇️ Bottom</span>
            <span className="text-[9px] opacity-75 font-mono">Safe Lower-3rd</span>
          </button>
        </div>
      </div>

      {/* Preset Selector Underneath Preview */}
      <div className="w-full flex flex-col items-center gap-2">
        <span className="text-[11px] font-mono uppercase font-bold tracking-wider text-slate-400">
          Caption Style Presets
        </span>
        <div className="flex flex-wrap items-center justify-center gap-2 max-w-sm">
          {(Object.keys(CAPTION_PRESETS) as CaptionPresetId[]).map((pKey) => {
            const p = CAPTION_PRESETS[pKey];
            const isSelected = activePresetId === pKey;

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPresetChange(p.id)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-sky-500 text-white shadow-[0_0_14px_rgba(14,165,233,0.4)]"
                    : "bg-[#12151E] border border-[#202534] text-slate-300 hover:text-white hover:border-slate-700"
                }`}
              >
                <span>{p.name}</span>
                {isSelected && <span className="text-[10px]">✓</span>}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-500 font-sans text-center">
          {preset.tagline}
        </p>
      </div>
    </div>
  );
}
