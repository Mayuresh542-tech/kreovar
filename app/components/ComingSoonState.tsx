"use client";

import Link from "next/link";
import { motion } from "framer-motion";

interface UpcomingFeatureStep {
  title: string;
  description: string;
  badge: string;
  icon: string;
}

interface ComingSoonStateProps {
  title: string;
  badge?: string;
  headline?: string;
  description?: string;
  features?: UpcomingFeatureStep[];
  primaryActionLabel?: string;
  primaryActionHref?: string;
  secondaryActionLabel?: string;
  secondaryActionHref?: string;
}

export default function ComingSoonState({
  title,
  badge = "COMING SOON",
  headline = "Kreovar's full AI video production engine is being built.",
  description = "Turn your trending ideas, research, and scripts into finished, publish-ready videos — automatically.",
  features,
  primaryActionLabel = "🔥 Explore Trend Finder",
  primaryActionHref = "/trends",
  secondaryActionLabel = "📡 Open Trend Radar",
  secondaryActionHref = "/alerts",
}: ComingSoonStateProps) {
  const defaultFeatures: UpcomingFeatureStep[] = [
    {
      title: "1. Trend & Script Intelligence",
      description: "Automated hook extraction, virality scoring, and multi-format scripting.",
      badge: "ACTIVE NOW IN CONTENT KIT",
      icon: "✨",
    },
    {
      title: "2. Neural Voiceover Synthesis",
      description: "Natural narration with word-level alignment.",
      badge: "IN DEVELOPMENT",
      icon: "🎙️",
    },
    {
      title: "3. Stock B-Roll & Visual Matcher",
      description: "Contextual stock footage matching from the B-roll library.",
      badge: "PLANNED",
      icon: "🎬",
    },
    {
      title: "4. Smart Auto-Edit & Kinetic Subtitles",
      description: "Automatic pacing, beat alignment, kinetic subtitle animations, and transitions.",
      badge: "IN DEVELOPMENT",
      icon: "✂️",
    },
    {
      title: "5. High-Resolution MP4 Cloud Render",
      description: "Publish-ready 1080p 60fps export optimized for Shorts, Reels, and TikTok.",
      badge: "PLANNED",
      icon: "🚀",
    },
  ];

  const displayFeatures = features || defaultFeatures;

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6">
      {/* Hero Coming Soon Header */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="text-center space-y-4"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-mono font-semibold tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
          <span>{badge}</span>
        </div>

        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white font-poppins tracking-tight leading-tight">
          {headline}
        </h1>

        <p className="text-slate-400 font-poppins text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
          {description}
        </p>

        {/* Primary CTA deck pointing to active MVP features */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
          <Link
            href={primaryActionHref}
            className="px-6 py-3 rounded-full bg-white hover:bg-slate-100 text-zinc-950 text-xs font-bold uppercase tracking-wider shadow-[0_0_24px_rgba(255,255,255,0.25)] hover:shadow-[0_0_32px_rgba(255,255,255,0.4)] transition-all cursor-pointer active:scale-95"
          >
            {primaryActionLabel}
          </Link>

          <Link
            href={secondaryActionHref}
            className="px-6 py-3 rounded-full bg-[#12151E] hover:bg-[#161A26] border border-[#202534] hover:border-sky-500/40 text-slate-300 hover:text-white text-xs font-bold uppercase tracking-wider transition-all cursor-pointer active:scale-95"
          >
            {secondaryActionLabel}
          </Link>
        </div>
      </motion.div>

      {/* Pipeline Preview Deck */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="mt-12 p-6 sm:p-8 rounded-2xl bg-[#0D0F15] border border-[#202534] shadow-2xl relative overflow-hidden"
      >
        <div className="flex items-center justify-between pb-6 mb-6 border-b border-[#202534]">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>{title} Roadmap &amp; Pipeline</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Kreovar is launching with focused Trend Intelligence &amp; AI Content Kits while video production engine finishes testing.
            </p>
          </div>
          <span className="hidden sm:inline-block px-2.5 py-1 rounded bg-[#161A26] border border-[#202534] text-[11px] font-mono text-slate-400">
            PHASE 2 DEPLOYMENT
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayFeatures.map((step, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl bg-[#12151E] border border-[#202534] flex items-start gap-3.5 hover:border-[#2A3144] transition-colors"
            >
              <span className="text-2xl p-2 rounded-lg bg-[#161A26] border border-[#202534] shrink-0">
                {step.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="text-xs font-bold text-white truncate">{step.title}</h3>
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-bold shrink-0 ${
                      step.badge.includes("ACTIVE")
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : "bg-[#161A26] text-slate-400 border border-[#202534]"
                    }`}
                  >
                    {step.badge}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Banner */}
        <div className="mt-6 pt-5 border-t border-[#202534] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-slate-300 font-medium">Currently Active:</span>
            <span>Trend Finder • Trend Radar • Competitor Analysis • AI Content Kits</span>
          </div>
          <Link href="/competitors" className="text-sky-400 hover:underline font-semibold">
            View Competitor Intelligence →
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
