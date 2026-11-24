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
      {/* 1. Header with Context Badge */}
      <div className="h-11 px-3 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {inspectorType === "multi" && <Layers className="w-4 h-4 text-purple-600 shrink-0" />}
          {inspectorType === "video" && <Video className="w-4 h-4 text-blue-600 shrink-0" />}
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

            <div className="h-px bg-slate-200" />

            {/* Speed & Retiming Controls */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1">
                  <Gauge className="w-3 h-3 text-blue-600" />
                  Playback Speed & Curves
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
                  {selectedClip.speedCurvePreset &&
                  selectedClip.speedCurvePreset !== "normal" &&
                  selectedClip.speedCurvePreset !== "standard"
                    ? `${getSpeedCurvePreset(selectedClip.speedCurvePreset).name} Curve`
                    : `${(selectedClip.speed ?? 1.0).toFixed(2)}x`}
                </span>
              </div>

              {/* Mode Tabs: Constant vs Curve Ramping */}
              <div className="grid grid-cols-2 p-0.5 bg-slate-100 rounded-lg text-[10px] font-semibold text-slate-600">
                <button
                  type="button"
                  onClick={() => {
                    setSpeedMode("constant");
                    if (selectedClip.speedCurvePreset) {
                      onUpdateClip({ ...selectedClip, speedCurvePreset: undefined });
                    }
                  }}
                  className={`py-1 rounded-md transition-colors cursor-pointer text-center ${
                    speedMode === "constant" &&
                    (!selectedClip.speedCurvePreset ||
                      selectedClip.speedCurvePreset === "normal" ||
                      selectedClip.speedCurvePreset === "standard")
                      ? "bg-white text-slate-900 shadow-2xs font-bold"
                      : "hover:text-slate-900"
                  }`}
                >
                  Constant Speed
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSpeedMode("curve");
                    if (
                      !selectedClip.speedCurvePreset ||
                      selectedClip.speedCurvePreset === "normal" ||
                      selectedClip.speedCurvePreset === "standard"
                    ) {
                      onUpdateClip({
                        ...selectedClip,
                        speedCurvePreset: "Hero",
                        speed: calculateAverageSpeed(SPEED_CURVE_PRESETS.hero),
                      });
                    }
                  }}
                  className={`py-1 rounded-md transition-colors cursor-pointer text-center ${
                    speedMode === "curve" ||
                    (selectedClip.speedCurvePreset &&
                      selectedClip.speedCurvePreset !== "normal" &&
                      selectedClip.speedCurvePreset !== "standard")
                      ? "bg-white text-slate-900 shadow-2xs font-bold"
                      : "hover:text-slate-900"
                  }`}
                >
                  Curve Ramping
                </button>
              </div>

              {/* CONSTANT SPEED SLIDER & PRESETS */}
              {speedMode === "constant" &&
                (!selectedClip.speedCurvePreset ||
                  selectedClip.speedCurvePreset === "normal" ||
                  selectedClip.speedCurvePreset === "standard") && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-4 gap-1.5 font-mono text-[10px]">
                      {SPEED_PRESETS.map((spd) => {
                        const isCurrent = Math.abs((selectedClip.speed ?? 1.0) - spd) < 0.01;
                        return (
                          <button
                            key={spd}
                            type="button"
                            onClick={() =>
                              onUpdateClip({
                                ...selectedClip,
                                speed: spd,
                                speedCurvePreset: undefined,
                              })
                            }
                            className={`py-1 rounded-md font-bold transition-colors cursor-pointer ${
                              isCurrent
                                ? "bg-slate-900 text-white shadow-2xs"
                                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                            }`}
                          >
                            {spd}x
                          </button>
                        );
                      })}
                    </div>

                    {/* Continuous Slider with input */}
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between items-center text-[11px] font-mono">
                        <span className="text-slate-500">Speed Multiplier</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.05"
                            min="0.1"
                            max="8.0"
                            value={Math.round((selectedClip.speed ?? 1.0) * 100) / 100}
                            onChange={(e) =>
                              onUpdateClip({
                                ...selectedClip,
                                speed: Math.max(0.1, Math.min(8.0, parseFloat(e.target.value) || 1.0)),
                                speedCurvePreset: undefined,
                              })
                            }
                            className="w-14 p-0.5 text-right rounded border border-slate-200 text-[10px] font-mono font-bold"
                          />
                          <span className="text-slate-500">x</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="4.0"
                        step="0.05"
                        value={selectedClip.speed ?? 1.0}
                        onChange={(e) =>
                          onUpdateClip({
                            ...selectedClip,
                            speed: parseFloat(e.target.value),
                            speedCurvePreset: undefined,
                          })
                        }
                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
                      />
                    </div>
                  </div>
                )}

              {/* CURVE RAMPING PRESETS (HERO, BULLET, MONTAGE, JUMP CUT, FLASH IN, FLASH OUT) */}
              {(speedMode === "curve" ||
                (selectedClip.speedCurvePreset &&
                  selectedClip.speedCurvePreset !== "normal" &&
                  selectedClip.speedCurvePreset !== "standard")) && (
                <div className="space-y-2">
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
                        selectedClip.speedCurvePreset?.toLowerCase() === preset.id ||
                        selectedClip.speedCurvePreset?.toLowerCase() === preset.name.toLowerCase();
                      const avgSpeed = calculateAverageSpeed(preset);
                      const svgPoints = generateSpeedCurveSvgPoints(preset, 110, 32);

                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setSpeedMode("curve");
                            onUpdateClip({
                              ...selectedClip,
                              speedCurvePreset: preset.name as any,
                              speed: Math.round(avgSpeed * 100) / 100,
                            });
                          }}
                          className={`p-2 rounded-xl border text-left cursor-pointer transition-all flex flex-col gap-1.5 ${
                            isSelected
                              ? "bg-blue-50 border-blue-500 ring-2 ring-blue-200 shadow-2xs"
                              : "bg-white border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-900 flex items-center gap-1">
                              {preset.name}
                              {isSelected && <Check className="w-3 h-3 text-blue-600" />}
                            </span>
                            <span className="text-[9px] font-mono text-slate-500">
                              ~{avgSpeed.toFixed(1)}x
                            </span>
                          </div>

                          {/* Mini SVG Curve Preview */}
                          <div className="w-full h-8 bg-slate-900 rounded-md overflow-hidden flex items-center justify-center px-1">
                            <svg viewBox="0 0 110 32" className="w-full h-full overflow-visible">
                              <polyline
                                fill="none"
                                stroke={isSelected ? "#00F0FF" : "#94A3B8"}
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
                </div>
              )}

              {/* PITCH LOCK TOGGLE (WSOLA) */}
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-blue-600" />
                    <span className="text-[11px] font-bold text-slate-800">
                      Pitch Lock (WSOLA)
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedClip.preservePitch ?? true}
                    onChange={(e) =>
                      onUpdateClip({
                        ...selectedClip,
                        preservePitch: e.target.checked,
                      })
                    }
                    className="w-4 h-4 rounded text-blue-600 cursor-pointer accent-blue-600"
                  />
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  {(selectedClip.preservePitch ?? true)
                    ? "Preserves original vocal pitch across speed ramping using Waveform Similarity Overlap-Add (WSOLA)."
                    : "Varispeed tape-stop active: pitch shifts proportionally with velocity."}
                </p>
              </div>
            </div>

            <div className="h-px bg-slate-200" />

            {/* Transitions */}
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

            <div className="h-px bg-slate-200" />

            {/* Color Adjustments */}
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
                  className="text-[10px] font-medium text-blue-600 hover:underline cursor-pointer"
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

            <div className="h-px bg-slate-200" />

            {/* Video Clip Audio & Decibel Controls */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1">
                  <Volume2 className="w-3 h-3 text-emerald-600" />
                  Embedded Audio
                </span>
                <span className="font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-mono">
                  {Math.round((selectedClip.volume ?? 1.0) * 100)}% ({formatGainAsDecibels(selectedClip.volume ?? 1.0)})
                </span>
              </div>

              {/* Volume Slider with Keyframe */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[11px] font-mono">
                  <span>Clip Volume</span>
                  <button
                    type="button"
                    onClick={() => handleToggleKeyframeAtPlayhead("volume", selectedClip.volume ?? 1.0)}
                    className={`p-0.5 rounded cursor-pointer transition-colors ${
                      hasKeyframeAtPlayhead("volume")
                        ? "text-amber-500 fill-amber-500 hover:text-amber-600"
                        : "text-slate-400 hover:text-amber-500"
                    }`}
                    title={
                      hasKeyframeAtPlayhead("volume")
                        ? "Remove volume keyframe at playhead"
                        : "Add volume keyframe at playhead"
                    }
                  >
                    <Key className="w-3 h-3" />
                  </button>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.01"
                  value={selectedClip.volume ?? 1.0}
                  onChange={(e) =>
                    onUpdateClip({
                      ...selectedClip,
                      volume: parseFloat(e.target.value),
                    })
                  }
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
                />
              </div>

              {/* Quick Decibel Presets */}
              <div className="grid grid-cols-5 gap-1 font-mono text-[9px]">
                {[
                  { label: "Mute", gain: 0 },
                  { label: "-12 dB", gain: 0.25 },
                  { label: "-6 dB", gain: 0.5 },
                  { label: "0 dB", gain: 1.0 },
                  { label: "+3.5 dB", gain: 1.5 },
                ].map(({ label, gain }) => {
                  const isCurrent = Math.abs((selectedClip.volume ?? 1.0) - gain) < 0.05;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => onUpdateClip({ ...selectedClip, volume: gain })}
                      className={`py-1 rounded font-semibold transition-colors cursor-pointer text-center ${
                        isCurrent
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Equal-Power Crossfade & Fades */}
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-800">
                    Equal-Power Crossfade
                  </span>
                  <input
                    type="checkbox"
                    checked={selectedClip.equalPowerCrossfade ?? true}
                    onChange={(e) =>
                      onUpdateClip({
                        ...selectedClip,
                        equalPowerCrossfade: e.target.checked,
                      })
                    }
                    className="w-4 h-4 rounded text-blue-600 cursor-pointer accent-blue-600"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                  <div className="space-y-1">
                    <label className="text-slate-600">Fade In (s)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="5.0"
                      value={selectedClip.fadeIn ?? 0}
                      onChange={(e) =>
                        onUpdateClip({
                          ...selectedClip,
                          fadeIn: Math.max(0, parseFloat(e.target.value) || 0),
                        })
                      }
                      className="w-full p-1 rounded border border-slate-200 font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-600">Fade Out (s)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="5.0"
                      value={selectedClip.fadeOut ?? 0}
                      onChange={(e) =>
                        onUpdateClip({
                          ...selectedClip,
                          fadeOut: Math.max(0, parseFloat(e.target.value) || 0),
                        })
                      }
                      className="w-full p-1 rounded border border-slate-200 font-bold"
                    />
                  </div>
                </div>
              </div>
            </div>
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
            {/* Audio Volume & Decibel Readout */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[11px] font-mono">
                <span className="flex items-center gap-1 font-semibold text-slate-700">
                  <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                  Volume & Gain
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleKeyframeAtPlayhead("volume", selectedClip.volume ?? 1.0)}
                    className={`p-0.5 rounded cursor-pointer transition-colors ${
                      hasKeyframeAtPlayhead("volume")
                        ? "text-amber-500 fill-amber-500 hover:text-amber-600"
                        : "text-slate-400 hover:text-amber-500"
                    }`}
                    title={
                      hasKeyframeAtPlayhead("volume")
                        ? "Remove volume keyframe at playhead"
                        : "Add volume keyframe at playhead"
                    }
                  >
                    <Key className="w-3 h-3" />
                  </button>
                  <span className="font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                    {Math.round((selectedClip.volume ?? 1.0) * 100)}% ({formatGainAsDecibels(selectedClip.volume ?? 1.0)})
                  </span>
                </div>
              </div>

              <input
                type="range"
                min="0"
                max="1.5"
                step="0.01"
                value={selectedClip.volume ?? 1.0}
                onChange={(e) =>
                  onUpdateClip({
                    ...selectedClip,
                    volume: parseFloat(e.target.value),
                  })
                }
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
              />

              {/* Quick Decibel Presets */}
              <div className="grid grid-cols-5 gap-1 font-mono text-[9px]">
                {[
                  { label: "Mute", gain: 0 },
                  { label: "-12 dB", gain: 0.25 },
                  { label: "-6 dB", gain: 0.5 },
                  { label: "0 dB", gain: 1.0 },
                  { label: "+3.5 dB", gain: 1.5 },
                ].map(({ label, gain }) => {
                  const isCurrent = Math.abs((selectedClip.volume ?? 1.0) - gain) < 0.05;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => onUpdateClip({ ...selectedClip, volume: gain })}
                      className={`py-1 rounded font-semibold transition-colors cursor-pointer text-center ${
                        isCurrent
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stereo Pan (-1 to +1) */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-mono">
                <span>Stereo Pan</span>
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
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
              />
            </div>

            <div className="h-px bg-slate-200" />

            {/* Equal-Power Crossfade & Transition Controls */}
            <div className="space-y-3">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">
                Crossfade & Transitions
              </span>

              {/* Equal-Power Law Toggle */}
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-800">
                    Equal-Power Crossfade
                  </span>
                  <input
                    type="checkbox"
                    checked={selectedClip.equalPowerCrossfade ?? true}
                    onChange={(e) =>
                      onUpdateClip({
                        ...selectedClip,
                        equalPowerCrossfade: e.target.checked,
                      })
                    }
                    className="w-4 h-4 rounded text-blue-600 cursor-pointer accent-blue-600"
                  />
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  {(selectedClip.equalPowerCrossfade ?? true)
                    ? "Constant power cosine-sine curve eliminates 3 dB volume dip between adjoining audio clips."
                    : "Linear crossfade (causes subtle volume dip at center point)."}
                </p>
              </div>

              {/* Fade In & Fade Out Durations */}
              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                <div className="space-y-1">
                  <label className="text-slate-600">Fade In (s)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="5.0"
                    value={selectedClip.fadeIn ?? 0}
                    onChange={(e) =>
                      onUpdateClip({
                        ...selectedClip,
                        fadeIn: Math.max(0, parseFloat(e.target.value) || 0),
                      })
                    }
                    className="w-full p-1.5 rounded-lg border border-slate-200 font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-600">Fade Out (s)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="5.0"
                    value={selectedClip.fadeOut ?? 0}
                    onChange={(e) =>
                      onUpdateClip({
                        ...selectedClip,
                        fadeOut: Math.max(0, parseFloat(e.target.value) || 0),
                      })
                    }
                    className="w-full p-1.5 rounded-lg border border-slate-200 font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-200" />

            {/* Audio Ducking Controls */}
            <div className="space-y-2 p-3 rounded-xl bg-purple-50 border border-purple-200">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-purple-900 uppercase">
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
                  className="w-4 h-4 rounded text-purple-600 cursor-pointer accent-purple-600"
                />
              </div>
              <p className="text-[10px] text-purple-800 leading-relaxed">
                When speech occurs on the timeline, background music automatically ducks by 14 dB using a smooth sin² envelope (120ms attack, 350ms release).
              </p>
              <div className="flex justify-between text-[10px] font-mono pt-1 text-purple-950 font-semibold">
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
                className="w-full h-1 bg-purple-200 rounded-lg appearance-none cursor-pointer accent-purple-800"
              />
            </div>

            <div className="h-px bg-slate-200" />

            {/* Audio Speed & Pitch Lock */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1">
                  <Gauge className="w-3 h-3 text-emerald-600" />
                  Audio Retiming & Pitch
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
                  {(selectedClip.speed ?? 1.0).toFixed(2)}x
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1.5 font-mono text-[10px]">
                {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((spd) => {
                  const isCurrent = Math.abs((selectedClip.speed ?? 1.0) - spd) < 0.01;
                  return (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => onUpdateClip({ ...selectedClip, speed: spd })}
                      className={`py-1 rounded-md font-bold transition-colors cursor-pointer ${
                        isCurrent
                          ? "bg-slate-900 text-white shadow-2xs"
                          : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                      }`}
                    >
                      {spd}x
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
                    checked={selectedClip.preservePitch ?? true}
                    onChange={(e) =>
                      onUpdateClip({
                        ...selectedClip,
                        preservePitch: e.target.checked,
                      })
                    }
                    className="w-4 h-4 rounded text-blue-600 cursor-pointer accent-blue-600"
                  />
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  {(selectedClip.preservePitch ?? true)
                    ? "Audio retimed without pitch distortion via WSOLA overlap-add."
                    : "Pitch shifts with speed (varispeed)."}
                </p>
              </div>
            </div>
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
