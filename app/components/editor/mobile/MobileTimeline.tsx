"use client";

import React, { memo, useRef, useState, useEffect, useMemo, useCallback } from "react";
import { Captions, Layers, Film, Music, Sparkles, EyeOff, Target } from "lucide-react";
import { Clip, MediaAsset, clamp, projectDuration } from "@/app/lib/editor/model";
import { trimClip, changeTrack, moveClip } from "@/app/lib/editor/operations";
import { usePlayback, useProject } from "@/app/lib/editor/store";
import { pointerEdit } from "@/app/lib/editor/interaction";
import { useEditor } from "../workspace/EditorContext";

const CompactWaveform = memo(function CompactWaveform({
  clip,
  asset,
  width,
  colorClass,
}: {
  clip: Clip;
  asset?: MediaAsset;
  width: number;
  colorClass: string;
}) {
  const peaks = asset?.waveform;
  if (peaks && peaks.length > 0) {
    const count = Math.min(80, Math.max(6, Math.floor(width / 4)));
    const path = Array.from({ length: count }, (_, i) => {
      const src = clip.sourceStart + (i / count) * (clip.sourceEnd - clip.sourceStart);
      const peak =
        peaks[
          Math.min(peaks.length - 1, Math.floor((src / (asset.duration || 1)) * peaks.length))
        ] || 0;
      return `M${(i / count) * 100},${50 - peak * 42}V${50 + peak * 42}`;
    }).join(" ");
    return (
      <svg
        className={`absolute inset-0 w-full h-full pointer-events-none opacity-50 ${colorClass}`}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d={path} stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }

  // Fallback decorative waveform bars for tracks without extracted PCM waveform
  const barCount = Math.min(28, Math.max(4, Math.floor(width / 7)));
  return (
    <div className="absolute inset-0 flex items-center justify-around px-1 opacity-30 pointer-events-none">
      {Array.from({ length: barCount }).map((_, i) => (
        <div
          key={i}
          className={`w-[2px] rounded-full ${colorClass.replace("text-", "bg-")}`}
          style={{ height: `${25 + ((i * 29) % 55)}%` }}
        />
      ))}
    </div>
  );
});

const CompactFilmstrip = memo(function CompactFilmstrip({
  clip,
  asset,
  width,
}: {
  clip: Clip;
  asset?: MediaAsset;
  width: number;
}) {
  if (!asset?.thumbnail) return null;
  const frames = asset.thumbnails || [asset.thumbnail];
  const count = Math.min(14, Math.max(1, Math.ceil(width / 46)));
  return (
    <div className="absolute inset-0 flex overflow-hidden opacity-35 pointer-events-none">
      {Array.from({ length: count }).map((_, i) => (
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
});

export default function MobileTimeline() {
  const { store, playback, selection, select, notify, run, detectedSilences = [] } = useEditor();
  const project = useProject(store);
  const { time, playing } = usePlayback(playback);

  const [pps, setPps] = useState(56); // Pixels per second (pinch-zoomable: 20 - 240)
  const [containerWidth, setContainerWidth] = useState(390);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const isSyncingFromPlaybackRef = useRef(false);
  const isUserScrollingRef = useRef(false);
  const userScrollTimerRef = useRef<number | null>(null);
  const lastSnappedEdgeRef = useRef<number | null>(null);

  // Two-finger pinch state
  const pinchDistRef = useRef<number | null>(null);
  const pinchStartPpsRef = useRef<number>(56);
  const pinchAnchorTimeRef = useRef<number>(0);

  // Mouse drag-to-pan support for desktop testing
  const mousePanRef = useRef<{ startX: number; startScrollLeft: number } | null>(null);

  const duration = projectDuration(project);
  const halfWidth = Math.max(120, Math.floor(containerWidth / 2));
  const selectedClip = selection[0] ? project.clips[selection[0]] : undefined;

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth || 390);
    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();
    return () => observer.disconnect();
  }, []);

  // Collect clips grouped into the 4 compact mobile tracks:
  // Track 1: Captions / Text (amber)
  // Track 2: Overlay / B-Roll (cyan)
  // Track 3: Main Video (indigo)
  // Track 4: Audio / SFX (violet)
  const trackGroups = useMemo(() => {
    const captionsAndText: Clip[] = [];
    const overlays: Clip[] = [];
    const mainVideo: Clip[] = [];
    const audioClips: Clip[] = [];

    for (const trackId of project.trackOrder) {
      const track = project.tracks[trackId];
      if (!track || track.hidden) continue;
      for (const clipId of track.clipIds) {
        const clip = project.clips[clipId];
        if (!clip) continue;
        if (track.kind === "caption" || track.kind === "text") {
          captionsAndText.push(clip);
        } else if (track.kind === "overlay" || track.kind === "image") {
          overlays.push(clip);
        } else if (track.kind === "video") {
          mainVideo.push(clip);
        } else if (track.kind === "audio") {
          audioClips.push(clip);
        }
      }
    }
    return { captionsAndText, overlays, mainVideo, audioClips };
  }, [project.trackOrder, project.tracks, project.clips]);

  const hiddenTracks = useMemo(() => {
    return project.trackOrder.map((id) => project.tracks[id]).filter((t) => t?.hidden);
  }, [project.trackOrder, project.tracks]);

  // All clip edges for haptic snap pulses while scrubbing
  const clipEdges = useMemo(() => {
    const edges = new Set<number>([0]);
    for (const c of Object.values(project.clips)) {
      edges.add(Number(c.startTime.toFixed(2)));
      edges.add(Number((c.startTime + c.duration).toFixed(2)));
    }
    return Array.from(edges);
  }, [project.clips]);

  // Synchronize scrollLeft when playback advances or external seek happens
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || isUserScrollingRef.current) return;
    const targetScrollLeft = time * pps;
    if (Math.abs(el.scrollLeft - targetScrollLeft) > 0.75) {
      isSyncingFromPlaybackRef.current = true;
      el.scrollLeft = targetScrollLeft;
      requestAnimationFrame(() => {
        isSyncingFromPlaybackRef.current = false;
      });
    }
  }, [time, pps]);

  const handleScroll = useCallback(() => {
    if (isSyncingFromPlaybackRef.current) return;
    const el = scrollerRef.current;
    if (!el) return;

    isUserScrollingRef.current = true;
    if (userScrollTimerRef.current) window.clearTimeout(userScrollTimerRef.current);
    userScrollTimerRef.current = window.setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 140);

    const nextTime = clamp(el.scrollLeft / pps, 0, Math.max(duration, 0));
    if (playing) {
      playback.set(nextTime, false);
    } else {
      playback.set(nextTime, false);
    }

    // Haptic pulse when crossing a clip boundary edge
    const hitEdge = clipEdges.find((edge) => Math.abs(edge - nextTime) < 0.045);
    if (hitEdge !== undefined && lastSnappedEdgeRef.current !== hitEdge) {
      lastSnappedEdgeRef.current = hitEdge;
      navigator.vibrate?.(10);
    } else if (hitEdge === undefined) {
      lastSnappedEdgeRef.current = null;
    }
  }, [pps, duration, playing, playback, clipEdges]);

  // Two-finger pinch-to-zoom timeline scale
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      pinchDistRef.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartPpsRef.current = pps;
      pinchAnchorTimeRef.current = playback.getSnapshot().time;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchDistRef.current) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const nextPps = clamp(pinchStartPpsRef.current * (dist / pinchDistRef.current), 20, 240);
      setPps(nextPps);
      const el = scrollerRef.current;
      if (el) {
        isSyncingFromPlaybackRef.current = true;
        el.scrollLeft = pinchAnchorTimeRef.current * nextPps;
        requestAnimationFrame(() => {
          isSyncingFromPlaybackRef.current = false;
        });
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      pinchDistRef.current = null;
    }
  };

  // Mouse drag scrolling for DevTools mouse testing
  const handleMouseDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || (e.target as HTMLElement).closest("[data-trim-handle]")) return;
    const el = scrollerRef.current;
    if (!el) return;
    mousePanRef.current = { startX: e.clientX, startScrollLeft: el.scrollLeft };
    const onMove = (ev: PointerEvent) => {
      if (!mousePanRef.current || !scrollerRef.current) return;
      const dx = ev.clientX - mousePanRef.current.startX;
      scrollerRef.current.scrollLeft = mousePanRef.current.startScrollLeft - dx;
    };
    const onUp = () => {
      mousePanRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  // Trim selected clip directly from mobile handle
  const handleTrimClip = (e: React.PointerEvent, clip: Clip, edge: "left" | "right") => {
    e.stopPropagation();
    e.preventDefault();
    if (project.tracks[clip.trackId]?.locked) {
      notify("Unlock track to trim.");
      return;
    }
    const startX = e.clientX;
    const initialBoundary = edge === "left" ? clip.startTime : clip.startTime + clip.duration;
    pointerEdit(
      store,
      (ev) => (p) => {
        const delta = (ev.clientX - startX) / pps;
        return trimClip(p, clip.id, edge, initialBoundary + delta);
      },
      notify
    );
  };

  const totalTimelineTime = Math.max(duration + 4, 15);
  const trackAreaWidth = totalTimelineTime * pps + containerWidth;
  const tickStep = pps < 32 ? 5 : pps < 75 ? 2 : 1;
  const tickCount = Math.ceil(totalTimelineTime / tickStep) + 1;

  return (
    <section
      className="h-[160px] flex-shrink-0 w-full bg-[#0E0E12] border-t border-[#26262E] relative overflow-hidden select-none"
      aria-label="CapCut Mobile Touch Timeline"
    >
      {/* Hidden Tracks Unhide Bar */}
      {hiddenTracks.length > 0 && (
        <div className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-3 py-1 bg-[#1C1C24]/95 backdrop-blur border-b border-[#2E2E38] text-[10px] text-amber-300 shadow-md">
          <div className="flex items-center gap-1.5 font-medium">
            <EyeOff size={11} className="text-amber-400" />
            <span>{hiddenTracks.length} hidden {hiddenTracks.length === 1 ? "track" : "tracks"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => run((p) => hiddenTracks.reduce((next, t) => changeTrack(next, t.id, { hidden: false }), p))}
              className="bg-[#2A2A36] border border-[#3A3A4A] rounded px-1.5 py-0.5 text-white font-semibold hover:bg-white/10"
            >
              Unhide All
            </button>
            {hiddenTracks.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => run((p) => changeTrack(p, t.id, { hidden: false }))}
                className="bg-[#2A2A36] border border-[#3A3A4A] rounded px-1.5 py-0.5 text-white font-semibold hover:bg-white/10"
              >
                Unhide {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Center-Fixed Static Vertical Red Playhead with CapCut Top Pointer Indicator */}
      <div
        className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-red-500 z-30 pointer-events-none shadow-xs"
        aria-hidden="true"
      >
        {/* CapCut mobile red top pointer needle indicator */}
        <div className="absolute -top-[1px] left-1/2 -translate-x-1/2 flex flex-col items-center">
          <div className="w-3.5 h-3 bg-red-500 rounded-t-xs shadow flex items-center justify-center">
            <div className="w-1 h-1 rounded-full bg-white/60" />
          </div>
          <div className="w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-t-[6px] border-t-red-500 -mt-[0.5px]" />
        </div>
      </div>

      {/* Floating Micro-Nudge & Alignment Bar for Selected Clip */}
      {selectedClip && (
        <div className="absolute top-1 right-2 z-35 flex items-center gap-1 bg-white/95 backdrop-blur-md px-2 py-0.5 rounded-lg border border-slate-200 shadow-md text-[10px] text-slate-800">
          <span className="font-semibold truncate max-w-[70px] text-slate-800">
            {selectedClip.name}
          </span>
          <span className="font-mono text-slate-700 text-[9px] bg-slate-100 px-1 py-0.2 rounded border border-slate-200">
            {selectedClip.startTime.toFixed(2)}s
          </span>
          <div className="flex items-center gap-0.5 ml-0.5">
            <button
              type="button"
              onClick={() => {
                const nextStart = Math.max(0, selectedClip.startTime - 0.1);
                run((p) => moveClip(p, selectedClip.id, nextStart));
                navigator.vibrate?.(6);
              }}
              title="Nudge earlier 0.1s"
              className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-mono text-[9px]"
            >
              -0.1s
            </button>
            <button
              type="button"
              onClick={() => {
                run((p) => moveClip(p, selectedClip.id, time));
                navigator.vibrate?.(8);
                notify(`Aligned "${selectedClip.name}" to playhead.`);
              }}
              title="Snap start to playhead"
              className="px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-semibold flex items-center gap-0.5 text-[9px]"
            >
              <Target size={10} />
              <span>Snap</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const nextStart = selectedClip.startTime + 0.1;
                run((p) => moveClip(p, selectedClip.id, nextStart));
                navigator.vibrate?.(6);
              }}
              title="Nudge later 0.1s"
              className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-mono text-[9px]"
            >
              +0.1s
            </button>
          </div>
        </div>
      )}

      {/* Horizontal Inertia Scrollable Track Container */}
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onPointerDown={handleMouseDown}
        className="w-full h-full overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x no-scrollbar relative cursor-grab active:cursor-grabbing bg-slate-50"
      >
        <div className="relative h-full" style={{ width: `${trackAreaWidth}px` }}>
          {/* Ruler (22px) */}
          <div className="h-[22px] border-b border-slate-200 bg-white relative">
            {Array.from({ length: tickCount }).map((_, i) => {
              const sec = i * tickStep;
              const left = halfWidth + sec * pps;
              return (
                <div
                  key={sec}
                  className="absolute top-0 bottom-0 border-l border-slate-200 flex items-center pl-1"
                  style={{ left: `${left}px` }}
                >
                  <span className="text-[9px] font-mono text-slate-500">
                    {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, "0")}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Detected Silences Waveform Visual Shading Overlay */}
          {detectedSilences.length > 0 && (
            <div className="absolute top-[24px] bottom-0 left-0 right-0 pointer-events-none z-20">
              {detectedSilences.map((silence, idx) => {
                const left = halfWidth + silence.start * pps;
                const width = Math.max(4, silence.duration * pps);
                return (
                  <div
                    key={`silence-${idx}-${silence.start}`}
                    className="absolute top-0 bottom-0 bg-rose-500/20 border-x border-dashed border-rose-500/80 pointer-events-none flex flex-col items-center justify-start overflow-hidden select-none"
                    style={{ left: `${left}px`, width: `${width}px` }}
                  >
                    <span className="text-[8px] font-mono text-rose-300 bg-[#16161C]/90 border border-rose-500/40 rounded px-1 mt-0.5 shadow-xs whitespace-nowrap">
                      Cut {silence.duration.toFixed(2)}s
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* 4 Compact Stacked Lanes (remaining ~138px) */}
          <div className="flex flex-col justify-evenly h-[138px] py-1 gap-1 bg-slate-50">
            {/* Track 1: Captions / Text Indicators (Clean Blue Pills) */}
            <div className="relative h-[24px] bg-white border-y border-slate-200">
              {trackGroups.captionsAndText.length === 0 && (
                <span
                  className="absolute top-1 text-[9px] text-slate-400 font-mono flex items-center gap-1 pointer-events-none"
                  style={{ left: `${halfWidth + 8}px` }}
                >
                  <Captions size={10} /> Captions
                </span>
              )}
              {trackGroups.captionsAndText.map((clip) => {
                const isSelected = selection.includes(clip.id);
                const left = halfWidth + clip.startTime * pps;
                const width = Math.max(20, clip.duration * pps);
                return (
                  <div
                    key={clip.id}
                    onClick={() => {
                      select([clip.id]);
                      navigator.vibrate?.(6);
                    }}
                    style={{ left: `${left}px`, width: `${width}px` }}
                    className={`absolute top-0 bottom-0 rounded-md border px-1.5 flex items-center overflow-hidden text-left transition-colors cursor-pointer ${
                      isSelected
                        ? "border-blue-600 ring-2 ring-blue-600 bg-blue-100 text-blue-950 z-20 shadow-md font-semibold"
                        : "border-blue-200 bg-blue-50 text-blue-900 z-10"
                    }`}
                  >
                    {isSelected && (
                      <>
                        <div
                          data-trim-handle
                          onPointerDown={(e) => handleTrimClip(e, clip, "left")}
                          className="absolute left-0 top-0 bottom-0 w-3.5 bg-blue-600 rounded-l-md rounded-r-xs flex items-center justify-center z-30 cursor-ew-resize active:scale-105 shadow-sm"
                          title="Drag to trim start"
                        >
                          <div className="w-[1.5px] h-3 bg-white rounded-full" />
                        </div>
                        <div
                          data-trim-handle
                          onPointerDown={(e) => handleTrimClip(e, clip, "right")}
                          className="absolute right-0 top-0 bottom-0 w-3.5 bg-blue-600 rounded-r-md rounded-l-xs flex items-center justify-center z-30 cursor-ew-resize active:scale-105 shadow-sm"
                          title="Drag to trim end"
                        >
                          <div className="w-[1.5px] h-3 bg-white rounded-full" />
                        </div>
                      </>
                    )}
                    <span className="relative z-10 text-[9px] font-medium truncate px-1 flex items-center gap-1">
                      <span className="px-1 py-0.2 rounded bg-blue-200 text-[8px] font-bold text-blue-900 flex-shrink-0">
                        CC
                      </span>
                      <span className="truncate">{clip.name}</span>
                      <span className="ml-auto text-[8px] font-mono text-blue-800 bg-blue-100 px-0.5 rounded">
                        {clip.duration.toFixed(1)}s
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Track 2: Overlay / B-Roll Thumbnails */}
            <div className="relative h-[28px] bg-white border-b border-slate-200">
              {trackGroups.overlays.length === 0 && (
                <span
                  className="absolute top-1.5 text-[9px] text-slate-400 font-mono flex items-center gap-1 pointer-events-none"
                  style={{ left: `${halfWidth + 8}px` }}
                >
                  <Layers size={10} /> Overlay / B-Roll
                </span>
              )}
              {trackGroups.overlays.map((clip) => {
                const isSelected = selection.includes(clip.id);
                const asset = clip.assetId ? project.assets[clip.assetId] : undefined;
                const left = halfWidth + clip.startTime * pps;
                const width = Math.max(24, clip.duration * pps);
                return (
                  <div
                    key={clip.id}
                    onClick={() => {
                      select([clip.id]);
                      navigator.vibrate?.(6);
                    }}
                    style={{ left: `${left}px`, width: `${width}px` }}
                    className={`absolute top-0 bottom-0 rounded-md border overflow-hidden flex items-center px-1.5 cursor-pointer ${
                      isSelected
                        ? "border-white ring-2 ring-white bg-[#10303E] z-20 shadow-lg"
                        : "border-cyan-700/60 bg-[#0C1E28] z-10"
                    }`}
                  >
                    <CompactFilmstrip clip={clip} asset={asset} width={width} />
                    {isSelected && (
                      <>
                        <div
                          data-trim-handle
                          onPointerDown={(e) => handleTrimClip(e, clip, "left")}
                          className="absolute left-0 top-0 bottom-0 w-3.5 bg-white rounded-l-md rounded-r-xs flex items-center justify-center z-30 cursor-ew-resize active:scale-105 shadow-[0_0_8px_rgba(0,0,0,0.6)]"
                          title="Drag to trim start"
                        >
                          <div className="w-[1.5px] h-3.5 bg-[#16161C] rounded-full" />
                        </div>
                        <div
                          data-trim-handle
                          onPointerDown={(e) => handleTrimClip(e, clip, "right")}
                          className="absolute right-0 top-0 bottom-0 w-3.5 bg-white rounded-r-md rounded-l-xs flex items-center justify-center z-30 cursor-ew-resize active:scale-105 shadow-[0_0_8px_rgba(0,0,0,0.6)]"
                          title="Drag to trim end"
                        >
                          <div className="w-[1.5px] h-3.5 bg-[#16161C] rounded-full" />
                        </div>
                      </>
                    )}
                    <span className="relative z-10 text-[9px] font-semibold text-cyan-200 truncate px-1 flex items-center gap-1">
                      <span className="px-1 py-0.2 rounded bg-cyan-500/30 text-[8px] font-bold text-[#00E5FF] flex-shrink-0">
                        B-ROLL
                      </span>
                      <span className="truncate">{clip.name}</span>
                      <span className="ml-auto text-[8px] font-mono text-cyan-300/80 bg-black/60 px-0.5 rounded">
                        {clip.duration.toFixed(1)}s
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Track 3: Main Video Thumbnail Strip + Waveform Bars */}
            <div className="relative h-[38px] bg-white border-b border-slate-200">
              {trackGroups.mainVideo.length === 0 && (
                <span
                  className="absolute top-2.5 text-[10px] text-slate-400 font-mono flex items-center gap-1 pointer-events-none"
                  style={{ left: `${halfWidth + 8}px` }}
                >
                  <Film size={11} /> Main Video Track
                </span>
              )}
              {trackGroups.mainVideo.map((clip) => {
                const isSelected = selection.includes(clip.id);
                const asset = clip.assetId ? project.assets[clip.assetId] : undefined;
                const left = halfWidth + clip.startTime * pps;
                const width = Math.max(28, clip.duration * pps);
                return (
                  <div
                    key={clip.id}
                    onClick={() => {
                      select([clip.id]);
                      navigator.vibrate?.(6);
                    }}
                    style={{ left: `${left}px`, width: `${width}px` }}
                    className={`absolute top-0 bottom-0 rounded-md border overflow-hidden flex items-end px-1.5 pb-1 ${
                      isSelected
                        ? "border-white ring-2 ring-white bg-[#222230] z-20 shadow-xl"
                        : "border-[#38384A] bg-[#181822] z-10"
                    }`}
                  >
                    <CompactFilmstrip clip={clip} asset={asset} width={width} />
                    <CompactWaveform
                      clip={clip}
                      asset={asset}
                      width={width}
                      colorClass="text-[#00E5FF]"
                    />
                    {isSelected && (
                      <>
                        <div
                          data-trim-handle
                          onPointerDown={(e) => handleTrimClip(e, clip, "left")}
                          className="absolute left-0 top-0 bottom-0 w-3.5 bg-white rounded-l-md rounded-r-xs flex items-center justify-center z-30 cursor-ew-resize active:scale-105 shadow-[0_0_8px_rgba(0,0,0,0.6)]"
                          title="Drag to trim start"
                        >
                          <div className="w-[1.5px] h-4 bg-[#16161C] rounded-full" />
                        </div>
                        <div
                          data-trim-handle
                          onPointerDown={(e) => handleTrimClip(e, clip, "right")}
                          className="absolute right-0 top-0 bottom-0 w-3.5 bg-white rounded-r-md rounded-l-xs flex items-center justify-center z-30 cursor-ew-resize active:scale-105 shadow-[0_0_8px_rgba(0,0,0,0.6)]"
                          title="Drag to trim end"
                        >
                          <div className="w-[1.5px] h-4 bg-[#16161C] rounded-full" />
                        </div>
                      </>
                    )}
                    <div className="relative z-10 w-full flex items-center justify-between text-[10px] font-semibold text-white truncate px-1">
                      <span className="truncate drop-shadow">{clip.name}</span>
                      <span className="ml-1 text-[8px] font-mono text-white/90 bg-black/70 px-1 py-0.2 rounded flex-shrink-0">
                        {clip.duration.toFixed(1)}s
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Track 4: Audio / SFX Layers */}
            <div className="relative h-[26px] bg-white border-b border-slate-200">
              {trackGroups.audioClips.length === 0 && (
                <span
                  className="absolute top-1 text-[9px] text-slate-400 font-mono flex items-center gap-1 pointer-events-none"
                  style={{ left: `${halfWidth + 8}px` }}
                >
                  <Music size={10} /> Audio &amp; SFX
                </span>
              )}
              {trackGroups.audioClips.map((clip) => {
                const isSelected = selection.includes(clip.id);
                const asset = clip.assetId ? project.assets[clip.assetId] : undefined;
                const left = halfWidth + clip.startTime * pps;
                const width = Math.max(20, clip.duration * pps);
                const isSfx =
                  clip.audioRole === "sfx" ||
                  clip.name.toLowerCase().includes("sfx") ||
                  clip.name.toLowerCase().includes("whoosh") ||
                  clip.name.toLowerCase().includes("pop") ||
                  clip.name.toLowerCase().includes("impact") ||
                  clip.name.toLowerCase().includes("riser") ||
                  clip.name.toLowerCase().includes("ding") ||
                  clip.name.toLowerCase().includes("transition");

                return (
                  <div
                    key={clip.id}
                    onClick={() => {
                      select([clip.id]);
                      navigator.vibrate?.(6);
                    }}
                    style={{ left: `${left}px`, width: `${width}px` }}
                    className={`absolute top-0 bottom-0 rounded-md border overflow-hidden flex items-center px-1.5 cursor-pointer ${
                      isSfx
                        ? isSelected
                          ? "bg-[#2E1A3C] border-white ring-2 ring-white z-30 shadow-lg"
                          : "bg-[#1E1228] border-purple-800/60 z-25"
                        : isSelected
                        ? "bg-[#143224] border-white ring-2 ring-white z-20 shadow-lg"
                        : "bg-[#0E2218] border-emerald-800/60 z-10"
                    }`}
                  >
                    <CompactWaveform
                      clip={clip}
                      asset={asset}
                      width={width}
                      colorClass={isSfx ? "text-purple-400" : "text-emerald-400"}
                    />
                    {isSelected && (
                      <>
                        <div
                          data-trim-handle
                          onPointerDown={(e) => handleTrimClip(e, clip, "left")}
                          className="absolute left-0 top-0 bottom-0 w-3.5 bg-white rounded-l-md rounded-r-xs flex items-center justify-center z-35 cursor-ew-resize active:scale-105 shadow-[0_0_8px_rgba(0,0,0,0.6)]"
                          title="Drag to trim start"
                        >
                          <div className="w-[1.5px] h-3 bg-[#16161C] rounded-full" />
                        </div>
                        <div
                          data-trim-handle
                          onPointerDown={(e) => handleTrimClip(e, clip, "right")}
                          className="absolute right-0 top-0 bottom-0 w-3.5 bg-white rounded-r-md rounded-l-xs flex items-center justify-center z-35 cursor-ew-resize active:scale-105 shadow-[0_0_8px_rgba(0,0,0,0.6)]"
                          title="Drag to trim end"
                        >
                          <div className="w-[1.5px] h-3 bg-[#16161C] rounded-full" />
                        </div>
                      </>
                    )}
                    <span
                      className={`relative z-10 text-[9px] font-semibold truncate px-1 flex items-center gap-1 w-full justify-between ${
                        isSfx ? "text-purple-200" : "text-emerald-200"
                      }`}
                    >
                      <span className="flex items-center gap-1 truncate">
                        <span
                          className={`px-1 py-0.2 rounded text-[8px] font-bold flex-shrink-0 ${
                            isSfx
                              ? "bg-purple-500/30 text-purple-300"
                              : "bg-emerald-500/30 text-emerald-300"
                          }`}
                        >
                          {isSfx ? "SFX" : "BGM"}
                        </span>
                        <span className="truncate">{clip.name}</span>
                      </span>
                      <span className="text-[8px] font-mono text-white/80 bg-black/60 px-0.5 rounded flex-shrink-0">
                        {clip.duration.toFixed(1)}s
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Empty Helper Floating Callout */}
          {Object.keys(project.clips).length === 0 && (
            <div
              className="absolute top-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-1.5 text-[11px] text-white/80 bg-[#1C1C24]/90 border border-[#2E2E38] shadow-md px-3 py-1 rounded-full"
              style={{ left: `${halfWidth + 16}px` }}
            >
              <Sparkles size={11} className="text-[#00E5FF]" />
              <span>Scrub horizontally · Pinch to zoom</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
