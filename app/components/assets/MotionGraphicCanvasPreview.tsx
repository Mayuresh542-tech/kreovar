"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import {
  drawGraphicPanel,
  GRAPHIC_THEMES,
  type GraphicTheme,
  type MotionGraphic,
} from "../../lib/editor/motionGraphics";
import type { KreovarMotionTemplate } from "../../lib/editor/kreovarMotionTemplates";

// Richer simulated video-frame & studio backing surfaces so overlays read authentically
const THEME_BACKDROPS: Record<GraphicTheme, string> = {
  "clean-light":
    "radial-gradient(circle at 20% 20%, #e0ecff 0%, #eef4ff 46%, #e2e8f0 100%)",
  "frosted-glass":
    "radial-gradient(circle at 28% 22%, #2563eb 0%, #1d4fb1 34%, #13223e 100%)",
  "editorial-paper":
    "radial-gradient(circle at 75% 25%, #f5efe6 0%, #ebe5d8 52%, #d6d0c4 100%)",
  "dark-slate":
    "radial-gradient(circle at 75% 18%, #1e3a5f 0%, #0f172a 55%, #070b14 100%)",
};

const THEME_LABELS: Record<GraphicTheme, string> = {
  "clean-light": "Light Studio",
  "frosted-glass": "Sapphire Film",
  "editorial-paper": "Editorial Paper",
  "dark-slate": "Dark Cinema",
};

const CYCLE_DURATION = 2.6;
const SETTLED_HERO_TIME = 1.55;

export interface MotionGraphicCanvasPreviewProps {
  template: KreovarMotionTemplate;
  compact?: boolean;
  interactive?: boolean;
  autoPlay?: boolean;
  themeOverride?: GraphicTheme;
  accentOverride?: string;
  className?: string;
  aspect?: "16:9" | "16:10";
  showControls?: boolean;
}

function buildGraphicPayload(
  template: KreovarMotionTemplate,
  theme: GraphicTheme,
  accent: string
): MotionGraphic {
  const panelByTheme: Record<GraphicTheme, string> = {
    "clean-light": "#fbfbfdf2",
    "frosted-glass": "#ffffffd9",
    "editorial-paper": "#faf8f2f5",
    "dark-slate": "#111827e8",
  };
  return {
    kind: template.kind,
    accent,
    panel: panelByTheme[theme] || "#fbfbfdf2",
    theme,
    ...(template.subtitle !== undefined ? { subtitle: template.subtitle } : {}),
    ...(template.icon !== undefined ? { icon: template.icon } : {}),
    ...(template.value !== undefined ? { value: template.value } : {}),
    ...(template.prefix !== undefined ? { prefix: template.prefix } : {}),
    ...(template.suffix !== undefined ? { suffix: template.suffix } : {}),
    ...(template.items !== undefined ? { items: template.items } : {}),
    ...(template.bars !== undefined ? { bars: template.bars } : {}),
    ...(template.comparison !== undefined ? { comparison: template.comparison } : {}),
    ...(template.targetX !== undefined ? { targetX: template.targetX } : {}),
    ...(template.targetY !== undefined ? { targetY: template.targetY } : {}),
  };
}

