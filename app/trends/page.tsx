"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, ChevronDown, FolderPlus } from "lucide-react";
import StudioShell from "../components/StudioShell";
import ContentWorkflow from "../components/ContentWorkflow";
import {saveTextAsset} from "../lib/assets/client";
import {workflowUrl} from "../lib/content/workflow";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import { useAuthGate } from "../lib/useAuthGate";
import AddToProjectModal from "../components/projects/AddToProjectModal";

interface TrendTopic {
  id: string;
  title: string;
  category: string;
  badge: "Trending" | "High Growth" | "Low Competition";
  why: string;
  score?: number;
}

const INITIAL_TRENDING_TOPICS: TrendTopic[] = [
  {
    id: "trend_1",
    title: "AI coding agents are trending",
    category: "Tech",
    badge: "High Growth",
    why: "More developers are using AI coding assistants to build software faster.",
    score: 98,
  },
  {
    id: "trend_2",
    title: "5 AI tools replacing traditional workflows",
    category: "Business",
    badge: "Trending",
    why: "Companies are adopting AI tools to automate repetitive tasks and save costs.",
    score: 94,
  },
  {
    id: "trend_3",
    title: "AI in healthcare is the next big thing",
    category: "Health",
    badge: "High Growth",
    why: "More innovation and funding in AI healthcare diagnostics and patient care.",
    score: 91,
  },
  {
    id: "trend_4",
    title: "Best AI tools for content creators",
    category: "Creator",
    badge: "Trending",
    why: "Creators are looking for better AI tools to edit videos and generate viral hooks.",
    score: 89,
  },
  {
    id: "trend_5",
    title: "Automated faceless channels on YouTube",
    category: "Creator",
    badge: "Low Competition",
    why: "Rising viewer appetite for automated story channels with animated captions.",
    score: 86,
  },
];

const FILTER_PILLS = ["All", "Trending", "High Growth", "Low Competition"] as const;
type FilterPill = typeof FILTER_PILLS[number];

