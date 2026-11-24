"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Download,
  Cloud,
  Check,
  LoaderCircle,
  AlertCircle,
  X,
  Keyboard,
  Sparkles,
  SlidersHorizontal,
  Smartphone,
  ChevronDown,
} from "lucide-react";
import BrandMark from "../BrandMark";
import CaptionFonts from "../captions/CaptionFonts";
import ToolSidebar, { EditorToolTab } from "./ToolSidebar";
import AssetDrawer from "./AssetDrawer";
import CanvasStage from "./CanvasStage";
import EditorAIChat from "./EditorAIChat";
import TimelinePanel from "./TimelinePanel";
import { useEditor } from "./workspace/EditorContext";
import { useProject } from "@/app/lib/editor/store";
import {
  Ratio,
  aspectRatios,
  projectDuration,
} from "@/app/lib/editor/model";
import { duplicateClip, removeClip, splitClip, pasteClips, reframeProject, trimToPlayhead, type ReframeMode } from "@/app/lib/editor/operations";
import { nudgeClips } from "@/app/lib/editor/timelineNavigation";
import {
  resolveShortcutAction,
  getShuttleNextState,
  splitTopmostUnmutedClipAtPlayhead,
  deleteOrRippleDeleteClips,
  toggleSelectedTrackMute,
  SHORTCUT_DEFINITIONS,
} from "@/app/lib/editor/shortcuts";
import { loadDemoProjectIntoStore } from "@/app/lib/editor/demoProject";

const ExportDialog = dynamic(() => import("./workspace/ExportDialog"), {
  ssr: false,
});

export interface EditorLayoutProps {
  onExit?: () => void;
  persistenceState?: string;
  retrySave?: () => void;
  recoveryMessage?: string;
  dismissRecovery?: () => void;
  notice?: string;
  onDismissNotice?: () => void;
  conflict?: boolean;
  onReloadConflict?: () => void;
}

