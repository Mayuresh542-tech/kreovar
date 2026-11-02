"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "../../lib/motion";

interface AIToolsRowProps {
  onOpenContentKit: () => void;
  onOpenVoiceModal: () => void;
}

export default function AIToolsRow({
  onOpenContentKit,
  onOpenVoiceModal,
}: AIToolsRowProps) {
  const tools = [
    {
      id: "trend-finder",
      title: "Trend Finder",
      subtitle: "Discover rising topics",
      href: "/trends",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      ),
    },
    {
      id: "script-generator",
      title: "Script Generator",
      subtitle: "AI hooks & retention",
      onClick: onOpenContentKit,
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
    },
    {
      id: "voice-generator",
      title: "Voice Generator",
      subtitle: "Realistic studio voices",
      onClick: onOpenVoiceModal,
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
        </svg>
      ),
    },
    {
      id: "broll-search",
      title: "B-Roll & Assets",
      subtitle: "Curated HD cutaways",
      href: "/broll",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
          <line x1="7" y1="2" x2="7" y2="22" />
          <line x1="17" y1="2" x2="17" y2="22" />
          <line x1="2" y1="12" x2="22" y2="12" />
        </svg>
      ),
    },
    {
      id: "ai-video-editor",
      title: "Video Editor",
      subtitle: "Multi-track & render",
      href: "/editor",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      ),
    },
  ];

  return (
    <motion.div
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 w-full"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {tools.map((tool) => {
        const cardInner = (
          <motion.div
            variants={staggerItem}
            className="flex items-center gap-3 p-3 rounded-xl bg-[#0D1017] border border-[#1A2030] hover:border-sky-500/35 hover:bg-[#111520] transition-all duration-150 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              {tool.icon}
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-semibold text-white tracking-tight truncate group-hover:text-sky-300 transition-colors">
                {tool.title}
              </h3>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                {tool.subtitle}
              </p>
            </div>
          </motion.div>
        );

        if (tool.href) {
          return (
            <Link key={tool.id} href={tool.href} className="block">
              {cardInner}
            </Link>
          );
        }

        return (
          <button
            key={tool.id}
            type="button"
            onClick={tool.onClick}
            className="block text-left w-full"
          >
            {cardInner}
          </button>
        );
      })}
    </motion.div>
  );
}
