"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { overlayVariants, modalVariants } from "../../lib/motion";

interface BrandKitModalProps {
  open: boolean;
  onClose: () => void;
}

export default function BrandKitModal({ open, onClose }: BrandKitModalProps) {
  const [tone, setTone] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("veelox_brand_tone") || "Fast-Paced & Energetic";
    }
    return "Fast-Paced & Energetic";
  });
  const [niche, setNiche] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("veelox_brand_niche") || "Tech & Creator Economy";
    }
    return "Tech & Creator Economy";
  });
  const [targetAudience, setTargetAudience] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("veelox_brand_audience") || "Gen Z & Millennial Creators";
    }
    return "Gen Z & Millennial Creators";
  });
  const [saved, setSaved] = useState(false);

  function handleSave() {
    localStorage.setItem("veelox_brand_tone", tone);
    localStorage.setItem("veelox_brand_niche", niche);
    localStorage.setItem("veelox_brand_audience", targetAudience);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
          />

          <motion.div
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative w-full max-w-lg rounded-2xl bg-[#0D1017] border border-[#1A2030] shadow-2xl p-6 sm:p-7 z-10 space-y-5 select-none"
          >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Creator Brand Kit
                </h3>
                <p className="text-xs text-slate-400">
                  Calibrate Gemini 2.0 to write in your authentic voice and format.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#151924] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Primary Channel Tone
              </label>
              <input
                type="text"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="e.g. Fast-Paced, Direct, High-Retention Storyteller"
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#11141E] border border-[#1E2536] text-xs text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Core Niche / Topic Focus
              </label>
              <input
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="e.g. AI Technology, SaaS, Finance"
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#11141E] border border-[#1E2536] text-xs text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Target Audience Demographics
              </label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="e.g. Ambitious creators, startup founders"
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#11141E] border border-[#1E2536] text-xs text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20 outline-none"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-[#171B26] flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-mono">Auto-injected into Content Kits</span>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-medium text-xs sm:text-sm shadow-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              {saved ? "Saved Configuration ✓" : "Save Brand Kit"}
            </button>
          </div>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
}
