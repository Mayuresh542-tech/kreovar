"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { overlayVariants, modalVariants } from "../../lib/motion";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelectTemplate: (templateId: string) => void;
  onOpenContentKit: () => void;
}

export default function CommandPalette({
  open,
  onClose,
  onSelectTemplate,
  onOpenContentKit,
}: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  function handleClose() {
    setQuery("");
    onClose();
  }

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        handleClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const allItems = [
    {
      id: "trend-finder",
      category: "AI Tools",
      title: "Trend Finder",
      description: "Discover live multi-source signals across Reddit, Google & YouTube",
      icon: "📈",
      action: () => router.push("/trends"),
    },
    {
      id: "trend-radar",
      category: "AI Tools",
      title: "Trend Radar",
      description: "Real-time momentum alerts and niche breakouts",
      icon: "📡",
      action: () => router.push("/alerts"),
    },
    {
      id: "competitors",
      category: "AI Tools",
      title: "Competitor Intel",
      description: "YouTube Data API competitor channel analysis with Gemini insights",
      icon: "🎯",
      action: () => router.push("/competitors"),
    },
    {
      id: "content-kit",
      category: "AI Tools",
      title: "Generate Content Kit",
      description: "5 titles, 3 hooks, 2 thumbnails, duration script & virality score",
      icon: "✨",
      action: onOpenContentKit,
    },
    {
      id: "yt-shorts-modern",
      category: "Templates",
      title: "YouTube Shorts (Modern)",
      description: "High-retention vertical short-form creator layout",
      icon: "📱",
      action: () => onSelectTemplate("yt-shorts-modern"),
    },
    {
      id: "ai-explainer",
      category: "Templates",
      title: "AI Explainer",
      description: "Documentary-style deep dive with cinematic visuals",
      icon: "🤖",
      action: () => onSelectTemplate("ai-explainer"),
    },
    {
      id: "travel-vlog",
      category: "Templates",
      title: "Travel Vlog",
      description: "Atmospheric scenic b-roll pacing with voiceover cues",
      icon: "🏔️",
      action: () => onSelectTemplate("travel-vlog"),
    },
    {
      id: "motivational-quotes",
      category: "Templates",
      title: "Motivational Quotes",
      description: "High-impact typography and emotional background swells",
      icon: "🌅",
      action: () => onSelectTemplate("motivational-quotes"),
    },
    {
      id: "product-review",
      category: "Templates",
      title: "Product Review",
      description: "Sleek hardware highlight showcases and feature callouts",
      icon: "🎧",
      action: () => onSelectTemplate("product-review"),
    },
    {
      id: "projects",
      category: "Navigation",
      title: "My Projects",
      description: "View all your active renders and saved drafts",
      icon: "📁",
      action: () => router.push("/projects"),
    },
    {
      id: "assets",
      category: "Navigation",
      title: "Asset Vault",
      description: "Browse cinematic stock footage",
      icon: "🖼️",
      action: () => router.push("/assets"),
    },
    {
      id: "upgrade",
      category: "Navigation",
      title: "Upgrade to Pro",
      description: "Increase credits, unlock premium models, and faster rendering",
      icon: "👑",
      action: () => router.push("/upgrade"),
    },
    {
      id: "settings",
      category: "Navigation",
      title: "Settings & Brand Kit",
      description: "Manage channel voices, API configuration, and profile",
      icon: "⚙️",
      action: () => router.push("/settings"),
    },
  ];

  const filteredItems = query.trim()
    ? allItems.filter(
        (item) =>
          item.title.toLowerCase().includes(query.toLowerCase()) ||
          item.description.toLowerCase().includes(query.toLowerCase()) ||
          item.category.toLowerCase().includes(query.toLowerCase())
      )
    : allItems;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
          {/* Backdrop */}
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={handleClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Command Palette Card */}
          <motion.div
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative w-full max-w-xl rounded-2xl bg-[#0E1118] border border-[#202534] shadow-[0_24px_70px_rgba(0,0,0,0.85)] overflow-hidden z-10"
          >
          {/* Search Input Bar */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#1E2332] bg-[#12151E]">
            <svg className="w-5 h-5 text-sky-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search templates, tools, or anything..."
              className="w-full bg-transparent text-sm text-white placeholder-slate-400 outline-none"
            />
            <button
              type="button"
              onClick={handleClose}
              className="px-1.5 py-0.5 rounded-md bg-[#1B2030] text-[10px] font-mono text-slate-400 hover:text-white"
            >
              ESC
            </button>
          </div>

          {/* Results List */}
          <div className="max-h-[380px] overflow-y-auto p-2 space-y-1">
            {filteredItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No matching tools or templates found for &quot;{query}&quot;
              </div>
            ) : (
              filteredItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onClose();
                    item.action();
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-sky-500/15 hover:border-sky-500/30 border border-transparent transition-all group text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-base p-1.5 rounded-lg bg-black/30 border border-white/5 shrink-0">
                      {item.icon}
                    </span>
                    <div className="truncate">
                      <div className="text-xs font-semibold text-white group-hover:text-sky-300 transition-colors flex items-center gap-2">
                        <span>{item.title}</span>
                        <span className="text-[10px] font-normal text-slate-500 bg-[#161B26] px-1.5 py-0.5 rounded-md">
                          {item.category}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {item.description}
                      </div>
                    </div>
                  </div>
                  <span className="text-slate-500 group-hover:text-sky-400 text-xs">
                    ↵
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Footer Hints */}
          <div className="px-4 py-2 border-t border-[#181D2A] bg-[#0A0C11] flex items-center justify-between text-[11px] text-slate-500">
            <span>Navigate with click or keyboard</span>
            <span>Kreovar Command Center</span>
          </div>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
}
