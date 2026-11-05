"use client";

import { motion, AnimatePresence } from "framer-motion";
import { overlayVariants, modalVariants } from "../../lib/motion";

interface WatchDemoModalProps {
  open: boolean;
  onClose: () => void;
  onStartCreating: () => void;
}

export default function WatchDemoModal({
  open,
  onClose,
  onStartCreating,
}: WatchDemoModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 bg-black/85 backdrop-blur-md"
          />

          {/* Modal Window */}
          <motion.div
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative w-full max-w-3xl rounded-3xl bg-[#0D1017] border border-[#202534] shadow-[0_24px_80px_rgba(0,0,0,0.9)] overflow-hidden z-10"
          >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-[#1E2332] bg-[#12151E]">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Kreovar Product Walkthrough
                </h3>
                <p className="text-[11px] text-slate-400">
                  From Live Trend Discovery to Finished Viral Content
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1C2130]"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Interactive Demo Video Player / Preview */}
          <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden group">
            <img
              src="/images/dashboard/hero_mountain.jpg"
              alt="Kreovar Walkthrough"
              className="w-full h-full object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#08090C] via-black/40 to-transparent" />

            {/* Play Button Overlay */}
            <div className="relative z-10 text-center space-y-4 max-w-md px-6">
              <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-[0_0_30px_rgba(14,165,233,0.5)] group-hover:scale-110 transition-transform">
                <svg className="w-7 h-7 fill-current translate-x-0.5" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <div className="space-y-1">
                <div className="text-base font-bold text-white">
                  Turn Trending Signals into Publish-Ready Content
                </div>
                <p className="text-xs text-slate-300">
                  Watch how Kreovar analyzes velocity scores, crafts duration-calibrated scripts, and compiles ready-to-render timelines.
                </p>
              </div>
            </div>
          </div>

          {/* Feature Pillars */}
          <div className="grid grid-cols-3 gap-3 p-5 bg-[#0F121A] border-t border-[#1C2130] text-center text-xs">
            <div className="p-2 rounded-xl bg-[#141824] border border-[#23293D]">
              <span className="text-sky-400 font-bold block mb-0.5">1. Discover</span>
              <span className="text-[11px] text-slate-400">Live multi-source scraper</span>
            </div>
            <div className="p-2 rounded-xl bg-[#141824] border border-[#23293D]">
              <span className="text-blue-400 font-bold block mb-0.5">2. Script & Hooks</span>
              <span className="text-[11px] text-slate-400">AI content tools</span>
            </div>
            <div className="p-2 rounded-xl bg-[#141824] border border-[#23293D]">
              <span className="text-emerald-400 font-bold block mb-0.5">3. Multi-Platform</span>
              <span className="text-[11px] text-slate-400">Ready for YouTube & Shorts</span>
            </div>
          </div>

          {/* Footer CTA */}
          <div className="p-4 border-t border-[#1C2130] bg-[#0A0C12] flex items-center justify-between">
            <span className="text-xs text-slate-400">Ready to start creating?</span>
            <button
              type="button"
              onClick={() => {
                onClose();
                onStartCreating();
              }}
              className="px-5 py-2 rounded-xl bg-white hover:bg-slate-100 text-zinc-950 font-bold text-xs shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all active:scale-95"
            >
              Start Creating Now →
            </button>
          </div>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
}
