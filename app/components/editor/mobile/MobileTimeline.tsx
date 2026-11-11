"use client";

import React, { memo, useRef, useState, useEffect, useMemo, useCallback } from "react";
import { Captions, Layers, Film, Music, Sparkles } from "lucide-react";
import { Clip, MediaAsset, clamp, projectDuration } from "@/app/lib/editor/model";
import { trimClip } from "@/app/lib/editor/operations";
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
  const { store, playback, selection, select, notify } = useEditor();
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
      className="h-[160px] flex-shrink-0 w-full bg-white border-t border-slate-200 relative overflow-hidden select-none"
      aria-label="Mobile Touch Timeline"
    >
      {/* Center-Fixed Static Vertical Red Playhead */}
      <div
        className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-red-500 z-30 pointer-events-none shadow-[0_0_8px_rgba(239,68,68,0.65)]"
        aria-hidden="true"
      >
        <div className="w-2.5 h-2.5 -ml-[4px] bg-red-500 rotate-45 rounded-[1px] -mt-1 shadow" />
      </div>

      {/* Horizontal Inertia Scrollable Track Container */}
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onPointerDown={handleMouseDown}
        className="w-full h-full overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x no-scrollbar relative cursor-grab active:cursor-grabbing"
      >
        <div className="relative h-full" style={{ width: `${trackAreaWidth}px` }}>
          {/* Ruler (22px) */}
          <div className="h-[22px] border-b border-slate-200 bg-[#F1F5F9] relative">
            {Array.from({ length: tickCount }).map((_, i) => {
              const sec = i * tickStep;
              const left = halfWidth + sec * pps;
              return (
                <div
                  key={sec}
                  className="absolute top-0 bottom-0 border-l border-slate-300 flex items-center pl-1"
                  style={{ left: `${left}px` }}
                >
                  <span className="text-[9px] font-mono text-slate-500">
                    {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, "0")}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 4 Compact Stacked Lanes (remaining ~138px) */}
          <div className="flex flex-col justify-evenly h-[138px] py-1 gap-1 bg-white">
            {/* Track 1: Captions / Text Indicators (Amber Pills) */}
            <div className="relative h-[24px] bg-[#F8FAFC]">
              {trackGroups.captionsAndText.length === 0 && (
                <span
                  className="absolute top-1 text-[9px] text-slate-500 font-mono flex items-center gap-1 pointer-events-none"
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
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => {
                      select([clip.id]);
                      navigator.vibrate?.(6);
                    }}
                    style={{ left: `${left}px`, width: `${width}px` }}
                    className={`absolute top-0 bottom-0 rounded-full bg-amber-100 border px-2 flex items-center overflow-hidden text-left transition-colors ${
                      isSelected
                        ? "border-blue-600 ring-1 ring-blue-600 text-amber-950 z-20"
                        : "border-amber-400 text-amber-950 z-10"
                    }`}
                  >
                    <span className="text-[10px] font-medium truncate">{clip.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Track 2: Overlay / B-Roll Thumbnails (Cyan Border) */}
            <div className="relative h-[28px] bg-[#F1F5F9]/75">
              {trackGroups.overlays.length === 0 && (
                <span
                  className="absolute top-1.5 text-[9px] text-slate-500 font-mono flex items-center gap-1 pointer-events-none"
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
                    className={`absolute top-0 bottom-0 rounded-md bg-cyan-100 border overflow-hidden flex items-center px-1.5 ${
                      isSelected
                        ? "border-blue-600 ring-1 ring-blue-600 z-20"
                        : "border-cyan-400 z-10"
                    }`}
                  >
                    <CompactFilmstrip clip={clip} asset={asset} width={width} />
                    <span className="relative z-10 text-[10px] font-semibold text-cyan-950 truncate">
                      {clip.name}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Track 3: Main Video Thumbnail Strip + Waveform Bars */}
            <div className="relative h-[38px] bg-[#F8FAFC]">
              {trackGroups.mainVideo.length === 0 && (
                <span
                  className="absolute top-2.5 text-[10px] text-slate-500 font-mono flex items-center gap-1 pointer-events-none"
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
                    className={`absolute top-0 bottom-0 rounded-md bg-blue-100 border overflow-hidden flex items-end px-1.5 pb-1 ${
                      isSelected
                        ? "border-blue-600 ring-2 ring-blue-600 z-20"
                        : "border-blue-400 z-10"
                    }`}
                  >
                    <CompactFilmstrip clip={clip} asset={asset} width={width} />
                    <CompactWaveform
                      clip={clip}
                      asset={asset}
                      width={width}
                      colorClass="text-blue-600"
                    />
                    {isSelected && (
                      <>
                        <div
                          data-trim-handle
                          onPointerDown={(e) => handleTrimClip(e, clip, "left")}
                          className="absolute left-0 top-0 bottom-0 w-4 bg-blue-600 flex items-center justify-center z-30 cursor-ew-resize"
                        >
                          <div className="w-[2px] h-4 bg-white rounded-full" />
                        </div>
                        <div
                          data-trim-handle
                          onPointerDown={(e) => handleTrimClip(e, clip, "right")}
                          className="absolute right-0 top-0 bottom-0 w-4 bg-blue-600 flex items-center justify-center z-30 cursor-ew-resize"
                        >
                          <div className="w-[2px] h-4 bg-white rounded-full" />
                        </div>
                      </>
                    )}
                    <span className="relative z-10 text-[10px] font-semibold text-blue-950 truncate px-2">
                      {clip.name}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Track 4: Audio / SFX Layers (Emerald Waveform Ribbon) */}
            <div className="relative h-[26px] bg-[#F1F5F9]/75">
              {trackGroups.audioClips.length === 0 && (
                <span
                  className="absolute top-1 text-[9px] text-slate-500 font-mono flex items-center gap-1 pointer-events-none"
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
                return (
                  <div
                    key={clip.id}
                    onClick={() => {
                      select([clip.id]);
                      navigator.vibrate?.(6);
                    }}
                    style={{ left: `${left}px`, width: `${width}px` }}
                    className={`absolute top-0 bottom-0 rounded-md bg-emerald-100 border overflow-hidden flex items-center px-1.5 ${
                      isSelected
                        ? "border-blue-600 ring-1 ring-blue-600 z-20"
                        : "border-emerald-400 z-10"
                    }`}
                  >
                    <CompactWaveform
                      clip={clip}
                      asset={asset}
                      width={width}
                      colorClass="text-emerald-600"
                    />
                    <span className="relative z-10 text-[9px] font-semibold text-emerald-950 truncate">
                      {clip.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Empty Helper Floating Callout */}
          {Object.keys(project.clips).length === 0 && (
            <div
              className="absolute top-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-1.5 text-[11px] text-slate-600 bg-white/95 border border-slate-200 shadow-sm px-3 py-1 rounded-full"
              style={{ left: `${halfWidth + 16}px` }}
            >
              <Sparkles size={11} className="text-blue-600" />
              <span>Scrub horizontally · Pinch to zoom</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
