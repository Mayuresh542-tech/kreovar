"use client";

import React, { useRef, useMemo, useState, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  Scissors,
  Copy,
  Trash2,
  FastForward,
  Flag,
  Magnet,
  Maximize2,
  Minus,
  Plus,
  Video,
  Layers,
  Type,
  MessageSquare,
  Mic,
  Music,
  Bell,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  VeeloxTimelineProject,
  TimelineTrackType,
  TimelineTrack,
  TimelineItem,
} from "@/app/lib/timeline/types";
import { findSnapTime } from "@/app/lib/timeline/operations";

interface DraggingClipState {
  mode: "move" | "trim-start" | "trim-end";
  trackType: TimelineTrackType;
  itemId: string;
  initialStartTime: number;
  initialEndTime: number;
  initialDuration: number;
  startX: number;
  currentDeltaTime: number;
  snappedTime?: number;
  hoveredTargetTrack?: TimelineTrackType;
}

interface EditorMultiTrackTimelineProps {
  timeline: VeeloxTimelineProject;
  currentTime: number;
  selectedClipId: string | null;
  selectedClipIds?: string[];
  onSeek: (time: number) => void;
  onSelectClip: (item: TimelineItem, isMultiSelect?: boolean) => void;
  onMoveClip: (trackType: TimelineTrackType, clipId: string, newStartTime: number) => void;
  onMoveClipAcrossTracks?: (
    sourceTrack: TimelineTrackType,
    targetTrack: TimelineTrackType,
    clipId: string,
    newStartTime: number
  ) => void;
  onTrimClip: (
    trackType: TimelineTrackType,
    clipId: string,
    newStartTime: number,
    newEndTime: number
  ) => void;
  onSplitClip?: (time: number, targetClipId?: string) => void;
  onDuplicateClip?: (trackType: TimelineTrackType, clipId: string) => void;
  onDeleteClip?: (trackType: TimelineTrackType, clipId: string) => void;
  onDeleteMultipleClips?: (clipIds: string[]) => void;
  onRippleDeleteClip?: (trackType: TimelineTrackType, clipId: string) => void;
  onDetachAudio?: (trackType: TimelineTrackType, clipId: string) => void;
  onCutClip?: (trackType: TimelineTrackType, clipId: string) => void;
  onCopyClip?: (item: TimelineItem) => void;
  onPasteClip?: () => void;
  onChangeClipSpeed?: (trackType: TimelineTrackType, clipId: string, speed: number) => void;
  onToggleClipMute?: (trackType: TimelineTrackType, clipId: string) => void;
  onUpdateTrackState?: (trackId: string, updates: Partial<TimelineTrack>) => void;
  onAddMarker?: (time: number, label: string) => void;
  onDeleteMarker?: (markerId: string) => void;
  onDropBRoll: (
    brollData: { videoUrl: string; title?: string; thumbnail?: string; duration?: number; source?: string },
    targetTime?: number,
    targetClipId?: string
  ) => void;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  playbackSpeed?: number;
  onChangePlaybackSpeed?: (speed: number) => void;
}

/**
 * Checks if dragging from source track to target track is compatible.
 */
function isTrackCompatible(source: TimelineTrackType, target: TimelineTrackType): boolean {
  if (source === target) return true;
  // Visual tracks (video and overlays are interchangeable)
  if ((source === "video" || source === "overlays") && (target === "video" || target === "overlays")) {
    return true;
  }
  // Audio tracks (voiceover, music, sfx)
  if (
    (source === "voiceover" || source === "music" || source === "sfx") &&
    (target === "voiceover" || target === "music" || target === "sfx")
  ) {
    return true;
  }
  return false;
}

/**
 * Procedural Audio Waveform renderer:
 * Generates an SVG bar graph representing sound peaks for voiceover and music clips.
 */
function renderAudioWaveform(width: number, height: number, color = "#10B981") {
  const barCount = Math.max(6, Math.floor(width / 5));
  const bars = [];
  for (let i = 0; i < barCount; i++) {
    const seed = (i * 29 + 17) % 100;
    const barHeight = Math.max(3, Math.min(height - 4, (seed / 100) * (height - 6) + 3));
    const y = (height - barHeight) / 2;
    bars.push(
      <rect
        key={i}
        x={i * 5 + 1}
        y={y}
        width={2.5}
        height={barHeight}
        rx={1}
        fill={color}
        opacity={0.75}
      />
    );
  }
  return (
    <svg width={width} height={height} className="pointer-events-none absolute inset-0 opacity-80">
      {bars}
    </svg>
  );
}

