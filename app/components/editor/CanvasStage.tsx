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
import { usePlayback, useProject } from "@/app/lib/editor/store";
import { changeClipProperty } from "@/app/lib/editor/operations";
import { pointerEdit } from "@/app/lib/editor/interaction";
import { useEditor } from "./workspace/EditorContext";

interface CanvasStageProps {
  quality?: number;
  readOnly?: boolean;
}

export default function CanvasStage({
  quality = 720,
  readOnly = false,
}: CanvasStageProps) {
  const { store, playback, repository, selection, select, run, notify } = useEditor();
  const project = useProject(store);
  const { time, playing } = usePlayback(playback);

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
  const [showSafeAreas, setShowSafeAreas] = useState(false);
  const [showCrosshair, setShowCrosshair] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

        // Loop handling
        if (state.playing && isLooping && curDuration > 0 && next >= curDuration) {
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
          playback.set(next, isLooping || next < curDuration);
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

    return () => {
      cancelAnimationFrame(request);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      compositor.dispose();
      engineRef.current = null;
    };
  }, [store, playback, repository, notify, isLooping]);

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
  }, [aspectRatio, aspectW, aspectH, zoom]);

  // Fullscreen listener
  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

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
    const next = Math.max(0, Math.min(duration, time + frames / fps));
    playback.set(next, false);
  };

  // Direct Interactive Canvas Manipulation (Move, Scale, Rotate)
  const handleGesture = (
    event: React.PointerEvent,
    mode: "move" | "scale" | "rotate",
    id: string
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
    const startX = event.clientX;
    const startY = event.clientY;
    const t = clip.transform;

    pointerEdit(
      store,
      (e) => (p) =>
        changeClipProperty(p, id, {
          transform: {
            ...t,
            ...(mode === "move"
              ? {
                  x: t.x + (e.clientX - startX) / rect.width,
                  y: t.y + (e.clientY - startY) / rect.height,
                }
              : mode === "scale"
              ? {
                  scale: clamp(
                    t.scale * (1 + (e.clientX - startX) / Math.max(30, rect.width * 0.3)),
                    0.05,
                    10
                  ),
                }
              : { rotation: t.rotation + (e.clientX - startX) * 0.6 }),
          },
        }),
      notify
    );
  };

  // Pick layer from canvas click
  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * aspectW;
    const y = ((event.clientY - rect.top) / rect.height) * aspectH;

    const hit = [...boundsRef.current].reverse().find((b) => {
      const radians = (-b.rotation * Math.PI) / 180;
      const dx = x - b.x;
      const dy = y - b.y;
      return (
        Math.abs(dx * Math.cos(radians) - dy * Math.sin(radians)) < b.width / 2 &&
        Math.abs(dx * Math.sin(radians) + dy * Math.cos(radians)) < b.height / 2
      );
    });

    select(hit ? [hit.id] : []);
    if (hit) handleGesture(event, "move", hit.id);
  };

  const renderHeight = quality;
  const renderWidth = Math.round((quality * aspectW) / aspectH);

  return (
    <section
      className="vx-stage flex-1 bg-[#EDF1F6] flex flex-col items-center justify-between relative p-3 min-w-0 h-full overflow-hidden select-none"
      aria-label="Central Video Preview Stage"
    >
      {/* Top Floating Stage HUD / Aspect Controls */}
      <div className="w-full max-w-4xl flex items-center justify-between z-20 px-2 py-1 text-xs">
        {/* Aspect Ratio Quick Toggle Pill */}
        <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur-md border border-slate-200 px-2 py-1 rounded-xl shadow-sm">
          <button
            onClick={() =>
              run((p) => ({
                ...p,
                settings: {
                  ...p.settings,
                  aspectRatio: aspectRatio === "9:16" ? "16:9" : "9:16",
                },
              }))
            }
            title="Toggle between 9:16 Portrait and 16:9 Widescreen"
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 transition-colors"
          >
            {aspectRatio === "9:16" ? (
              <Smartphone size={13} className="text-blue-600" />
            ) : (
              <Monitor size={13} className="text-blue-600" />
            )}
            <span>{aspectRatio}</span>
          </button>

          <span className="text-[11px] text-slate-600 px-1">
            {aspectRatio === "9:16" ? "Reels / Shorts" : "Widescreen"}
          </span>
        </div>

        {/* Framing & Safe Area Overlays */}
        <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur-md border border-slate-200 px-2 py-1 rounded-xl shadow-sm text-slate-500">
          {/* Safe Areas Guide */}
          <button
            onClick={() => setShowSafeAreas(!showSafeAreas)}
            title="Toggle TikTok / Reels UI Safe Areas"
            aria-pressed={showSafeAreas}
            className={`p-1 rounded-lg transition-colors ${
              showSafeAreas
                ? "bg-amber-50 text-amber-700 border border-amber-200"
                : "hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Shield size={14} />
          </button>

          {/* Center Crosshair */}
          <button
            onClick={() => setShowCrosshair(!showCrosshair)}
            title="Toggle Center Alignment Guides"
            aria-pressed={showCrosshair}
            className={`p-1 rounded-lg transition-colors ${
              showCrosshair
                ? "bg-blue-50 text-blue-700 border border-blue-200"
                : "hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Crosshair size={14} />
          </button>

          <div className="h-3 w-[1px] bg-slate-200 mx-0.5" />

          {/* Buffering or Quality Badge */}
          <span className="text-[10px] font-mono text-slate-600">
            {buffering ? "Buffering…" : `${quality}p`}
          </span>
        </div>
      </div>

      {/* Main Preview Container */}
      <div
        ref={stageRef}
        className="flex-1 w-full flex items-center justify-center relative min-h-0 overflow-hidden"
      >
        <div
          ref={frameRef}
          className="relative bg-black rounded-lg shadow-[0_8px_28px_rgba(15,23,42,0.18)] overflow-hidden border border-slate-200/80 will-change-transform"
        >
          {/* Video Canvas */}
          <canvas
            ref={canvasRef}
            width={renderWidth}
            height={renderHeight}
            onPointerDown={handleCanvasPointerDown}
            className="w-full h-full object-contain cursor-crosshair"
            aria-label="Video Player Canvas"
          />

          {/* Center Crosshair Overlay */}
          {showCrosshair && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-cyan-400/50" />
              <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-cyan-400/50" />
            </div>
          )}

          {/* Safe Area Overlay for 9:16 Short-Form Videos */}
          {showSafeAreas && aspectRatio === "9:16" && (
            <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-amber-400/50 m-8 rounded-lg flex flex-col justify-between p-3 text-[10px] text-amber-300 font-mono">
              <span className="opacity-80">Top Header Safe Zone</span>
              <span className="opacity-80 self-end text-right">
                Right Action Sidebar (Likes/Share)
              </span>
              <span className="opacity-80">Bottom Caption & Audio Safe Zone</span>
            </div>
          )}

          {/* Interactive Bounding Box around Selected Clip */}
          <div
            ref={outlineRef}
            style={{ display: "none" }}
            className="absolute border-2 border-blue-600 pointer-events-auto cursor-move z-30"
            onPointerDown={(e) => {
              if (selection[0]) handleGesture(e, "move", selection[0]);
            }}
          >
            {/* Label */}
            <span className="absolute -top-6 left-0 bg-blue-600 text-white font-mono text-[9px] px-1.5 py-0.5 rounded shadow">
              {project.clips[selection[0]]?.name}
            </span>

            {/* Corner Scale Handle */}
            <button
              aria-label="Scale layer"
              onPointerDown={(e) => handleGesture(e, "scale", selection[0])}
              className="absolute -bottom-2 -right-2 w-4 h-4 rounded-full bg-white border-2 border-blue-600 cursor-se-resize shadow"
            />

            {/* Top Rotate Handle */}
            <button
              aria-label="Rotate layer"
              onPointerDown={(e) => handleGesture(e, "rotate", selection[0])}
              className="absolute -top-5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-blue-500 border border-white cursor-grab shadow"
            />
          </div>

          {/* Empty State Overlay */}
          {Object.keys(project.clips).length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/75 pointer-events-none">
              <Film size={32} className="text-slate-400 mb-2" />
              <strong className="text-white text-sm font-semibold">
                Your Next Story Starts Here
              </strong>
              <p className="text-slate-300 text-xs mt-1 max-w-xs">
                Import raw A-roll footage from the Media tab or ask Kreovar AI Copilot to generate your video.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Transport Control Bar */}
      <div className="w-full max-w-2xl bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl px-4 py-2 flex items-center justify-between shadow-sm z-20 mt-2">
        {/* Left: Step Frame & Go to Start */}
        <div className="flex items-center gap-1.5 text-slate-600">
          <button
            onClick={() => playback.set(0, false)}
            title="Go to Start (Home)"
            aria-label="Go to Start"
            className="p-1.5 rounded-lg hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <RotateCcw size={14} />
          </button>
          <button
            onClick={() => stepFrame(-1)}
            title="Step 1 Frame Back (←)"
            aria-label="Previous Frame"
            className="p-1.5 rounded-lg hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <SkipBack size={15} />
          </button>
        </div>

        {/* Center: Play / Pause */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => void togglePlay()}
            disabled={!duration}
            title="Play / Pause (Space)"
            aria-label={playing ? "Pause" : "Play"}
            className="w-10 h-10 rounded-full bg-[#0F172A] hover:bg-slate-800 text-white flex items-center justify-center shadow-md transition-all hover:scale-105 disabled:opacity-40"
          >
            {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>

          {/* Timecode Display */}
          <div className="flex items-center font-mono text-xs text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg">
            <span className="text-slate-900 font-bold">{formatTime(time, fps)}</span>
            <span className="text-slate-400 mx-1.5">/</span>
            <span className="text-slate-600">{formatTime(duration, fps)}</span>
          </div>
        </div>

        {/* Right: Step Forward, Loop, Zoom, Fullscreen */}
        <div className="flex items-center gap-1.5 text-slate-600">
          <button
            onClick={() => stepFrame(1)}
            title="Step 1 Frame Forward (→)"
            aria-label="Next Frame"
            className="p-1.5 rounded-lg hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <SkipForward size={15} />
          </button>

          {/* Loop Toggle */}
          <button
            onClick={() => setIsLooping(!isLooping)}
            title={isLooping ? "Loop Playback (Active)" : "Loop Playback (Off)"}
            aria-pressed={isLooping}
            className={`p-1.5 rounded-lg transition-colors ${
              isLooping
                ? "text-blue-600 bg-blue-50 border border-blue-200"
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
            className="bg-slate-50 border border-slate-200 text-[11px] text-slate-700 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-600 ml-1"
          >
            <option value="fit">Fit</option>
            <option value={0.5}>50%</option>
            <option value={0.75}>75%</option>
            <option value={1.0}>100%</option>
            <option value={1.5}>150%</option>
          </select>

          {/* Fullscreen Button */}
          <button
            onClick={() => {
              if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
              } else {
                stageRef.current?.requestFullscreen().catch((e) => notify(e.message));
              }
            }}
            title="Fullscreen Canvas"
            aria-label="Fullscreen"
            className="p-1.5 rounded-lg hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
          </button>
        </div>
      </div>
    </section>
  );
}
