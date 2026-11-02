"use client";
import {useState,useEffect} from "react";
import {supabase} from "../lib/supabase";
import UsageSummary from './UsageSummary';

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

import BrandVoiceBadge from "./BrandVoiceBadge";

import {
  EASE_OUT,
  DURATION_NORMAL,
  DURATION_FAST,
} from "../lib/motion";

export interface ContentKit {
  titles: string[];
  hooks: string[];
  thumbnail_ideas: string[];
  why_trending: string;
  content_angles: string[];
  best_format: string;
  catch_window: string;
  virality_tips: string[];
  script: string;
}

/** Script length presets. Word counts assume a ~150 wpm speaking pace. */
export interface Duration {
  label: string;
  seconds: number;
  words: number;
  format: "short-form" | "long-form";
}

export const DURATIONS: Duration[] = [
  { label: "30 seconds", seconds: 30, words: 75, format: "short-form" },
  { label: "60 seconds", seconds: 60, words: 150, format: "short-form" },
  { label: "3 minutes", seconds: 180, words: 450, format: "long-form" },
  { label: "5 minutes", seconds: 300, words: 750, format: "long-form" },
  { label: "10 minutes", seconds: 600, words: 1500, format: "long-form" },
];

interface PanelProps {
  open: boolean;
  onClose: () => void;
  topic: string;
  niche?: string;
  score: number;
  started: boolean;
  duration: number;
  onDurationChange: (seconds: number) => void;
  onGenerate: () => void;
  onReconfigure: () => void;
  loading: boolean;
  needKey?: boolean;
  error: string | null;
  kit: ContentKit | null;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  onRetry: () => void;
  creditsRemaining?: number;
  onCreditsUpdate?: (newBalance: number) => void;
}

/** Count words in a script for the word-count badge. */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Estimated read/record time from word count (~150 wpm speaking pace). */
function readTime(words: number): string {
  const secs = Math.round((words / 150) * 60);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

const SCRIPT_LABELS = ["HOOK:", "INTRO:", "MAIN CONTENT:", "CTA:"];

/** Render the script, bolding the HOOK/INTRO/MAIN CONTENT/CTA section labels. */
function ScriptBody({ script }: { script: string }) {
  const parts = script.split(/(HOOK:|INTRO:|MAIN CONTENT:|CTA:)/g);
  return (
    <div className="font-sans text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-wrap selection:bg-sky-500/30 selection:text-white">
      {parts.map((part, i) =>
        SCRIPT_LABELS.includes(part) ? (
          <span key={i} className="block mt-4 first:mt-0 font-mono text-[11px] font-bold text-sky-400 uppercase tracking-wider">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </div>
  );
}

/** Precision copy-to-clipboard button used on every item in the kit. */
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be blocked
    }
  }

  return (
    <motion.button
      onClick={copy}
      whileTap={{ scale: 0.92 }}
      title="Copy to clipboard"
      className={`shrink-0 px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider font-semibold border transition-all cursor-pointer ${
        copied
          ? "text-sky-300 border-sky-500/50 bg-sky-500/20 shadow-[0_0_12px_rgba(14,165,233,0.3)]"
          : "text-slate-400 border-[#202534] bg-[#12151E] hover:text-white hover:border-sky-500/40"
      }`}
    >
      {copied ? "✓ Copied" : "Copy"}
    </motion.button>
  );
}

function SectionTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <h4 className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-slate-400 mb-3">
      <span>{icon}</span>
      <span>{children}</span>
    </h4>
  );
}

/**
 * Coerce a list item to display text.
 */
function toText(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    return Object.values(item as Record<string, unknown>)
      .map((v) => (Array.isArray(v) ? v.join(", ") : String(v)))
      .filter(Boolean)
      .join(" — ");
  }
  return String(item ?? "");
}

