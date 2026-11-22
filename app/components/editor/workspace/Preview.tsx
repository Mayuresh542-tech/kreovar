"use client";
import { loadEditorStudioFonts } from "@/app/lib/editor/editorCaptionStudio";
import { loadCaptionFonts } from "@/app/lib/captions/typography";
import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, Maximize, Film } from "lucide-react";
import { playbackTime } from "@/app/lib/editor/playbackClock";
import { Compositor, VisualBounds } from "@/app/lib/editor/compositor";
import { clamp, dimensions, formatTime, projectDuration } from "@/app/lib/editor/model";
import { usePlayback, useProject } from "@/app/lib/editor/store";
import { changeClipProperty } from "@/app/lib/editor/operations";
import { pointerEdit } from "@/app/lib/editor/interaction";
import { useEditor } from "./EditorContext";

function getRotatedCursor(baseAngleDeg: number, clipRotationDeg: number): string {
  const totalAngle = (baseAngleDeg + clipRotationDeg) % 180;
  const normalized = totalAngle < 0 ? totalAngle + 180 : totalAngle;
  if (normalized >= 22.5 && normalized < 67.5) return "nesw-resize";
  if (normalized >= 67.5 && normalized < 112.5) return "ns-resize";
  if (normalized >= 112.5 && normalized < 157.5) return "nwse-resize";
  return "ew-resize";
}

function SafeZoneOverlay({ aspectRatio }: { aspectRatio: string }) {
  if (aspectRatio === "9:16") {
    return (
      <div className="vx-safe-zone-overlay" aria-hidden="true">
        <div className="vx-safe-zone-top">
          <span className="vx-safe-zone-tag">TikTok / Reels Header (Search & Tabs)</span>
        </div>
        <div className="vx-safe-zone-active">
          <span className="vx-safe-zone-tag vx-safe-zone-active-tag">Safe Zone (820×1260)</span>
        </div>
        <div className="vx-safe-zone-right">
          <span className="vx-safe-zone-tag">Action Rail</span>
          <span className="vx-safe-zone-tag">Likes & Shares</span>
        </div>
        <div className="vx-safe-zone-bottom">
          <span className="vx-safe-zone-tag">Captions, Audio & Navigation</span>
        </div>
      </div>
    );
  }
  return (
    <div className="vx-safe-zone-overlay" aria-hidden="true">
      <div className="vx-safe-zone-16-9-action">
        <span className="vx-safe-zone-tag" style={{ position: "absolute", top: 4, left: 4 }}>
          90% Action Safe
        </span>
      </div>
      <div className="vx-safe-zone-16-9-title">
        <span className="vx-safe-zone-tag" style={{ position: "absolute", top: 4, left: 4 }}>
          80% Title Safe
        </span>
      </div>
    </div>
  );
}

