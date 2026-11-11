"use client";

import React, { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Download,
  Check,
  LoaderCircle,
  AlertCircle,
  X,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Scissors,
} from "lucide-react";
import CaptionFonts from "../../captions/CaptionFonts";
import type { EditorLayoutProps } from "../EditorLayout";
import { useEditor } from "../workspace/EditorContext";
import { usePlayback, useProject } from "@/app/lib/editor/store";
import { formatTime, projectDuration } from "@/app/lib/editor/model";
import { splitClip } from "@/app/lib/editor/operations";
import MobileCanvasStage from "./MobileCanvasStage";
import MobileTimeline from "./MobileTimeline";
import MobileBottomBar, { type MobileToolDrawerTab } from "./MobileBottomBar";
import MobileDrawerSheet from "./MobileDrawerSheet";
import MobileAIChatSheet from "./MobileAIChatSheet";

const ExportDialog = dynamic(() => import("../workspace/ExportDialog"), {
  ssr: false,
});

export default function MobileEditorLayout({
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
  const { store, playback, selection, run, notify } = useEditor();
  const project = useProject(store);
  const playbackState = usePlayback(playback);

  const [previewQuality, setPreviewQuality] = useState<number>(720);
  const [activeDrawer, setActiveDrawer] = useState<MobileToolDrawerTab | null>(null);
  const [isAiSheetOpen, setIsAiSheetOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const duration = projectDuration(project);
  const fps = project.settings.fps || 30;
  const hasClips = Object.keys(project.clips).length > 0;

  const handleTogglePlay = useCallback(() => {
    const state = playback.getSnapshot();
    const curDuration = projectDuration(store.getSnapshot());
    if (!state.playing && curDuration > 0 && state.time >= curDuration) {
      playback.set(0, true);
    } else {
      playback.set(state.time, !state.playing);
    }
  }, [playback, store]);

  const handleStepFrame = useCallback(
    (frames: number) => {
      const curProject = store.getSnapshot();
      const curDuration = projectDuration(curProject);
      const curFps = curProject.settings.fps || 30;
      const curTime = playback.getSnapshot().time;
      const nextTime = Math.max(0, Math.min(curDuration, curTime + frames / curFps));
      playback.set(nextTime, false);
    },
    [playback, store]
  );

  const handleSplit = useCallback(() => {
    const curProject = store.getSnapshot();
    const t = playback.getSnapshot().time;
    const curFps = curProject.settings.fps || 30;

    const targets = (selection.length ? selection : Object.keys(curProject.clips)).filter(
      (id) => {
        const clip = curProject.clips[id];
        return (
          clip &&
          !curProject.tracks[clip.trackId]?.locked &&
          t > clip.startTime + 1 / curFps &&
          t < clip.startTime + clip.duration - 1 / curFps
        );
      }
    );

    if (targets.length > 0) {
      navigator.vibrate?.(10);
      run((p) => targets.reduce((next, id) => splitClip(next, id, t), p));
    } else {
      notify("Move the playhead inside a clip to split.");
    }
  }, [notify, playback, run, selection, store]);

  const handleSelectDrawer = useCallback((tab: MobileToolDrawerTab) => {
    setIsAiSheetOpen(false);
    setActiveDrawer((prev) => (prev === tab ? null : tab));
  }, []);

  const handleOpenAiCopilot = useCallback(() => {
    setActiveDrawer(null);
    setIsAiSheetOpen((prev) => !prev);
  }, []);

  return (
    <div className="flex md:hidden h-[100dvh] w-screen overflow-hidden flex-col bg-[#F8FAFC] text-[#0F172A] select-none overscroll-none font-sans antialiased">
      <CaptionFonts />

      {/* 1. TOP BAR (48px + Safe Area Top) */}
      <header className="pt-[env(safe-area-inset-top)] min-h-[calc(48px+env(safe-area-inset-top))] bg-white border-b border-slate-200 px-1.5 flex items-center justify-between flex-shrink-0 z-30">
        {/* Left: Back, Compact Title, Save Status */}
        <div className="flex items-center gap-0.5 min-w-0 flex-1 mr-1">
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              aria-label="Back to Projects"
              className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-700 active:bg-slate-100 transition-colors flex-shrink-0"
            >
              <ArrowLeft size={18} />
            </button>
          )}

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
            className="bg-transparent focus:bg-slate-100 border border-transparent focus:border-blue-600 rounded-lg px-2 py-1 text-base sm:text-xs font-semibold text-slate-900 outline-none min-w-0 flex-1 max-w-[148px] truncate transition-colors"
          />

          <button
            type="button"
            onClick={retrySave}
            aria-label={`Sync status: ${persistenceState}`}
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-500 active:bg-slate-100 transition-colors flex-shrink-0"
          >
            {persistenceState === "saving" || persistenceState === "loading" ? (
              <LoaderCircle size={15} className="animate-spin text-blue-600" />
            ) : persistenceState === "failed" ? (
              <AlertCircle size={15} className="text-rose-600" />
            ) : (
              <Check size={15} className="text-emerald-600" />
            )}
          </button>
        </div>

        {/* Right: Undo, Redo, Export */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            type="button"
            disabled={!store.canUndo}
            onClick={() => store.undo()}
            aria-label="Undo"
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-700 active:bg-slate-100 disabled:opacity-30 transition-colors"
          >
            <Undo2 size={17} />
          </button>
          <button
            type="button"
            disabled={!store.canRedo}
            onClick={() => store.redo()}
            aria-label="Redo"
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-700 active:bg-slate-100 disabled:opacity-30 transition-colors"
          >
            <Redo2 size={17} />
          </button>
          <button
            type="button"
            disabled={!hasClips}
            onClick={() => setExportOpen(true)}
            aria-label="Export Video"
            className="min-h-[44px] min-w-[44px] ml-0.5 px-3 rounded-xl bg-[#0F172A] active:bg-slate-800 disabled:opacity-40 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Download size={14} />
            <span>Export</span>
          </button>
        </div>
      </header>

      {/* Recovery / Conflict / Notice Banners */}
      {recoveryMessage && (
        <div className="bg-blue-50 border-b border-blue-200 px-3 py-1 flex items-center justify-between text-[11px] text-blue-900 z-30 flex-shrink-0">
          <span className="truncate pr-2">{recoveryMessage}</span>
          <button
            type="button"
            onClick={dismissRecovery}
            aria-label="Dismiss recovery notice"
            className="min-w-[44px] min-h-[44px] -my-2 flex items-center justify-center text-blue-700"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {(notice || conflict) && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-1 flex items-center justify-between text-[11px] text-amber-900 z-30 flex-shrink-0">
          <span className="truncate pr-2">
            {conflict
              ? "Saved in another window. Autosave paused."
              : notice}
          </span>
          {conflict ? (
            <button
              type="button"
              onClick={onReloadConflict}
              className="min-h-[44px] -my-2 px-3 flex items-center text-[11px] font-semibold text-white bg-amber-600 rounded-lg"
            >
              Reload
            </button>
          ) : (
            <button
              type="button"
              onClick={onDismissNotice}
              aria-label="Dismiss notice"
              className="min-w-[44px] min-h-[44px] -my-2 flex items-center justify-center text-amber-700"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* 2. DYNAMIC CANVAS VIEWPORT (Flex-1) */}
      <MobileCanvasStage
        quality={previewQuality}
        onChangeQuality={setPreviewQuality}
        onOpenImport={() => {
          setIsAiSheetOpen(false);
          setActiveDrawer("edit");
        }}
        onOpenAiCopilot={() => {
          setActiveDrawer(null);
          setIsAiSheetOpen(true);
        }}
      />

      {/* 3. TIMECODE & PLAYBACK BAR (40px layout strip with >=44px touch hits) */}
      <div className="h-10 bg-white border-t border-slate-200 px-2 flex items-center justify-between flex-shrink-0 z-20">
        {/* Left: Step Frame & Play/Pause */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => handleStepFrame(-1)}
            aria-label="Step back 1 frame"
            className="min-w-[44px] min-h-[44px] -my-0.5 flex items-center justify-center text-slate-600 active:text-slate-900 active:bg-slate-100 rounded-lg transition-colors"
          >
            <ChevronLeft size={18} />
          </button>

          <button
            type="button"
            onClick={handleTogglePlay}
            aria-label={playbackState.playing ? "Pause" : "Play"}
            className="min-w-[44px] min-h-[44px] -my-0.5 flex items-center justify-center text-white active:scale-95 transition-transform"
          >
            <span className="w-8 h-8 rounded-full bg-[#0F172A] flex items-center justify-center shadow-sm">
              {playbackState.playing ? (
                <Pause size={15} fill="currentColor" />
              ) : (
                <Play size={15} fill="currentColor" className="ml-0.5" />
              )}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleStepFrame(1)}
            aria-label="Step forward 1 frame"
            className="min-w-[44px] min-h-[44px] -my-0.5 flex items-center justify-center text-slate-600 active:text-slate-900 active:bg-slate-100 rounded-lg transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Center: Monospace Timecode */}
        <div className="flex items-center gap-1 font-mono text-[11px] tabular-nums tracking-tight px-2">
          <span className="text-slate-900 font-semibold">
            {formatTime(playbackState.time, fps)}
          </span>
          <span className="text-slate-400">/</span>
          <span className="text-slate-500">{formatTime(duration, fps)}</span>
        </div>

        {/* Right: Split Clip Action */}
        <button
          type="button"
          onClick={handleSplit}
          aria-label="Split clip at playhead"
          className="min-w-[44px] min-h-[44px] -my-0.5 px-2.5 flex items-center justify-center gap-1.5 text-slate-700 active:bg-slate-100 rounded-lg text-[11px] font-medium transition-colors"
        >
          <Scissors size={15} className="text-blue-600" />
          <span>Split</span>
        </button>
      </div>

      {/* 4. COMPACT MOBILE TOUCH TIMELINE (160px) */}
      <MobileTimeline />

      {/* 5. BOTTOM FIXED TOOL DOCK (56px + Safe Area Bottom) */}
      <MobileBottomBar
        activeDrawer={activeDrawer}
        isAiSheetOpen={isAiSheetOpen}
        onSelectDrawer={handleSelectDrawer}
        onOpenAiCopilot={handleOpenAiCopilot}
        hasSelection={selection.length > 0}
      />

      {/* SLIDING TOOL & AI COPILOT SHEETS */}
      <MobileDrawerSheet
        activeTab={activeDrawer}
        onClose={() => setActiveDrawer(null)}
      />

      <MobileAIChatSheet
        isOpen={isAiSheetOpen}
        onClose={() => setIsAiSheetOpen(false)}
      />

      {/* EXPORT MODAL */}
      {exportOpen && <ExportDialog close={() => setExportOpen(false)} />}
    </div>
  );
}