/** A list of copyable items (titles, hooks, angles, tips…). */
function ItemList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((raw, i) => {
        const item = toText(raw);
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="group flex items-start gap-3 rounded-xl bg-[#12151E] border border-[#202534] hover:border-sky-500/40 p-3 transition-colors"
          >
            <span className="shrink-0 mt-0.5 w-5 h-5 rounded-md bg-sky-500/15 text-sky-400 text-[10px] font-mono font-bold flex items-center justify-center border border-sky-500/30">
              {i + 1}
            </span>
            <p className="flex-1 text-xs sm:text-sm text-slate-200 leading-snug font-sans">{item}</p>
            <CopyBtn text={item} />
          </motion.div>
        );
      })}
    </div>
  );
}

const LOADING_STEPS = [
  "Analyzing trends...",
  "Finding content angles...",
  "Generating hooks...",
  "Writing script...",
  "Building your Content Kit...",
];

function KitSkeleton() {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentStep((prev) => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev));
    }, 1200);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {/* Animated gradient ring + pulsing AI indicator */}
      <div className="relative w-16 h-16 mb-5 flex items-center justify-center">
        <motion.div
          className="absolute inset-0 rounded-full border border-sky-500/30"
          animate={{ scale: [1, 1.1, 1], opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-sky-400 border-r-blue-500"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
        />
        <motion.span
          className="text-xl"
          animate={{ scale: [0.95, 1.1, 0.95] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          ✨
        </motion.span>
      </div>

      <h4 className="text-sm font-semibold text-white font-heading tracking-tight mb-1">
        Generating your AI Content Kit...
      </h4>
      <p className="text-[11px] text-slate-400 font-mono mb-6">
        Synthesizing high-retention creator blueprint
      </p>

      {/* Step sequence with subtle fade + slide */}
      <div className="w-full max-w-xs flex flex-col gap-2">
        {LOADING_STEPS.map((step, i) => {
          const isDone = i < currentStep;
          const isActive = i === currentStep;
          return (
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: DURATION_NORMAL, ease: EASE_OUT }}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-left border transition-all duration-300 ${
                isActive
                  ? "bg-sky-500/10 border-sky-500/40 text-white shadow-[0_0_16px_rgba(14,165,233,0.15)]"
                  : isDone
                  ? "bg-[#12151E] border-[#202534] text-slate-300"
                  : "bg-[#0D0F15]/40 border-[#191D28] text-slate-500 opacity-60"
              }`}
            >
              <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0">
                {isDone ? (
                  <span className="text-emerald-400 font-bold text-[10px]">✓</span>
                ) : isActive ? (
                  <motion.span
                    animate={{ scale: [1, 1.35, 1] }}
                    transition={{ repeat: Infinity, duration: 1.1 }}
                    className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.9)]"
                  />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                )}
              </div>
              <span className="flex-1 font-mono text-[11px]">{step}</span>
              {isActive && (
                <span className="text-[10px] font-mono text-sky-400 font-medium">
                  Processing...
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// --- Multi-Platform Kit ---

interface Platform {
  id: string;
  name: string;
  icon: string;
  accent: string;
  ring: string;
  dot: string;
}

const PLATFORMS: Platform[] = [
  { id: "youtube", name: "YouTube", icon: "▶️", accent: "from-red-500/20 to-rose-500/10", ring: "border-rose-500/40", dot: "bg-rose-400" },
  { id: "tiktok", name: "TikTok", icon: "🎵", accent: "from-cyan-500/20 to-teal-500/10", ring: "border-cyan-500/40", dot: "bg-cyan-400" },
  { id: "reels", name: "Reels", icon: "📸", accent: "from-pink-500/20 to-fuchsia-500/10", ring: "border-pink-500/40", dot: "bg-pink-400" },
  { id: "twitter", name: "X", icon: "𝕏", accent: "from-sky-500/20 to-blue-500/10", ring: "border-sky-500/40", dot: "bg-sky-400" },
  { id: "linkedin", name: "LinkedIn", icon: "💼", accent: "from-blue-500/20 to-indigo-500/10", ring: "border-blue-500/40", dot: "bg-blue-400" },
];

interface PlatformSection {
  label: string;
  kind: "text" | "list";
  value: string | string[];
}

function PlatformSections({ sections, dot }: { sections: PlatformSection[]; dot: string }) {
  return (
    <div className="flex flex-col gap-3">
      {sections.map((s, i) => {
        const isList = Array.isArray(s.value);
        const list = isList ? (s.value as string[]) : [];
        const asChips = isList && list.every((v) => v.length <= 30);
        const copyAll = isList ? list.join(asChips ? " " : "\n") : (s.value as string);
        return (
          <motion.div
            key={`${s.label}-${i}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-xl bg-[#12151E] border border-[#202534] p-3.5"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <h5 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300">
                <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                {s.label}
              </h5>
              <CopyBtn text={copyAll} />
            </div>

            {!isList ? (
              <ScriptBody script={s.value as string} />
            ) : asChips ? (
              <div className="flex flex-wrap gap-1.5">
                {list.map((chip, ci) => (
                  <span
                    key={ci}
                    className="px-2 py-0.5 rounded-md bg-[#0D0F15] border border-[#202534] text-xs font-mono text-slate-300"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            ) : (
              <ol className="flex flex-col gap-2">
                {list.map((item, li) => (
                  <li
                    key={li}
                    className="flex items-start gap-2.5 p-2 rounded-lg bg-[#0D0F15] border border-[#202534] text-xs sm:text-sm text-slate-200"
                  >
                    <span className="shrink-0 mt-0.5 w-4 h-4 rounded bg-sky-500/20 text-sky-300 text-[10px] font-mono font-bold flex items-center justify-center">
                      {li + 1}
                    </span>
                    <span className="flex-1 font-sans">{item}</span>
                    <CopyBtn text={item} />
                  </li>
                ))}
              </ol>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function MultiPlatformSection({ topic, niche, score }: { topic: string; niche?: string; score: number }) {
  const [active, setActive] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, PlatformSection[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [needKey, setNeedKey] = useState(false);

  const activeMeta = PLATFORMS.find((p) => p.id === active) ?? null;
  const isLoading = loadingId !== null && loadingId === active;
  const activeError = active ? errors[active] : undefined;
  const activeSections = active ? cache[active] : undefined;

  async function generate(platform: string) {
    setLoadingId(platform);
    setNeedKey(false);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[platform];
      return next;
    });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      const res = await fetch("/api/platform-kit", {
        method: "POST",
        headers,
        body: JSON.stringify({ topic, niche: niche || "general", score, platform }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "missing_key") {
          setNeedKey(true);
          return;
        }
        const msg = data.error ?? "Failed to generate platform content.";
        setErrors((prev) => ({ ...prev, [platform]: msg }));
        return;
      }
      setCache((prev) => ({ ...prev, [platform]: data.sections }));
    } catch {
      setErrors((prev) => ({ ...prev, [platform]: "Something went wrong — try again." }));
    } finally {
      setLoadingId((id) => (id === platform ? null : id));
    }
  }

  function selectPlatform(platform: string) {
    setActive(platform);
    setNeedKey(false);
    if (!cache[platform] && loadingId !== platform) void generate(platform);
  }

  let viewKey = "empty";
  if (active) {
    if (needKey) viewKey = "needkey";
    else if (isLoading) viewKey = `loading-${active}`;
    else if (activeError) viewKey = `error-${active}`;
    else if (activeSections) viewKey = `content-${active}`;
    else viewKey = `idle-${active}`;
  }

  return (
    <div>
      {/* Platform tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {PLATFORMS.map((p) => {
          const isActive = p.id === active;
          return (
            <motion.button
              key={p.id}
              onClick={() => selectPlatform(p.id)}
              whileTap={{ scale: 0.95 }}
              className={`relative shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                isActive ? "text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="active-platform-pill"
                  className="absolute inset-0 rounded-lg bg-[#12151E] border border-sky-500/40"
                  transition={{ type: "spring", stiffness: 450, damping: 35 }}
                />
              )}
              <span className="relative z-10 text-sm leading-none">{p.icon}</span>
              <span className="relative z-10 font-sans">{p.name}</span>
              {cache[p.id] && (
                <span className="relative z-10 w-1.5 h-1.5 rounded-full bg-emerald-400" />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Platform content body */}
      <div className="mt-3">
        <AnimatePresence mode="wait">
          {viewKey === "empty" && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-6 rounded-2xl border border-dashed border-[#202534] bg-[#0D0F15] text-center"
            >
              <p className="text-xs text-slate-400 font-sans">
                Choose a platform tab above to generate platform-native hooks, descriptions, and hashtags.
              </p>
            </motion.div>
          )}

          {viewKey.startsWith("loading-") && (
            <motion.div
              key={viewKey}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-8 rounded-2xl border border-[#202534] bg-[#12151E] flex flex-col items-center justify-center text-center gap-3"
            >
              <div className="w-8 h-8 rounded-full border-2 border-sky-500/20 border-t-sky-400 animate-spin" />
              <p className="text-xs font-mono text-slate-300">
                Optimizing for {activeMeta?.name}…
              </p>
            </motion.div>
          )}

          {viewKey.startsWith("error-") && (
            <motion.div
              key={viewKey}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 flex items-center justify-between gap-3 text-xs"
            >
              <span className="text-rose-300 font-sans">{activeError}</span>
              <button
                onClick={() => active && generate(active)}
                className="shrink-0 px-3 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-mono uppercase text-[10px] font-bold transition"
              >
                Retry
              </button>
            </motion.div>
          )}

          {viewKey.startsWith("content-") && activeSections && (
            <motion.div
              key={viewKey}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <PlatformSections sections={activeSections} dot={activeMeta?.dot ?? "bg-sky-400"} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function ContentKitPanel({
  open,
  onClose,
  topic,
  niche,
  score,
  started,
  duration,
  onDurationChange,
  onGenerate,
  onReconfigure,
  loading,
  needKey,
  error,
  kit,
  saving,
  saved,
  onSave,
  onRetry,
}: PanelProps) {
  const selected = DURATIONS.find((d) => d.seconds === duration) ?? DURATIONS[1];
  

  

  
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm"
          />

          {/* Slide-out panel */}
          <motion.aside
            initial={{ x: "100%", opacity: 0.8 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.8 }}
            transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
            className="fixed top-0 right-0 z-50 h-full w-full sm:w-[560px] flex flex-col bg-[#0D0F15] border-l border-[#202534] shadow-[0_20px_60px_rgba(0,0,0,0.85)]"
          >
            {/* Header */}
            <div className="shrink-0 px-5 sm:px-6 py-4 border-b border-[#202534] bg-[#08090C]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                    <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400 font-semibold">
                      PIPELINE STAGE 04 • AI CREATIVE STUDIO
                    </span>
                    {score > 0 && (
                      <span className="text-[10px] font-mono font-bold text-sky-300 bg-sky-500/20 border border-sky-500/30 rounded px-2 py-0.5 tabular-nums">
                        {score}/100 Score
                      </span>
                    )}
                    
                  </div>
                  <h3 className="font-heading text-base sm:text-lg font-bold text-white tracking-tight leading-snug truncate" title={topic}>
                    {topic}
                  </h3>
                  <div className="mt-2 flex items-center gap-2">
                    <BrandVoiceBadge />
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="shrink-0 w-8 h-8 rounded-lg bg-[#12151E] hover:bg-[#1B2030] border border-[#202534] text-slate-400 hover:text-white transition-colors flex items-center justify-center font-mono text-xs cursor-pointer"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
              {/* Setup — pick script length before generating */}
              {!started && (
                <div className="flex flex-col py-2">
                  <SectionTitle icon="⏱️">Target Duration &amp; Pacing</SectionTitle>
                  <p className="text-slate-400 text-xs mb-4">
                    The AI paces the narrative beats, word counts, and call-to-action specifically for your selected format.
                  </p>
                  <div className="flex flex-col gap-2 mb-6">
                    {DURATIONS.map((d) => {
                      const active = d.seconds === duration;
                      return (
                        <motion.button
                          key={d.seconds}
                          onClick={() => onDurationChange(d.seconds)}
                          whileTap={{ scale: 0.99 }}
                          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-all cursor-pointer ${
                            active
                              ? "border-sky-500/60 bg-sky-500/15 shadow-[0_0_20px_-6px_rgba(14,165,233,0.25)]"
                              : "border-[#202534] bg-[#12151E] hover:bg-[#161A26]"
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <span
                              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                active ? "border-sky-400 bg-sky-500/30" : "border-slate-600"
                              }`}
                            >
                              {active && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
                            </span>
                            <span className="text-xs sm:text-sm font-semibold text-white font-sans">{d.label}</span>
                          </span>
                          <span className="flex items-center gap-2 text-[11px] font-mono">
                            <span className="text-slate-400">~{d.words} words</span>
                            <span
                              className={`px-2 py-0.5 rounded border text-[10px] uppercase font-semibold ${
                                d.format === "short-form"
                                    ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                                    : "text-blue-400 border-blue-500/30 bg-blue-500/10"
                              }`}
                            >
                              {d.format}
                            </span>
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>

                  <UsageSummary compact feature="content"/>

                    <button
                      type="button"
                      onClick={onGenerate}
                      className="w-full py-3 px-4 rounded-xl font-medium text-xs sm:text-sm bg-sky-500 hover:bg-sky-400 text-white shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                    >
                      <span>Generate Content Kit</span>
                      <span>✨</span>
                    </button>

                </div>
              )}

              {started && loading && <KitSkeleton />}

              {started && !loading && needKey && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="text-4xl mb-3">✨</div>
                  <h4 className="font-heading text-base font-bold text-white mb-2">Generation Unavailable</h4>
                  <p className="text-slate-400 text-xs max-w-xs mb-6">
                    AI Content Kit generation is temporarily unavailable. Please retry in a moment.
                  </p>
                  <button
                    onClick={onRetry}
                    className="px-5 py-2.5 rounded-full text-xs font-mono font-bold uppercase tracking-wider bg-sky-500 text-white hover:bg-sky-400 transition-colors shadow-sm shadow-sky-500/25 cursor-pointer"
                  >
                    ↻ Retry
                  </button>
                </div>
              )}

              {started && !loading && !needKey && error && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="text-4xl mb-3">
                    {error.toLowerCase().includes("credit") ? "⚡" : "⚠️"}
                  </div>
                  <h4 className="font-heading text-base font-semibold text-white mb-2">
                    {error.toLowerCase().includes("credit") ? "Insufficient Credits" : "Generation Failed"}
                  </h4>
                  <p className="text-rose-400 text-xs max-w-xs mb-6 font-sans">{error}</p>
                  {error.toLowerCase().includes("credit") ? (
                    <div className="flex items-center gap-3">
                      <Link
                        href="/pricing"
                        className="px-5 py-2.5 rounded-full text-xs font-mono font-bold uppercase tracking-wider bg-sky-500 text-white hover:bg-sky-400 transition-colors shadow-sm shadow-sky-500/25 cursor-pointer"
                      >
                        Upgrade Plan →
                      </Link>
                      <button
                        onClick={onReconfigure}
                        className="px-5 py-2.5 rounded-full text-xs font-mono font-semibold bg-[#12151E] border border-[#202534] hover:bg-[#1B2030] text-slate-300 transition-colors cursor-pointer"
                      >
                        Back
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={onRetry}
                      className="px-5 py-2 rounded-full text-xs font-mono font-semibold bg-[#12151E] border border-[#202534] hover:bg-[#1B2030] text-white transition-colors cursor-pointer"
                    >
                      ↻ Try again
                    </button>
                  )}
                </div>
              )}

              {started && !loading && !needKey && !error && kit && (
                <div className="flex flex-col gap-6">
                  {/* Credit deduction banner */}
                  

                  {/* 1. Trend Insight & Virality Score */}
                  <motion.section
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: DURATION_NORMAL, ease: EASE_OUT, delay: 0.04 }}
                    className="space-y-4"
                  >
                    {/* Virality / Opportunity Score Meter */}
                    <div className="p-4 rounded-xl bg-[#10141F] border border-sky-500/25 flex items-center justify-between shadow-sm">
                      <div>
                        <span className="text-[10px] font-mono uppercase font-semibold tracking-wider text-sky-400 block mb-0.5">
                          Virality &amp; Opportunity Score
                        </span>
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-mono font-bold text-2xl sm:text-3xl text-white tracking-tight tabular-nums">{score || 90}</span>
                          <span className="text-xs text-slate-500 font-mono">/ 100</span>
                        </div>
                        <span className="text-xs text-slate-400 block mt-0.5">
                          {score >= 80 ? "🔥 High Viral Potential" : score >= 60 ? "📈 Strong Trend Momentum" : "🌱 Emerging Opportunity"}
                        </span>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-[#08090C] border border-sky-500/30 flex items-center justify-center font-mono font-bold text-base text-sky-400">
                        {score || 90}%
                      </div>
                    </div>

                    {/* Why trending */}
                    <div>
                      <SectionTitle icon="📈">Why It&apos;s Trending</SectionTitle>
                      <div className="group relative rounded-xl bg-[#12151E] border border-[#202534] p-4">
                        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed pr-2 font-sans">{kit.why_trending}</p>
                        <div className="mt-3 flex justify-end">
                          <CopyBtn text={kit.why_trending} />
                        </div>
                      </div>
                    </div>

                    {/* Quick facts */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-xl bg-[#12151E] border border-sky-500/20 p-4">
                        <SectionTitle icon="🎬">Best Format</SectionTitle>
                        <div className="flex items-start gap-3">
                          <p className="flex-1 text-xs sm:text-sm text-slate-200 leading-snug font-sans">{kit.best_format}</p>
                          <CopyBtn text={kit.best_format} />
                        </div>
                      </div>
                      <div className="rounded-xl bg-[#12151E] border border-cyan-500/20 p-4">
                        <SectionTitle icon="⏳">Catch Window</SectionTitle>
                        <div className="flex items-start gap-3">
                          <p className="flex-1 text-xs sm:text-sm text-slate-200 leading-snug font-sans">{kit.catch_window}</p>
                          <CopyBtn text={kit.catch_window} />
                        </div>
                      </div>
                    </div>
                  </motion.section>

                  {/* 2. Scroll-Stopping Hooks */}
                  <motion.section
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: DURATION_NORMAL, ease: EASE_OUT, delay: 0.12 }}
                  >
                    <SectionTitle icon="🪝">Scroll-Stopping Hooks</SectionTitle>
                    <ItemList items={kit.hooks} />
                  </motion.section>

                  {/* 3. Viral High-CTR Titles */}
                  <motion.section
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: DURATION_NORMAL, ease: EASE_OUT, delay: 0.18 }}
                  >
                    <SectionTitle icon="🏆">Viral High-CTR Titles</SectionTitle>
                    <ItemList items={kit.titles} />
                  </motion.section>

                  {/* 4. Thumbnail Concepts */}
                  <motion.section
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: DURATION_NORMAL, ease: EASE_OUT, delay: 0.24 }}
                  >
                    <SectionTitle icon="🖼️">Thumbnail Concepts</SectionTitle>
                    <ItemList items={kit.thumbnail_ideas} />
                  </motion.section>

                  {/* 5. Creative Script Workspace */}
                  {kit.script && (() => {
                    const words = countWords(kit.script);
                    return (
                      <motion.section
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: DURATION_NORMAL, ease: EASE_OUT, delay: 0.3 }}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <SectionTitle icon="🎥">Creative Script Workspace</SectionTitle>
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/create?topic=${encodeURIComponent(topic)}&script=${encodeURIComponent(kit.script)}`}
                              className="px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider font-bold bg-sky-500/15 border border-sky-500/40 text-sky-300 hover:bg-sky-500/25 transition-all flex items-center gap-1 cursor-pointer"
                              title="Advance to Voiceover stage"
                            >
                              <span>🎙️ Create Voiceover</span>
                              <span>→</span>
                            </Link>
                            <CopyBtn text={kit.script} />
                          </div>
                        </div>
                        <div className="rounded-2xl border border-[#202534] bg-[#08090C] p-4 font-mono">
                          <div className="flex flex-wrap items-center gap-2 mb-3">
                            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full border border-sky-500/30 bg-sky-500/15 text-sky-300 font-semibold">
                              {selected.label}
                            </span>
                            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full border border-[#202534] bg-[#12151E] text-slate-400">
                              {words} words
                              <span className="text-slate-500"> / ~{selected.words} target</span>
                            </span>
                          </div>
                          <ScriptBody script={kit.script} />
                          <div className="mt-3 pt-3 border-t border-[#202534] flex items-center justify-between text-[10px] font-mono text-slate-500">
                            <div className="flex items-center gap-1.5">
                              <span>⏱️</span>
                              <span>Est. read / record time {readTime(words)}</span>
                            </div>
                            <Link
                              href={`/create?topic=${encodeURIComponent(topic)}&script=${encodeURIComponent(kit.script)}`}
                              className="text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1"
                            >
                              <span>Send to AI Studio</span>
                              <span>→</span>
                            </Link>
                          </div>
                        </div>
                      </motion.section>
                    );
                  })()}

                  {/* 6. Content Angles & Virality Tips */}
                  <motion.section
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: DURATION_NORMAL, ease: EASE_OUT, delay: 0.36 }}
                    className="space-y-6"
                  >
                    <div>
                      <SectionTitle icon="🎯">Content Angles</SectionTitle>
                      <ItemList items={kit.content_angles} />
                    </div>
                    <div>
                      <SectionTitle icon="🚀">Virality Tips</SectionTitle>
                      <ItemList items={kit.virality_tips} />
                    </div>
                  </motion.section>

                  {/* 7. Multi-platform repurposing */}
                  <motion.section
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: DURATION_NORMAL, ease: EASE_OUT, delay: 0.42 }}
                  >
                    <SectionTitle icon="🌐">Multi-Platform Studio</SectionTitle>
                    <p className="text-xs text-slate-400 -mt-1 mb-3 font-sans">
                      Instantly repurpose this trend with content optimized for each algorithm.
                    </p>
                    <MultiPlatformSection key={topic} topic={topic} niche={niche} score={score} />
                  </motion.section>
                </div>
              )}
            </div>

            {/* Footer — Save Report */}
            {started && !loading && !needKey && !error && kit && (
              <div className="shrink-0 px-5 sm:px-6 py-4 border-t border-[#202534] bg-[#08090C] flex gap-3">
                <motion.button
                  onClick={onReconfigure}
                  whileTap={{ scale: 0.98 }}
                  title="Pick a different length and regenerate"
                  className="shrink-0 px-4 py-2 rounded-xl text-xs font-mono font-medium bg-[#12151E] border border-[#202534] hover:bg-[#1B2030] text-slate-300 transition cursor-pointer"
                >
                  ⏱️ Length
                </motion.button>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saving || saved}
                  className="flex-1 py-2 px-3 rounded-lg text-xs font-medium bg-sky-500 hover:bg-sky-400 text-white shadow-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                >
                  {saving ? "Saving to Projects…" : saved ? "✅ Saved to Projects" : "💾 Save to Projects"}
                </button>
                <Link
                  href={`/create?topic=${encodeURIComponent(topic)}&script=${encodeURIComponent(kit.script)}`}
                  className="shrink-0 px-3 py-2 rounded-lg text-xs font-medium bg-[#11141E] hover:bg-[#161B28] border border-[#202738] text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Open in AI Studio to create voiceover & captions"
                >
                  <span>🎙️ Studio</span>
                  <span>→</span>
                </Link>
                {saved && (
                  <Link
                    href="/projects"
                    className="shrink-0 px-3 py-2 rounded-lg text-xs font-medium bg-[#11141E] border border-[#202534] hover:bg-[#161B28] text-slate-300 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span>Projects</span>
                    <span>→</span>
                  </Link>
                )}
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
