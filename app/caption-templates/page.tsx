"use client";

import React, { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  Sliders,
  FolderKanban,
  Film,
  Download,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import StudioShell from "../components/StudioShell";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import { useAuthGate } from "../lib/useAuthGate";
import {
  CaptionTemplate,
  CaptionCategory,
  CaptionStyleConfig,
  CAPTION_CATEGORIES,
  DEFAULT_CAPTION_TEMPLATES,
} from "../lib/captions/templates";
import {
  fetchAllCaptionTemplates,
  createCustomCaptionTemplate,
  deleteCustomCaptionTemplate,
  applyTemplateToProject,
} from "../lib/services/captionTemplateService";
import { getProjects } from "../lib/services/projectService";
import { VeeloxProject } from "../lib/services/types";
import {
  CaptionSegment,
  createSegmentsFromTranscript,
} from "../lib/captions/presets";
import {
  exportToSRT,
  exportToVTT,
  exportToASS,
} from "../lib/captions/subtitlesParser";
import CaptionCardPreview from "../components/captions/CaptionCardPreview";
import CaptionRenderer from "../components/captions/CaptionRenderer";
import CaptionCustomizer from "../components/captions/CaptionCustomizer";

// Sample video backgrounds for realistic creator preview
const BACKGROUND_OPTIONS = [
  {
    id: "dark-grad",
    name: "Dark Studio",
    url: "",
    gradient: "linear-gradient(180deg, #090D16 0%, #030712 100%)",
  },
  {
    id: "creator-studio",
    name: "Creator Desk",
    url: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "podcast-mic",
    name: "Podcast Studio",
    url: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "urban-night",
    name: "City Lights",
    url: "https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "tech-neon",
    name: "Cyber Neon",
    url: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80",
  },
];

const DEFAULT_SCRIPT =
  "Stop making this rookie mistake with AI coding. The real secret is breaking your vision into modular components and letting trending captions grab retention.";

function CaptionTemplatesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, session } = useAuthGate();
  const user = session?.user;

  // Template registry state
  const [systemTemplates, setSystemTemplates] = useState<CaptionTemplate[]>(DEFAULT_CAPTION_TEMPLATES);
  const [userTemplates, setUserTemplates] = useState<CaptionTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<CaptionTemplate>(DEFAULT_CAPTION_TEMPLATES[0]);
  const [activeCategory, setActiveCategory] = useState<string>("All");

  // Customizer & styling
  const [customStyle, setCustomStyle] = useState<CaptionStyleConfig>(DEFAULT_CAPTION_TEMPLATES[0].style);
  const [isCustomizing, setIsCustomizing] = useState(false);

  // Projects state
  const [projects, setProjects] = useState<VeeloxProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [isApplying, setIsApplying] = useState(false);
  const [applySuccessMessage, setApplySuccessMessage] = useState<string | null>(null);

  // Transcript & Caption segments
  const [transcript, setTranscript] = useState(DEFAULT_SCRIPT);
  const [loadedProjectSegments, setLoadedProjectSegments] = useState<CaptionSegment[] | null>(null);
  const [selectedBg, setSelectedBg] = useState(BACKGROUND_OPTIONS[0]);

  // Video playback preview state
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0.8);
  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Derived segments & duration from transcript/timing
  const segments = useMemo(() => {
    if (loadedProjectSegments && loadedProjectSegments.length > 0) {
      return loadedProjectSegments;
    }
    return createSegmentsFromTranscript(
      transcript,
      undefined,
      customStyle.maxWordsPerLine || 3
    );
  }, [loadedProjectSegments, transcript, customStyle.maxWordsPerLine]);

  const duration = useMemo(() => {
    return segments.length > 0
      ? Math.max(4, Math.ceil(segments[segments.length - 1].end))
      : 6;
  }, [segments]);

  // Load templates and user projects on mount
  useEffect(() => {
    async function loadData() {
      const { systemTemplates: sys, userTemplates: usr } = await fetchAllCaptionTemplates();
      setSystemTemplates(sys);
      setUserTemplates(usr);

      // Load user projects
      const userProjects = await getProjects(user?.id);
      setProjects(userProjects);

      const qProj = searchParams.get("projectId");
      if (qProj) {
        const found = userProjects.find((p) => p.id === qProj);
        if (found) {
          setSelectedProjectId(found.id);
          loadProjectCaptions(found);
        }
      }
    }
    loadData();
  }, [user?.id, searchParams]);

  // Playback timer loop
  useEffect(() => {
    if (isPlaying) {
      playbackTimerRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= duration) {
            return 0.1;
          }
          return Math.round((prev + 0.1) * 10) / 10;
        });
      }, 100);
    } else {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    }
    return () => {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    };
  }, [isPlaying, duration]);

  function loadProjectCaptions(proj: VeeloxProject) {
    if (proj.captions && proj.captions.length > 0) {
      const fullText = proj.captions.map((c) => c.text).join(" ");
      setTranscript(fullText);
      const converted: CaptionSegment[] = proj.captions.map((c) => ({
        id: c.id,
        text: c.text,
        start: c.startTime,
        end: c.endTime,
        words: (c.words || []).map((w) => ({
          word: w.word,
          start: w.start,
          end: w.end,
        })),
      }));
      setLoadedProjectSegments(converted);
    } else if (proj.script) {
      const parts = [
        proj.script.hook,
        proj.script.intro,
        ...(proj.script.bodyPoints || []),
        proj.script.payoff,
        proj.script.cta,
      ].filter(Boolean);
      if (parts.length > 0) {
        setTranscript(parts.join(" "));
      }
    }
  }

  // Filter templates by category
  const allTemplates = useMemo(() => {
    return [...userTemplates, ...systemTemplates];
  }, [userTemplates, systemTemplates]);

  const filteredTemplates = useMemo(() => {
    if (activeCategory === "All") return allTemplates;
    if (activeCategory === "Custom") return userTemplates;
    return allTemplates.filter((t) => t.category === activeCategory);
  }, [activeCategory, allTemplates, userTemplates]);

  // Active segment for current playhead
  const activeSegment = segments.find(
    (s) => currentTime >= s.start && currentTime <= s.end
  ) || segments[0];

  // One-Click Apply Action
  async function handleApplyTemplate(tmpl: CaptionTemplate) {
    setIsApplying(true);
    setApplySuccessMessage(null);

    try {
      if (selectedProjectId) {
        const proj = projects.find((p) => p.id === selectedProjectId);
        if (proj) {
          await applyTemplateToProject(proj, tmpl);
          setApplySuccessMessage(`Applied "${tmpl.name}" to ${proj.title}!`);
        }
      } else {
        // If no project selected, apply to active preview state and notify
        setSelectedTemplate(tmpl);
        setCustomStyle(tmpl.style);
        setApplySuccessMessage(`Applied "${tmpl.name}" style! Select a project below to save with project.`);
      }
    } catch (err: any) {
      console.error("Failed to apply template:", err);
    } finally {
      setIsApplying(false);
      setTimeout(() => setApplySuccessMessage(null), 3500);
    }
  }

  // Save Custom Template
  async function handleSaveCustomTemplate(
    name: string,
    category: CaptionCategory,
    styleToSave: CaptionStyleConfig
  ) {
    const created = await createCustomCaptionTemplate({
      name,
      category,
      description: `Custom ${name} caption style`,
      style: styleToSave,
    });
    setUserTemplates((prev) => [created, ...prev]);
    setSelectedTemplate(created);
  }

  // Delete Custom Template
  async function handleDeleteCustomTemplate(tmpl: CaptionTemplate) {
    if (!confirm(`Delete template "${tmpl.name}"?`)) return;
    await deleteCustomCaptionTemplate(tmpl.id);
    setUserTemplates((prev) => prev.filter((t) => t.id !== tmpl.id));
    if (selectedTemplate.id === tmpl.id) {
      setSelectedTemplate(systemTemplates[0]);
    }
  }

  // Subtitle Export
  function handleExportSubtitles(format: "srt" | "vtt" | "ass") {
    if (segments.length === 0) return;
    const exportable = segments.map((s) => ({
      text: s.text,
      startTime: s.start,
      endTime: s.end,
    }));

    let content = "";
    let mime = "text/plain";
    if (format === "srt") {
      content = exportToSRT(exportable);
    } else if (format === "vtt") {
      content = exportToVTT(exportable);
      mime = "text/vtt";
    } else {
      content = exportToASS(exportable);
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `veelox-${selectedTemplate.id}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (status !== "authed") {
    return <AuthLoadingScreen label="Loading Caption Templates…" />;
  }

  return (
    <StudioShell active="captions">
      <div className="max-w-7xl mx-auto w-full space-y-6 pb-20">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold">
                VIRAL CAPTION ENGINE
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              Trending Caption Templates
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Select high-converting short-form caption presets, preview with dynamic word timing, and apply with 1 click.
            </p>
          </div>

          {/* Action CTAs: Project target & Editor CTA */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Project Selector */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs">
              <FolderKanban className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={selectedProjectId}
                onChange={(e) => {
                  const pid = e.target.value;
                  setSelectedProjectId(pid);
                  const p = projects.find((proj) => proj.id === pid);
                  if (p) loadProjectCaptions(p);
                }}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer max-w-[160px] truncate"
              >
                <option value="">Target: None (Demo)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => {
                if (selectedProjectId) {
                  router.push(`/editor?projectId=${selectedProjectId}&captions=1`);
                } else {
                  router.push("/editor?captions=1");
                }
              }}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
            >
              <Film className="w-3.5 h-3.5" />
              <span>Open in Video Editor</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Success Alert Banner */}
        <AnimatePresence>
          {applySuccessMessage && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-3 rounded-xl flex items-center justify-between text-xs font-semibold shadow-xs"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{applySuccessMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setApplySuccessMessage(null)}
                className="text-emerald-700 hover:text-emerald-950 font-mono text-[11px]"
              >
                Dismiss
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Stage Grid: Left Monitor (5 cols) | Right Browser & Customizer (7 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Live Visual Monitor & Subtitle Scrubbing (5 cols) */}
          <div className="lg:col-span-5 space-y-4 sticky top-6">
            <div className="bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl relative flex flex-col justify-between aspect-[9/16] max-w-[340px] mx-auto select-none">
              {/* Visual Background */}
              {selectedBg.url ? (
                <img
                  src={selectedBg.url}
                  alt={selectedBg.name}
                  className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none"
                />
              ) : (
                <div
                  className="absolute inset-0 pointer-events-none opacity-90"
                  style={{ background: selectedBg.gradient }}
                />
              )}

              {/* Dark Vignette Overlay for High Contrast */}
              <div className="absolute inset-0 bg-radial from-transparent via-black/40 to-black/90 pointer-events-none" />

              {/* Top Watermark & Template Label */}
              <div className="relative z-10 p-3 flex items-center justify-between border-b border-white/10 bg-black/40 backdrop-blur-md">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-300 font-bold truncate">
                    {selectedTemplate.name}
                  </span>
                </div>
                <span className="text-[9px] font-mono text-slate-400 bg-white/10 px-2 py-0.5 rounded-full">
                  9:16 Canvas
                </span>
              </div>

              {/* Center Live Caption Renderer Display */}
              <div
                className="relative z-10 px-3 text-center my-auto w-full flex items-center justify-center"
                style={{
                  paddingTop:
                    customStyle.position === "top"
                      ? "10%"
                      : customStyle.position === "bottom"
                      ? "45%"
                      : `${(customStyle.positionYPercent ?? 60) - 20}%`,
                }}
              >
                {activeSegment ? (
                  <CaptionRenderer
                    text={activeSegment.text}
                    words={activeSegment.words}
                    currentTime={currentTime}
                    style={customStyle}
                    scaleMultiplier={1}
                  />
                ) : (
                  <span className="text-slate-500 text-xs font-mono">
                    No active caption at {currentTime.toFixed(1)}s
                  </span>
                )}
              </div>

              {/* Bottom Playback Scrubber & Background Switcher */}
              <div className="relative z-10 p-3 space-y-2.5 bg-slate-950/90 border-t border-slate-800 backdrop-blur-md">
                {/* Background Picker */}
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>Backdrop:</span>
                  <div className="flex items-center gap-1">
                    {BACKGROUND_OPTIONS.map((bg) => (
                      <button
                        key={bg.id}
                        type="button"
                        onClick={() => setSelectedBg(bg)}
                        title={bg.name}
                        className={`px-2 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
                          selectedBg.id === bg.id
                            ? "bg-blue-600 text-white font-bold"
                            : "bg-white/10 text-slate-300 hover:bg-white/20"
                        }`}
                      >
                        {bg.name.split(" ")[0]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Scrubber slider */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span className="text-blue-400 font-bold">{currentTime.toFixed(1)}s</span>
                    <span>{duration.toFixed(1)}s</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={duration}
                    step={0.1}
                    value={currentTime}
                    onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                    className="w-full accent-blue-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Play/Pause & Reset Controls */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setCurrentTime(0)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="py-1.5 px-4 rounded-full bg-white hover:bg-slate-200 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-slate-950" />}
                    <span>{isPlaying ? "Pause" : "Play"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsCustomizing(!isCustomizing)}
                    className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      isCustomizing
                        ? "bg-blue-600 text-white"
                        : "text-slate-400 hover:text-white hover:bg-white/10"
                    }`}
                    title="Toggle Customization Panel"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Export Subtitles Bar */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs font-semibold text-slate-700">Export Captions</span>
              </div>
              <div className="flex items-center gap-1">
                {(["srt", "vtt", "ass"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => handleExportSubtitles(fmt)}
                    className="px-2.5 py-1 rounded-md border border-slate-200 hover:bg-slate-900 hover:text-white text-[10px] font-mono uppercase font-bold text-slate-700 transition-colors cursor-pointer"
                  >
                    .{fmt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Template Library Browser + Customization Drawer (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Customization Drawer / Panel if open */}
            {isCustomizing && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <CaptionCustomizer
                  style={customStyle}
                  templateName={selectedTemplate.name}
                  onChange={(updated) => setCustomStyle(updated)}
                  onSaveAsCustomTemplate={handleSaveCustomTemplate}
                  onReset={() => setCustomStyle(selectedTemplate.style)}
                />
              </motion.div>
            )}

            {/* Script Text Input Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span>Preview Script / Transcript</span>
                </label>
                <span className="text-[10px] font-mono text-slate-400">
                  {segments.length} Timed Subtitle Blocks
                </span>
              </div>
              <textarea
                rows={2}
                value={transcript}
                onChange={(e) => {
                  setLoadedProjectSegments(null);
                  setTranscript(e.target.value);
                }}
                placeholder="Enter text to test template styling dynamically..."
                className="w-full p-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-slate-900 font-sans leading-relaxed"
              />
            </div>

            {/* Template Library Categories Bar */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide font-mono">
                  Preset Library ({filteredTemplates.length})
                </h2>
                <button
                  type="button"
                  onClick={() => setIsCustomizing(!isCustomizing)}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>{isCustomizing ? "Close Customizer" : "Customize Style"}</span>
                </button>
              </div>

              {/* Horizontal Scrollable Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none">
                {["All", ...CAPTION_CATEGORIES].map((cat) => {
                  const isCatActive = activeCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setActiveCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                        isCatActive
                          ? "bg-slate-900 text-white shadow-2xs"
                          : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900"
                      }`}
                    >
                      {cat === "Custom" ? "My Saved" : cat}
                    </button>
                  );
                })}
              </div>

              {/* Template Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredTemplates.map((tmpl) => {
                  const isSelected = selectedTemplate.id === tmpl.id;
                  return (
                    <CaptionCardPreview
                      key={tmpl.id}
                      template={tmpl}
                      isSelected={isSelected}
                      onSelect={(t) => {
                        setSelectedTemplate(t);
                        setCustomStyle(t.style);
                      }}
                      onApply={handleApplyTemplate}
                      onCustomize={(t) => {
                        setSelectedTemplate(t);
                        setCustomStyle(t.style);
                        setIsCustomizing(true);
                      }}
                      onDelete={tmpl.isCustom ? handleDeleteCustomTemplate : undefined}
                      sampleText={activeSegment?.text || "THIS IS HOW YOU GROW"}
                      sampleWords={activeSegment?.words}
                      isApplying={isApplying && selectedTemplate.id === tmpl.id}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </StudioShell>
  );
}

export default function CaptionTemplatesPage() {
  return (
    <Suspense fallback={<AuthLoadingScreen label="Loading Caption Templates…" />}>
      <CaptionTemplatesContent />
    </Suspense>
  );
}
