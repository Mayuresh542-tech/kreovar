"use client";

import React, { useState, useEffect, useMemo } from "react";
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

export default function CaptionCardPreview({
  template,
  isSelected = false,
  onSelect,
  onApply,
  onCustomize,
  onDelete,
  sampleWords,
  sampleText,
  isApplying = false,
}: CaptionCardPreviewProps) {
  const [currentTime, setCurrentTime] = useState(0.9);
  const [isLooping, setIsLooping] = useState(true);

  // Determine designated template text or prop sampleText
  const templateSampleText = (template as any).sampleText;
  const effectiveText = useMemo(() => {
    if (sampleText && sampleText !== "THIS IS HOW YOU GROW") {
      return sampleText;
    }
    return templateSampleText || sampleText || "THIS IS HOW YOU GROW";
  }, [sampleText, templateSampleText]);

  // Determine matching words with timed timestamps
  const effectiveWords = useMemo<TTSWordTimestamp[]>(() => {
    const tokens: string[] = effectiveText.split(/\s+/).filter(Boolean);
    if (
      sampleWords &&
      sampleWords.length === tokens.length &&
      sampleWords.map((w: TTSWordTimestamp) => w.word.toLowerCase()).join(" ") ===
        tokens.map((t: string) => t.toLowerCase()).join(" ")
    ) {
      return sampleWords;
    }
    const step = 0.45;
    return tokens.map((word: string, i: number) => ({
      word,
      start: Number((i * step).toFixed(2)),
      end: Number(((i + 1) * step).toFixed(2)),
    }));
  }, [effectiveText, sampleWords]);

  const maxDuration = useMemo(() => {
    if (!effectiveWords.length) return 2.4;
    return Number((effectiveWords[effectiveWords.length - 1].end + 0.3).toFixed(2));
  }, [effectiveWords]);

  // Auto-playhead loop for live card preview
  useEffect(() => {
    if (!isLooping) return;
    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        if (prev >= maxDuration) return 0.1;
        return Math.round((prev + 0.1) * 10) / 10;
      });
    }, 120);
    return () => clearInterval(interval);
  }, [isLooping, maxDuration]);

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
          {(template as any).fontNote && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 shrink-0">
              Free font
            </span>
          )}
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
            text={effectiveText}
            words={effectiveWords}
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
            className="p-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