export default function EditorLayout({
  onExit,
  persistenceState = "saved",
  retrySave,
  recoveryMessage,
  dismissRecovery,
  notice,
  onDismissNotice,
  conflict,
  onReloadConflict,
}: EditorLayoutProps) {
  const { store, playback, selection, select, run, notify } = useEditor();
  const project = useProject(store);

  // Left Sidebar Drawer State
  const [activeTab, setActiveTab] = useState<EditorToolTab>("media");
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);

  // Preview Quality State
  const [previewQuality, setPreviewQuality] = useState<number>(720);

  // Modals
  const [exportOpen, setExportOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [reframeOpen, setReframeOpen] = useState(false);
  const clipboardRef = useRef<{ project: typeof project; ids: string[] } | null>(null);

  // Resizable Bottom Timeline Height (Range: 220px to 450px, default 300px)
  const [timelineHeight, setTimelineHeight] = useState<number>(() => {
    if (typeof window !== "undefined") {
      return Math.max(220, Math.min(380, Math.round(window.innerHeight * 0.32)));
    }
    return 300;
  });

  const clipboard = useRef<{ project: typeof project; ids: string[] } | undefined>(undefined);

  // Automatically switch tab to inspector if a clip is selected and drawer is open
  useEffect(() => {
    if (selection.length > 0 && isDrawerOpen && activeTab !== "inspector") {
      // Keep user on tab unless they clicked inspector
    }
  }, [selection, isDrawerOpen, activeTab]);

  // Global NLE Keyboard Shortcuts
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const curProject = store.getSnapshot();
      const time = playback.getSnapshot().time;

      const action = resolveShortcutAction(
        {
          key: event.key,
          code: event.code,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          target: event.target,
        },
        { shortcutsOpen, exportOpen }
      );

      if (!action) return;

      switch (action) {
        case "escape": {
          if (shortcutsOpen) {
            event.preventDefault();
            setShortcutsOpen(false);
            return;
          }
          if (exportOpen) {
            event.preventDefault();
            setExportOpen(false);
            return;
          }
          store.cancel();
          select([]);
          break;
        }

        case "toggle-play": {
          event.preventDefault();
          const state = playback.getSnapshot();
          if (state.playing) {
            playback.set(state.time, false, 1);
          } else {
            const dur = projectDuration(curProject);
            playback.set(state.time >= dur ? 0 : state.time, true, 1);
          }
          break;
        }

        case "shuttle-forward": {
          event.preventDefault();
          const state = playback.getSnapshot();
          const next = getShuttleNextState(state.speed ?? 1, state.playing, "forward");
          const dur = projectDuration(curProject);
          playback.set(state.time >= dur && next.playing ? 0 : state.time, next.playing, next.speed);
          notify(next.speed === 2 ? "Shuttle Forward 2x" : "Play Forward 1x");
          break;
        }

        case "shuttle-pause": {
          event.preventDefault();
          const state = playback.getSnapshot();
          const next = getShuttleNextState(state.speed ?? 1, state.playing, "pause");
          playback.set(state.time, next.playing, next.speed);
          notify("Shuttle Paused");
          break;
        }

        case "shuttle-backward": {
          event.preventDefault();
          const state = playback.getSnapshot();
          const next = getShuttleNextState(state.speed ?? 1, state.playing, "backward");
          const dur = projectDuration(curProject);
          playback.set(state.time <= 0 && next.playing ? dur : state.time, next.playing, next.speed);
          notify(next.speed === -2 ? "Shuttle Reverse -2x" : "Shuttle Reverse -1x");
          break;
        }

        case "split-clip": {
          event.preventDefault();
          const result = splitTopmostUnmutedClipAtPlayhead(curProject, time, selection);
          if (result.splitClipId) {
            run(() => result.nextProject);
            notify(result.wasTopmostFallback ? "Split topmost unmuted clip" : "Split selected clip");
          } else {
            notify("Move playhead inside an unlocked clip to split.");
          }
          break;
        }

        case "trim-start-to-playhead": {
          event.preventDefault();
          const result = trimToPlayhead(curProject, "start", time, selection);
          if (result.modifiedClipIds.length > 0) {
            run(() => result.project);
            notify("Trimmed start to playhead ([)");
          } else {
            notify("Move playhead inside an unlocked clip to trim start.");
          }
          break;
        }

        case "trim-end-to-playhead": {
          event.preventDefault();
          const result = trimToPlayhead(curProject, "end", time, selection);
          if (result.modifiedClipIds.length > 0) {
            run(() => result.project);
            notify("Trimmed end to playhead (])");
          } else {
            notify("Move playhead inside an unlocked clip to trim end.");
          }
          break;
        }

        case "delete-clip": {
          if (selection.length) {
            event.preventDefault();
            run((p) => deleteOrRippleDeleteClips(p, selection, { ripple: false }));
            select([]);
            notify(`Deleted ${selection.length} clip(s).`);
          }
          break;
        }

        case "ripple-delete-clip": {
          if (selection.length) {
            event.preventDefault();
            run((p) => deleteOrRippleDeleteClips(p, selection, { ripple: true }));
            select([]);
            notify(`Ripple deleted ${selection.length} clip(s).`);
          }
          break;
        }

        case "toggle-mute": {
          event.preventDefault();
          const result = toggleSelectedTrackMute(curProject, selection);
          if (result.trackId) {
            run(() => result.project);
            const trackName = curProject.tracks[result.trackId]?.name || "Track";
            notify(`${result.muted ? "Muted" : "Unmuted"} ${trackName}`);
          }
          break;
        }

        case "undo": {
          event.preventDefault();
          store.undo();
          break;
        }

        case "redo": {
          event.preventDefault();
          store.redo();
          break;
        }

        case "save": {
          event.preventDefault();
          retrySave?.();
          break;
        }

        case "select-all": {
          event.preventDefault();
          select(
            Object.keys(curProject.clips).filter(
              (id) => !curProject.tracks[curProject.clips[id].trackId]?.locked
            )
          );
          break;
        }

        case "nudge-left":
        case "nudge-right": {
          if (selection.length) {
            event.preventDefault();
            run((p) =>
              nudgeClips(p, selection, (action === "nudge-right" ? 1 : -1) * (event.shiftKey ? 10 : 1))
            );
          }
          break;
        }

        case "step-backward":
        case "step-forward": {
          event.preventDefault();
          const dur = projectDuration(curProject);
          const delta = ((action === "step-forward" ? 1 : -1) * (event.shiftKey ? 10 : 1)) / curProject.settings.fps;
          playback.set(Math.max(0, Math.min(dur, time + delta)), false);
          break;
        }

        case "duplicate-clip": {
          if (selection.length) {
            event.preventDefault();
            run((p) => selection.reduce((next, id) => duplicateClip(next, id), p));
          }
          break;
        }

        case "copy-clips": {
          if (selection.length) {
            event.preventDefault();
            clipboardRef.current = { project: curProject, ids: [...selection] };
            notify(`Copied ${selection.length} clip(s).`);
          }
          break;
        }

        case "paste-clips": {
          if (clipboardRef.current?.ids.length) {
            event.preventDefault();
            try {
              run((p) => pasteClips(p, clipboardRef.current!.project, clipboardRef.current!.ids, time));
              notify(`Pasted ${clipboardRef.current.ids.length} clip(s).`);
            } catch (err) {
              notify(err instanceof Error ? err.message : "Paste failed.");
            }
          }
          break;
        }

        case "toggle-shortcuts-modal": {
          event.preventDefault();
          setShortcutsOpen((prev) => !prev);
          break;
        }

        case "toggle-snapping": {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent("veelox:toggle-snapping"));
          break;
        }

        case "fit-timeline": {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent("veelox:fit-timeline"));
          break;
        }

        case "zoom-in": {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent("veelox:timeline-zoom", { detail: "in" }));
          break;
        }

        case "zoom-out": {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent("veelox:timeline-zoom", { detail: "out" }));
          break;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [store, playback, selection, run, notify, select, retrySave, exportOpen, shortcutsOpen]);

  // Timeline resize drag gesture
  const handleTimelineResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const startY = event.clientY;
    const initialHeight = timelineHeight;

    const onPointerMove = (e: PointerEvent) => {
      const delta = startY - e.clientY;
      const nextHeight = Math.max(200, Math.min(window.innerHeight * 0.55, initialHeight + delta));
      setTimelineHeight(Math.round(nextHeight));
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerUp, { once: true });
  };

  const handleToolTabSelect = (tab: EditorToolTab) => {
    if (activeTab === tab && isDrawerOpen) {
      // Toggle drawer closed on second click of active tab
      setIsDrawerOpen(false);
    } else {
      setActiveTab(tab);
      setIsDrawerOpen(true);
    }
  };

  return (
    <div className="hidden md:flex h-screen w-screen overflow-hidden bg-[#121214] text-white flex-col font-sans select-none antialiased">
      <CaptionFonts />

      {/* ========================================================================= */}
      {/* 1. TOP NAVIGATION BAR (CapCut Desktop Dark Studio UI)                     */}
      {/* ========================================================================= */}
      <header className="h-14 bg-[#18181C] border-b border-[#2E2E33] px-3 flex items-center justify-between flex-shrink-0 z-30 select-none text-white">
        {/* Left: Back, Brand, Project Title, Save State, AI Editor */}
        <div className="flex items-center gap-3 min-w-0">
          {onExit && (
            <button
              onClick={onExit}
              title="Back to Projects"
              aria-label="Back to Projects"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#A0A0A8] hover:text-white hover:bg-[#222226] transition-colors cursor-pointer"
            >
              <ArrowLeft size={16} />
            </button>
          )}

          <div className="flex items-center gap-2 font-bold text-sm text-white">
            <BrandMark size={26} />
            <span className="tracking-tight hidden sm:inline">Kreovar</span>
          </div>

          <div className="h-4 w-[1px] bg-[#2E2E33]" />

          {/* Editable Project Title Input */}
          <input
            value={project.title}
            aria-label="Project Title"
            onFocus={() => store.begin()}
            onChange={(e) =>
              store.preview((p) => ({ ...p, title: e.target.value }))
            }
            onBlur={() => {
              if (!store.getSnapshot().title.trim()) {
                store.preview((p) => ({ ...p, title: "Untitled video" }));
              }
              store.commit();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="bg-[#121214] hover:bg-[#222226] focus:bg-[#18181C] border border-[#2E2E33] focus:border-[#00E5FF] rounded-lg px-2.5 py-1 text-xs font-semibold text-white outline-none w-44 sm:w-56 truncate transition-colors placeholder-[#6E6E78]"
          />

          {/* Cloud Auto-Save Status Indicator */}
          <button
            onClick={retrySave}
            title="Save status / Click to sync with cloud"
            className="flex items-center gap-1.5 text-[11px] font-mono text-[#A0A0A8] hover:text-white px-2.5 py-1 rounded-lg bg-[#121214] hover:bg-[#222226] border border-[#2E2E33] transition-colors cursor-pointer"
          >
            {persistenceState === "saving" || persistenceState === "loading" ? (
              <LoaderCircle size={12} className="animate-spin text-blue-500" />
            ) : persistenceState === "failed" ? (
              <AlertCircle size={12} className="text-rose-500" />
            ) : (
              <Check size={12} className="text-[#00E5FF]" />
            )}
            <span className="hidden md:inline">
              {
                {
                  saved: "Saved",
                  local: "Local",
                  saving: "Saving…",
                  unsaved: "Unsaved",
                  failed: "Save Failed",
                  loading: "Syncing…",
                }[persistenceState] || "Saved"
              }
            </span>
          </button>

          {/* AI Editor Quick Button with Sparkles */}
          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent("veelox:toggle-ai-chat"));
            }}
            title="AI Editor Studio Assistant"
            className="flex items-center gap-1.5 bg-[#222226] hover:bg-[#2A2A30] border border-[#2E2E33] text-white font-semibold text-xs px-3 py-1.5 rounded-lg transition-all active:scale-95 group cursor-pointer"
          >
            <Sparkles size={13} className="text-white group-hover:scale-110 group-hover:rotate-12 transition-transform" />
            <span className="hidden sm:inline">AI Editor</span>
          </button>
        </div>

        {/* Right: Keyboard Shortcuts Help, Undo/Redo, Aspect Ratio, Reframe, Preview Quality, Export Button */}
        <div className="flex items-center gap-2">
          {/* Keyboard Shortcuts Help Button */}
          <button
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard Shortcuts (?)"
            aria-label="Keyboard Shortcuts"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#A0A0A8] hover:text-white hover:bg-[#222226] transition-colors cursor-pointer"
          >
            <Keyboard size={15} />
          </button>

          {/* Undo */}
          <button
            disabled={!store.canUndo}
            onClick={() => store.undo()}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#A0A0A8] hover:text-white hover:bg-[#222226] disabled:opacity-25 disabled:hover:bg-transparent transition-colors cursor-pointer"
          >
            <Undo2 size={15} />
          </button>

          {/* Redo */}
          <button
            disabled={!store.canRedo}
            onClick={() => store.redo()}
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#A0A0A8] hover:text-white hover:bg-[#222226] disabled:opacity-25 disabled:hover:bg-transparent transition-colors cursor-pointer"
          >
            <Redo2 size={15} />
          </button>

          <div className="h-4 w-[1px] bg-[#2E2E33] mx-1" />

          {/* Aspect Ratio Selector (9:16, 16:9, 1:1, 4:5, 4:3) */}
          <div className="flex items-center bg-[#121214] border border-[#2E2E33] rounded-lg px-2.5 py-1.5 text-xs text-white">
            <span className="text-[#A0A0A8] mr-1.5 font-medium hidden sm:inline">Ratio</span>
            <select
              value={project.settings.aspectRatio}
              aria-label="Video Aspect Ratio"
              onChange={(e) =>
                run((p) => ({
                  ...p,
                  settings: {
                    ...p.settings,
                    aspectRatio: e.target.value as Ratio,
                  },
                }))
              }
              className="bg-transparent text-white text-xs font-semibold focus:outline-none cursor-pointer"
            >
              {aspectRatios.map((ratio) => (
                <option key={ratio} value={ratio} className="bg-[#18181C] text-white">
                  {ratio} ·{" "}
                  {
                    {
                      "9:16": "Portrait (9:16)",
                      "16:9": "Widescreen (16:9)",
                      "1:1": "Square (1:1)",
                      "4:5": "Social (4:5)",
                      "4:3": "Classic (4:3)",
                    }[ratio]
                  }
                </option>
              ))}
            </select>
          </div>

          {/* 1-Click 9:16 Smart Reframing Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setReframeOpen((prev) => !prev)}
              title="1-Click 16:9 to 9:16 Smart Reframing"
              className="flex items-center gap-1.5 bg-[#121214] hover:bg-[#222226] border border-[#2E2E33] hover:border-[#3E3E45] text-white font-medium text-xs px-2.5 py-1.5 rounded-lg shadow-2xs transition-all active:scale-95 cursor-pointer"
            >
              <Smartphone size={13} className="text-[#A0A0A8]" />
              <span className="hidden md:inline">Reframe 9:16</span>
              <ChevronDown
                size={11}
                className={reframeOpen ? "rotate-180 transition-transform" : "transition-transform"}
              />
            </button>
            {reframeOpen && (
              <div className="absolute right-0 mt-1.5 w-64 bg-[#18181C] border border-[#2E2E33] rounded-xl shadow-xl z-50 p-1.5 text-xs space-y-1">
                <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#A0A0A8]">
                  Smart 9:16 Conversion
                </div>
                <button
                  type="button"
                  onClick={() => {
                    run((p) => reframeProject(p, "fit-with-blur"));
                    notify("Applied 1-Click Fit with Blur (9:16)");
                    setReframeOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#222226] flex flex-col gap-0.5 text-white transition-colors"
                >
                  <span className="font-semibold flex items-center gap-1.5 text-white">
                    <span className="w-2 h-2 rounded-full bg-blue-500" /> Fit with Blur
                  </span>
                  <span className="text-[11px] text-[#A0A0A8]">
                    Scales to fit width; blurred background wings fill top &amp; bottom
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    run((p) => reframeProject(p, "center-crop"));
                    notify("Applied 1-Click Center Crop (1.77x Eye-Line)");
                    setReframeOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#222226] flex flex-col gap-0.5 text-white transition-colors"
                >
                  <span className="font-semibold flex items-center gap-1.5 text-white">
                    <span className="w-2 h-2 rounded-full bg-indigo-400" /> Center Crop (Eye-Line)
                  </span>
                  <span className="text-[11px] text-[#A0A0A8]">
                    1.77x punch-in centered on upper-third eye-line (focusY: -0.14)
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    run((p) => reframeProject(p, "split-screen"));
                    notify("Applied 1-Click Split Screen (A-Roll + B-Roll)");
                    setReframeOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#222226] flex flex-col gap-0.5 text-white transition-colors"
                >
                  <span className="font-semibold flex items-center gap-1.5 text-white">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" /> Split Screen
                  </span>
                  <span className="text-[11px] text-[#A0A0A8]">
                    A-roll speaker top half + contextual B-roll / gameplay bottom half
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Preview Quality Selector */}
          <select
            value={previewQuality}
            onChange={(e) => setPreviewQuality(Number(e.target.value))}
            aria-label="Preview Resolution"
            className="bg-[#121214] border border-[#2E2E33] rounded-lg px-2.5 py-1.5 text-xs text-white font-medium focus:outline-none focus:border-[#3E3E45] cursor-pointer hidden sm:block"
          >
            <option value={540} className="bg-[#18181C] text-white">540p Draft</option>
            <option value={720} className="bg-[#18181C] text-white">720p HD</option>
            <option value={1080} className="bg-[#18181C] text-white">1080p FHD</option>
          </select>

          {/* Prominent CapCut Cyan Export Button */}
          <button
            onClick={() => setExportOpen(true)}
            disabled={!projectDuration(project)}
            title="Export Video"
            className="bg-[#00E5FF] text-black font-bold hover:bg-[#33EAFF] px-4 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-40 active:scale-95 text-xs cursor-pointer"
          >
            <Download size={14} className="stroke-[2.5]" />
            <span>Export</span>
          </button>
        </div>
      </header>

      {/* Recovery / Conflict / Notice Banners */}
      {recoveryMessage && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-1.5 flex items-center justify-between text-xs text-blue-800 z-30">
          <span>{recoveryMessage}</span>
          <button onClick={dismissRecovery} className="p-0.5 text-slate-500 hover:text-slate-900 cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}
      {(notice || conflict) && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 flex items-center justify-between text-xs text-amber-900 z-30">
          <span>
            {conflict
              ? "This project was saved in another window. Cloud autosave paused to protect your edit."
              : notice}
          </span>
          {conflict ? (
            <button
              onClick={onReloadConflict}
              className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-0.5 rounded font-semibold cursor-pointer"
            >
              Reload Saved
            </button>
          ) : (
            <button onClick={onDismissNotice} className="p-0.5 text-amber-600 hover:text-amber-900 cursor-pointer">
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MIDDLE REGION: TOOLBAR + ASSET DRAWER + CANVAS + AI EDITOR            */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden relative bg-[#121214]">
        {/* Left: Mini-Bar Tool Navigation (Width: 64px) */}
        <ToolSidebar
          activeTab={activeTab}
          onSelectTab={handleToolTabSelect}
          isDrawerOpen={isDrawerOpen}
          onToggleDrawer={() => setIsDrawerOpen(!isDrawerOpen)}
          hasSelection={selection.length > 0}
          onOpenShortcuts={() => setShortcutsOpen(true)}
        />

        {/* Collapsible Secondary Tool Drawer (Width: 320px) */}
        {isDrawerOpen && (
          <AssetDrawer
            activeTab={activeTab}
            onClose={() => setIsDrawerOpen(false)}
          />
        )}

        {/* Center: Video Preview Canvas Stage */}
        <CanvasStage quality={previewQuality} />

        {/* Right: Persistent Conversational AI Editor (Width: 360px) */}
        <EditorAIChat />
      </div>

      {/* ========================================================================= */}
      {/* 3. RESIZER HANDLE FOR TIMELINE                                            */}
      {/* ========================================================================= */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize timeline height"
        tabIndex={0}
        onPointerDown={handleTimelineResize}
        onDoubleClick={() => setTimelineHeight(300)}
        className="h-2 w-full bg-[#18181C] hover:bg-[#222226] border-t border-b border-[#2E2E33] cursor-row-resize flex items-center justify-center transition-colors group z-20"
      >
        <div className="w-10 h-1 bg-[#2E2E33] group-hover:bg-[#A0A0A8] rounded-full transition-colors" />
      </div>

      {/* ========================================================================= */}
      {/* 4. BOTTOM REGION: RESIZABLE MULTI-TRACK TIMELINE (280px-360px)            */}
      {/* ========================================================================= */}
      <div className="flex-shrink-0" style={{ height: `${timelineHeight}px` }}>
        <TimelinePanel height={timelineHeight} />
      </div>

      {/* Export Modal */}
      {exportOpen && <ExportDialog close={() => setExportOpen(false)} />}

      {/* Keyboard Shortcuts Dialog */}
      {shortcutsOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShortcutsOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            className="w-full max-w-2xl bg-[#18181C] border border-[#2E2E33] rounded-2xl p-6 shadow-2xl text-white space-y-4 max-h-[88vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#2E2E33] pb-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Keyboard size={20} className="text-[#A0A0A8]" />
                <div>
                  <h2 id="shortcuts-title" className="font-semibold text-sm text-white">
                    NLE Keyboard Shortcuts &amp; Navigation
                  </h2>
                  <p className="text-[11px] text-[#A0A0A8]">
                    Pro CapCut Studio editing workflows (Split, Trim, Magnetic Ripple, Snapping).
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShortcutsOpen(false)}
                className="text-[#A0A0A8] hover:text-white p-1 rounded-lg hover:bg-[#222226] transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 pr-1 flex-1">
              {(
                [
                  "Playback & Shuttle",
                  "Editing & Split",
                  "Tracks & Audio",
                  "History & Clipboard",
                  "Navigation & View",
                ] as const
              ).map((category) => {
                const items = SHORTCUT_DEFINITIONS.filter((d) => d.category === category);
                if (!items.length) return null;
                return (
                  <div key={category} className="space-y-1.5">
                    <h3 className="text-[11px] font-bold text-[#A0A0A8] uppercase tracking-wider">
                      {category}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {items.map((def) => (
                        <div
                          key={def.id}
                          className="p-2 rounded-lg bg-[#222226] border border-[#2E2E33] flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-white text-[11px] font-medium font-sans truncate">
                              {def.label}
                            </div>
                            <div className="text-[#A0A0A8] text-[10px] truncate">
                              {def.description}
                            </div>
                          </div>
                          <span className="text-white font-mono font-bold text-[10px] bg-[#18181C] border border-[#2E2E33] px-2 py-0.5 rounded shadow-2xs whitespace-nowrap shrink-0">
                            {def.keys}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-[#2E2E33] pt-3 flex items-center justify-between flex-shrink-0 text-[11px] text-[#A0A0A8]">
              <span>On macOS, use ⌘ Command instead of Ctrl.</span>
              <button
                type="button"
                onClick={() => {
                  loadDemoProjectIntoStore(store);
                  setShortcutsOpen(false);
                  notify("Loaded 15-second creator demo project.");
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#222226] hover:bg-[#2A2A30] text-white font-semibold border border-[#2E2E33] transition-colors cursor-pointer"
              >
                <Sparkles size={13} />
                <span>Try Demo Project</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