export default function EditorMultiTrackTimeline({
  timeline,
  currentTime,
  selectedClipId,
  selectedClipIds = [],
  onSeek,
  onSelectClip,
  onMoveClip,
  onMoveClipAcrossTracks,
  onTrimClip,
  onSplitClip,
  onDuplicateClip,
  onDeleteClip,
  onDeleteMultipleClips,
  onRippleDeleteClip,
  onDetachAudio,
  onCutClip,
  onCopyClip,
  onPasteClip,
  onChangeClipSpeed,
  onToggleClipMute,
  onUpdateTrackState,
  onAddMarker,
  onDeleteMarker,
  onDropBRoll,
  isPlaying,
  onTogglePlay,
  playbackSpeed = 1,
  onChangePlaybackSpeed,
}: EditorMultiTrackTimelineProps) {
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const totalDuration = Math.max(1, timeline.duration);

  // Zoom factor: pixels per second (12px/s to 120px/s)
  const [zoomFactor, setZoomFactor] = useState(32);
  const [isSnappingEnabled, setIsSnappingEnabled] = useState(true);

  // In / Out range points
  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);

  // Drag-and-drop B-roll hover state
  const [brollDropHoverTime, setBrollDropHoverTime] = useState<number | null>(null);
  const [hoveredClipDropTargetId, setHoveredClipDropTargetId] = useState<string | null>(null);

  // Interactive mouse drag state for moving / trimming clips & captions
  const [dragState, setDragState] = useState<DraggingClipState | null>(null);

  // Playhead scrubbing state
  const [isScrubbingPlayhead, setIsScrubbingPlayhead] = useState(false);

  // Clip Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: TimelineItem;
    trackType: TimelineTrackType;
  } | null>(null);

  // Close context menu on global click or ESC
  useEffect(() => {
    function handleGlobalClick() {
      setContextMenu(null);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setContextMenu(null);
    }
    window.addEventListener("click", handleGlobalClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Track lock/mute toggle helpers
  function toggleTrackMute(track: TimelineTrack) {
    if (onUpdateTrackState) {
      onUpdateTrackState(track.id, { muted: !track.muted });
    }
  }

  function toggleTrackLock(track: TimelineTrack) {
    if (onUpdateTrackState) {
      onUpdateTrackState(track.id, { locked: !track.locked });
    }
  }

  function toggleTrackVisibility(track: TimelineTrack) {
    if (onUpdateTrackState) {
      onUpdateTrackState(track.id, { hidden: !track.hidden });
    }
  }

  const timelinePixelWidth = useMemo(
    () => Math.max(900, totalDuration * zoomFactor + 360),
    [totalDuration, zoomFactor]
  );

  // Ruler tick marks: dynamically adapts to zoom level with clean major and minor ticks
  const { majorTicks, minorTicks } = useMemo(() => {
    const majors: Array<{ time: number; label: string }> = [];
    const minors: number[] = [];

    let majorStep = 1;
    let minorStep = 0.2;

    if (zoomFactor < 20) {
      majorStep = 5;
      minorStep = 1;
    } else if (zoomFactor < 35) {
      majorStep = 2;
      minorStep = 0.5;
    } else if (zoomFactor < 65) {
      majorStep = 1;
      minorStep = 0.25;
    } else {
      majorStep = 0.5;
      minorStep = 0.1;
    }

    for (let t = 0; t <= totalDuration + 2; t += majorStep) {
      const roundedT = Math.round(t * 100) / 100;
      const label = roundedT % 1 === 0 ? `${roundedT}s` : `${roundedT.toFixed(1)}s`;
      majors.push({ time: roundedT, label });
    }

    for (let t = 0; t <= totalDuration + 2; t += minorStep) {
      const roundedT = Math.round(t * 100) / 100;
      if (roundedT % majorStep !== 0) {
        minors.push(roundedT);
      }
    }

    return { majorTicks: majors, minorTicks: minors };
  }, [totalDuration, zoomFactor]);

  // Track references
  const videoTrack = timeline.tracks.find((t) => t.type === "video");
  const overlayTrack = timeline.tracks.find((t) => t.type === "overlays");
  const captionTrack = timeline.tracks.find((t) => t.type === "captions");
  const textTrack = timeline.tracks.find((t) => t.type === "text");
  const voiceoverTrack = timeline.tracks.find((t) => t.type === "voiceover");
  const musicTrack = timeline.tracks.find((t) => t.type === "music");
  const sfxTrack = timeline.tracks.find((t) => t.type === "sfx");

  // Selected item lookup
  const effectiveSelectedIds = useMemo(() => {
    const set = new Set(selectedClipIds);
    if (selectedClipId) set.add(selectedClipId);
    return Array.from(set);
  }, [selectedClipIds, selectedClipId]);

  let selectedItem: { item: TimelineItem; trackType: TimelineTrackType } | null = null;
  if (selectedClipId) {
    for (const track of timeline.tracks) {
      const it = track.items.find((i) => i.id === selectedClipId);
      if (it) {
        selectedItem = { item: it, trackType: track.type };
        break;
      }
    }
  }

  // Handle seeking from clientX
  const handleSeekFromClientX = useCallback(
    (clientX: number) => {
      if (!rulerRef.current) return;
      const rect = rulerRef.current.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const targetTime = Math.max(0, Math.min(totalDuration, clickX / zoomFactor));
      onSeek(Math.round(targetTime * 100) / 100);
    },
    [totalDuration, zoomFactor, onSeek]
  );

  // Playhead scrubbing
  useEffect(() => {
    if (!isScrubbingPlayhead) return;

    function handleMouseMove(e: MouseEvent) {
      handleSeekFromClientX(e.clientX);
    }

    function handleMouseUp() {
      setIsScrubbingPlayhead(false);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isScrubbingPlayhead, handleSeekFromClientX]);

  // Moving and trimming clip handler with intelligent vertical snapping & cross-track detection
  useEffect(() => {
    if (!dragState) return;

    function handleMouseMove(e: MouseEvent) {
      if (!dragState) return;
      const deltaPixels = e.clientX - dragState.startX;
      let rawDeltaTime = deltaPixels / zoomFactor;
      let snappedTarget: number | undefined;

      if (isSnappingEnabled) {
        let candidateTime = dragState.initialStartTime + rawDeltaTime;
        if (dragState.mode === "trim-end") {
          candidateTime = dragState.initialEndTime + rawDeltaTime;
        }

        const snap = findSnapTime(candidateTime, timeline, currentTime, inPoint, outPoint, 0.22);
        if (snap.snapped) {
          snappedTarget = snap.time;
          rawDeltaTime =
            dragState.mode === "trim-end"
              ? snap.time - dragState.initialEndTime
              : snap.time - dragState.initialStartTime;
        }
      }

      // Cross-track hover detection when in "move" mode
      let targetTrack: TimelineTrackType | undefined;
      if (dragState.mode === "move") {
        const hoveredElem = document.elementFromPoint(e.clientX, e.clientY);
        const rowElem = hoveredElem?.closest("[data-track-type]");
        const foundTrack = (rowElem?.getAttribute("data-track-type") as TimelineTrackType) || undefined;
        if (foundTrack && isTrackCompatible(dragState.trackType, foundTrack)) {
          targetTrack = foundTrack;
        }
      }

      setDragState((prev) =>
        prev
          ? {
              ...prev,
              currentDeltaTime: rawDeltaTime,
              snappedTime: snappedTarget,
              hoveredTargetTrack: targetTrack,
            }
          : null
      );
    }

    function handleMouseUp() {
      if (!dragState) return;
      const {
        mode,
        trackType,
        itemId,
        initialStartTime,
        initialEndTime,
        currentDeltaTime,
        hoveredTargetTrack,
      } = dragState;

      if (Math.abs(currentDeltaTime) > 0.04 || (hoveredTargetTrack && hoveredTargetTrack !== trackType)) {
        if (mode === "move") {
          const newStart = Math.max(0, initialStartTime + currentDeltaTime);
          if (hoveredTargetTrack && hoveredTargetTrack !== trackType && onMoveClipAcrossTracks) {
            onMoveClipAcrossTracks(trackType, hoveredTargetTrack, itemId, newStart);
          } else {
            onMoveClip(trackType, itemId, newStart);
          }
        } else if (mode === "trim-start") {
          const newStart = Math.max(
            0,
            Math.min(initialEndTime - 0.3, initialStartTime + currentDeltaTime)
          );
          onTrimClip(trackType, itemId, newStart, initialEndTime);
        } else if (mode === "trim-end") {
          const newEnd = Math.max(
            initialStartTime + 0.3,
            initialEndTime + currentDeltaTime
          );
          onTrimClip(trackType, itemId, initialStartTime, newEnd);
        }
      }

      setDragState(null);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    dragState,
    zoomFactor,
    isSnappingEnabled,
    currentTime,
    inPoint,
    outPoint,
    timeline,
    onMoveClip,
    onMoveClipAcrossTracks,
    onTrimClip,
  ]);

  function handleClipMouseDown(
    e: React.MouseEvent,
    item: TimelineItem,
    trackType: TimelineTrackType
  ) {
    const track = timeline.tracks.find((t) => t.type === trackType);
    if (track?.locked) return;
    e.stopPropagation();

    const isShift = e.shiftKey;
    onSelectClip(item, isShift);

    const targetEl = e.currentTarget as HTMLElement;
    const rect = targetEl.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const edgeMargin = 12;

    let mode: "move" | "trim-start" | "trim-end" = "move";
    if (clickX <= edgeMargin) {
      mode = "trim-start";
    } else if (clickX >= rect.width - edgeMargin) {
      mode = "trim-end";
    }

    setDragState({
      mode,
      trackType,
      itemId: item.id,
      initialStartTime: item.startTime,
      initialEndTime: item.endTime,
      initialDuration: item.duration,
      startX: e.clientX,
      currentDeltaTime: 0,
      hoveredTargetTrack: trackType,
    });
  }

  function handleClipContextMenu(
    e: React.MouseEvent,
    item: TimelineItem,
    trackType: TimelineTrackType
  ) {
    e.preventDefault();
    e.stopPropagation();
    onSelectClip(item, false);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item,
      trackType,
    });
  }

  function formatTimecode(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`;
  }

  // Playhead-anchored Zoom adjustments
  const setZoomAnchored = useCallback(
    (newZoomOrFn: number | ((prev: number) => number)) => {
      setZoomFactor((prev) => {
        const next = typeof newZoomOrFn === "function" ? newZoomOrFn(prev) : newZoomOrFn;
        const clamped = Math.max(12, Math.min(120, next));
        if (scrollContainerRef.current) {
          const currentScroll = scrollContainerRef.current.scrollLeft;
          const anchorPxBefore = currentTime * prev;
          const viewportOffset = anchorPxBefore - currentScroll;
          const anchorPxAfter = currentTime * clamped;
          requestAnimationFrame(() => {
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollLeft = anchorPxAfter - viewportOffset;
            }
          });
        }
        return clamped;
      });
    },
    [currentTime]
  );

  // Fit timeline to container width
  function handleFitTimeline() {
    if (scrollContainerRef.current) {
      const containerWidth = scrollContainerRef.current.clientWidth - 180;
      const fitZoom = Math.max(12, Math.min(80, Math.floor(containerWidth / totalDuration)));
      setZoomAnchored(fitZoom);
    }
  }

  // Ctrl/Cmd + Mouse Wheel Zoom
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    function handleWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const currentContainer = scrollContainerRef.current;
        if (!currentContainer) return;

        const rect = currentContainer.getBoundingClientRect();
        const mouseViewportX = e.clientX - rect.left;
        const currentScroll = currentContainer.scrollLeft;
        const mouseTimelineX = mouseViewportX + currentScroll;
        const anchorTime = mouseTimelineX / zoomFactor;

        const delta = e.deltaY < 0 ? 4 : -4;
        const nextZoom = Math.max(12, Math.min(120, zoomFactor + delta));

        if (nextZoom !== zoomFactor) {
          setZoomFactor(nextZoom);
          requestAnimationFrame(() => {
            const el = scrollContainerRef.current;
            if (el) {
              const newMouseTimelineX = anchorTime * nextZoom;
              el.scrollLeft = newMouseTimelineX - mouseViewportX;
            }
          });
        }
      }
    }

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [zoomFactor]);

  return (
    <div className="w-full h-full bg-white border-t border-slate-200 flex flex-col select-none">
      {/* 1. TOP TIMELINE TOOLBAR */}
      <div className="h-10 px-3 border-b border-slate-200 flex items-center justify-between text-xs text-slate-700 bg-slate-50/90 shrink-0">
        {/* Left: Transport, Timecode, and Core Editing Actions */}
        <div className="flex items-center gap-2">
          {onTogglePlay && (
            <button
              type="button"
              onClick={onTogglePlay}
              className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center cursor-pointer transition-colors shadow-2xs"
              title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
            </button>
          )}

          {/* Timecode display */}
          <div className="flex items-center gap-1 font-mono text-[11px] bg-white px-2 py-1 rounded-md border border-slate-200 shadow-2xs">
            <span className="text-slate-900 font-bold">{formatTimecode(currentTime)}</span>
            <span className="text-slate-400">/</span>
            <span className="text-slate-500">{formatTimecode(totalDuration)}</span>
          </div>

          <div className="h-4 w-[1px] bg-slate-200 mx-1" />

          {/* Split Clip (S) */}
          <button
            type="button"
            onClick={() => onSplitClip?.(currentTime, selectedClipId || undefined)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-700 border border-slate-200 cursor-pointer transition-colors shadow-2xs"
            title="Split clip at playhead (S)"
          >
            <Scissors className="w-3 h-3 text-slate-500" />
            <span>Split</span>
          </button>

          {/* Duplicate Clip */}
          {selectedItem && onDuplicateClip && (
            <button
              type="button"
              onClick={() => onDuplicateClip(selectedItem.trackType, selectedItem.item.id)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-700 border border-slate-200 cursor-pointer transition-colors shadow-2xs"
              title="Duplicate selected clip (Ctrl+D)"
            >
              <Copy className="w-3 h-3 text-slate-500" />
              <span>Duplicate</span>
            </button>
          )}

          {/* Delete Clip / Multi-Delete */}
          {effectiveSelectedIds.length > 1 && onDeleteMultipleClips ? (
            <button
              type="button"
              onClick={() => onDeleteMultipleClips(effectiveSelectedIds)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-rose-50 hover:bg-rose-100 text-[11px] font-medium text-rose-700 border border-rose-200 cursor-pointer transition-colors shadow-2xs"
              title="Delete all selected clips (Delete)"
            >
              <Trash2 className="w-3 h-3 text-rose-500" />
              <span>Delete ({effectiveSelectedIds.length})</span>
            </button>
          ) : selectedItem && onDeleteClip ? (
            <button
              type="button"
              onClick={() => onDeleteClip(selectedItem.trackType, selectedItem.item.id)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-rose-50 hover:bg-rose-100 text-[11px] font-medium text-rose-700 border border-rose-200 cursor-pointer transition-colors shadow-2xs"
              title="Delete selected clip (Delete)"
            >
              <Trash2 className="w-3 h-3 text-rose-500" />
              <span>Delete</span>
            </button>
          ) : null}

          {/* Ripple Delete */}
          {selectedItem && onRippleDeleteClip && (
            <button
              type="button"
              onClick={() => onRippleDeleteClip(selectedItem.trackType, selectedItem.item.id)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 hover:bg-amber-100 text-[11px] font-medium text-amber-700 border border-amber-200 cursor-pointer transition-colors shadow-2xs"
              title="Ripple delete clip (shifts downstream clips left)"
            >
              <FastForward className="w-3 h-3 text-amber-600" />
              <span>Ripple</span>
            </button>
          )}

          {/* Add Marker */}
          <button
            type="button"
            onClick={() => onAddMarker?.(currentTime, `Marker @ ${currentTime.toFixed(1)}s`)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-700 border border-slate-200 cursor-pointer transition-colors shadow-2xs"
            title="Add marker at playhead (M)"
          >
            <Flag className="w-3 h-3 text-slate-500" />
            <span>Marker</span>
          </button>
        </div>

        {/* Center: In / Out points & Snapping */}
        <div className="flex items-center gap-2">
          {/* Set In Point */}
          <button
            type="button"
            onClick={() => setInPoint(currentTime)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
              inPoint !== null
                ? "bg-blue-50 text-blue-700 border border-blue-300 font-semibold"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
            }`}
            title="Set In Point (I)"
          >
            [ In {inPoint !== null ? inPoint.toFixed(1) : ""}
          </button>

          {/* Set Out Point */}
          <button
            type="button"
            onClick={() => setOutPoint(currentTime)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
              outPoint !== null
                ? "bg-blue-50 text-blue-700 border border-blue-300 font-semibold"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
            }`}
            title="Set Out Point (O)"
          >
            Out ] {outPoint !== null ? outPoint.toFixed(1) : ""}
          </button>

          {(inPoint !== null || outPoint !== null) && (
            <button
              type="button"
              onClick={() => {
                setInPoint(null);
                setOutPoint(null);
              }}
              className="text-[10px] text-slate-400 hover:text-slate-700 underline font-mono"
            >
              Clear
            </button>
          )}

          {/* Snap toggle */}
          <button
            type="button"
            onClick={() => setIsSnappingEnabled((s) => !s)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
              isSnappingEnabled
                ? "bg-slate-900 border border-slate-900 text-white font-semibold shadow-2xs"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
            }`}
            title="Toggle Intelligent Snapping (Clips, Playhead, Markers)"
          >
            <Magnet className="w-3 h-3" />
            <span>Snap</span>
          </button>
        </div>

        {/* Right: Playback Speed, Zoom slider and Fit timeline button */}
        <div className="flex items-center gap-2">
          {onChangePlaybackSpeed && (
            <select
              value={playbackSpeed}
              onChange={(e) => onChangePlaybackSpeed(parseFloat(e.target.value))}
              className="bg-white border border-slate-200 text-slate-700 rounded px-1.5 py-0.5 text-[10px] font-mono cursor-pointer"
              title="Playback Speed"
            >
              <option value="0.25">0.25x</option>
              <option value="0.5">0.5x</option>
              <option value="1">1.0x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2.0x</option>
            </select>
          )}

          <button
            type="button"
            onClick={() => setZoomAnchored((z) => Math.max(12, z - 6))}
            className="p-1 rounded hover:bg-slate-200 text-slate-500 cursor-pointer"
            title="Zoom out"
          >
            <Minus className="w-3 h-3" />
          </button>

          <input
            type="range"
            min="12"
            max="120"
            value={zoomFactor}
            onChange={(e) => setZoomAnchored(parseInt(e.target.value))}
            className="w-16 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
            title="Timeline Zoom Level"
          />

          <button
            type="button"
            onClick={() => setZoomAnchored((z) => Math.min(120, z + 6))}
            className="p-1 rounded hover:bg-slate-200 text-slate-500 cursor-pointer"
            title="Zoom in"
          >
            <Plus className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={handleFitTimeline}
            className="p-1 rounded hover:bg-slate-200 text-slate-500 cursor-pointer"
            title="Fit Timeline to Window"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 2. MAIN TRACKS & RULER SCROLL CONTAINER */}
      <div
        ref={scrollContainerRef}
        className="flex-1 flex overflow-x-auto overflow-y-auto custom-scrollbar relative"
      >
        {/* Left Track Headers Column (Sticky Left) */}
        <div className="w-44 bg-slate-50 border-r border-slate-200 shrink-0 sticky left-0 z-20 flex flex-col shadow-xs select-none">
          {/* Header Spacer (matches ruler height) */}
          <div className="h-6 border-b border-slate-200 bg-slate-100/90 flex items-center justify-between px-2.5">
            <span className="text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-wider">
              Tracks
            </span>
            <span className="text-[9px] font-mono text-slate-400">Ctrl+Wheel: Zoom</span>
          </div>

          {/* V2 Overlays Header */}
          {overlayTrack && (
            <div className="h-10 px-2.5 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-800 bg-white">
              <div className="flex items-center gap-1.5 min-w-0">
                <Layers className="w-3.5 h-3.5 text-pink-600 shrink-0" />
                <span className="text-[10px] leading-tight truncate">V2 Overlays</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleTrackVisibility(overlayTrack)}
                  className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                  title={overlayTrack.hidden ? "Show Track" : "Hide Track"}
                >
                  {overlayTrack.hidden ? <EyeOff className="w-3 h-3 text-slate-400" /> : <Eye className="w-3 h-3 text-slate-600" />}
                </button>
              </div>
            </div>
          )}

          {/* V1 Video Track Header */}
          {videoTrack && (
            <div className="h-14 px-2.5 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-800 bg-white">
              <div className="flex items-center gap-1.5 min-w-0">
                <Video className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] leading-tight truncate font-bold">V1 Video</span>
                  <span className="text-[8px] font-mono text-slate-400">Primary Footage</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleTrackLock(videoTrack)}
                  className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                  title={videoTrack.locked ? "Unlock Track" : "Lock Track"}
                >
                  {videoTrack.locked ? <Lock className="w-3 h-3 text-amber-500" /> : <Unlock className="w-3 h-3 text-slate-400" />}
                </button>
                <button
                  type="button"
                  onClick={() => toggleTrackVisibility(videoTrack)}
                  className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                  title={videoTrack.hidden ? "Show Track" : "Hide Track"}
                >
                  {videoTrack.hidden ? <EyeOff className="w-3 h-3 text-slate-400" /> : <Eye className="w-3 h-3 text-slate-600" />}
                </button>
              </div>
            </div>
          )}

          {/* Text Track Header */}
          {textTrack && (
            <div className="h-8 px-2.5 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-800 bg-white">
              <div className="flex items-center gap-1.5 min-w-0">
                <Type className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="text-[10px] leading-tight truncate">Text Overlays</span>
              </div>
              <button
                type="button"
                onClick={() => toggleTrackVisibility(textTrack)}
                className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                {textTrack.hidden ? <EyeOff className="w-3 h-3 text-slate-400" /> : <Eye className="w-3 h-3 text-slate-600" />}
              </button>
            </div>
          )}

          {/* Captions Track Header */}
          {captionTrack && (
            <div className="h-9 px-2.5 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-800 bg-white">
              <div className="flex items-center gap-1.5 min-w-0">
                <MessageSquare className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span className="text-[10px] leading-tight truncate font-bold">Captions</span>
              </div>
              <button
                type="button"
                onClick={() => toggleTrackLock(captionTrack)}
                className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                title={captionTrack.locked ? "Unlock Subtitles" : "Lock Subtitles"}
              >
                {captionTrack.locked ? <Lock className="w-3 h-3 text-amber-500" /> : <Unlock className="w-3 h-3 text-slate-400" />}
              </button>
            </div>
          )}

          {/* Voiceover Track Header */}
          {voiceoverTrack && (
            <div className="h-8 px-2.5 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-800 bg-white">
              <div className="flex items-center gap-1.5 min-w-0">
                <Mic className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="text-[10px] leading-tight truncate">Voiceover (A1)</span>
              </div>
              <button
                type="button"
                onClick={() => toggleTrackMute(voiceoverTrack)}
                className={`p-0.5 text-[9px] font-mono cursor-pointer transition-colors ${
                  voiceoverTrack.muted ? "text-rose-600 font-bold" : "text-slate-400 hover:text-slate-700"
                }`}
                title={voiceoverTrack.muted ? "Unmute Voiceover" : "Mute Voiceover"}
              >
                {voiceoverTrack.muted ? <VolumeX className="w-3 h-3 text-rose-500" /> : <Volume2 className="w-3 h-3 text-slate-500" />}
              </button>
            </div>
          )}

          {/* Music Track Header */}
          {musicTrack && (
            <div className="h-8 px-2.5 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-800 bg-white">
              <div className="flex items-center gap-1.5 min-w-0">
                <Music className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span className="text-[10px] leading-tight truncate">Music (A2)</span>
              </div>
              <button
                type="button"
                onClick={() => toggleTrackMute(musicTrack)}
                className={`p-0.5 text-[9px] font-mono cursor-pointer transition-colors ${
                  musicTrack.muted ? "text-rose-600 font-bold" : "text-slate-400 hover:text-slate-700"
                }`}
                title={musicTrack.muted ? "Unmute Music" : "Mute Music"}
              >
                {musicTrack.muted ? <VolumeX className="w-3 h-3 text-rose-500" /> : <Volume2 className="w-3 h-3 text-slate-500" />}
              </button>
            </div>
          )}

          {/* SFX Track Header */}
          {sfxTrack && (
            <div className="h-8 px-2.5 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-800 bg-white">
              <div className="flex items-center gap-1.5 min-w-0">
                <Bell className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span className="text-[10px] leading-tight truncate">SFX (A3)</span>
              </div>
              <button
                type="button"
                onClick={() => toggleTrackMute(sfxTrack)}
                className={`p-0.5 text-[9px] font-mono cursor-pointer transition-colors ${
                  sfxTrack.muted ? "text-rose-600 font-bold" : "text-slate-400 hover:text-slate-700"
                }`}
                title={sfxTrack.muted ? "Unmute SFX" : "Mute SFX"}
              >
                {sfxTrack.muted ? <VolumeX className="w-3 h-3 text-rose-500" /> : <Volume2 className="w-3 h-3 text-slate-500" />}
              </button>
            </div>
          )}
        </div>

        {/* Tracks Canvas Area */}
        <div
          ref={rulerRef}
          onMouseDown={(e) => {
            handleSeekFromClientX(e.clientX);
            setIsScrubbingPlayhead(true);
          }}
          className="relative flex-1 flex flex-col cursor-pointer"
          style={{ width: `${timelinePixelWidth}px`, minWidth: "100%" }}
        >
          {/* Time Ruler */}
          <div className="h-6 border-b border-slate-200 relative bg-slate-100/90 overflow-hidden">
            {/* In / Out Selection Shaded Region */}
            {inPoint !== null && outPoint !== null && outPoint > inPoint && (
              <div
                className="absolute top-0 bottom-0 bg-blue-500/15 border-x border-blue-500/50 pointer-events-none"
                style={{
                  left: `${inPoint * zoomFactor}px`,
                  width: `${(outPoint - inPoint) * zoomFactor}px`,
                }}
              />
            )}

            {/* Minor Ticks */}
            {minorTicks.map((t) => (
              <div
                key={`min_${t}`}
                className="absolute bottom-0 w-[1px] h-1.5 bg-slate-300 pointer-events-none"
                style={{ left: `${t * zoomFactor}px` }}
              />
            ))}

            {/* Major Ticks */}
            {majorTicks.map(({ time, label }) => {
              const x = time * zoomFactor;
              return (
                <div
                  key={`maj_${time}`}
                  className="absolute top-0 bottom-0 flex flex-col justify-end pointer-events-none"
                  style={{ left: `${x}px` }}
                >
                  <div className="w-[1.5px] h-3 bg-slate-400" />
                  <span className="text-[8px] font-mono text-slate-500 absolute -top-0.5 -left-2.5">
                    {label}
                  </span>
                </div>
              );
            })}

            {/* Markers on Ruler */}
            {timeline.settings?.markers?.map((mk) => (
              <div
                key={mk.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (e.shiftKey) {
                    onDeleteMarker?.(mk.id);
                  } else {
                    onSeek(mk.time);
                  }
                }}
                className="absolute top-0 bottom-0 flex items-center justify-center cursor-pointer group z-15"
                style={{ left: `${mk.time * zoomFactor - 5}px` }}
                title={`${mk.label} (Click to seek, Shift+Click to remove)`}
              >
                <span className="text-xs -mt-1 group-hover:scale-125 transition-transform">🚩</span>
              </div>
            ))}
          </div>

          {/* Magnetic Snap Vertical Guideline Indicator */}
          {dragState?.snappedTime !== undefined && (
            <div
              className="absolute top-0 bottom-0 w-[1.5px] bg-cyan-400 z-40 pointer-events-none shadow-sm"
              style={{ left: `${dragState.snappedTime * zoomFactor}px` }}
            />
          )}

          {/* TRACK: V2 Overlays */}
          {overlayTrack && (
            <div
              data-track-type="overlays"
              className={`h-10 border-b border-slate-200 relative transition-colors ${
                dragState?.hoveredTargetTrack === "overlays" && dragState.trackType !== "overlays"
                  ? "bg-pink-100/50"
                  : "bg-slate-50/40"
              }`}
            >
              {overlayTrack.items.map((clip) => {
                const isDraggingThis =
                  dragState?.trackType === "overlays" && dragState?.itemId === clip.id;

                let renderStartTime = clip.startTime;
                let renderEndTime = clip.endTime;
                if (isDraggingThis) {
                  if (dragState.mode === "move") {
                    renderStartTime = Math.max(0, clip.startTime + dragState.currentDeltaTime);
                    renderEndTime = renderStartTime + clip.duration;
                  } else if (dragState.mode === "trim-start") {
                    renderStartTime = Math.max(
                      0,
                      Math.min(clip.endTime - 0.3, clip.startTime + dragState.currentDeltaTime)
                    );
                  } else if (dragState.mode === "trim-end") {
                    renderEndTime = Math.max(
                      clip.startTime + 0.3,
                      clip.endTime + dragState.currentDeltaTime
                    );
                  }
                }

                const left = renderStartTime * zoomFactor;
                const width = Math.max(20, (renderEndTime - renderStartTime) * zoomFactor);
                const isSelected = effectiveSelectedIds.includes(clip.id);

                return (
                  <div
                    key={clip.id}
                    onMouseDown={(e) => handleClipMouseDown(e, clip, "overlays")}
                    onContextMenu={(e) => handleClipContextMenu(e, clip, "overlays")}
                    className={`absolute top-1 bottom-1 rounded-lg border px-2 flex items-center overflow-hidden text-[9px] font-mono select-none cursor-grab active:cursor-grabbing shadow-2xs group ${
                      isSelected
                        ? "bg-pink-600 border-pink-700 text-white font-bold ring-2 ring-pink-400 z-10"
                        : "bg-pink-100 border-pink-300 text-pink-900 hover:bg-pink-200"
                    }`}
                    style={{ left: `${left}px`, width: `${width}px` }}
                  >
                    <span className="truncate">{clip.metadata?.title || "Overlay Item"}</span>

                    {/* Keyframe indicators */}
                    {clip.keyframes && clip.keyframes.length > 0 && (
                      <div className="absolute inset-x-0 bottom-0.5 h-2 pointer-events-none z-20 flex">
                        {clip.keyframes.map((kf) => {
                          const kfPercent = Math.max(0, Math.min(100, (kf.time / Math.max(0.1, clip.duration)) * 100));
                          return (
                            <div
                              key={kf.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSeek(clip.startTime + kf.time);
                              }}
                              className="absolute w-2 h-2 -ml-1 bg-amber-400 hover:bg-amber-300 border border-amber-600 rotate-45 pointer-events-auto cursor-pointer shadow-xs transition-transform hover:scale-125"
                              style={{ left: `${kfPercent}%` }}
                              title={`Keyframe: ${kf.property} = ${kf.value} (${kf.easing || "linear"})`}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TRACK 1: Video / B-Roll Track (Supports Drag & Drop + Moving + Trimming + Keyframes) */}
          <div
            data-track-type="video"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              if (rulerRef.current) {
                const rect = rulerRef.current.getBoundingClientRect();
                const hoverTime = Math.max(0, (e.clientX - rect.left) / zoomFactor);
                setBrollDropHoverTime(Math.round(hoverTime * 10) / 10);
              }
            }}
            onDragLeave={() => {
              setBrollDropHoverTime(null);
              setHoveredClipDropTargetId(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const hoverT = brollDropHoverTime;
              setBrollDropHoverTime(null);
              setHoveredClipDropTargetId(null);
              const dataStr = e.dataTransfer.getData("application/json");
              if (!dataStr) return;
              try {
                const data = JSON.parse(dataStr);
                if (data.type === "broll") {
                  onDropBRoll(data, hoverT ?? currentTime);
                }
              } catch (err) {
                console.warn("Invalid drop data:", err);
              }
            }}
            className={`h-14 border-b border-slate-200 relative transition-colors ${
              dragState?.hoveredTargetTrack === "video" && dragState.trackType !== "video"
                ? "bg-blue-100/50"
                : "bg-slate-50/70"
            }`}
          >
            {/* Visual B-Roll Drop Indicator Line */}
            {brollDropHoverTime !== null && (
              <div
                className="absolute top-0 bottom-0 w-[2px] bg-blue-600 z-30 pointer-events-none shadow-md"
                style={{ left: `${brollDropHoverTime * zoomFactor}px` }}
              >
                <div className="px-1.5 py-0.5 rounded bg-blue-600 text-[8px] font-mono text-white font-bold whitespace-nowrap -ml-6 -mt-5 shadow-xs">
                  Drop B-Roll at {brollDropHoverTime.toFixed(1)}s
                </div>
              </div>
            )}

            {videoTrack?.items.map((clip) => {
              const isDraggingThis =
                dragState?.trackType === "video" && dragState?.itemId === clip.id;

              let renderStartTime = clip.startTime;
              let renderEndTime = clip.endTime;
              if (isDraggingThis) {
                if (dragState.mode === "move") {
                  renderStartTime = Math.max(0, clip.startTime + dragState.currentDeltaTime);
                  renderEndTime = renderStartTime + clip.duration;
                } else if (dragState.mode === "trim-start") {
                  renderStartTime = Math.max(
                    0,
                    Math.min(clip.endTime - 0.3, clip.startTime + dragState.currentDeltaTime)
                  );
                } else if (dragState.mode === "trim-end") {
                  renderEndTime = Math.max(
                    clip.startTime + 0.3,
                    clip.endTime + dragState.currentDeltaTime
                  );
                }
              }

              const left = renderStartTime * zoomFactor;
              const width = Math.max(24, (renderEndTime - renderStartTime) * zoomFactor);
              const isSelected = effectiveSelectedIds.includes(clip.id);
              const isClipDropTarget = hoveredClipDropTargetId === clip.id;

              return (
                <div
                  key={clip.id}
                  onMouseDown={(e) => handleClipMouseDown(e, clip, "video")}
                  onContextMenu={(e) => handleClipContextMenu(e, clip, "video")}
                  onDragOver={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setHoveredClipDropTargetId(clip.id);
                  }}
                  onDragLeave={() => {
                    if (hoveredClipDropTargetId === clip.id) {
                      setHoveredClipDropTargetId(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setHoveredClipDropTargetId(null);
                    const dataStr = e.dataTransfer.getData("application/json");
                    if (!dataStr) return;
                    try {
                      const data = JSON.parse(dataStr);
                      if (data.type === "broll") {
                        onDropBRoll(data, clip.startTime, clip.id);
                      }
                    } catch {}
                  }}
                  className={`absolute top-1 bottom-1 rounded-xl border flex items-center overflow-hidden transition-all select-none group cursor-grab active:cursor-grabbing shadow-xs ${
                    isClipDropTarget
                      ? "border-blue-600 bg-blue-100 ring-2 ring-blue-500 z-20"
                      : isSelected
                      ? "bg-blue-600 border-blue-700 text-white ring-2 ring-blue-400 z-10"
                      : "bg-white border-slate-300 hover:border-slate-400 text-slate-800"
                  }`}
                  style={{ left: `${left}px`, width: `${width}px` }}
                  title={`${clip.metadata?.title || "B-Roll Scene"} (${(
                    renderEndTime - renderStartTime
                  ).toFixed(1)}s)`}
                >
                  {/* Left Trim Handle */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-3 hover:w-3.5 bg-blue-500/30 hover:bg-blue-500 flex items-center justify-center cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity z-20"
                    title="Drag to trim start"
                  >
                    <div className="w-[1px] h-3 bg-white rounded-full" />
                  </div>

                  {/* Thumbnail */}
                  {clip.metadata?.thumbnail && (
                    <img
                      src={clip.metadata.thumbnail}
                      alt="thumb"
                      className="w-10 h-full object-cover shrink-0 pointer-events-none border-r border-slate-200"
                    />
                  )}

                  {/* Clip Info */}
                  <div className="flex-1 flex flex-col justify-center px-1.5 min-w-0 pointer-events-none">
                    <span className={`text-[10px] font-bold truncate ${isSelected ? "text-white" : "text-slate-900"}`}>
                      {clip.metadata?.title || "B-Roll Scene"}
                    </span>
                    <div className="flex items-center gap-1 text-[8px] font-mono">
                      <span className={isSelected ? "text-blue-100" : "text-slate-500"}>
                        {(renderEndTime - renderStartTime).toFixed(1)}s
                      </span>
                      {clip.speed && clip.speed !== 1 && (
                        <span className={`font-bold ${isSelected ? "text-amber-300" : "text-amber-600"}`}>
                          {clip.speed}x
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Trim Handle */}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-3 hover:w-3.5 bg-blue-500/30 hover:bg-blue-500 flex items-center justify-center cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity z-20"
                    title="Drag to trim end"
                  >
                    <div className="w-[1px] h-3 bg-white rounded-full" />
                  </div>

                  {/* Live Dragging Tooltip */}
                  {isDraggingThis && (
                    <div className="absolute top-0.5 left-2 px-1.5 py-0.5 rounded bg-slate-900 text-white text-[8px] font-mono font-bold shadow pointer-events-none z-30">
                      {renderStartTime.toFixed(1)}s - {renderEndTime.toFixed(1)}s
                    </div>
                  )}

                  {/* Keyframe diamonds on timeline bar */}
                  {clip.keyframes && clip.keyframes.length > 0 && (
                    <div className="absolute inset-x-0 bottom-0.5 h-2 pointer-events-none z-20 flex">
                      {clip.keyframes.map((kf) => {
                        const kfPercent = Math.max(0, Math.min(100, (kf.time / Math.max(0.1, clip.duration)) * 100));
                        return (
                          <div
                            key={kf.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSeek(clip.startTime + kf.time);
                            }}
                            className="absolute w-2 h-2 -ml-1 bg-amber-400 hover:bg-amber-300 border border-amber-600 rotate-45 pointer-events-auto cursor-pointer shadow-xs transition-transform hover:scale-125"
                            style={{ left: `${kfPercent}%` }}
                            title={`Keyframe: ${kf.property} = ${kf.value} (${kf.easing || "linear"})`}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* TRACK: Text Overlays Track */}
          {textTrack && (
            <div
              data-track-type="text"
              className="h-8 border-b border-slate-200 relative bg-slate-50/40"
            >
              {textTrack.items.map((txt) => {
                const left = txt.startTime * zoomFactor;
                const width = Math.max(20, txt.duration * zoomFactor);
                const isSelected = effectiveSelectedIds.includes(txt.id);
                return (
                  <div
                    key={txt.id}
                    onMouseDown={(e) => handleClipMouseDown(e, txt, "text")}
                    onContextMenu={(e) => handleClipContextMenu(e, txt, "text")}
                    className={`absolute top-0.5 bottom-0.5 rounded-lg border px-1.5 flex items-center overflow-hidden text-[9px] font-mono cursor-grab active:cursor-grabbing shadow-2xs ${
                      isSelected
                        ? "bg-amber-500 border-amber-600 text-white font-bold ring-2 ring-amber-300 z-10"
                        : "bg-amber-100 border-amber-300 text-amber-900 hover:bg-amber-200"
                    }`}
                    style={{ left: `${left}px`, width: `${width}px` }}
                  >
                    <span className="truncate">{txt.source}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* TRACK 2: Captions Track (Fully Movable & Trimmable) */}
          <div
            data-track-type="captions"
            className="h-9 border-b border-slate-200 relative bg-slate-50/60"
          >
            {captionTrack?.items.map((cap) => {
              const isDraggingThis =
                dragState?.trackType === "captions" && dragState?.itemId === cap.id;

              let renderStartTime = cap.startTime;
              let renderEndTime = cap.endTime;
              if (isDraggingThis) {
                if (dragState.mode === "move") {
                  renderStartTime = Math.max(0, cap.startTime + dragState.currentDeltaTime);
                  renderEndTime = renderStartTime + cap.duration;
                } else if (dragState.mode === "trim-start") {
                  renderStartTime = Math.max(
                    0,
                    Math.min(cap.endTime - 0.3, cap.startTime + dragState.currentDeltaTime)
                  );
                } else if (dragState.mode === "trim-end") {
                  renderEndTime = Math.max(
                    cap.startTime + 0.3,
                    cap.endTime + dragState.currentDeltaTime
                  );
                }
              }

              const left = renderStartTime * zoomFactor;
              const width = Math.max(20, (renderEndTime - renderStartTime) * zoomFactor);
              const isCurrent = currentTime >= cap.startTime && currentTime <= cap.endTime;
              const isSelected = effectiveSelectedIds.includes(cap.id);

              return (
                <div
                  key={cap.id}
                  onMouseDown={(e) => handleClipMouseDown(e, cap, "captions")}
                  onContextMenu={(e) => handleClipContextMenu(e, cap, "captions")}
                  className={`absolute top-0.5 bottom-0.5 rounded-lg border px-1.5 flex items-center overflow-hidden transition-all text-[9px] font-mono select-none group cursor-grab active:cursor-grabbing shadow-2xs ${
                    isSelected
                      ? "bg-sky-600 border-sky-700 text-white font-bold ring-2 ring-sky-300 z-10"
                      : isCurrent
                      ? "bg-sky-200 border-sky-400 text-sky-950 font-bold"
                      : "bg-sky-50 border-sky-200 text-sky-950 hover:bg-sky-100"
                  }`}
                  style={{ left: `${left}px`, width: `${width}px` }}
                  title={`Caption: "${cap.source}"`}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-2 hover:bg-sky-400 flex items-center justify-center cursor-ew-resize opacity-0 group-hover:opacity-100 z-10">
                    <div className="w-[1px] h-2.5 bg-white" />
                  </div>

                  <span className="truncate flex-1 pointer-events-none">{cap.source}</span>

                  <div className="absolute right-0 top-0 bottom-0 w-2 hover:bg-sky-400 flex items-center justify-center cursor-ew-resize opacity-0 group-hover:opacity-100 z-10">
                    <div className="w-[1px] h-2.5 bg-white" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* TRACK 3: Voiceover Track with Waveform */}
          <div
            data-track-type="voiceover"
            className={`h-8 border-b border-slate-200 relative transition-colors ${
              dragState?.hoveredTargetTrack === "voiceover" && dragState.trackType !== "voiceover"
                ? "bg-emerald-100/50"
                : "bg-slate-50/40"
            }`}
          >
            {voiceoverTrack?.items.map((vo) => {
              const isDraggingThis =
                dragState?.trackType === "voiceover" && dragState?.itemId === vo.id;
              let renderStartTime = vo.startTime;
              if (isDraggingThis && dragState.mode === "move") {
                renderStartTime = Math.max(0, vo.startTime + dragState.currentDeltaTime);
              }

              const left = renderStartTime * zoomFactor;
              const width = Math.max(24, vo.duration * zoomFactor);
              const isSelected = effectiveSelectedIds.includes(vo.id);
              return (
                <div
                  key={vo.id}
                  onMouseDown={(e) => handleClipMouseDown(e, vo, "voiceover")}
                  onContextMenu={(e) => handleClipContextMenu(e, vo, "voiceover")}
                  className={`absolute top-0.5 bottom-0.5 rounded-md border px-2 flex items-center justify-between text-[8px] font-mono overflow-hidden shadow-2xs cursor-grab ${
                    isSelected
                      ? "bg-emerald-600 border-emerald-700 text-white font-bold ring-2 ring-emerald-300"
                      : "bg-emerald-50 border-emerald-300 text-emerald-950"
                  }`}
                  style={{ left: `${left}px`, width: `${width}px` }}
                >
                  {renderAudioWaveform(width, 24, isSelected ? "#FFFFFF" : "#059669")}
                  <span className="truncate font-semibold z-10 relative">🎙️ Voiceover</span>
                  <span className="text-[7px] text-emerald-700 font-medium z-10 relative">
                    {vo.duration.toFixed(1)}s
                  </span>
                </div>
              );
            })}
          </div>

          {/* TRACK 4: Background Music Track with Waveform */}
          <div
            data-track-type="music"
            className={`h-8 border-b border-slate-200 relative transition-colors ${
              dragState?.hoveredTargetTrack === "music" && dragState.trackType !== "music"
                ? "bg-purple-100/50"
                : "bg-slate-50/40"
            }`}
          >
            {musicTrack?.items.map((mus) => {
              const isDraggingThis =
                dragState?.trackType === "music" && dragState?.itemId === mus.id;
              let renderStartTime = mus.startTime;
              if (isDraggingThis && dragState.mode === "move") {
                renderStartTime = Math.max(0, mus.startTime + dragState.currentDeltaTime);
              }

              const left = renderStartTime * zoomFactor;
              const width = Math.max(24, mus.duration * zoomFactor);
              const isSelected = effectiveSelectedIds.includes(mus.id);
              return (
                <div
                  key={mus.id}
                  onMouseDown={(e) => handleClipMouseDown(e, mus, "music")}
                  onContextMenu={(e) => handleClipContextMenu(e, mus, "music")}
                  className={`absolute top-0.5 bottom-0.5 rounded-md border px-2 flex items-center justify-between text-[8px] font-mono overflow-hidden shadow-2xs cursor-grab ${
                    isSelected
                      ? "bg-purple-600 border-purple-700 text-white font-bold ring-2 ring-purple-300"
                      : "bg-purple-50 border-purple-300 text-purple-950"
                  }`}
                  style={{ left: `${left}px`, width: `${width}px` }}
                >
                  {renderAudioWaveform(width, 24, isSelected ? "#FFFFFF" : "#7C3AED")}
                  <span className="truncate font-semibold z-10 relative">
                    🎵 {mus.metadata?.title || "Music"}
                  </span>
                  <span className="text-[7px] text-purple-700 font-medium z-10 relative">
                    Vol: {Math.round((timeline.settings?.musicVolume ?? 0.16) * 100)}%
                  </span>
                </div>
              );
            })}
          </div>

          {/* TRACK 5: SFX Track */}
          {sfxTrack && (
            <div
              data-track-type="sfx"
              className={`h-8 border-b border-slate-200 relative transition-colors ${
                dragState?.hoveredTargetTrack === "sfx" && dragState.trackType !== "sfx"
                  ? "bg-teal-100/50"
                  : "bg-slate-50/40"
              }`}
            >
              {sfxTrack.items.map((sfx) => {
                const isDraggingThis =
                  dragState?.trackType === "sfx" && dragState?.itemId === sfx.id;
                let renderStartTime = sfx.startTime;
                if (isDraggingThis && dragState.mode === "move") {
                  renderStartTime = Math.max(0, sfx.startTime + dragState.currentDeltaTime);
                }

                const left = renderStartTime * zoomFactor;
                const width = Math.max(16, sfx.duration * zoomFactor);
                const isSelected = effectiveSelectedIds.includes(sfx.id);
                return (
                  <div
                    key={sfx.id}
                    onMouseDown={(e) => handleClipMouseDown(e, sfx, "sfx")}
                    onContextMenu={(e) => handleClipContextMenu(e, sfx, "sfx")}
                    className={`absolute top-0.5 bottom-0.5 rounded-md border px-1.5 flex items-center text-[8px] font-mono overflow-hidden cursor-grab shadow-2xs ${
                      isSelected
                        ? "bg-teal-600 border-teal-700 text-white font-bold ring-2 ring-teal-300"
                        : "bg-teal-100 border-teal-300 text-teal-950"
                    }`}
                    style={{ left: `${left}px`, width: `${width}px` }}
                  >
                    <span className="truncate">🔔 {sfx.metadata?.title || "SFX"}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* PLAYHEAD (Scrubbable Needle with Precision Line) */}
          <div
            className="absolute top-0 bottom-0 pointer-events-none z-30"
            style={{ left: `${currentTime * zoomFactor}px` }}
          >
            {/* Playhead Flag Handle */}
            <div className="w-3.5 h-3.5 -ml-[6px] -mt-0.5 bg-rose-500 rotate-45 rounded-xs shadow-md flex items-center justify-center">
              <div className="w-1 h-1 bg-white rounded-full" />
            </div>
            {/* Playhead Vertical Line */}
            <div className="w-[1.5px] h-full bg-rose-500 shadow-xs" />
          </div>
        </div>
      </div>

      {/* 3. CLIP RIGHT-CLICK CONTEXT MENU */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border border-slate-200 py-1.5 w-52 text-xs font-medium text-slate-800 animate-in fade-in zoom-in-95 duration-100 select-none"
          style={{
            left: Math.min(typeof window !== "undefined" ? window.innerWidth - 220 : 0, contextMenu.x),
            top: Math.min(typeof window !== "undefined" ? window.innerHeight - 360 : 0, contextMenu.y),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-[10px] font-mono text-slate-400 border-b border-slate-100 truncate">
            {contextMenu.item.metadata?.title || contextMenu.item.source || "Clip Options"}
          </div>

          {/* Cut */}
          <button
            type="button"
            onClick={() => {
              onCutClip?.(contextMenu.trackType, contextMenu.item.id);
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 text-left cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Scissors className="w-3.5 h-3.5 text-slate-500" /> Cut
            </span>
            <span className="text-[10px] font-mono text-slate-400">Ctrl+X</span>
          </button>

          {/* Copy */}
          <button
            type="button"
            onClick={() => {
              onCopyClip?.(contextMenu.item);
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 text-left cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Copy className="w-3.5 h-3.5 text-slate-500" /> Copy
            </span>
            <span className="text-[10px] font-mono text-slate-400">Ctrl+C</span>
          </button>

          {/* Duplicate */}
          <button
            type="button"
            onClick={() => {
              onDuplicateClip?.(contextMenu.trackType, contextMenu.item.id);
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 text-left cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-slate-500" /> Duplicate
            </span>
            <span className="text-[10px] font-mono text-slate-400">Ctrl+D</span>
          </button>

          {/* Split at Playhead */}
          <button
            type="button"
            onClick={() => {
              onSplitClip?.(currentTime, contextMenu.item.id);
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 text-left cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Scissors className="w-3.5 h-3.5 text-amber-500" /> Split at Playhead
            </span>
            <span className="text-[10px] font-mono text-slate-400">S</span>
          </button>

          <div className="h-px bg-slate-100 my-1" />

          {/* Detach Audio (Video & Overlay Tracks) */}
          {(contextMenu.trackType === "video" || contextMenu.trackType === "overlays") && (
            <button
              type="button"
              onClick={() => {
                onDetachAudio?.(contextMenu.trackType, contextMenu.item.id);
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-slate-100 text-left cursor-pointer text-blue-600 font-semibold"
            >
              <Mic className="w-3.5 h-3.5" /> Detach Audio
            </button>
          )}

          {/* Mute Clip */}
          <button
            type="button"
            onClick={() => {
              onToggleClipMute?.(contextMenu.trackType, contextMenu.item.id);
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-slate-100 text-left cursor-pointer"
          >
            <Volume2 className="w-3.5 h-3.5 text-slate-500" />
            {contextMenu.item.volume === 0 ? "Unmute Clip" : "Mute Clip"}
          </button>

          {/* Speed Presets */}
          {onChangeClipSpeed && (
            <div className="px-3 py-1 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] font-mono text-slate-400">Speed:</span>
              <div className="flex gap-1 font-mono text-[9px]">
                {[0.5, 1, 1.5, 2].map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => {
                      onChangeClipSpeed(contextMenu.trackType, contextMenu.item.id, spd);
                      setContextMenu(null);
                    }}
                    className={`px-1 py-0.5 rounded cursor-pointer ${
                      contextMenu.item.speed === spd
                        ? "bg-slate-900 text-white font-bold"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="h-px bg-slate-100 my-1" />

          {/* Ripple Delete */}
          <button
            type="button"
            onClick={() => {
              onRippleDeleteClip?.(contextMenu.trackType, contextMenu.item.id);
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-amber-50 text-amber-700 text-left cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <FastForward className="w-3.5 h-3.5 text-amber-600" /> Ripple Delete
            </span>
          </button>

          {/* Delete */}
          <button
            type="button"
            onClick={() => {
              onDeleteClip?.(contextMenu.trackType, contextMenu.item.id);
              setContextMenu(null);
            }}
            className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-rose-50 text-rose-600 text-left cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5 text-rose-500" /> Delete
            </span>
            <span className="text-[10px] font-mono text-slate-400">Del</span>
          </button>
        </div>
      )}
    </div>
  );
}
