"use client";

import React, { memo, useRef, useState, useEffect, useCallback, useMemo } from "react";
import {
  Scissors,
  Trash2,
  Copy,
  Magnet,
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

const TRACK_STYLES: Record<string, TrackStyleInfo> = {
  overlay: {
    chipBg: "bg-cyan-50",
    chipBorder: "border-cyan-200",
    chipText: "text-cyan-700",
    clipBg: "bg-cyan-100 hover:bg-cyan-200/80",
    clipBorder: "border-cyan-400",
    clipText: "text-cyan-950",
    label: "Overlay / B-Roll",
    icon: Layers,
  },
  caption: {
    chipBg: "bg-amber-50",
    chipBorder: "border-amber-200",
    chipText: "text-amber-700",
    clipBg: "bg-amber-100 hover:bg-amber-200/80",
    clipBorder: "border-amber-400",
    clipText: "text-amber-950",
    label: "Captions",
    icon: CaptionsIcon,
  },
  video: {
    chipBg: "bg-blue-50",
    chipBorder: "border-blue-200",
    chipText: "text-blue-700",
    clipBg: "bg-blue-100 hover:bg-blue-200/80",
    clipBorder: "border-blue-400",
    clipText: "text-blue-950",
    label: "Main Video",
    icon: Film,
  },
  text: {
    chipBg: "bg-violet-50",
    chipBorder: "border-violet-200",
    chipText: "text-violet-700",
    clipBg: "bg-violet-100 hover:bg-violet-200/80",
    clipBorder: "border-violet-400",
    clipText: "text-violet-950",
    label: "Titles & GFX",
    icon: Type,
  },
  audio: {
    chipBg: "bg-emerald-50",
    chipBorder: "border-emerald-200",
    chipText: "text-emerald-700",
    clipBg: "bg-emerald-100 hover:bg-emerald-200/80",
    clipBorder: "border-emerald-400",
    clipText: "text-emerald-950",
    label: "Audio & SFX",
    icon: Music,
  },
  image: {
    chipBg: "bg-pink-50",
    chipBorder: "border-pink-200",
    chipText: "text-pink-700",
    clipBg: "bg-pink-100 hover:bg-pink-200/80",
    clipBorder: "border-pink-400",
    clipText: "text-pink-950",
    label: "Images",
    icon: Film,
  },
};

/** Render artwork, waveform, or typography preview inside clip */
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
  if (trackKind === "audio" || (asset?.kind === "audio" && asset.waveform)) {
    const peaks = asset?.waveform;
    if (peaks && peaks.length > 0) {
      const count = Math.min(100, Math.max(8, Math.floor(width / 4)));
      const path = Array.from({ length: count }, (_, i) => {
        const source =
          clip.sourceStart + (i / count) * (clip.sourceEnd - clip.sourceStart);
        const peak =
          peaks[
            Math.min(
              peaks.length - 1,
              Math.floor((source / (asset.duration || 1)) * peaks.length)
            )
          ] || 0;
        return `M${(i / count) * 100},${50 - peak * 44}V${50 + peak * 44}`;
      }).join(" ");
      return (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none opacity-45 text-emerald-600"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d={path} stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    }
    // Fallback decorative audio wave
    return (
      <div className="absolute inset-0 opacity-25 flex items-center justify-around pointer-events-none px-1">
        {Array.from({ length: Math.min(24, Math.floor(width / 8)) }).map((_, i) => (
          <div
            key={i}
            className="w-[2px] bg-emerald-600 rounded-full"
            style={{ height: `${20 + ((i * 37) % 60)}%` }}
          />
        ))}
      </div>
    );
  }

  if (asset?.thumbnail) {
    const frames = asset.thumbnails || [asset.thumbnail];
    const count = Math.min(16, Math.max(1, Math.ceil(width / 80)));
    return (
      <div className="absolute inset-0 flex overflow-hidden opacity-35 pointer-events-none">
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
  const { store, playback, selection, select, run, notify } = useEditor();
  const project = useProject(store);
  const { time, playing } = usePlayback(playback);

  const [pps, setPps] = useState(60); // Pixels per second
  const [snapping, setSnapping] = useState(true);
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
    const assetId = event.dataTransfer.getData("application/veelox-asset");
    if (!assetId) return;
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
      className="w-full bg-white border-t border-slate-200 flex flex-col select-none text-slate-900 overflow-hidden"
      style={{ height: `${height}px` }}
      aria-label="Multi-Track Workstation Timeline"
    >
      {/* 1. Timeline Toolbar */}
      <header className="h-10 px-3 flex items-center justify-between border-b border-slate-200 bg-white text-xs">
        {/* Left Editing Tools */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 font-semibold text-slate-800 mr-2">
            <span>Timeline</span>
            {selection.length > 0 && (
              <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full font-mono">
                {selection.length} selected
              </span>
            )}
          </div>

          <div className="h-4 w-[1px] bg-slate-200 mx-1" />

          {/* Split (Razor) */}
          <button
            onClick={handleSplit}
            title="Split at Playhead (S)"
            aria-label="Split at Playhead"
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors"
          >
            <Scissors size={14} className="text-amber-600" />
            <span className="text-[11px]">Split</span>
          </button>

          {/* Duplicate */}
          <button
            onClick={handleDuplicate}
            disabled={!selection.length}
            title="Duplicate Selected Clip (Ctrl+D)"
            aria-label="Duplicate Selected Clip"
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Copy size={14} className="text-blue-600" />
            <span className="text-[11px]">Duplicate</span>
          </button>

          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={!selection.length}
            title="Delete Selected Clip (Delete / Backspace)"
            aria-label="Delete Selected Clip"
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-rose-50 text-slate-700 hover:text-rose-700 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Trash2 size={14} className="text-rose-600" />
            <span className="text-[11px]">Delete</span>
          </button>

          {/* Add Track Menu */}
          <div className="h-4 w-[1px] bg-slate-200 mx-1" />
          <div className="relative flex items-center">
            <label className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200/70 text-slate-700 hover:text-slate-900 border border-slate-200 cursor-pointer transition-colors text-[11px]">
              <Plus size={13} className="text-emerald-600" />
              <span>Track</span>
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
                <option value="" disabled>
                  + Add Track
                </option>
                <option value="overlay">Overlay / B-Roll</option>
                <option value="caption">Captions</option>
                <option value="video">Main Video</option>
                <option value="text">Titles & Text</option>
                <option value="audio">Audio / SFX</option>
              </select>
            </label>
          </div>
        </div>

        {/* Right Navigation & Zoom Controls */}
        <div className="flex items-center gap-3">
          {/* Snapping Toggle */}
          <button
            onClick={() => setSnapping(!snapping)}
            title="Toggle Snapping (N)"
            aria-pressed={snapping}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors ${
              snapping
                ? "bg-blue-50 border border-blue-200 text-blue-700"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Magnet size={13} />
            <span>Snap</span>
          </button>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md">
            <button
              onClick={() => zoom(pps / 1.3)}
              title="Zoom Out (-)"
              aria-label="Zoom Out"
              className="p-1 hover:text-slate-900 text-slate-500 transition-colors"
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
              className="w-16 h-1 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <button
              onClick={() => zoom(pps * 1.3)}
              title="Zoom In (+)"
              aria-label="Zoom In"
              className="p-1 hover:text-slate-900 text-slate-500 transition-colors"
            >
              <ZoomIn size={13} />
            </button>
            <button
              onClick={fitTimeline}
              title="Fit timeline to view (F)"
              className="text-[10px] uppercase font-semibold text-slate-600 hover:text-slate-900 px-1 py-0.5"
            >
              Fit
            </button>
          </div>

          <div className="text-[11px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
            {project.settings.fps} FPS
          </div>
        </div>
      </header>

      {/* 2. Track Headers + Tracks Container */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Fixed Left Track Headers Column (Width: 190px) */}
        <div
          ref={labelsRef}
          className="w-[190px] flex-shrink-0 bg-white border-r border-slate-200 flex flex-col z-20 select-none overflow-hidden"
        >
          {/* Header ruler title spacer */}
          <div className="h-7 border-b border-slate-200 bg-slate-50 px-3 flex items-center justify-between text-[10px] font-mono tracking-wider text-slate-500">
            <span>TRACKS</span>
            <span className="text-slate-600 font-mono">{formatTime(time, project.settings.fps)}</span>
          </div>

          {/* List of track headers */}
          <div className="flex-1 flex flex-col divide-y divide-slate-200/80">
            {orderedTrackIds.map((id) => {
              const track = project.tracks[id];
              if (!track) return null;
              const style = TRACK_STYLES[track.kind] || TRACK_STYLES.video;
              const Icon = style.icon;

              return (
                <div
                  key={id}
                  className="h-[56px] px-2.5 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Track Accent Chip */}
                    <div
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${style.chipBg} ${style.chipBorder} ${style.chipText}`}
                    >
                      <Icon size={11} />
                      <span className="truncate max-w-[70px]">{track.name || style.label}</span>
                    </div>
                  </div>

                  {/* Track State Controls (Mute, Lock, Hide) */}
                  <div className="flex items-center gap-1 text-slate-500">
                    <button
                      onClick={() =>
                        run((p) => changeTrack(p, id, { hidden: !track.hidden }))
                      }
                      title={track.hidden ? "Show Track" : "Hide Track"}
                      className={`p-1 rounded hover:bg-slate-100 transition-colors ${
                        track.hidden ? "text-amber-600" : "hover:text-slate-900"
                      }`}
                    >
                      {track.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    <button
                      onClick={() =>
                        run((p) => changeTrack(p, id, { muted: !track.muted }))
                      }
                      title={track.muted ? "Unmute Track" : "Mute Track"}
                      className={`p-1 rounded hover:bg-slate-100 transition-colors ${
                        track.muted ? "text-rose-600" : "hover:text-slate-900"
                      }`}
                    >
                      {track.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                    </button>
                    <button
                      onClick={() =>
                        run((p) => changeTrack(p, id, { locked: !track.locked }))
                      }
                      title={track.locked ? "Unlock Track" : "Lock Track"}
                      className={`p-1 rounded hover:bg-slate-100 transition-colors ${
                        track.locked ? "text-rose-600" : "hover:text-slate-900"
                      }`}
                    >
                      {track.locked ? <Lock size={12} /> : <Unlock size={12} />}
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
          className="flex-1 overflow-x-auto overflow-y-auto relative scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent bg-[#F8FAFC]"
        >
          <div
            ref={bodyRef}
            className="relative"
            style={{ width: `${minWidth}px`, height: `${trackLanesHeight}px` }}
          >
            {/* Top Timecode Ruler */}
            <div
              className="h-7 border-b border-slate-200 bg-[#F1F5F9] sticky top-0 z-30 cursor-pointer select-none"
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
                    className="absolute top-0 bottom-0 flex flex-col justify-between border-l border-slate-300/80"
                    style={{ left: `${pos}px` }}
                  >
                    <span className="text-[9px] font-mono text-slate-500 pl-1">
                      {mins}:{secs}
                    </span>
                    <div className="w-[1px] h-1.5 bg-slate-400" />
                  </div>
                );
              })}
            </div>

            {/* Track Lanes */}
            <div className="flex flex-col divide-y divide-slate-200/70">
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
                        ? "bg-slate-200/50 opacity-75"
                        : trackIdx % 2 === 0
                        ? "bg-[#F8FAFC] hover:bg-slate-100/80"
                        : "bg-[#F1F5F9]/70 hover:bg-slate-100"
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

                      // Viewport virtualization for smooth performance with hundreds of clips
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
                              ? "ring-2 ring-blue-600 border-blue-600 shadow-md z-20"
                              : "hover:brightness-95 z-10"
                          }`}
                          style={{
                            left: `${clipLeft}px`,
                            width: `${clipWidth}px`,
                          }}
                        >
                          {/* Background Artwork / Waveform / Filmstrip */}
                          <ClipContent
                            clip={clip}
                            asset={asset}
                            trackKind={track.kind}
                            width={clipWidth}
                          />

                          {/* Left Trim Handle */}
                          <div
                            onPointerDown={(e) => handleClipDrag(e, clip, "left")}
                            title="Trim Start"
                            className="absolute left-0 top-0 bottom-0 w-2.5 bg-slate-900/0 group-hover:bg-slate-900/15 hover:!bg-blue-600 cursor-ew-resize z-30 transition-colors flex items-center justify-center"
                          >
                            <div className="w-[1.5px] h-3 bg-slate-700/60 group-hover:bg-slate-900/80 rounded-full" />
                          </div>

                          {/* Clip Label & Metadata */}
                          <div className="relative z-20 flex items-center gap-1.5 min-w-0 pr-2">
                            <span className="truncate font-semibold text-[11px]">
                              {clip.name}
                            </span>
                            {clip.speed !== 1 && (
                              <span className="text-[10px] text-amber-700 font-semibold font-mono">
                                {clip.speed}×
                              </span>
                            )}
                            <span className="text-[10px] opacity-70 font-mono">
                              {clip.duration.toFixed(1)}s
                            </span>
                          </div>

                          {/* Right Trim Handle */}
                          <div
                            onPointerDown={(e) => handleClipDrag(e, clip, "right")}
                            title="Trim End"
                            className="absolute right-0 top-0 bottom-0 w-2.5 bg-slate-900/0 group-hover:bg-slate-900/15 hover:!bg-blue-600 cursor-ew-resize z-30 transition-colors flex items-center justify-center"
                          >
                            <div className="w-[1.5px] h-3 bg-slate-700/60 group-hover:bg-slate-900/80 rounded-full" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Playhead Scrubber */}
            <Scrubber
              time={time}
              pps={pps}
              height={trackLanesHeight}
              fps={project.settings.fps}
              showHandle={true}
            />

            {/* Empty Timeline Helper Notice */}
            {Object.keys(project.clips).length === 0 && (
              <div
                className="absolute top-16 flex items-center gap-2 text-slate-600 bg-white border border-slate-200 px-4 py-2 rounded-lg text-xs font-medium shadow-sm"
                style={{ left: `${Math.max(24, viewport.left + 40)}px` }}
              >
                <Sparkles size={14} className="text-blue-600" />
                <span>Drag media or use AI Copilot to generate clips · Space to Play · S to Split</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
