"use client";

import React, { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import {
  evaluateTransition,
  getTransitionSpec,
  type TransitionClipMask,
  type TransitionKind,
  type TransitionLayerPose,
  type TransitionOverlayFlash,
} from "@/app/lib/editor/transitions";

export interface TransitionPreviewStageProps {
  kind: TransitionKind;
  duration?: number;
  intensity?: number;
  compact?: boolean;
  interactive?: boolean;
  hovered?: boolean;
  className?: string;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function applyClipMask(
  ctx: CanvasRenderingContext2D,
  mask: TransitionClipMask,
  w: number,
  h: number
) {
  const p = clamp(mask.progress, 0, 1);
  ctx.beginPath();
  switch (mask.shape) {
    case "wipe-left":
      ctx.rect(w * (1 - p), 0, w * p, h);
      break;
    case "wipe-right":
      ctx.rect(0, 0, w * p, h);
      break;
    case "wipe-up":
      ctx.rect(0, h * (1 - p), w, h * p);
      break;
    case "wipe-down":
      ctx.rect(0, 0, w, h * p);
      break;
    case "barn-door":
      ctx.rect(w * (0.5 - 0.5 * p), 0, w * p, h);
      break;
    case "split-horizontal":
      ctx.rect(0, h * (0.5 - 0.5 * p), w, h * p);
      break;
    case "blinds": {
      const slats = 6;
      const sh = h / slats;
      for (let i = 0; i < slats; i++) ctx.rect(0, i * sh, w, sh * p);
      break;
    }
    case "circle-iris": {
      const r = Math.hypot(w, h) * 0.55 * p;
      ctx.arc(w / 2, h / 2, Math.max(0.5, r), 0, Math.PI * 2);
      break;
    }
    case "clock-wipe": {
      if (p >= 0.999) {
        ctx.rect(0, 0, w, h);
      } else {
        const r = Math.hypot(w, h);
        ctx.moveTo(w / 2, h / 2);
        ctx.arc(w / 2, h / 2, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
        ctx.closePath();
      }
      break;
    }
    case "diamond-iris": {
      const hw = w * 1.05 * p;
      const hh = h * 1.05 * p;
      ctx.moveTo(w / 2, h / 2 - hh);
      ctx.lineTo(w / 2 + hw, h / 2);
      ctx.lineTo(w / 2, h / 2 + hh);
      ctx.lineTo(w / 2 - hw, h / 2);
      ctx.closePath();
      break;
    }
    case "wipe-diagonal": {
      const d = p * 2;
      if (d <= 1) {
        ctx.moveTo(0, 0);
        ctx.lineTo(w * d, 0);
        ctx.lineTo(0, h * d);
      } else {
        const q = d - 1;
        ctx.moveTo(0, 0);
        ctx.lineTo(w, 0);
        ctx.lineTo(w, h * q);
        ctx.lineTo(w * q, h);
        ctx.lineTo(0, h);
      }
      ctx.closePath();
      break;
    }
  }
  ctx.clip();
}

function drawSampleScene(
  ctx: CanvasRenderingContext2D,
  scene: "A" | "B",
  w: number,
  h: number
) {
  if (scene === "A") {
    // Scene A: Cool Sapphire Horizon / Studio Clip 01
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#13223e");
    grad.addColorStop(0.55, "#1d4fb1");
    grad.addColorStop(1, "#38bdf8");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.arc(w * 0.72, h * 0.34, h * 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(15, 23, 42, 0.55)";
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w * 0.32, h * 0.56);
    ctx.lineTo(w * 0.65, h * 0.78);
    ctx.lineTo(w, h * 0.5);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.roundRect(10, 10, 44, 18, 9);
    ctx.fill();
    ctx.fillStyle = "#13223e";
    ctx.font = "800 10px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("CLIP A", 32, 19);
  } else {
    // Scene B: Vibrant Sea-Glass / Coral Sunset Clip 02
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#0f172a");
    grad.addColorStop(0.5, "#0f766e");
    grad.addColorStop(1, "#2dd4bf");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(244, 114, 182, 0.35)";
    ctx.beginPath();
    ctx.arc(w * 0.28, h * 0.36, h * 0.22, 0, Math.PI * 2);
    ctx.fill();

    // Stylized geometric play frame
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 2;
    ctx.strokeRect(w * 0.24, h * 0.26, w * 0.52, h * 0.48);

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(w - 54, 10, 44, 18, 9);
    ctx.fill();
    ctx.fillStyle = "#0f766e";
    ctx.font = "800 10px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("CLIP B", w - 32, 19);
  }
}

function drawPosedScene(
  ctx: CanvasRenderingContext2D,
  scene: "A" | "B",
  pose: TransitionLayerPose,
  w: number,
  h: number
) {
  if (pose.opacity <= 0.005) return;
  ctx.save();
  ctx.globalAlpha = clamp(pose.opacity, 0, 1);

  if (pose.clipMask) {
    applyClipMask(ctx, pose.clipMask, w, h);
  }

  ctx.translate(w / 2 + pose.x * w, h / 2 + pose.y * h);
  if (pose.rotation) ctx.rotate((pose.rotation * Math.PI) / 180);
  if (pose.skewX) ctx.transform(1, 0, Math.tan((pose.skewX * Math.PI) / 180), 1, 0, 0);
  ctx.scale(pose.scale * pose.scaleX, pose.scale * pose.scaleY);

  const filters: string[] = [];
  if (pose.blur > 0.2) filters.push(`blur(${Math.min(10, pose.blur).toFixed(1)}px)`);
  if (Math.abs(pose.brightness - 1) > 0.02) filters.push(`brightness(${pose.brightness.toFixed(2)})`);
  if (Math.abs(pose.contrast - 1) > 0.02) filters.push(`contrast(${pose.contrast.toFixed(2)})`);
  if (Math.abs(pose.saturation - 1) > 0.02) filters.push(`saturate(${pose.saturation.toFixed(2)})`);
  if (filters.length > 0 && "filter" in ctx) {
    ctx.filter = filters.join(" ");
  }

  ctx.translate(-w / 2, -h / 2);

  if (pose.rgbOffset > 0.001) {
    const shift = pose.rgbOffset * w * 0.45;
    ctx.save();
    ctx.globalAlpha *= 0.45;
    ctx.translate(-shift, 0);
    drawSampleScene(ctx, scene, w, h);
    ctx.translate(shift * 2, 0);
    drawSampleScene(ctx, scene, w, h);
    ctx.restore();
  }

  if (pose.glitchSlices > 0.05) {
    const slices = 5;
    const sh = h / slices;
    for (let i = 0; i < slices; i++) {
      ctx.save();
      const tear = ((i % 2 === 0 ? 1 : -1) * pose.glitchSlices * 14);
      ctx.beginPath();
      ctx.rect(0, i * sh, w, sh + 0.5);
      ctx.clip();
      ctx.translate(tear, 0);
      drawSampleScene(ctx, scene, w, h);
      ctx.restore();
    }
  } else {
    drawSampleScene(ctx, scene, w, h);
  }

  ctx.restore();
}

function drawOverlayFlash(
  ctx: CanvasRenderingContext2D,
  flash: TransitionOverlayFlash,
  w: number,
  h: number
) {
  if (flash.opacity <= 0.005) return;
  ctx.save();
  ctx.globalAlpha = clamp(flash.opacity, 0, 1);
  if (flash.mode) ctx.globalCompositeOperation = flash.mode;
  if (flash.gradient === "radial") {
    const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, Math.hypot(w, h) * 0.55);
    g.addColorStop(0, flash.color);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = flash.color;
  }
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

export default function TransitionPreviewStage({
  kind,
  duration,
  intensity = 1,
  compact = false,
  interactive = false,
  hovered = false,
  className = "",
}: TransitionPreviewStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rangeRef = useRef<HTMLInputElement | null>(null);
  const spec = getTransitionSpec(kind);
  const effectiveDuration = duration && duration > 0 ? duration : spec.defaultDuration;

  const [playing, setPlaying] = useState(interactive);
  const [drawBump, setDrawBump] = useState(0);
  const [inView, setInView] = useState(true);
  const progressRef = useRef(compact && !hovered ? 0.5 : 0);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setInView(entry.isIntersecting);
      },
      { threshold: 0.05 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    progressRef.current = interactive || hovered ? 0 : 0.48;
    if (rangeRef.current) rangeRef.current.value = String(progressRef.current.toFixed(2));
  }, [kind, interactive, hovered]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const vw = compact ? 192 : 320;
    const vh = compact ? 108 : 180;
    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 1.5);
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);

    const drawAt = (p: number) => {
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, vw, vh);
      ctx.fillStyle = "#09111f";
      ctx.fillRect(0, 0, vw, vh);

      const res = evaluateTransition({ kind, duration: effectiveDuration, intensity }, p);
      drawPosedScene(ctx, "A", res.outgoing, vw, vh);
      drawPosedScene(ctx, "B", res.incoming, vw, vh);
      if (res.overlayFlash) drawOverlayFlash(ctx, res.overlayFlash, vw, vh);
      ctx.restore();
    };

    const reducedMotion = Boolean(
      typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    );
    const shouldAnimate = inView && !reducedMotion && (playing || (compact && hovered));

    if (!shouldAnimate) {
      drawAt(compact ? 0.48 : progressRef.current);
      return;
    }

    let rafId = 0;
    let lastTs = performance.now();
    // Include short dwell frames before/after transition so the Clip A -> Clip B cut reads clearly
    const cycleSpan = Math.max(1.4, effectiveDuration + 0.9);
    let cycleClock = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;
      cycleClock = (cycleClock + dt) % cycleSpan;
      const p = clamp((cycleClock - 0.3) / Math.max(0.25, effectiveDuration), 0, 1);
      progressRef.current = p;
      if (rangeRef.current) rangeRef.current.value = p.toFixed(2);
      drawAt(p);
      rafId = requestAnimationFrame(tick);
    };

    drawAt(progressRef.current);
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [kind, effectiveDuration, intensity, compact, hovered, playing, inView, drawBump]);

  return (
    <div ref={hostRef} className={`relative overflow-hidden rounded-lg bg-slate-950 ${className}`}>
      <div className="relative aspect-video w-full">
        <canvas
          ref={canvasRef}
          aria-label={`Live preview of ${spec.name} transition`}
          className="h-full w-full block object-cover"
        />
        {compact && (
          <span className="pointer-events-none absolute bottom-1 right-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-mono text-white backdrop-blur-xs">
            {hovered ? "Previewing" : "Hover"}
          </span>
        )}
      </div>

      {interactive && (
        <div className="flex items-center gap-2 bg-slate-900/95 px-2.5 py-1.5 border-t border-slate-800 text-[10px] text-slate-300">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause transition preview" : "Play transition preview"}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-800 hover:bg-blue-600 text-white transition-colors cursor-pointer"
          >
            {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
          </button>
          <button
            type="button"
            onClick={() => {
              progressRef.current = 0;
              setPlaying(true);
              setDrawBump((n) => n + 1);
            }}
            aria-label="Replay transition"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-white transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
          <input
            ref={rangeRef}
            type="range"
            min={0}
            max={1}
            step={0.01}
            defaultValue={0}
            aria-label="Scrub transition progress"
            onChange={(e) => {
              setPlaying(false);
              progressRef.current = Number.parseFloat(e.target.value);
              setDrawBump((n) => n + 1);
            }}
            className="w-full h-1 accent-blue-500 cursor-pointer"
          />
          <span className="font-mono text-[10px] text-sky-300 shrink-0">
            {effectiveDuration.toFixed(2)}s
          </span>
        </div>
      )}
    </div>
  );
}
