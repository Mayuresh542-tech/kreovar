"use client";

import React, { useState } from "react";
import {
  CaptionSegment,
  CaptionPresetId,
  CaptionPosition,
  CAPTION_PRESETS,
} from "@/app/lib/captions/presets";

interface CaptionEditorProps {
  segments: CaptionSegment[];
  onSegmentsChange: (segments: CaptionSegment[]) => void;
  activePresetId: CaptionPresetId;
  onPresetChange: (presetId: CaptionPresetId) => void;
  captionPosition?: CaptionPosition;
  onPositionChange?: (position: CaptionPosition) => void;
  videoUrl?: string | null;
  onUploadVideoClick?: () => void;
  onSaveCaptions?: () => Promise<void>;
  isSaving?: boolean;
}

export default function CaptionEditor({
  segments,
  onSegmentsChange,
  activePresetId,
  onPresetChange,
  captionPosition = "center",
  onPositionChange,
  videoUrl,
  onUploadVideoClick,
  onSaveCaptions,
  isSaving = false,
}: CaptionEditorProps) {
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Edit text of a segment
  function handleTextChange(id: string, newText: string) {
    const updated = segments.map((seg) => {
      if (seg.id !== id) return seg;

      // Re-distribute words across the new text proportionally
      const wordsArr = newText.trim().split(/\s+/).filter(Boolean);
      const segDuration = Math.max(0.5, seg.end - seg.start);
      const wordDur = segDuration / Math.max(1, wordsArr.length);

      const updatedWords = wordsArr.map((w, i) => ({
        word: w,
        start: Number((seg.start + i * wordDur).toFixed(2)),
        end: Number((seg.start + (i + 1) * wordDur).toFixed(2)),
      }));

      return {
        ...seg,
        text: newText,
        words: updatedWords,
      };
    });

    onSegmentsChange(updated);
  }

  // Nudge timing +/- seconds
  function nudgeTiming(id: string, field: "start" | "end", delta: number) {
    const updated = segments.map((seg) => {
      if (seg.id !== id) return seg;
      const newVal = Number(Math.max(0, seg[field] + delta).toFixed(2));
      const newStart = field === "start" ? Math.min(newVal, seg.end - 0.1) : seg.start;
      const newEnd = field === "end" ? Math.max(newVal, seg.start + 0.1) : seg.end;

      return {
        ...seg,
        start: newStart,
        end: newEnd,
      };
    });

    onSegmentsChange(updated);
  }

  // Split segment into two
  function handleSplit(index: number) {
    const target = segments[index];
    if (!target) return;

    const words = target.text.trim().split(/\s+/);
    if (words.length < 2) return;

    const mid = Math.ceil(words.length / 2);
    const text1 = words.slice(0, mid).join(" ");
    const text2 = words.slice(mid).join(" ");

    const midTime = Number(((target.start + target.end) / 2).toFixed(2));

    const seg1: CaptionSegment = {
      id: `${target.id}_a`,
      text: text1,
      start: target.start,
      end: midTime,
      words: target.words.slice(0, mid),
    };

    const seg2: CaptionSegment = {
      id: `${target.id}_b`,
      text: text2,
      start: midTime,
      end: target.end,
      words: target.words.slice(mid),
    };

    const next = [...segments];
    next.splice(index, 1, seg1, seg2);
    onSegmentsChange(next);
  }

  // Merge segment with next
  function handleMerge(index: number) {
    if (index >= segments.length - 1) return;
    const current = segments[index];
    const nextSeg = segments[index + 1];

    const merged: CaptionSegment = {
      id: current.id,
      text: `${current.text} ${nextSeg.text}`,
      start: current.start,
      end: nextSeg.end,
      words: [...current.words, ...nextSeg.words],
    };

    const next = [...segments];
    next.splice(index, 2, merged);
    onSegmentsChange(next);
  }

  async function handleSave() {
    if (onSaveCaptions) {
      await onSaveCaptions();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header & Save Action */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-mono uppercase tracking-wider font-bold text-white flex items-center gap-2">
            <span>✏️</span>
            <span>Caption Editor</span>
          </h3>
          <span className="text-[11px] font-mono text-slate-400">
            {segments.length} Subtitle Segments
          </span>
        </div>

        {onSaveCaptions && (
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold bg-sky-500 hover:bg-sky-400 text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            <span>{isSaving ? "Saving..." : saveSuccess ? "✓ Saved" : "💾 Save Changes"}</span>
          </button>
        )}
      </div>

      {/* Background Video Status & Upload Banner */}
      <div className="p-3.5 rounded-xl bg-[#0D0F15] border border-[#202534] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center text-sm shrink-0">
            🎬
          </div>
          <div>
            <span className="text-xs font-heading font-bold text-white block">
              {videoUrl ? "Background Video Attached" : "Put Your Video Here"}
            </span>
            <span className="text-[11px] text-slate-400 font-mono block">
              {videoUrl ? "Active in 9:16 Canvas" : "Upload your clip or select stock B-Roll"}
            </span>
          </div>
        </div>

        {onUploadVideoClick && (
          <button
            type="button"
            onClick={onUploadVideoClick}
            className="px-3 py-1.5 rounded-lg bg-[#12151E] hover:bg-[#1A1F2C] border border-[#202534] hover:border-sky-500/50 text-white text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <span>{videoUrl ? "🔄 Change Video" : "📤 Upload Video"}</span>
          </button>
        )}
      </div>

      {/* Preset & Position Quick Selectors */}
      <div className="p-3.5 rounded-xl bg-[#0D0F15] border border-[#202534] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-400">Style:</span>
          <select
            value={activePresetId}
            onChange={(e) => onPresetChange(e.target.value as CaptionPresetId)}
            className="px-2.5 py-1 rounded-lg bg-[#12151E] border border-[#202534] text-xs font-semibold text-white focus:outline-none focus:border-sky-500 cursor-pointer"
          >
            {(Object.keys(CAPTION_PRESETS) as CaptionPresetId[]).map((key) => (
              <option key={key} value={key} className="bg-[#08090C] text-white">
                {CAPTION_PRESETS[key].name} ({CAPTION_PRESETS[key].animation})
              </option>
            ))}
          </select>
        </div>

        {/* Caption Placement Pill Toggle */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono text-slate-400">Placement:</span>
          <div className="flex items-center gap-1 bg-[#12151E] p-1 rounded-lg border border-[#202534]">
            <button
              type="button"
              onClick={() => onPositionChange && onPositionChange("top")}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                captionPosition === "top"
                  ? "bg-sky-500 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Top
            </button>
            <button
              type="button"
              onClick={() => onPositionChange && onPositionChange("center")}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                captionPosition === "center"
                  ? "bg-sky-500 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Middle (Viral)
            </button>
            <button
              type="button"
              onClick={() => onPositionChange && onPositionChange("bottom")}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                captionPosition === "bottom"
                  ? "bg-sky-500 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Bottom
            </button>
          </div>
        </div>
      </div>

      {/* Segments List */}
      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
        {segments.map((seg, idx) => (
          <div
            key={seg.id}
            className="p-3.5 rounded-xl bg-[#12151E] border border-[#202534] hover:border-slate-700 transition-all flex flex-col gap-2.5"
          >
            {/* Top row: Timing & Action Buttons */}
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300 text-[10px] font-bold">
                #{idx + 1} · {seg.start.toFixed(2)}s → {seg.end.toFixed(2)}s
              </span>

              <div className="flex items-center gap-1.5">
                {/* Split */}
                <button
                  type="button"
                  onClick={() => handleSplit(idx)}
                  title="Split into two segments"
                  className="px-2 py-0.5 rounded bg-[#08090C] border border-[#202534] text-slate-300 hover:text-white text-[11px] cursor-pointer"
                >
                  ✂️ Split
                </button>

                {/* Merge with next */}
                {idx < segments.length - 1 && (
                  <button
                    type="button"
                    onClick={() => handleMerge(idx)}
                    title="Merge with next segment"
                    className="px-2 py-0.5 rounded bg-[#08090C] border border-[#202534] text-slate-300 hover:text-white text-[11px] cursor-pointer"
                  >
                    🔗 Merge Next
                  </button>
                )}
              </div>
            </div>

            {/* Editable Subtitle Text */}
            <textarea
              value={seg.text}
              onChange={(e) => handleTextChange(seg.id, e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-[#202534] text-xs sm:text-sm text-white focus:outline-none focus:border-sky-500 transition-colors font-sans resize-none"
            />

            {/* Timing Nudge Controls */}
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-[#1B2030]">
              <div className="flex items-center gap-1">
                <span>Start:</span>
                <button
                  type="button"
                  onClick={() => nudgeTiming(seg.id, "start", -0.1)}
                  className="px-1.5 py-0.5 rounded bg-[#08090C] border border-[#202534] hover:text-white cursor-pointer"
                >
                  -0.1s
                </button>
                <button
                  type="button"
                  onClick={() => nudgeTiming(seg.id, "start", 0.1)}
                  className="px-1.5 py-0.5 rounded bg-[#08090C] border border-[#202534] hover:text-white cursor-pointer"
                >
                  +0.1s
                </button>
              </div>

              <div className="flex items-center gap-1">
                <span>End:</span>
                <button
                  type="button"
                  onClick={() => nudgeTiming(seg.id, "end", -0.1)}
                  className="px-1.5 py-0.5 rounded bg-[#08090C] border border-[#202534] hover:text-white cursor-pointer"
                >
                  -0.1s
                </button>
                <button
                  type="button"
                  onClick={() => nudgeTiming(seg.id, "end", 0.1)}
                  className="px-1.5 py-0.5 rounded bg-[#08090C] border border-[#202534] hover:text-white cursor-pointer"
                >
                  +0.1s
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
