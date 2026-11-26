"use client";

import React, { useMemo, useState } from "react";
import {
  Circle,
  Diamond,
  Film,
  Heart,
  Hexagon,
  Layers,
  Plus,
  RotateCcw,
  Scissors,
  Sparkles,
  Square,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { clamp, formatTime, type Clip } from "@/app/lib/editor/model";
import { usePlayback, useProject } from "@/app/lib/editor/store";
import { setVisualTreatment } from "@/app/lib/editor/visualTreatment";
import {
  VISUAL_MASK_CATALOG,
  VISUAL_MASK_KINDS,
  evaluateMaskAt,
  type MaskKeyframe,
  type MaskPoint,
  type VisualMask,
  type VisualMaskKind,
} from "@/app/lib/editor/visualMasks";
import { useEditor } from "./EditorContext";

const DEFAULT_HEXAGON: MaskPoint[] = [
  { x: 0.5, y: 0.08 },
  { x: 0.88, y: 0.28 },
  { x: 0.88, y: 0.72 },
  { x: 0.5, y: 0.92 },
  { x: 0.12, y: 0.72 },
  { x: 0.12, y: 0.28 },
];

const KIND_EXTRA_KEYS = ["radius", "points", "steps", "seed", "roughness"] as const;

function renderMaskIcon(kind: VisualMaskKind) {
  switch (kind) {
    case "split":
      return <Scissors size={14} />;
    case "filmstrip":
      return <Film size={14} />;
    case "circle":
      return <Circle size={14} />;
    case "rectangle":
      return <Square size={14} />;
    case "rounded-rect":
      return <Square size={14} className="rounded" />;
    case "heart":
      return <Heart size={14} />;
    case "star":
      return <Star size={14} />;
    case "diamond":
      return <Diamond size={14} />;
    case "polygon":
      return <Hexagon size={14} />;
    case "stepped":
      return <Layers size={14} />;
    case "torn-paper":
      return <Sparkles size={14} />;
  }
}

function buildMaskForKind(kind: VisualMaskKind, prev?: VisualMask): VisualMask {
  const base: VisualMask = {
    kind,
    progress: prev?.progress ?? 1,
    feather: prev?.feather ?? 0,
    opacity: prev?.opacity ?? 1,
    invert: prev?.invert ?? false,
    x: prev?.x ?? 0,
    y: prev?.y ?? 0,
    scale: prev?.scale ?? (kind === "circle" || kind === "heart" || kind === "star" || kind === "diamond" ? 0.75 : 1),
    ...(prev?.width !== undefined ? { width: prev.width } : {}),
    ...(prev?.height !== undefined ? { height: prev.height } : {}),
    rotation: prev?.rotation ?? 0,
    ...(prev?.direction ? { direction: prev.direction } : {}),
    ...(prev?.keyframes?.length ? { keyframes: prev.keyframes } : {}),
  };

  if (kind === "rounded-rect") {
    base.radius = prev?.radius ?? 0.14;
  } else if (kind === "rectangle") {
    if (prev?.radius !== undefined) base.radius = prev.radius;
  } else if (kind === "polygon") {
    base.points = prev?.points?.length && prev.points.length >= 3 ? prev.points : DEFAULT_HEXAGON;
  } else if (kind === "stepped") {
    base.steps = prev?.steps ?? 6;
  } else if (kind === "torn-paper") {
    base.seed = prev?.seed ?? 1337;
    base.roughness = prev?.roughness ?? 0.06;
  }

  // Strip fields disallowed on the selected mask kind
  const cleaned = { ...base } as Record<string, unknown>;
  for (const extraKey of KIND_EXTRA_KEYS) {
    if (extraKey === "radius" && (kind === "rounded-rect" || kind === "rectangle")) continue;
    if (extraKey === "points" && kind === "polygon") continue;
    if (extraKey === "steps" && kind === "stepped") continue;
    if ((extraKey === "seed" || extraKey === "roughness") && kind === "torn-paper") continue;
    delete cleaned[extraKey];
  }
  return cleaned as unknown as VisualMask;
}

function clipSourceTimeAt(clip: Clip, timelineTime: number): number {
  const raw = clip.sourceStart + (timelineTime - clip.startTime) * (clip.speed || 1);
  return Math.round(clamp(raw, clip.sourceStart, clip.sourceEnd) * 1000) / 1000;
}

function MaskKeyframeStrip({
  clip,
  fps,
  mask,
  isDark,
  locked,
  onPatchMask,
}: {
  clip: Clip;
  fps: number;
  mask: VisualMask;
  isDark: boolean;
  locked: boolean;
  onPatchMask: (nextMask: VisualMask) => void;
}) {
  const { playback } = useEditor();
  const { time } = usePlayback(playback);
  const [kfEasing, setKfEasing] = useState<NonNullable<MaskKeyframe["easing"]>>("smooth");

  const keyframes = useMemo(
    () => [...(mask.keyframes || [])].sort((a, b) => a.sourceTime - b.sourceTime),
    [mask.keyframes]
  );

  const sourceTime = clipSourceTimeAt(clip, time);
  const insideClip = time >= clip.startTime - 1e-4 && time <= clip.startTime + clip.duration + 1e-4;
  const activeTolerance = Math.max(0.02, (clip.speed || 1) / Math.max(1, fps) / 2);
  const activeKeyframe = keyframes.find((k) => Math.abs(k.sourceTime - sourceTime) <= activeTolerance);
  const evaluated = evaluateMaskAt(mask, sourceTime);

  function addOrUpdateKeyframe() {
    if (locked) return;
    const entry: MaskKeyframe = {
      sourceTime,
      progress: evaluated.progress,
      x: evaluated.x,
      y: evaluated.y,
      scale: evaluated.scale,
      ...(evaluated.width !== undefined ? { width: evaluated.width } : {}),
      ...(evaluated.height !== undefined ? { height: evaluated.height } : {}),
      rotation: evaluated.rotation,
      feather: evaluated.feather,
      opacity: evaluated.opacity,
      easing: kfEasing,
    };
    const nextFrames = [...keyframes.filter((k) => Math.abs(k.sourceTime - sourceTime) > activeTolerance), entry].sort(
      (a, b) => a.sourceTime - b.sourceTime
    );
    onPatchMask({ ...mask, keyframes: nextFrames });
  }

  function removeKeyframe(targetTime: number) {
    if (locked) return;
    const nextFrames = keyframes.filter((k) => Math.abs(k.sourceTime - targetTime) > 1e-6);
    const nextMask = { ...mask };
    if (nextFrames.length) {
      nextMask.keyframes = nextFrames;
    } else {
      delete nextMask.keyframes;
    }
    onPatchMask(nextMask);
  }

  function seekToKeyframe(kf: MaskKeyframe) {
    const timelineTime = clip.startTime + (kf.sourceTime - clip.sourceStart) / (clip.speed || 1);
    playback.set(clamp(timelineTime, clip.startTime, clip.startTime + clip.duration), false);
  }

  return (
    <div className={isDark ? "pt-2.5 border-t border-[#2E2E33] space-y-2" : "pt-2 border-t border-slate-100 space-y-2"}>
      <div className="flex items-center justify-between gap-2">
        <span className={isDark ? "text-[11px] font-semibold text-[#D4D4DC]" : "text-[10px] font-semibold text-slate-600 uppercase tracking-wide"}>
          Mask Keyframes ({keyframes.length})
        </span>
        <div className="flex items-center gap-1.5">
          <select
            aria-label="Mask keyframe easing"
            value={kfEasing}
            onChange={(e) => setKfEasing(e.target.value as NonNullable<MaskKeyframe["easing"]>)}
            className={
              isDark
                ? "bg-[#141418] text-[10px] text-[#E4E4E7] border border-[#2E2E33] rounded px-1.5 py-0.5"
                : "bg-slate-50 text-[10px] text-slate-700 border border-slate-200 rounded px-1.5 py-0.5"
            }
          >
            <option value="smooth">Smooth</option>
            <option value="ease-out">Ease Out</option>
            <option value="linear">Linear</option>
          </select>
          <button
            type="button"
            disabled={locked || !insideClip}
            onClick={addOrUpdateKeyframe}
            title={insideClip ? "Add or update mask keyframe at playhead" : "Move playhead inside clip"}
            className={
              isDark
                ? "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-[#00E5FF]/15 text-[#00E5FF] border border-[#00E5FF]/40 hover:bg-[#00E5FF]/25 disabled:opacity-40"
                : "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 disabled:opacity-40"
            }
          >
            <Plus size={11} />
            <span>{activeKeyframe ? "Update ◆" : "Keyframe"}</span>
          </button>
        </div>
      </div>

      {!insideClip && (
        <p className={isDark ? "text-[10px] text-[#8E8E98]" : "text-[10px] text-slate-400"}>
          Park the playhead inside this clip to keyframe mask movement, feather, or opacity.
        </p>
      )}

      {keyframes.length > 0 && (
        <div className="space-y-1 max-h-32 overflow-y-auto pr-0.5">
          {keyframes.map((kf) => {
            const timelineTime = clip.startTime + (kf.sourceTime - clip.sourceStart) / (clip.speed || 1);
            const isActive = Math.abs(kf.sourceTime - sourceTime) <= activeTolerance;
            return (
              <div
                key={kf.sourceTime}
                className={
                  isDark
                    ? `flex items-center justify-between gap-1.5 px-2 py-1 rounded text-[10px] border ${
                        isActive ? "bg-[#00E5FF]/15 border-[#00E5FF]/50 text-white" : "bg-[#18181C] border-[#2E2E33] text-[#C4C4CC]"
                      }`
                    : `flex items-center justify-between gap-1.5 px-2 py-1 rounded text-[10px] border ${
                        isActive ? "bg-sky-50 border-sky-300 text-sky-900" : "bg-slate-50 border-slate-200 text-slate-700"
                      }`
                }
              >
                <button
                  type="button"
                  onClick={() => seekToKeyframe(kf)}
                  className="flex items-center gap-1.5 text-left font-mono hover:underline"
                  title="Jump playhead to keyframe"
                >
                  <span className={isActive ? "text-[#00E5FF]" : "opacity-60"}>◆</span>
                  <span>{formatTime(timelineTime, fps)}</span>
                  <span className="opacity-70">
                    {Math.round(kf.progress * 100)}%
                    {kf.feather ? ` · F${Math.round(kf.feather)}` : ""}
                    {kf.opacity !== undefined && kf.opacity < 0.99 ? ` · O${Math.round(kf.opacity * 100)}%` : ""}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => removeKeyframe(kf.sourceTime)}
                  aria-label="Remove mask keyframe"
                  className="p-0.5 rounded opacity-70 hover:opacity-100 hover:text-rose-500 disabled:opacity-30"
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function MaskControls({
  clipId,
  theme = "dark",
}: {
  clipId: string;
  theme?: "dark" | "light";
}) {
  const { store, playback, run } = useEditor();
  const project = useProject(store);
  const clip = project.clips[clipId];
  const asset = clip?.assetId ? project.assets[clip.assetId] : undefined;
  const track = clip ? project.tracks[clip.trackId] : undefined;
  const isDark = theme === "dark";

  if (!clip || !asset || !["video", "image"].includes(asset.kind)) return null;
  const activeClip = clip;
  const locked = Boolean(track?.locked);
  const mask = activeClip.visualTreatment?.mask;

  function commitMask(nextMask: VisualMask | undefined) {
    if (locked) return;
    run((p) => {
      const current = p.clips[clipId];
      if (!current) return p;
      const existing = { ...(current.visualTreatment || {}) } as Record<string, unknown>;
      if (!nextMask) {
        delete existing.mask;
        const hasOther = Boolean(
          existing.card ||
            (Array.isArray(existing.effects) && existing.effects.length > 0) ||
            existing.entrance ||
            existing.exit
        );
        if (!hasOther) {
          return {
            ...p,
            clips: { ...p.clips, [clipId]: { ...current, visualTreatment: undefined } },
          };
        }
        return setVisualTreatment(p, clipId, existing);
      }
      return setVisualTreatment(p, clipId, { ...existing, mask: nextMask });
    });
  }

  function updateMaskField(patch: Partial<VisualMask>) {
    if (!mask || locked) return;
    const nextMask: VisualMask = { ...mask, ...patch };
    const keyframes = mask.keyframes;
    if (keyframes?.length) {
      const time = playback.getSnapshot().time;
      const st = clipSourceTimeAt(activeClip, time);
      const tol = Math.max(0.02, (activeClip.speed || 1) / Math.max(1, project.settings.fps || 30) / 2);
      const idx = keyframes.findIndex((k) => Math.abs(k.sourceTime - st) <= tol);
      if (idx >= 0) {
        const updated = [...keyframes];
        const kfPatch: Partial<MaskKeyframe> = {};
        if (patch.progress !== undefined) kfPatch.progress = patch.progress;
        if (patch.x !== undefined) kfPatch.x = patch.x;
        if (patch.y !== undefined) kfPatch.y = patch.y;
        if (patch.scale !== undefined) kfPatch.scale = patch.scale;
        if (patch.width !== undefined) kfPatch.width = patch.width;
        if (patch.height !== undefined) kfPatch.height = patch.height;
        if (patch.rotation !== undefined) kfPatch.rotation = patch.rotation;
        if (patch.feather !== undefined) kfPatch.feather = patch.feather;
        if (patch.opacity !== undefined) kfPatch.opacity = patch.opacity;
        updated[idx] = { ...updated[idx], ...kfPatch };
        nextMask.keyframes = updated;
      }
    }
    commitMask(nextMask);
  }

  const sliderLabelClass = isDark
    ? "flex items-center justify-between text-[11px] text-[#B4B4BE]"
    : "flex items-center justify-between text-[11px] text-slate-600";
  const rangeClass = isDark
    ? "w-full accent-[#00E5FF] cursor-pointer"
    : "w-full accent-sky-600 cursor-pointer";

  return (
    <section
      aria-label="Masking controls"
      className={
        isDark
          ? "capcut-card space-y-3"
          : "p-3 rounded-lg border border-slate-200 bg-white space-y-3"
      }
    >
      <div className={isDark ? "capcut-card-heading" : "flex items-center justify-between"}>
        <div className="flex items-center gap-1.5">
          <Scissors size={13} className={isDark ? "text-[#00E5FF]" : "text-sky-600"} />
          <span className={isDark ? "text-xs font-semibold text-white" : "text-xs font-semibold text-slate-800"}>
            Mask &amp; Feather
          </span>
          <span
            className={
              isDark
                ? "text-[9px] px-1.5 py-0.5 rounded bg-[#25252B] text-[#A0A0A8]"
                : "text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500"
            }
          >
            {VISUAL_MASK_KINDS.length} shapes
          </span>
        </div>
        {mask && (
          <button
            type="button"
            disabled={locked}
            onClick={() => commitMask(undefined)}
            className={
              isDark
                ? "flex items-center gap-1 text-[10px] text-[#A0A0A8] hover:text-rose-400"
                : "flex items-center gap-1 text-[10px] text-slate-500 hover:text-rose-600"
            }
            title="Clear mask"
          >
            <Trash2 size={11} />
            <span>None</span>
          </button>
        )}
      </div>

      {/* Preset Shape Selector Grid */}
      <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Mask shapes">
        {VISUAL_MASK_CATALOG.map((item) => {
          const active = mask?.kind === item.id;
          return (
            <button
              key={item.id}
              type="button"
              disabled={locked}
              title={item.description}
              aria-pressed={active}
              onClick={() => commitMask(buildMaskForKind(item.id, mask))}
              className={
                isDark
                  ? `flex flex-col items-center justify-center gap-1 py-1.5 px-1 rounded border text-[10px] transition-colors ${
                      active
                        ? "bg-[#00E5FF]/15 border-[#00E5FF] text-[#00E5FF] font-semibold"
                        : "bg-[#18181C] border-[#2E2E33] text-[#C4C4CC] hover:border-[#4A4A55] hover:text-white"
                    }`
                  : `flex flex-col items-center justify-center gap-1 py-1.5 px-1 rounded border text-[10px] transition-colors ${
                      active
                        ? "bg-sky-50 border-sky-500 text-sky-700 font-semibold"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`
              }
            >
              {renderMaskIcon(item.id)}
              <span className="truncate max-w-full leading-tight">{item.name}</span>
            </button>
          );
        })}
      </div>

      {/* Mask Parameters */}
      {mask && (
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
              <input
                type="checkbox"
                disabled={locked}
                checked={Boolean(mask.invert)}
                onChange={(e) => updateMaskField({ invert: e.target.checked })}
                className={isDark ? "accent-[#00E5FF]" : "accent-sky-600"}
              />
              <span className={isDark ? "text-[#E4E4E7]" : "text-slate-700"}>Invert Mask</span>
            </label>

            <button
              type="button"
              disabled={locked}
              onClick={() => commitMask(buildMaskForKind(mask.kind))}
              className={
                isDark
                  ? "flex items-center gap-1 text-[10px] text-[#A0A0A8] hover:text-[#00E5FF]"
                  : "flex items-center gap-1 text-[10px] text-slate-500 hover:text-sky-600"
              }
              title="Reset mask geometry"
            >
              <RotateCcw size={10} />
              <span>Reset</span>
            </button>
          </div>

          {/* Feather */}
          <label className="block space-y-1">
            <div className={sliderLabelClass}>
              <span>Feather</span>
              <span className="font-mono">{Math.round(mask.feather ?? 0)}</span>
            </div>
            <input
              type="range"
              aria-label="Mask feather"
              min={0}
              max={100}
              step={1}
              disabled={locked}
              value={mask.feather ?? 0}
              onPointerDown={() => store.begin()}
              onChange={(e) => updateMaskField({ feather: Number(e.target.value) })}
              onPointerUp={() => store.commit()}
              onPointerCancel={() => store.cancel()}
              className={rangeClass}
            />
          </label>

          {/* Opacity */}
          <label className="block space-y-1">
            <div className={sliderLabelClass}>
              <span>Mask Opacity</span>
              <span className="font-mono">{Math.round((mask.opacity ?? 1) * 100)}%</span>
            </div>
            <input
              type="range"
              aria-label="Mask opacity"
              min={0}
              max={100}
              step={1}
              disabled={locked}
              value={Math.round((mask.opacity ?? 1) * 100)}
              onPointerDown={() => store.begin()}
              onChange={(e) => updateMaskField({ opacity: Number(e.target.value) / 100 })}
              onPointerUp={() => store.commit()}
              onPointerCancel={() => store.cancel()}
              className={rangeClass}
            />
          </label>

          {/* Reveal / Aperture Progress */}
          <label className="block space-y-1">
            <div className={sliderLabelClass}>
              <span>Reveal / Aperture</span>
              <span className="font-mono">{Math.round((mask.progress ?? 1) * 100)}%</span>
            </div>
            <input
              type="range"
              aria-label="Mask reveal progress"
              min={0}
              max={100}
              step={1}
              disabled={locked}
              value={Math.round((mask.progress ?? 1) * 100)}
              onPointerDown={() => store.begin()}
              onChange={(e) => updateMaskField({ progress: Number(e.target.value) / 100 })}
              onPointerUp={() => store.commit()}
              onPointerCancel={() => store.cancel()}
              className={rangeClass}
            />
          </label>

          {/* Scale & Rotation */}
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <div className={sliderLabelClass}>
                <span>Size</span>
                <span className="font-mono">{Math.round((mask.scale ?? 1) * 100)}%</span>
              </div>
              <input
                type="range"
                aria-label="Mask scale"
                min={10}
                max={250}
                step={2}
                disabled={locked}
                value={Math.round((mask.scale ?? 1) * 100)}
                onPointerDown={() => store.begin()}
                onChange={(e) => updateMaskField({ scale: Number(e.target.value) / 100 })}
                onPointerUp={() => store.commit()}
                onPointerCancel={() => store.cancel()}
                className={rangeClass}
              />
            </label>

            <label className="block space-y-1">
              <div className={sliderLabelClass}>
                <span>Rotation</span>
                <span className="font-mono">{Math.round(mask.rotation ?? 0)}°</span>
              </div>
              <input
                type="range"
                aria-label="Mask rotation"
                min={-180}
                max={180}
                step={1}
                disabled={locked}
                value={Math.round(mask.rotation ?? 0)}
                onPointerDown={() => store.begin()}
                onChange={(e) => updateMaskField({ rotation: Number(e.target.value) })}
                onPointerUp={() => store.commit()}
                onPointerCancel={() => store.cancel()}
                className={rangeClass}
              />
            </label>
          </div>

          {/* Center X / Y */}
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <div className={sliderLabelClass}>
                <span>Pos X</span>
                <span className="font-mono">{(mask.x ?? 0).toFixed(2)}</span>
              </div>
              <input
                type="range"
                aria-label="Mask X offset"
                min={-100}
                max={100}
                step={2}
                disabled={locked}
                value={Math.round((mask.x ?? 0) * 100)}
                onPointerDown={() => store.begin()}
                onChange={(e) => updateMaskField({ x: Number(e.target.value) / 100 })}
                onPointerUp={() => store.commit()}
                onPointerCancel={() => store.cancel()}
                className={rangeClass}
              />
            </label>

            <label className="block space-y-1">
              <div className={sliderLabelClass}>
                <span>Pos Y</span>
                <span className="font-mono">{(mask.y ?? 0).toFixed(2)}</span>
              </div>
              <input
                type="range"
                aria-label="Mask Y offset"
                min={-100}
                max={100}
                step={2}
                disabled={locked}
                value={Math.round((mask.y ?? 0) * 100)}
                onPointerDown={() => store.begin()}
                onChange={(e) => updateMaskField({ y: Number(e.target.value) / 100 })}
                onPointerUp={() => store.commit()}
                onPointerCancel={() => store.cancel()}
                className={rangeClass}
              />
            </label>
          </div>

          {/* Kind-specific controls */}
          {(mask.kind === "rectangle" || mask.kind === "rounded-rect") && (
            <label className="block space-y-1">
              <div className={sliderLabelClass}>
                <span>Corner Radius</span>
                <span className="font-mono">{Math.round((mask.radius ?? 0) * 100)}%</span>
              </div>
              <input
                type="range"
                aria-label="Mask corner radius"
                min={0}
                max={50}
                step={1}
                disabled={locked}
                value={Math.round((mask.radius ?? 0) * 100)}
                onPointerDown={() => store.begin()}
                onChange={(e) => updateMaskField({ radius: Number(e.target.value) / 100 })}
                onPointerUp={() => store.commit()}
                onPointerCancel={() => store.cancel()}
                className={rangeClass}
              />
            </label>
          )}

          {mask.kind === "stepped" && (
            <label className="block space-y-1">
              <div className={sliderLabelClass}>
                <span>Steps</span>
                <span className="font-mono">{mask.steps ?? 6}</span>
              </div>
              <input
                type="range"
                aria-label="Mask steps"
                min={2}
                max={16}
                step={1}
                disabled={locked}
                value={mask.steps ?? 6}
                onPointerDown={() => store.begin()}
                onChange={(e) => updateMaskField({ steps: Number(e.target.value) })}
                onPointerUp={() => store.commit()}
                onPointerCancel={() => store.cancel()}
                className={rangeClass}
              />
            </label>
          )}

          {mask.kind === "torn-paper" && (
            <label className="block space-y-1">
              <div className={sliderLabelClass}>
                <span>Edge Roughness</span>
                <span className="font-mono">{Math.round((mask.roughness ?? 0.06) * 100)}</span>
              </div>
              <input
                type="range"
                aria-label="Torn paper roughness"
                min={0}
                max={15}
                step={1}
                disabled={locked}
                value={Math.round((mask.roughness ?? 0.06) * 100)}
                onPointerDown={() => store.begin()}
                onChange={(e) => updateMaskField({ roughness: Number(e.target.value) / 100 })}
                onPointerUp={() => store.commit()}
                onPointerCancel={() => store.cancel()}
                className={rangeClass}
              />
            </label>
          )}

          {(mask.kind === "split" ||
            mask.kind === "stepped" ||
            mask.kind === "torn-paper" ||
            mask.kind === "filmstrip") && (
            <div className="flex items-center justify-between gap-2">
              <span className={isDark ? "text-[11px] text-[#B4B4BE]" : "text-[11px] text-slate-600"}>
                Direction
              </span>
              <div className="flex items-center gap-1">
                {(["left", "right", "up", "down"] as const).map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    disabled={locked}
                    onClick={() => updateMaskField({ direction: dir })}
                    className={
                      isDark
                        ? `px-1.5 py-0.5 rounded text-[10px] border capitalize ${
                            (mask.direction ?? "left") === dir
                              ? "bg-[#00E5FF]/20 border-[#00E5FF] text-[#00E5FF]"
                              : "bg-[#18181C] border-[#2E2E33] text-[#A0A0A8]"
                          }`
                        : `px-1.5 py-0.5 rounded text-[10px] border capitalize ${
                            (mask.direction ?? "left") === dir
                              ? "bg-sky-50 border-sky-500 text-sky-700"
                              : "bg-slate-50 border-slate-200 text-slate-600"
                          }`
                    }
                  >
                    {dir}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Source-clock Mask Keyframes */}
          <MaskKeyframeStrip
            clip={clip}
            fps={project.settings.fps || 30}
            mask={mask}
            isDark={isDark}
            locked={locked}
            onPatchMask={commitMask}
          />
        </div>
      )}
    </section>
  );
}