export default function MotionGraphicCanvasPreview({
  template,
  compact = false,
  interactive = false,
  autoPlay,
  themeOverride,
  accentOverride,
  className = "",
  aspect = "16:9",
  showControls = interactive,
}: MotionGraphicCanvasPreviewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rangeRef = useRef<HTMLInputElement | null>(null);
  const timeLabelRef = useRef<HTMLSpanElement | null>(null);

  const [themeSelection, setThemeSelection] = useState<{
    templateId: string;
    theme: GraphicTheme;
  } | null>(null);
  const activeTheme =
    themeOverride ??
    (themeSelection?.templateId === template.id ? themeSelection.theme : undefined) ??
    template.theme ??
    "clean-light";
  const activeAccent = accentOverride ?? template.accent;

  // Compact gallery thumbnails stay crisp & static (0% CPU) until hovered/replayed;
  // full interactive theater stages default to playing when visible.
  const defaultPlay = autoPlay ?? interactive;
  const [playing, setPlaying] = useState(defaultPlay);
  const [manualDrawVersion, setManualDrawVersion] = useState(0);
  const [inView, setInView] = useState(true);
  const [hovered, setHovered] = useState(false);

  const reducedMotionRef = useRef(false);
  const playheadRef = useRef(defaultPlay ? 0.08 : SETTLED_HERO_TIME);

  const syncScrubUi = (t: number) => {
    const val = t.toFixed(2);
    if (rangeRef.current) rangeRef.current.value = val;
    if (timeLabelRef.current) timeLabelRef.current.textContent = `${t.toFixed(1)}s`;
  };

  useEffect(() => {
    playheadRef.current = defaultPlay ? 0.08 : SETTLED_HERO_TIME;
    syncScrubUi(playheadRef.current);
  }, [template.id, defaultPlay]);

  useEffect(() => {
    reducedMotionRef.current =
      typeof window !== "undefined" &&
      Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
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

  const graphicPayload = useMemo(
    () => buildGraphicPayload(template, activeTheme, activeAccent),
    [template, activeTheme, activeAccent]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const virtualW = 640;
    const virtualH = aspect === "16:10" ? 400 : 360;
    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 1.75);
    const pixelW = Math.round(virtualW * dpr);
    const pixelH = Math.round(virtualH * dpr);
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
    }

    let rafId = 0;
    let lastTs = performance.now();

    const drawAt = (t: number) => {
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, virtualW, virtualH);

      // Subtle viewfinder corner L-brackets matching an authentic video monitor without grid noise
      const cornerColor =
        activeTheme === "clean-light" || activeTheme === "editorial-paper"
          ? "rgba(20, 36, 64, 0.14)"
          : "rgba(255, 255, 255, 0.2)";
      ctx.strokeStyle = cornerColor;
      ctx.lineWidth = 1.5;
      const m = 18;
      const cl = 14;
      const corners: Array<[number, number, number, number]> = [
        [m, m, 1, 1],
        [virtualW - m, m, -1, 1],
        [m, virtualH - m, 1, -1],
        [virtualW - m, virtualH - m, -1, -1],
      ];
      for (const [cx, cy, sx, sy] of corners) {
        ctx.beginPath();
        ctx.moveTo(cx, cy + sy * cl);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + sx * cl, cy);
        ctx.stroke();
      }

      const enterProgress = Math.min(1, t / 0.34);
      const easeOut = 1 - Math.pow(1 - enterProgress, 3);
      const baseScale = compact ? 1.12 : 1.24;
      const offsetY = (1 - easeOut) * 12;

      ctx.translate(virtualW / 2, virtualH / 2 + offsetY);
      ctx.scale(baseScale, baseScale);
      ctx.globalAlpha = Math.max(0.08, Math.min(1, t / 0.16));

      const res = drawGraphicPanel(ctx, graphicPayload, 260, 72, t, {
        font: "Plus Jakarta Sans, Inter, system-ui, sans-serif",
        title: template.text,
        frameWidth: virtualW,
        frameHeight: virtualH,
      });

      if (!res.handlesText && template.text) {
        ctx.fillStyle = activeTheme === "dark-slate" ? "#ffffff" : "#0f172a";
        ctx.font = "700 20px Plus Jakarta Sans, Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(template.text, 0, 0);
      }

      ctx.restore();
    };

    const shouldAnimate =
      inView &&
      !reducedMotionRef.current &&
      (playing || (compact && hovered));

    if (!shouldAnimate) {
      const targetTime = reducedMotionRef.current
        ? SETTLED_HERO_TIME
        : compact
        ? SETTLED_HERO_TIME
        : playheadRef.current;
      drawAt(targetTime);
      syncScrubUi(targetTime);
      return;
    }

    if (compact && hovered) {
      playheadRef.current = 0.05;
    }

    const tick = (now: number) => {
      if (document.visibilityState === "hidden") {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;
      playheadRef.current = (playheadRef.current + dt) % CYCLE_DURATION;
      drawAt(playheadRef.current);
      if (interactive) {
        syncScrubUi(playheadRef.current);
      }
      rafId = requestAnimationFrame(tick);
    };

    drawAt(playheadRef.current);
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [
    graphicPayload,
    template.text,
    activeTheme,
    aspect,
    compact,
    playing,
    inView,
    hovered,
    interactive,
    manualDrawVersion,
  ]);

  const handleReplay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    playheadRef.current = 0.02;
    syncScrubUi(0.02);
    setPlaying(true);
    setManualDrawVersion((v) => v + 1);
  };

  return (
    <div
      ref={hostRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        if (compact) setPlaying(false);
      }}
      className={`relative overflow-hidden select-none ${
        compact ? "rounded-xl border border-slate-200/80" : "rounded-2xl border border-white/80 shadow-md"
      } ${className}`}
      style={{
        background: THEME_BACKDROPS[activeTheme],
      }}
    >
      <div className={`relative w-full ${aspect === "16:10" ? "aspect-[16/10]" : "aspect-video"}`}>
        <canvas
          ref={canvasRef}
          aria-label={`Live preview of ${template.name} motion graphic`}
          className="h-full w-full block object-contain"
        />

        {!showControls && (
          <div className="pointer-events-none absolute inset-x-2 top-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-mono font-semibold text-slate-700 backdrop-blur-md shadow-xs">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: activeAccent }}
              />
              {hovered ? "Playing" : "Hover to play"}
            </span>
            <button
              type="button"
              onClick={handleReplay}
              aria-label={`Replay ${template.name} animation`}
              className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-xs hover:bg-white hover:text-blue-700 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {showControls && (
        <div className="border-t border-slate-200/70 bg-white/90 backdrop-blur-md px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 flex-1 min-w-[170px]">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause motion preview" : "Play motion preview"}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#13223E] text-white hover:bg-[#1D4FB1] transition-colors cursor-pointer"
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
            </button>
            <button
              type="button"
              onClick={handleReplay}
              aria-label="Replay from start"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <input
              ref={rangeRef}
              type="range"
              aria-label="Scrub motion graphic timeline"
              min={0}
              max={CYCLE_DURATION}
              step={0.02}
              defaultValue={0.35}
              onChange={(e) => {
                const next = Number.parseFloat(e.target.value);
                setPlaying(false);
                playheadRef.current = next;
                syncScrubUi(next);
                setManualDrawVersion((v) => v + 1);
              }}
              className="w-full accent-[#1D4FB1] cursor-pointer h-1.5"
            />
            <span
              ref={timeLabelRef}
              className="font-mono text-[10px] text-slate-500 shrink-0 tabular-nums"
            >
              0.4s
            </span>
          </div>

          {!themeOverride && (
            <div className="flex items-center gap-1" role="group" aria-label="Preview backdrop theme">
              {GRAPHIC_THEMES.map((themeKey) => (
                <button
                  key={themeKey}
                  type="button"
                  onClick={() => setThemeSelection({ templateId: template.id, theme: themeKey })}
                  className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors cursor-pointer ${
                    activeTheme === themeKey
                      ? "bg-[#1D4FB1] text-white shadow-2xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {THEME_LABELS[themeKey]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
