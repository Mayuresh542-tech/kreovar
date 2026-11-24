"use client";

import React, { memo, useRef, useState, useEffect, useCallback, useMemo } from "react";
import {
  Scissors,
  Trash2,
  Copy,
  Bookmark,
  Magnet,
  Anchor,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  Lock,
  Unlock,
  Film,
  Music,
  Type,
  Captions as CaptionsIcon,
  Layers,
  Sparkles,
  Plus,
} from "lucide-react";
import {
  Clip,
  MediaAsset,
  Track,
  TrackKind,
  formatTime,
  projectDuration,
} from "@/app/lib/editor/model";
import {
  addClip,
  addTrack,
  changeTrack,
  duplicateClip,
  moveClip,
  removeClip,
  snapTime,
  splitClip,
  trimClip,
} from "@/app/lib/editor/operations";
import { usePlayback, useProject } from "@/app/lib/editor/store";
import { pointerEdit } from "@/app/lib/editor/interaction";
import { zoomAnchor } from "@/app/lib/editor/timelineNavigation";
import {
  extractAudioPeaks,
  sliceWaveformPeaks,
  waveformCache,
} from "@/app/lib/editor/audioWaveform";
import { useEditor } from "./workspace/EditorContext";
import Scrubber from "./Scrubber";

interface TrackStyleInfo {
  chipBg: string;
  chipBorder: string;
  chipText: string;
  clipBg: string;
  clipBorder: string;
  clipText: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

/** CapCut Desktop Dark Studio track themes (Uniform professional neutral palette) */
const TRACK_STYLES: Record<string, TrackStyleInfo> = {
  overlay: {
    chipBg: "bg-[#222226]",
    chipBorder: "border-[#2E2E33]",
    chipText: "text-white",
    clipBg: "bg-[#25252b] hover:bg-[#2e2e36]",
    clipBorder: "border-[#383842]",
    clipText: "text-white",
    label: "Overlay / B-Roll",
    icon: Layers,
  },
  caption: {
    chipBg: "bg-[#222226]",
    chipBorder: "border-[#2E2E33]",
    chipText: "text-white",
    clipBg: "bg-[#25252b] hover:bg-[#2e2e36]",
    clipBorder: "border-[#383842]",
    clipText: "text-white",
    label: "Captions",
    icon: CaptionsIcon,
  },
  video: {
    chipBg: "bg-[#222226]",
    chipBorder: "border-[#2E2E33]",
    chipText: "text-white",
    clipBg: "bg-[#1E2638] hover:bg-[#242F45]",
    clipBorder: "border-[#2E3A52]",
    clipText: "text-white",
    label: "Main Video",
    icon: Film,
  },
  text: {
    chipBg: "bg-[#222226]",
    chipBorder: "border-[#2E2E33]",
    chipText: "text-white",
    clipBg: "bg-[#25252b] hover:bg-[#2e2e36]",
    clipBorder: "border-[#383842]",
    clipText: "text-white",
    label: "Titles & GFX",
    icon: Type,
  },
  audio: {
    chipBg: "bg-[#222226]",
    chipBorder: "border-[#2E2E33]",
    chipText: "text-white",
    clipBg: "bg-[#162923] hover:bg-[#1E362E]",
    clipBorder: "border-[#1E3A30]",
    clipText: "text-white",
    label: "Audio / SFX",
    icon: Music,
  },
  image: {
    chipBg: "bg-[#222226]",
    chipBorder: "border-[#2E2E33]",
    chipText: "text-white",
    clipBg: "bg-[#25252b] hover:bg-[#2e2e36]",
    clipBorder: "border-[#383842]",
    clipText: "text-white",
    label: "Images",
    icon: Film,
  },
};

/** Render artwork, real audio waveforms, or typography preview inside clip */
const ClipContent = memo(function ClipContent({
  clip,
  asset,
  trackKind,
  width,
}: {
  clip: Clip;
  asset?: MediaAsset;
  trackKind: TrackKind;
  width: number;
}) {
  // Real waveform rendering for audio tracks or audio-bearing clips
  if (trackKind === "audio" || asset?.kind === "audio" || (asset?.kind === "video" && asset.waveform)) {
    const cached =
      (asset?.url ? waveformCache.get(asset.url) : undefined) ||
      (asset?.id ? waveformCache.get(asset.id) : undefined) ||
      (asset?.waveform ? new Float32Array(asset.waveform) : undefined);

    if (cached && cached.length > 0) {
      const barCount = Math.max(8, Math.min(160, Math.floor(width / 4)));
      const sliced = sliceWaveformPeaks(
        cached,
        clip.sourceStart,
        clip.sourceEnd,
        asset?.duration || clip.duration || 1,
        barCount
      );

      return (
        <div className="absolute inset-0 flex items-center justify-between px-1 pointer-events-none opacity-85 overflow-hidden">
          {Array.from({ length: barCount }).map((_, i) => {
            const peak = sliced[i] ?? 0.2;
            const barHeight = Math.max(10, Math.min(94, Math.round(peak * 84 + 10)));
            return (
              <div
                key={i}
                className="w-[2px] rounded-full bg-[#10B981] shadow-[0_0_2px_rgba(16,185,129,0.5)]"
                style={{ height: `${barHeight}%` }}
              />
            );
          })}
        </div>
      );
    }

    // High-fidelity fallback audio waveform bars with source temporal variation
    const count = Math.max(8, Math.min(100, Math.floor(width / 5)));
    return (
      <div className="absolute inset-0 flex items-center justify-between px-1 pointer-events-none opacity-60 overflow-hidden">
        {Array.from({ length: count }).map((_, i) => {
          const t = clip.sourceStart + (i / count) * (clip.sourceEnd - clip.sourceStart);
          const pseudoPeak = Math.sin(t * 14.5) * 0.4 + Math.cos(t * 26.3) * 0.35 + 0.45;
          const barHeight = Math.max(14, Math.min(90, Math.round(Math.abs(pseudoPeak) * 75 + 14)));
          return (
            <div
              key={i}
              className="w-[2px] rounded-full bg-[#10B981]"
              style={{ height: `${barHeight}%` }}
            />
          );
        })}
      </div>
    );
  }

  // Video Filmstrip Thumbnails
  if (asset?.thumbnail) {
    const frames = asset.thumbnails || [asset.thumbnail];
    const count = Math.min(16, Math.max(1, Math.ceil(width / 80)));
    return (
      <div className="absolute inset-0 flex overflow-hidden opacity-30 pointer-events-none">
        {Array.from({ length: count }, (_, i) => (
          <img
            key={i}
            src={frames[i % frames.length]}
            alt=""
            className="h-full object-cover flex-1"
            draggable={false}
          />
        ))}
      </div>
    );
  }

  return null;
});

export interface TimelinePanelProps {
  height?: number;
}

export default function TimelinePanel({ height = 300 }: TimelinePanelProps) {
  const { store, playback, selection, select, run, notify, detectedSilences = [] } = useEditor();
  const project = useProject(store);
  const { time, playing } = usePlayback(playback);

  const [pps, setPps] = useState(60); // Pixels per second
  const [snapping, setSnapping] = useState(true);
  const [isMagnetEnabled, setIsMagnetEnabled] = useState(true);
  const [markers, setMarkers] = useState<number[]>([]);
  const [viewport, setViewport] = useState({ left: 0, width: 1200 });

  const scrollerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);

