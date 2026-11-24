"use client";

import React, { useState } from "react";
import {
  Sliders,
  ChevronRight,
  Video,
  Type,
  Music,
  MessageSquare,
  Layers,
  Trash2,
  RotateCcw,
  Plus,
  Play,
  Key,
  Clock,
  Sparkles,
  Lock,
  Unlock,
  Volume2,
  VolumeX,
  Gauge,
  Activity,
  Zap,
  Check,
  ChevronDown,
} from "lucide-react";
import {
  VeeloxTimelineProject,
  TimelineItem,
  TimelineKeyframe,
  KeyframeProperty,
  AspectRatio,
  TransitionType,
} from "@/app/lib/timeline/types";
import { CaptionPosition } from "@/app/lib/captions/presets";
import { DEFAULT_CAPTION_TEMPLATES } from "@/app/lib/captions/templates";
import {
  SPEED_CURVE_PRESETS,
  getSpeedCurvePreset,
  generateSpeedCurveSvgPoints,
  calculateAverageSpeed,
  calculateTimelineDurationFromSource,
  formatGainAsDecibels,
  linearGainToDecibels,
  decibelsToLinearGain,
  formatDecibels,
} from "@/app/lib/editor/speedCurves";

interface EditorPropertiesInspectorProps {
  timeline: VeeloxTimelineProject;
  selectedClip: TimelineItem | null;
  selectedClipIds?: string[];
  currentTime?: number;
  width?: number;
  onUpdateClip: (item: TimelineItem) => void;
  onUpdateMultipleClips?: (clipIds: string[], updates: Partial<TimelineItem>) => void;
  onDeleteMultipleClips?: (clipIds: string[]) => void;
  onUpdateSettings: (newSettings: Partial<VeeloxTimelineProject["settings"]>) => void;
  onUpdateAspectRatio: (ratio: AspectRatio) => void;
  onApplyStyleToAllCaptions?: () => void;
  onSeek?: (time: number) => void;
  isOpen?: boolean;
  onToggleOpen?: () => void;
}

const GOOGLE_FONTS = [
  "Inter",
  "Montserrat",
  "Poppins",
  "Outfit",
  "Anton",
  "Bangers",
  "Bebas Neue",
  "Oswald",
  "Syne",
  "JetBrains Mono",
];

const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4];

const TRANSITION_PRESETS: Array<{ id: TransitionType; label: string }> = [
  { id: "cut", label: "Cut" },
  { id: "fade", label: "Fade" },
  { id: "dissolve", label: "Dissolve" },
  { id: "dip_black", label: "Dip Black" },
  { id: "dip_white", label: "Dip White" },
  { id: "zoom", label: "Zoom" },
  { id: "slide", label: "Slide" },
  { id: "push", label: "Push" },
  { id: "wipe", label: "Wipe" },
  { id: "blur", label: "Blur" },
];

/**
 * CapCut Keyframe Diamond Icon Component (<> style)
 */
function KeyframeDiamond({
  active = false,
  onClick,
  title,
}: {
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title || "Keyframe"}
      className="p-1 cursor-pointer transition-colors group flex items-center justify-center shrink-0"
    >
      <span
        className={`block w-2.5 h-2.5 rotate-45 transition-colors ${
          active
            ? "bg-amber-500 border border-amber-600 shadow-2xs"
            : "border border-slate-400 group-hover:border-slate-700 bg-transparent"
        }`}
      />
    </button>
  );
}

/**
 * CapCut Stepper Input Component with Display Value & Up/Down Steppers
 */
function StepperBox({
  displayValue,
  onStepUp,
  onStepDown,
}: {
  displayValue: string;
  onStepUp: () => void;
  onStepDown: () => void;
}) {
  return (
    <div className="flex items-center bg-slate-100 hover:bg-slate-200/70 border border-slate-200 rounded-md px-1.5 py-0.5 gap-1.5 text-[11px] font-mono text-slate-800 transition-colors select-none shrink-0">
      <span className="min-w-[42px] text-right font-semibold">{displayValue}</span>
      <div className="flex flex-col -space-y-0.5 text-slate-400 leading-none">
        <button
          type="button"
          onClick={onStepUp}
          className="hover:text-slate-900 cursor-pointer p-0.5 leading-none"
          title="Step Up"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={onStepDown}
          className="hover:text-slate-900 cursor-pointer p-0.5 leading-none"
          title="Step Down"
        >
          ▼
        </button>
      </div>
    </div>
  );
}

