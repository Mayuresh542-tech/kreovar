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
  Shield,
  ArrowUp,
  ArrowDown,
  AlignCenter,
} from "lucide-react";
import { loadEditorStudioFonts, applyStudioStyle } from "@/app/lib/editor/editorCaptionStudio";
import { loadCaptionFonts } from "@/app/lib/captions/typography";
import { playbackTime } from "@/app/lib/editor/playbackClock";
import { Compositor, VisualBounds } from "@/app/lib/editor/compositor";
import {
  clamp,
  dimensions,
  projectDuration,
  Ratio,
} from "@/app/lib/editor/model";
import { changeClipProperty, reframeProject } from "@/app/lib/editor/operations";
import { usePlayback, useProject } from "@/app/lib/editor/store";
import { useEditor } from "../workspace/EditorContext";

interface MobileCanvasStageProps {
  quality: number;
  onChangeQuality: (quality: number) => void;
  onOpenImport?: () => void;
  onOpenAiCopilot?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

const MOBILE_RATIOS: Ratio[] = ["9:16", "16:9", "1:1"];

export default function MobileCanvasStage({
  quality,
  onChangeQuality,
  onOpenImport,
  onOpenAiCopilot,
  isFullscreen = false,
  onToggleFullscreen,
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
  const [showSafeZones, setShowSafeZones] = useState(true);
  const [showReframeMenu, setShowReframeMenu] = useState(false);

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
          if (curDuration <= 0) {
            playback.set(0, false);
            compositor.pause();
          } else {
            playback.set(next, true);
          }
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
      const curDur = projectDuration(store.getSnapshot());
      if (curDur <= 0) return;
      if (state.playing) {
        playback.set(state.time, false);
      } else {
        void engineRef.current
          ?.activateAudio()
          .then(() => playback.set(state.time >= curDur ? 0 : state.time, true))
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

  const selectedClip = selection[0] ? project.clips[selection[0]] : undefined;
  const isVisualSelected =
    selectedClip &&
    project.tracks[selectedClip.trackId] &&
    project.tracks[selectedClip.trackId].kind !== "audio";
  const isCaptionSelected =
    selectedClip &&
    (selectedClip.contentId && !!project.captions[selectedClip.contentId]);

  const alignSelectedClip = useCallback(
    (position: "top" | "center" | "bottom" | "centerX") => {
      const selectedId = selection[0];
      if (!selectedId) return;
      navigator.vibrate?.(8);
      run((p) => {
        const clip = p.clips[selectedId];
        if (!clip) return p;

        if (clip.contentId && p.captions[clip.contentId]) {
          const cap = p.captions[clip.contentId];
          const curStyle = cap.studioStyle;
          const pos = position === "top" ? "top" : position === "bottom" ? "bottom" : "center";
          const yPercent = position === "top" ? 16 : position === "bottom" ? 76 : 48;
          if (curStyle) {
            return applyStudioStyle(p, [clip.id], {
              ...curStyle,
              position: pos,
              positionYPercent: yPercent,
              studio: {
                ...curStyle.studio,
                positionXPercent:
                  position === "centerX" ? 50 : curStyle.studio?.positionXPercent ?? 50,
              },
            });
          }
          const nextY = position === "top" ? -0.32 : position === "bottom" ? 0.26 : 0;
          return changeClipProperty(p, clip.id, {
            transform: {
              ...clip.transform,
              x: position === "centerX" ? 0 : clip.transform.x,
              y: position === "centerX" ? clip.transform.y : nextY,
            },
          });
        }

        const nextY = position === "top" ? -0.32 : position === "bottom" ? 0.26 : 0;
        return changeClipProperty(p, clip.id, {
          transform: {
            ...clip.transform,
            x: position === "centerX" ? 0 : clip.transform.x,
            y: position === "centerX" ? clip.transform.y : nextY,
          },
        });
      });
      notify(`Aligned to ${position === "centerX" ? "center X" : position}.`);
    },
    [selection, run, notify]
  );

  return (
    <section
      ref={stageRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
      className={`vx-stage min-h-0 w-full bg-[#000000] relative flex items-center justify-center p-2 overflow-hidden touch-none overscroll-none select-none transition-all duration-200 ${
        isFullscreen ? "fixed inset-0 z-50 p-0" : "flex-1"
      }`}
      aria-label="CapCut Mobile Video Preview Canvas"
    >
      {/* Top-Left Floating Aspect Ratio Pill + Safe Zone Guide Toggle */}
      <div className="absolute top-2.5 left-3 z-20 flex items-center gap-1.5">
        <button
          type="button"
          onClick={cycleAspectRatio}
          aria-label={`Aspect ratio ${aspectRatio}, tap to switch`}
          className="min-h-[34px] px-2.5 py-1 rounded-full bg-[#16161C]/85 backdrop-blur-md border border-[#2E2E38] text-[11px] font-semibold text-white/90 hover:text-[#00E5FF] flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
        >
          {aspectRatio === "9:16" ? (
            <Smartphone size={12} className="text-[#00E5FF]" />
          ) : aspectRatio === "1:1" ? (
            <SquareIcon size={12} className="text-[#00E5FF]" />
          ) : (
            <Monitor size={12} className="text-[#00E5FF]" />
          )}
          <span className="font-mono">{aspectRatio}</span>
        </button>

        {aspectRatio === "9:16" && (
          <button
            type="button"
            onClick={() => {
              setShowSafeZones((prev) => !prev);
              navigator.vibrate?.(6);
            }}
            aria-label="Toggle 9:16 Social Safe Zone guidelines"
            aria-pressed={showSafeZones}
            className={`min-h-[34px] px-2.5 py-1 rounded-full border text-[10px] font-semibold flex items-center gap-1 shadow-md active:scale-95 transition-all ${
              showSafeZones
                ? "bg-[#00E5FF]/20 text-[#00E5FF] border-[#00E5FF]/50 shadow-[0_0_8px_rgba(0,229,255,0.25)]"
                : "bg-[#16161C]/85 backdrop-blur-md border-[#2E2E38] text-white/70 hover:text-white"
            }`}
          >
            <Shield size={11} className={showSafeZones ? "text-white" : "text-blue-600"} />
            <span>Safe Zone</span>
          </button>
        )}

        {/* 1-Click Smart Reframe Pill */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowReframeMenu((prev) => !prev);
              navigator.vibrate?.(6);
            }}
            aria-label="1-Click 9:16 Smart Reframing"
            className="min-h-[34px] px-2.5 py-1 rounded-full bg-[#1E1E26] hover:bg-[#252532] border border-[#2E2E38] text-white text-[10px] font-semibold flex items-center gap-1 shadow-md active:scale-95 transition-all"
          >
            <Sparkles size={11} className="text-[#00E5FF]" />
            <span>Reframe</span>
          </button>

          {showReframeMenu && (
            <div className="absolute top-full left-0 mt-2 w-56 bg-[#16161C]/95 backdrop-blur-md border border-[#26262E] rounded-xl shadow-2xl z-50 p-1.5 text-xs space-y-1">
              <div className="px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#A0A0A8]">
                1-Click 9:16 Reframe
              </div>
              <button
                type="button"
                onClick={() => {
                  run((p) => reframeProject(p, "fit-with-blur"));
                  notify("Applied 1-Click Fit with Blur (9:16)");
                  setShowReframeMenu(false);
                }}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 flex flex-col text-white transition-colors"
              >
                <span className="font-semibold text-xs flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00E5FF]" /> Fit with Blur
                </span>
                <span className="text-[10px] text-[#A0A0A8]">Blurred wings top & bottom</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  run((p) => reframeProject(p, "center-crop"));
                  notify("Applied 1-Click Center Crop (1.77x Eye-Line)");
                  setShowReframeMenu(false);
                }}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 flex flex-col text-white transition-colors"
              >
                <span className="font-semibold text-xs flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Center Crop
                </span>
                <span className="text-[10px] text-[#A0A0A8]">1.77x punch-in eye-line (-0.14)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  run((p) => reframeProject(p, "split-screen"));
                  notify("Applied 1-Click Split Screen (A-Roll + B-Roll)");
                  setShowReframeMenu(false);
                }}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 flex flex-col text-white transition-colors"
              >
                <span className="font-semibold text-xs flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Split Screen
                </span>
                <span className="text-[10px] text-[#A0A0A8]">A-roll top + B-roll bottom</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Floating Exit Fullscreen Button when isFullscreen is active */}
      {isFullscreen && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label="Exit Fullscreen Preview"
          className="absolute top-3 right-3 z-30 px-3 py-1.5 rounded-full bg-[#16161C]/90 backdrop-blur-md border border-[#2E2E38] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xl active:scale-95"
        >
          <span>Exit Fullscreen</span>
        </button>
      )}