  // Synchronize scroll and viewport measurements
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => setViewport({ left: el.scrollLeft, width: el.clientWidth });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();
    return () => observer.disconnect();
  }, []);

  // Preload & extract real waveform peaks for any audio/video assets in project
  useEffect(() => {
    for (const asset of Object.values(project.assets)) {
      if ((asset.kind === "audio" || asset.kind === "video") && asset.url) {
        if (!waveformCache.has(asset.url)) {
          extractAudioPeaks(asset.url).catch(() => {});
        }
      }
    }
  }, [project.assets]);

  const duration = projectDuration(project);
  const minWidth = Math.max(viewport.width, (duration + 12) * pps);

  // Professional ordered display of tracks according to spec:
  // 1. overlay (B-roll & PiP)
  // 2. caption (Kinetic typography)
  // 3. video (Main A-roll)
  // 4. text (Titles & graphics)
  // 5. audio (SFX & music)
  const orderedTrackIds = useMemo(() => {
    const priority: Record<string, number> = {
      overlay: 1,
      caption: 2,
      video: 3,
      text: 4,
      audio: 5,
      image: 6,
    };
    return [...project.trackOrder].sort((a, b) => {
      const kindA = project.tracks[a]?.kind || "";
      const kindB = project.tracks[b]?.kind || "";
      const scoreA = priority[kindA] ?? 10;
      const scoreB = priority[kindB] ?? 10;
      return scoreA - scoreB;
    });
  }, [project.trackOrder, project.tracks]);

  // Timeline zoom handling with playback anchor
  const zoom = useCallback(
    (nextPps: number) => {
      const clamped = Math.max(12, Math.min(240, nextPps));
      const el = scrollerRef.current;
      if (!el) return;
      const left = zoomAnchor(pps, clamped, el.scrollLeft, el.clientWidth, playback.getSnapshot().time);
      setPps(clamped);
      requestAnimationFrame(() => {
        if (scrollerRef.current) scrollerRef.current.scrollLeft = left;
      });
    },
    [pps, playback]
  );

  const fitTimeline = useCallback(() => {
    const target = Math.max(12, Math.min(200, (viewport.width - 60) / Math.max(duration, 1)));
    setPps(target);
    if (scrollerRef.current) scrollerRef.current.scrollLeft = 0;
  }, [duration, viewport.width]);

  // Toggle Marker
  const handleToggleMarker = useCallback(() => {
    const curTime = playback.getSnapshot().time;
    setMarkers((prev) => {
      const exists = prev.some((m) => Math.abs(m - curTime) < 0.15);
      if (exists) {
        notify(`Removed marker at ${formatTime(curTime, project.settings.fps)}`);
        return prev.filter((m) => Math.abs(m - curTime) >= 0.15);
      }
      notify(`Added CapCut marker at ${formatTime(curTime, project.settings.fps)}`);
      return [...prev, curTime].sort((a, b) => a - b);
    });
  }, [playback, project.settings.fps, notify]);

  // Global Timeline Keyboard Shortcuts via Custom Events
  useEffect(() => {
    const handleToggleSnapping = () => setSnapping((s) => !s);
    const handleFit = () => fitTimeline();
    const handleZoomEvent = (e: Event) => {
      const customEvent = e as CustomEvent<"in" | "out">;
      if (customEvent.detail === "in") {
        zoom(pps * 1.3);
      } else {
        zoom(pps / 1.3);
      }
    };

    window.addEventListener("veelox:toggle-snapping", handleToggleSnapping);
    window.addEventListener("veelox:fit-timeline", handleFit);
    window.addEventListener("veelox:timeline-zoom", handleZoomEvent);

    return () => {
      window.removeEventListener("veelox:toggle-snapping", handleToggleSnapping);
      window.removeEventListener("veelox:fit-timeline", handleFit);
      window.removeEventListener("veelox:timeline-zoom", handleZoomEvent);
    };
  }, [fitTimeline, pps, zoom]);

  // Ruler tick calculation
  const tickStep = pps < 25 ? 10 : pps < 50 ? 5 : pps < 100 ? 2 : 1;
  const startTick = Math.max(0, Math.floor(viewport.left / pps / tickStep) - 1);
  const endTick = Math.ceil((viewport.left + viewport.width) / pps / tickStep) + 2;

  // Ruler seek handler
  const handleSeek = (event: React.PointerEvent) => {
    event.preventDefault();
    const rect = bodyRef.current?.getBoundingClientRect();
    if (!rect) return;
    const update = (e: { clientX: number }) => {
      const targetTime = Math.min(
        duration,
        Math.max(0, (e.clientX - rect.left) / pps)
      );
      playback.set(targetTime, false);
    };
    update(event);
    const move = (e: PointerEvent) => update(e);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", up, { once: true });
  };

  // Clip drag & trim gestures
  const handleClipDrag = (
    event: React.PointerEvent,
    clip: Clip,
    edge?: "left" | "right"
  ) => {
    event.preventDefault();
    event.stopPropagation();

    let ids = selection.includes(clip.id) ? selection : [clip.id];
    if (event.shiftKey && !edge) {
      ids = selection.includes(clip.id)
        ? selection.filter((id) => id !== clip.id)
        : [...selection, clip.id];
      select(ids);
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      select(selection.includes(clip.id) ? selection.filter((id) => id !== clip.id) : [...selection, clip.id]);
      return;
    }
    select(ids);

    if (project.tracks[clip.trackId]?.locked) {
      notify("Unlock this track before moving clips.");
      return;
    }

    playback.set(playback.getSnapshot().time, false);
    const startX = event.clientX;
    const startScroll = scrollerRef.current?.scrollLeft || 0;
    const base = store.getSnapshot();
    const playhead = playback.getSnapshot().time;
    const minStart = Math.min(...ids.map((id) => base.clips[id]?.startTime ?? 0));

    pointerEdit(
      store,
      (e) => (p) => {
        const scroll = scrollerRef.current;
        if (scroll) {
          const rect = scroll.getBoundingClientRect();
          if (e.clientX < rect.left + 28) scroll.scrollLeft -= 14;
          else if (e.clientX > rect.right - 28) scroll.scrollLeft += 14;
        }
        const delta = (e.clientX - startX + (scroll?.scrollLeft || 0) - startScroll) / pps;
        if (edge) {
          let t = (edge === "left" ? clip.startTime : clip.startTime + clip.duration) + delta;
          if (snapping) t = snapTime(base, t, [clip.id], playhead, pps);
          return trimClip(p, clip.id, edge, t);
        }
        let start = clip.startTime + Math.max(-minStart, delta);
        if (snapping) start = snapTime(base, start, ids, playhead, pps, clip.duration);
        const diff = Math.max(-minStart, start - clip.startTime);
        const target = (
          document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-track]") as HTMLElement | undefined
        )?.dataset.track;
        return ids.reduce(
          (next, id) =>
            moveClip(
              next,
              id,
              base.clips[id].startTime + diff,
              ids.length === 1 ? target : undefined
            ),
          p
        );
      },
      notify
    );
  };

  // Split selected or clips under playhead
  const handleSplit = () => {
    const curTime = playback.getSnapshot().time;
    const targets = (selection.length ? selection : Object.keys(project.clips)).filter((id) => {
      const c = project.clips[id];
      return (
        c &&
        !project.tracks[c.trackId]?.locked &&
        curTime > c.startTime + 1 / project.settings.fps &&
        curTime < c.startTime + c.duration - 1 / project.settings.fps
      );
    });
    if (!targets.length) {
      notify("Move playhead over an unlocked clip to split.");
      return;
    }
    run((p) => targets.reduce((next, id) => splitClip(next, id, curTime), p));
  };

  const handleDelete = () => {
    if (!selection.length) return;
    run((p) => selection.reduce((next, id) => removeClip(next, id), p));
    select([]);
  };

  const handleDuplicate = () => {
    if (!selection.length) return;
    run((p) => selection.reduce((next, id) => duplicateClip(next, id), p));
  };

  // Drop asset from library onto track
  const handleDropAsset = (event: React.DragEvent, track: Track) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/veelox-asset");
    if (!raw) return;
    let assetId = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.assetId) {
        assetId = parsed.assetId;
      }
    } catch {}
    const rect = bodyRef.current?.getBoundingClientRect();
    if (!rect) return;
    let targetTime = Math.max(0, (event.clientX - rect.left) / pps);
    if (snapping) {
      targetTime = snapTime(project, targetTime, [], playback.getSnapshot().time, pps);
    }
    run((p) => addClip(p, assetId, track.id, targetTime));
  };

  const trackLanesHeight = orderedTrackIds.length * 56 + 28;

  return (
    <section
      className="w-full bg-[#18181C] border-t border-[#2E2E33] flex flex-col select-none text-white overflow-hidden"
      style={{ height: `${height}px` }}
      aria-label="Multi-Track Workstation Timeline"
    >
      {/* ========================================================================= */}
      {/* 1. TIMELINE TOOLBAR (CapCut Desktop Action Strip)                         */}
      {/* ========================================================================= */}
      <header className="h-10 px-3 flex items-center justify-between border-b border-[#2E2E33] bg-[#18181C] text-xs flex-shrink-0 text-white">
        {/* Left Action Strip: Split, Delete, Duplicate, Marker, Magnet, Snap */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="flex items-center gap-1.5 font-semibold text-white mr-1.5">
            <span className="text-[12px] tracking-tight">Timeline</span>
            {selection.length > 0 && (
              <span className="text-[10px] bg-[#222226] text-white border border-[#2E2E33] px-1.5 py-0.2 rounded-full font-mono">
                {selection.length} selected
              </span>
            )}
          </div>

          <div className="h-4 w-[1px] bg-[#2E2E33] mx-1" />

          {/* Split (Scissors) */}
          <button
            onClick={handleSplit}
            title="Split at Playhead (Ctrl+B / S)"
            aria-label="Split at Playhead"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#222226] hover:bg-[#2A2A30] text-white border border-[#2E2E33] transition-colors cursor-pointer text-xs"
          >
            <Scissors size={13} className="text-[#A0A0A8]" />
            <span className="text-[11px] font-medium hidden sm:inline">Split</span>
          </button>

          {/* Delete (Trash) */}
          <button
            onClick={handleDelete}
            disabled={!selection.length}
            title="Delete Selected Clip (Delete / Backspace)"
            aria-label="Delete Selected Clip"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#222226] hover:bg-rose-950/60 text-white hover:text-rose-400 border border-[#2E2E33] hover:border-rose-800 transition-colors disabled:opacity-30 disabled:hover:bg-[#222226] disabled:hover:text-white cursor-pointer text-xs"
          >
            <Trash2 size={13} className="text-[#A0A0A8]" />
            <span className="text-[11px] font-medium hidden sm:inline">Delete</span>
          </button>

          {/* Duplicate */}
          <button
            onClick={handleDuplicate}
            disabled={!selection.length}
            title="Duplicate Selected Clip (Ctrl+D)"
            aria-label="Duplicate Selected Clip"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#222226] hover:bg-[#2A2A30] text-white border border-[#2E2E33] transition-colors disabled:opacity-30 disabled:hover:bg-[#222226] cursor-pointer text-xs"
          >
            <Copy size={13} className="text-[#A0A0A8]" />
            <span className="text-[11px] font-medium hidden sm:inline">Duplicate</span>
          </button>

          {/* Marker */}
          <button
            onClick={handleToggleMarker}
            title="Add CapCut Marker at Playhead (M)"
            aria-label="Add Timeline Marker"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#222226] hover:bg-[#2A2A30] text-white border border-[#2E2E33] transition-colors cursor-pointer text-xs"
          >
            <Bookmark size={13} className="text-[#A0A0A8]" />
            <span className="text-[11px] font-medium hidden sm:inline">Marker</span>
          </button>

          <div className="h-4 w-[1px] bg-[#2E2E33] mx-1" />

          {/* Main Storyline Magnet Toggle */}
          <button
            onClick={() => {
              setIsMagnetEnabled(!isMagnetEnabled);
              notify(isMagnetEnabled ? "Main Storyline Magnet disabled (gap placement)." : "Main Storyline Magnet enabled (auto-ripple).");
            }}
            title="Main Storyline Magnet — Auto ripple & gap closure"
            aria-pressed={isMagnetEnabled}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs transition-colors cursor-pointer ${
              isMagnetEnabled
                ? "bg-[#2E2E33] border-[#3E3E45] text-white font-semibold"
                : "bg-[#222226] border-[#2E2E33] text-[#A0A0A8] hover:text-white hover:bg-[#2A2A30]"
            }`}
          >
            <Magnet size={13} className={isMagnetEnabled ? "text-white" : "text-[#A0A0A8]"} />
            <span className="text-[11px] hidden md:inline">Magnet</span>
          </button>

          {/* Auto-Snapping Toggle (N) */}
          <button
            onClick={() => setSnapping(!snapping)}
            title="Auto-Snapping (N)"
            aria-pressed={snapping}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs transition-colors cursor-pointer ${
              snapping
                ? "bg-[#2E2E33] border-[#3E3E45] text-white font-semibold"
                : "bg-[#222226] border-[#2E2E33] text-[#A0A0A8] hover:text-white hover:bg-[#2A2A30]"
            }`}
          >
            <Anchor size={13} className={snapping ? "text-white" : "text-[#A0A0A8]"} />
            <span className="text-[11px] hidden md:inline">Snap</span>
          </button>

          {/* Add Track Menu */}
          <div className="relative flex items-center ml-1">
            <label className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#222226] hover:bg-[#2A2A30] text-white border border-[#2E2E33] cursor-pointer transition-colors text-[11px]">
              <Plus size={13} className="text-[#A0A0A8]" />
              <span className="hidden sm:inline">Track</span>
              <select
                aria-label="Add track to timeline"
                value=""
                className="opacity-0 absolute inset-0 cursor-pointer"
                onChange={(e) => {
                  if (e.target.value) {
                    run((p) => addTrack(p, e.target.value as TrackKind));
                  }
                }}
              >
                <option value="" disabled className="bg-[#18181C] text-white">
                  + Add Track
                </option>
                <option value="overlay" className="bg-white text-slate-800">Overlay / B-Roll</option>
                <option value="caption" className="bg-white text-slate-800">Captions</option>
                <option value="video" className="bg-white text-slate-800">Main Video</option>
                <option value="text" className="bg-white text-slate-800">Titles &amp; Text</option>
                <option value="audio" className="bg-white text-slate-800">Audio / SFX</option>
              </select>
            </label>
          </div>
        </div>

        {/* Right Action Strip: Timeline Zoom Slider & Fit to Screen (Shift+Z) */}
        <div className="flex items-center gap-2.5">
          {/* Timeline Zoom Slider */}
          <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-lg">
            <button
              onClick={() => zoom(pps / 1.3)}
              title="Zoom Out (-)"
              aria-label="Zoom Out"
              className="p-1 hover:text-slate-900 text-slate-500 transition-colors cursor-pointer"
            >
              <ZoomOut size={13} />
            </button>
            <input
              type="range"
              min={12}
              max={240}
              value={pps}
              onChange={(e) => zoom(Number(e.target.value))}
              aria-label="Timeline zoom scale"
              className="w-16 sm:w-20 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
            />
            <button
              onClick={() => zoom(pps * 1.3)}
              title="Zoom In (+)"
              aria-label="Zoom In"
              className="p-1 hover:text-slate-900 text-slate-500 transition-colors cursor-pointer"
            >
              <ZoomIn size={13} />
            </button>
            <button
              onClick={fitTimeline}
              title="Fit to Screen (Shift+Z / F)"
              aria-label="Fit to Screen"
              className="flex items-center gap-1 text-[10px] uppercase font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded transition-colors cursor-pointer shadow-2xs"
            >
              <Maximize2 size={10} />
              <span>Fit</span>
            </button>
          </div>

          <div className="text-[11px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 hidden sm:block">
            {project.settings.fps} FPS
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. TRACK HEADERS (MUTE, HIDE, LOCK) + TIMELINE LANES & WAVEFORMS         */}
      {/* ========================================================================= */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden bg-[#121214]">
        {/* Fixed Left Track Headers Column (Width: 195px) */}
        <div
          ref={labelsRef}
          className="w-[195px] flex-shrink-0 bg-[#18181C] border-r border-[#2E2E33] flex flex-col z-20 select-none overflow-hidden"
        >
          {/* Header ruler title spacer */}
          <div className="h-7 border-b border-[#2E2E33] bg-[#141416] px-3 flex items-center justify-between text-[10px] font-mono tracking-wider text-[#A0A0A8]">
            <span>TRACKS</span>
            <span className="text-white font-mono font-semibold">{formatTime(time, project.settings.fps)}</span>
          </div>

          {/* List of track headers with Mute, Hide, Lock */}
          <div className="flex-1 flex flex-col divide-y divide-[#222226]">
            {orderedTrackIds.map((id) => {
              const track = project.tracks[id];
              if (!track) return null;
              const style = TRACK_STYLES[track.kind] || TRACK_STYLES.video;
              const Icon = style.icon;

              return (
                <div
                  key={id}
                  className="h-[56px] shrink-0 px-2.5 flex items-center justify-between bg-[#18181C] hover:bg-[#202024] transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Track Accent Chip */}
                    <div
                      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-medium ${style.chipBg} ${style.chipBorder} ${style.chipText}`}
                    >
                      <Icon size={12} className="text-[#A0A0A8]" />
                      <span className="truncate max-w-[70px] text-white font-medium">{track.name || style.label}</span>
                    </div>
                  </div>

                  {/* Track Controls: Hide, Mute, Lock */}
                  <div className="flex items-center gap-1 text-[#A0A0A8]">
                    {/* Hide Track Toggle */}
                    <button
                      onClick={() =>
                        run((p) => changeTrack(p, id, { hidden: !track.hidden }))
                      }
                      title={track.hidden ? "Show Track" : "Hide Track"}
                      className={`p-1 rounded-md transition-colors cursor-pointer ${
                        track.hidden
                          ? "bg-[#2E2E33] text-white border border-[#3E3E45]"
                          : "hover:bg-[#222226] hover:text-white"
                      }`}
                    >
                      {track.hidden ? <EyeOff size={13} className="text-white" /> : <Eye size={13} />}
                    </button>

                    {/* Mute Track Toggle */}
                    <button
                      onClick={() =>
                        run((p) => changeTrack(p, id, { muted: !track.muted }))
                      }
                      title={track.muted ? "Unmute Track" : "Mute Track"}
                      className={`p-1 rounded-md transition-colors cursor-pointer ${
                        track.muted
                          ? "bg-rose-950/80 text-rose-400 border border-rose-800"
                          : "hover:bg-[#222226] hover:text-white"
                      }`}
                    >
                      {track.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                    </button>

                    {/* Lock Track Toggle */}
                    <button
                      onClick={() =>
                        run((p) => changeTrack(p, id, { locked: !track.locked }))
                      }
                      title={track.locked ? "Unlock Track" : "Lock Track"}
                      className={`p-1 rounded-md transition-colors cursor-pointer ${
                        track.locked
                          ? "bg-amber-950/80 text-amber-400 border border-amber-800"
                          : "hover:bg-[#222226] hover:text-white"
                      }`}
                    >
                      {track.locked ? <Lock size={13} /> : <Unlock size={13} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scrollable Timeline Grid & Tracks Area */}
        <div
          ref={scrollerRef}
          onScroll={(e) => {
            if (labelsRef.current) {
              labelsRef.current.scrollTop = e.currentTarget.scrollTop;
            }
            setViewport({
              left: e.currentTarget.scrollLeft,
              width: e.currentTarget.clientWidth,
            });
          }}
          className="flex-1 overflow-x-auto overflow-y-auto relative scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent bg-slate-50"
        >
          <div
            ref={bodyRef}
            className="relative"
            style={{ width: `${minWidth}px`, height: `${trackLanesHeight}px` }}
          >
            {/* Top Timecode Ruler with CapCut Markers */}
            <div
              className="h-7 border-b border-slate-200 bg-slate-100 sticky top-0 z-30 cursor-pointer select-none"
              onPointerDown={handleSeek}
            >
              {Array.from({ length: endTick - startTick }, (_, i) => {
                const tick = (startTick + i) * tickStep;
                const pos = tick * pps;
                const mins = Math.floor(tick / 60);
                const secs = String(tick % 60).padStart(2, "0");
                return (
                  <div
                    key={tick}
                    className="absolute top-0 bottom-0 flex flex-col justify-between border-l border-slate-300"
                    style={{ left: `${pos}px` }}
                  >
                    <span className="text-[9px] font-mono text-slate-500 pl-1">
                      {mins}:{secs}
                    </span>
                    <div className="w-[1px] h-1.5 bg-slate-400" />
                  </div>
                );
              })}

              {/* CapCut Timeline Gold Markers (#FFCC00) */}
              {markers.map((markerTime, idx) => {
                const pos = markerTime * pps;
                return (
                  <div
                    key={`marker-${idx}`}
                    title={`Marker at ${formatTime(markerTime, project.settings.fps)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      playback.set(markerTime, false);
                    }}
                    className="absolute top-0 bottom-0 w-3 -ml-1.5 flex flex-col items-center cursor-pointer z-40 group"
                    style={{ left: `${pos}px` }}
                  >
                    <div className="w-2.5 h-2.5 bg-amber-500 rotate-45 shadow-xs group-hover:scale-125 transition-transform mt-1" />
                    <div className="w-[1px] h-full bg-amber-500/70" />
                  </div>
                );
              })}
            </div>

            {/* Detected Silences Waveform Shading Overlay */}
            {detectedSilences.length > 0 && (
              <div className="absolute top-7 bottom-0 left-0 right-0 pointer-events-none z-20">
                {detectedSilences.map((silence, idx) => {
                  const left = silence.start * pps;
                  const width = Math.max(4, silence.duration * pps);
                  return (
                    <div
                      key={`silence-${idx}-${silence.start}`}
                      className="absolute top-0 bottom-0 bg-rose-500/15 border-x border-dashed border-rose-500/70 pointer-events-none flex flex-col items-center justify-start overflow-hidden select-none"
                      style={{ left: `${left}px`, width: `${width}px` }}
                    >
                      <span className="text-[9px] font-mono text-rose-700 bg-white/95 border border-rose-300 rounded px-1 mt-1 shadow-xs whitespace-nowrap">
                        Cut {silence.duration.toFixed(2)}s
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Track Lanes */}
            <div className="flex flex-col divide-y divide-slate-200">
              {orderedTrackIds.map((id, trackIdx) => {
                const track = project.tracks[id];
                if (!track) return null;
                const style = TRACK_STYLES[track.kind] || TRACK_STYLES.video;

                return (
                  <div
                    key={id}
                    data-track={id}
                    onPointerDown={handleSeek}
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes("application/veelox-asset")) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "copy";
                      }
                    }}
                    onDrop={(e) => handleDropAsset(e, track)}
                    className={`h-[56px] relative transition-colors ${
                      track.locked
                        ? "bg-[#141416]/80 opacity-60"
                        : trackIdx % 2 === 0
                        ? "bg-[#141416] hover:bg-[#18181c]"
                        : "bg-[#18181C] hover:bg-[#1c1c20]"
                    }`}
                  >
                    {/* Render clips inside this track */}
                    {track.clipIds.map((clipId) => {
                      const clip = project.clips[clipId];
                      if (!clip) return null;
                      const isSelected = selection.includes(clip.id);
                      const asset = clip.assetId ? project.assets[clip.assetId] : undefined;
                      const clipLeft = clip.startTime * pps;
                      const clipWidth = Math.max(8, clip.duration * pps);

                      // Viewport virtualization for smooth performance
                      if (
                        clipLeft + clipWidth < viewport.left - 200 ||
                        clipLeft > viewport.left + viewport.width + 200
                      ) {
                        return null;
                      }

                      return (
                        <div
                          key={clip.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`${clip.name}, ${clip.startTime.toFixed(1)}s to ${(
                            clip.startTime + clip.duration
                          ).toFixed(1)}s`}
                          aria-pressed={isSelected}
                          onPointerDown={(e) => handleClipDrag(e, clip)}
                          onDoubleClick={() => playback.set(clip.startTime, false)}
                          className={`absolute top-1 bottom-1 rounded-md border flex items-center px-2 cursor-pointer overflow-hidden transition-all text-xs font-medium group ${
                            style.clipBg
                          } ${style.clipBorder} ${style.clipText} ${
                            isSelected
                              ? "ring-2 ring-[#00E5FF] border-[#00E5FF] shadow-sm z-20"
                              : "hover:border-[#55555c] z-10"
                          }`}
                          style={{
                            left: `${clipLeft}px`,
                            width: `${clipWidth}px`,
                          }}
                        >
                          {/* Real Audio Waveform / Filmstrip Content */}
                          <ClipContent
                            clip={clip}
                            asset={asset}
                            trackKind={track.kind}
                            width={clipWidth}
                          />

                          {/* Left Trim Handle */}
                          <div
                            onPointerDown={(e) => handleClipDrag(e, clip, "left")}
                            title="Trim Start (Q)"
                            className="absolute left-0 top-0 bottom-0 w-2.5 bg-black/0 group-hover:bg-black/30 hover:!bg-[#00E5FF] cursor-ew-resize z-30 transition-colors flex items-center justify-center"
                          >
                            <div className="w-[1.5px] h-3 bg-white/60 group-hover:bg-white rounded-full" />
                          </div>

                          {/* Clip Label & Duration */}
                          <div className="relative z-20 flex items-center gap-1.5 min-w-0 pr-2">
                            <span className="truncate font-semibold text-[11px] text-white">
                              {clip.name}
                            </span>
                            {clip.speed !== 1 && (
                              <span className="text-[10px] text-amber-400 font-semibold font-mono">
                                {clip.speed}×
                              </span>
                            )}
                            <span className="text-[10px] font-mono text-[#A0A0A8]">
                              {clip.duration.toFixed(1)}s
                            </span>
                          </div>

                          {/* Right Trim Handle */}
                          <div
                            onPointerDown={(e) => handleClipDrag(e, clip, "right")}
                            title="Trim End (W)"
                            className="absolute right-0 top-0 bottom-0 w-2.5 bg-black/0 group-hover:bg-black/30 hover:!bg-[#00E5FF] cursor-ew-resize z-30 transition-colors flex items-center justify-center"
                          >
                            <div className="w-[1.5px] h-3 bg-white/60 group-hover:bg-white rounded-full" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Signature CapCut Scrubber Playhead */}
            <Scrubber
              time={time}
              pps={pps}
              height={trackLanesHeight}
              fps={project.settings.fps}
              showHandle={true}
              color="#00E5FF"
            />

            {/* Empty Timeline Helper Notice */}
            {Object.keys(project.clips).length === 0 && (
              <div
                className="absolute top-16 flex items-center gap-2 text-white bg-[#18181C] border border-[#2E2E33] px-4 py-2.5 rounded-xl text-xs font-medium shadow-xl"
                style={{ left: `${Math.max(24, viewport.left + 40)}px` }}
              >
                <Sparkles size={14} className="text-[#00E5FF]" />
                <span>Drag media or use AI Editor to generate clips · Space to Play · S to Split</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
