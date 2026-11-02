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
} from "lucide-react";
import {
  VeeloxTimelineProject,
  TimelineItem,
  TimelineKeyframe,
  AspectRatio,
  TransitionType,
} from "@/app/lib/timeline/types";
import { CaptionPosition } from "@/app/lib/captions/presets";
import { DEFAULT_CAPTION_TEMPLATES } from "@/app/lib/captions/templates";

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
  const [kfProperty, setKfProperty] = useState<"scale" | "rotation" | "opacity" | "volume">("scale");
  const [kfValue, setKfValue] = useState<number>(1.2);
  const [kfEasing, setKfEasing] = useState<"linear" | "ease_in" | "ease_out" | "ease_in_out">("ease_in_out");
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);

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

  // Keyframe helpers
  function handleAddKeyframe() {
    if (!selectedClip) return;
    const localTime = Math.max(0, Math.min(selectedClip.duration, currentTime - selectedClip.startTime));
    const newKf: TimelineKeyframe = {
      id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      time: Math.round(localTime * 100) / 100,
      property: kfProperty,
      value: kfValue,
      easing: kfEasing,
    };
    const updatedKeyframes = [...(selectedClip.keyframes || []), newKf].sort((a, b) => a.time - b.time);
    onUpdateClip({ ...selectedClip, keyframes: updatedKeyframes });
  }

  function handleDeleteKeyframe(kfId: string) {
    if (!selectedClip) return;
    const updatedKeyframes = (selectedClip.keyframes || []).filter((k) => k.id !== kfId);
    onUpdateClip({ ...selectedClip, keyframes: updatedKeyframes });
  }

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
            {inspectorType === "project" && "Project Settings"}
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
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-600 font-mono">Position X (px)</label>
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
                  <label className="text-[11px] text-slate-600 font-mono">Position Y (px)</label>
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
                  <div className="flex items-center gap-1">
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
                  <div className="flex items-center gap-1">
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
                  <div className="flex items-center gap-1">
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
                  onClick={handleAddKeyframe}
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
                <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
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
                        <span className="text-slate-700 font-semibold">{kf.property}: {kf.value}</span>
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

            {/* Speed Controls */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">
                Playback Speed
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                {SPEED_PRESETS.map((spd) => {
                  const isCurrent = (selectedClip.speed ?? 1.0) === spd;
                  return (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => onUpdateClip({ ...selectedClip, speed: spd })}
                      className={`py-1 rounded-md text-[10px] font-mono font-bold transition-colors cursor-pointer ${
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
            {/* Audio Volume */}
            <div className="space-y-2">
              <div className="flex justify-between text-[11px] font-mono">
                <span>Track Volume</span>
                <span className="font-bold text-slate-900">
                  {Math.round((selectedClip.volume ?? 1.0) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.05"
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

            {/* Stereo Pan (-1 to +1) */}
            <div className="space-y-2">
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

            {/* Audio Ducking Override */}
            {selectedClip.track === "music" && (
              <div className="space-y-2 p-3 rounded-xl bg-purple-50 border border-purple-200">
                <span className="text-[10px] font-mono font-bold text-purple-900 uppercase">
                  Automatic Voiceover Ducking
                </span>
                <p className="text-[10px] text-purple-800 leading-relaxed">
                  When voiceover is active, background music automatically lowers to keep dialogue crystal clear.
                </p>
                <div className="flex justify-between text-[10px] font-mono pt-1 text-purple-950 font-semibold">
                  <span>Ducking Level:</span>
                  <span>{Math.round((timeline.settings?.duckingFactor ?? 0.25) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.8"
                  step="0.05"
                  value={timeline.settings?.duckingFactor ?? 0.25}
                  onChange={(e) =>
                    onUpdateSettings({
                      duckingFactor: parseFloat(e.target.value),
                    })
                  }
                  className="w-full h-1 bg-purple-200 rounded-lg appearance-none cursor-pointer accent-purple-800"
                />
              </div>
            )}
          </>
        )}

        {/* ========================================================= */}
        {/* CASE E: PROJECT SETTINGS (NOTHING SELECTED)              */}
        {/* ========================================================= */}
        {inspectorType === "project" && (
          <>
            {/* Aspect Ratio Picker */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">
                Video Aspect Ratio
              </span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { ratio: "9:16", desc: "TikTok / Reels" },
                  { ratio: "16:9", desc: "YouTube / TV" },
                  { ratio: "1:1", desc: "Feed Posts" },
                  { ratio: "4:5", desc: "Instagram" },
                  { ratio: "4:3", desc: "Retro / Standard" },
                ].map(({ ratio, desc }) => {
                  const isCurrent = timeline.aspectRatio === ratio;
                  return (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => onUpdateAspectRatio(ratio as AspectRatio)}
                      className={`p-2 rounded-xl border text-left cursor-pointer transition-all ${
                        isCurrent
                          ? "bg-slate-900 border-slate-900 text-white shadow-2xs"
                          : "bg-white border-slate-200 hover:border-slate-300 text-slate-800"
                      }`}
                    >
                      <div className="text-[11px] font-bold">{ratio}</div>
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
                <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">
                  Voice Ducking
                </span>
                <input
                  type="checkbox"
                  checked={timeline.settings?.audioDucking ?? true}
                  onChange={(e) =>
                    onUpdateSettings({
                      audioDucking: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Automatically dips background music volume whenever voiceover audio is active.
              </p>
            </div>

            <div className="h-px bg-slate-200" />

            {/* Project Technical Telemetry */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 font-mono text-[10px]">
              <div className="flex justify-between text-slate-600">
                <span>Duration:</span>
                <span className="font-bold text-slate-900">{timeline.duration.toFixed(1)}s</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Frame Rate:</span>
                <span className="font-bold text-slate-900">{timeline.settings?.fps || 30} FPS</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Resolution:</span>
                <span className="font-bold text-slate-900">
                  {timeline.resolution.width}×{timeline.resolution.height}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Total Tracks:</span>
                <span className="font-bold text-slate-900">{timeline.tracks.length}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