function TrendsContent() {
  const router = useRouter();
  const [libraryMessage,setLibraryMessage]=useState("");
  const [unsaved,setUnsaved]=useState<{title:string;text:string;topic:string}|null>(null);
  async function saveWork(title:string,text:string,topic=title){
    setLibraryMessage("Saving to Asset Library…");setUnsaved({title,text,topic});
    try{await saveTextAsset("trends",title,text,topic);setUnsaved(null);setLibraryMessage("Saved to Asset Library");}catch{setLibraryMessage("Your result is ready, but saving failed. Retry below.");}
  }
  const searchParams = useSearchParams();
  const { status } = useAuthGate();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterPill>("All");
  const [trends, setTrends] = useState<TrendTopic[]>(INITIAL_TRENDING_TOPICS);
  const [loading, setLoading] = useState(false);
  const [isAddToProjectOpen, setIsAddToProjectOpen] = useState(false);
  const [selectedTopicToSave, setSelectedTopicToSave] = useState<TrendTopic | null>(null);

  useEffect(() => {
    if (status === "unauthed") {
      router.replace("/login");
    }
  }, [status, router]);

  // Handle URL query if passed
  useEffect(() => {
    const q = searchParams?.get("q") || searchParams?.get("niche");
    if (q) {
      setSearchQuery(q);
      executeSearch(q);
    }
  }, [searchParams]);

  async function executeSearch(queryToSearch?: string) {
    const q = (queryToSearch ?? searchQuery).trim();
    if (!q) {
      setTrends(INITIAL_TRENDING_TOPICS);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/trends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche: q }),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.trends) && data.trends.length > 0) {
          const mapped: TrendTopic[] = data.trends.slice(0, 10).map((t: any, i: number) => ({
            id: `trend_api_${i}`,
            title: t.title,
            category: t.category || "Tech",
            badge: (t.trendScore > 85 ? "High Growth" : "Trending") as TrendTopic["badge"],
            why: `High audience interest detected across ${t.source || "Google Trends & YouTube"} with strong engagement velocity.`,
            score: t.trendScore || 85,
          }));
          setTrends(mapped);
          await saveWork("Trends — "+q,mapped.map(t=>t.title+"\n"+t.category+"\n"+t.why).join("\n\n"),q);
          return;
        }
      }
    } catch (err) {
      console.error("Trends search error:", err);
    } finally {
      setLoading(false);
    }

    // Filter fallback
    const filtered = INITIAL_TRENDING_TOPICS.filter((t) =>
      t.title.toLowerCase().includes(q.toLowerCase()) ||
      t.category.toLowerCase().includes(q.toLowerCase()) ||
      t.why.toLowerCase().includes(q.toLowerCase())
    );
    setTrends(filtered.length > 0 ? filtered : INITIAL_TRENDING_TOPICS);
  }

  function handleCreateIdea(topic: TrendTopic) {
    router.push(workflowUrl("ideas",topic.title,searchParams.get("projectId")));
  }

  // Filtered and sorted topics
  const displayedTopics = useMemo(() => {
    return trends.filter((item) => {
      if (activeFilter === "All") return true;
      return item.badge === activeFilter;
    });
  }, [trends, activeFilter]);

  if (status !== "authed") {
    return <AuthLoadingScreen label="Scanning viral trend signals…" />;
  }

  return (
    <StudioShell active="trends">
      <div className="mb-5 space-y-3"><ContentWorkflow step="trends" topic={searchQuery}/>{libraryMessage&&<p role="status" className="text-sm text-slate-600">{libraryMessage}</p>}{unsaved&&libraryMessage.includes("failed")&&<button type="button" className="text-sm underline" onClick={()=>void saveWork(unsaved.title,unsaved.text,unsaved.topic)}>Retry saving</button>}</div>
      <div className="space-y-8 pb-12">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Find content ideas
          </h1>
          
        </div>

        {/* Search Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            executeSearch();
          }}
          className="relative flex items-center max-w-2xl"
        >
          <div className="relative w-full flex items-center">
            <Search className="absolute left-3.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search topic..."
              className="w-full pl-10 pr-12 py-2.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 shadow-xs focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition-all"
            />
            <button
              type="submit"
              className="absolute right-1.5 p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition-colors"
              disabled={loading}
              aria-label={loading ? "Searching trends…" : "Search"}
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        {/* Filter Pills */}
        <div className="vx-mobile-wrap flex items-center gap-2 overflow-x-auto pb-1">
          {FILTER_PILLS.map((pill) => {
            const isActive = activeFilter === pill;
            return (
              <button
                key={pill}
                type="button"
                onClick={() => setActiveFilter(pill)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {pill}
              </button>
            );
          })}
        </div>

        {/* Section Heading & Sort dropdown */}
        <div className="flex items-center justify-between pt-2">
          <h2 className="text-base font-semibold text-slate-900">
            Trending Topics
          </h2>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium cursor-pointer">
            <span>Sort by:</span>
            <span className="text-slate-900 font-semibold flex items-center gap-0.5">
              Trending
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </span>
          </div>
        </div>

        {/* Horizontal Trending Cards List */}
        <div className="space-y-3">
          {displayedTopics.map((topic) => {
            const badgeColor =
              topic.badge === "High Growth"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : topic.badge === "Trending"
                ? "bg-blue-50 text-blue-700 border-blue-200"
                : "bg-purple-50 text-purple-700 border-purple-200";

            return (
              <div
                key={topic.id}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                {/* Topic details */}
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-slate-900 truncate">
                        {topic.title}
                      </h3>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        {topic.category}
                      </span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${badgeColor}`}>
                        {topic.badge}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 line-clamp-1">
                      <strong className="font-medium text-slate-700">Why:</strong> {topic.why}
                    </p>
                  </div>
                </div>

                {/* Right: Modular Action Buttons */}
                <div className="shrink-0 flex items-center gap-1.5 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTopicToSave(topic);
                      setIsAddToProjectOpen(true);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCreateIdea(topic)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
                  >
                    <span>Content Ideas</span>
                  </button>

                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedTopicToSave && (
        <AddToProjectModal
          isOpen={isAddToProjectOpen}
          onClose={() => {
            setIsAddToProjectOpen(false);
            setSelectedTopicToSave(null);
          }}
          assetType="idea"
          assetItem={{
            title: selectedTopicToSave.title,
            hook: selectedTopicToSave.why,
            angle: selectedTopicToSave.category,
            format: "Trend Discovery",
            score: selectedTopicToSave.score || 90,
          }}
          defaultTitle={selectedTopicToSave.title}
        />
      )}
    </StudioShell>
  );
}

export default function TrendsPage() {
  return (
    <Suspense fallback={<AuthLoadingScreen label="Loading Trend Radar…" />}>
      <TrendsContent />
    </Suspense>
  );
}
