"use client";

import React, { useRef, useEffect, useMemo, useState, useCallback } from "react";
import {
  VeeloxTimelineProject,
  TimelineItem,
  MotionAnimationType,
} from "@/app/lib/timeline/types";
import { getTemplateById } from "@/app/lib/captions/templates";
import CaptionRenderer from "../captions/CaptionRenderer";
import {
  Play,
  Pause,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Move,
  RotateCw,
  Crosshair,
  Shield,
  Smartphone,
  Eye,
  EyeOff,
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
} from "lucide-react";

interface EditorVideoPreviewProps {
  timeline: VeeloxTimelineProject;
  currentTime: number;
  isPlaying: boolean;
  selectedClip?: TimelineItem | null;
  selectedClipId?: string | null;
  onTimeUpdate: (time: number) => void;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onSelectClip?: (item: TimelineItem) => void;
  onUpdateClip?: (item: TimelineItem) => void;
  onDropBRoll?: (
    brollData: { videoUrl: string; title?: string; thumbnail?: string; duration?: number; source?: string },
    targetTime?: number,
    targetClipId?: string
  ) => void;
  playbackSpeed?: number;
  onChangePlaybackSpeed?: (speed: number) => void;
}

type PreviewZoom = "fit" | 0.5 | 0.75 | 1.0 | 1.5 | 2.0;
type GuidesMode = "off" | "safe_areas" | "social_ui";

interface DragTransformState {
  type: "move" | "resize" | "rotate";
  handle?: string;
  itemId: string;
  startMouseX: number;
  startMouseY: number;
  startX: number;
  startY: number;
  startScale: number;
  startRotation: number;
}

