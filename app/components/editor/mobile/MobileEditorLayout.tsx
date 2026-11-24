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
  Maximize2,
  Minimize2,
} from "lucide-react";
import CaptionFonts from "../../captions/CaptionFonts";
import type { EditorLayoutProps } from "../EditorLayout";
import { useEditor } from "../workspace/EditorContext";
import { usePlayback, useProject } from "@/app/lib/editor/store";
import { formatTime, projectDuration } from "@/app/lib/editor/model";
import { splitClip, removeClip, duplicateClip } from "@/app/lib/editor/operations";
import { captureKeyframe, setTransformKeyframes } from "@/app/lib/editor/keyframes";
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
  const { store, playback, selection, select, run, notify } = useEditor();
  const project = useProject(store);
  const playbackState = usePlayback(playback);

  const [previewQuality, setPreviewQuality] = useState<number>(1080);
  const [activeDrawer, setActiveDrawer] = useState<MobileToolDrawerTab | null>(null);
  const [isAiSheetOpen, setIsAiSheetOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [isFullscreenPreview, setIsFullscreenPreview] = useState(false);

  const duration = projectDuration(project);
  const fps = project.settings.fps || 30;
  const hasClips = Object.keys(project.clips).length > 0;

  // Selected clip inspection for keyframes & operations
  const selectedClipId = selection[0];
  const selectedClip = selectedClipId ? project.clips[selectedClipId] : undefined;
  const isInsideClip =
    !!selectedClip &&
    playbackState.time >= selectedClip.startTime &&
    playbackState.time <= selectedClip.startTime + selectedClip.duration;
  const clipSourceTime =
    selectedClip && isInsideClip
      ? selectedClip.sourceStart +
        (Math.round((playbackState.time - selectedClip.startTime) * fps) / fps) * selectedClip.speed
      : null;
  const hasKeyframeAtPlayhead =
    !!selectedClip &&
    clipSourceTime !== null &&
    (selectedClip.keyframes || []).some(
      (kf) => Math.abs(kf.sourceTime - clipSourceTime) <= selectedClip.speed / fps / 2 + 1e-4
    );

  const handleTogglePlay = useCallback(() => {
    const state = playback.getSnapshot();
    const curDuration = projectDuration(store.getSnapshot());
    if (curDuration <= 0) return;
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
      notify("Clip split at playhead.");
    } else {
      notify("Move the playhead inside a clip to split.");
    }
  }, [notify, playback, run, selection, store]);

  const handleDeleteSelected = useCallback(() => {
    if (selection.length > 0) {
      navigator.vibrate?.(10);
      run((p) => selection.reduce((next, id) => removeClip(next, id), p));
      select([]);
      notify("Clip deleted.");
    }
  }, [selection, run, select, notify]);

  const handleDuplicateSelected = useCallback(() => {
    if (selection.length > 0) {
      navigator.vibrate?.(8);
      run((p) => selection.reduce((next, id) => duplicateClip(next, id), p));
      notify("Clip duplicated.");
    }
  }, [selection, run, notify]);

  const handleToggleKeyframe = useCallback(() => {
    if (!selectedClip || !isInsideClip || clipSourceTime === null) {
      notify("Select a clip and place playhead inside it to add keyframes.");
      return;
    }
    navigator.vibrate?.(10);
    if (hasKeyframeAtPlayhead) {
      // Remove keyframe at current playhead
      run((p) => {
        const c = p.clips[selectedClip.id];
        if (!c) return p;
        const remaining = (c.keyframes || []).filter(
          (kf) => Math.abs(kf.sourceTime - clipSourceTime) > c.speed / fps / 2 + 1e-4
        );
        return setTransformKeyframes(p, c.id, remaining);
      });
      notify("Keyframe removed at playhead");
    } else {
      // Add keyframe at current playhead
      run((p) => {
        const c = p.clips[selectedClip.id];
        if (!c) return p;
        return captureKeyframe(p, c.id, playbackState.time, c.transform, "smooth");
      });
      notify("Keyframe added at playhead");
    }
  }, [
    selectedClip,
    isInsideClip,
    clipSourceTime,
    hasKeyframeAtPlayhead,
    notify,
    run,
    fps,
    playbackState.time,
  ]);

  const handleSelectDrawer = useCallback((tab: MobileToolDrawerTab) => {
    setIsAiSheetOpen(false);
    setActiveDrawer((prev) => (prev === tab ? null : tab));
  }, []);

  const handleOpenAiCopilot = useCallback(() => {
    setActiveDrawer(null);
    setIsAiSheetOpen((prev) => !prev);
  }, []);

  const toggleQuality = useCallback(() => {
    setPreviewQuality((prev) => (prev === 1080 ? 720 : 1080));
    navigator.vibrate?.(6);
  }, []);

  return (
    <div className="flex md:hidden h-[100dvh] w-screen overflow-hidden flex-col bg-slate-50 text-slate-900 select-none overscroll-none font-sans antialiased">
      <CaptionFonts />

      {/* 1. TOP BAR (48px + Safe Area Top) matching CapCut Mobile */}
      <header className="pt-[env(safe-area-inset-top)] min-h-[calc(48px+env(safe-area-inset-top))] bg-white border-b border-slate-200 px-2 flex items-center justify-between flex-shrink-0 z-30">
        {/* Left: Back Arrow '<' & subtle project title / save check */}
        <div className="flex items-center gap-1 min-w-0 flex-1 mr-1">
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              aria-label="Back to Projects"
              className="min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-slate-700 active:bg-slate-100 active:scale-95 transition-all flex-shrink-0"
            >
              <ArrowLeft size={19} className="text-slate-800" />
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
            className="bg-transparent focus:bg-slate-100 border border-transparent focus:border-slate-300 rounded-lg px-2 py-0.5 text-xs font-semibold text-slate-800 outline-none min-w-0 flex-1 max-w-[120px] sm:max-w-[150px] truncate transition-colors"
          />

          <button
            type="button"
            onClick={retrySave}
            aria-label={`Sync status: ${persistenceState}`}
            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 active:bg-slate-100 transition-colors flex-shrink-0"
          >
            {persistenceState === "saving" || persistenceState === "loading" ? (
              <LoaderCircle size={13} className="animate-spin text-blue-600" />
            ) : persistenceState === "failed" ? (
              <AlertCircle size={13} className="text-rose-500" />
            ) : (
              <Check size={13} className="text-emerald-600" />
            )}
          </button>
        </div>

        {/* Center: Resolution Badge Pill (e.g. '1080P · 30fps') */}
        <div className="flex items-center justify-center flex-shrink-0 px-1">
          <button
            type="button"
            onClick={toggleQuality}
            aria-label={`Resolution: ${previewQuality}P at ${fps} FPS. Tap to change.`}
            className="min-h-[28px] px-2.5 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 text-[11px] font-semibold flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            <span>{previewQuality}P · {fps}fps</span>
          </button>
        </div>

        {/* Right: Undo '↺', Redo '↻', and Clean Slate Export button */}
        <div className="flex items-center gap-1 flex-shrink-0 ml-1">
          <button
            type="button"
            disabled={!store.canUndo}
            onClick={() => store.undo()}
            aria-label="Undo"
            title="Undo (↺)"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-600 active:bg-slate-100 disabled:opacity-30 transition-all active:scale-95"
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            disabled={!store.canRedo}
            onClick={() => store.redo()}
            aria-label="Redo"
            title="Redo (↻)"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-600 active:bg-slate-100 disabled:opacity-30 transition-all active:scale-95"
          >
            <Redo2 size={16} />
          </button>
          <button
            type="button"
            disabled={!hasClips}
            onClick={() => setExportOpen(true)}
            aria-label="Export Video"
            className="min-h-[30px] ml-1 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 disabled:opacity-30 text-white font-semibold text-xs px-3.5 py-1.5 rounded-full flex items-center gap-1.5 shadow-xs active:scale-95 transition-all"
          >
            <Download size={13} className="text-white stroke-[2.5]" />
            <span>Export</span>
          </button>
        </div>
      </header>

      {/* Recovery / Conflict / Notice Banners */}
      {recoveryMessage && (
        <div className="bg-[#1C2030] border-b border-blue-900/60 px-3 py-1 flex items-center justify-between text-[11px] text-blue-200 z-30 flex-shrink-0">
          <span className="truncate pr-2">{recoveryMessage}</span>
          <button
            type="button"
            onClick={dismissRecovery}
            aria-label="Dismiss recovery notice"
            className="w-7 h-7 flex items-center justify-center text-blue-300"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {(notice || conflict) && (
        <div className="bg-[#2D2012] border-b border-amber-800/60 px-3 py-1 flex items-center justify-between text-[11px] text-amber-200 z-30 flex-shrink-0">
          <span className="truncate pr-2">
            {conflict
              ? "Saved in another window. Autosave paused."
              : notice}
          </span>
          {conflict ? (
            <button
              type="button"
              onClick={onReloadConflict}
              className="px-2.5 py-0.5 text-[11px] font-semibold text-black bg-[#00E5FF] rounded-lg"
            >
              Reload
            </button>
          ) : (
            <button
              type="button"
              onClick={onDismissNotice}
              aria-label="Dismiss notice"
              className="w-7 h-7 flex items-center justify-center text-amber-300"
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
        isFullscreen={isFullscreenPreview}
        onToggleFullscreen={() => setIsFullscreenPreview(false)}
        onOpenImport={() => {
          setIsAiSheetOpen(false);
          setActiveDrawer("edit");
        }}
        onOpenAiCopilot={() => {
          setActiveDrawer(null);
          setIsAiSheetOpen(true);
        }}
      />

      {/* 3. MIDDLE TRANSPORT & KEYFRAME STRIP (between Canvas and Timeline) */}
      <div className="h-11 bg-white border-t border-slate-200 px-3 flex items-center justify-between flex-shrink-0 z-20 select-none">
        {/* Left: Timecode '00:00 / 00:15' */}
        <div className="flex items-center gap-1 font-mono text-[11px] tabular-nums tracking-tight">
          <span className="text-slate-900 font-semibold">
            {formatTime(playbackState.time, fps)}
          </span>
          <span className="text-slate-400">/</span>
          <span className="text-slate-600">{formatTime(duration, fps)}</span>
        </div>

        {/* Center: Round Play/Pause button with frame step chevrons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleStepFrame(-1)}
            aria-label="Step back 1 frame"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-800 active:bg-slate-100 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>

          <button
            type="button"
            onClick={handleTogglePlay}
            aria-label={playbackState.playing ? "Pause" : "Play"}
            className="w-10 h-10 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 rounded-full flex items-center justify-center shadow-xs active:scale-95 transition-all"
          >
            {playbackState.playing ? (
              <Pause size={17} fill="currentColor" />
            ) : (
              <Play size={17} fill="currentColor" className="ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => handleStepFrame(1)}
            aria-label="Step forward 1 frame"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-800 active:bg-slate-100 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Right: Keyframe Diamond button ('◇+' or solid '◆') + Fullscreen button '⛶' */}
        <div className="flex items-center gap-1.5">
          {/* Keyframe Diamond Button */}
          <button
            type="button"
            onClick={handleToggleKeyframe}
            aria-label={
              hasKeyframeAtPlayhead
                ? "Remove Keyframe at playhead"
                : "Add Keyframe at playhead"
            }
            title={
              hasKeyframeAtPlayhead
                ? "Remove Keyframe at playhead"
                : "Add Keyframe at playhead (◇+)"
            }
            className={`min-h-[30px] px-2 rounded-lg flex items-center gap-1 text-xs font-semibold transition-all active:scale-95 ${
              !selectedClip
                ? "opacity-35 cursor-not-allowed text-slate-400"
                : hasKeyframeAtPlayhead
                ? "bg-blue-50 text-blue-600 border border-blue-300"
                : "bg-slate-100 text-slate-700 hover:text-slate-900 hover:bg-slate-200 border border-slate-200"
            }`}
          >
            {hasKeyframeAtPlayhead ? (
              <span className="text-blue-600 text-base leading-none">
                ◆
              </span>
            ) : (
              <span className="text-slate-700 text-xs leading-none font-bold">
                ◇+
              </span>
            )}
          </button>

          {/* Fullscreen button '⛶' */}
          <button
            type="button"
            onClick={() => setIsFullscreenPreview((prev) => !prev)}
            aria-label="Toggle Fullscreen Preview (⛶)"
            title="Fullscreen Preview"
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 ${
              isFullscreenPreview
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:text-slate-900 hover:bg-slate-200 border border-slate-200"
            }`}
          >
            {isFullscreenPreview ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>

      {/* 4. COMPACT MOBILE TOUCH TIMELINE (160px) */}
      <MobileTimeline />

      {/* 5. BOTTOM FIXED ACTION DOCK (56px + Safe Area Bottom) */}
      <MobileBottomBar
        activeDrawer={activeDrawer}
        isAiSheetOpen={isAiSheetOpen}
        onSelectDrawer={handleSelectDrawer}
        onOpenAiCopilot={handleOpenAiCopilot}
        hasSelection={selection.length > 0}
        onDeselect={() => select([])}
        onSplit={handleSplit}
        onDelete={handleDeleteSelected}
        onDuplicate={handleDuplicateSelected}
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