      {/* Top-Right Floating Resolution & FPS Chip */}
      <button
        type="button"
        onClick={cycleQuality}
        aria-label={`Preview quality ${quality}p at ${fps} FPS, tap to change`}
        className="absolute top-2.5 right-3 z-20 min-h-[34px] px-2.5 py-1 rounded-full bg-[#16161C]/85 backdrop-blur-md border border-[#2E2E38] text-[10px] font-mono text-white/90 flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${buffering ? "bg-amber-400 animate-ping" : "bg-[#00E5FF]"}`} />
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
          className="absolute bottom-2.5 left-3 z-20 px-2.5 py-1 rounded-full bg-[#00E5FF] text-black text-[10px] font-mono font-bold flex items-center gap-1 shadow-md active:scale-95"
        >
          <ZoomIn size={11} />
          <span>{Math.round(previewScale * 100)}% · Reset</span>
        </button>
      )}

      {/* Center-locked Player Container */}
      <div
        ref={frameRef}
        className="relative bg-black rounded-lg overflow-hidden border border-[#26262E] shadow-[0_12px_40px_rgba(0,0,0,0.85)] will-change-transform transition-transform duration-75"
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

        {/* Selected Clip Outline (CapCut Cyan) */}
        <div
          ref={outlineRef}
          style={{ display: "none" }}
          className="absolute border-2 border-[#00E5FF] shadow-[0_0_12px_rgba(0,229,255,0.45)] pointer-events-none z-20 rounded-sm"
        />

        {/* 9:16 Social Media Safe Zone Overlay (TikTok / Reels / Shorts Margins) */}
        {showSafeZones && aspectRatio === "9:16" && (
          <div className="absolute inset-0 pointer-events-none z-15 overflow-hidden flex flex-col justify-between">
            {/* Top Safe Area Boundary (avoids notch, search, following/for you tabs) */}
            <div className="relative w-full h-[14%] border-b border-dashed border-[#00E5FF]/70 bg-[#00E5FF]/5 flex items-end px-2 pb-1">
              <span className="text-[9px] font-mono font-medium text-[#00E5FF] drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                Top Safe Margin (14%)
              </span>
            </div>

            {/* Center Eye-Level & Crosshair (Golden Ratio Focus Area for Viral Captions & B-Rolls) */}
            <div className="absolute top-[48%] left-0 right-0 -translate-y-1/2 border-t border-dashed border-amber-400/50 flex items-center justify-between px-2">
              <span className="text-[8px] font-mono font-bold text-amber-300/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                Viral Eye-Level (48%)
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70" />
            </div>

            {/* Right Action Icons Margin Overlay (Like, Comment, Bookmark, Share icons zone) */}
            <div className="absolute right-0 top-[26%] bottom-[24%] w-[16%] border-l border-dashed border-rose-400/50 bg-rose-500/5 flex flex-col justify-center items-center gap-2 pr-0.5">
              <span className="text-[7px] font-mono text-rose-300/80 -rotate-90 whitespace-nowrap drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                TikTok Icons (16%)
              </span>
            </div>

            {/* Bottom Safe Area Boundary (avoids username, caption text, sound marquee, bottom nav) */}
            <div className="relative w-full h-[22%] border-t border-dashed border-[#00E5FF]/70 bg-[#00E5FF]/5 flex items-start px-2 pt-1">
              <span className="text-[9px] font-mono font-medium text-[#00E5FF] drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                Safe Lower Third (22% Bottom Margin)
              </span>
            </div>
          </div>
        )}

        {/* Quick Accurate Alignment Pills when a visual layer is selected */}
        {isVisualSelected && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-25 flex items-center gap-1 bg-[#16161C]/90 backdrop-blur-md px-2 py-1 rounded-full border border-[#2E2E38] shadow-xl text-[10px] text-white">
            <span className="font-semibold text-[#A0A0A8] mr-0.5 text-[9px] uppercase tracking-wide">
              {isCaptionSelected ? "Caption" : "B-Roll"}:
            </span>
            <button
              type="button"
              onClick={() => alignSelectedClip("top")}
              className="px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 active:bg-[#00E5FF] active:text-black transition-colors flex items-center gap-0.5"
            >
              <ArrowUp size={10} />
              <span>Top</span>
            </button>
            <button
              type="button"
              onClick={() => alignSelectedClip("center")}
              className="px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 active:bg-[#00E5FF] active:text-black transition-colors flex items-center gap-0.5 font-semibold text-amber-300"
            >
              <span>Center</span>
            </button>
            <button
              type="button"
              onClick={() => alignSelectedClip("bottom")}
              className="px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 active:bg-[#00E5FF] active:text-black transition-colors flex items-center gap-0.5"
            >
              <ArrowDown size={10} />
              <span>Safe Bot</span>
            </button>
            <button
              type="button"
              onClick={() => alignSelectedClip("centerX")}
              className="px-1.5 py-0.5 rounded-full bg-white/10 hover:bg-white/20 active:bg-[#00E5FF] active:text-black transition-colors"
              title="Align Center Horizontally"
            >
              <AlignCenter size={11} />
            </button>
          </div>
        )}

        {/* Double-tap Play/Pause Visual Ripple */}
        {tapFeedback && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <div className="w-14 h-14 rounded-full bg-black/75 backdrop-blur-md border border-white/20 flex items-center justify-center text-white animate-ping-once">
              {tapFeedback === "play" ? <Play size={24} className="ml-0.5 text-[#00E5FF]" /> : <Pause size={24} className="text-white" />}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!hasClips && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-[#0E0E12]/90 z-10 gap-3 border border-[#26262E]">
            <Film size={28} className="text-[#A0A0A8]" />
            <div>
              <p className="text-xs font-semibold text-white">Start Your CapCut Edit</p>
              <p className="text-[11px] text-[#A0A0A8] mt-0.5">
                Import media clips or let AI Copilot edit for you
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
              {onOpenImport && (
                <button
                  type="button"
                  onClick={onOpenImport}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#22222A] hover:bg-[#2C2C36] border border-[#2E2E38] text-white text-xs font-medium flex items-center gap-1.5 active:scale-95 transition-all"
                >
                  <Upload size={13} className="text-[#00E5FF]" />
                  <span>Add Media</span>
                </button>
              )}
              {onOpenAiCopilot && (
                <button
                  type="button"
                  onClick={onOpenAiCopilot}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#00E5FF] hover:bg-[#33EAFF] text-black text-xs font-bold flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,229,255,0.35)] active:scale-95 transition-all"
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
