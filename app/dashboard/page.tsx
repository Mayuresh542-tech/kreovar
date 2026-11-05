"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Compass,
  FileText,
  Video,
  Mic,
  Film,
  Image as ImageIcon,
  FolderKanban,
  MoreVertical,
  Play,
  ArrowRight,
  Plus,
  Sparkles,
  Layers,
} from "lucide-react";
import StudioShell from "../components/StudioShell";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import { useAuthGate } from "../lib/useAuthGate";
import { getProjects, deleteProject } from "../lib/services/projectService";
import { VeeloxProject } from "../lib/services/types";
import CreateProjectModal from "../components/projects/CreateProjectModal";

export default function Dashboard() {
  const router = useRouter();
  const { status, session } = useAuthGate();
  const [projects, setProjects] = useState<VeeloxProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Redirect if unauthenticated
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (status === "unauthed" && !redirectedRef.current) {
      redirectedRef.current = true;
      router.replace("/login");
    }
  }, [status, router]);

  // Load real user projects
  useEffect(() => {
    if (status !== "authed" || !session) return;
    const userId = session.user.id;
    getProjects(userId)
      .then((userProjects) => {
        setProjects(userProjects || []);
      })
      .catch((err) => {
        console.error("Failed to load user projects:", err);
      })
      .finally(() => {
        setLoadingProjects(false);
      });
  }, [status, session]);

  if (status !== "authed") {
    return <AuthLoadingScreen label="Opening Kreovar Studio…" />;
  }

  async function handleDeleteProject(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setActiveMenuId(null);
    } catch (err) {
      console.error("Failed to delete project:", err);
      alert(err instanceof Error ? err.message : "Could not delete the project. Please retry.");
    }
  }

  // Quick action tool definitions
  const quickActions = [
    {
      title: "Find Trends",
      description: "Discover rising topics with high viewer demand",
      icon: Compass,
      href: "/trends",
      badge: "Discovery",
    },
    {
      title: "Write Script",
      description: "Shape your ideas into scripts and hooks",
      icon: FileText,
      href: "/script",
      badge: "AI Writer",
    },
    {
      title: "Generate Voice",
      description: "Give your story a voice with AI narration",
      icon: Mic,
      href: "/voice",
      badge: "AI Audio",
    },
    {
      title: "Upload Footage",
      description: "Upload footage and attach it to your project",
      icon: Video,
      href: "/projects",
      badge: "Projects",
    },
    {
      title: "Find B-Roll",
      description: "Search high-impact stock cutaways & visuals",
      icon: Film,
      href: "/broll",
      badge: "Assets",
    },
    {
      title: "Create Thumbnail",
      description: "Thumbnail generation is coming soon",
      icon: ImageIcon,
      href: "/thumbnails",
      badge: "Coming soon",
    },
  ];

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

  const displayProjects = projects.length > 0
    ? projects.slice(0, 6).map((p) => {
        const assetCount =
          (p.raw_footage?.length || 0) +
          (p.broll_assets?.length || 0) +
          (p.voiceovers?.length || 0) +
          (p.thumbnails?.length || 0) +
          (p.scripts?.length || 0) +
          (p.script ? 1 : 0);

        return {
          id: p.id,
          title: p.title || "Untitled Project",
          status:
            p.status === "exported" || p.status === "ready"
              ? "Completed"
              : p.status === "rendering" || p.status === "editing"
              ? "In Progress"
              : "Draft",
          timeAgo: formatTimeAgo(p.updated_at || p.created_at),
          thumbnail:
            p.thumbnail_url ||
            "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60",
          duration: `${Math.round(p.duration || 30)}s`,
          assetCount,
          isReal: true,
        };
      })
    : [];

  return (
    <StudioShell active="dashboard">
      <div className="vx-dashboard space-y-8 pb-8 max-w-6xl mx-auto w-full">
        {/* Section 25: Primary Video Creation Modes */}
        <section className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">
              What are you creating?
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Your projects bring all your media and edits together.
            </p>
          </div>

          <div className="vx-creation-hero">
            <div className="vx-creation-copy">
              <span className="vx-hero-eyebrow"><Sparkles size={14} aria-hidden="true" /> A little AI. All your creativity.</span>
              <h2>From first idea<br />to final frame.</h2>
              <p>Bring your footage, voice and captions together.<br className="hidden sm:block" /> Make your next story a project.</p>
              <div className="vx-hero-actions">
                <Link href="/projects?new=1" className="vx-hero-primary"><Plus size={17} aria-hidden="true" /> New Project <ArrowRight size={16} aria-hidden="true" /></Link>
                <Link href="/projects" className="vx-hero-secondary">My Projects <ArrowRight size={15} aria-hidden="true" /></Link>
              </div>
            </div>
            <div className="vx-creation-art" aria-hidden="true">
              <div className="vx-art-orbit" />
              <div className="vx-art-frame vx-art-frame-back"><Film size={26} /></div>
              <div className="vx-art-frame vx-art-frame-front">
                <span className="vx-art-spark"><Sparkles size={31} strokeWidth={1.4} /></span>
                <div className="vx-art-timeline"><i /><i /><i /></div>
                <div className="vx-art-wave">{[12, 22, 15, 30, 40, 25, 34, 18, 28, 12, 22, 16].map((height, i) => <i key={i} style={{height}} />)}</div>
              </div>
              <span className="vx-art-chip vx-art-chip-top"><Mic size={14} /> Your voice</span>
              <span className="vx-art-chip vx-art-chip-bottom"><Layers size={14} /> Your vision</span>
            </div>
          </div>

          {/* Section 25 & 26: Distinct Trend Finder Action */}
          <div className="vx-trend-strip bg-slate-50 rounded-2xl border border-slate-200 p-4.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-slate-700" />
                <span className="text-xs font-bold text-slate-900 uppercase font-mono">
                  Trend Finder — &ldquo;What should I make?&rdquo;
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Discover rising topics, analyze competitors, and draft viral hooks before creating.
              </p>
            </div>
            <Link
              href="/trends"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-medium transition-colors shadow-2xs shrink-0 cursor-pointer"
            >
              <span>Explore Trends</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </section>

        {/* Secondary Quick Actions (Your creative toolkit) */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              Your creative toolkit
            </h2>
            <span className="text-xs text-slate-500">
              One idea. So many ways to create.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.title}
                  href={action.href}
                  className="vx-tool-card group"
                >
                  <div className="vx-tool-icon">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                        {action.title}
                      </h3>
                      {action.badge === "Coming soon" && (
                        <span className="vx-tool-badge">Coming soon</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                      {action.description}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Recent Projects Hub */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Recent Projects
              </h2>
              <p className="text-xs text-slate-400">
                Your content production workspaces and assembled timelines
              </p>
            </div>
            <Link
              href="/projects"
              className="text-xs font-medium text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 transition-colors"
            >
              <span>View all projects</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {displayProjects.length === 0 && (
            <div className="vx-empty-projects" role="status">
              <FolderKanban size={25} aria-hidden="true" />
              <div><p className="font-semibold text-slate-800">{loadingProjects ? "Loading your projects…" : "Your next story starts here"}</p><p className="mt-1 text-sm text-slate-500">{loadingProjects ? "Getting your workspace ready." : "Create a project to keep your footage, audio and edits in one place."}</p></div>
              {!loadingProjects && <button type="button" onClick={() => setIsCreateModalOpen(true)} className="vx-empty-create"><Plus size={16} /> New Project</button>}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayProjects.map((project) => {
              const statusColor =
                project.status === "Completed"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : project.status === "In Progress"
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-slate-100 text-slate-600 border-slate-200";

              return (
                <div
                  key={project.id}
                  onClick={() => router.push(`/projects/${project.id}`)}
                  className="vx-project-card bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-slate-300 hover:shadow-xs transition-all cursor-pointer group flex flex-col justify-between"
                >
                  {/* Thumbnail Banner */}
                  <div className="relative aspect-video w-full bg-slate-900 overflow-hidden">
                    <img
                      src={project.thumbnail}
                      alt={project.title}
                      className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/15 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-white/90 shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="w-3.5 h-3.5 text-slate-900 ml-0.5 fill-slate-900" />
                      </div>
                    </div>
                    {project.duration && (
                      <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[10px] font-mono text-white">
                        {project.duration}
                      </span>
                    )}
                  </div>

                  {/* Project Details */}
                  <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                        {project.title}
                      </h4>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusColor}`}>
                          {project.status}
                        </span>
                        <span className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
                          <Layers className="w-3 h-3 text-slate-400" />
                          {project.assetCount} {project.assetCount === 1 ? "asset" : "assets"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-400">
                      <span>{project.timeAgo}</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/editor?projectId=${project.id}`);
                          }}
                          className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-medium transition-colors cursor-pointer"
                        >
                          Open Editor
                        </button>

                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(activeMenuId === project.id ? null : project.id);
                            }}
                            aria-label={`Actions for ${project.title}`}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>

                          {activeMenuId === project.id && (
                            <div
                              className="absolute right-0 bottom-6 w-32 bg-white rounded-lg border border-slate-200 shadow-md py-1 z-20 text-xs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenuId(null);
                                  router.push(`/projects/${project.id}`);
                                }}
                                className="w-full text-left px-3 py-1.5 text-slate-700 hover:bg-slate-50 transition-colors"
                              >
                                Project Detail
                              </button>
                              {project.isReal && (
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteProject(project.id, e)}
                                  className="w-full text-left px-3 py-1.5 text-rose-600 hover:bg-rose-50 transition-colors"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Universal Create Project Modal */}
      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </StudioShell>
  );
}
