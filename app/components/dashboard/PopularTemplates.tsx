"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import {
  EASE_OUT,
  DURATION_NORMAL,
  STAGGER_CHILDREN,
} from "../../lib/motion";

export interface TemplateItem {
  id: string;
  title: string;
  badge?: string;
  tags: string[];
  thumbnail: string;
  aspectRatio: "9:16" | "16:9";
  niche: string;
}

interface PopularTemplatesProps {
  onSelectTemplate: (template: TemplateItem) => void;
}

export const TEMPLATES_DATA: TemplateItem[] = [
  {
    id: "yt-shorts-modern",
    title: "YouTube Shorts (Modern)",
    badge: "YOUTUBE SHORTS",
    tags: ["#Shorts", "#Trending"],
    thumbnail: "/images/dashboard/template_yt_shorts.jpg",
    aspectRatio: "9:16",
    niche: "Tech & Creator",
  },
  {
    id: "ai-explainer",
    title: "AI Explainer",
    badge: "AI EXPLAINER",
    tags: ["#Tech", "#Educational"],
    thumbnail: "/images/dashboard/template_ai_robot.jpg",
    aspectRatio: "16:9",
    niche: "Artificial Intelligence",
  },
  {
    id: "travel-vlog",
    title: "Travel Vlog",
    badge: "TRAVEL VLOG",
    tags: ["#Travel", "#Cinematic"],
    thumbnail: "/images/dashboard/template_travel_vlog.jpg",
    aspectRatio: "16:9",
    niche: "Travel & Adventure",
  },
  {
    id: "motivational-quotes",
    title: "Motivational Quotes",
    badge: "DAILY MOTIVATION",
    tags: ["#Motivation", "#Viral"],
    thumbnail: "/images/dashboard/template_daily_motivation.jpg",
    aspectRatio: "9:16",
    niche: "Self Growth",
  },
  {
    id: "product-review",
    title: "Product Review",
    badge: "PRODUCT REVIEW",
    tags: ["#Tech", "#Review"],
    thumbnail: "/images/dashboard/template_product_review.jpg",
    aspectRatio: "16:9",
    niche: "Tech Gear",
  },
];

export default function PopularTemplates({ onSelectTemplate }: PopularTemplatesProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  function scroll(direction: "left" | "right") {
    if (scrollContainerRef.current) {
      const amount = direction === "left" ? -280 : 280;
      scrollContainerRef.current.scrollBy({ left: amount, behavior: "smooth" });
    }
  }

  return (
    <section id="popular-templates-section" className="space-y-3 select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white tracking-tight">
            Popular Templates
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Pre-configured layouts and typography presets for fast creation
          </p>
        </div>
        <button
          type="button"
          onClick={() => scroll("right")}
          className="text-xs font-medium text-slate-400 hover:text-sky-400 transition-colors flex items-center gap-1 cursor-pointer"
        >
          <span>View all</span>
          <span>→</span>
        </button>
      </div>

      {/* Horizontal Carousel Container */}
      <div className="relative group">
        <div
          ref={scrollContainerRef}
          className="flex items-stretch gap-3 overflow-x-auto pb-1.5 scrollbar-none scroll-smooth snap-x"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {TEMPLATES_DATA.map((tmpl, idx) => (
            <motion.div
              key={tmpl.id}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: DURATION_NORMAL, delay: idx * STAGGER_CHILDREN, ease: EASE_OUT }}
              className="shrink-0 w-[210px] sm:w-[220px] snap-start rounded-xl bg-[#0D1017] border border-[#1A2030] hover:border-sky-500/35 p-3 flex flex-col justify-between transition-colors duration-150 group/card"
            >
              {/* Thumbnail Card with Title Overlay */}
              <div className="relative w-full aspect-[16/10] rounded-lg overflow-hidden bg-black/40 mb-2.5">
                <img
                  src={tmpl.thumbnail}
                  alt={tmpl.title}
                  className="w-full h-full object-cover group-hover/card:scale-102 transition-transform duration-200"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                {/* Badge Overlay */}
                {tmpl.badge && (
                  <div className="absolute top-2 left-2 z-10">
                    <span className="px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm border border-white/10 text-[9px] font-mono tracking-wider text-slate-200 uppercase flex items-center gap-1">
                      {tmpl.id === "yt-shorts-modern" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
                      )}
                      {tmpl.badge}
                    </span>
                  </div>
                )}
              </div>

              {/* Title & Tags */}
              <div className="space-y-1 flex-1">
                <h3 className="text-xs font-semibold text-white tracking-tight truncate group-hover/card:text-sky-300 transition-colors">
                  {tmpl.title}
                </h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  {tmpl.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] text-slate-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Use Template Button */}
              <button
                type="button"
                onClick={() => onSelectTemplate(tmpl)}
                className="mt-2.5 w-full py-1.5 px-3 rounded-lg bg-[#121622] hover:bg-sky-500 hover:text-white border border-[#1E2435] hover:border-sky-500 text-[11px] font-medium text-slate-300 transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
              >
                <span>Use Template</span>
                <span className="text-xs">→</span>
              </button>
            </motion.div>
          ))}
        </div>

        {/* Scroll Nav Arrow Button */}
        <button
          type="button"
          onClick={() => scroll("right")}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 w-7 h-7 rounded-full bg-[#12151E] border border-[#202738] hover:border-sky-500 text-slate-300 hover:text-white shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-10 cursor-pointer"
          aria-label="Scroll templates right"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </section>
  );
}