export default function EditorPropertiesInspector({
  timeline,
  selectedClip,
  selectedClipIds = [],
  currentTime = 0,
  width = 320,
  onUpdateClip,
  onUpdateMultipleClips,
  onDeleteMultipleClips,
  onUpdateSettings,
  onUpdateAspectRatio,
  onApplyStyleToAllCaptions,
  onSeek,
  isOpen = true,
  onToggleOpen,
}: EditorPropertiesInspectorProps) {
  // CapCut Inspector Tab States
  const [activeInspectorTab, setActiveInspectorTab] = useState<
    "video" | "audio" | "speed" | "animation" | "adjust"
  >("video");
  const [speedSubTab, setSpeedSubTab] = useState<"standard" | "curve">("standard");
  const [audioBasicOpen, setAudioBasicOpen] = useState(true);

  // Keyframe creator state
  const [kfProperty, setKfProperty] = useState<
    "scale" | "rotation" | "opacity" | "position" | "position_x" | "position_y" | "volume"
  >("scale");
  const [kfValue, setKfValue] = useState<number>(1.2);
  const [kfEasing, setKfEasing] = useState<"linear" | "ease_in" | "ease_out" | "ease_in_out">("ease_in_out");
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);
  const [speedMode, setSpeedMode] = useState<"constant" | "curve">("constant");

  // Local playhead time inside selected clip
  const localPlayhead = selectedClip
    ? Math.max(0, Math.min(selectedClip.duration, currentTime - selectedClip.startTime))
    : 0;
  const roundedPlayhead = Math.round(localPlayhead * 100) / 100;

  function hasKeyframeAtPlayhead(prop: KeyframeProperty | "position") {
    if (!selectedClip || !selectedClip.keyframes) return false;
    if (prop === "position") {
      return selectedClip.keyframes.some(
        (k) =>
          (k.property === "position" || k.property === "position_x" || k.property === "position_y") &&
          Math.abs(k.time - roundedPlayhead) < 0.05
      );
    }
    return selectedClip.keyframes.some(
      (k) => k.property === prop && Math.abs(k.time - roundedPlayhead) < 0.05
    );
  }

  function handleAddKeyframe(propOverride?: KeyframeProperty | "position", valOverride?: number) {
    if (!selectedClip) return;
    const prop = propOverride || kfProperty;
    let val = valOverride !== undefined ? valOverride : kfValue;

    if (valOverride === undefined) {
      if (prop === "scale") val = selectedClip.scale ?? 1.0;
      else if (prop === "rotation") val = selectedClip.rotation ?? 0;
      else if (prop === "opacity") val = selectedClip.opacity ?? 1.0;
      else if (prop === "position_x") val = selectedClip.position?.x ?? 0;
      else if (prop === "position_y") val = selectedClip.position?.y ?? 0;
      else if (prop === "volume") val = selectedClip.volume ?? 1.0;
    }

    let updated = [...(selectedClip.keyframes || [])];

    if (prop === "position") {
      // Add or update both position_x and position_y at playhead
      const xVal = selectedClip.position?.x ?? 0;
      const yVal = selectedClip.position?.y ?? 0;
      const filtered = updated.filter(
        (k) =>
          !(
            Math.abs(k.time - roundedPlayhead) < 0.05 &&
            (k.property === "position" || k.property === "position_x" || k.property === "position_y")
          )
      );
      const kfX: TimelineKeyframe = {
        id: `kf_${Date.now()}_x_${Math.random().toString(36).slice(2, 6)}`,
        time: roundedPlayhead,
        property: "position_x",
        value: xVal,
        easing: kfEasing,
      };
      const kfY: TimelineKeyframe = {
        id: `kf_${Date.now()}_y_${Math.random().toString(36).slice(2, 6)}`,
        time: roundedPlayhead,
        property: "position_y",
        value: yVal,
        easing: kfEasing,
      };
      updated = [...filtered, kfX, kfY].sort((a, b) => a.time - b.time);
    } else {
      const filtered = updated.filter(
        (k) => !(Math.abs(k.time - roundedPlayhead) < 0.05 && k.property === prop)
      );
      const newKf: TimelineKeyframe = {
        id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: roundedPlayhead,
        property: prop as KeyframeProperty,
        value: val,
        easing: kfEasing,
      };
      updated = [...filtered, newKf].sort((a, b) => a.time - b.time);
    }

    onUpdateClip({ ...selectedClip, keyframes: updated });
  }

  function handleDeleteKeyframe(kfId: string) {
    if (!selectedClip) return;
    const updated = (selectedClip.keyframes || []).filter((k) => k.id !== kfId);
    onUpdateClip({ ...selectedClip, keyframes: updated });
  }

  function handleToggleKeyframeAtPlayhead(prop: KeyframeProperty | "position", currentVal: number) {
    if (!selectedClip) return;
    if (prop === "position") {
      const existing = (selectedClip.keyframes || []).filter(
        (k) =>
          (k.property === "position" || k.property === "position_x" || k.property === "position_y") &&
          Math.abs(k.time - roundedPlayhead) < 0.05
      );
      if (existing.length > 0) {
        const ids = new Set(existing.map((e) => e.id));
        const updated = (selectedClip.keyframes || []).filter((k) => !ids.has(k.id));
        onUpdateClip({ ...selectedClip, keyframes: updated });
      } else {
        handleAddKeyframe("position");
      }
      return;
    }

    const existing = (selectedClip.keyframes || []).find(
      (k) => k.property === prop && Math.abs(k.time - roundedPlayhead) < 0.05
    );
    if (existing) {
      handleDeleteKeyframe(existing.id);
    } else {
      handleAddKeyframe(prop, currentVal);
    }
  }

  // If panel is collapsed, render minimal vertical pill
  if (!isOpen) {
    return (
      <div className="w-12 h-full bg-white border-l border-slate-200 flex flex-col items-center py-3 gap-3 shrink-0 select-none">
        <button
          type="button"
          onClick={onToggleOpen}
          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer transition-colors"
          title="Expand Properties Inspector"
        >
          <Sliders className="w-4 h-4" />
        </button>
        <span className="text-[10px] font-mono text-slate-400 [writing-mode:vertical-lr] tracking-widest uppercase mt-4">
          Inspector
        </span>
      </div>
    );
  }

  // Render CapCut Basic Audio Controls (Image 3 Parity)
  function renderBasicAudioControls(clip: TimelineItem) {
    const volLinear = clip.volume ?? 1.0;
    const volDb = linearGainToDecibels(volLinear);
    const fadeInSec = clip.fadeIn ?? 0;
    const fadeOutSec = clip.fadeOut ?? 0;

    return (
      <div className="space-y-4">
        {/* Basic Section Accordion (Image 3 Parity) */}
        <div className="border border-slate-200 rounded-xl p-3 bg-white space-y-3 shadow-2xs">
          <div className="flex items-center justify-between pb-1 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-sky-500 text-white flex items-center justify-center shadow-2xs">
                <Check size={11} strokeWidth={3} />
              </div>
              <button
                type="button"
                onClick={() => setAudioBasicOpen((prev) => !prev)}
                className="font-semibold text-slate-900 text-xs flex items-center gap-1 cursor-pointer hover:text-slate-700"
              >
                <span>Basic</span>
                <ChevronDown
                  size={13}
                  className={`text-slate-400 transition-transform ${audioBasicOpen ? "" : "-rotate-90"}`}
                />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onUpdateClip({
                    ...clip,
                    volume: 1.0,
                    fadeIn: 0,
                    fadeOut: 0,
                  });
                }}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer transition-colors"
                title="Reset Audio Settings"
              >
                <RotateCcw size={13} />
              </button>
              <KeyframeDiamond
                active={hasKeyframeAtPlayhead("volume")}
                onClick={() => handleToggleKeyframeAtPlayhead("volume", volLinear)}
                title="Volume Keyframe"
              />
            </div>
          </div>

          {audioBasicOpen && (
            <div className="space-y-3 pt-1">
              {/* 1. Volume Row */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-700">
                  <span className="font-medium">Volume</span>
                  <div className="flex items-center gap-1.5">
                    <StepperBox
                      displayValue={formatGainAsDecibels(volLinear).replace(" ", "")}
                      onStepUp={() => {
                        const nextDb = Math.min(12, Math.round((volDb + 0.5) * 10) / 10);
                        onUpdateClip({
                          ...clip,
                          volume: decibelsToLinearGain(nextDb),
                        });
                      }}
                      onStepDown={() => {
                        const nextDb = Math.max(-40, Math.round((volDb - 0.5) * 10) / 10);
                        onUpdateClip({
                          ...clip,
                          volume: decibelsToLinearGain(nextDb),
                        });
                      }}
                    />
                    <KeyframeDiamond
                      active={hasKeyframeAtPlayhead("volume")}
                      onClick={() => handleToggleKeyframeAtPlayhead("volume", volLinear)}
                      title="Toggle Volume Keyframe at Playhead"
                    />
                  </div>
                </div>
                <div className="relative flex items-center w-full h-5">
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.01"
                    value={volLinear}
                    onChange={(e) =>
                      onUpdateClip({
                        ...clip,
                        volume: parseFloat(e.target.value),
                      })
                    }
                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-800"
                  />
                </div>
              </div>

              {/* 2. Fade in Row */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-700">
                  <span className="font-medium">Fade in</span>
                  <div className="flex items-center gap-1.5">
                    <StepperBox
                      displayValue={`${fadeInSec.toFixed(1)}s`}
                      onStepUp={() => {
                        const nextFade = Math.min(5.0, Math.round((fadeInSec + 0.1) * 10) / 10);
                        onUpdateClip({ ...clip, fadeIn: nextFade });
                      }}
                      onStepDown={() => {
                        const nextFade = Math.max(0, Math.round((fadeInSec - 0.1) * 10) / 10);
                        onUpdateClip({ ...clip, fadeIn: nextFade });
                      }}
                    />
                    <KeyframeDiamond
                      title="Fade in Keyframe"
                      onClick={() => {}}
                    />
                  </div>
                </div>
                <div className="relative flex items-center w-full h-5">
                  <input
                    type="range"
                    min="0"
                    max="5.0"
                    step="0.1"
                    value={fadeInSec}
                    onChange={(e) =>
                      onUpdateClip({
                        ...clip,
                        fadeIn: parseFloat(e.target.value),
                      })
                    }
                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-800"
                  />
                </div>
              </div>

              {/* 3. Fade out Row */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-700">
                  <span className="font-medium">Fade out</span>
                  <div className="flex items-center gap-1.5">
                    <StepperBox
                      displayValue={`${fadeOutSec.toFixed(1)}s`}
                      onStepUp={() => {
                        const nextFade = Math.min(5.0, Math.round((fadeOutSec + 0.1) * 10) / 10);
                        onUpdateClip({ ...clip, fadeOut: nextFade });
                      }}
                      onStepDown={() => {
                        const nextFade = Math.max(0, Math.round((fadeOutSec - 0.1) * 10) / 10);
                        onUpdateClip({ ...clip, fadeOut: nextFade });
                      }}
                    />
                    <KeyframeDiamond
                      title="Fade out Keyframe"
                      onClick={() => {}}
                    />
                  </div>
                </div>
                <div className="relative flex items-center w-full h-5">
                  <input
                    type="range"
                    min="0"
                    max="5.0"
                    step="0.1"
                    value={fadeOutSec}
                    onChange={(e) =>
                      onUpdateClip({
                        ...clip,
                        fadeOut: parseFloat(e.target.value),
                      })
                    }
                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-800"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Equal-Power Crossfade & Transition Controls */}
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-800">
              Equal-Power Crossfade
            </span>
            <input
              type="checkbox"
              checked={clip.equalPowerCrossfade ?? true}
              onChange={(e) =>
                onUpdateClip({
                  ...clip,
                  equalPowerCrossfade: e.target.checked,
                })
              }
              className="w-4 h-4 rounded text-sky-600 cursor-pointer accent-sky-600"
            />
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            {(clip.equalPowerCrossfade ?? true)
              ? "Constant power cosine-sine curve eliminates 3 dB volume dip between adjoining clips."
              : "Linear crossfade (causes subtle volume dip at center point)."}
          </p>
        </div>
      </div>
    );
  }

  // Render CapCut Speed Controls (Image 4 & 5 Parity)
  function renderSpeedControls(clip: TimelineItem) {
    const curSpeed = clip.speed ?? 1.0;
    const srcDur = clip.metadata?.sourceDuration ?? (clip.duration * (clip.speed ?? 1.0));
    const speedCurveId = (clip as any).speedCurveId;
    const effectiveDur = speedCurveId
      ? calculateTimelineDurationFromSource(srcDur, getSpeedCurvePreset(speedCurveId))
      : clip.duration;

    return (
      <div className="space-y-4">
        {/* Mode Switcher: Standard | Curve (Image 4 & 5 Parity) */}
        <div className="grid grid-cols-2 p-0.5 bg-slate-100 rounded-lg text-xs font-semibold text-slate-600">
          <button
            type="button"
            onClick={() => setSpeedSubTab("standard")}
            className={`py-1.5 rounded-md transition-all cursor-pointer text-center ${
              speedSubTab === "standard"
                ? "bg-white text-slate-900 shadow-2xs font-bold"
                : "hover:text-slate-900"
            }`}
          >
            Standard
          </button>
          <button
            type="button"
            onClick={() => setSpeedSubTab("curve")}
            className={`py-1.5 rounded-md transition-all cursor-pointer text-center ${
              speedSubTab === "curve"
                ? "bg-white text-slate-900 shadow-2xs font-bold"
                : "hover:text-slate-900"
            }`}
          >
            Curve
          </button>
        </div>

        {speedSubTab === "standard" && (
          <div className="space-y-4">
            {/* Speed Row */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-700">
                <span className="font-medium">Speed</span>
                <StepperBox
                  displayValue={`${curSpeed.toFixed(2)}x`}
                  onStepUp={() => {
                    const nextSpeed = Math.min(10.0, Math.round((curSpeed + 0.05) * 100) / 100);
                    onUpdateClip({
                      ...clip,
                      speed: nextSpeed,
                      duration: srcDur / nextSpeed,
                      speedCurvePreset: undefined,
                    });
                  }}
                  onStepDown={() => {
                    const nextSpeed = Math.max(0.1, Math.round((curSpeed - 0.05) * 100) / 100);
                    onUpdateClip({
                      ...clip,
                      speed: nextSpeed,
                      duration: srcDur / nextSpeed,
                      speedCurvePreset: undefined,
                    });
                  }}
                />
              </div>

              {/* Slider with Visible Tick Marks at 1x, 2x, 5x, 10x */}
              <div className="relative pt-1 pb-3">
                <input
                  type="range"
                  min="0.1"
                  max="10.0"
                  step="0.05"
                  value={curSpeed}
                  onChange={(e) => {
                    const spd = parseFloat(e.target.value);
                    onUpdateClip({
                      ...clip,
                      speed: spd,
                      duration: srcDur / spd,
                      speedCurvePreset: undefined,
                    });
                  }}
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-800"
                />
                {/* Tick Marks: 1x, 2x, 5x, 10x */}
                <div className="relative w-full h-4 mt-1 select-none pointer-events-none">
                  {[
                    { label: "1x", val: 1.0 },
                    { label: "2x", val: 2.0 },
                    { label: "5x", val: 5.0 },
                    { label: "10x", val: 10.0 },
                  ].map((tick) => {
                    const pct = ((tick.val - 0.1) / 9.9) * 100;
                    return (
                      <div
                        key={tick.label}
                        style={{ position: "absolute", left: `${pct}%`, transform: "translateX(-50%)" }}
                        className="text-[9px] font-mono text-slate-400 flex flex-col items-center"
                      >
                        <span className="w-0.5 h-1.5 bg-slate-300 mb-0.5" />
                        <span>{tick.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Duration Row with Dashed Arrow Line */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs text-slate-700">
                <span className="font-medium">Duration</span>
                <StepperBox
                  displayValue={`${clip.duration.toFixed(1)}s`}
                  onStepUp={() => {
                    const nextDur = Math.max(0.2, Math.round((clip.duration + 0.5) * 10) / 10);
                    const nextSpeed = Math.max(0.1, Math.min(10.0, srcDur / nextDur));
                    onUpdateClip({
                      ...clip,
                      duration: nextDur,
                      speed: nextSpeed,
                      speedCurvePreset: undefined,
                    });
                  }}
                  onStepDown={() => {
                    const nextDur = Math.max(0.2, Math.round((clip.duration - 0.5) * 10) / 10);
                    const nextSpeed = Math.max(0.1, Math.min(10.0, srcDur / nextDur));
                    onUpdateClip({
                      ...clip,
                      duration: nextDur,
                      speed: nextSpeed,
                      speedCurvePreset: undefined,
                    });
                  }}
                />
              </div>

              {/* Dashed Timeline Arrow */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] font-mono text-slate-500 shrink-0">
                  {srcDur.toFixed(1)}s
                </span>
                <div className="flex-1 flex items-center relative py-1">
                  <div className="w-full border-b border-dashed border-slate-400 relative">
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 w-0 h-0 border-y-[3px] border-y-transparent border-l-[6px] border-l-slate-500" />
                  </div>
                </div>
                <span className="text-[11px] font-mono text-slate-800 font-semibold shrink-0">
                  {clip.duration.toFixed(1)}s
                </span>
              </div>
            </div>

            {/* Change Audio Pitch Toggle Switch */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-700 font-medium">Change audio pitch</span>
              <button
                type="button"
                onClick={() =>
                  onUpdateClip({
                    ...clip,
                    preservePitch: !(clip.preservePitch ?? true),
                  })
                }
                className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                  (clip.preservePitch ?? true) ? "bg-sky-500 justify-end" : "bg-slate-200 justify-start"
                }`}
              >
                <div className="w-4 h-4 rounded-full bg-white shadow-2xs" />
              </button>
            </div>

            {/* Subtext: Smooth slow-mo note */}
            <p className="text-[10px] text-slate-400">
              Smooth slow-mo Only slow-speed videos are supported.
            </p>

            {/* Reset Button */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  onUpdateClip({
                    ...clip,
                    speed: 1.0,
                    duration: srcDur,
                    speedCurvePreset: undefined,
                  });
                }}
                className="px-4 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        )}

        {speedSubTab === "curve" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-1.5">
              {[
                SPEED_CURVE_PRESETS.hero,
                SPEED_CURVE_PRESETS.bullet,
                SPEED_CURVE_PRESETS.montage,
                SPEED_CURVE_PRESETS.jump_cut,
                SPEED_CURVE_PRESETS.flash_in,
                SPEED_CURVE_PRESETS.flash_out,
              ].map((preset) => {
                const isSelected =
                  clip.speedCurvePreset?.toLowerCase() === preset.id ||
                  clip.speedCurvePreset?.toLowerCase() === preset.name.toLowerCase();
                const avgSpeed = calculateAverageSpeed(preset);
                const svgPoints = generateSpeedCurveSvgPoints(preset, 110, 32);

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      onUpdateClip({
                        ...clip,
                        speedCurvePreset: preset.name as any,
                        speed: Math.round(avgSpeed * 100) / 100,
                      });
                    }}
                    className={`p-2 rounded-xl border text-left cursor-pointer transition-all flex flex-col gap-1.5 ${
                      isSelected
                        ? "bg-sky-50 border-sky-500 ring-2 ring-sky-200 shadow-2xs"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-900 flex items-center gap-1">
                        {preset.name}
                        {isSelected && <Check className="w-3 h-3 text-sky-600" />}
                      </span>
                      <span className="text-[9px] font-mono text-slate-500">
                        ~{avgSpeed.toFixed(1)}x
                      </span>
                    </div>

                    <div className="w-full h-8 bg-slate-900 rounded-md overflow-hidden flex items-center justify-center px-1">
                      <svg viewBox="0 0 110 32" className="w-full h-full overflow-visible">
                        <polyline
                          fill="none"
                          stroke={isSelected ? "#38BDF8" : "#94A3B8"}
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={svgPoints}
                        />
                      </svg>
                    </div>

                    <p className="text-[9px] text-slate-500 leading-tight truncate">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Pitch Lock Toggle */}
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-800">
                  Pitch Lock (WSOLA)
                </span>
                <input
                  type="checkbox"
                  checked={clip.preservePitch ?? true}
                  onChange={(e) =>
                    onUpdateClip({
                      ...clip,
                      preservePitch: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded text-sky-600 cursor-pointer accent-sky-600"
                />
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                {(clip.preservePitch ?? true)
                  ? "Preserves original vocal pitch across speed ramping using Waveform Similarity Overlap-Add."
                  : "Pitch shifts proportionally with velocity."}
              </p>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => {
                  onUpdateClip({
                    ...clip,
                    speed: 1.0,
                    duration: srcDur,
                    speedCurvePreset: undefined,
                  });
                }}
                className="px-4 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const isMultiSelection = selectedClipIds.length > 1;

  // Determine contextual mode based on selected clip's track and type
  const inspectorType = isMultiSelection
    ? "multi"
    : selectedClip
    ? selectedClip.track === "captions" || selectedClip.type === "caption"
      ? "caption"
      : selectedClip.track === "text" || selectedClip.type === "text"
      ? "text"
      : selectedClip.track === "voiceover" ||
        selectedClip.track === "music" ||
        selectedClip.track === "sfx" ||
        selectedClip.type === "voiceover" ||
        selectedClip.type === "music" ||
        selectedClip.type === "sfx"
      ? "audio"
      : "video"
    : "project";

  return (
    <div
      style={{ width: `${width}px` }}
      className="h-full bg-white border-l border-slate-200 flex flex-col shrink-0 overflow-hidden select-none"
    >
      {/* 1. Header with Context Badge and CapCut Tabs */}
      <div className="border-b border-slate-200 bg-white shrink-0">
        <div className="h-10 px-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {inspectorType === "multi" && <Layers className="w-4 h-4 text-purple-600 shrink-0" />}
            {inspectorType === "video" && <Video className="w-4 h-4 text-sky-600 shrink-0" />}
            {inspectorType === "text" && <Type className="w-4 h-4 text-amber-500 shrink-0" />}
            {inspectorType === "caption" && <MessageSquare className="w-4 h-4 text-sky-600 shrink-0" />}
            {inspectorType === "audio" && <Music className="w-4 h-4 text-emerald-600 shrink-0" />}
            {inspectorType === "project" && <Sliders className="w-4 h-4 text-slate-700 shrink-0" />}

            <span className="text-xs font-bold text-slate-900 tracking-tight truncate">
              {inspectorType === "multi" && `Multi-Selection (${selectedClipIds.length})`}
              {inspectorType === "video" && "Video Clip Properties"}
              {inspectorType === "text" && "Text Layer Properties"}
              {inspectorType === "caption" && "Caption Style & Timing"}
              {inspectorType === "audio" && "Audio & Ducking"}
              {inspectorType === "project" && "Details"}
            </span>
          </div>

          {onToggleOpen && (
            <button
              type="button"
              onClick={onToggleOpen}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 cursor-pointer transition-colors"
              title="Collapse Inspector"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* CapCut Inspector Top Tabs (Image 5 Parity: Video | Audio | Speed | Animation | Adjust) */}
        {(inspectorType === "video" || inspectorType === "audio") && (
          <div className="flex items-center px-2 gap-1 border-t border-slate-100 bg-slate-50/60 text-xs">
            {inspectorType === "video" && (
              <button
                type="button"
                onClick={() => setActiveInspectorTab("video")}
                className={`py-2 px-2.5 font-medium border-b-2 transition-colors cursor-pointer ${
                  activeInspectorTab === "video"
                    ? "border-sky-500 text-sky-600 font-bold bg-white"
                    : "border-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                Video
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveInspectorTab("audio")}
              className={`py-2 px-2.5 font-medium border-b-2 transition-colors cursor-pointer ${
                activeInspectorTab === "audio" || (inspectorType === "audio" && activeInspectorTab !== "speed")
                  ? "border-sky-500 text-sky-600 font-bold bg-white"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              Audio
            </button>
            <button
              type="button"
              onClick={() => setActiveInspectorTab("speed")}
              className={`py-2 px-2.5 font-medium border-b-2 transition-colors cursor-pointer ${
                activeInspectorTab === "speed"
                  ? "border-sky-500 text-sky-600 font-bold bg-white"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              Speed
            </button>
            {inspectorType === "video" && (
              <>
                <button
                  type="button"
                  onClick={() => setActiveInspectorTab("animation")}
                  className={`py-2 px-2.5 font-medium border-b-2 transition-colors cursor-pointer ${
                    activeInspectorTab === "animation"
                      ? "border-sky-500 text-sky-600 font-bold bg-white"
                      : "border-transparent text-slate-500 hover:text-slate-900"
                  }`}
                >
                  Animation
                </button>
                <button
                  type="button"
                  onClick={() => setActiveInspectorTab("adjust")}
                  className={`py-2 px-2.5 font-medium border-b-2 transition-colors cursor-pointer ${
                    activeInspectorTab === "adjust"
                      ? "border-sky-500 text-sky-600 font-bold bg-white"
                      : "border-transparent text-slate-500 hover:text-slate-900"
                  }`}
                >
                  Adjust
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 2. Scrollable Body Content */}
      <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-5 custom-scrollbar text-xs text-slate-700">
        {/* ========================================================= */}
        {/* CASE 0: MULTI-SELECTION INSPECTOR                        */}
        {/* ========================================================= */}
        {inspectorType === "multi" && (
          <div className="space-y-4">
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs space-y-1 text-purple-950">
              <span className="font-bold flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-purple-600" />
                {selectedClipIds.length} Clips Selected
              </span>
              <p className="text-[10px] text-purple-800">
                Bulk adjustments applied here safely modify all currently selected timeline items.
              </p>
            </div>

            {/* Batch Playback Speed */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">
                Batch Playback Speed
              </span>
              <div className="grid grid-cols-4 gap-1.5 font-mono text-[10px]">
                {[0.5, 1, 1.5, 2].map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => {
                      if (onUpdateMultipleClips) {
                        onUpdateMultipleClips(selectedClipIds, { speed: spd });
                      }
                    }}
                    className="py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold cursor-pointer transition-colors text-center"
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            {/* Batch Opacity */}
            <div className="space-y-2">
              <div className="flex justify-between text-[11px] font-mono">
                <span>Batch Opacity</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                defaultValue="1"
                onChange={(e) => {
                  if (onUpdateMultipleClips) {
                    onUpdateMultipleClips(selectedClipIds, { opacity: parseFloat(e.target.value) });
                  }
                }}
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
              />
            </div>

            {/* Batch Volume */}
            <div className="space-y-2">
              <div className="flex justify-between text-[11px] font-mono">
                <span>Batch Volume</span>
              </div>
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.05"
                defaultValue="1"
                onChange={(e) => {
                  if (onUpdateMultipleClips) {
                    onUpdateMultipleClips(selectedClipIds, { volume: parseFloat(e.target.value) });
                  }
                }}
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
              />
            </div>

            {/* Delete Selected Items */}
            {onDeleteMultipleClips && (
              <button
                type="button"
                onClick={() => onDeleteMultipleClips(selectedClipIds)}
                className="w-full py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-semibold text-xs cursor-pointer transition-colors flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Delete All {selectedClipIds.length} Selected Clips</span>
              </button>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* CASE A: VIDEO CLIP INSPECTOR                             */}
        {/* ========================================================= */}
        {inspectorType === "video" && selectedClip && (
          <>
            {/* SUB-TAB 1: VIDEO (Transform & Keyframes) */}
            {activeInspectorTab === "video" && (
              <>
                {/* Spatial Transform Precision */}
                <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">
                  Spatial Transform
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateClip({
                      ...selectedClip,
                      position: { x: 0, y: 0 },
                      scale: 1,
                      rotation: 0,
                      opacity: 1,
                      fit: "cover",
                    })
                  }
                  className="text-[10px] font-medium text-blue-600 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>

              {/* Numeric Position X & Y */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-slate-600 font-mono">Position (px)</label>
                  <button
                    type="button"
                    onClick={() => handleToggleKeyframeAtPlayhead("position", 0)}
                    className={`p-0.5 rounded cursor-pointer transition-colors ${
                      hasKeyframeAtPlayhead("position")
                        ? "text-amber-500 fill-amber-500 hover:text-amber-600"
                        : "text-slate-400 hover:text-amber-500"
                    }`}
                    title={
                      hasKeyframeAtPlayhead("position")
                        ? "Remove position keyframe at playhead"
                        : "Add position keyframe at playhead"
                    }
                  >
                    <Key className="w-3 h-3" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-mono">X</label>
                    <input
                      type="number"
                      value={selectedClip.position?.x ?? 0}
                      onChange={(e) =>
                        onUpdateClip({
                          ...selectedClip,
                          position: {
                            x: parseInt(e.target.value) || 0,
                            y: selectedClip.position?.y ?? 0,
                          },
                        })
                      }
                      className="w-full p-1.5 rounded-lg border border-slate-200 text-xs font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-mono">Y</label>
                    <input
                      type="number"
                      value={selectedClip.position?.y ?? 0}
                      onChange={(e) =>
                        onUpdateClip({
                          ...selectedClip,
                          position: {
                            x: selectedClip.position?.x ?? 0,
                            y: parseInt(e.target.value) || 0,
                          },
                        })
                      }
                      className="w-full p-1.5 rounded-lg border border-slate-200 text-xs font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Scale with numeric precision + aspect toggle */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[11px] font-mono">
                  <span className="flex items-center gap-1">
                    Scale
                    <button
                      type="button"
                      onClick={() => setMaintainAspectRatio((m) => !m)}
                      className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                      title={maintainAspectRatio ? "Aspect ratio locked" : "Aspect ratio unlocked"}
                    >
                      {maintainAspectRatio ? <Lock className="w-2.5 h-2.5 text-blue-600" /> : <Unlock className="w-2.5 h-2.5 text-slate-400" />}
                    </button>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleToggleKeyframeAtPlayhead("scale", selectedClip.scale ?? 1.0)}
                      className={`p-0.5 rounded cursor-pointer transition-colors ${
                        hasKeyframeAtPlayhead("scale")
                          ? "text-amber-500 fill-amber-500 hover:text-amber-600"
                          : "text-slate-400 hover:text-amber-500"
                      }`}
                      title={
                        hasKeyframeAtPlayhead("scale")
                          ? "Remove scale keyframe at playhead"
                          : "Add scale keyframe at playhead"
                      }
                    >
                      <Key className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      step="5"
                      min="10"
                      max="300"
                      value={Math.round((selectedClip.scale ?? 1.0) * 100)}
                      onChange={(e) =>
                        onUpdateClip({ ...selectedClip, scale: (parseInt(e.target.value) || 100) / 100 })
                      }
                      className="w-14 p-0.5 text-right rounded border border-slate-200 text-[10px] font-mono font-bold"
                    />
                    <span className="text-slate-500">%</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.05"
                  value={selectedClip.scale ?? 1.0}
                  onChange={(e) =>
                    onUpdateClip({ ...selectedClip, scale: parseFloat(e.target.value) })
                  }
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
                />
              </div>

              {/* Rotation with numeric precision */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[11px] font-mono">
                  <span>Rotation</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleToggleKeyframeAtPlayhead("rotation", selectedClip.rotation ?? 0)}
                      className={`p-0.5 rounded cursor-pointer transition-colors ${
                        hasKeyframeAtPlayhead("rotation")
                          ? "text-amber-500 fill-amber-500 hover:text-amber-600"
                          : "text-slate-400 hover:text-amber-500"
                      }`}
                      title={
                        hasKeyframeAtPlayhead("rotation")
                          ? "Remove rotation keyframe at playhead"
                          : "Add rotation keyframe at playhead"
                      }
                    >
                      <Key className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      min="-180"
                      max="180"
                      value={selectedClip.rotation ?? 0}
                      onChange={(e) =>
                        onUpdateClip({ ...selectedClip, rotation: parseInt(e.target.value) || 0 })
                      }
                      className="w-14 p-0.5 text-right rounded border border-slate-200 text-[10px] font-mono font-bold"
                    />
                    <span className="text-slate-500">°</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="5"
                  value={selectedClip.rotation ?? 0}
                  onChange={(e) =>
                    onUpdateClip({ ...selectedClip, rotation: parseInt(e.target.value) })
                  }
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
                />
              </div>

              {/* Opacity with numeric precision */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[11px] font-mono">
                  <span>Opacity</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleToggleKeyframeAtPlayhead("opacity", selectedClip.opacity ?? 1.0)}
                      className={`p-0.5 rounded cursor-pointer transition-colors ${
                        hasKeyframeAtPlayhead("opacity")
                          ? "text-amber-500 fill-amber-500 hover:text-amber-600"
                          : "text-slate-400 hover:text-amber-500"
                      }`}
                      title={
                        hasKeyframeAtPlayhead("opacity")
                          ? "Remove opacity keyframe at playhead"
                          : "Add opacity keyframe at playhead"
                      }
                    >
                      <Key className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={Math.round((selectedClip.opacity ?? 1.0) * 100)}
                      onChange={(e) =>
                        onUpdateClip({ ...selectedClip, opacity: (parseInt(e.target.value) || 0) / 100 })
                      }
                      className="w-14 p-0.5 text-right rounded border border-slate-200 text-[10px] font-mono font-bold"
                    />
                    <span className="text-slate-500">%</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={selectedClip.opacity ?? 1.0}
                  onChange={(e) =>
                    onUpdateClip({ ...selectedClip, opacity: parseFloat(e.target.value) })
                  }
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
                />
              </div>
            </div>

            <div className="h-px bg-slate-200" />

            {/* KEYFRAME MANAGER SECTION */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1">
                  <Key className="w-3 h-3 text-amber-500" />
                  Keyframes ({selectedClip.keyframes?.length || 0})
                </span>
                <button
                  type="button"
                  onClick={() => handleAddKeyframe()}
                  className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 cursor-pointer flex items-center gap-1"
                  title="Add keyframe at current playhead position"
                >
                  <Plus className="w-3 h-3" /> Add at Playhead
                </button>
              </div>

              {/* Keyframe Parameters */}
              <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
                <select
                  value={kfProperty}
                  onChange={(e) => setKfProperty(e.target.value as any)}
                  className="p-1 rounded border border-slate-200 bg-white"
                >
                  <option value="scale">Scale</option>
                  <option value="rotation">Rotation</option>
                  <option value="opacity">Opacity</option>
                  <option value="position">Position (X/Y)</option>
                  <option value="position_x">Position X</option>
                  <option value="position_y">Position Y</option>
                  <option value="volume">Volume</option>
                </select>

                <input
                  type="number"
                  step="0.1"
                  value={kfValue}
                  onChange={(e) => setKfValue(parseFloat(e.target.value) || 0)}
                  className="p-1 rounded border border-slate-200 text-center font-bold"
                  placeholder="Value"
                />

                <select
                  value={kfEasing}
                  onChange={(e) => setKfEasing(e.target.value as any)}
                  className="p-1 rounded border border-slate-200 bg-white"
                >
                  <option value="linear">Linear</option>
                  <option value="ease_in">Ease In</option>
                  <option value="ease_out">Ease Out</option>
                  <option value="ease_in_out">Ease In/Out</option>
                </select>
              </div>

              {/* Keyframe List */}
              {selectedClip.keyframes && selectedClip.keyframes.length > 0 ? (
                <div className="space-y-1 max-h-36 overflow-y-auto custom-scrollbar">
                  {selectedClip.keyframes.map((kf) => (
                    <div
                      key={kf.id}
                      className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[10px] font-mono"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => onSeek?.(selectedClip.startTime + kf.time)}
                          className="text-blue-600 hover:underline font-bold flex items-center gap-0.5 cursor-pointer"
                          title="Seek to keyframe"
                        >
                          <Clock className="w-2.5 h-2.5" />
                          <span>+{kf.time.toFixed(2)}s</span>
                        </button>
                        <span className="text-slate-700 font-semibold truncate">
                          {kf.property}: {typeof kf.value === "number" ? Math.round(kf.value * 100) / 100 : kf.value}
                        </span>
                        <span className="text-[8px] px-1 rounded bg-slate-200 text-slate-600 font-normal">
                          {kf.easing || "linear"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteKeyframe(kf.id)}
                        className="p-0.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                        title="Delete keyframe"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[10px] font-mono text-slate-400 text-center py-1">
                  No keyframes on this clip yet
                </div>
              )}
            </div>
          </>
        )}

            {/* SUB-TAB 2: AUDIO (Image 3 CapCut Basic Audio Controls) */}
            {activeInspectorTab === "audio" && renderBasicAudioControls(selectedClip)}

            {/* SUB-TAB 3: SPEED (Image 4 & 5 CapCut Speed Controls) */}
            {activeInspectorTab === "speed" && renderSpeedControls(selectedClip)}

            {/* SUB-TAB 4: ANIMATION (Transitions) */}
            {activeInspectorTab === "animation" && (
              <div className="space-y-2">
                <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">
                  Clip Transition
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {TRANSITION_PRESETS.map((t) => {
                    const isCurrent = (selectedClip.transition || "cut") === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onUpdateClip({ ...selectedClip, transition: t.id })}
                        className={`py-1.5 px-2 rounded-lg text-left text-[11px] font-medium transition-colors cursor-pointer border ${
                          isCurrent
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white border-slate-200 hover:border-slate-300 text-slate-800"
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SUB-TAB 5: ADJUST (Color & Grading) */}
            {activeInspectorTab === "adjust" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">
                    Color & Grading
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateClip({
                        ...selectedClip,
                        colorAdjustments: {
                          brightness: 0,
                          contrast: 0,
                          saturation: 0,
                          exposure: 0,
                          temperature: 0,
                          tint: 0,
                          highlights: 0,
                          shadows: 0,
                          vignette: 0,
                        },
                        filterPreset: "none",
                      })
                    }
                    className="text-[10px] font-medium text-sky-600 hover:underline cursor-pointer"
                  >
                    Reset Color
                  </button>
                </div>

                {[
                  { key: "brightness", label: "Brightness", min: -100, max: 100 },
                  { key: "contrast", label: "Contrast", min: -100, max: 100 },
                  { key: "saturation", label: "Saturation", min: -100, max: 100 },
                  { key: "exposure", label: "Exposure", min: -100, max: 100 },
                  { key: "temperature", label: "Temperature", min: -100, max: 100 },
                  { key: "vignette", label: "Vignette", min: 0, max: 100 },
                ].map(({ key, label, min, max }) => {
                  const currentVal =
                    (selectedClip.colorAdjustments as any)?.[key] ?? 0;
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between text-[11px] font-mono">
                        <span>{label}</span>
                        <span className="font-bold text-slate-900">{currentVal}</span>
                      </div>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        value={currentVal}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          onUpdateClip({
                            ...selectedClip,
                            colorAdjustments: {
                              brightness: 0,
                              contrast: 0,
                              saturation: 0,
                              exposure: 0,
                              temperature: 0,
                              tint: 0,
                              highlights: 0,
                              shadows: 0,
                              vignette: 0,
                              ...selectedClip.colorAdjustments,
                              [key]: val,
                            },
                          });
                        }}
                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ========================================================= */}
        {/* CASE B: TEXT LAYER INSPECTOR                             */}
        {/* ========================================================= */}
        {inspectorType === "text" && selectedClip && (
          <>
            {/* Text Content */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">
                Content
              </label>
              <textarea
                rows={3}
                value={selectedClip.source}
                onChange={(e) =>
                  onUpdateClip({
                    ...selectedClip,
                    source: e.target.value,
                  })
                }
                className="w-full p-2.5 rounded-lg border border-slate-200 text-xs font-semibold focus:outline-none focus:border-slate-900"
                placeholder="Text overlay message..."
              />
            </div>

            <div className="h-px bg-slate-200" />

            {/* Typography */}
            <div className="space-y-3">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">
                Typography
              </span>

              {/* Font Family */}
              <div className="space-y-1">
                <label className="text-[11px] text-slate-600">Font Family</label>
                <select
                  value={selectedClip.textStyle?.fontFamily || "Inter"}
                  onChange={(e) =>
                    onUpdateClip({
                      ...selectedClip,
                      textStyle: {
                        ...selectedClip.textStyle,
                        fontFamily: e.target.value,
                        fontSize: selectedClip.textStyle?.fontSize || 32,
                        fontWeight: selectedClip.textStyle?.fontWeight || 700,
                        color: selectedClip.textStyle?.color || "#FFFFFF",
                        textAlign: selectedClip.textStyle?.textAlign || "center",
                      },
                    })
                  }
                  className="w-full p-2 rounded-lg border border-slate-200 text-xs font-medium focus:outline-none"
                >
                  {GOOGLE_FONTS.map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </select>
              </div>

              {/* Font Size & Weight */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-600">Size (px)</label>
                  <input
                    type="number"
                    min="12"
                    max="120"
                    value={selectedClip.textStyle?.fontSize || 32}
                    onChange={(e) =>
                      onUpdateClip({
                        ...selectedClip,
                        textStyle: {
                          ...selectedClip.textStyle,
                          fontFamily: selectedClip.textStyle?.fontFamily || "Inter",
                          fontSize: parseInt(e.target.value) || 32,
                          fontWeight: selectedClip.textStyle?.fontWeight || 700,
                          color: selectedClip.textStyle?.color || "#FFFFFF",
                          textAlign: selectedClip.textStyle?.textAlign || "center",
                        },
                      })
                    }
                    className="w-full p-2 rounded-lg border border-slate-200 text-xs font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-slate-600">Weight</label>
                  <select
                    value={selectedClip.textStyle?.fontWeight || 700}
                    onChange={(e) =>
                      onUpdateClip({
                        ...selectedClip,
                        textStyle: {
                          ...selectedClip.textStyle,
                          fontFamily: selectedClip.textStyle?.fontFamily || "Inter",
                          fontSize: selectedClip.textStyle?.fontSize || 32,
                          fontWeight: parseInt(e.target.value),
                          color: selectedClip.textStyle?.color || "#FFFFFF",
                          textAlign: selectedClip.textStyle?.textAlign || "center",
                        },
                      })
                    }
                    className="w-full p-2 rounded-lg border border-slate-200 text-xs font-mono"
                  >
                    <option value="400">Regular (400)</option>
                    <option value="600">SemiBold (600)</option>
                    <option value="700">Bold (700)</option>
                    <option value="800">ExtraBold (800)</option>
                    <option value="900">Black (900)</option>
                  </select>
                </div>
              </div>

              {/* Text Color & Outline */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-600">Text Color</label>
                  <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg p-1">
                    <input
                      type="color"
                      value={selectedClip.textStyle?.color || "#FFFFFF"}
                      onChange={(e) =>
                        onUpdateClip({
                          ...selectedClip,
                          textStyle: {
                            ...selectedClip.textStyle,
                            fontFamily: selectedClip.textStyle?.fontFamily || "Inter",
                            fontSize: selectedClip.textStyle?.fontSize || 32,
                            fontWeight: selectedClip.textStyle?.fontWeight || 700,
                            textAlign: selectedClip.textStyle?.textAlign || "center",
                            color: e.target.value,
                          },
                        })
                      }
                      className="w-6 h-6 rounded cursor-pointer border-none bg-transparent"
                    />
                    <span className="font-mono text-[10px]">{selectedClip.textStyle?.color || "#FFFFFF"}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-slate-600">Outline Width</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={selectedClip.textStyle?.outlineWidth || 0}
                    onChange={(e) =>
                      onUpdateClip({
                        ...selectedClip,
                        textStyle: {
                          ...selectedClip.textStyle,
                          fontFamily: selectedClip.textStyle?.fontFamily || "Inter",
                          fontSize: selectedClip.textStyle?.fontSize || 32,
                          fontWeight: selectedClip.textStyle?.fontWeight || 700,
                          textAlign: selectedClip.textStyle?.textAlign || "center",
                          color: selectedClip.textStyle?.color || "#FFFFFF",
                          outlineWidth: parseInt(e.target.value) || 0,
                          outlineColor: selectedClip.textStyle?.outlineColor || "#000000",
                        },
                      })
                    }
                    className="w-full p-2 rounded-lg border border-slate-200 text-xs font-mono font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-200" />

            {/* Animation Style */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">
                Animation Style
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: "none", label: "Static" },
                  { id: "fade", label: "Fade In" },
                  { id: "pop", label: "Pop Spring" },
                  { id: "slide", label: "Slide Up" },
                  { id: "typewriter", label: "Typewriter" },
                  { id: "word_reveal", label: "Word Reveal" },
                ].map((anim) => (
                  <button
                    key={anim.id}
                    type="button"
                    onClick={() =>
                      onUpdateClip({
                        ...selectedClip,
                        textStyle: {
                          ...selectedClip.textStyle,
                          fontFamily: selectedClip.textStyle?.fontFamily || "Inter",
                          fontSize: selectedClip.textStyle?.fontSize || 32,
                          fontWeight: selectedClip.textStyle?.fontWeight || 700,
                          textAlign: selectedClip.textStyle?.textAlign || "center",
                          color: selectedClip.textStyle?.color || "#FFFFFF",
                          animation: anim.id as any,
                        },
                      })
                    }
                    className={`py-1.5 px-2 rounded-lg text-left text-[11px] font-medium border cursor-pointer ${
                      selectedClip.textStyle?.animation === anim.id
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white border-slate-200 hover:border-slate-300 text-slate-800"
                    }`}
                  >
                    {anim.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ========================================================= */}
        {/* CASE C: CAPTION STYLE & TIMING INSPECTOR                  */}
        {/* ========================================================= */}
        {inspectorType === "caption" && selectedClip && (
          <>
            {/* Caption Text */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">
                Subtitle Phrase
              </label>
              <textarea
                rows={2}
                value={selectedClip.source}
                onChange={(e) =>
                  onUpdateClip({
                    ...selectedClip,
                    source: e.target.value,
                  })
                }
                className="w-full p-2.5 rounded-lg border border-slate-200 text-xs font-semibold focus:outline-none focus:border-slate-900"
              />
            </div>

            <div className="h-px bg-slate-200" />

            {/* Trending Template Presets Quick Switcher */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">
                Preset Styling
              </span>
              <div className="grid grid-cols-2 gap-2">
                {DEFAULT_CAPTION_TEMPLATES.slice(0, 6).map((tpl) => {
                  const isCurrent =
                    timeline.settings?.captionPreset === tpl.id ||
                    timeline.settings?.captionTemplateId === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() =>
                        onUpdateSettings({
                          captionPreset: tpl.id,
                          captionTemplateId: tpl.id,
                          captionStyle: tpl.style,
                          captionPosition: tpl.style.position,
                        })
                      }
                      className={`p-2 rounded-xl border text-left cursor-pointer transition-all ${
                        isCurrent
                          ? "bg-sky-50 border-sky-500 ring-2 ring-sky-300 shadow-2xs"
                          : "bg-white border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="text-[11px] font-bold text-slate-900">{tpl.name}</div>
                      <div className="text-[9px] text-slate-500 font-mono truncate">{tpl.category}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-px bg-slate-200" />

            {/* Position Y Picker */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">
                Screen Position
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { pos: "top", label: "Top (15%)" },
                  { pos: "center", label: "Center (50%)" },
                  { pos: "bottom", label: "Bottom (82%)" },
                ].map(({ pos, label }) => {
                  const isCurrent = timeline.settings?.captionPosition === pos;
                  return (
                    <button
                      key={pos}
                      type="button"
                      onClick={() =>
                        onUpdateSettings({
                          captionPosition: pos as CaptionPosition,
                        })
                      }
                      className={`py-1.5 px-2 rounded-lg text-center text-[10px] font-medium border cursor-pointer ${
                        isCurrent
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white border-slate-200 hover:border-slate-300 text-slate-800"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {onApplyStyleToAllCaptions && (
              <button
                type="button"
                onClick={onApplyStyleToAllCaptions}
                className="w-full py-2 px-3 rounded-lg bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 font-semibold text-[11px] cursor-pointer transition-colors flex items-center justify-center gap-1.5"
              >
                Apply Style to All Captions
              </button>
            )}

            {/* Timing */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1 font-mono text-[10px]">
              <div className="flex justify-between text-slate-600">
                <span>Start Time:</span>
                <span className="font-bold text-slate-900">{selectedClip.startTime.toFixed(2)}s</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>End Time:</span>
                <span className="font-bold text-slate-900">{selectedClip.endTime.toFixed(2)}s</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Duration:</span>
                <span className="font-bold text-slate-900">{selectedClip.duration.toFixed(2)}s</span>
              </div>
            </div>
          </>
        )}

        {/* ========================================================= */}
        {/* CASE D: AUDIO CLIP INSPECTOR                              */}
        {/* ========================================================= */}
        {inspectorType === "audio" && selectedClip && (
          <>
            {activeInspectorTab === "speed" ? (
              renderSpeedControls(selectedClip)
            ) : (
              <>
                {renderBasicAudioControls(selectedClip)}

                {/* Stereo Pan */}
                <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex justify-between text-xs font-mono text-slate-700">
                    <span className="font-semibold">Stereo Pan</span>
                    <span className="font-bold text-slate-900">
                      {(selectedClip.pan ?? 0) === 0
                        ? "Center"
                        : (selectedClip.pan ?? 0) < 0
                        ? `L ${Math.abs(Math.round((selectedClip.pan ?? 0) * 100))}%`
                        : `R ${Math.round((selectedClip.pan ?? 0) * 100)}%`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-1"
                    max="1"
                    step="0.1"
                    value={selectedClip.pan ?? 0}
                    onChange={(e) =>
                      onUpdateClip({
                        ...selectedClip,
                        pan: parseFloat(e.target.value),
                      })
                    }
                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-800"
                  />
                </div>

                {/* Automatic Voiceover Ducking */}
                <div className="space-y-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">
                      Automatic Voiceover Ducking
                    </span>
                    <input
                      type="checkbox"
                      checked={selectedClip.ducking ?? selectedClip.track === "music"}
                      onChange={(e) =>
                        onUpdateClip({
                          ...selectedClip,
                          ducking: e.target.checked,
                        })
                      }
                      className="w-4 h-4 rounded text-sky-600 cursor-pointer accent-sky-600"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    When speech occurs on the timeline, background music automatically ducks by 14 dB using a smooth sin² envelope.
                  </p>
                  <div className="flex justify-between text-[10px] font-mono pt-1 text-slate-700 font-semibold">
                    <span>Ducking Attenuation:</span>
                    <span>
                      {Math.round((timeline.settings?.duckingFactor ?? 0.2) * 100)}% (
                      {formatGainAsDecibels(timeline.settings?.duckingFactor ?? 0.2)})
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="0.6"
                    step="0.05"
                    value={timeline.settings?.duckingFactor ?? 0.2}
                    onChange={(e) =>
                      onUpdateSettings({
                        duckingFactor: parseFloat(e.target.value),
                      })
                    }
                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-800"
                  />
                </div>
              </>
            )}
          </>
        )}

        {/* ========================================================= */}
        {/* CASE E: CAPCUT DETAILS PANEL (NOTHING SELECTED)          */}
        {/* ========================================================= */}
        {inspectorType === "project" && (
          <div className="space-y-4">
            {/* CapCut Metadata Grid */}
            <div className="space-y-2.5 text-xs text-slate-700">
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Name:</span>
                <span className="font-semibold text-slate-900 truncate max-w-[160px]">
                  {timeline.title || "Draft 1123"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Path:</span>
                <span className="font-mono text-[10px] text-slate-600 truncate max-w-[160px]" title="Local project database">
                  Local draft storage
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Imported media:</span>
                <span className="text-slate-800">Stay in original location</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Arrange layers:</span>
                <span className="text-slate-800 font-medium">Turned on</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Proxy:</span>
                <span className="text-slate-800 font-medium">Turned off</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Timeline name:</span>
                <span className="text-slate-800 font-medium">Timeline 01</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Aspect ratio:</span>
                <span className="font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                  {timeline.aspectRatio}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Resolution:</span>
                <span className="font-mono text-[11px] text-slate-800">
                  {timeline.resolution.width}×{timeline.resolution.height}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Frame rate:</span>
                <span className="font-mono text-[11px] text-slate-800">
                  {timeline.settings?.fps || 30} FPS
                </span>
              </div>
            </div>

            {/* Quick Aspect Ratio Switcher (CapCut Modify) */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-500 uppercase font-bold tracking-wider">
                  Modify Aspect Ratio
                </span>
                <span className="text-[10px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded font-medium">
                  Modify
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { ratio: "9:16", desc: "TikTok / Reels" },
                  { ratio: "16:9", desc: "YouTube" },
                  { ratio: "1:1", desc: "Square" },
                  { ratio: "4:5", desc: "Portrait" },
                  { ratio: "4:3", desc: "Standard" },
                ].map(({ ratio, desc }) => {
                  const isCurrent = timeline.aspectRatio === ratio;
                  return (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => onUpdateAspectRatio(ratio as AspectRatio)}
                      className={`p-2 rounded-lg border text-left cursor-pointer transition-all ${
                        isCurrent
                          ? "bg-slate-900 border-slate-900 text-white shadow-2xs font-bold"
                          : "bg-white border-slate-200 hover:border-slate-300 text-slate-800"
                      }`}
                    >
                      <div className="text-[11px]">{ratio}</div>
                      <div className={`text-[9px] truncate ${isCurrent ? "text-slate-300" : "text-slate-500"}`}>
                        {desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-px bg-slate-200" />

            {/* Audio Ducking Global Toggle */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-500 uppercase font-bold tracking-wider">
                  Auto Ducking
                </span>
                <input
                  type="checkbox"
                  checked={timeline.settings?.audioDucking ?? true}
                  onChange={(e) =>
                    onUpdateSettings({
                      audioDucking: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded text-blue-600 cursor-pointer accent-slate-900"
                />
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Automatically attenuates background music when speech is active on voiceover/caption tracks.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
