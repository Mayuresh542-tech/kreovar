"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Play,
  Pause,
  Film,
  Smartphone,
  Monitor,
  Square as SquareIcon,
  Sparkles,
  Upload,
  ZoomIn,
} from "lucide-react";
import { loadEditorStudioFonts } from "@/app/lib/editor/editorCaptionStudio";
import { loadCaptionFonts } from "@/app/lib/captions/typography";
import { playbackTime } from "@/app/lib/editor/playbackClock";
import { Compositor, VisualBounds } from "@/app/lib/editor/compositor";
import {
  clamp,
  dimensions,
  projectDuration,
  Ratio,
} from "@/app/lib/editor/model";
import { usePlayback, useProject } from "@/app/lib/editor/store";
import { useEditor } from "../workspace/EditorContext";

interface MobileCanvasStageProps {
  quality: number;
  onChangeQuality: (quality: number) => void;
  onOpenImport?: () => void;
  onOpenAiCopilot?: () => void;
}

const MOBILE_RATIOS: Ratio[] = ["9:16", "16:9", "1:1"];

export default function MobileCanvasStage({
  quality,
  onChangeQuality,
  onOpenImport,
  onOpenAiCopilot,
}: MobileCanvasStageProps) {
  const { store, playback, repository, selection, select, run, notify } = useEditor();
  const project = useProject(store);
  const { playing } = usePlayback(playback);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const outlineRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Compositor | null>(null);
  const boundsRef = useRef<VisualBounds[]>([]);
  const selectedClipIdRef = useRef<string | undefined>(undefined);

  const [buffering, setBuffering] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [tapFeedback, setTapFeedback] = useState<"play" | "pause" | null>(null);

  // Touch gesture refs
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef<number>(1);
  const lastTapTimeRef = useRef<number>(0);
  const panStartRef = useRef<{ x: number; y: number; origX: number; origY: number } | null>(null);
  const touchMovedRef = useRef(false);

  const aspectRatio = project.settings.aspectRatio;
  const fps = project.settings.fps;
  const [aspectW, aspectH] = dimensions[aspectRatio];
  const duration = projectDuration(project);

  useEffect(() => {
    selectedClipIdRef.current = selection[0];
  }, [selection]);

  // Dynamically load studio and caption fonts
  useEffect(() => {
    void loadEditorStudioFonts(project).catch(() => {});
    for (const layer of [
      ...Object.values(project.textLayers),
      ...Object.values(project.captions),
    ]) {
      void loadCaptionFonts(
        `"${layer.style.font}"`,
        layer.style.weight,
        layer.style.size,
        layer.style.fontAccent,
        layer.text
      ).catch(() => {});
    }
  }, [project.textLayers, project.captions]);

  // Compositor render & playback sync loop
  useEffect(() => {
    const compositor = new Compositor(repository, (error) => notify(error.message));
    engineRef.current = compositor;

    let request = 0;
    let last = performance.now();
    let waiting = false;
    let lastRender = 0;
    let lastProject: typeof project | undefined;
    let lastTime = -1;
    let lastSize = "";
    let cachedDurationProject: typeof project | undefined;
    let cachedDuration = 0;
    let lastOutlineCss = "";
    let lastOutlineVisible = false;

    const loop = (now: number) => {
      const state = playback.getSnapshot();
      const curProject = store.getSnapshot();
      if (curProject !== cachedDurationProject) {
        cachedDurationProject = curProject;
        cachedDuration = projectDuration(curProject);
      }
      const curDuration = cachedDuration;
      const delta = Math.max(0, (now - last) / 1000);
      last = now;

      try {
        let next = playbackTime(state.time, state.playing, waiting, delta, curDuration);

        // Auto-loop on mobile preview for seamless short-form review
        if (state.playing && curDuration > 0 && next >= curDuration) {
          next = 0;
          playback.set(0, true);
        }

        const displayTime = curDuration
          ? Math.min(next, Math.max(0, curDuration - 1 / curProject.settings.fps))
          : 0;
        const wasWaiting = waiting;
        const ready = compositor.sync(curProject, displayTime, state.playing);

        if (waiting !== !ready) {
          waiting = !ready;
          setBuffering(waiting);
        }

        const cvs = canvasRef.current;
        if (
          ready &&
          cvs &&
          (curProject !== lastProject ||
            `${cvs.width}:${cvs.height}` !== lastSize ||
            wasWaiting !== waiting ||
            (!state.playing && displayTime !== lastTime) ||
            (state.playing && now - lastRender >= 1000 / curProject.settings.fps))
        ) {
          if (!lastSize) cvs.getContext("2d", { alpha: false });
          boundsRef.current = compositor.render(cvs, curProject, displayTime);
          lastProject = curProject;
          lastTime = displayTime;
          lastRender = now;
          lastSize = `${cvs.width}:${cvs.height}`;
        }

        const selectedId = selectedClipIdRef.current;
        const box = selectedId ? boundsRef.current.find((b) => b.id === selectedId) : undefined;
        const element = outlineRef.current;
        if (element && cvs) {
          const visible = !!box;
          if (visible !== lastOutlineVisible) {
            element.style.display = visible ? "block" : "none";
            lastOutlineVisible = visible;
          }
          if (box) {
            const [w, h] = dimensions[curProject.settings.aspectRatio];
            const cssKey = `${(box.x / w) * 100}|${(box.y / h) * 100}|${(box.width / w) * 100}|${(box.height / h) * 100}|${box.rotation}`;
            if (cssKey !== lastOutlineCss) {
              lastOutlineCss = cssKey;
              element.style.left = `${(box.x / w) * 100}%`;
              element.style.top = `${(box.y / h) * 100}%`;
              element.style.width = `${(box.width / w) * 100}%`;
              element.style.height = `${(box.height / h) * 100}%`;
              element.style.transform = `translate(-50%,-50%) rotate(${box.rotation}deg)`;
            }
          }
        }

        if (state.playing && ready) {
          playback.set(next, true);
        } else if (!ready) {
          compositor.pause();
        }
      } catch (error) {
        playback.set(state.time, false);
        notify(error instanceof Error ? error.message : "Preview playback failed.");
      }

      request = requestAnimationFrame(loop);
    };

    request = requestAnimationFrame(loop);

    const onVisibilityChange = () => {
      if (document.hidden) {
        playback.set(playback.getSnapshot().time, false);
        compositor.pause();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Also listen for global play toggle events from MobileEditorLayout playback bar
    const onTogglePlayEvent = () => {
      const state = playback.getSnapshot();
      if (state.playing) {
        playback.set(state.time, false);
      } else {
        void engineRef.current
          ?.activateAudio()
          .then(() => playback.set(state.time >= projectDuration(store.getSnapshot()) ? 0 : state.time, true))
          .catch((e) => notify(e instanceof Error ? e.message : "Audio unavailable."));
      }
    };
    window.addEventListener("veelox:toggle-play", onTogglePlayEvent);

    return () => {
      cancelAnimationFrame(request);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("veelox:toggle-play", onTogglePlayEvent);
      compositor.dispose();
      engineRef.current = null;
    };
  }, [store, playback, repository, notify]);

  // Dynamic fit sizing inside flex-1 viewport without clipping
  useEffect(() => {
    const stage = stageRef.current;
    const frame = frameRef.current;
    if (!stage || !frame) return;

    function fit() {
      if (!stage || !frame) return;
      const padX = 16;
      const padY = 12;
      const availW = Math.max(10, stage.clientWidth - padX);
      const availH = Math.max(10, stage.clientHeight - padY);
      const ratio = aspectW / aspectH;
      const width = Math.min(availW, availH * ratio);
      frame.style.width = `${Math.round(width)}px`;
      frame.style.height = `${Math.round(width / ratio)}px`;
    }

    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    fit();
    return () => observer.disconnect();
  }, [aspectRatio, aspectW, aspectH]);

  const togglePlayWithFeedback = useCallback(async () => {
    const state = playback.getSnapshot();
    if (state.playing) {
      playback.set(state.time, false);
      setTapFeedback("pause");
    } else {
      try {
        await engineRef.current?.activateAudio();
        playback.set(state.time >= duration ? 0 : state.time, true);
        setTapFeedback("play");
      } catch (e) {
        notify(e instanceof Error ? e.message : "Audio playback unavailable.");
      }
    }
    setTimeout(() => setTapFeedback(null), 500);
  }, [playback, duration, notify]);

  // Touch handlers for pinch-to-zoom, pan, and double-tap play/pause
  const getDistance = (t1: React.Touch, t2: React.Touch) =>
    Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchMovedRef.current = false;
    if (e.touches.length === 2) {
      pinchStartDistRef.current = getDistance(e.touches[0], e.touches[1]);
      pinchStartScaleRef.current = previewScale;
      panStartRef.current = null;
    } else if (e.touches.length === 1 && previewScale > 1.02) {
      panStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        origX: panOffset.x,
        origY: panOffset.y,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDistRef.current) {
      touchMovedRef.current = true;
      const dist = getDistance(e.touches[0], e.touches[1]);
      const nextScale = clamp(
        pinchStartScaleRef.current * (dist / pinchStartDistRef.current),
        0.65,
        2.5
      );
      setPreviewScale(nextScale);
      if (nextScale <= 1.02) setPanOffset({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && panStartRef.current) {
      const dx = e.touches[0].clientX - panStartRef.current.x;
      const dy = e.touches[0].clientY - panStartRef.current.y;
      if (Math.hypot(dx, dy) > 4) {
        touchMovedRef.current = true;
        setPanOffset({
          x: clamp(panStartRef.current.origX + dx, -140, 140),
          y: clamp(panStartRef.current.origY + dy, -180, 180),
        });
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      pinchStartDistRef.current = null;
    }
    if (e.touches.length === 0) {
      panStartRef.current = null;
      if (!touchMovedRef.current && e.changedTouches.length === 1) {
        const now = Date.now();
        if (now - lastTapTimeRef.current < 300) {
          lastTapTimeRef.current = 0;
          if (duration > 0) {
            void togglePlayWithFeedback();
            navigator.vibrate?.(8);
          }
        } else {
          lastTapTimeRef.current = now;
        }
      }
    }
  };

  // Mouse double-click fallback for Chrome DevTools / desktop testing
  const handleDoubleClick = () => {
    if (duration > 0) {
      void togglePlayWithFeedback();
    }
  };

  const cycleAspectRatio = () => {
    const idx = MOBILE_RATIOS.indexOf(aspectRatio);
    const next = MOBILE_RATIOS[(idx + 1) % MOBILE_RATIOS.length];
    navigator.vibrate?.(8);
    run((p) => ({
      ...p,
      settings: { ...p.settings, aspectRatio: next },
    }));
  };

  const cycleQuality = () => {
    const qualities = [540, 720, 1080];
    const next = qualities[(qualities.indexOf(quality) + 1) % qualities.length];
    navigator.vibrate?.(8);
    onChangeQuality(next);
  };

  const renderHeight = quality;
  const renderWidth = Math.round((quality * aspectW) / aspectH);
  const hasClips = Object.keys(project.clips).length > 0;

  return (
    <section
      ref={stageRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
      className="vx-stage flex-1 min-h-0 w-full bg-[#EDF1F6] relative flex items-center justify-center p-2 overflow-hidden touch-none overscroll-none select-none"
      aria-label="Mobile Video Preview Canvas"
    >
      {/* Top-Left Floating Aspect Ratio Pill */}
      <button
        type="button"
        onClick={cycleAspectRatio}
        aria-label={`Aspect ratio ${aspectRatio}, tap to switch`}
        className="absolute top-2.5 left-3 z-20 min-h-[34px] px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-md border border-slate-200 text-[11px] font-semibold text-blue-700 flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform"
      >
        {aspectRatio === "9:16" ? (
          <Smartphone size={12} className="text-blue-600" />
        ) : aspectRatio === "1:1" ? (
          <SquareIcon size={12} className="text-blue-600" />
        ) : (
          <Monitor size={12} className="text-blue-600" />
        )}
        <span className="font-mono">{aspectRatio}</span>
      </button>

      {/* Top-Right Floating Resolution & FPS Chip */}
      <button
        type="button"
        onClick={cycleQuality}
        aria-label={`Preview quality ${quality}p at ${fps} FPS, tap to change`}
        className="absolute top-2.5 right-3 z-20 min-h-[34px] px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-md border border-slate-200 text-[10px] font-mono text-slate-700 flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${buffering ? "bg-amber-500 animate-ping" : "bg-emerald-500"}`} />
        <span>{buffering ? "Buffering…" : `${quality}p · ${fps}fps`}</span>
      </button>

      {/* Zoom Reset Badge when pinched */}
      {Math.abs(previewScale - 1) > 0.04 && (
        <button
          type="button"
          onClick={() => {
            setPreviewScale(1);
            setPanOffset({ x: 0, y: 0 });
          }}
          className="absolute bottom-2.5 left-3 z-20 px-2.5 py-1 rounded-full bg-blue-600 text-white text-[10px] font-mono flex items-center gap-1 shadow-sm"
        >
          <ZoomIn size={11} />
          <span>{Math.round(previewScale * 100)}% · Reset</span>
        </button>
      )}

      {/* Center-locked Player Container */}
      <div
        ref={frameRef}
        className="relative bg-black rounded-lg overflow-hidden border border-slate-200 shadow-[0_8px_24px_rgba(15,23,42,0.16)] will-change-transform transition-transform duration-75"
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${previewScale})`,
        }}
      >
        <canvas
          ref={canvasRef}
          width={renderWidth}
          height={renderHeight}
          onClick={(e) => {
            // Single tap selects hit visual layer if present
            const rect = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * aspectW;
            const y = ((e.clientY - rect.top) / rect.height) * aspectH;
            const hit = [...boundsRef.current].reverse().find((b) => {
              const rad = (-b.rotation * Math.PI) / 180;
              const dx = x - b.x;
              const dy = y - b.y;
              return (
                Math.abs(dx * Math.cos(rad) - dy * Math.sin(rad)) < b.width / 2 &&
                Math.abs(dx * Math.sin(rad) + dy * Math.cos(rad)) < b.height / 2
              );
            });
            if (hit) select([hit.id]);
          }}
          className="w-full h-full object-contain"
          aria-label="Mobile Video Preview Canvas"
        />

        {/* Selected Clip Outline */}
        <div
          ref={outlineRef}
          style={{ display: "none" }}
          className="absolute border-2 border-blue-600 pointer-events-none z-20 rounded-sm"
        />

        {/* Double-tap Play/Pause Visual Ripple */}
        {tapFeedback && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <div className="w-14 h-14 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white animate-ping-once">
              {tapFeedback === "play" ? <Play size={24} className="ml-0.5" /> : <Pause size={24} />}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!hasClips && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-slate-950/75 z-10 gap-3">
            <Film size={28} className="text-slate-400" />
            <div>
              <p className="text-xs font-semibold text-white">Start Your Edit</p>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Import a clip or let AI Copilot edit for you
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
              {onOpenImport && (
                <button
                  type="button"
                  onClick={onOpenImport}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 text-xs font-medium flex items-center gap-1.5"
                >
                  <Upload size={13} />
                  <span>Add Media</span>
                </button>
              )}
              {onOpenAiCopilot && (
                <button
                  type="button"
                  onClick={onOpenAiCopilot}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md"
                >
                  <Sparkles size={13} />
                  <span>AI Copilot</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
