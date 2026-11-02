"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { overlayVariants, modalVariants } from "../../lib/motion";

interface CreateVideoModalProps {
  open: boolean;
  onClose: () => void;
  onSelectOption: (option: "idea" | "template" | "ai" | "upload") => void;
}

export default function CreateVideoModal({
  open,
  onClose,
  onSelectOption,
}: CreateVideoModalProps) {
  const router = useRouter();

  const options = [
    {
      id: "idea",
      title: "Start from Idea",
      subtitle: "Turn a single sentence or concept into a complete script & video plan",
      icon: (
        <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z" />
          <path d="M9 21h6" />
        </svg>
      ),
      badge: "Fastest",
      accent: "hover:border-sky-500/40 hover:bg-[#141826]",
    },
    {
      id: "template",
      title: "Use Template",
      subtitle: "Pick from high-converting YouTube Shorts, AI Explainers, or Reels",
      icon: (
        <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
        </svg>
      ),
      accent: "hover:border-sky-500/40 hover:bg-[#141826]",
    },
    {
      id: "ai",
      title: "Generate with AI",
      subtitle: "Discover high-velocity trend signals and auto-generate content kits",
      icon: (
        <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M12 2l2.4 7.4L22 12l-7.6 2.6L12 22l-2.4-7.4L2 12l7.6-2.6z" />
        </svg>
      ),
      badge: "Gemini 2.0",
      accent: "hover:border-sky-500/40 hover:bg-[#141826]",
    },
    {
      id: "upload",
      title: "Upload Raw Footage",
      subtitle: "Import raw video with your voice, auto-transcribe captions & find scene B-roll",
      icon: (
        <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      ),
      badge: "Direct Captions",
      accent: "hover:border-emerald-500/40 hover:bg-[#141826]",
    },
  ];

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
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Modal Dialog */}
          <motion.div
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative w-full max-w-xl rounded-2xl bg-[#0D1017] border border-[#1A2030] shadow-2xl p-6 sm:p-7 z-10 space-y-5"
          >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] font-mono font-semibold text-sky-400 tracking-wider uppercase mb-1">
                Kreovar Creation Suite
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Create Your Next Video
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Choose how you want to start creating your publish-ready content.
              </p>
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

          {/* Options Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {options.map((opt, idx) => (
              <motion.button
                key={opt.id}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: idx * 0.04 }}
                whileHover={{ y: -2 }}
                onClick={() => {
                  onClose();
                  onSelectOption(opt.id as any);
                }}
                className={`p-4 rounded-xl bg-[#11141E] border border-[#1E2536] ${opt.accent} transition-all duration-150 text-left flex flex-col justify-between h-36 cursor-pointer relative group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500`}
              >
                <div className="flex items-start justify-between w-full">
                  <div className="p-2 rounded-lg bg-[#0A0D14] border border-[#1A2030] group-hover:border-sky-500/30 transition-colors">
                    {opt.icon}
                  </div>
                  {opt.badge && (
                    <span className="px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20 text-sky-300 text-[10px] font-mono font-medium">
                      {opt.badge}
                    </span>
                  )}
                </div>

                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-white group-hover:text-sky-300 transition-colors">
                    {opt.title}
                  </h4>
                  <p className="text-[11px] text-slate-400 leading-snug mt-1 line-clamp-2">
                    {opt.subtitle}
                  </p>
                </div>
              </motion.button>
            ))}
          </div>

          {/* Footer Note */}
          <div className="pt-2 border-t border-[#181D2A] flex items-center justify-between text-xs text-slate-500">
            <span>Powered by Gemini 2.0 & Kreovar Audio Engine</span>
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push("/trends");
              }}
              className="text-sky-400 hover:text-sky-300 font-semibold transition-colors"
            >
              Browse live trend signals →
            </button>
          </div>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
}
