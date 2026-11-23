"use client";

import React, { useState } from "react";
import { usePlayback, useProject } from "@/app/lib/editor/store";
import {
  MOTION_PRESETS,
  applyMotionPreset,
  captureKeyframe,
  keyframeTransform,
  setTransformKeyframes,
  type MotionEasing,
  type MotionPreset,
} from "@/app/lib/editor/keyframes";
import { useEditor } from "./EditorContext";
import ObjectAnimationControls from "./ObjectAnimationControls";
import {
  Sparkles,
  Trash2,
  Clock,
  ChevronLeft,
  ChevronRight,
  Plus,
  RotateCcw,
  Sliders,
} from "lucide-react";

interface KeyframeControlsProps {
  clipId: string;
  activeProperty?: "x" | "y" | "scale" | "rotation" | "opacity";
  onPropertySelect?: (property: "x" | "y" | "scale" | "rotation" | "opacity") => void;
}

export default function KeyframeControls({
  clipId,
  activeProperty,
  onPropertySelect,
}: KeyframeControlsProps) {
  const { store, playback, run } = useEditor();
  const p = useProject(store);
  const { time } = usePlayback(playback);
  const c = p.clips[clipId];
  const [ease, setEase] = useState<MotionEasing>("smooth");

  if (!c) return null;

  const inside = time >= c.startTime && time < c.startTime + c.duration;
  const t = keyframeTransform(c, time);
  const track = p.tracks[c.trackId];
  const isLocked = track?.locked;

  // Calculate current source time
  const fps = p.settings.fps || 30;
  const sourceTime =
    c.sourceStart +
    (Math.round((time - c.startTime) * fps) / fps) * c.speed;

  // Check if a keyframe exists at current playhead
  const currentKeyframe = (c.keyframes || []).find(
    (f) => Math.abs(f.sourceTime - sourceTime) <= c.speed / fps / 2
  );

  const keyframes = (c.keyframes || [])
    .filter(
      (f) => f.sourceTime >= c.sourceStart - 1e-4 && f.sourceTime <= c.sourceEnd + 1e-4
    )
    .sort((a, b) => a.sourceTime - b.sourceTime);

  // Jump to previous/next keyframe helpers
  function jumpToPrevKeyframe() {
    const prev = [...keyframes]
      .reverse()
      .find((f) => f.sourceTime < sourceTime - 1e-4);
    if (prev) {
      const at = c.startTime + (prev.sourceTime - c.sourceStart) / c.speed;
      playback.set(Math.max(c.startTime, Math.min(c.startTime + c.duration, at)), false);
    }
  }

  function jumpToNextKeyframe() {
    const next = keyframes.find((f) => f.sourceTime > sourceTime + 1e-4);
    if (next) {
      const at = c.startTime + (next.sourceTime - c.sourceStart) / c.speed;
      playback.set(Math.max(c.startTime, Math.min(c.startTime + c.duration, at)), false);
    }
  }

  function toggleKeyframeAtPlayhead() {
    if (!inside || isLocked) return;
    if (currentKeyframe) {
      // Remove keyframe at this time
      run((proj) =>
        setTransformKeyframes(
          proj,
          clipId,
          (proj.clips[clipId].keyframes || []).filter(
            (k) => Math.abs(k.sourceTime - currentKeyframe.sourceTime) > 1e-4
          )
        )
      );
    } else {
      // Capture keyframe at this time
      run((proj) => captureKeyframe(proj, clipId, time, t, ease));
    }
  }

  const properties: Array<{
    key: "x" | "y" | "scale" | "rotation" | "opacity";
    label: string;
    step: number;
    format: (v: number) => string;
  }> = [
    { key: "x", label: "Position X", step: 0.01, format: (v) => `${(v * 100).toFixed(0)}%` },
    { key: "y", label: "Position Y", step: 0.01, format: (v) => `${(v * 100).toFixed(0)}%` },
    { key: "scale", label: "Scale", step: 0.01, format: (v) => `${(v * 100).toFixed(0)}%` },
    { key: "rotation", label: "Rotation", step: 1, format: (v) => `${v.toFixed(0)}°` },
    { key: "opacity", label: "Opacity", step: 0.01, format: (v) => `${(v * 100).toFixed(0)}%` },
  ];

  return (
    <section className="bg-[#222226] border border-[#2E2E33] rounded-lg p-3 text-white text-xs mb-3 shadow-sm">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-[#2E2E33]">
        <div className="flex items-center gap-1.5 font-semibold text-white">
          <span className="text-[#00E5FF] text-sm">◆</span>
          <span>Transform Keyframes</span>
          {keyframes.length > 0 && (
            <span className="bg-[#18181C] text-[#00E5FF] text-[10px] px-1.5 py-0.5 rounded border border-[#2E2E33]">
              {keyframes.length}
            </span>
          )}
        </div>

        {/* Global Keyframe Stepper & Toggle */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Previous keyframe"
            disabled={!inside || isLocked || keyframes.length === 0}
            onClick={jumpToPrevKeyframe}
            className="w-5 h-5 flex items-center justify-center rounded bg-[#18181C] hover:bg-[#2A2A30] text-[#A0A0A8] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed border border-[#2E2E33]"
          >
            <ChevronLeft size={12} />
          </button>

          <button
            type="button"
            title={currentKeyframe ? "Remove keyframe at playhead" : "Add keyframe at playhead"}
            disabled={!inside || isLocked}
            onClick={toggleKeyframeAtPlayhead}
            className={`w-6 h-5 flex items-center justify-center rounded text-xs transition-colors border ${
              currentKeyframe
                ? "bg-[#00E5FF]/20 text-[#00E5FF] border-[#00E5FF] hover:bg-[#00E5FF]/30"
                : "bg-[#18181C] text-[#A0A0A8] hover:text-[#00E5FF] border-[#2E2E33] hover:border-[#00E5FF]/50"
            } disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            {currentKeyframe ? "◆" : "◇"}
          </button>

          <button
            type="button"
            title="Next keyframe"
            disabled={!inside || isLocked || keyframes.length === 0}
            onClick={jumpToNextKeyframe}
            className="w-5 h-5 flex items-center justify-center rounded bg-[#18181C] hover:bg-[#2A2A30] text-[#A0A0A8] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed border border-[#2E2E33]"
          >
            <ChevronRight size={12} />
          </button>
        </div>
      </div>

      {!c.assetId && <ObjectAnimationControls clipId={clipId} />}

      <p className="text-[11px] text-[#A0A0A8] leading-relaxed mb-3">
        Place the playhead on the clip to drop diamond keyframes. Position, scale, rotation and
        opacity interpolate smoothly across keyframe points.
      </p>

      {/* Motion Preset & Easing Controls */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="block text-[10px] text-[#A0A0A8] mb-1 font-medium">
            Motion Preset
          </label>
          <select
            aria-label="Animation preset"
            value=""
            disabled={isLocked}
            onChange={(e) => {
              if (e.target.value) {
                run((proj) =>
                  applyMotionPreset(proj, clipId, e.target.value as MotionPreset)
                );
              }
            }}
            className="w-full bg-[#18181C] border border-[#2E2E33] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#00E5FF]"
          >
            <option value="">Apply preset...</option>
            {MOTION_PRESETS.map((v) => (
              <option key={v} value={v}>
                {v.replaceAll("-", " ")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] text-[#A0A0A8] mb-1 font-medium">
            Keyframe Easing
          </label>
          <select
            aria-label="Keyframe easing"
            value={ease}
            disabled={isLocked}
            onChange={(e) => setEase(e.target.value as MotionEasing)}
            className="w-full bg-[#18181C] border border-[#2E2E33] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#00E5FF]"
          >
            <option value="smooth">Smooth (Bézier)</option>
            <option value="linear">Linear</option>
            <option value="ease-out">Ease Out (Decel)</option>
            <option value="overshoot">Overshoot (Spring)</option>
          </select>
        </div>
      </div>

      {/* Property Keyframe Diamonds Row */}
      <fieldset disabled={!inside || isLocked} className="space-y-1.5 mb-3">
        {properties.map(({ key, label, step, format }) => {
          const val = t[key];
          const hasKeyframe = Boolean(currentKeyframe);
          return (
            <div
              key={key}
              className={`flex items-center justify-between p-1.5 rounded bg-[#18181C] border ${
                activeProperty === key ? "border-[#00E5FF]/60" : "border-[#2E2E33]"
              }`}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  title={hasKeyframe ? `Remove ${label} keyframe` : `Add ${label} keyframe`}
                  onClick={toggleKeyframeAtPlayhead}
                  className={`text-sm transition-transform hover:scale-110 ${
                    hasKeyframe ? "text-[#00E5FF]" : "text-[#A0A0A8] hover:text-[#00E5FF]"
                  }`}
                >
                  {hasKeyframe ? "◆" : "◇"}
                </button>
                <span className="text-[11px] text-[#A0A0A8]">{label}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[#00E5FF] font-mono">
                  {format(val)}
                </span>
                <input
                  type="number"
                  aria-label={`Animated ${key}`}
                  step={step}
                  value={Number.isFinite(val) ? Number(val.toFixed(3)) : 0}
                  onChange={(e) => {
                    const value = e.target.valueAsNumber;
                    if (Number.isFinite(value)) {
                      run((proj) =>
                        captureKeyframe(
                          proj,
                          clipId,
                          time,
                          { ...t, [key]: value },
                          ease
                        )
                      );
                    }
                  }}
                  className="w-16 bg-[#121214] border border-[#2E2E33] rounded px-1.5 py-0.5 text-right font-mono text-[11px] text-white focus:outline-none focus:border-[#00E5FF]"
                />
              </div>
            </div>
          );
        })}
      </fieldset>

      {/* Add / Clear Keyframe Action Strip */}
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          disabled={!inside || isLocked}
          onClick={() => run((proj) => captureKeyframe(proj, clipId, time, t, ease))}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-[#00E5FF]/10 text-[#00E5FF] hover:bg-[#00E5FF]/20 border border-[#00E5FF]/40 rounded font-medium text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={13} />
          <span>Add keyframe</span>
        </button>

        {keyframes.length > 0 && (
          <button
            type="button"
            disabled={isLocked}
            onClick={() => run((proj) => setTransformKeyframes(proj, clipId, []))}
            className="flex items-center justify-center gap-1 py-1.5 px-2.5 bg-[#18181C] text-[#A0A0A8] hover:text-red-400 hover:bg-[#2A2A30] border border-[#2E2E33] rounded text-xs transition-colors"
            title="Clear all keyframes"
          >
            <RotateCcw size={12} />
            <span>Clear</span>
          </button>
        )}
      </div>

      {!inside && (
        <p className="text-[10px] text-amber-400/80 bg-amber-950/20 border border-amber-900/30 rounded p-1.5 mb-2">
          Place playhead within clip bounds ({c.startTime.toFixed(2)}s - {(c.startTime + c.duration).toFixed(2)}s) to add keyframes.
        </p>
      )}

      {/* Keyframe Timeline Strip */}
      {keyframes.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-[#2E2E33]">
          <div className="flex items-center justify-between text-[10px] text-[#A0A0A8] mb-1.5">
            <span>Keyframes on clip</span>
            <span>{keyframes.length} points</span>
          </div>

          <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
            {keyframes.map((f, idx) => {
              const at = c.startTime + (f.sourceTime - c.sourceStart) / c.speed;
              const isCurrent = Math.abs(at - time) < 0.05;
              return (
                <div
                  key={`${f.sourceTime}-${idx}`}
                  className={`flex items-center justify-between px-2 py-1 rounded border text-[11px] ${
                    isCurrent
                      ? "bg-[#00E5FF]/10 border-[#00E5FF]/50 text-white"
                      : "bg-[#18181C] border-[#2E2E33] text-[#A0A0A8]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => playback.set(at, false)}
                    className="flex items-center gap-1.5 hover:text-[#00E5FF] transition-colors"
                    title={`Jump to ${at.toFixed(2)}s`}
                  >
                    <span className="text-[#00E5FF]">◆</span>
                    <span className="font-mono">{at.toFixed(2)}s</span>
                    <span className="text-[9px] text-[#666672] uppercase">({f.easing})</span>
                  </button>

                  <button
                    type="button"
                    aria-label={`Remove keyframe at ${at.toFixed(2)}s`}
                    disabled={isLocked}
                    onClick={() =>
                      run((proj) =>
                        setTransformKeyframes(
                          proj,
                          clipId,
                          (proj.clips[clipId].keyframes || []).filter(
                            (k) => Math.abs(k.sourceTime - f.sourceTime) > 1e-4
                          )
                        )
                      )
                    }
                    className="text-[#666672] hover:text-red-400 p-0.5 transition-colors"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
