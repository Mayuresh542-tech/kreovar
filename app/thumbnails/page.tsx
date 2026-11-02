"use client";
import GenerationComingSoon from "../components/GenerationComingSoon";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Download,
  FolderPlus,
  ArrowRight,
  Layers,
  Palette,
  Eye,
  CheckCircle2,
  RefreshCw,
  Sliders,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import StudioShell from "../components/StudioShell";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import { useAuthGate } from "../lib/useAuthGate";
import AddToProjectModal from "../components/projects/AddToProjectModal";

interface ThumbnailVariant {
  id: string;
  title: string;
  style: string;
  headlineText: string;
  badgeText?: string;
  visualDescription: string;
  backgroundGradient: string;
  imageUrl: string;
  contrastScore: number;
}

const STYLE_PRESETS = [
  { id: "youtube_bold", label: "YouTube Viral High CTR", icon: "🔥", desc: "Bold typography, punchy badges, high contrast" },
  { id: "minimalist", label: "Minimalist Clean", icon: "✨", desc: "Refined monochrome aesthetics, sleek spacing" },
  { id: "cinematic", label: "Cinematic Dark", icon: "🎬", desc: "Moody studio lighting, deep shadows, dramatic rim light" },
  { id: "tech_saas", label: "Tech & SaaS Product", icon: "💻", desc: "Modern UI elements, gradient mesh, clean tech font" },
  { id: "split_contrast", label: "Contrasting Split", icon: "⚡", desc: "Side-by-side comparison, polarizing hook visual" },
];

function ThumbnailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useAuthGate();

  const [prompt, setPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("youtube_bold");
  const [headlineOverride, setHeadlineOverride] = useState("");
  const [badgeOverride, setBadgeOverride] = useState("");
  const [generating, setGenerating] = useState(false);
  const [variants, setVariants] = useState<ThumbnailVariant[]>([]);
  const [activeVariant, setActiveVariant] = useState<ThumbnailVariant | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Add to Project Modal State
  const [isAddToProjectOpen, setIsAddToProjectOpen] = useState(false);
  const [savingVariant, setSavingVariant] = useState<ThumbnailVariant | null>(null);

  useEffect(() => {
    const q = searchParams.get("prompt") || searchParams.get("topic") || searchParams.get("title");
    if (q) {
      setPrompt(q);
    } else {
      setPrompt("5 AI Tools You Need in 2026");
    }
  }, [searchParams]);

  async function handleGenerate(topicQuery?: string, styleChoice?: string) {
    const topic = (topicQuery ?? prompt).trim();
    if (!topic) return;

    setGenerating(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in to generate thumbnails.");
      const res = await fetch("/api/thumbnails/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          prompt: topic,
          style: styleChoice || selectedStyle,
          scriptContext: searchParams.get("script") || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate thumbnails");
      }

      setVariants(data.variants || []);
      if (data.variants && data.variants.length > 0) {
        setActiveVariant(data.variants[0]);
      }
    } catch (err: any) {
      setError(err?.message || "Generation failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  function handleSaveToProject(variant: ThumbnailVariant) {
    setSavingVariant(variant);
    setIsAddToProjectOpen(true);
  }

  if (status !== "authed") {
    return <AuthLoadingScreen label="Loading Thumbnail Studio…" />;
  }

  return (
    <StudioShell active="thumbnails">
      <div className="max-w-6xl mx-auto w-full space-y-6 pb-16">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-semibold">
                INDEPENDENT CREATION STUDIO
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              AI Thumbnail Generator
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Design viral, high-CTR YouTube and social video thumbnails with AI styling and bold typography.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/projects")}
              className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              All Projects
            </button>
          </div>
        </div>

        {/* Input & Style Configuration Form */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-xs">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left 2 Cols: Prompt & Text Customization */}
            <div className="lg:col-span-2 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Video Topic or Concept Prompt
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                    placeholder="e.g. 5 AI Tools You Need in 2026, Stop Making This Coding Mistake..."
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all font-sans"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Custom Headline Overlay (Optional)
                  </label>
                  <input
                    type="text"
                    value={headlineOverride}
                    onChange={(e) => setHeadlineOverride(e.target.value)}
                    placeholder="Auto-generated if empty"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-slate-700 font-sans"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Alert Badge Text (Optional)
                  </label>
                  <input
                    type="text"
                    value={badgeOverride}
                    onChange={(e) => setBadgeOverride(e.target.value)}
                    placeholder="e.g. NEW, 10X, WARNING"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-slate-700 font-sans"
                  />
                </div>
              </div>
            </div>

            {/* Right Col: Style Selection */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Visual Aesthetic
              </label>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {STYLE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setSelectedStyle(preset.id);
                      if (prompt) handleGenerate(prompt, preset.id);
                    }}
                    className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all flex items-start gap-2.5 cursor-pointer ${
                      selectedStyle === preset.id
                        ? "border-slate-900 bg-slate-50 text-slate-900 font-medium"
                        : "border-slate-200 hover:border-slate-300 text-slate-600"
                    }`}
                  >
                    <span className="text-base">{preset.icon}</span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900">{preset.label}</div>
                      <div className="text-[10px] text-slate-500 truncate">{preset.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <div className="text-xs text-slate-500">
              Generates 3 distinctive, production-ready thumbnail compositions.
            </div>

            <button
              type="button"
              disabled={generating || !prompt.trim()}
              onClick={() => handleGenerate()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {generating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing Concepts…</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate Thumbnails</span>
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-800 font-mono">
              Dismiss
            </button>
          </div>
        )}

        {/* Main Canvas / Active Preview Section */}
        {activeVariant && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <span>Selected Composition</span>
                <span className="text-xs font-normal text-slate-500 font-mono">
                  ({activeVariant.title})
                </span>
              </h2>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveToProject(activeVariant)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors shadow-xs cursor-pointer"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>Add to Project</span>
                </button>
                <a
                  href={activeVariant.imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  download={`veelox-thumbnail-${activeVariant.id}.jpg`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Image</span>
                </a>
              </div>
            </div>

            {/* Live 16:9 Thumbnail Render Preview */}
            <div className="relative aspect-video max-w-4xl mx-auto rounded-2xl overflow-hidden shadow-md border border-slate-200 bg-slate-950 flex flex-col justify-between p-6 sm:p-10 select-none">
              {/* Background Image / Texture */}
              <img
                src={activeVariant.imageUrl}
                alt="Thumbnail Backdrop"
                className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-overlay pointer-events-none"
              />
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(circle at 75% 30%, rgba(59, 130, 246, 0.25) 0%, rgba(0, 0, 0, 0.75) 80%)",
                }}
              />

              {/* Top Alert Badge */}
              <div className="relative z-10">
                {(badgeOverride || activeVariant.badgeText) && (
                  <span className="inline-block px-3 py-1 rounded-md bg-amber-400 text-slate-950 text-xs sm:text-sm font-black uppercase tracking-wider shadow-md">
                    {badgeOverride || activeVariant.badgeText}
                  </span>
                )}
              </div>

              {/* Bold Viral Headline */}
              <div className="relative z-10 max-w-2xl space-y-2">
                <h3 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white uppercase tracking-tight leading-[0.95] drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)]">
                  {headlineOverride || activeVariant.headlineText}
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 font-medium line-clamp-2 max-w-xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                  {activeVariant.visualDescription}
                </p>
              </div>

              {/* Bottom Metrics Bar */}
              <div className="relative z-10 flex items-center justify-between text-[11px] text-white/80 font-mono pt-2 border-t border-white/10">
                <span>Kreovar Visual Studio • 16:9 HD</span>
                <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Estimated CTR Index: {activeVariant.contrastScore}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Variants Carousel / Grid */}
        <div className="space-y-3 pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 font-mono">
              Available Generated Versions ({variants.length})
            </h3>
            <span className="text-xs text-slate-400">
              Click any variant to preview &amp; customize
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {variants.map((v) => {
              const isSelected = activeVariant?.id === v.id;
              return (
                <div
                  key={v.id}
                  onClick={() => setActiveVariant(v)}
                  className={`group relative rounded-xl border p-3 bg-white transition-all cursor-pointer ${
                    isSelected
                      ? "border-slate-900 ring-2 ring-slate-900/10 shadow-sm"
                      : "border-slate-200 hover:border-slate-300 hover:shadow-xs"
                  }`}
                >
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-900 mb-2.5">
                    <img
                      src={v.imageUrl}
                      alt={v.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-2.5 flex flex-col justify-end">
                      <div className="text-[10px] font-black text-amber-400 uppercase tracking-wide">
                        {v.badgeText}
                      </div>
                      <div className="text-xs font-black text-white uppercase leading-tight line-clamp-2">
                        {v.headlineText}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {v.title}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Score: {v.contrastScore}% CTR
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSaveToProject(v);
                      }}
                      className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold transition-colors"
                    >
                      + Save
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Universal Add to Project Modal */}
      {savingVariant && (
        <AddToProjectModal
          isOpen={isAddToProjectOpen}
          onClose={() => {
            setIsAddToProjectOpen(false);
            setSavingVariant(null);
          }}
          assetType="thumbnail"
          assetItem={{
            title: savingVariant.title,
            image_url: savingVariant.imageUrl,
            style: savingVariant.style,
            headline_text: headlineOverride || savingVariant.headlineText,
            badge_text: badgeOverride || savingVariant.badgeText,
          }}
          defaultTitle={prompt || "New Video Project"}
        />
      )}
    </StudioShell>
  );
}

function ThumbnailsPagePreview() {
  return (
    <Suspense fallback={<AuthLoadingScreen label="Loading Thumbnail Studio…" />}>
      <ThumbnailsContent />
    </Suspense>
  );
}

const GENERATION_AVAILABLE = false;
export default function ThumbnailsPage() { return GENERATION_AVAILABLE ? <ThumbnailsPagePreview /> : <GenerationComingSoon kind="thumbnail" />; }
