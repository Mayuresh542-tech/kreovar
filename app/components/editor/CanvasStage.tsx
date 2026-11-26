"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Maximize,
  Minimize,
  Film,
  Sparkles,
  Smartphone,
  Monitor,
  Crosshair,
  Shield,
  Layers,
  Repeat,
} from "lucide-react";
import { loadEditorStudioFonts } from "@/app/lib/editor/editorCaptionStudio";
import { loadCaptionFonts } from "@/app/lib/captions/typography";
import { playbackTime } from "@/app/lib/editor/playbackClock";
import { Compositor, VisualBounds } from "@/app/lib/editor/compositor";
import {
  clamp,
  dimensions,
  formatTime,
  projectDuration,
  Ratio,
} from "@/app/lib/editor/model";
import { PlaybackStore, usePlayback, useProject } from "@/app/lib/editor/store";
import { changeClipProperty } from "@/app/lib/editor/operations";
import { pointerEdit } from "@/app/lib/editor/interaction";
import { useEditor } from "./workspace/EditorContext";

interface CanvasStageProps {
  quality?: number;
  readOnly?: boolean;
}

/**
 * Dynamic CSS cursor orientation based on handle base angle and clip rotation angle
 * Specified in docs/CAPCUT_EDITOR_SPECIFICATION.md Section 5.6
 */
export function getRotatedCursor(baseAngleDeg: number, clipRotationDeg: number): string {
  const totalAngle = (baseAngleDeg + clipRotationDeg) % 180;
  const normalized = totalAngle < 0 ? totalAngle + 180 : totalAngle;

  if (normalized >= 22.5 && normalized < 67.5) return "nesw-resize";
  if (normalized >= 67.5 && normalized < 112.5) return "ns-resize";
  if (normalized >= 112.5 && normalized < 157.5) return "nwse-resize";
  return "ew-resize";
}

const StageExpandedSeekBar = React.memo(function StageExpandedSeekBar({
  playback,
  duration,
  fps,
}: {
  playback: PlaybackStore;
  duration: number;
  fps: number;
}) {
  const { time } = usePlayback(playback);
  return (
    <input
      type="range"
      min={0}
      max={Math.max(duration, 0.1)}
      step={1 / Math.max(fps, 1)}
      value={Math.min(time, Math.max(duration, 0.1))}
      disabled={!duration}
      onChange={(e) => playback.set(Number(e.target.value), false)}
      aria-label="Seek maximized preview"
      className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500 disabled:opacity-40"
    />
  );
});

