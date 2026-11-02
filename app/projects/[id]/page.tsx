"use client";

import React, { useState, useEffect, use, useMemo, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Film,
  Mic,
  FileText,
  Image as ImageIcon,
  Type,
  Video,
  Download,
  Trash2,
  Edit3,
  ExternalLink,
  Layers,
  ArrowRight,
  Clock,
  Sparkles,
  Share2,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
} from "lucide-react";
import AssetMediaPreview from "../../components/assets/AssetMediaPreview";
import ProjectAssetUploads from "../../components/projects/ProjectAssetUploads";
import StudioShell from "../../components/StudioShell";
import AuthLoadingScreen from "../../components/AuthLoadingScreen";
import { useAuthGate } from "../../lib/useAuthGate";
import {
  getProject,
  saveProjectWithResult,
  removeAssetFromProject,
} from "../../lib/services/projectService";
import {
  VeeloxProject,
  ProjectRawFootage,
  ProjectBRollAsset,
  ProjectVoiceover,
  ProjectThumbnail,
  ProjectScriptItem,
  ProjectIdea,
} from "../../lib/services/types";

type AssetTab = "all" | "video" | "audio" | "broll" | "images" | "scripts" | "captions" | "sfx" | "thumbnails";

function ProjectDetailContent({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const { status, session } = useAuthGate();

  const [project, setProject] = useState<VeeloxProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AssetTab>("all");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState("");

  // Load Project on mount
  useEffect(() => {
    if (status === "unauthed") { router.replace("/login"); return; }
    if (status !== "authed" || !session) return;
    let ignore = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const p = await getProject(id);
        if (!ignore) {
          if (p) {
            setProject(p);
            setTitleInput(p.title || "Untitled Project");
          } else {
            setProject(null);
            setLoadError("This project is unavailable or you do not have access to it.");
          }
        }
      } catch (err) {
        if (!ignore) setLoadError("Could not load this project. Please return to Projects and retry.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [id, status, session, router]);

  // Handle Save Title
  async function handleSaveTitle() {
    if (!project || !titleInput.trim() || savingTitle) return;
    setSavingTitle(true); setTitleError("");
    try {
      const result = await saveProjectWithResult({...project,title:titleInput.trim(),updated_at:new Date().toISOString()});
      if (!result.persistedToDb) throw new Error(result.error || "Could not sync this title. Please retry.");
      setProject(result.project); setIsEditingTitle(false);
    } catch (error) { setTitleError(error instanceof Error ? error.message : "Could not rename this project."); }
    finally { setSavingTitle(false); }
  }

  // Handle Delete Asset
  async function handleDeleteAsset(
    type: "raw_footage" | "broll_assets" | "voiceovers" | "thumbnails" | "scripts" | "ideas" | "sfx_assets" | "backgrounds",
    assetId: string
  ) {
    if (!project) return;
    const updated = await removeAssetFromProject(project.id, type as any, assetId);
    if (updated) setProject(updated);
  }

  // Asset Counts
  const rawFootageCount = project?.raw_footage?.length || 0;
  const brollCount = project?.broll_assets?.length || 0;
  const voiceCount = project?.voiceovers?.length || 0;
  const thumbnailCount = project?.thumbnails?.length || 0;
  const backgroundsCount = project?.backgrounds?.length || 0;
  const imagesCount = thumbnailCount + backgroundsCount;
  const scriptCount = (project?.scripts?.length || 0) + (project?.script ? 1 : 0);
  const captionsCount = project?.captions?.length ? 1 : 0;
  const sfxCount = project?.sfx_assets?.length || 0;
  const totalAssets =
    rawFootageCount + brollCount + voiceCount + imagesCount + scriptCount + captionsCount + sfxCount;

  if (status !== "authed" || loading) {
    return <AuthLoadingScreen label="Loading Project Hub…" />;
  }

  if (!project) return <StudioShell active="projects"><p role="alert">{loadError || "Project unavailable."}</p><Link href="/projects">Back to Projects</Link></StudioShell>;

  function formatTimeAgo(dateString?: string) {
    if (!dateString) return "Recently";
    const now = new Date();
    const past = new Date(dateString);
    const diffHours = Math.floor((now.getTime() - past.getTime()) / (1000 * 60 * 60));
    if (diffHours < 1) return "Just now";
    if (diffHours === 1) return "1 hour ago";
    if (diffHours < 24) return `${diffHours} hours ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "1 day ago";
    return `${diffDays} days ago`;
  }

  return (
    <StudioShell active="projects">
      <div className="max-w-6xl mx-auto w-full space-y-8 pb-16">
        {/* Top Header & Core Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
                PROJECT WORKSPACE
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {project?.status === "completed"
                  ? "Completed"
                  : project?.status === "draft"
                  ? "Draft"
                  : "In Progress"}
              </span>
              <span className="text-slate-300">•</span>
              <span
                className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${
                  project?.video_mode === "raw_footage"
                    ? "bg-sky-50 text-sky-700 border-sky-200"
                    : "bg-slate-100 text-slate-700 border-slate-200"
                }`}
              >
                {project?.video_mode === "raw_footage"
                  ? "Video Project"
                  : "Modular Project"}
              </span>
            </div>

            {isEditingTitle ? (
              <div className="vx-project-heading flex items-center gap-2">
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveTitle()}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xl font-bold text-slate-900 focus:outline-none focus:border-slate-900"
                  autoFocus
                />
                <button
                  type="button"
                  disabled={savingTitle}
                  onClick={handleSaveTitle}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium"
                >
                  {savingTitle ? "Saving…" : "Save"}
                </button>
              </div>
            ) : (
              <div className="vx-project-heading flex items-center gap-2.5">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 truncate">
                  {project?.title || "Untitled Project"}
                </h1>
                <button
                  type="button"
                  aria-label="Rename project"
                  onClick={() => setIsEditingTitle(true)}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
            )}
            {titleError && <p role="alert" className="text-xs text-rose-600">{titleError}</p>}
            <p className="text-xs text-slate-500">
              Created {new Date(project?.created_at || Date.now()).toLocaleDateString()} • {totalAssets} assets attached
            </p>
          </div>

          {/* Primary Hub CTA: Open in Editor & Export */}
          <div className="flex items-center gap-2.5 shrink-0">
            <Link
              href={`/editor?projectId=${id}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs sm:text-sm transition-colors shadow-xs cursor-pointer"
            >
              <Film className="w-4 h-4" />
              <span>Open in Editor</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>

            <Link
              href={project?.export_url || `/editor?projectId=${id}&action=export`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{project?.export_url ? "Download Export" : "Export"}</span>
            </Link>
          </div>
        </div>

        {/* Overview Metric Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-1 shadow-xs">
            <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
              <span>All Assets</span>
              <Layers className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{totalAssets}</div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-1 shadow-xs">
            <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
              <span>Raw Footage</span>
              <Video className="w-3.5 h-3.5 text-sky-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{rawFootageCount}</div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-1 shadow-xs">
            <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
              <span>Scripts</span>
              <FileText className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{scriptCount}</div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-1 shadow-xs">
            <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
              <span>Voiceovers</span>
              <Mic className="w-3.5 h-3.5 text-violet-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{voiceCount}</div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-1 shadow-xs">
            <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
              <span>B-Roll Cutaways</span>
              <Film className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{brollCount}</div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-1 shadow-xs">
            <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
              <span>Thumbnails</span>
              <ImageIcon className="w-3.5 h-3.5 text-rose-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{thumbnailCount}</div>
          </div>
        </div>

        <ProjectAssetUploads projectId={id} onSaved={setProject} />

        {/* Tabbed Asset Browser */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="vx-mobile-tabs flex items-center gap-1 overflow-x-auto">
              {(
                [
                  { id: "all", label: "All Assets", count: totalAssets },
                  { id: "video", label: "Video", count: rawFootageCount },
                  { id: "audio", label: "Audio", count: voiceCount },
                  { id: "broll", label: "B-Roll", count: brollCount },
                  { id: "images", label: "Images", count: imagesCount },
                  { id: "scripts", label: "Scripts", count: scriptCount },
                  { id: "captions", label: "Captions", count: captionsCount },
                  { id: "sfx", label: "SFX", count: sfxCount },
                  { id: "thumbnails", label: "Thumbnails", count: thumbnailCount },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === tab.id
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      activeTab === tab.id
                        ? "bg-slate-700 text-white"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Empty state if no assets */}
          {totalAssets === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-white border border-slate-200 space-y-3">
              <FolderOpen className="w-10 h-10 text-slate-400 mx-auto" />
              <h3 className="text-base font-semibold text-slate-900">
                This project workspace is empty
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Add footage, voiceover, B-roll, a thumbnail and captions above, then open this project in the editor.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Raw Footage Cards */}
              {(activeTab === "all" || activeTab === "video") &&
                project?.raw_footage?.map((f) => (
                  <div
                    key={f.id}
                    className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
                  >
                    <div className="relative aspect-video bg-black flex items-center justify-center">
                      <AssetMediaPreview url={f.url} kind="video" name={f.name||"Raw footage"} className="w-full max-h-80 object-contain"/>
                    </div>
                    <div className="p-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 truncate">
                            {f.name}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {f.duration ? `${f.duration}s` : "Video Clip"} • Raw Footage
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteAsset("raw_footage", f.id)}
                          className="text-slate-400 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {(f.ai_analysis || f.analysis) && (
                        <div className="bg-slate-50 p-2 rounded-lg text-[10px] text-slate-600 space-y-0.5">
                          <div>
                            Scenes: {f.ai_analysis?.scenes || f.analysis?.scenesCount || 0} • Clips: {f.ai_analysis?.clips || f.analysis?.potentialClips || 0}
                          </div>
                          <div className="line-clamp-1 italic">{f.ai_analysis?.transcript || f.analysis?.transcript}</div>
                        </div>
                      )}

                      <div className="pt-1 flex items-center justify-end">
                        <Link
                          href={`/editor?projectId=${id}&insertVideo=${encodeURIComponent(f.url)}`}
                          className="px-2.5 py-1 rounded-md bg-slate-900 text-white text-[11px] font-medium"
                        >
                          Use in Editor →
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}

              {/* Scripts */}
              {(activeTab === "all" || activeTab === "scripts") &&
                (project?.scripts?.map((s) => (
                  <div
                    key={s.id}
                    className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          {s.format || "Script"}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteAsset("scripts", s.id)}
                          className="text-slate-400 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <h4 className="text-sm font-semibold text-slate-900">{s.title}</h4>
                      <p className="text-xs text-slate-600 line-clamp-4 font-mono leading-relaxed bg-slate-50 p-2.5 rounded-lg">
                        {s.content}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
                      <span className="text-slate-400">~{s.word_count || 120} words</span>
                      <Link
                        href={`/voice?projectId=${id}&script=${encodeURIComponent(s.content)}`}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Generate Voice →
                      </Link>
                    </div>
                  </div>
                )) ||
                  (project?.script && (
                    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          Project Master Script
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-4 font-mono leading-relaxed bg-slate-50 p-2.5 rounded-lg">
                        {typeof project.script === "string"
                          ? project.script
                          : `${project.script.hook || ""}\n\n${project.script.intro || ""}\n\n${project.script.bodyPoints?.join("\n") || ""}`}
                      </p>
                      <div className="flex justify-end">
                        <Link
                          href={`/voice?projectId=${id}&script=${encodeURIComponent(
                            typeof project.script === "string"
                              ? project.script
                              : project.script.hook || "Script"
                          )}`}
                          className="text-blue-600 text-[11px] font-medium"
                        >
                          Generate Voice →
                        </Link>
                      </div>
                    </div>
                  )))}

              {/* Voiceovers */}
              {(activeTab === "all" || activeTab === "audio") &&
                project?.voiceovers?.map((v) => {
                  const audioUrl = v.audio_url || v.url;
                  return (
                    <div
                      key={v.id}
                      className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                            Voiceover • {v.voice_id || v.voiceId || "Uploaded audio"}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteAsset("voiceovers", v.id)}
                            className="text-slate-400 hover:text-rose-600 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <h4 className="text-xs font-semibold text-slate-900 truncate">
                          {v.title || v.voiceName || "Voiceover Audio"}
                        </h4>
                        <p className="text-[11px] text-slate-500 line-clamp-2 italic">
                          &ldquo;{v.text}&rdquo;
                        </p>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                          <AssetMediaPreview url={audioUrl} kind="audio" name={v.title||v.voiceName||"Voiceover"} className="w-full"/>

                          <Link
                            href={`/editor?projectId=${id}&insertAudio=${encodeURIComponent(audioUrl || "")}`}
                            className="text-xs font-medium text-slate-900 hover:underline"
                          >
                            Use in Editor →
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}

              {/* B-Roll Assets */}
              {(activeTab === "all" || activeTab === "broll") &&
                project?.broll_assets?.map((b) => (
                  <div
                    key={b.id}
                    className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
                  >
                    <div className="relative aspect-video bg-slate-900">
                      <AssetMediaPreview url={b.url} kind="video" name={b.title||"B-roll"} className="w-full max-h-80 object-contain"/>
                      <div className="absolute top-2 right-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteAsset("broll_assets", b.id)}
                          className="bg-black/60 hover:bg-black/90 text-white p-1 rounded-md"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {b.title}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>{b.duration ? `${b.duration}s` : "Cutaway"}</span>
                        <Link
                          href={`/editor?projectId=${id}&insertBroll=${encodeURIComponent(b.url)}`}
                          className="text-blue-600 font-medium hover:underline"
                        >
                          Insert in Editor →
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}

              {/* Thumbnails */}
              {(activeTab === "all" || activeTab === "thumbnails" || activeTab === "images") &&
                project?.thumbnails?.map((t) => {
                  const imgUrl = t.image_url || t.url || "";
                  return (
                    <div
                      key={t.id}
                      className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
                    >
                      <div className="relative aspect-video bg-slate-950">
                        <AssetMediaPreview url={imgUrl} kind="image" name={t.title||"Thumbnail"} className="w-full max-h-80 object-contain"/>
                        {t.badge_text && (
                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black uppercase">
                            {t.badge_text}
                          </span>
                        )}
                        <div className="absolute top-2 right-2">
                          <button
                            type="button"
                            onClick={() => handleDeleteAsset("thumbnails", t.id)}
                            className="bg-black/60 hover:bg-black/90 text-white p-1 rounded-md"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="p-3 space-y-1.5">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {t.title || t.prompt || "Thumbnail Image"}
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">{t.style || "Uploaded thumbnail"}</span>
                          <a
                            href={/^\/api\/assets\/[0-9a-f-]+\/file$/i.test(imgUrl)?imgUrl+"?download=1":imgUrl}
                            target="_blank"
                            rel="noreferrer"
                            download
                            className="text-slate-700 hover:text-slate-950 font-medium flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            <span>Download</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}

              {(activeTab === "all" || activeTab === "captions") && !!project.captions?.length && (
                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Captions</h3>
                  <p className="text-xs text-slate-500">{project.captions.length} timed captions attached to this project.</p>
                  <div className="space-y-2">{project.captions.slice(0, 5).map(caption => <p key={caption.id} className="text-xs text-slate-700"><span className="font-mono text-slate-400">{caption.startTime.toFixed(1)}–{caption.endTime.toFixed(1)}s</span> {caption.text}</p>)}</div>
                  <Link href={`/editor?projectId=${id}`} className="text-xs font-medium text-slate-900">Edit captions in editor →</Link>
                </div>
              )}

              {/* Backgrounds */}
              {(activeTab === "all" || activeTab === "images") &&
                project?.backgrounds?.map((bg) => (
                  <div
                    key={bg.id}
                    className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
                  >
                    <div
                      className="relative aspect-video flex items-center justify-center border-b border-slate-100"
                      style={{
                        background:
                          bg.type === "solid" || bg.type === "gradient" ? bg.value : "#0B0F19",
                      }}
                    >
                      {bg.type === "image" && (
                        <AssetMediaPreview url={bg.value} kind="image" name={bg.name||"Background"} className="w-full max-h-80 object-contain"/>
                      )}
                      {bg.type === "video" && (
                        <AssetMediaPreview url={bg.value} kind="video" name={bg.name||"Background"} className="w-full max-h-80 object-contain"/>
                      )}
                      <span className="text-[10px] font-mono text-white/90 bg-black/60 px-2 py-0.5 rounded uppercase">
                        {bg.type} background
                      </span>
                    </div>
                    <div className="p-3 space-y-1">
                      <div className="text-xs font-semibold text-slate-900 truncate">{bg.name}</div>
                      <span className="text-[10px] font-mono text-slate-400 capitalize">{bg.type} Style</span>
                    </div>
                  </div>
                ))}

              {/* SFX Assets */}
              {(activeTab === "all" || activeTab === "sfx") &&
                project?.sfx_assets?.map((sfx) => (
                  <div
                    key={sfx.id}
                    className="bg-white rounded-xl border border-slate-200 p-4 space-y-2 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold uppercase">
                        {sfx.category} SFX
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteAsset("sfx_assets", sfx.id)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-900">{sfx.name}</div>
                      {sfx.url&&<AssetMediaPreview url={sfx.url} kind="audio" name={sfx.name||"Sound effect"} className="w-full"/>}
                      <div className="text-[10px] font-mono text-slate-400">
                        {sfx.duration}s duration {sfx.trigger_time ? `• Trigger @${sfx.trigger_time}s` : ""}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Section 19: Project Information Metadata Panel */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider">
              Project Information &amp; Status
            </h3>
            <span className="text-[11px] font-mono text-slate-400">ID: {project?.id}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-xs">
            <div>
              <span className="text-slate-400 block font-mono text-[10px] uppercase">Creation Date</span>
              <span className="font-semibold text-slate-900">
                {new Date(project?.created_at || Date.now()).toLocaleDateString()}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block font-mono text-[10px] uppercase">Last Edited</span>
              <span className="font-semibold text-slate-900">
                {formatTimeAgo(project?.updated_at || project?.created_at)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block font-mono text-[10px] uppercase">Duration</span>
              <span className="font-semibold text-slate-900">{Math.round(project?.duration || 60)}s</span>
            </div>
            <div>
              <span className="text-slate-400 block font-mono text-[10px] uppercase">Number of Assets</span>
              <span className="font-semibold text-slate-900">{totalAssets} assets</span>
            </div>
            <div>
              <span className="text-slate-400 block font-mono text-[10px] uppercase">Video Mode</span>
              <span className="font-semibold text-slate-900">
                {project?.video_mode === "raw_footage"
                  ? "Raw Footage Video"
                  : "Modular Project"}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block font-mono text-[10px] uppercase">Export Status</span>
              <span className="font-semibold text-emerald-600">
                {project?.export_url ? "Exported ✓" : project?.status === "completed" ? "Ready" : "In Progress"}
              </span>
            </div>
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-xs">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <span>Recent Activity</span>
          </h3>

          <div className="space-y-2">
            {(project?.activity && project.activity.length > 0
              ? project.activity
              : [
                  {
                    id: "act_init",
                    action: "Project workspace created",
                    description: "Project workspace created",
                    timestamp: project?.created_at || new Date().toISOString(),
                    created_at: project?.created_at || new Date().toISOString(),
                  },
                ]
            ).map((act) => (
              <div
                key={act.id}
                className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 last:border-b-0"
              >
                <div className="flex items-center gap-2 text-slate-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>{act.description || act.action || "Activity logged"}</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  {new Date(act.created_at || act.timestamp || Date.now()).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </StudioShell>
  );
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<AuthLoadingScreen label="Loading Project Hub…" />}>
      <ProjectDetailContent params={params} />
    </Suspense>
  );
}
