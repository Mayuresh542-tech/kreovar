"use client";

import { motion } from "framer-motion";
import { EASE_OUT, DURATION_FAST, DURATION_NORMAL } from "../../lib/motion";

interface HeroBannerProps {
  onCreateVideoClick: () => void;
  onWatchDemoClick: () => void;
}

const WORKFLOW_STEPS = [
  "Idea",
  "Script",
  "Voice",
  "Assets",
  "Edit",
  "Captions",
  "Export",
];

export default function HeroBanner({
  onCreateVideoClick,
  onWatchDemoClick,
}: HeroBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
      className="relative w-full rounded-2xl bg-gradient-to-br from-[#0F131E] via-[#0B0E16] to-[#07080C] border border-[#1A2130] p-6 sm:p-8 overflow-hidden select-none"
    >
      {/* Subtle controlled background glow (no excessive neon) */}
      <div className="absolute top-0 right-1/4 w-80 h-40 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 -right-10 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        {/* Left: Clear Visual Hierarchy */}
        <div className="max-w-2xl space-y-4">
          {/* Badge & Unified Pipeline Breadcrumb */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              Unified AI Studio
            </span>

            {/* Workflow Breadcrumb: Communicates "one workflow" */}
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-slate-400 bg-[#0E1119] px-3 py-1 rounded-full border border-[#1C2232]">
              {WORKFLOW_STEPS.map((step, idx) => (
                <span key={step} className="flex items-center gap-1.5">
                  <span className={idx === 0 ? "text-sky-300 font-medium" : "text-slate-400"}>
                    {step}
                  </span>
                  {idx < WORKFLOW_STEPS.length - 1 && (
                    <span className="text-slate-600 font-sans">→</span>
                  )}
                </span>
              ))}
            </div>
          </div>

          {/* Heading: Restrained, Clear, High-Contrast */}
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-[34px] font-bold text-white tracking-tight leading-tight">
              Create Publish-Ready Videos with AI
            </h1>
            <p className="text-xs sm:text-sm text-slate-300/90 leading-relaxed mt-2 max-w-xl">
              From viral trend discovery to automated scripts, lifelike voiceovers, smart B-roll matching, and timeline editing — in one simple, powerful platform.
            </p>
          </div>

          {/* Action CTAs: One Obvious Primary, One Subordinate Secondary */}
          <div className="pt-1 flex flex-wrap items-center gap-3">
            {/* Primary Action (Strongest Visual Treatment) */}
            <button
              type="button"
              onClick={onCreateVideoClick}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-xs sm:text-sm shadow-sm transition-all duration-150 active:scale-98 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <span>Create Content</span>
              <span className="text-sm font-mono">→</span>
            </button>

            {/* Secondary Action (Subtle Outline / Neutral) */}
            <button
              type="button"
              onClick={onWatchDemoClick}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#10131B] hover:bg-[#151924] border border-[#1E2536] hover:border-slate-600 text-slate-400 hover:text-slate-200 font-medium text-xs sm:text-sm transition-all duration-150 active:scale-98 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <svg className="w-3.5 h-3.5 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>Watch Studio Tour</span>
            </button>
          </div>
        </div>

        {/* Right: Studio Quick Status Strip (Desktop) */}
        <div className="hidden lg:flex flex-col gap-2 p-3.5 rounded-xl bg-[#0D1018]/90 border border-[#1A2132] shrink-0 w-64">
          <div className="flex items-center justify-between text-[11px] pb-2 border-b border-[#181D2C]">
            <span className="text-slate-400 font-medium">Pipeline Status</span>
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Ready
            </span>
          </div>

          <div className="space-y-1.5 py-1 text-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span>Script Engine</span>
              <span className="text-slate-200 font-mono text-[11px]">AI assistance</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Voice Synthesis</span>
              <span className="text-slate-200 font-mono text-[11px]">Neural HD</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>B-Roll Library</span>
              <span className="text-slate-200 font-mono text-[11px]">Stock footage</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Video Compiler</span>
              <span className="text-slate-200 font-mono text-[11px]">FFmpeg HW</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