export default function EditorVideoPreview({
  timeline,
  currentTime,
  isPlaying,
  selectedClip,
  selectedClipId,
  onTimeUpdate,
  onTogglePlay,
  onSeek,
  onSelectClip,
  onUpdateClip,
  onDropBRoll,
  playbackSpeed = 1,
  onChangePlaybackSpeed,
}: EditorVideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previewCanvasRef = useRef<HTMLDivElement | null>(null);

  const [isDragOverPreview, setIsDragOverPreview] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [previewZoom, setPreviewZoom] = useState<PreviewZoom>("fit");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Framing & Safe Area Guides mode: "off" | "safe_areas" | "social_ui"
  const [guidesMode, setGuidesMode] = useState<GuidesMode>("off");

  // Center crosshair snap feedback
  const [isSnappedCenterX, setIsSnappedCenterX] = useState(false);
  const [isSnappedCenterY, setIsSnappedCenterY] = useState(false);

  // Interactive Direct Canvas Manipulation (Move / Resize / Rotate)
  const [transformState, setTransformState] = useState<DragTransformState | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  // Audio volume state
  const previewVolume = 1.0;
  const isMuted = false;

  const totalDuration = Math.max(1, timeline.duration);
  const fps = timeline.settings?.fps || 30;
  const frameTime = 1 / fps;

  // Identify Tracks
  const videoTrack = useMemo(
    () => timeline.tracks.find((t) => t.type === "video"),
    [timeline.tracks]
  );
  const captionTrack = useMemo(
    () => timeline.tracks.find((t) => t.type === "captions"),
    [timeline.tracks]
  );
  const textTrack = useMemo(
    () => timeline.tracks.find((t) => t.type === "text"),
    [timeline.tracks]
  );
  const overlayTrack = useMemo(
    () => timeline.tracks.find((t) => t.type === "overlays"),
    [timeline.tracks]
  );
  const voiceoverTrack = useMemo(
    () => timeline.tracks.find((t) => t.type === "voiceover"),
    [timeline.tracks]
  );
  const musicTrack = useMemo(
    () => timeline.tracks.find((t) => t.type === "music"),
    [timeline.tracks]
  );

  // Active Video Clip
  const activeClip = useMemo(() => {
    if (!videoTrack || videoTrack.items.length === 0) return null;
    const clip = videoTrack.items.find(
      (item) => currentTime >= item.startTime && currentTime < item.endTime
    );
    return clip || videoTrack.items[videoTrack.items.length - 1];
  }, [videoTrack, currentTime]);

  // Active Caption Item
  const activeCaption = useMemo(() => {
    if (!captionTrack || captionTrack.items.length === 0) return null;
    return (
      captionTrack.items.find(
        (item) => currentTime >= item.startTime && currentTime <= item.endTime
      ) || null
    );
  }, [captionTrack, currentTime]);

  // Active Text Items
  const activeTextItems = useMemo(() => {
    if (!textTrack || textTrack.items.length === 0) return [];
    return textTrack.items.filter(
      (item) => currentTime >= item.startTime && currentTime <= item.endTime
    );
  }, [textTrack, currentTime]);

  // Active Overlay Items
  const activeOverlays = useMemo(() => {
    if (!overlayTrack || overlayTrack.items.length === 0) return [];
    return overlayTrack.items.filter(
      (item) => currentTime >= item.startTime && currentTime <= item.endTime
    );
  }, [overlayTrack, currentTime]);

  // Active Selected Visual Item (for Direct Canvas Gizmo)
  const currentSelectedVisualItem = useMemo(() => {
    const targetId = selectedClip?.id || selectedClipId;
    if (!targetId) return null;

    const inText = activeTextItems.find((t) => t.id === targetId);
    if (inText) return inText;

    const inOverlay = activeOverlays.find((o) => o.id === targetId);
    if (inOverlay) return inOverlay;

    if (activeClip && activeClip.id === targetId) return activeClip;

    return null;
  }, [selectedClip, selectedClipId, activeTextItems, activeOverlays, activeClip]);

  // Voiceover & Music Assets
  const voiceoverItem = voiceoverTrack?.items?.[0] || null;
  const musicItem = musicTrack?.items?.[0] || null;

  // Audio Ducking calculation
  const isVoiceoverActive = useMemo(() => {
    if (!voiceoverItem) return false;
    return currentTime >= voiceoverItem.startTime && currentTime <= voiceoverItem.endTime;
  }, [voiceoverItem, currentTime]);

  // Synchronize HTML5 Video element with timeline currentTime & playbackSpeed
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeClip) return;

    video.playbackRate = playbackSpeed;

    const clipLocalOffset = Math.max(0, currentTime - activeClip.startTime);
    const sourceOffset = activeClip.metadata?.sourceOffset || 0;
    const clipSpeed = activeClip.speed || 1.0;
    const targetVideoTime = sourceOffset + clipLocalOffset * clipSpeed;

    if (Math.abs(video.currentTime - targetVideoTime) > 0.25) {
      video.currentTime = targetVideoTime;
    }

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [activeClip, isPlaying, currentTime, playbackSpeed]);

  // Synchronize Voiceover Audio
  useEffect(() => {
    const voiceAudio = voiceAudioRef.current;
    if (!voiceAudio || !voiceoverItem) return;

    voiceAudio.playbackRate = playbackSpeed;
    voiceAudio.volume = isMuted ? 0 : previewVolume * (voiceoverItem.volume ?? 1.0);

    if (currentTime >= voiceoverItem.startTime && currentTime <= voiceoverItem.endTime) {
      const targetTime = currentTime - voiceoverItem.startTime;
      if (Math.abs(voiceAudio.currentTime - targetTime) > 0.25) {
        voiceAudio.currentTime = targetTime;
      }
      if (isPlaying) {
        voiceAudio.play().catch(() => {});
      } else {
        voiceAudio.pause();
      }
    } else {
      voiceAudio.pause();
    }
  }, [voiceoverItem, isPlaying, currentTime, previewVolume, isMuted, playbackSpeed]);

  // Synchronize Background Music with Real-time Ducking
  useEffect(() => {
    const musicAudio = musicAudioRef.current;
    if (!musicAudio || !musicItem) return;

    musicAudio.playbackRate = playbackSpeed;
    const baseVolume = (timeline.settings?.musicVolume ?? 0.16) * (musicItem.volume ?? 1.0);
    const duckFactor = timeline.settings?.duckingFactor ?? 0.25;
    const targetVolume = isVoiceoverActive ? baseVolume * duckFactor : baseVolume;
    musicAudio.volume = isMuted ? 0 : Math.max(0, Math.min(1, targetVolume * previewVolume));

    if (isPlaying) {
      musicAudio.play().catch(() => {});
    } else {
      musicAudio.pause();
    }
  }, [musicItem, isPlaying, isVoiceoverActive, timeline.settings?.musicVolume, timeline.settings?.duckingFactor, previewVolume, isMuted, playbackSpeed]);

  // Progress Time ticking while playing
  useEffect(() => {
    if (!isPlaying) return;
    const intervalMs = 1000 / (fps * playbackSpeed);
    const step = 0.05 * playbackSpeed;

    const interval = setInterval(() => {
      onTimeUpdate(Math.min(totalDuration, currentTime + step));
      if (currentTime >= totalDuration) {
        if (isLooping) {
          onSeek(0);
        } else {
          onTogglePlay();
        }
      }
    }, Math.max(20, Math.round(intervalMs)));

    return () => clearInterval(interval);
  }, [isPlaying, currentTime, totalDuration, isLooping, onTimeUpdate, onSeek, onTogglePlay, fps, playbackSpeed]);

  // Ken Burns Motion style calculation for active clip
  const motionStyle = useMemo(() => {
    if (!activeClip) return {};
    const clipDur = Math.max(0.1, activeClip.duration);
    const progress = Math.min(1, Math.max(0, (currentTime - activeClip.startTime) / clipDur));
    const anim: MotionAnimationType = activeClip.animation || "none";

    let transform = "";
    if (anim === "slow_zoom_in") {
      transform = `scale(${1.0 + progress * 0.12})`;
    } else if (anim === "slow_zoom_out") {
      transform = `scale(${1.12 - progress * 0.12})`;
    } else if (anim === "pan_left") {
      transform = `translateX(${-progress * 5}%)`;
    } else if (anim === "pan_right") {
      transform = `translateX(${progress * 5}%)`;
    }

    const posX = activeClip.position?.x ?? 0;
    const posY = activeClip.position?.y ?? 0;
    const sc = activeClip.scale ?? 1.0;
    const rot = activeClip.rotation ?? 0;

    const userTransform = `translate(${posX}px, ${posY}px) scale(${sc}) rotate(${rot}deg)`;
    const combined = transform ? `${userTransform} ${transform}` : userTransform;

    return {
      transform: combined,
      opacity: activeClip.opacity ?? 1.0,
      transition: "transform 0.05s linear",
    };
  }, [activeClip, currentTime]);

  // Visual filter and color grading CSS string
  const visualFilterStyle = useMemo(() => {
    if (!activeClip) return "";
    const filters: string[] = [];

    const preset = activeClip.filterPreset;
    if (preset === "warm") filters.push("sepia(0.2) saturate(1.2) brightness(1.05)");
    else if (preset === "cool") filters.push("contrast(1.1) saturate(0.85) hue-rotate(190deg)");
    else if (preset === "vintage") filters.push("sepia(0.35) contrast(0.9) brightness(1.1)");
    else if (preset === "cinematic") filters.push("contrast(1.2) saturate(1.1)");
    else if (preset === "bw") filters.push("grayscale(1)");
    else if (preset === "film") filters.push("contrast(1.15) sepia(0.15) saturate(1.1)");
    else if (preset === "clean") filters.push("contrast(1.05) brightness(1.02)");

    const adj = activeClip.colorAdjustments;
    if (adj) {
      if (adj.brightness) filters.push(`brightness(${1 + adj.brightness / 100})`);
      if (adj.contrast) filters.push(`contrast(${1 + adj.contrast / 100})`);
      if (adj.saturation) filters.push(`saturate(${1 + adj.saturation / 100})`);
      if (adj.temperature) {
        filters.push(adj.temperature > 0 ? `sepia(${adj.temperature / 200})` : `hue-rotate(${adj.temperature}deg)`);
      }
    }

    if (activeClip.effects && activeClip.effects.length > 0) {
      for (const eff of activeClip.effects) {
        if (eff.type === "blur" && eff.intensity > 0) {
          filters.push(`blur(${Math.round(eff.intensity / 10)}px)`);
        }
      }
    }

    return filters.join(" ");
  }, [activeClip]);

  // Transition overlay state
  const transitionEffect = useMemo(() => {
    if (!activeClip) return null;
    const transition = activeClip.transition || "cut";
    if (transition === "cut") return null;

    const timeSinceStart = currentTime - activeClip.startTime;
    const transDur = 0.4;

    if (timeSinceStart < transDur) {
      const progress = timeSinceStart / transDur;
      if (transition === "fade" || transition === "dissolve") {
        return { opacity: 1 - progress };
      }
      if (transition === "dip_black") {
        return { opacity: 1 - progress, color: "#000000" };
      }
      if (transition === "dip_white") {
        return { opacity: 1 - progress, color: "#FFFFFF" };
      }
      if (transition === "blur") {
        return { blur: (1 - progress) * 8 };
      }
      if (transition === "slide" || transition === "push") {
        return { translateX: (1 - progress) * 100 };
      }
    }
    return null;
  }, [activeClip, currentTime]);

  // Active Caption Template
  const presetId = timeline.settings?.captionTemplateId || timeline.settings?.captionPreset || "bold";
  const activeCaptionTemplate = timeline.settings?.captionStyle
    ? {
        id: presetId,
        name: "Custom",
        category: "Custom" as const,
        tagline: "",
        description: "",
        style: timeline.settings.captionStyle,
      }
    : getTemplateById(presetId);
  const captionPosition = timeline.settings?.captionPosition || activeCaptionTemplate.style.position || "center";

  const captionPositionClass = useMemo(() => {
    if (captionPosition === "top") return "top-8";
    if (captionPosition === "bottom") return "bottom-12";
    return "top-1/2 -translate-y-1/2";
  }, [captionPosition]);

  // Canvas aspect ratio sizing
  const canvasDimensions = useMemo(() => {
    const ratio = timeline.aspectRatio;
    if (ratio === "16:9") return { width: 640, height: 360, class: "aspect-[16/9] max-h-[460px] max-w-[820px]" };
    if (ratio === "1:1") return { width: 440, height: 440, class: "aspect-[1/1] max-h-[440px] max-w-[440px]" };
    if (ratio === "4:5") return { width: 352, height: 440, class: "aspect-[4/5] max-h-[480px] max-w-[384px]" };
    if (ratio === "4:3") return { width: 560, height: 420, class: "aspect-[4/3] max-h-[440px] max-w-[580px]" };
    return { width: 280, height: 498, class: "aspect-[9/16] max-h-[520px] max-w-[292px]" }; // 9:16
  }, [timeline.aspectRatio]);

  const zoomScale = previewZoom === "fit" ? 1.0 : previewZoom;

  function formatTimecode(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const f = Math.floor((secs % 1) * fps);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
  }

  // Handle Fullscreen toggle
  function handleToggleFullscreen() {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }

  // Frame navigation helpers
  const handleStepFrame = useCallback((direction: -1 | 1) => {
    const nextTime = Math.max(0, Math.min(totalDuration, currentTime + direction * frameTime));
    onSeek(Math.round(nextTime * 1000) / 1000);
  }, [totalDuration, currentTime, frameTime, onSeek]);

  // Start Direct Canvas Dragging (Move / Resize / Rotate)
  function handleGizmoMouseDown(
    e: React.MouseEvent,
    item: TimelineItem,
    type: "move" | "resize" | "rotate",
    handle?: string
  ) {
    e.stopPropagation();
    if (onSelectClip) onSelectClip(item);

    setTransformState({
      type,
      handle,
      itemId: item.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startX: item.position?.x ?? 0,
      startY: item.position?.y ?? 0,
      startScale: item.scale ?? 1.0,
      startRotation: item.rotation ?? 0,
    });
  }

  // Universal Direct Manipulation Event Listener
  useEffect(() => {
    if (!transformState) return;

    function handleMouseMove(e: MouseEvent) {
      if (!transformState || !onUpdateClip) return;
      const { type, handle, itemId, startMouseX, startMouseY, startX, startY, startScale, startRotation } =
        transformState;

      // Find current item from timeline
      let targetItem: TimelineItem | undefined;
      for (const tr of timeline.tracks) {
        const found = tr.items.find((i) => i.id === itemId);
        if (found) {
          targetItem = found;
          break;
        }
      }
      if (!targetItem) return;

      if (type === "move") {
        const dx = (e.clientX - startMouseX) / zoomScale;
        const dy = (e.clientY - startMouseY) / zoomScale;
        let nextX = Math.round(startX + dx);
        let nextY = Math.round(startY + dy);

        // Center alignment guide snapping threshold (6px)
        const snapX = Math.abs(nextX) < 6;
        const snapY = Math.abs(nextY) < 6;
        if (snapX) nextX = 0;
        if (snapY) nextY = 0;

        setIsSnappedCenterX(snapX);
        setIsSnappedCenterY(snapY);

        onUpdateClip({
          ...targetItem,
          position: { x: nextX, y: nextY },
        });
      } else if (type === "resize") {
        const deltaX = (e.clientX - startMouseX) / zoomScale;
        const deltaY = (e.clientY - startMouseY) / zoomScale;
        const factor = handle?.includes("e") || handle?.includes("s") ? 1 : -1;
        const scaleChange = ((deltaX + deltaY) / 200) * factor;
        const nextScale = Math.max(0.15, Math.min(3.5, Math.round((startScale + scaleChange) * 100) / 100));

        onUpdateClip({
          ...targetItem,
          scale: nextScale,
        });
      } else if (type === "rotate") {
        const deltaX = e.clientX - startMouseX;
        let nextRot = Math.round(startRotation + deltaX * 0.7);
        // Snap to cardinal angles (0°, 90°, 180°, -90°) within 4 degrees
        if (Math.abs(nextRot) < 4) nextRot = 0;
        else if (Math.abs(nextRot - 90) < 4) nextRot = 90;
        else if (Math.abs(nextRot + 90) < 4) nextRot = -90;
        else if (Math.abs(Math.abs(nextRot) - 180) < 4) nextRot = 180;

        onUpdateClip({
          ...targetItem,
          rotation: nextRot,
        });
      }
    }

    function handleMouseUp() {
      setTransformState(null);
      setIsSnappedCenterX(false);
      setIsSnappedCenterY(false);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [transformState, onUpdateClip, timeline.tracks, zoomScale]);

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col items-center justify-between w-full h-full p-3 overflow-hidden select-none bg-[#090A0F] ${
        isFullscreen ? "p-6" : ""
      }`}
    >
      {/* Hidden Audio Elements */}
      {voiceoverItem?.source && (
        <audio ref={voiceAudioRef} src={voiceoverItem.source} preload="auto" />
      )}
      {musicItem?.source && (
        <audio ref={musicAudioRef} src={musicItem.source} preload="auto" loop />
      )}

      {/* TOP CANVAS CONTROL BAR: Aspect, Safe Guides, Zoom, Speed */}
      <div className="w-full flex items-center justify-between px-3 py-1.5 z-30 text-xs text-slate-300">
        {/* Left: Resolution & Aspect Ratio Badge */}
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-300 font-semibold tracking-wider uppercase">
            {timeline.aspectRatio} • {timeline.resolution.width}×{timeline.resolution.height}
          </span>
          <span className="text-[10px] font-mono text-slate-400">
            {fps} FPS
          </span>
        </div>

        {/* Center: Framing & Safe Area Guides Toggle */}
        <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-lg p-0.5 text-[11px] font-mono">
          <button
            type="button"
            onClick={() => setGuidesMode((m) => (m === "off" ? "safe_areas" : m === "safe_areas" ? "social_ui" : "off"))}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
              guidesMode !== "off"
                ? "bg-blue-600 text-white font-semibold shadow-2xs"
                : "text-slate-400 hover:text-white"
            }`}
            title="Toggle Safe Area Guides (Action Safe, Title Safe, Social UI Overlay)"
          >
            {guidesMode === "social_ui" ? (
              <Smartphone className="w-3 h-3 text-white" />
            ) : guidesMode === "safe_areas" ? (
              <Shield className="w-3 h-3 text-cyan-300" />
            ) : (
              <Crosshair className="w-3 h-3 text-slate-400" />
            )}
            <span className="text-[10px]">
              {guidesMode === "off" ? "Guides: Off" : guidesMode === "safe_areas" ? "Safe 90/80" : "TikTok / Reels UI"}
            </span>
          </button>
        </div>

        {/* Right: Zoom Picker & Fullscreen */}
        <div className="flex items-center gap-2">
          {/* Zoom Selector */}
          <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-lg px-2 py-0.5 text-[11px] font-mono">
            <ZoomIn className="w-3 h-3 text-slate-400" />
            <select
              value={previewZoom}
              onChange={(e) => {
                const val = e.target.value;
                setPreviewZoom(val === "fit" ? "fit" : parseFloat(val) as PreviewZoom);
              }}
              className="bg-transparent text-slate-300 focus:outline-none cursor-pointer text-[10px]"
            >
              <option value="fit" className="bg-slate-900 text-white">Fit</option>
              <option value="0.5" className="bg-slate-900 text-white">50%</option>
              <option value="0.75" className="bg-slate-900 text-white">75%</option>
              <option value="1.0" className="bg-slate-900 text-white">100%</option>
              <option value="1.5" className="bg-slate-900 text-white">150%</option>
              <option value="2.0" className="bg-slate-900 text-white">200%</option>
            </select>
          </div>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="p-1 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Preview"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* CENTER: Video Canvas Stage */}
      <div className="flex-1 w-full flex items-center justify-center overflow-auto custom-scrollbar p-2">
        <div
          ref={previewCanvasRef}
          style={{
            transform: previewZoom !== "fit" ? `scale(${zoomScale})` : undefined,
            transformOrigin: "center center",
            transition: "transform 0.15s ease-out",
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOverPreview(true);
          }}
          onDragLeave={() => setIsDragOverPreview(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOverPreview(false);
            const dataStr = e.dataTransfer.getData("application/json");
            if (!dataStr) return;
            try {
              const data = JSON.parse(dataStr);
              if (data.type === "broll" && onDropBRoll) {
                onDropBRoll(data, currentTime, activeClip?.id);
              }
            } catch {}
          }}
          onClick={() => {
            if (activeClip && onSelectClip) onSelectClip(activeClip);
            onTogglePlay();
          }}
          className={`relative ${canvasDimensions.class} w-full bg-black rounded-2xl overflow-hidden border transition-all flex items-center justify-center cursor-pointer shadow-2xl ${
            isDragOverPreview
              ? "border-blue-500 ring-4 ring-blue-500/30"
              : "border-slate-800/80"
          }`}
        >
          {/* Main Footage Layer */}
          {activeClip ? (
            <video
              ref={videoRef}
              src={activeClip.source}
              className="w-full h-full object-cover pointer-events-none"
              playsInline
              muted
              style={{
                ...motionStyle,
                filter: visualFilterStyle || undefined,
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-6 text-center text-slate-500">
              <span className="text-3xl mb-2">🎬</span>
              <p className="text-xs font-mono">No video footage at playhead</p>
            </div>
          )}

          {/* Vignette Overlay */}
          {activeClip?.colorAdjustments?.vignette && activeClip.colorAdjustments.vignette > 0 && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${activeClip.colorAdjustments.vignette / 100}) 100%)`,
              }}
            />
          )}

          {/* Active Transition Overlay */}
          {transitionEffect && (
            <div
              className="absolute inset-0 pointer-events-none z-10 transition-all"
              style={{
                backgroundColor: transitionEffect.color || "#000000",
                opacity: transitionEffect.opacity ?? 0,
                filter: transitionEffect.blur ? `blur(${transitionEffect.blur}px)` : undefined,
                transform: transitionEffect.translateX ? `translateX(${transitionEffect.translateX}%)` : undefined,
              }}
            />
          )}

          {/* Active Image / Overlay Tracks */}
          {activeOverlays.map((ov) => {
            const isSelected = currentSelectedVisualItem?.id === ov.id;
            const posX = ov.position?.x ?? 0;
            const posY = ov.position?.y ?? 0;
            const sc = ov.scale ?? 1.0;
            const rot = ov.rotation ?? 0;

            return (
              <div
                key={ov.id}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleGizmoMouseDown(e, ov, "move");
                }}
                className={`absolute inset-0 flex items-center justify-center z-15 ${
                  isSelected ? "cursor-move" : "cursor-pointer"
                }`}
                style={{
                  opacity: ov.opacity ?? 1.0,
                  transform: `translate(${posX}px, ${posY}px) scale(${sc}) rotate(${rot}deg)`,
                }}
              >
                <img
                  src={ov.source}
                  alt="Overlay"
                  className="max-w-full max-h-full object-contain pointer-events-none"
                />

                {/* Direct Transform Bounding Box for Selected Overlay */}
                {isSelected && (
                  <div className="absolute inset-0 border-2 border-blue-500 rounded-md pointer-events-none shadow-xl">
                    {/* Top Rotation Pin */}
                    <div
                      onMouseDown={(e) => handleGizmoMouseDown(e, ov, "rotate")}
                      className="absolute -top-7 left-1/2 -translate-x-1/2 w-4 h-4 bg-blue-600 rounded-full border-2 border-white pointer-events-auto cursor-grab shadow flex items-center justify-center"
                      title="Drag to rotate"
                    >
                      <RotateCw className="w-2.5 h-2.5 text-white" />
                    </div>
                    <div className="absolute -top-4 left-1/2 w-[1px] h-4 bg-blue-500 pointer-events-none" />

                    {/* Corner Resize Handles */}
                    {["nw", "ne", "se", "sw"].map((corner) => (
                      <div
                        key={corner}
                        onMouseDown={(e) => handleGizmoMouseDown(e, ov, "resize", corner)}
                        className={`absolute w-3 h-3 bg-white border-2 border-blue-600 rounded-xs pointer-events-auto shadow-xs ${
                          corner === "nw" ? "-top-1.5 -left-1.5 cursor-nwse-resize" :
                          corner === "ne" ? "-top-1.5 -right-1.5 cursor-nesw-resize" :
                          corner === "se" ? "-bottom-1.5 -right-1.5 cursor-nwse-resize" :
                          "-bottom-1.5 -left-1.5 cursor-nesw-resize"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Interactive Text Tracks (Titles, Callouts, Lower-Thirds) */}
          {activeTextItems.map((textItem) => {
            const isEditing = editingTextId === textItem.id;
            const isSelected = currentSelectedVisualItem?.id === textItem.id;
            const style = textItem.textStyle || {
              fontFamily: "Inter",
              fontSize: 32,
              fontWeight: 700,
              color: "#FFFFFF",
              textAlign: "center",
            };

            const posX = textItem.position?.x ?? 0;
            const posY = textItem.position?.y ?? 0;
            const sc = textItem.scale ?? 1.0;
            const rot = textItem.rotation ?? 0;

            return (
              <div
                key={textItem.id}
                onMouseDown={(e) => handleGizmoMouseDown(e, textItem, "move")}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingTextId(textItem.id);
                }}
                className={`absolute z-25 cursor-move group select-none transition-shadow ${
                  isSelected ? "ring-2 ring-blue-500 rounded-lg shadow-xl" : "hover:ring-1 hover:ring-white/40 rounded-lg"
                }`}
                style={{
                  transform: `translate(${posX}px, ${posY}px) scale(${sc}) rotate(${rot}deg)`,
                  fontFamily: style.fontFamily,
                  fontSize: `${style.fontSize}px`,
                  fontWeight: style.fontWeight,
                  color: style.color,
                  textAlign: style.textAlign,
                  letterSpacing: style.letterSpacing ? `${style.letterSpacing}px` : undefined,
                  lineHeight: style.lineHeight ? `${style.lineHeight}` : undefined,
                  WebkitTextStroke: style.outlineWidth ? `${style.outlineWidth}px ${style.outlineColor || "#000"}` : undefined,
                  textShadow: style.shadowBlur ? `0px 4px ${style.shadowBlur}px ${style.shadowColor || "rgba(0,0,0,0.8)"}` : undefined,
                  backgroundColor: style.backgroundColor || "transparent",
                  padding: style.backgroundPadding ? `${style.backgroundPadding}px` : "4px 8px",
                  borderRadius: "8px",
                }}
              >
                {isEditing ? (
                  <input
                    type="text"
                    value={textItem.source}
                    autoFocus
                    onChange={(e) => {
                      if (onUpdateClip) {
                        onUpdateClip({ ...textItem, source: e.target.value });
                      }
                    }}
                    onBlur={() => setEditingTextId(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setEditingTextId(null);
                    }}
                    className="bg-black/60 text-white border border-blue-500 rounded px-1 outline-none text-center"
                    style={{ fontSize: "inherit", fontFamily: "inherit" }}
                  />
                ) : (
                  <span>{textItem.source}</span>
                )}

                {/* Direct Transform Handles when Selected */}
                {isSelected && (
                  <>
                    {/* Top Rotation Pin */}
                    <div
                      onMouseDown={(e) => handleGizmoMouseDown(e, textItem, "rotate")}
                      className="absolute -top-7 left-1/2 -translate-x-1/2 w-4 h-4 bg-blue-600 rounded-full border-2 border-white pointer-events-auto cursor-grab shadow flex items-center justify-center z-30"
                      title="Drag to rotate"
                    >
                      <RotateCw className="w-2.5 h-2.5 text-white" />
                    </div>
                    <div className="absolute -top-4 left-1/2 w-[1px] h-4 bg-blue-500 pointer-events-none" />

                    {/* Corner Resize Handles */}
                    {["nw", "ne", "se", "sw"].map((corner) => (
                      <div
                        key={corner}
                        onMouseDown={(e) => handleGizmoMouseDown(e, textItem, "resize", corner)}
                        className={`absolute w-2.5 h-2.5 bg-white border border-blue-600 rounded-xs pointer-events-auto shadow-xs z-30 ${
                          corner === "nw" ? "-top-1 -left-1 cursor-nwse-resize" :
                          corner === "ne" ? "-top-1 -right-1 cursor-nesw-resize" :
                          corner === "se" ? "-bottom-1 -right-1 cursor-nwse-resize" :
                          "-bottom-1 -left-1 cursor-nesw-resize"
                        }`}
                      />
                    ))}
                  </>
                )}
              </div>
            );
          })}

          {/* Dynamic Kinetic Captions Layer */}
          {activeCaption && (
            <div
              className={`absolute left-4 right-4 ${captionPositionClass} flex items-center justify-center pointer-events-none z-20`}
              style={
                activeCaptionTemplate.style.position === "custom" &&
                activeCaptionTemplate.style.positionYPercent !== undefined
                  ? {
                      top: `${activeCaptionTemplate.style.positionYPercent}%`,
                      transform: "translateY(-50%)",
                    }
                  : undefined
              }
            >
              <CaptionRenderer
                text={activeCaption.source || ""}
                words={activeCaption.metadata?.captionSegment?.words || []}
                currentTime={currentTime}
                style={activeCaptionTemplate.style}
                scaleMultiplier={0.88}
              />
            </div>
          )}

          {/* CENTER CROSSHAIRS (Visual Snap Guidelines) */}
          {isSnappedCenterX && (
            <div className="absolute top-0 bottom-0 left-1/2 w-[1.5px] bg-cyan-400 pointer-events-none z-35 shadow-sm" />
          )}
          {isSnappedCenterY && (
            <div className="absolute left-0 right-0 top-1/2 h-[1.5px] bg-cyan-400 pointer-events-none z-35 shadow-sm" />
          )}

          {/* SAFE AREA GUIDES OVERLAY (Action Safe 90% & Title Safe 80%) */}
          {guidesMode === "safe_areas" && (
            <div className="absolute inset-0 pointer-events-none z-35 flex items-center justify-center">
              {/* Action Safe (90%) */}
              <div className="w-[90%] h-[90%] border border-dashed border-cyan-400/80 rounded-lg relative flex items-start justify-start p-1.5">
                <span className="text-[8px] font-mono text-cyan-300 font-bold bg-black/60 px-1 py-0.5 rounded">
                  Action Safe (90%)
                </span>
                {/* Title Safe (80%) */}
                <div className="absolute inset-[5.5%] border border-dashed border-amber-400/80 rounded-md flex items-end justify-end p-1.5">
                  <span className="text-[8px] font-mono text-amber-300 font-bold bg-black/60 px-1 py-0.5 rounded">
                    Title Safe (80%)
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TIKTOK / REELS SOCIAL MEDIA UI SIMULATOR */}
          {guidesMode === "social_ui" && (
            <div className="absolute inset-0 pointer-events-none z-35 flex flex-col justify-between p-3 bg-black/10 text-white select-none">
              {/* Top Bar (Search + Following / For You) */}
              <div className="flex items-center justify-between text-[11px] font-bold text-white/90 drop-shadow">
                <span>Following</span>
                <span className="border-b-2 border-white pb-0.5">For You</span>
                <span>🔍</span>
              </div>

              {/* Bottom & Right Rails */}
              <div className="flex items-end justify-between w-full">
                {/* Bottom Left: Handle & Caption Space */}
                <div className="space-y-1 max-w-[65%] text-[10px] text-white/90 drop-shadow">
                  <span className="font-bold">@creator_handle</span>
                  <p className="text-[9px] line-clamp-2 text-white/80">
                    Kinetic short-form editing made effortless with Kreovar AI. #viral #editing
                  </p>
                  <div className="flex items-center gap-1 text-[8px] text-white/70">
                    <span>🎵</span>
                    <span className="truncate">Original Sound - Kreovar Audio</span>
                  </div>
                </div>

                {/* Right Rail: Profile, Like, Comment, Bookmark, Share */}
                <div className="flex flex-col items-center gap-2.5 text-white/90">
                  <div className="w-7 h-7 rounded-full bg-slate-300 border border-white flex items-center justify-center text-[10px] text-slate-900 font-bold">
                    V
                  </div>
                  <div className="flex flex-col items-center">
                    <Heart className="w-5 h-5 fill-white/80" />
                    <span className="text-[8px] font-mono">148K</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <MessageCircle className="w-5 h-5 fill-white/80" />
                    <span className="text-[8px] font-mono">2.1K</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <Bookmark className="w-5 h-5 fill-white/80" />
                    <span className="text-[8px] font-mono">18K</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <Share2 className="w-5 h-5" />
                    <span className="text-[8px] font-mono">9.4K</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Drag-over Drop Indicator Overlay */}
          {isDragOverPreview && (
            <div className="absolute inset-0 bg-blue-950/75 backdrop-blur-xs border-2 border-dashed border-blue-400 rounded-2xl flex flex-col items-center justify-center p-4 z-40 pointer-events-none">
              <span className="text-3xl mb-2 animate-bounce">🎬</span>
              <span className="text-xs font-bold text-white">Drop B-Roll to Apply</span>
              <span className="text-[10px] font-mono text-blue-200 mt-1">
                Replaces footage at current playhead
              </span>
            </div>
          )}

          {/* Play Icon Overlay on Pause */}
          {!isPlaying && !isDragOverPreview && (
            <div className="absolute inset-0 bg-black/25 flex items-center justify-center cursor-pointer pointer-events-none">
              <div className="w-12 h-12 rounded-full bg-white/95 text-slate-950 flex items-center justify-center shadow-2xl pl-0.5 transition-transform hover:scale-110">
                <Play className="w-5 h-5 fill-current" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM: Professional Transport Bar */}
      <div className="w-full max-w-xl flex items-center justify-between gap-3 px-4 py-2 rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl backdrop-blur-md text-white z-30 shrink-0">
        {/* Frame Step Backward (-1 frame & -1s) */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onSeek(Math.max(0, currentTime - 1))}
            className="px-1.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono cursor-pointer transition-colors"
            title="Step back 1 second"
          >
            -1s
          </button>
          <button
            type="button"
            onClick={() => handleStepFrame(-1)}
            className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer transition-colors"
            title={`Step back 1 frame (-${(frameTime * 1000).toFixed(0)}ms)`}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Center: Play/Pause Button & Timecode */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onTogglePlay}
            className="w-9 h-9 rounded-lg bg-white hover:bg-slate-200 text-slate-950 flex items-center justify-center transition-all cursor-pointer shadow-md"
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          {/* Timecode display */}
          <span className="text-xs font-mono text-slate-200 font-semibold tracking-wider">
            {formatTimecode(currentTime)} <span className="text-slate-500 font-normal">/</span> {formatTimecode(totalDuration)}
          </span>
        </div>

        {/* Frame Step Forward (+1 frame & +1s) */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleStepFrame(1)}
            className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer transition-colors"
            title={`Step forward 1 frame (+${(frameTime * 1000).toFixed(0)}ms)`}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onSeek(Math.min(totalDuration, currentTime + 1))}
            className="px-1.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono cursor-pointer transition-colors"
            title="Step forward 1 second"
          >
            +1s
          </button>
        </div>

        <div className="h-4 w-px bg-slate-800" />

        {/* Playback Speed dropdown */}
        <div className="flex items-center gap-1">
          {onChangePlaybackSpeed && (
            <select
              value={playbackSpeed}
              onChange={(e) => onChangePlaybackSpeed(parseFloat(e.target.value))}
              className="bg-slate-800 text-slate-300 border border-slate-700 rounded-md px-1.5 py-0.5 text-[10px] font-mono cursor-pointer focus:outline-none"
              title="Playback Rate"
            >
              <option value="0.25">0.25x</option>
              <option value="0.5">0.5x</option>
              <option value="1">1.0x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2.0x</option>
            </select>
          )}

          {/* Loop toggle */}
          <button
            type="button"
            onClick={() => setIsLooping((l) => !l)}
            className={`p-1 rounded-md transition-colors cursor-pointer text-[10px] font-mono ${
              isLooping ? "bg-blue-600 text-white font-bold" : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
            title="Toggle Looping"
          >
            Loop
          </button>
        </div>
      </div>
    </div>
  );
}
