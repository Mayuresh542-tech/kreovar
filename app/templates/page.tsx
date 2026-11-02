"use client";

import { useState, useMemo, Suspense } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Play, Sparkles } from "lucide-react";
import StudioShell from "../components/StudioShell";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import { useAuthGate } from "../lib/useAuthGate";

interface TemplateItem {
  id: string;
  name: string;
  category: "Trending" | "Business" | "Education" | "Lifestyle" | "Gaming";
  thumbnail: string;
  duration: string;
  description: string;
}

const TEMPLATES_DATA: TemplateItem[] = [
  {
    id: "tmpl_modern_vlog",
    name: "Modern Vlog",
    category: "Lifestyle",
    thumbnail: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=70",
    duration: "0:45",
    description: "Dynamic jump cuts with aesthetic color grading and kinetic captions.",
  },
  {
    id: "tmpl_product_review",
    name: "Product Review",
    category: "Trending",
    thumbnail: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=70",
    duration: "0:30",
    description: "Fast-paced B-roll transitions with highlighted feature callouts.",
  },
  {
    id: "tmpl_business_tips",
    name: "Business Tips",
    category: "Business",
    thumbnail: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600&auto=format&fit=crop&q=70",
    duration: "1:00",
    description: "Professional talking head layout with bullet point reveals and lower-thirds.",
  },
  {
    id: "tmpl_educational",
    name: "Educational",
    category: "Education",
    thumbnail: "https://images.unsplash.com/photo-1577896851231-70ef18881754?w=600&auto=format&fit=crop&q=70",
    duration: "0:50",
    description: "Clear explanatory pacing with illustrated diagrams and word-by-word subtitles.",
  },
  {
    id: "tmpl_motivational",
    name: "Motivational",
    category: "Lifestyle",
    thumbnail: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600&auto=format&fit=crop&q=70",
    duration: "0:40",
    description: "Cinematic atmospheric background clips with bold inspirational hooks.",
  },
  {
    id: "tmpl_gaming_highlights",
    name: "Gaming Highlights",
    category: "Gaming",
    thumbnail: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=70",
    duration: "0:35",
    description: "High-energy speed ramps, punchy zoom-ins, and animated gaming emojis.",
  },
];

const CATEGORIES = ["All", "Trending", "Business", "Education", "Lifestyle", "Gaming"] as const;

function TemplatesContent() {
  const router = useRouter();
  const { status } = useAuthGate();
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const filteredTemplates = useMemo(() => {
    if (selectedCategory === "All") return TEMPLATES_DATA;
    return TEMPLATES_DATA.filter((t) => t.category === selectedCategory);
  }, [selectedCategory]);

  if (status !== "authed") {
    return <AuthLoadingScreen label="Loading video templates…" />;
  }

  function handleUseTemplate(template: TemplateItem) {
    router.push(`/create?topic=${encodeURIComponent(template.name + " Video")}`);
  }

  return (
    <StudioShell active="templates">
      <div className="space-y-8 pb-12">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Templates
          </h1>
          <p className="text-sm text-slate-500">
            Start with a ready-to-use template or create from scratch.
          </p>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  isActive
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* 3-Column Templates Grid (Screen 5) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              onClick={() => handleUseTemplate(template)}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-slate-300 hover:shadow-xs transition-all cursor-pointer group flex flex-col"
            >
              {/* Thumbnail Container */}
              <div className="relative aspect-video w-full bg-slate-100 overflow-hidden">
                <img
                  src={template.thumbnail}
                  alt={template.name}
                  className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-black/10 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                  <div className="w-9 h-9 rounded-full bg-white/90 shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play className="w-4 h-4 text-slate-900 ml-0.5" />
                  </div>
                </div>
                <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 text-[10px] font-mono text-white">
                  {template.duration}
                </span>
              </div>

              {/* Template Info & Action */}
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                    {template.name}
                  </h3>
                  <span className="text-xs text-slate-400 mt-0.5 block">
                    {template.category}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUseTemplate(template);
                  }}
                  className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors shrink-0"
                  title="Use Template"
                >
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </StudioShell>
  );
}

export default function TemplatesPage() {
  return (
    <Suspense fallback={<AuthLoadingScreen label="Loading video templates…" />}>
      <TemplatesContent />
    </Suspense>
  );
}
