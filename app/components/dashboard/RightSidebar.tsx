"use client";
import UsageSummary from '../UsageSummary';

import Link from "next/link";
import { motion } from "framer-motion";

import {
  staggerContainer,
  staggerItem,
} from "../../lib/motion";

interface RightSidebarProps {
  onCreateVideoClick: () => void;
  onUseTemplateClick: () => void;
  onOpenContentKit: (type?: string) => void;
  creditsRemaining?: number;
  creditsTotal?: number;
  planName?: string;
  userProjectsCount?: number;
}

export default function RightSidebar({
  onCreateVideoClick,
  onUseTemplateClick,
  onOpenContentKit,
  userProjectsCount = 0,
}: RightSidebarProps) {



  return (
    <motion.aside
      className="w-full xl:w-[290px] shrink-0 space-y-3.5 select-none"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      <UsageSummary compact feature="content"/>


      {/* 2. Quick Actions */}
      <motion.div
        variants={staggerItem}
        className="rounded-xl bg-[#0D1017] border border-[#1A2030] p-3.5 shadow-sm space-y-1.5"
      >
        <h3 className="text-xs font-semibold text-slate-300 px-1 mb-2">
          Quick Start
        </h3>

        {/* New Video Project */}
        <button
          type="button"
          onClick={onCreateVideoClick}
          className="w-full flex items-center justify-between p-2 rounded-lg text-slate-300 hover:text-white hover:bg-[#121622] transition-colors group cursor-pointer text-left"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-5 h-5 rounded bg-sky-500/10 text-sky-400 flex items-center justify-center text-xs">
              +
            </span>
            <span className="text-xs font-medium group-hover:text-white transition-colors">
              New Video Project
            </span>
          </div>
          <span className="text-slate-500 group-hover:text-sky-400 text-xs">→</span>
        </button>

        {/* Browse Templates */}
        <button
          type="button"
          onClick={onUseTemplateClick}
          className="w-full flex items-center justify-between p-2 rounded-lg text-slate-300 hover:text-white hover:bg-[#121622] transition-colors group cursor-pointer text-left"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-5 h-5 rounded bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-xs">
              ⚡
            </span>
            <span className="text-xs font-medium group-hover:text-white transition-colors">
              Popular Templates
            </span>
          </div>
          <span className="text-slate-500 group-hover:text-indigo-400 text-xs">→</span>
        </button>

        {/* Trend Radar */}
        <Link
          href="/trends"
          className="w-full flex items-center justify-between p-2 rounded-lg text-slate-300 hover:text-white hover:bg-[#121622] transition-colors group cursor-pointer text-left"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-5 h-5 rounded bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xs">
              📈
            </span>
            <span className="text-xs font-medium group-hover:text-white transition-colors">
              Rising Trends
            </span>
          </div>
          <span className="text-slate-500 group-hover:text-emerald-400 text-xs">→</span>
        </Link>
      </motion.div>

      {/* 3. AI Studio Strategy Presets */}
      <motion.div
        variants={staggerItem}
        className="rounded-xl bg-[#0D1017] border border-[#1A2030] p-3.5 shadow-sm space-y-2"
      >
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-semibold text-slate-300">Strategy Presets</h3>
          <span className="text-[10px] text-slate-500 font-mono">1-Click</span>
        </div>

        <div className="space-y-1">
          <button
            type="button"
            onClick={() => onOpenContentKit("script")}
            className="w-full flex items-center justify-between p-2 rounded-lg text-left hover:bg-[#121622] transition-colors group cursor-pointer"
          >
            <div>
              <div className="text-xs font-medium text-white group-hover:text-sky-300 transition-colors">
                Script &amp; Hook Kit
              </div>
              <div className="text-[10px] text-slate-400">5 high-retention hooks &amp; voice script</div>
            </div>
            <span className="text-slate-500 group-hover:text-sky-400 text-xs">›</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenContentKit("thumbnail")}
            className="w-full flex items-center justify-between p-2 rounded-lg text-left hover:bg-[#121622] transition-colors group cursor-pointer"
          >
            <div>
              <div className="text-xs font-medium text-white group-hover:text-sky-300 transition-colors">
                Thumbnail Strategy
              </div>
              <div className="text-[10px] text-slate-400">High CTR concepts &amp; visual prompts</div>
            </div>
            <span className="text-slate-500 group-hover:text-sky-400 text-xs">›</span>
          </button>
        </div>
      </motion.div>

      {/* 4. Workspace Quick Stats */}
      <motion.div
        variants={staggerItem}
        className="rounded-xl bg-[#0D1017] border border-[#1A2030] p-3 shadow-sm"
      >
        <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-[#161B26]">
          <span>Projects in Workspace</span>
          <span className="text-white font-mono font-semibold">{userProjectsCount}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-400 pt-2">
          <span>AI Engine</span>
          <span className="text-emerald-400 font-mono text-[11px]">Content tools</span>
        </div>
      </motion.div>
    </motion.aside>
  );
}
