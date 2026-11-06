"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { VeeloxProject } from "../../lib/services/types";
import { EASE_OUT, DURATION_NORMAL } from "../../lib/motion";

interface RecentProjectsSectionProps {
  userProjects?: VeeloxProject[];
  onCreateProjectClick?: () => void;
}

interface DisplayProject {
  id: string;
  title: string;
  tags: string[];
  status: "rendering" | "completed" | "processing";
  timeAgo: string;
  thumbnail: string;
  isUserProject?: boolean;
}

export default function RecentProjectsSection({
  userProjects = [],
  onCreateProjectClick,
}: RecentProjectsSectionProps) {
  const router = useRouter();
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const projectsToDisplay: DisplayProject[] = userProjects.slice(0, 5).map((p, idx) => ({
    id: p.id,
    title: p.title || "Untitled Project",
    tags: [
      p.niche ? `#${p.niche.replace(/\s+/g, "")}` : "#Video",
      p.aspect_ratio === "9:16" ? "#Shorts" : "#YouTube",
      p.status === "ready" ? "#Completed" : "#Rendering",
    ],
    status: p.status === "ready" ? "completed" : p.status === "rendering" ? "rendering" : "processing",
    timeAgo: `${(idx + 1) * 3}h ago`,
    thumbnail: "/images/dashboard/template_yt_shorts.jpg",
    isUserProject: true,
  }));

  return (
    <section className="space-y-3 select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white tracking-tight">
            Recent Projects
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Your latest video edits and AI production pipelines
          </p>
        </div>
        <Link
          href="/projects"
          className="text-xs font-medium text-slate-400 hover:text-sky-400 transition-colors flex items-center gap-1 cursor-pointer"
        >
          <span>View all</span>
          <span>→</span>
        </Link>
      </div>

      {/* Projects List Container or Premium Onboarding Empty State */}
      {projectsToDisplay.length === 0 ? (
        <div className="rounded-2xl bg-[#0D1017] border border-[#1A2030] p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#171B26] pb-5">
            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400 font-semibold">
                Workspace Empty State
              </span>
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Your Content Command Center
              </h3>
              <p className="text-xs text-slate-400 max-w-lg leading-relaxed">
                This is where all your generated scripts, timeline edits, and auto-captioned videos are stored. Choose an existing workflow below to produce your first video.
              </p>
            </div>
            <button
              type="button"
              onClick={onCreateProjectClick || (() => router.push("/projects?new=1"))}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-xs sm:text-sm shadow-sm transition-all duration-150 active:scale-98 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <span>Create Content</span>
              <span className="text-sm font-mono">→</span>
            </button>
          </div>

          {/* 3 Guided Workflow Quick-Starts (Using Real Existing Routes) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div
              onClick={() => router.push("/projects?new=1")}
              className="p-4 rounded-xl bg-[#11141E] border border-[#1E2536] hover:border-sky-500/40 hover:bg-[#141826] transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center text-sm">
                  ✨
                </div>
                <h4 className="text-xs font-semibold text-white group-hover:text-sky-300 transition-colors">
                  AI Video Generator
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Turn a topic or idea into a structured script, voiceover, and captions.
                </p>
              </div>
              <div className="pt-3 mt-2 border-t border-[#1A2030] flex items-center justify-between text-[11px] font-mono text-sky-400">
                <span>Start Pipeline</span>
                <span className="group-hover:translate-x-0.5 transition-transform">→</span>
              </div>
            </div>

            <div
              onClick={() => router.push("/projects?new=1")}
              className="p-4 rounded-xl bg-[#11141E] border border-[#1E2536] hover:border-emerald-500/40 hover:bg-[#141826] transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm">
                  📹
                </div>
                <h4 className="text-xs font-semibold text-white group-hover:text-emerald-300 transition-colors">
                  Auto-Caption Raw Video
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Import your footage to transcribe speech and generate synchronized captions.
                </p>
              </div>
              <div className="pt-3 mt-2 border-t border-[#1A2030] flex items-center justify-between text-[11px] font-mono text-emerald-400">
                <span>Upload Video</span>
                <span className="group-hover:translate-x-0.5 transition-transform">→</span>
              </div>
            </div>

            <div
              onClick={() => router.push("/trends")}
              className="p-4 rounded-xl bg-[#11141E] border border-[#1E2536] hover:border-amber-500/40 hover:bg-[#141826] transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center text-sm">
                  📡
                </div>
                <h4 className="text-xs font-semibold text-white group-hover:text-amber-300 transition-colors">
                  Explore Viral Trends
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Discover breakout topics with virality scoring and instant script angles.
                </p>
              </div>
              <div className="pt-3 mt-2 border-t border-[#1A2030] flex items-center justify-between text-[11px] font-mono text-amber-400">
                <span>Find Trends</span>
                <span className="group-hover:translate-x-0.5 transition-transform">→</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {projectsToDisplay.map((project, idx) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATION_NORMAL, ease: EASE_OUT, delay: idx * 0.04 }}
              className="flex items-center justify-between gap-3 p-2.5 sm:p-3 rounded-xl bg-[#0D1017] border border-[#1A2030] hover:border-sky-500/35 hover:bg-[#111520] transition-all duration-150 group"
            >
              {/* Left: Thumbnail & Name */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Thumbnail */}
                <div className="w-12 h-9 sm:w-14 sm:h-10 rounded-lg overflow-hidden bg-black/40 shrink-0 border border-white/5 relative">
                  <img
                    src={project.thumbnail}
                    alt={project.title}
                    className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-200"
                    loading="lazy"
                  />
                </div>

                {/* Title & Tags */}
                <div className="min-w-0 flex-1">
                  <div
                    onClick={() => router.push(project.isUserProject ? `/editor/${project.id}` : "/projects")}
                    className="text-xs sm:text-sm font-semibold text-white leading-snug line-clamp-1 hover:text-sky-300 transition-colors cursor-pointer"
                  >
                    {project.title}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                    {project.tags.map((tag) => (
                      <span key={tag} className="text-[10px] text-slate-500 font-medium">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Status Pill, Time, 3-dots Menu */}
              <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                {/* Status Badge */}
                <div>
                  {project.status === "completed" && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Completed
                    </span>
                  )}
                  {project.status === "rendering" && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[11px] font-medium font-mono animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                      Rendering...
                    </span>
                  )}
                  {project.status === "processing" && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] font-medium font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                      Processing
                    </span>
                  )}
                </div>

                {/* Time Ago */}
                <span className="text-[11px] text-slate-500 font-mono hidden sm:inline-block">
                  {project.timeAgo}
                </span>

                {/* 3-dots Menu Popover */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveMenuId(activeMenuId === project.id ? null : project.id)
                    }
                    className="p-1 rounded-md text-slate-500 hover:text-white hover:bg-[#1A2030] transition-colors"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="5" r="1.5" />
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="12" cy="19" r="1.5" />
                    </svg>
                  </button>

                  {activeMenuId === project.id && (
                    <div className="absolute right-0 mt-1 w-36 rounded-lg bg-[#0E1118] border border-[#1A2030] shadow-xl p-1 text-xs z-30">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveMenuId(null);
                          router.push(project.isUserProject ? `/editor/${project.id}` : "/projects");
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-sky-500/10 transition-colors"
                      >
                        Open Editor
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveMenuId(null);
                          router.push("/projects");
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-sky-500/10 transition-colors"
                      >
                        Duplicate
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}