const StagePlayPauseButton = React.memo(function StagePlayPauseButton({
  playback,
  duration,
  isExpanded,
  onTogglePlay,
}: {
  playback: PlaybackStore;
  duration: number;
  isExpanded: boolean;
  onTogglePlay: () => Promise<void> | void;
}) {
  const { playing } = usePlayback(playback);
  return (
    <button
      type="button"
      onClick={() => void onTogglePlay()}
      disabled={!duration}
      title="Play / Pause (Space)"
      aria-label={playing ? "Pause" : "Play"}
      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-105 disabled:opacity-40 cursor-pointer shadow-xs ${
        isExpanded
          ? "bg-sky-500 hover:bg-sky-400 text-white"
          : "bg-slate-900 hover:bg-slate-800 text-white"
      }`}
    >
      {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
    </button>
  );
});

const StageTimecode = React.memo(function StageTimecode({
  playback,
  duration,
  fps,
  isExpanded,
}: {
  playback: PlaybackStore;
  duration: number;
  fps: number;
  isExpanded: boolean;
}) {
  const { time } = usePlayback(playback);
  return (
    <div
      className={`flex items-center font-mono text-xs border px-2 py-1 rounded-md ${
        isExpanded
          ? "bg-slate-800 border-slate-700 text-slate-100"
          : "bg-slate-50 border-slate-200 text-slate-800"
      }`}
    >
      <span className={isExpanded ? "text-white font-semibold" : "text-slate-900 font-semibold"}>
        {formatTime(time, fps)}
      </span>
      <span className="text-slate-400 mx-1">/</span>
      <span className={isExpanded ? "text-slate-400" : "text-slate-500"}>
        {formatTime(duration, fps)}
      </span>
    </div>
  );
});

export default function CanvasStage({
  quality = 720,
  readOnly = false,
}: CanvasStageProps) {
  const { store, playback, repository, selection, select, run, notify } = useEditor();
  const project = useProject(store);

  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const outlineRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Compositor | null>(null);
  const boundsRef = useRef<VisualBounds[]>([]);
  const selectedClipIdRef = useRef<string | undefined>(undefined);

  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [buffering, setBuffering] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const isLoopingRef = useRef(isLooping);
  useEffect(() => {
    isLoopingRef.current = isLooping;
  }, [isLooping]);
  const [showSafeAreas, setShowSafeAreas] = useState(false);
  const [showCrosshair, setShowCrosshair] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const isExpanded = isMaximized || isFullscreen;
  const [snapGuides, setSnapGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const snapGuidesRef = useRef({ x: false, y: false });

  const duration = projectDuration(project);
  const fps = project.settings.fps;
  const aspectRatio = project.settings.aspectRatio;
  const [aspectW, aspectH] = dimensions[aspectRatio];

  useEffect(() => {
    selectedClipIdRef.current = selection[0];
  }, [selection]);

  // Load fonts dynamically
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

  // Compositor Loop Synchronization
  useEffect(() => {
    const compositor = new Compositor(repository, (error) => notify(error.message));
    engineRef.current = compositor;

    let request = 0;
    let last = performance.now();
    let waiting = false;
    let waitingStart = 0;
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
        const speed = state.speed ?? 1;
        let next = playbackTime(state.time, state.playing, waiting, delta, curDuration, speed);

        // Loop handling and shuttle bounds
        if (state.playing && isLoopingRef.current && curDuration > 0 && next >= curDuration) {
          next = 0;
          playback.set(0, true, speed);
        } else if (state.playing && speed < 0 && next <= 0) {
          next = 0;
          playback.set(0, false, 1);
        } else if (state.playing && speed > 0 && next >= curDuration && curDuration > 0) {
          playback.set(curDuration, false, 1);
        }

        const displayTime = curDuration
          ? Math.min(next, Math.max(0, curDuration - 1 / curProject.settings.fps))
          : 0;
        const wasWaiting = waiting;
        const ready = compositor.sync(curProject, displayTime, state.playing);

        if (waiting !== !ready) {
          waiting = !ready;
          if (waiting) {
            if (!waitingStart) waitingStart = now;
            if (state.playing && now - waitingStart > 500) setBuffering(true);
          } else {
            waitingStart = 0;
            setBuffering(false);
          }
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

        // Selection overlay tracking
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
          playback.set(next, isLoopingRef.current || next < curDuration);
        } else if (!state.playing) {
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

    return () => {
      cancelAnimationFrame(request);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      compositor.dispose();
      engineRef.current = null;
    };
  }, [store, playback, repository, notify]);

  // Stage Fit and Aspect Ratio Sizing
  useEffect(() => {
    const stage = stageRef.current;
    const frame = frameRef.current;
    if (!stage || !frame) return;

    function resize() {
      if (!stage || !frame) return;
      const paddingX = 32;
      const paddingY = 32;
      const availW = Math.max(10, stage.clientWidth - paddingX);
      const availH = Math.max(10, stage.clientHeight - paddingY);

      const targetRatio = aspectW / aspectH;
      let width = Math.min(availW, availH * targetRatio);

      if (typeof zoom === "number") {
        width = width * zoom;
      }

      frame.style.width = `${Math.round(width)}px`;
      frame.style.height = `${Math.round(width / targetRatio)}px`;
    }

    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();
    return () => observer.disconnect();
  }, [aspectRatio, aspectW, aspectH, zoom, isExpanded]);

  // Fullscreen & Maximize theater listener
  useEffect(() => {
    const handleFsChange = () => {
      const fsActive = !!document.fullscreenElement;
      setIsFullscreen(fsActive);
      if (!fsActive) {
        setIsMaximized(false);
      }
    };
    const handleEscMaximize = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMaximized && !document.fullscreenElement) {
        e.preventDefault();
        e.stopPropagation();
        setIsMaximized(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    window.addEventListener("keydown", handleEscMaximize, true);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      window.removeEventListener("keydown", handleEscMaximize, true);
    };
  }, [isMaximized]);

  const toggleMaximizePreview = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      setIsMaximized(false);
      return;
    }
    setIsMaximized((prev) => !prev);
  };

  const toggleBrowserFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsMaximized(false);
      } else if (sectionRef.current?.requestFullscreen) {
        setIsMaximized(true);
        await sectionRef.current.requestFullscreen();
      } else {
        setIsMaximized((prev) => !prev);
      }
    } catch {
      // Fallback gracefully to in-window theater maximize when browser fullscreen is restricted
      setIsMaximized((prev) => !prev);
    }
  };

  const togglePlay = async () => {
    const state = playback.getSnapshot();
    if (state.playing) {
      playback.set(state.time, false);
      return;
    }
    try {
      await engineRef.current?.activateAudio();
      playback.set(state.time >= duration ? 0 : state.time, true);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Audio playback unavailable.");
    }
  };

  // Step Frame
  const stepFrame = (frames: number) => {
    const cur = playback.getSnapshot().time;
    const next = Math.max(0, Math.min(duration, cur + frames / fps));
    playback.set(next, false);
  };

  // Direct Interactive Canvas Manipulation (Move, Scale, Rotate)
  const handleGesture = (
    event: React.PointerEvent,
    mode: "move" | "scale" | "rotate",
    id: string,
    corner?: "tl" | "tr" | "br" | "bl"
  ) => {
    if (readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    const clip = store.getSnapshot().clips[id];
    if (!clip || store.getSnapshot().tracks[clip.trackId]?.locked) {
      notify("Unlock this track before transforming.");
      return;
    }
    playback.set(playback.getSnapshot().time, false);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const t = clip.transform;
    const [w, h] = dimensions[store.getSnapshot().settings.aspectRatio];
    const box = boundsRef.current.find((b) => b.id === id);
    const centerX = rect.left + (box ? (box.x / w) * rect.width : (0.5 + t.x) * rect.width);
    const centerY = rect.top + (box ? (box.y / h) * rect.height : (0.5 + t.y) * rect.height);
    const startX = event.clientX;
    const startY = event.clientY;
    const startDist = Math.hypot(startX - centerX, startY - centerY);
    const startAngle = Math.atan2(startY - centerY, startX - centerX) * (180 / Math.PI);

    // Box dimensions in screen pixels for corner scaling
    const boxWidth = (box ? box.width / w : t.scale) * rect.width;
    const boxHeight = (box ? box.height / h : (t.scale * h) / w) * rect.height;
    const rotationDeg = box ? box.rotation : t.rotation;
    const rad = (rotationDeg * Math.PI) / 180;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);

    // Anchor point in local unrotated coordinates (opposite corner of dragged corner)
    // tl dragged -> br is anchor (+W/2, +H/2)
    // tr dragged -> bl is anchor (-W/2, +H/2)
    // br dragged -> tl is anchor (-W/2, -H/2)
    // bl dragged -> tr is anchor (+W/2, -H/2)
    let lxAnchor = -boxWidth / 2;
    let lyAnchor = -boxHeight / 2;
    if (corner === "tl") {
      lxAnchor = boxWidth / 2;
      lyAnchor = boxHeight / 2;
    } else if (corner === "tr") {
      lxAnchor = -boxWidth / 2;
      lyAnchor = boxHeight / 2;
    } else if (corner === "bl") {
      lxAnchor = boxWidth / 2;
      lyAnchor = -boxHeight / 2;
    } else {
      lxAnchor = -boxWidth / 2;
      lyAnchor = -boxHeight / 2;
    }

    // Anchor point in screen coordinates
    const anchorOffsetX = lxAnchor * cosR - lyAnchor * sinR;
    const anchorOffsetY = lxAnchor * sinR + lyAnchor * cosR;
    const anchorScreenX = centerX + anchorOffsetX;
    const anchorScreenY = centerY + anchorOffsetY;

    // Diagonal vector d0 from anchor to initial dragged corner (dragStart = center - anchorOffset)
    const d0x = -2 * anchorOffsetX;
    const d0y = -2 * anchorOffsetY;
    const d0LenSq = d0x * d0x + d0y * d0y;

    if (mode === "move") {
      const clearGuides = () => {
        if (snapGuidesRef.current.x || snapGuidesRef.current.y) {
          snapGuidesRef.current = { x: false, y: false };
          setSnapGuides({ x: false, y: false });
        }
        window.removeEventListener("pointerup", clearGuides);
        window.removeEventListener("pointercancel", clearGuides);
        window.removeEventListener("keydown", clearGuides);
        window.removeEventListener("blur", clearGuides);
      };
      window.addEventListener("pointerup", clearGuides, { once: true });
      window.addEventListener("pointercancel", clearGuides, { once: true });
      window.addEventListener("keydown", clearGuides, { once: true });
      window.addEventListener("blur", clearGuides, { once: true });
    }

    pointerEdit(
      store,
      (e) => (p) => {
        const curDist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
        const curAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);

        if (mode === "move") {
          const rawX = t.x + (e.clientX - startX) / rect.width;
          const rawY = t.y + (e.clientY - startY) / rect.height;

          // Smart center alignment snapping (threshold: 6px in screen pixels) to canvas center (x: 0, y: 0)
          const snapThresholdX = 6 / rect.width;
          const snapThresholdY = 6 / rect.height;
          const snappedX = Math.abs(rawX) <= snapThresholdX;
          const snappedY = Math.abs(rawY) <= snapThresholdY;
          const finalX = snappedX ? 0 : rawX;
          const finalY = snappedY ? 0 : rawY;

          if (snappedX !== snapGuidesRef.current.x || snappedY !== snapGuidesRef.current.y) {
            snapGuidesRef.current = { x: snappedX, y: snappedY };
            setSnapGuides({ x: snappedX, y: snappedY });
          }

          return changeClipProperty(p, id, {
            transform: {
              ...t,
              x: finalX,
              y: finalY,
            },
          });
        }

        if (mode === "scale") {
          // Alt/Option drag: Center-uniform scale
          if (e.altKey) {
            return changeClipProperty(p, id, {
              transform: {
                ...t,
                scale: clamp(
                  t.scale * (startDist > 2 ? curDist / startDist : 1),
                  0.05,
                  10
                ),
              },
            });
          }

          // Uniform corner scaling around stationary anchor point
          const vx = e.clientX - anchorScreenX;
          const vy = e.clientY - anchorScreenY;
          const sRatio = d0LenSq > 1 ? (vx * d0x + vy * d0y) / d0LenSq : 1;
          const clampedScale = clamp(t.scale * sRatio, 0.05, 10);
          const effectiveMultiplier = clampedScale / t.scale;

          const deltaCenterX = (effectiveMultiplier - 1) * (centerX - anchorScreenX);
          const deltaCenterY = (effectiveMultiplier - 1) * (centerY - anchorScreenY);

          return changeClipProperty(p, id, {
            transform: {
              ...t,
              x: t.x + deltaCenterX / rect.width,
              y: t.y + deltaCenterY / rect.height,
              scale: clampedScale,
            },
          });
        }

        return changeClipProperty(p, id, {
          transform: {
            ...t,
            rotation: Math.round(t.rotation + (curAngle - startAngle)),
          },
        });
      },
      notify
    );
  };

  // Shared hit-test in frame coordinates (reverse draw order: topmost overlay/graphic/caption/text first)
  const pickLayerAtPoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return undefined;
    const x = ((clientX - rect.left) / rect.width) * aspectW;
    const y = ((clientY - rect.top) / rect.height) * aspectH;
    const padX = (14 / rect.width) * aspectW;
    const padY = (14 / rect.height) * aspectH;

    return [...boundsRef.current].reverse().find((b) => {
      const radians = (-b.rotation * Math.PI) / 180;
      const dx = x - b.x;
      const dy = y - b.y;
      const hitW = Math.max(b.width, 48) / 2 + padX;
      const hitH = Math.max(b.height, 36) / 2 + padY;
      return (
        Math.abs(dx * Math.cos(radians) - dy * Math.sin(radians)) < hitW &&
        Math.abs(dx * Math.sin(radians) + dy * Math.cos(radians)) < hitH
      );
    });
  };

  // Pick layer from canvas click
  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    const hit = pickLayerAtPoint(event.clientX, event.clientY);

    select(hit ? [hit.id] : []);
    if (hit) handleGesture(event, "move", hit.id);
  };

  const renderHeight = quality;
  const renderWidth = Math.round((quality * aspectW) / aspectH);
  const selectedClip = selection[0] ? project.clips[selection[0]] : undefined;
  const clipRotation = selectedClip?.transform.rotation ?? 0;

  return (
    <section
      ref={sectionRef}
      className={
        isExpanded
          ? "fixed inset-0 z-50 w-screen h-[100dvh] bg-slate-950 text-slate-100 flex flex-col items-center justify-between !overflow-hidden overflow-x-hidden select-none"
          : "vx-stage flex-1 bg-slate-100 flex flex-col items-center justify-between relative min-w-0 h-full !overflow-hidden overflow-x-hidden select-none"
      }
      aria-label="Central Video Preview Stage"
    >
      {/* Top Preview Header (CapCut Desktop Parity: "Previewing — video") */}
      <div
        className={`w-full flex flex-wrap items-center justify-between gap-2 z-20 px-3 py-1.5 text-xs border-b ${
          isExpanded
            ? "bg-slate-900 border-slate-800 text-slate-100"
            : "bg-white border-slate-200 text-slate-800"
        }`}
      >
        <div className="flex items-center gap-2 font-medium min-w-0">
          <span
            className={`text-[13px] font-semibold tracking-tight truncate ${
              isExpanded ? "text-white" : "text-slate-900"
            }`}
          >
            {isExpanded ? "Maximized Preview" : "Previewing — video"}
          </span>
        </div>

        {/* Right HUD: Safe Area Overlays, Alignment Guides & Maximize Preview */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Framing & Safe Area Overlays */}
          <div
            className={`flex items-center gap-1 border px-1.5 py-0.5 rounded-lg ${
              isExpanded
                ? "bg-slate-800 border-slate-700 text-slate-200"
                : "bg-slate-50 border-slate-200 text-slate-600"
            }`}
          >
            {/* Safe Areas Guide */}
            <button
              type="button"
              onClick={() => setShowSafeAreas(!showSafeAreas)}
              title="Toggle TikTok / Reels UI Safe Areas"
              aria-label="Toggle Safe Areas"
              aria-pressed={showSafeAreas}
              className={`p-1 rounded transition-colors cursor-pointer ${
                showSafeAreas
                  ? isExpanded
                    ? "bg-sky-500/20 text-sky-300"
                    : "bg-slate-200 text-slate-900"
                  : isExpanded
                  ? "hover:bg-slate-700 text-slate-300"
                  : "hover:bg-slate-100 text-slate-600"
              }`}
            >
              <Shield size={13} />
            </button>

            {/* Center Crosshair */}
            <button
              type="button"
              onClick={() => setShowCrosshair(!showCrosshair)}
              title="Toggle Center Alignment Guides"
              aria-label="Toggle Center Alignment Guides"
              aria-pressed={showCrosshair}
              className={`p-1 rounded transition-colors cursor-pointer ${
                showCrosshair
                  ? isExpanded
                    ? "bg-sky-500/20 text-sky-300"
                    : "bg-slate-200 text-slate-900"
                  : isExpanded
                  ? "hover:bg-slate-700 text-slate-300"
                  : "hover:bg-slate-100 text-slate-600"
              }`}
            >
              <Crosshair size={13} />
            </button>

            <div className={`h-3 w-[1px] mx-0.5 ${isExpanded ? "bg-slate-700" : "bg-slate-200"}`} />

            {/* Quality Badge */}
            <span className={`text-[10px] font-mono px-1 ${isExpanded ? "text-slate-300" : "text-slate-500"}`}>
              {buffering ? "Buffering…" : `${quality}p`}
            </span>
          </div>

          {/* Dedicated Maximize / Exit Maximize Preview Button */}
          <button
            type="button"
            onClick={toggleMaximizePreview}
            title={isExpanded ? "Exit Maximized Preview (Esc)" : "Maximize Preview Video"}
            aria-label={isExpanded ? "Exit Maximize Preview" : "Maximize Preview"}
            aria-pressed={isExpanded}
            data-testid="preview-maximize-btn"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer shrink-0 ${
              isExpanded
                ? "bg-sky-500 hover:bg-sky-600 border-sky-400 text-white shadow-xs"
                : "bg-slate-50 hover:bg-sky-50 border-slate-200 hover:border-sky-300 text-slate-700 hover:text-sky-700"
            }`}
          >
            {isExpanded ? <Minimize size={13} /> : <Maximize size={13} />}
            <span>{isExpanded ? "Exit Maximize" : "Maximize"}</span>
          </button>
        </div>
      </div>

      {/* Main Preview Container */}
      <div
        ref={stageRef}
        className={`flex-1 w-full flex items-center justify-center relative min-h-0 ${
          isExpanded ? "bg-slate-950" : "bg-slate-100"
        } ${zoom !== "fit" && zoom > 1 ? "overflow-auto p-4" : "overflow-hidden"}`}
      >
        <div
          ref={frameRef}
          className="relative bg-black rounded-lg shadow-xs border border-slate-200 will-change-transform"
        >
          {/* Clipped Media & Safe-Area Viewport (keeps resize/rotate handles visible outside edges) */}
          <div className="relative w-full h-full overflow-hidden rounded-lg">
            {/* Video Canvas */}
            <canvas
              ref={canvasRef}
              width={renderWidth}
              height={renderHeight}
              onPointerDown={handleCanvasPointerDown}
              className="w-full h-full object-contain cursor-crosshair touch-none"
              aria-label="Video Player Canvas"
            />

          {/* Center Crosshair Overlay */}
          {showCrosshair && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-cyan-400/50" />
              <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-cyan-400/50" />
            </div>
          )}

          {/* Dynamic Safe Area Overlays */}
          {showSafeAreas && (
            <div className="absolute inset-0 pointer-events-none">
              {aspectRatio === "9:16" && (
                <div className="absolute inset-x-[16%] top-[12%] bottom-[20%] border-2 border-dashed border-amber-400/60 rounded-md flex flex-col justify-between p-2 text-[10px] text-amber-300 font-mono">
                  <span className="opacity-80">Top Header Safe</span>
                  <span className="opacity-80 text-right">Action Sidebar</span>
                  <span className="opacity-80">Bottom Caption Safe</span>
                </div>
              )}
              {aspectRatio === "4:5" && (
                <div className="absolute inset-x-[5%] inset-y-[10%] border-2 border-dashed border-amber-400/60 rounded-md flex items-end p-2 text-[10px] text-amber-300 font-mono">
                  <span className="opacity-80">4:5 Feed Safe Area</span>
                </div>
              )}
              {aspectRatio === "1:1" && (
                <div className="absolute inset-[10%] border-2 border-dashed border-amber-400/60 rounded-md flex items-end p-2 text-[10px] text-amber-300 font-mono">
                  <span className="opacity-80">1:1 Square Safe Area</span>
                </div>
              )}
              {aspectRatio === "16:9" && (
                <>
                  <div className="absolute inset-[5%] border border-dashed border-amber-400/60 rounded flex items-start p-1.5 text-[9px] text-amber-300 font-mono">
                    <span className="opacity-80">Action Safe (90%)</span>
                  </div>
                  <div className="absolute inset-[10%] border border-dashed border-cyan-400/60 rounded flex items-end p-1.5 text-[9px] text-cyan-300 font-mono">
                    <span className="opacity-80">Title Safe (80%)</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Alignment Snapping Guides (when snapped to canvas center) */}
          {snapGuides.x && (
            <div
              className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-cyan-400 z-20 pointer-events-none shadow-[0_0_6px_rgba(34,211,238,0.9)]"
              aria-hidden="true"
            />
          )}
          {snapGuides.y && (
            <div
              className="absolute top-1/2 left-0 right-0 h-[1px] bg-cyan-400 z-20 pointer-events-none shadow-[0_0_6px_rgba(34,211,238,0.9)]"
              aria-hidden="true"
            />
          )}
          {snapGuides.x && snapGuides.y && (
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,1)] z-20 pointer-events-none"
              aria-hidden="true"
            />
          )}

          {/* Empty State Overlay */}
          {Object.keys(project.clips).length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/75 pointer-events-none">
              <Film size={32} className="text-slate-400 mb-2" />
              <strong className="text-white text-sm font-semibold">
                Your Next Story Starts Here
              </strong>
              <p className="text-slate-300 text-xs mt-1 max-w-xs">
                Import raw A-roll footage from the Media tab or ask Kreovar AI Editor to generate your video.
              </p>
            </div>
          )}
          </div>

          {/* Interactive Bounding Box around Selected Clip */}
          <div
            ref={outlineRef}
            style={{ display: "none" }}
            className="absolute border border-sky-500 pointer-events-auto cursor-move touch-none z-30"
            onPointerDown={(e) => {
              // If user clicked a topmost overlay (motion graphic / caption / text) sitting inside
              // a larger selected layer (e.g., full-frame video), switch selection and drag it directly.
              const topmost = pickLayerAtPoint(e.clientX, e.clientY);
              if (topmost && topmost.id !== selection[0]) {
                select([topmost.id]);
                handleGesture(e, "move", topmost.id);
                return;
              }
              if (selection[0]) handleGesture(e, "move", selection[0]);
            }}
          >
            {/* Label */}
            <span className="absolute -top-6 left-0 bg-blue-600 text-white font-mono text-[9px] px-1.5 py-0.5 rounded shadow pointer-events-none select-none max-w-[120px] truncate">
              {project.clips[selection[0]]?.name}
            </span>

            {/* 4 Corner Resize Handles */}
            {/* Top-Left (TL) */}
            <button
              aria-label="Scale Top-Left"
              onPointerDown={(e) => handleGesture(e, "scale", selection[0], "tl")}
              style={{ cursor: getRotatedCursor(135, clipRotation) }}
              className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-white border-2 border-blue-600 shadow hover:scale-110 active:scale-95 transition-transform"
            />

            {/* Top-Right (TR) */}
            <button
              aria-label="Scale Top-Right"
              onPointerDown={(e) => handleGesture(e, "scale", selection[0], "tr")}
              style={{ cursor: getRotatedCursor(45, clipRotation) }}
              className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-white border-2 border-blue-600 shadow hover:scale-110 active:scale-95 transition-transform"
            />

            {/* Bottom-Right (BR) */}
            <button
              aria-label="Scale Bottom-Right"
              onPointerDown={(e) => handleGesture(e, "scale", selection[0], "br")}
              style={{ cursor: getRotatedCursor(135, clipRotation) }}
              className="absolute -bottom-2 -right-2 w-4 h-4 rounded-full bg-white border-2 border-blue-600 shadow hover:scale-110 active:scale-95 transition-transform"
            />

            {/* Bottom-Left (BL) */}
            <button
              aria-label="Scale Bottom-Left"
              onPointerDown={(e) => handleGesture(e, "scale", selection[0], "bl")}
              style={{ cursor: getRotatedCursor(45, clipRotation) }}
              className="absolute -bottom-2 -left-2 w-4 h-4 rounded-full bg-white border-2 border-blue-600 shadow hover:scale-110 active:scale-95 transition-transform"
            />

            {/* Top Rotation Handle Stalk */}
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-[1.5px] h-6 bg-blue-600 pointer-events-none" />

            {/* Top Rotate Handle */}
            <button
              aria-label="Rotate layer"
              onPointerDown={(e) => handleGesture(e, "rotate", selection[0])}
              className="absolute -top-[31px] left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-white cursor-grab active:cursor-grabbing shadow hover:scale-110 transition-transform"
            />
          </div>
        </div>
      </div>

      {/* Interactive Seek Bar (always available in Maximized/Fullscreen preview) */}
      {isExpanded && (
        <div className="w-full px-4 pt-2 pb-1 bg-slate-900/95 border-t border-slate-800 flex items-center gap-3 z-20">
          <StageExpandedSeekBar playback={playback} duration={duration} fps={fps} />
        </div>
      )}

      {/* Transport Control Bar (CapCut Desktop Parity: Responsive Light Player Bar — Never Clipped) */}
      <div
        className={`w-full max-w-full border-t px-3 py-1.5 flex items-center justify-between z-20 min-w-0 flex-wrap gap-1.5 ${
          isExpanded
            ? "bg-slate-900 border-slate-800 text-slate-200"
            : "bg-white border-slate-200 text-slate-700"
        }`}
      >
        {/* Left: Step Frame & Go to Start */}
        <div className={`flex items-center gap-1 shrink-0 ${isExpanded ? "text-slate-300" : "text-slate-500"}`}>
          <button
            type="button"
            onClick={() => playback.set(0, false)}
            title="Go to Start (Home)"
            aria-label="Go to Start"
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isExpanded ? "hover:text-white hover:bg-slate-800" : "hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            onClick={() => stepFrame(-1)}
            title="Step 1 Frame Back (←)"
            aria-label="Previous Frame"
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isExpanded ? "hover:text-white hover:bg-slate-800" : "hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <SkipBack size={15} />
          </button>
          <button
            type="button"
            onClick={() => stepFrame(1)}
            title="Step 1 Frame Forward (→)"
            aria-label="Next Frame"
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isExpanded ? "hover:text-white hover:bg-slate-800" : "hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <SkipForward size={15} />
          </button>
        </div>

        {/* Center: Play / Pause & Timecode */}
        <div className="flex items-center gap-2 shrink-0">
          <StagePlayPauseButton
            playback={playback}
            duration={duration}
            isExpanded={isExpanded}
            onTogglePlay={togglePlay}
          />

          {/* Timecode Display (CapCut Format: 00:00:00 / 00:00:00) */}
          <StageTimecode playback={playback} duration={duration} fps={fps} isExpanded={isExpanded} />
        </div>

        {/* Right: Loop, Zoom, Fullscreen / Maximize, Quick AI Editor Launcher */}
        <div className={`flex items-center gap-1 shrink-0 ${isExpanded ? "text-slate-300" : "text-slate-500"}`}>
          {/* Loop Toggle */}
          <button
            type="button"
            onClick={() => setIsLooping(!isLooping)}
            title={isLooping ? "Loop Playback (Active)" : "Loop Playback (Off)"}
            aria-label={isLooping ? "Disable Loop Playback" : "Enable Loop Playback"}
            aria-pressed={isLooping}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isLooping
                ? isExpanded
                  ? "text-sky-300 bg-sky-500/20 border border-sky-500/40"
                  : "text-sky-600 bg-sky-50 border border-sky-200"
                : isExpanded
                ? "hover:text-white hover:bg-slate-800"
                : "hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Repeat size={14} />
          </button>

          {/* Zoom Selector */}
          <select
            value={zoom}
            onChange={(e) =>
              setZoom(e.target.value === "fit" ? "fit" : Number(e.target.value))
            }
            aria-label="Stage Scale"
            className={`border text-[11px] rounded-md px-2 py-1 focus:outline-none focus:border-sky-500 cursor-pointer ${
              isExpanded
                ? "bg-slate-800 border-slate-700 text-slate-100"
                : "bg-slate-50 border-slate-200 text-slate-800"
            }`}
          >
            <option value="fit">Fit</option>
            <option value={0.5}>50%</option>
            <option value={0.75}>75%</option>
            <option value={1.0}>100%</option>
            <option value={1.5}>150%</option>
          </select>

          {/* Maximize / Browser Fullscreen Button */}
          <button
            type="button"
            onClick={() => void toggleBrowserFullscreen()}
            title={isFullscreen ? "Exit Fullscreen (Esc)" : "Fullscreen Preview"}
            aria-label={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isExpanded
                ? "text-sky-300 bg-slate-800 hover:bg-slate-700"
                : "hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            {isExpanded ? <Minimize size={14} /> : <Maximize size={14} />}
          </button>

          {/* Quick AI Editor Launcher (CapCut EditPilot Parity) */}
          {!isExpanded && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("veelox:toggle-ai-chat"))}
              title="Open AI Editor"
              aria-label="Open AI Editor"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
            >
              <Sparkles size={12} className="text-sky-600" />
              <span className="hidden lg:inline">AI Editor</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
