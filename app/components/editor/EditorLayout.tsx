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
} from "lucide-react";
import BrandMark from "../BrandMark";
import ThemeToggle from "../ThemeToggle";
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
import { duplicateClip, removeClip, splitClip, pasteClips } from "@/app/lib/editor/operations";
import { nudgeClips } from "@/app/lib/editor/timelineNavigation";

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

  // Global Keyboard Shortcuts
  useEffect(() => {
    const isEditingTarget = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      !!target.closest("input,textarea,select,[contenteditable=true],dialog");

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (isEditingTarget(target) || exportOpen || shortcutsOpen) return;

      const modifier = event.ctrlKey || event.metaKey;
      const curProject = store.getSnapshot();
      const time = playback.getSnapshot().time;
      const key = event.key.toLowerCase();

      // Undo / Redo
      if (modifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
      } else if (modifier && key === "y") {
        event.preventDefault();
        store.redo();
      }
      // Save
      else if (modifier && key === "s") {
        event.preventDefault();
        retrySave?.();
      }
      // Play / Pause toggle
      else if (event.code === "Space") {
        event.preventDefault();
        const state = playback.getSnapshot();
        playback.set(state.time, !state.playing);
      }
      // Select All Unlocked Clips
      else if (modifier && key === "a") {
        event.preventDefault();
        select(
          Object.keys(curProject.clips).filter(
            (id) => !curProject.tracks[curProject.clips[id].trackId]?.locked
          )
        );
      }
      // Nudge
      else if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight") && selection.length) {
        event.preventDefault();
        run((p) =>
          nudgeClips(p, selection, (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 10 : 1))
        );
      }
      // Frame Step
      else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const dur = projectDuration(curProject);
        const delta = (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 10 : 1) / curProject.settings.fps;
        playback.set(Math.max(0, Math.min(dur, time + delta)), false);
      }
      // Split
      else if (key === "s" && !modifier) {
        event.preventDefault();
        const targets = (selection.length ? selection : Object.keys(curProject.clips)).filter((id) => {
          const c = curProject.clips[id];
          return (
            !curProject.tracks[c.trackId]?.locked &&
            time > c.startTime + 1 / curProject.settings.fps &&
            time < c.startTime + c.duration - 1 / curProject.settings.fps
          );
        });
        if (targets.length) {
          run((p) => targets.reduce((next, id) => splitClip(next, id, time), p));
        } else {
          notify("Move the playhead inside a clip to split.");
        }
      }
      // Duplicate
      else if (modifier && key === "d") {
        event.preventDefault();
        run((p) => selection.reduce((next, id) => duplicateClip(next, id), p));
      }
      // Delete
      else if ((event.key === "Delete" || event.key === "Backspace") && selection.length) {
        event.preventDefault();
        run((p) => selection.reduce((next, id) => removeClip(next, id), p));
        select([]);
      }
      // Deselect or cancel
      else if (event.key === "Escape") {
        store.cancel();
        select([]);
      }
      // Shortcuts modal trigger
      else if (event.key === "?") {
        setShortcutsOpen(true);
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
    <div className="hidden md:flex h-screen w-screen overflow-hidden bg-[#F8FAFC] text-[#0F172A] flex-col font-sans select-none antialiased">
      <CaptionFonts />

      {/* ========================================================================= */}
      {/* 1. TOP NAVIGATION BAR                                                    */}
      {/* ========================================================================= */}
      <header className="h-14 bg-white border-b border-slate-200 px-3 flex items-center justify-between flex-shrink-0 z-30 select-none">
        {/* Left: Back, Brand, Project Title, Save State */}
        <div className="flex items-center gap-3 min-w-0">
          {onExit && (
            <button
              onClick={onExit}
              title="Back to Projects"
              aria-label="Back to Projects"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft size={16} />
            </button>
          )}

          <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
            <BrandMark size={26} />
            <span className="tracking-tight hidden sm:inline">Kreovar</span>
          </div>

          <div className="h-4 w-[1px] bg-slate-200" />

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
            className="bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-200 focus:border-blue-600 rounded-lg px-2 py-1 text-xs font-semibold text-slate-900 outline-none w-44 sm:w-56 truncate transition-colors"
          />

          {/* Cloud Sync State Badge */}
          <button
            onClick={retrySave}
            title="Save status / Click to sync with cloud"
            className="flex items-center gap-1.5 text-[11px] font-mono text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 transition-colors"
          >
            {persistenceState === "saving" || persistenceState === "loading" ? (
              <LoaderCircle size={12} className="animate-spin text-blue-600" />
            ) : persistenceState === "failed" ? (
              <AlertCircle size={12} className="text-rose-600" />
            ) : (
              <Check size={12} className="text-emerald-600" />
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
        </div>

        {/* Right: Theme Toggle, Undo/Redo, Aspect Ratio, Preview Quality, Export Button */}
        <div className="flex items-center gap-2">
          <ThemeToggle />

          {/* Undo */}
          <button
            disabled={!store.canUndo}
            onClick={() => store.undo()}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <Undo2 size={15} />
          </button>

          {/* Redo */}
          <button
            disabled={!store.canRedo}
            onClick={() => store.redo()}
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <Redo2 size={15} />
          </button>

          <div className="h-4 w-[1px] bg-slate-200 mx-1" />

          {/* Aspect Ratio Selector */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
            <span className="text-slate-500 mr-1.5 font-medium hidden sm:inline">Ratio</span>
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
              className="bg-transparent text-slate-800 text-xs font-semibold focus:outline-none cursor-pointer"
            >
              {aspectRatios.map((ratio) => (
                <option key={ratio} value={ratio} className="bg-white text-slate-900">
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

          {/* Preview Quality Selector */}
          <select
            value={previewQuality}
            onChange={(e) => setPreviewQuality(Number(e.target.value))}
            aria-label="Preview Resolution"
            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-medium focus:outline-none focus:border-blue-600 cursor-pointer hidden sm:block"
          >
            <option value={540} className="bg-white text-slate-900">540p Draft</option>
            <option value={720} className="bg-white text-slate-900">720p HD</option>
            <option value={1080} className="bg-white text-slate-900">1080p Full HD</option>
          </select>

          {/* Export Button */}
          <button
            onClick={() => setExportOpen(true)}
            disabled={!projectDuration(project)}
            title="Export Video"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#0F172A] hover:bg-slate-800 disabled:opacity-40 text-white font-semibold text-xs shadow-sm transition-colors"
          >
            <Download size={14} />
            <span>Export</span>
          </button>
        </div>
      </header>

      {/* Recovery / Conflict / Notice Banners */}
      {recoveryMessage && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-1.5 flex items-center justify-between text-xs text-blue-800 z-30">
          <span>{recoveryMessage}</span>
          <button onClick={dismissRecovery} className="p-0.5 text-blue-600 hover:text-blue-900">
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
              className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-0.5 rounded font-semibold"
            >
              Reload Saved
            </button>
          ) : (
            <button onClick={onDismissNotice} className="p-0.5 text-amber-700 hover:text-amber-950">
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MIDDLE REGION: TOOLBAR + ASSET DRAWER + CANVAS + AI CHAT COPILOT      */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden relative">
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

        {/* Right: Persistent Conversational AI Copilot (Width: 360px) */}
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
        className="h-2 w-full bg-[#EDF1F6] hover:bg-blue-100 border-t border-b border-slate-200 cursor-row-resize flex items-center justify-center transition-colors group z-20"
      >
        <div className="w-10 h-1 bg-slate-300 group-hover:bg-blue-600 rounded-full transition-colors" />
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
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShortcutsOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl text-slate-900 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Keyboard size={20} className="text-blue-600" />
                <h2 id="shortcuts-title" className="font-semibold text-sm text-slate-900">
                  Keyboard Workstation Shortcuts
                </h2>
              </div>
              <button
                onClick={() => setShortcutsOpen(false)}
                className="text-slate-400 hover:text-slate-900 p-1 rounded-lg hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              {[
                ["Play / Pause", "Space"],
                ["Split Clip", "S"],
                ["Delete Clip", "Delete / Backspace"],
                ["Duplicate Clip", "Ctrl + D"],
                ["Undo / Redo", "Ctrl + Z / Ctrl + Shift + Z"],
                ["Step Frame", "← / →"],
                ["Select All", "Ctrl + A"],
                ["Nudge Clip", "Alt + ← / →"],
                ["Toggle Snapping", "N"],
                ["Fit Timeline", "F"],
                ["Timeline Zoom", "+ / -"],
                ["Deselect", "Esc"],
              ].map(([action, shortcut]) => (
                <div
                  key={action}
                  className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between"
                >
                  <span className="text-slate-600 text-[11px] font-sans">{action}</span>
                  <span className="text-blue-700 font-semibold text-[10px] bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                    {shortcut}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-slate-500 text-center pt-2">
              On macOS, use ⌘ Command instead of Ctrl.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