function Transport({
  toggle,
  zoom,
  setZoom,
  fullscreen,
  onScrubStart,
  onScrubEnd,
}: {
  toggle: () => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  fullscreen: () => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}) {
  const { store, playback } = useEditor(),
    p = useProject(store),
    { time, playing } = usePlayback(playback),
    duration = projectDuration(p);
  return (
    <div>
      <input
        className="vx-preview-scrub"
        type="range"
        aria-label="Seek preview"
        min={0}
        max={duration || 0}
        step={1 / p.settings.fps}
        value={Math.min(time, duration)}
        disabled={!duration}
        onPointerDown={() => onScrubStart?.()}
        onMouseDown={() => onScrubStart?.()}
        onTouchStart={() => onScrubStart?.()}
        onChange={(e) => playback.set(Number(e.target.value), false)}
        onPointerUp={() => onScrubEnd?.()}
        onMouseUp={() => onScrubEnd?.()}
        onTouchEnd={() => onScrubEnd?.()}
        onKeyUp={() => onScrubEnd?.()}
      />
      <div className="vx-transport">
        <div>
          <button
            title="Previous frame (←)"
            aria-label="Previous frame"
            onClick={() => playback.set(Math.max(0, time - 1 / p.settings.fps), false)}
          >
            <SkipBack size={15} />
          </button>
          <button
            className="vx-play"
            title="Play / pause (Space)"
            aria-label={playing ? "Pause" : "Play"}
            disabled={!duration}
            onClick={toggle}
          >
            {playing ? <Pause size={17} /> : <Play size={17} />}
          </button>
          <button
            aria-label="Next frame"
            title="Next frame (→)"
            onClick={() => playback.set(Math.min(duration, time + 1 / p.settings.fps), false)}
          >
            <SkipForward size={15} />
          </button>
          <button aria-label="Go to start" title="Go to start" onClick={() => playback.set(0, false)}>
            ↤
          </button>
          <button aria-label="Go to end" title="Go to end" onClick={() => playback.set(duration, false)}>
            ↦
          </button>
          <span className="vx-time">
            {formatTime(time, p.settings.fps)} <i>/ {formatTime(duration, p.settings.fps)}</i>
          </span>
        </div>
        <div>
          <select aria-label="Preview zoom" value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
            <option value={1}>Fit</option>
            <option value={0.5}>50%</option>
            <option value={1.5}>150%</option>
            <option value={2}>200%</option>
          </select>
          <button aria-label="Fullscreen preview" onClick={fullscreen}>
            <Maximize size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Preview({ quality, readOnly = false }: { quality: number; readOnly?: boolean }) {
  const { store, playback, repository, selection, select, notify } = useEditor(),
    p = useProject(store);
  const canvas = useRef<HTMLCanvasElement>(null),
    stage = useRef<HTMLDivElement>(null),
    frame = useRef<HTMLDivElement>(null),
    outline = useRef<HTMLDivElement>(null),
    engine = useRef<Compositor | null>(null),
    bounds = useRef<VisualBounds[]>([]),
    selected = useRef<string | undefined>(undefined);
  const [zoom, setZoom] = useState(1),
    [buffering, setBuffering] = useState(false),
    [showAdjustments, setShowAdjustments] = useState(false),
    [showSafeZone, setShowSafeZone] = useState(p.settings.aspectRatio === "9:16"),
    [snapGuides, setSnapGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false }),
    [currentBoxRot, setCurrentBoxRot] = useState(0);

  useEffect(() => {
    void loadEditorStudioFonts(p).catch(() => {});
    for (const layer of [...Object.values(p.textLayers), ...Object.values(p.captions)])
      void loadCaptionFonts(`"${layer.style.font}"`, layer.style.weight, layer.style.size, layer.style.fontAccent, layer.text).catch(() => {});
  }, [p.textLayers, p.captions]);

  useEffect(() => {
    selected.current = selection[0];
  }, [selection]);

  const handleScrubStart = useCallback(() => {
    engine.current?.setScrubbing(true);
  }, []);

  const handleScrubEnd = useCallback(() => {
    engine.current?.setScrubbing(false);
    const snap = playback.getSnapshot();
    playback.set(snap.time, snap.playing);
  }, [playback]);

  useEffect(() => {
    const onScrubStart = () => engine.current?.setScrubbing(true);
    const onScrubEnd = () => {
      engine.current?.setScrubbing(false);
      const snap = playback.getSnapshot();
      playback.set(snap.time, snap.playing);
    };
    window.addEventListener("veelox:scrub-start", onScrubStart);
    window.addEventListener("veelox:scrub-end", onScrubEnd);
    return () => {
      window.removeEventListener("veelox:scrub-start", onScrubStart);
      window.removeEventListener("veelox:scrub-end", onScrubEnd);
    };
  }, [playback]);

  useEffect(() => {
    const compositor = new Compositor(repository, (error) => notify(error.message));
    engine.current = compositor;
    let request = 0,
      last = performance.now(),
      waiting = false,
      lastRender = 0,
      lastProject: typeof p | undefined,
      lastTime = -1,
      lastSize = "",
      cachedDurationProject: typeof p | undefined,
      cachedDuration = 0,
      lastOutlineKey = "",
      opaqueCanvas: HTMLCanvasElement | null = null;

    const loop = (now: number) => {
      const state = playback.getSnapshot(),
        project = store.getSnapshot(),
        delta = Math.max(0, (now - last) / 1000);
      last = now;
      if (project !== cachedDurationProject) {
        cachedDuration = projectDuration(project);
        cachedDurationProject = project;
      }
      const duration = cachedDuration;
      try {
        if (canvas.current && canvas.current !== opaqueCanvas) {
          canvas.current.getContext("2d", { alpha: false });
          opaqueCanvas = canvas.current;
        }
        const next = playbackTime(state.time, state.playing, waiting, delta, duration);
        const displayTime = duration ? Math.min(next, Math.max(0, duration - 1 / project.settings.fps)) : 0;
        const wasWaiting = waiting;
        const isScrub = compositor.getScrubbing();
        const ready = compositor.sync(project, displayTime, state.playing);

        if (!isScrub && waiting !== !ready) {
          waiting = !ready;
          setBuffering(waiting);
        } else if (isScrub && waiting) {
          waiting = false;
          setBuffering(false);
        }

        if (
          (ready || isScrub) &&
          canvas.current &&
          (project !== lastProject ||
            `${canvas.current.width}:${canvas.current.height}` !== lastSize ||
            wasWaiting !== waiting ||
            (!state.playing && displayTime !== lastTime) ||
            (state.playing && now - lastRender >= 1000 / project.settings.fps) ||
            isScrub)
        ) {
          bounds.current = compositor.render(canvas.current, project, displayTime);
          lastProject = project;
          lastTime = displayTime;
          lastRender = now;
          lastSize = `${canvas.current.width}:${canvas.current.height}`;
        }
        const box = selected.current ? bounds.current.find((b) => b.id === selected.current) : undefined,
          element = outline.current;
        if (element && canvas.current) {
          if (!box) {
            if (lastOutlineKey !== "none") {
              element.style.display = "none";
              lastOutlineKey = "none";
            }
          } else {
            const [w, h] = dimensions[project.settings.aspectRatio],
              key = `${w}:${h}:${box.x}:${box.y}:${box.width}:${box.height}:${box.rotation}`;
            if (key !== lastOutlineKey) {
              lastOutlineKey = key;
              element.style.display = "block";
              element.style.left = `${(box.x / w) * 100}%`;
              element.style.top = `${(box.y / h) * 100}%`;
              element.style.width = `${(box.width / w) * 100}%`;
              element.style.height = `${(box.height / h) * 100}%`;
              element.style.transform = `translate(-50%,-50%) rotate(${box.rotation}deg)`;
              setCurrentBoxRot(box.rotation);
            }
          }
        }
        if (state.playing && ready) {
          playback.set(next, next < duration);
        } else if (!ready && !isScrub) {
          compositor.pause();
        }
      } catch (error) {
        playback.set(state.time, false);
        notify(error instanceof Error ? error.message : "Preview failed.");
      }
      request = requestAnimationFrame(loop);
    };
    const fontsReady = () => {
      lastProject = undefined;
    };
    document.fonts.addEventListener("loadingdone", fontsReady);
    request = requestAnimationFrame(loop);
    const visibility = () => {
      if (document.hidden) {
        playback.set(playback.getSnapshot().time, false);
        compositor.pause();
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(request);
      document.fonts.removeEventListener("loadingdone", fontsReady);
      document.removeEventListener("visibilitychange", visibility);
      compositor.dispose();
      engine.current = null;
    };
  }, [store, playback, repository, notify]);

  useEffect(() => {
    const element = stage.current,
      box = frame.current;
    if (!element || !box) return;
    const [w, h] = dimensions[p.settings.aspectRatio];
    function fit() {
      if (!element || !box) return;
      const padding = getComputedStyle(element),
        availableWidth = Math.max(1, element.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight)),
        availableHeight = Math.max(1, element.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom));
      const width = Math.max(1, Math.min(availableWidth, (availableHeight * w) / h)) * zoom;
      box.style.width = `${width}px`;
      box.style.height = `${(width * h) / w}px`;
    }
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    fit();
    return () => observer.disconnect();
  }, [p.settings.aspectRatio, zoom]);

  const [w, h] = dimensions[p.settings.aspectRatio],
    renderHeight = quality,
    renderWidth = Math.round((quality * w) / h);

  async function toggle() {
    const state = playback.getSnapshot();
    if (state.playing) {
      playback.set(state.time, false);
      return;
    }
    try {
      await engine.current?.activateAudio();
      playback.set(state.time >= projectDuration(p) ? 0 : state.time, true);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Audio playback unavailable.");
    }
  }

  useEffect(() => {
    const onPlay = () => {
      const state = playback.getSnapshot();
      if (state.playing) playback.set(state.time, false);
      else
        void engine.current
          ?.activateAudio()
          .then(() => playback.set(state.time >= projectDuration(store.getSnapshot()) ? 0 : state.time, true))
          .catch((e) => notify(e.message));
    };
    window.addEventListener("veelox:toggle-play", onPlay);
    return () => window.removeEventListener("veelox:toggle-play", onPlay);
  }, [playback, store, notify]);

  function gesture(event: React.PointerEvent, mode: "move" | "scale" | "rotate", id: string, corner?: "nw" | "ne" | "sw" | "se") {
    if (readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    const c = store.getSnapshot().clips[id];
    if (!c || store.getSnapshot().tracks[c.trackId].locked) {
      notify("Unlock this track before transforming.");
      return;
    }
    playback.set(playback.getSnapshot().time, false);
    const rect = canvas.current!.getBoundingClientRect(),
      startX = event.clientX,
      startY = event.clientY,
      t = c.transform;
    const [w, h] = dimensions[p.settings.aspectRatio];
    const box = bounds.current.find((b) => b.id === id);
    const centerScreenX = rect.left + (box ? box.x / w : 0.5 + t.x) * rect.width;
    const centerScreenY = rect.top + (box ? box.y / h : 0.5 + t.y) * rect.height;
    const startDist = Math.max(10, Math.hypot(startX - centerScreenX, startY - centerScreenY));
    const startAngleRad = Math.atan2(startY - centerScreenY, startX - centerScreenX);
    const initialRot = t.rotation;
    let snapXActive = false,
      snapYActive = false;
    const snapThresholdPx = 10,
      breakThresholdPx = 16;

    const cleanupSnap = () => {
      setSnapGuides({ x: false, y: false });
      window.removeEventListener("pointerup", cleanupSnap);
      window.removeEventListener("pointercancel", cleanupSnap);
    };
    window.addEventListener("pointerup", cleanupSnap, { once: true });
    window.addEventListener("pointercancel", cleanupSnap, { once: true });

    pointerEdit(
      store,
      (e) => (project) => {
        if (mode === "move") {
          const rawX = t.x + (e.clientX - startX) / rect.width;
          const rawY = t.y + (e.clientY - startY) / rect.height;
          let nextX = rawX;
          if (snapXActive) {
            if (Math.abs(rawX) * rect.width > breakThresholdPx) {
              snapXActive = false;
              nextX = rawX;
            } else {
              nextX = 0;
            }
          } else {
            if (Math.abs(rawX) * rect.width <= snapThresholdPx) {
              snapXActive = true;
              nextX = 0;
            }
          }
          let nextY = rawY;
          if (snapYActive) {
            if (Math.abs(rawY) * rect.height > breakThresholdPx) {
              snapYActive = false;
              nextY = rawY;
            } else {
              nextY = 0;
            }
          } else {
            if (Math.abs(rawY) * rect.height <= snapThresholdPx) {
              snapYActive = true;
              nextY = 0;
            }
          }
          setSnapGuides({ x: snapXActive, y: snapYActive });
          return changeClipProperty(project, id, { transform: { ...t, x: nextX, y: nextY } });
        } else if (mode === "scale") {
          const currentDist = Math.hypot(e.clientX - centerScreenX, e.clientY - centerScreenY);
          const scaleRatio = currentDist / startDist;
          const nextScale = clamp(t.scale * scaleRatio, 0.05, 10);
          return changeClipProperty(project, id, { transform: { ...t, scale: Math.round(nextScale * 1000) / 1000 } });
        } else {
          const currentAngleRad = Math.atan2(e.clientY - centerScreenY, e.clientX - centerScreenX);
          const diffDeg = ((currentAngleRad - startAngleRad) * 180) / Math.PI;
          const rawRot = initialRot + diffDeg;
          let normRot = (((rawRot + 180) % 360) + 360) % 360 - 180;
          const snapAngles = [0, 45, 90, 135, 180, -45, -90, -135, -180];
          const snapTarget = snapAngles.find((a) => Math.abs(normRot - a) <= 3.5);
          if (snapTarget !== undefined) normRot = snapTarget;
          return changeClipProperty(project, id, { transform: { ...t, rotation: Math.round(normRot * 10) / 10 } });
        }
      },
      notify
    );
  }

  function pick(event: React.PointerEvent<HTMLCanvasElement>) {
    if (readOnly) return;
    const rect = event.currentTarget.getBoundingClientRect(),
      x = ((event.clientX - rect.left) / rect.width) * w,
      y = ((event.clientY - rect.top) / rect.height) * h;
    const hit = [...bounds.current].reverse().find((b) => {
      const radians = (-b.rotation * Math.PI) / 180,
        dx = x - b.x,
        dy = y - b.y;
      return Math.abs(dx * Math.cos(radians) - dy * Math.sin(radians)) < b.width / 2 && Math.abs(dx * Math.sin(radians) + dy * Math.cos(radians)) < b.height / 2;
    });
    select(hit ? [hit.id] : []);
    if (hit) gesture(event, "move", hit.id);
  }

  const adjustmentsCount = (p.editingJob?.skippedNotes || p.editingJob?.degradationNotices || []).length;
  const hasAdjustments = p.editingJob?.status === "completed" && adjustmentsCount > 0;

  return (
    <section className="vx-preview vx-panel" aria-label="Video preview">
      <header className="vx-panel-heading">
        <span>
          Preview <span className="vx-subtle">/ {p.settings.aspectRatio}</span>
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            className={`vx-safe-zone-toggle ${showSafeZone ? "active" : ""}`}
            onClick={() => setShowSafeZone((v) => !v)}
            title="Toggle Safe Zone Guides (TikTok / Reels / Shorts)"
            aria-pressed={showSafeZone}
          >
            Safe Zone
          </button>
          {hasAdjustments && (
            <button type="button" className="vx-canvas-degradation-chip" onClick={() => setShowAdjustments((v) => !v)} title="Click to view notes">
              {adjustmentsCount} adjustments
            </button>
          )}
          <span className="vx-badge">{buffering ? "Loading media…" : `${quality}p preview`}</span>
        </div>
      </header>
      {hasAdjustments && showAdjustments && (
        <div className="vx-canvas-degradation-drawer">
          <p className="vx-canvas-degradation-title">
            {p.editingJob?.completionMessage || "Video edit complete! Yahan kuch non-critical tasks hain jo skip huye:"}
          </p>
          <ul>
            {(p.editingJob?.skippedNotes || []).map((note, i) => (
              <li key={i}>{note}</li>
            ))}
            {!p.editingJob?.skippedNotes?.length &&
              (p.editingJob?.degradationNotices || []).map((n, i) => (
                <li key={i}>
                  {n.stage}: {n.reason}
                </li>
              ))}
          </ul>
        </div>
      )}
      <div className="vx-stage" ref={stage}>
        <div className="vx-canvas-frame" ref={frame}>
          <canvas ref={canvas} width={renderWidth} height={renderHeight} onPointerDown={pick} aria-label="Project canvas" />
          {!Object.keys(p.clips).length && (
            <div className="vx-canvas-empty">
              <Film size={30} />
              <strong>Your next story starts here</strong>
              <span>Import media and add it to the timeline</span>
            </div>
          )}

          {/* Safe Zone Overlays */}
          {showSafeZone && <SafeZoneOverlay aspectRatio={p.settings.aspectRatio} />}

          {/* Visual Center-Cross Snap Guidelines */}
          {snapGuides.x && (
            <div className="vx-snap-guide vx-snap-guide-v" style={{ left: "50%" }}>
              <span className="vx-snap-badge vx-snap-badge-x">Center X</span>
            </div>
          )}
          {snapGuides.y && (
            <div className="vx-snap-guide vx-snap-guide-h" style={{ top: "50%" }}>
              <span className="vx-snap-badge vx-snap-badge-y">Center Y</span>
            </div>
          )}

          {/* Interactive Bounding Box with 4 corner scale handles and rotation stalk */}
          <div
            ref={outline}
            className="vx-selection-box"
            style={{ display: "none" }}
            onPointerDown={(e) => {
              if (selection[0]) gesture(e, "move", selection[0]);
            }}
          >
            <span className="vx-selection-label">{p.clips[selection[0]]?.name}</span>
            <button
              aria-label="Scale top-left"
              className="vx-scale-handle vx-handle-nw"
              style={{ cursor: getRotatedCursor(135, currentBoxRot) }}
              onPointerDown={(e) => gesture(e, "scale", selection[0], "nw")}
            />
            <button
              aria-label="Scale top-right"
              className="vx-scale-handle vx-handle-ne"
              style={{ cursor: getRotatedCursor(45, currentBoxRot) }}
              onPointerDown={(e) => gesture(e, "scale", selection[0], "ne")}
            />
            <button
              aria-label="Scale bottom-left"
              className="vx-scale-handle vx-handle-sw"
              style={{ cursor: getRotatedCursor(45, currentBoxRot) }}
              onPointerDown={(e) => gesture(e, "scale", selection[0], "sw")}
            />
            <button
              aria-label="Scale bottom-right"
              className="vx-scale-handle vx-handle-se"
              style={{ cursor: getRotatedCursor(135, currentBoxRot) }}
              onPointerDown={(e) => gesture(e, "scale", selection[0], "se")}
            />
            <div className="vx-rotation-stalk" />
            <button
              aria-label="Rotate selected layer"
              className="vx-rotation-handle"
              onPointerDown={(e) => gesture(e, "rotate", selection[0])}
            />
          </div>
        </div>
      </div>
      <Transport
        toggle={() => void toggle()}
        zoom={zoom}
        setZoom={setZoom}
        fullscreen={() => void stage.current?.requestFullscreen().catch((e) => notify(e.message))}
        onScrubStart={handleScrubStart}
        onScrubEnd={handleScrubEnd}
      />
    </section>
  );
}
