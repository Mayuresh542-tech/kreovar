"use client";

import React, { useState, useEffect } from "react";
import { Check, Sliders, Trash2, Play, Pause } from "lucide-react";
import { CaptionTemplate } from "@/app/lib/captions/templates";
import CaptionRenderer from "./CaptionRenderer";
import { TTSWordTimestamp } from "@/app/lib/captions/presets";

export interface CaptionCardPreviewProps {
  template: CaptionTemplate;
  isSelected?: boolean;
  onSelect: (template: CaptionTemplate) => void;
  onApply: (template: CaptionTemplate) => void;
  onCustomize?: (template: CaptionTemplate) => void;
  onDelete?: (template: CaptionTemplate) => void;
  sampleWords?: TTSWordTimestamp[];
  sampleText?: string;
  isApplying?: boolean;
}

const DEFAULT_SAMPLE_WORDS: TTSWordTimestamp[] = [
  { word: "THIS", start: 0.0, end: 0.4 },
  { word: "IS", start: 0.4, end: 0.8 },
  { word: "HOW", start: 0.8, end: 1.2 },
  { word: "YOU", start: 1.2, end: 1.6 },
  { word: "GROW", start: 1.6, end: 2.3 },
];

export default function CaptionCardPreview({
  template,
  isSelected = false,
  onSelect,
  onApply,
  onCustomize,
  onDelete,
  sampleWords = DEFAULT_SAMPLE_WORDS,
  sampleText = "THIS IS HOW YOU GROW",
  isApplying = false,
}: CaptionCardPreviewProps) {
  const [currentTime, setCurrentTime] = useState(0.9);
  const [isLooping, setIsLooping] = useState(true);

  // Auto-playhead loop for live card preview
  useEffect(() => {
    if (!isLooping) return;
    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        if (prev >= 2.4) return 0.1;
        return Math.round((prev + 0.1) * 10) / 10;
      });
    }, 120);
    return () => clearInterval(interval);
  }, [isLooping]);

  return (
    <div
      onClick={() => onSelect(template)}
      className={`group relative rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden flex flex-col justify-between ${
        isSelected
          ? "border-blue-500 bg-slate-900/90 ring-2 ring-blue-500/30 shadow-xl"
          : "border-slate-800/80 bg-slate-950/70 hover:border-slate-700 hover:bg-slate-900/60 shadow-md"
      }`}
    >
      {/* Top Bar: Template Name, Category, Badges */}
      <div className="p-3 pb-2 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-xs text-white truncate">{template.name}</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-slate-300 shrink-0">
            {template.category}
          </span>
        </div>

        {template.isCustom && onDelete && (
          <button
            type="button"
            title="Delete custom template"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(template);
            }}
            className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Center Animated Preview Box */}
      <div
        className="relative h-36 flex items-center justify-center p-3 overflow-hidden bg-radial from-slate-900 via-slate-950 to-black select-none"
        onMouseEnter={() => setIsLooping(true)}
      >
        {/* Subtle grid pattern backdrop */}
        <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]" />

        {/* Live Caption Display */}
        <div className="relative z-10 w-full flex items-center justify-center">
          <CaptionRenderer
            text={sampleText}
            words={sampleWords}
            currentTime={currentTime}
            style={template.style}
            scaleMultiplier={0.78}
          />
        </div>

        {/* Quick loop toggle icon */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsLooping(!isLooping);
          }}
          className="absolute bottom-2 right-2 p-1 rounded-full bg-black/40 text-slate-500 hover:text-slate-300 transition-colors text-[10px]"
        >
          {isLooping ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
        </button>
      </div>

      {/* Description / Tagline */}
      <div className="px-3 pt-2">
        <p className="text-[11px] text-slate-400 line-clamp-1">{template.tagline}</p>
      </div>

      {/* Bottom Actions: [Apply Template] & [Customize] */}
      <div className="p-3 pt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onApply(template);
          }}
          disabled={isApplying}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer ${
            isSelected
              ? "bg-blue-600 hover:bg-blue-500 text-white"
              : "bg-white hover:bg-slate-100 text-slate-950"
          }`}
        >
          <Check className="w-3.5 h-3.5" />
          <span>{isApplying ? "Applying..." : "Apply Template"}</span>
        </button>

        {onCustomize && (
          <button
            type="button"
            title="Customize style"
            onClick={(e) => {
              e.stopPropagation();
              onCustomize(template);
            }}
            className="p-1.5 rounded-lg border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
