"use client";
import UsageSummary from "../components/UsageSummary";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText,
  Sparkles,
  FolderPlus,
  Mic,
  Copy,
  Check,
  RotateCcw,
  Film,
} from "lucide-react";
import StudioShell from "../components/StudioShell";
import ContentWorkflow from "../components/ContentWorkflow";
import {saveTextAsset} from "../lib/assets/client";
import {workflowUrl} from "../lib/content/workflow";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import { useAuthGate } from "../lib/useAuthGate";
import AddToProjectModal from "../components/projects/AddToProjectModal";
import { getProjects } from "../lib/services/projectService";

const FORMAT_OPTIONS = [
  { label: "Shorts / TikTok (30-60s)", words: 120, format: "short" },
  { label: "Deep Dive (2-3 min)", words: 350, format: "medium" },
  { label: "Explainer (5 min)", words: 700, format: "long" },
];

function ScriptContent() {
  const router = useRouter();
  const [libraryMessage,setLibraryMessage]=useState("");
  const [unsaved,setUnsaved]=useState<{title:string;text:string;topic:string}|null>(null);
  async function saveWork(title:string,text:string,topic=title){
    setLibraryMessage("Saving to Asset Library…");setUnsaved({title,text,topic});
    try{await saveTextAsset("script",title,text,topic);setUnsaved(null);setLibraryMessage("Saved to Asset Library");}catch{setLibraryMessage("Your result is ready, but saving failed. Retry below.");}
  }
  const searchParams = useSearchParams();
  const { status, session } = useAuthGate();

  const initialTopic = searchParams.get("topic") || searchParams.get("idea") || "";

  const [topic, setTopic] = useState(initialTopic);
  const [format, setFormat] = useState(FORMAT_OPTIONS[0]);
  const [tone, setTone] = useState("Engaging & Punchy");
  const generationPending = useRef(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [scriptContent, setScriptContent] = useState("");
  const [hook, setHook] = useState("");
  const [generationError,setGenerationError]=useState<string|null>(null);
  const [cta, setCta] = useState("");
  const [copied, setCopied] = useState(false);

  // Add to Project modal
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (status === "unauthed") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    setTopic(initialTopic);
  }, [initialTopic]);

  async function handleGenerateScript(promptText?: string) {
    const q = (promptText || topic).trim();
    if (!q || generationPending.current || status !== "authed") return;
    generationPending.current = true;

    setIsGenerating(true);
    setGenerationError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch("/api/content-kit", {
        method: "POST",
        headers,
        body: JSON.stringify({
          topic: q,
          mode: "script",
          tone,
          niche: "General",
          durationLabel: format.label,
          wordCount: format.words,
          format: format.format,
        }),
      });

      const data = await res.json();
      if(!res.ok)throw new Error(data.error||"Script generation failed. Please retry.");
      if (res.ok) {
        const kit = data.kit || data;
        if (kit) {
          const generatedHook = kit.hooks?.[0] || `Stop scrolling if you want to master ${q} in 2026.`;
          const generatedScript = kit.script || kit.scripts?.full || kit.scripts?.spelledOut;
          if(typeof generatedScript!=="string"||!generatedScript.trim())throw new Error("The generator returned no script. Retry generation.");
          setHook(generatedHook);
          setScriptContent(generatedScript);
          setCta("Hit follow for daily creator workflows.");
          await saveWork(q,generatedScript,q);
          return;
        }
      }

      throw new Error("The generator returned no script. Please retry.");
    } catch (err) {
      setGenerationError(err instanceof Error?err.message:"Script generation failed.");
      console.error("Script generation error:", err);
    } finally {
      generationPending.current = false;
      setIsGenerating(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(scriptContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSendToVoice() {
    router.push(`/voice?script=${encodeURIComponent(scriptContent)}`);
  }

  const wordCount = scriptContent.trim().split(/\s+/).filter(Boolean).length;
  const estimatedSeconds = Math.round(wordCount * 0.38);

  if (status !== "authed") {
    return <AuthLoadingScreen label="Loading Script Studio…" />;
  }

  return (
    <StudioShell active="script">
      {generationError&&<p role="alert" className="mb-4 text-sm text-rose-600">{generationError}</p>}
      <div className="mb-5 space-y-3"><UsageSummary compact feature="content"/><ContentWorkflow step="script" topic={topic}/>{libraryMessage&&<p role="status" className="text-sm text-slate-600">{libraryMessage}</p>}{unsaved&&libraryMessage.includes("failed")&&<button type="button" className="text-sm underline" onClick={()=>void saveWork(unsaved.title,unsaved.text,unsaved.topic)}>Retry saving</button>}</div>
      <div className="space-y-8 pb-16">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Script Writer
          </h1>
          
        </div>

        {/* Input & Generator Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-xs">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 block">
              What topic, trend, or idea do you want to script?
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. 5 AI Tools Replacing Traditional Video Workflows"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-2">
              {FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.format}
                  type="button"
                  onClick={() => setFormat(opt)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    format.format === opt.format
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => handleGenerateScript()}
              disabled={isGenerating || !topic.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-medium text-xs sm:text-sm transition-colors shadow-2xs cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isGenerating ? "Writing Script..." : "Generate Script"}</span>
            </button>
          </div>
        </div>

        {/* Generated Script Workspace */}
        {scriptContent && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="font-semibold text-slate-900">{wordCount} words</span>
                <span>·</span>
                <span>~{estimatedSeconds}s spoken duration</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>Add to Project</span>
                </button>
                <button
                  type="button"
                  onClick={handleSendToVoice}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Generate Voice</span>
                </button>
              </div>
            </div>

            {/* Editable Script Textarea */}
            <div className="space-y-2">
              <textarea
                value={scriptContent}
                onChange={(e) => setScriptContent(e.target.value)}
                rows={10}
                className="w-full p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 font-sans leading-relaxed focus:outline-none focus:border-slate-400"
              />
            </div>
          </div>
        )}
      </div>

      {/* Add to Project Modal */}
      <AddToProjectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        assetType="scripts"
        assetLabel={topic || "Script"}
        assetData={{
          id: `script_${Date.now()}`,
          title: topic || "Script",
          content: scriptContent,
          created_at: new Date().toISOString(),
        }}
      />
    </StudioShell>
  );
}

export default function ScriptPage() {
  return (
    <Suspense fallback={<AuthLoadingScreen label="Loading Script Studio…" />}>
      <ScriptContent />
    </Suspense>
  );
}
