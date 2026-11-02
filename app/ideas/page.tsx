"use client";
import UsageSummary from "../components/UsageSummary";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lightbulb,
  Sparkles,
  ArrowRight,
  FolderPlus,
  Edit3,
  Copy,
  Check,
  TrendingUp,
  Tag,
  Search,
} from "lucide-react";
import StudioShell from "../components/StudioShell";
import ContentWorkflow from "../components/ContentWorkflow";
import {saveTextAsset} from "../lib/assets/client";
import {workflowUrl} from "../lib/content/workflow";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import { useAuthGate } from "../lib/useAuthGate";
import AddToProjectModal from "../components/projects/AddToProjectModal";
import { supabase } from "../lib/supabase";

interface ContentIdeaItem {
  id: string;
  title: string;
  hook: string;
  angle: string;
  format: string;
  score: number;
  category: string;
}

const NICHE_PRESETS = [
  "All Niches",
  "Tech & AI",
  "Creator Economy",
  "Productivity",
  "Business & SaaS",
  "Finance & Crypto",
];

function IdeasContent() {
  const router = useRouter();
  const [libraryMessage,setLibraryMessage]=useState("");
  const [unsaved,setUnsaved]=useState<{title:string;text:string;topic:string}|null>(null);
  async function saveWork(title:string,text:string,topic=title){
    setLibraryMessage("Saving to Asset Library…");setUnsaved({title,text,topic});
    try{await saveTextAsset("ideas",title,text,topic);setUnsaved(null);setLibraryMessage("Saved to Asset Library");}catch{setLibraryMessage("Your result is ready, but saving failed. Retry below.");}
  }
  const searchParams = useSearchParams();
  const { status, session } = useAuthGate();

  const [topicPrompt, setTopicPrompt] = useState("");
  const [selectedNiche, setSelectedNiche] = useState("All Niches");
  const [ideas, setIdeas] = useState<ContentIdeaItem[]>([]);
  const generationPending = useRef(false);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  // Add to Project Modal State
  const [isAddToProjectOpen, setIsAddToProjectOpen] = useState(false);
  const [selectedIdeaToSave, setSelectedIdeaToSave] = useState<ContentIdeaItem | null>(null);

  useEffect(() => {
    const q = searchParams.get("topic") || searchParams.get("trend");
    if (q) {
      setTopicPrompt(q);
    }
  }, [searchParams]);

  async function handleGenerate(overridePrompt?: string) {
    const topic = (overridePrompt ?? topicPrompt).trim();
    if (!topic || generationPending.current || status !== "authed") return;
    generationPending.current = true;

    setGenerating(true);
    setGenerationError(null);

    try {
      const token = session?.access_token || "";
      const res = await fetch("/api/content-kit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          topic,
          mode: "ideas",
          niche: selectedNiche === "All Niches" ? "Tech & AI" : selectedNiche,
          score: 90,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.kit) throw new Error(data.error || "Idea generation is temporarily unavailable.");
      if (res.ok && data.kit) {
        const kit = data.kit;
        const generatedList: ContentIdeaItem[] = kit.titles.map((titleStr: string, idx: number) => ({
          id: `idea_gen_${Date.now()}_${idx}`,
          title: titleStr,
          hook: kit.hooks?.[idx % (kit.hooks?.length || 1)] || "Stop scrolling if you want to master this.",
          angle: kit.content_angles?.[idx % (kit.content_angles?.length || 1)] || "Tactical real-world implementation.",
          format: kit.best_format || "Shorts / Reels (60s)",
          score: 92 + Math.floor(Math.random() * 6),
          category: selectedNiche === "All Niches" ? "Viral Content" : selectedNiche,
        }));
        setIdeas(generatedList);
        await saveWork("Ideas — "+topic,generatedList.map(i=>i.title+"\nHook: "+i.hook+"\nAngle: "+i.angle).join("\n\n"),topic);
      }
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : "Idea generation failed. Please retry.");
    } finally {
      generationPending.current = false;
      setGenerating(false);
    }
  }

  function handleCopy(idea: ContentIdeaItem) {
    navigator.clipboard.writeText(`${idea.title}\n\nHook: ${idea.hook}\nAngle: ${idea.angle}`);
    setCopiedId(idea.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleSaveIdea(idea: ContentIdeaItem) {
    setSelectedIdeaToSave(idea);
    setIsAddToProjectOpen(true);
  }

  function handleSaveEdit(id: string) {
    setIdeas((prev) =>
      prev.map((i) => (i.id === id ? { ...i, title: editingTitle } : i))
    );
    setEditingIdeaId(null);
  }

  const displayedIdeas = ideas.filter(
    (i) => selectedNiche === "All Niches" || i.category === selectedNiche
  );

  if (status !== "authed") {
    return <AuthLoadingScreen label="Loading Content Ideas…" />;
  }

  return (
    <StudioShell active="ideas">
      <div className="mb-5 space-y-3"><UsageSummary compact feature="content"/><ContentWorkflow step="ideas" topic={topicPrompt}/>{libraryMessage&&<p role="status" className="text-sm text-slate-600">{libraryMessage}</p>}{unsaved&&libraryMessage.includes("failed")&&<button type="button" className="text-sm underline" onClick={()=>void saveWork(unsaved.title,unsaved.text,unsaved.topic)}>Retry saving</button>}</div>
      <div className="max-w-5xl mx-auto w-full space-y-6 pb-16">
        {generationError && <p role="alert" className="text-sm text-red-600">{generationError}</p>}
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-semibold">
                INDEPENDENT CREATION STUDIO
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Content Ideas Generator
            </h1>
            
          </div>

          <button
            type="button"
            onClick={() => router.push(workflowUrl("trends",topicPrompt,searchParams.get("projectId")))}
            className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer self-start sm:self-auto"
          >
            Explore Trends
          </button>
        </div>

        {/* Prompt Input Form */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-xs">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Target Topic, Keyword, or Core Concept
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={topicPrompt}
                  onChange={(e) => setTopicPrompt(e.target.value)}
                  placeholder="e.g. AI video editing workflows, remote work productivity, startup marketing..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-slate-900 font-sans"
                />
              </div>

              <button
                type="button"
                disabled={generating || !topicPrompt.trim()}
                onClick={() => handleGenerate()}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{generating ? "Generating Ideas…" : "Generate Ideas"}</span>
              </button>
            </div>
          </div>

          {/* Niche Pills */}
          <div className="vx-mobile-wrap flex items-center gap-2 overflow-x-auto pt-1 pb-1">
            {NICHE_PRESETS.map((niche) => (
              <button
                key={niche}
                type="button"
                onClick={() => setSelectedNiche(niche)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                  selectedNiche === niche
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {niche}
              </button>
            ))}
          </div>
        </div>

        {/* Ideas Grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <span>Viral Content Concepts</span>
              <span className="text-xs font-normal text-slate-400 font-mono">
                ({displayedIdeas.length})
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-3.5">
            {displayedIdeas.map((idea) => {
              const isEditing = editingIdeaId === idea.id;
              return (
                <div
                  key={idea.id}
                  className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 hover:border-slate-300 hover:shadow-xs transition-all space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          {idea.category}
                        </span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                          {idea.format}
                        </span>
                        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {idea.score}% Virality Index
                        </span>
                      </div>

                      {isEditing ? (
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-semibold text-slate-900 focus:outline-none focus:border-slate-900"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(idea.id)}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <h3 className="text-base font-semibold text-slate-900 leading-snug">
                          {idea.title}
                        </h3>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => handleCopy(idea)}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        title="Copy Idea"
                      >
                        {copiedId === idea.id ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingIdeaId(idea.id);
                          setEditingTitle(idea.title);
                        }}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        title="Edit Idea"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSaveIdea(idea)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
                      >
                        <FolderPlus className="w-3.5 h-3.5" />
                        <span>Add to Project</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          router.push(workflowUrl("script",idea.title,searchParams.get("projectId")))
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors shadow-xs cursor-pointer"
                      >
                        <span>Create Script</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Hook and Angle Callout Box */}
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-1.5 text-xs">
                    <div>
                      <span className="font-semibold text-slate-700">Opening Hook (0-3s): </span>
                      <span className="text-slate-600 italic">&ldquo;{idea.hook}&rdquo;</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700">Unique Angle: </span>
                      <span className="text-slate-600">{idea.angle}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Universal Add to Project Modal */}
      {selectedIdeaToSave && (
        <AddToProjectModal
          isOpen={isAddToProjectOpen}
          onClose={() => {
            setIsAddToProjectOpen(false);
            setSelectedIdeaToSave(null);
          }}
          assetType="idea"
          assetItem={{
            title: selectedIdeaToSave.title,
            hook: selectedIdeaToSave.hook,
            angle: selectedIdeaToSave.angle,
            format: selectedIdeaToSave.format,
            score: selectedIdeaToSave.score,
          }}
          defaultTitle={selectedIdeaToSave.title}
        />
      )}
    </StudioShell>
  );
}

export default function IdeasPage() {
  return (
    <Suspense fallback={<AuthLoadingScreen label="Loading Content Ideas…" />}>
      <IdeasContent />
    </Suspense>
  );
}
