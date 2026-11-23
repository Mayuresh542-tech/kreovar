"use client";

import React, { useState, useEffect } from "react";
import MediaAnimationControls from "./MediaAnimationControls";
import ShapeControls from "./ShapeControls";
import { STYLE_SURFACES, type StyleSurface } from "@/app/lib/editor/styleSurface";
import KeyframeControls from "./KeyframeControls";
import TextFillControls from "./TextFillControls";
import { audioRole } from "@/app/lib/editor/audioMix";
import { visualDimensions } from "@/app/lib/editor/media";
import {
  SlidersHorizontal,
  Layers,
  Trash2,
  Split,
  Copy,
  RotateCcw,
  Volume2,
  VolumeX,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Gauge,
  Music,
  Type,
  Sparkles,
  Video,
  Film,
  Play,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Activity,
  Sliders,
  Clock,
} from "lucide-react";
import {
  TextStyle,
  textForClip,
  canPlace,
  Caption,
  Transform,
  Clip,
} from "@/app/lib/editor/model";
import { Edit, useProject, usePlayback } from "@/app/lib/editor/store";
import {
  changeClipProperty,
  changeText,
  moveClip,
  trimClip,
  splitClip,
  duplicateClip,
  removeClip,
  frameClip,
  addAsset,
  replaceClipAsset,
  resetClipTransform,
  changeCaptionProperty,
} from "@/app/lib/editor/operations";
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
import {
  MEDIA_MOTIONS,
  MEDIA_LOOPS,
  MEDIA_EASINGS,
  MEDIA_MOTION_LABELS,
  DEFAULT_MEDIA_ANIMATION,
  setMediaAnimation,
  clearMediaAnimation,
  mediaAnimationTiming,
  type MediaAnimation,
  type MediaMotion,
} from "@/app/lib/editor/mediaAnimation";
import {
  captureKeyframe,
  keyframeTransform,
  setTransformKeyframes,
} from "@/app/lib/editor/keyframes";
import { useEditor } from "./EditorContext";
import "./capcut-inspector.css";

const SPEED_PRESETS = [0.1, 0.5, 1, 1.5, 2, 5, 10] as const;

const CAPTION_HIGHLIGHT_SWATCHES = [
  "#FAFF00", // Electric Yellow
  "#00F0FF", // Neon Cyan
  "#00F298", // Bright Green
  "#FF6B00", // Neon Orange
  "#FF2A85", // Hot Pink
  "#FFFFFF", // Pure White
];

const FONT_FAMILIES = [
  "Inter",
  "Montserrat",
  "Outfit",
  "Oswald",
  "Poppins",
  "JetBrains Mono",
  "Impact",
  "Playfair Display",
  "Caveat",
];

const SPEED_CURVE_LIST = [
  SPEED_CURVE_PRESETS.hero,
  SPEED_CURVE_PRESETS.bullet,
  SPEED_CURVE_PRESETS.montage,
  SPEED_CURVE_PRESETS.jump_cut,
  SPEED_CURVE_PRESETS.flash_in,
  SPEED_CURVE_PRESETS.flash_out,
];

function NumberField({
  label,
  value,
  min,
  max,
  step = 0.01,
  disabled = false,
  edit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  edit: (value: number) => Edit;
}) {
  const { store, run } = useEditor();
  return (
    <label className="flex flex-col gap-1 text-[11px] text-[#A0A0A8]">
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
        disabled={disabled}
        value={Number.isFinite(value) ? Number(value.toFixed(3)) : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          if (e.target.value !== "" && Number.isFinite(e.target.valueAsNumber)) {
            run(edit(e.target.valueAsNumber));
          }
        }}
        onFocus={() => {
          if (store.interacting) store.commit();
        }}
        className="capcut-input font-mono"
      />
    </label>
  );
}

function CapcutSlider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = "",
  displayValue,
  disabled = false,
  keyframeButton,
  edit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  displayValue?: string;
  disabled?: boolean;
  keyframeButton?: React.ReactNode;
  edit: (value: number) => Edit;
}) {
  const { store, run, notify } = useEditor();
  function change(val: number) {
    try {
      if (store.interacting) store.preview(edit(val));
      else run(edit(val));
    } catch (e) {
      store.cancel();
      notify(e instanceof Error ? e.message : "Adjustment failed.");
    }
  }
  const formatted =
    displayValue !== undefined
      ? displayValue
      : `${value.toFixed(step < 1 ? 2 : 0)}${unit}`;

  return (
    <div className="flex flex-col gap-1.5 my-2">
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5 text-[#A0A0A8]">
          {keyframeButton}
          <span>{label}</span>
        </div>
        <output className="text-[#00E5FF] font-mono text-[11px] font-medium">
          {formatted}
        </output>
      </div>
      <input
        aria-label={label}
        type="range"
        disabled={disabled}
        value={Number.isFinite(value) ? value : min}
        min={min}
        max={max}
        step={step}
        onPointerDown={() => store.begin()}
        onChange={(e) => change(Number(e.target.value))}
        onPointerUp={() => store.commit()}
        onPointerCancel={() => store.cancel()}
        onBlur={() => store.commit()}
        className="capcut-slider"
      />
    </div>
  );
}

export default function Inspector() {
  const { store, playback, repository, selection, select, run, notify } = useEditor();
  const p = useProject(store);
  const { time } = usePlayback(playback);
  const c = p.clips[selection[0]];
  const layer = c ? textForClip(p, c) : undefined;
  const caption = c?.contentId ? p.captions[c.contentId] : undefined;
  const track = c ? p.tracks[c.trackId] : undefined;
  const asset = c?.assetId ? p.assets[c.assetId] : undefined;
  const visual = track?.kind !== "audio";
  const isCaption = track?.kind === "caption" || Boolean(caption);
  const hasAudio = asset ? asset.kind !== "image" : track?.kind === "audio";
  const transition = c
    ? Object.values(p.transitions).find((t) => t.toClipId === c.id)
    : undefined;
  const [framing, setFraming] = useState(false);

  // Inspector Category Tab Navigation
  type CategoryTab = "Video" | "Speed" | "Audio" | "Animation" | "Text";
  const [activeTab, setActiveTab] = useState<CategoryTab>("Video");

  // Speed Tab Sub-Modes
  const [speedMode, setSpeedMode] = useState<"normal" | "curve">("normal");
  const [selectedCurveId, setSelectedCurveId] = useState<string>("hero");

  // Audio Equal-Power Crossfade State
  const [equalPowerCrossfade, setEqualPowerCrossfade] = useState(true);

  // Animation Tab Sub-Phases
  const [animPhase, setAnimPhase] = useState<"entrance" | "exit" | "loop">("entrance");
  const [animDraft, setAnimDraft] = useState<MediaAnimation>(() =>
    c?.mediaAnimation
      ? { ...c.mediaAnimation }
      : { ...DEFAULT_MEDIA_ANIMATION, entrance: "none", exit: "none" }
  );

  // Sync draft animation when clip changes
  useEffect(() => {
    if (c?.mediaAnimation) {
      setAnimDraft({ ...c.mediaAnimation });
    } else {
      setAnimDraft({ ...DEFAULT_MEDIA_ANIMATION, entrance: "none", exit: "none" });
    }
  }, [c?.id, c?.mediaAnimation]);

  // Adjust active tab when selected clip changes
  useEffect(() => {
    if (!c) return;
    if (layer) {
      setActiveTab("Text");
    } else if (track?.kind === "audio") {
      setActiveTab("Audio");
    } else {
      setActiveTab("Video");
    }
  }, [c?.id]);

  async function frame(mode: "fit" | "fill") {
    if (!c || !asset || framing) return;
    setFraming(true);
    try {
      const size = await visualDimensions(asset, repository);
      run((project) => {
        if (project.assets[asset.id] !== asset)
          throw new Error("The original changed. Please try again.");
        return frameClip(addAsset(project, { ...asset, ...size }), c.id, mode);
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not frame this clip.");
    } finally {
      setFraming(false);
    }
  }

  const textStyle = (changes: Partial<TextStyle>) => (project: typeof p) =>
    changeText(project, c.id, layer!.text, changes);

  // Keyframe calculations for Video Tab
  const fps = p.settings.fps || 30;
  const isInsideClip = c ? time >= c.startTime && time < c.startTime + c.duration : false;
  const currentTransform = c ? keyframeTransform(c, time) : { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
  const sourceTime = c
    ? c.sourceStart +
      (Math.round((time - c.startTime) * fps) / fps) * c.speed
    : 0;

  const currentKeyframe = c
    ? (c.keyframes || []).find(
        (f) => Math.abs(f.sourceTime - sourceTime) <= c.speed / fps / 2
      )
    : undefined;

  function togglePropertyKeyframe(property: keyof Transform) {
    if (!c || !isInsideClip || track?.locked) return;
    if (currentKeyframe) {
      // Remove keyframe at current playhead
      run((project) =>
        setTransformKeyframes(
          project,
          c.id,
          (project.clips[c.id].keyframes || []).filter(
            (k) => Math.abs(k.sourceTime - currentKeyframe.sourceTime) > 1e-4
          )
        )
      );
    } else {
      // Capture keyframe at current playhead
      run((project) =>
        captureKeyframe(project, c.id, time, currentTransform, "smooth")
      );
    }
  }

  // Keyframe navigation helpers
  const keyframes = c
    ? (c.keyframes || [])
        .filter(
          (f) =>
            f.sourceTime >= c.sourceStart - 1e-4 &&
            f.sourceTime <= c.sourceEnd + 1e-4
        )
        .sort((a, b) => a.sourceTime - b.sourceTime)
    : [];

  function jumpToPrevKeyframe() {
    if (!c) return;
    const prev = [...keyframes]
      .reverse()
      .find((f) => f.sourceTime < sourceTime - 1e-4);
    if (prev) {
      const at = c.startTime + (prev.sourceTime - c.sourceStart) / c.speed;
      playback.set(Math.max(c.startTime, Math.min(c.startTime + c.duration, at)), false);
    }
  }

  function jumpToNextKeyframe() {
    if (!c) return;
    const next = keyframes.find((f) => f.sourceTime > sourceTime + 1e-4);
    if (next) {
      const at = c.startTime + (next.sourceTime - c.sourceStart) / c.speed;
      playback.set(Math.max(c.startTime, Math.min(c.startTime + c.duration, at)), false);
    }
  }

  // Decibel audio calculation
  const dbValue = c ? linearGainToDecibels(c.volume) : -80;
  const dbLabel = c ? formatGainAsDecibels(c.volume) : "-∞ dB";

  // Build Tab List
  const availableTabs: CategoryTab[] = [];
  if (layer || isCaption) availableTabs.push("Text");
  availableTabs.push("Video", "Speed", "Audio", "Animation");

  return (
    <aside
      data-vx-motion="right"
      className="capcut-inspector flex flex-col w-[300px] flex-shrink-0 h-full overflow-hidden select-none"
      aria-label="CapCut Properties Inspector"
    >
      {/* Top Header Bar */}
      <header className="flex items-center justify-between px-3 py-2.5 bg-[#18181C] border-b border-[#2E2E33] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs tracking-wide text-white">
            {c ? c.name : "Inspector"}
          </span>
          {c && (
            <span className="bg-[#222226] text-[#00E5FF] border border-[#2E2E33] text-[9px] px-1.5 py-0.5 rounded font-medium">
              {selection.length > 1 ? `${selection.length} selected` : track?.kind}
            </span>
          )}
        </div>
        <SlidersHorizontal size={13} className="text-[#A0A0A8]" />
      </header>

      {!c ? (
        /* Empty State */
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-[#A0A0A8] bg-[#18181C]">
          <div className="w-12 h-12 rounded-full bg-[#222226] border border-[#2E2E33] flex items-center justify-center text-[#00E5FF] mb-3">
            <Layers size={22} />
          </div>
          <strong className="text-white text-sm font-semibold mb-1">
            No Clip Selected
          </strong>
          <p className="text-xs text-[#A0A0A8] max-w-[200px] leading-relaxed mb-4">
            Select a video, audio, text, or effect clip in the timeline to view and edit its properties.
          </p>
          <div className="w-full bg-[#222226] border border-[#2E2E33] rounded-lg p-2.5 text-[11px] space-y-1 text-left">
            <div className="flex justify-between">
              <span className="text-[#A0A0A8]">Format</span>
              <b className="text-white font-mono">{p.settings.aspectRatio}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-[#A0A0A8]">Frame Rate</span>
              <b className="text-white font-mono">{p.settings.fps} fps</b>
            </div>
            <div className="flex justify-between">
              <span className="text-[#A0A0A8]">Engine</span>
              <b className="text-[#00E5FF]">CapCut Dark Studio</b>
            </div>
          </div>
        </div>
      ) : (
        /* Content Area with Tabs */
        <div className="flex-1 flex flex-col min-h-0 bg-[#18181C]">
          {/* CapCut Category Tabs Bar */}
          <nav className="flex items-center overflow-x-auto border-b border-[#2E2E33] bg-[#18181C] flex-shrink-0 scrollbar-none px-1">
            {availableTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`capcut-tab ${activeTab === tab ? "active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "Video" && <Video size={12} className="inline mr-1 -mt-0.5" />}
                {tab === "Speed" && <Gauge size={12} className="inline mr-1 -mt-0.5" />}
                {tab === "Audio" && <Music size={12} className="inline mr-1 -mt-0.5" />}
                {tab === "Animation" && <Film size={12} className="inline mr-1 -mt-0.5" />}
                {tab === "Text" && <Type size={12} className="inline mr-1 -mt-0.5" />}
                {tab}
              </button>
            ))}
          </nav>

          {/* Tab Content Body */}
          <div className="flex-1 overflow-y-auto p-3 text-xs">
            {track?.locked && (
              <div className="bg-amber-950/20 border border-amber-900/40 text-amber-400 p-2 rounded-lg mb-3 text-[11px]">
                Track is locked. Unlock in the timeline to make adjustments.
              </div>
            )}

            <fieldset disabled={track?.locked} className="space-y-3">
              {/* Quick Actions Strip */}
              <div className="flex items-center gap-1.5 pb-2 mb-2 border-b border-[#2E2E33]">
                <button
                  type="button"
                  title="Split clip at playhead"
                  onClick={() =>
                    run((project) =>
                      splitClip(project, c.id, playback.getSnapshot().time)
                    )
                  }
                  className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded bg-[#222226] hover:bg-[#2A2A30] text-[#A0A0A8] hover:text-white border border-[#2E2E33] text-[11px] transition-colors"
                >
                  <Split size={11} /> Split
                </button>
                <button
                  type="button"
                  title="Duplicate clip"
                  onClick={() => run((project) => duplicateClip(project, c.id))}
                  className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded bg-[#222226] hover:bg-[#2A2A30] text-[#A0A0A8] hover:text-white border border-[#2E2E33] text-[11px] transition-colors"
                >
                  <Copy size={11} /> Copy
                </button>
                <button
                  type="button"
                  title="Delete clip"
                  onClick={() => {
                    run((project) => removeClip(project, c.id));
                    select([]);
                  }}
                  className="flex items-center justify-center p-1.5 rounded bg-[#222226] hover:bg-red-950/40 text-[#A0A0A8] hover:text-red-400 border border-[#2E2E33] text-[11px] transition-colors"
                >
                  <Trash2 size={12} />
                </button>
                {hasAudio && (
                  <button
                    type="button"
                    title={c.volume > 0 ? "Mute clip" : "Unmute clip"}
                    onClick={() =>
                      run((project) =>
                        changeClipProperty(project, c.id, {
                          volume: c.volume > 0 ? 0 : 1,
                        })
                      )
                    }
                    className={`flex items-center justify-center p-1.5 rounded border border-[#2E2E33] text-[11px] transition-colors ${
                      c.volume > 0
                        ? "bg-[#222226] text-[#A0A0A8] hover:text-white hover:bg-[#2A2A30]"
                        : "bg-[#00E5FF]/20 text-[#00E5FF] border-[#00E5FF]/40"
                    }`}
                  >
                    {c.volume > 0 ? <Volume2 size={12} /> : <VolumeX size={12} />}
                  </button>
                )}
              </div>

              {/* TAB 1: VIDEO TAB */}
              {activeTab === "Video" && visual && (
                <div className="space-y-3">
                  {/* Transform & Position Section */}
                  <div className="capcut-card">
                    <div className="capcut-card-heading">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#00E5FF]">◆</span>
                        <span>Transform &amp; Position</span>
                      </div>

                      {/* Keyframe Navigation & Reset Action */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title="Previous Keyframe"
                          disabled={keyframes.length === 0}
                          onClick={jumpToPrevKeyframe}
                          className="w-5 h-5 flex items-center justify-center rounded bg-[#18181C] hover:bg-[#2A2A30] text-[#A0A0A8] hover:text-white disabled:opacity-30 border border-[#2E2E33]"
                        >
                          <ChevronLeft size={11} />
                        </button>
                        <button
                          type="button"
                          title="Next Keyframe"
                          disabled={keyframes.length === 0}
                          onClick={jumpToNextKeyframe}
                          className="w-5 h-5 flex items-center justify-center rounded bg-[#18181C] hover:bg-[#2A2A30] text-[#A0A0A8] hover:text-white disabled:opacity-30 border border-[#2E2E33]"
                        >
                          <ChevronRight size={11} />
                        </button>
                        <button
                          type="button"
                          title="Reset Transform"
                          onClick={() =>
                            run((project) => resetClipTransform(project, c.id))
                          }
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#18181C] hover:bg-[#2A2A30] text-[#A0A0A8] hover:text-[#00E5FF] border border-[#2E2E33] text-[10px] ml-1 transition-colors"
                        >
                          <RotateCcw size={10} />
                          <span>Reset</span>
                        </button>
                      </div>
                    </div>

                    {/* Framing Actions for Visual Assets */}
                    {asset && (
                      <div className="flex gap-2 mb-3">
                        <button
                          type="button"
                          disabled={framing}
                          onClick={() => void frame("fit")}
                          className="flex-1 py-1 px-2 rounded bg-[#18181C] hover:bg-[#2A2A30] text-[#A0A0A8] hover:text-white border border-[#2E2E33] text-[11px] transition-colors"
                        >
                          Fit Frame
                        </button>
                        <button
                          type="button"
                          disabled={framing}
                          onClick={() => void frame("fill")}
                          className="flex-1 py-1 px-2 rounded bg-[#18181C] hover:bg-[#2A2A30] text-[#A0A0A8] hover:text-white border border-[#2E2E33] text-[11px] transition-colors"
                        >
                          Fill Frame
                        </button>
                      </div>
                    )}

                    {/* Position X and Y with CapCut Diamond Keyframes */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[11px] text-[#A0A0A8]">
                          <button
                            type="button"
                            title={
                              currentKeyframe
                                ? "Remove keyframe at playhead"
                                : "Add Position X keyframe at playhead"
                            }
                            onClick={() => togglePropertyKeyframe("x")}
                            className={`capcut-diamond-btn ${
                              currentKeyframe ? "active" : ""
                            }`}
                          >
                            {currentKeyframe ? "◆" : "◇"}
                          </button>
                          <span>Position X</span>
                        </div>
                        <span className="text-[#00E5FF] font-mono text-[11px]">
                          {(c.transform.x * 100).toFixed(1)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        aria-label="Position X"
                        min={-150}
                        max={150}
                        step={0.5}
                        value={c.transform.x * 100}
                        onChange={(e) =>
                          run((project) =>
                            changeClipProperty(project, c.id, {
                              transform: {
                                ...c.transform,
                                x: Number(e.target.value) / 100,
                              },
                            })
                          )
                        }
                        className="capcut-slider"
                      />

                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-1.5 text-[11px] text-[#A0A0A8]">
                          <button
                            type="button"
                            title={
                              currentKeyframe
                                ? "Remove keyframe at playhead"
                                : "Add Position Y keyframe at playhead"
                            }
                            onClick={() => togglePropertyKeyframe("y")}
                            className={`capcut-diamond-btn ${
                              currentKeyframe ? "active" : ""
                            }`}
                          >
                            {currentKeyframe ? "◆" : "◇"}
                          </button>
                          <span>Position Y</span>
                        </div>
                        <span className="text-[#00E5FF] font-mono text-[11px]">
                          {(c.transform.y * 100).toFixed(1)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        aria-label="Position Y"
                        min={-150}
                        max={150}
                        step={0.5}
                        value={c.transform.y * 100}
                        onChange={(e) =>
                          run((project) =>
                            changeClipProperty(project, c.id, {
                              transform: {
                                ...c.transform,
                                y: Number(e.target.value) / 100,
                              },
                            })
                          )
                        }
                        className="capcut-slider"
                      />

                      <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-[#2E2E33]">
                        <NumberField
                          label="X (%)"
                          value={c.transform.x * 100}
                          step={1}
                          edit={(v) => (project) =>
                            changeClipProperty(project, c.id, {
                              transform: { ...c.transform, x: v / 100 },
                            })
                          }
                        />
                        <NumberField
                          label="Y (%)"
                          value={c.transform.y * 100}
                          step={1}
                          edit={(v) => (project) =>
                            changeClipProperty(project, c.id, {
                              transform: { ...c.transform, y: v / 100 },
                            })
                          }
                        />
                      </div>
                    </div>

                    {/* Scale Slider with Diamond */}
                    <div className="mt-3 pt-3 border-t border-[#2E2E33]">
                      <CapcutSlider
                        label="Scale"
                        value={c.transform.scale * 100}
                        min={10}
                        max={500}
                        step={1}
                        unit="%"
                        keyframeButton={
                          <button
                            type="button"
                            title="Toggle Scale Keyframe"
                            onClick={() => togglePropertyKeyframe("scale")}
                            className={`capcut-diamond-btn ${
                              currentKeyframe ? "active" : ""
                            }`}
                          >
                            {currentKeyframe ? "◆" : "◇"}
                          </button>
                        }
                        edit={(v) => (project) =>
                          changeClipProperty(project, c.id, {
                            transform: { ...c.transform, scale: v / 100 },
                          })
                        }
                      />
                    </div>

                    {/* Rotation Slider with Diamond */}
                    <CapcutSlider
                      label="Rotation"
                      value={c.transform.rotation}
                      min={-180}
                      max={180}
                      step={1}
                      unit="°"
                      keyframeButton={
                        <button
                          type="button"
                          title="Toggle Rotation Keyframe"
                          onClick={() => togglePropertyKeyframe("rotation")}
                          className={`capcut-diamond-btn ${
                            currentKeyframe ? "active" : ""
                          }`}
                        >
                          {currentKeyframe ? "◆" : "◇"}
                        </button>
                      }
                      edit={(v) => (project) =>
                        changeClipProperty(project, c.id, {
                          transform: { ...c.transform, rotation: v },
                        })
                      }
                    />

                    {/* Opacity Slider with Diamond */}
                    <CapcutSlider
                      label="Opacity"
                      value={c.transform.opacity * 100}
                      min={0}
                      max={100}
                      step={1}
                      unit="%"
                      keyframeButton={
                        <button
                          type="button"
                          title="Toggle Opacity Keyframe"
                          onClick={() => togglePropertyKeyframe("opacity")}
                          className={`capcut-diamond-btn ${
                            currentKeyframe ? "active" : ""
                          }`}
                        >
                          {currentKeyframe ? "◆" : "◇"}
                        </button>
                      }
                      edit={(v) => (project) =>
                        changeClipProperty(project, c.id, {
                          transform: { ...c.transform, opacity: v / 100 },
                        })
                      }
                    />
                  </div>

                  {/* Surface Treatment */}
                  {asset && (
                    <div className="capcut-card">
                      <div className="capcut-card-heading">
                        <span>Surface Treatment</span>
                      </div>
                      <select
                        aria-label="Surface treatment"
                        value={c.surface || "none"}
                        onChange={(e) =>
                          run((project) =>
                            changeClipProperty(project, c.id, {
                              surface: e.target.value as StyleSurface,
                            })
                          )
                        }
                        className="capcut-input w-full"
                      >
                        {STYLE_SURFACES.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Visual Adjustments */}
                  {asset && (
                    <div className="capcut-card">
                      <div className="capcut-card-heading">
                        <span>Color &amp; Visual Adjustments</span>
                      </div>
                      {(["brightness", "contrast", "saturation"] as const).map(
                        (key) => (
                          <CapcutSlider
                            key={key}
                            label={key[0].toUpperCase() + key.slice(1)}
                            value={c.effects[key]}
                            min={-100}
                            max={100}
                            edit={(v) => (project) =>
                              changeClipProperty(project, c.id, {
                                effects: { ...c.effects, [key]: v },
                              })
                            }
                          />
                        )
                      )}
                      <CapcutSlider
                        label="Blur"
                        value={c.effects.blur}
                        min={0}
                        max={30}
                        step={0.5}
                        edit={(v) => (project) =>
                          changeClipProperty(project, c.id, {
                            effects: { ...c.effects, blur: v },
                          })
                        }
                      />
                    </div>
                  )}

                  {/* Vector Shape Controls */}
                  {c.shape && <ShapeControls clipId={c.id} />}

                  {/* Embedded CapCut Keyframe Controls Section */}
                  <KeyframeControls clipId={c.id} />
                </div>
              )}

              {/* TAB 2: SPEED TAB */}
              {activeTab === "Speed" && (
                <div className="space-y-3">
                  {/* Segmented Mode Toggle: Normal vs Curve */}
                  <div className="capcut-segmented">
                    <button
                      type="button"
                      className={`capcut-segment-btn ${
                        speedMode === "normal" ? "active" : ""
                      }`}
                      onClick={() => setSpeedMode("normal")}
                    >
                      <Gauge size={12} />
                      <span>Normal</span>
                    </button>
                    <button
                      type="button"
                      className={`capcut-segment-btn ${
                        speedMode === "curve" ? "active" : ""
                      }`}
                      onClick={() => setSpeedMode("curve")}
                    >
                      <Activity size={12} />
                      <span>Curve</span>
                    </button>
                  </div>

                  {speedMode === "normal" ? (
                    /* NORMAL SPEED MODE */
                    <div className="capcut-card">
                      <div className="capcut-card-heading">
                        <span>Constant Speed</span>
                        <span className="text-[#00E5FF] font-mono font-semibold">
                          {c.speed.toFixed(2)}×
                        </span>
                      </div>

                      {/* Speed Presets Chips */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {SPEED_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            className={`capcut-chip ${
                              Math.abs(c.speed - preset) < 0.01 ? "active" : ""
                            }`}
                            onClick={() =>
                              run((project) =>
                                changeClipProperty(project, c.id, { speed: preset })
                              )
                            }
                          >
                            {preset}×
                          </button>
                        ))}
                      </div>

                      {/* Speed Slider (0.1x to 10x) */}
                      <CapcutSlider
                        label="Playback Velocity"
                        value={c.speed}
                        min={0.1}
                        max={10}
                        step={0.05}
                        displayValue={`${c.speed.toFixed(2)}×`}
                        edit={(v) => (project) =>
                          changeClipProperty(project, c.id, {
                            speed: Math.max(0.1, Math.min(10, v)),
                          })
                        }
                      />

                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <NumberField
                          label="Fine Tune (×)"
                          value={c.speed}
                          min={0.1}
                          max={10}
                          step={0.05}
                          edit={(v) => (project) =>
                            changeClipProperty(project, c.id, {
                              speed: Math.max(0.1, Math.min(10, v)),
                            })
                          }
                        />
                        <div className="flex flex-col gap-1 text-[11px] text-[#A0A0A8]">
                          <span>Duration</span>
                          <div className="capcut-input font-mono text-[#00E5FF] flex items-center justify-between">
                            <span>{c.duration.toFixed(2)}s</span>
                            <Clock size={11} className="text-[#A0A0A8]" />
                          </div>
                        </div>
                      </div>

                      {/* Duration Readout Note */}
                      <div className="mt-3 p-2 rounded bg-[#18181C] border border-[#2E2E33] text-[10px] text-[#A0A0A8] flex items-center justify-between font-mono">
                        <span>Original: {(c.sourceEnd - c.sourceStart).toFixed(2)}s</span>
                        <span className="text-[#00E5FF]">
                          → Timeline: {c.duration.toFixed(2)}s
                        </span>
                      </div>

                      {/* Pitch Lock Toggle */}
                      {hasAudio && (
                        <div className="mt-3 pt-3 border-t border-[#2E2E33]">
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              aria-label="Preserve audio pitch"
                              checked={c.preservePitch !== false}
                              onChange={(e) =>
                                run((project) =>
                                  changeClipProperty(project, c.id, {
                                    preservePitch: e.target.checked,
                                  })
                                )
                              }
                              className="mt-0.5 accent-[#00E5FF]"
                            />
                            <div>
                              <div className="text-white text-xs font-medium">
                                Pitch Lock (Preserve Voice Tone)
                              </div>
                              <div className="text-[10px] text-[#A0A0A8] leading-tight mt-0.5">
                                WSOLA time-domain correction prevents voice pitch distortion when speeding up or slowing down.
                              </div>
                            </div>
                          </label>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* CURVE SPEED MODE */
                    <div className="space-y-3">
                      <div className="capcut-card">
                        <div className="capcut-card-heading">
                          <span>Speed Ramping Curves</span>
                          <span className="text-[10px] text-[#A0A0A8]">
                            Cubic Bézier velocity profile
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-3">
                          {SPEED_CURVE_LIST.map((preset) => {
                            const isSelected = selectedCurveId === preset.id;
                            const avgSpeed = calculateAverageSpeed(preset);
                            return (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => {
                                  setSelectedCurveId(preset.id);
                                  run((project) =>
                                    changeClipProperty(project, c.id, {
                                      speed: Math.max(0.1, Math.min(10, avgSpeed)),
                                    })
                                  );
                                }}
                                className={`flex flex-col p-2 rounded-lg text-left transition-all border ${
                                  isSelected
                                    ? "bg-[#00E5FF]/10 border-[#00E5FF] shadow-[0_0_10px_rgba(0,229,255,0.2)]"
                                    : "bg-[#18181C] border-[#2E2E33] hover:border-[#40404A]"
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="font-semibold text-xs text-white">
                                    {preset.name}
                                  </span>
                                  <span className="text-[9px] text-[#00E5FF] font-mono">
                                    {avgSpeed.toFixed(1)}× avg
                                  </span>
                                </div>

                                {/* SVG Curve Preview */}
                                <div className="w-full h-9 bg-[#121214] rounded border border-[#2E2E33] overflow-hidden relative mb-1.5 flex items-center justify-center">
                                  {/* 1.0x baseline reference */}
                                  <div className="absolute inset-x-0 top-1/2 border-b border-[#2E2E33] border-dashed pointer-events-none" />
                                  <svg
                                    width="100%"
                                    height="100%"
                                    viewBox="0 0 110 36"
                                    preserveAspectRatio="none"
                                    className="overflow-visible"
                                  >
                                    <polyline
                                      fill="none"
                                      stroke={isSelected ? "#00E5FF" : "#666672"}
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      points={generateSpeedCurveSvgPoints(preset, 110, 36, 24)}
                                    />
                                  </svg>
                                </div>

                                <span className="text-[9px] text-[#A0A0A8] line-clamp-1 leading-tight">
                                  {preset.description}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Selected Curve Details */}
                        {(() => {
                          const preset = getSpeedCurvePreset(selectedCurveId);
                          const avg = calculateAverageSpeed(preset);
                          return (
                            <div className="p-2.5 rounded bg-[#18181C] border border-[#2E2E33] space-y-1.5 text-[11px]">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-white">
                                  {preset.name} Curve Profile
                                </span>
                                <span className="text-[#00E5FF] font-mono font-bold">
                                  {avg.toFixed(2)}× Average Velocity
                                </span>
                              </div>
                              <p className="text-[10px] text-[#A0A0A8] leading-relaxed">
                                {preset.motionCharacteristics}
                              </p>
                            </div>
                          );
                        })()}

                        {/* Pitch Lock in Curve Mode */}
                        {hasAudio && (
                          <div className="mt-3 pt-3 border-t border-[#2E2E33]">
                            <label className="flex items-start gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={c.preservePitch !== false}
                                onChange={(e) =>
                                  run((project) =>
                                    changeClipProperty(project, c.id, {
                                      preservePitch: e.target.checked,
                                    })
                                  )
                                }
                                className="mt-0.5 accent-[#00E5FF]"
                              />
                              <div>
                                <div className="text-white text-xs font-medium">
                                  Pitch Lock (WSOLA)
                                </div>
                                <div className="text-[10px] text-[#A0A0A8] leading-tight mt-0.5">
                                  Preserves voice tone throughout dynamic speed transitions.
                                </div>
                              </div>
                            </label>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: AUDIO TAB */}
              {activeTab === "Audio" && hasAudio && (
                <div className="space-y-3">
                  {/* Decibel Volume & Levels */}
                  <div className="capcut-card">
                    <div className="capcut-card-heading">
                      <div className="flex items-center gap-1.5">
                        <Music size={13} className="text-[#00E5FF]" />
                        <span>Audio &amp; Volume</span>
                      </div>
                      <span className="text-[#00E5FF] font-mono font-bold text-xs">
                        {dbLabel}
                      </span>
                    </div>

                    {/* Decibel Quick Presets */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {[
                        { label: "Mute", vol: 0 },
                        { label: "-12 dB", vol: decibelsToLinearGain(-12) },
                        { label: "-6 dB", vol: decibelsToLinearGain(-6) },
                        { label: "0 dB", vol: 1.0 },
                        { label: "+3 dB", vol: decibelsToLinearGain(3) },
                        { label: "+6 dB", vol: decibelsToLinearGain(6) },
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          className={`capcut-chip ${
                            Math.abs(c.volume - item.vol) < 0.05 ? "active" : ""
                          }`}
                          onClick={() =>
                            run((project) =>
                              changeClipProperty(project, c.id, { volume: item.vol })
                            )
                          }
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    {/* Decibel Volume Slider (-inf to +6 dB / linear gain 0 to 2.0) */}
                    <CapcutSlider
                      label="Volume Gain"
                      value={c.volume * 100}
                      min={0}
                      max={200}
                      step={1}
                      displayValue={`${(c.volume * 100).toFixed(0)}% (${dbLabel})`}
                      edit={(v) => (project) =>
                        changeClipProperty(project, c.id, {
                          volume: Math.max(0, Math.min(2, v / 100)),
                        })
                      }
                    />

                    {/* Fade In & Fade Out Duration Sliders */}
                    <div className="mt-3 pt-3 border-t border-[#2E2E33] space-y-2">
                      <CapcutSlider
                        label="Fade In"
                        value={c.fadeIn}
                        min={0}
                        max={Math.min(c.duration, 10)}
                        step={0.05}
                        displayValue={`${c.fadeIn.toFixed(2)}s`}
                        edit={(v) => (project) =>
                          changeClipProperty(project, c.id, {
                            fadeIn: Math.max(0, Math.min(c.duration, v)),
                          })
                        }
                      />

                      <CapcutSlider
                        label="Fade Out"
                        value={c.fadeOut}
                        min={0}
                        max={Math.min(c.duration, 10)}
                        step={0.05}
                        displayValue={`${c.fadeOut.toFixed(2)}s`}
                        edit={(v) => (project) =>
                          changeClipProperty(project, c.id, {
                            fadeOut: Math.max(0, Math.min(c.duration, v)),
                          })
                        }
                      />

                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <NumberField
                          label="Fade In (s)"
                          value={c.fadeIn}
                          min={0}
                          max={c.duration}
                          step={0.05}
                          edit={(v) => (project) =>
                            changeClipProperty(project, c.id, { fadeIn: v })
                          }
                        />
                        <NumberField
                          label="Fade Out (s)"
                          value={c.fadeOut}
                          min={0}
                          max={c.duration}
                          step={0.05}
                          edit={(v) => (project) =>
                            changeClipProperty(project, c.id, { fadeOut: v })
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {/* Equal-Power Crossfade & Auto-Ducking Section */}
                  <div className="capcut-card">
                    <div className="capcut-card-heading">
                      <span>Mixing &amp; Crossfades</span>
                    </div>

                    {/* Equal-Power Crossfade Toggle */}
                    <div className="mb-3">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={equalPowerCrossfade}
                          onChange={(e) => setEqualPowerCrossfade(e.target.checked)}
                          className="mt-0.5 accent-[#00E5FF]"
                        />
                        <div>
                          <div className="text-white text-xs font-medium">
                            Equal-Power Crossfade
                          </div>
                          <div className="text-[10px] text-[#A0A0A8] leading-tight mt-0.5">
                            Constant acoustic power (cos/sin curve) eliminates the 3 dB volume dip during audio transitions.
                          </div>
                        </div>
                      </label>
                    </div>

                    {/* Audio Role Selector */}
                    <div className="pt-2.5 border-t border-[#2E2E33] mb-2.5">
                      <label className="block text-[11px] text-[#A0A0A8] mb-1 font-medium">
                        Audio Role
                      </label>
                      <select
                        aria-label="Audio role"
                        value={audioRole(p, c)}
                        onChange={(e) =>
                          run((project) =>
                            changeClipProperty(project, c.id, {
                              audioRole: e.target.value as "speech" | "background" | "sfx",
                            })
                          )
                        }
                        className="capcut-input w-full"
                      >
                        <option value="speech">Speech / Voiceover</option>
                        <option value="background">Background / Music</option>
                        <option value="sfx">Sound Effect (SFX)</option>
                      </select>
                    </div>

                    {/* Speech Auto-Ducking Toggle */}
                    {audioRole(p, c) !== "speech" && (
                      <div className="pt-2 border-t border-[#2E2E33]">
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={c.ducking !== false}
                            onChange={(e) =>
                              run((project) =>
                                changeClipProperty(project, c.id, {
                                  ducking: e.target.checked,
                                })
                              )
                            }
                            className="mt-0.5 accent-[#00E5FF]"
                          />
                          <div>
                            <div className="text-white text-xs font-medium">
                              Speech Auto-Ducking
                            </div>
                            <div className="text-[10px] text-[#A0A0A8] leading-tight mt-0.5">
                              Automatically attenuates background audio by -14 dB when speech or voiceover is detected.
                            </div>
                          </div>
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: ANIMATION TAB */}
              {activeTab === "Animation" && visual && (
                <div className="space-y-3">
                  <div className="capcut-card">
                    <div className="capcut-card-heading">
                      <div className="flex items-center gap-1.5">
                        <Film size={13} className="text-[#00E5FF]" />
                        <span>Motion Presets</span>
                      </div>
                      {c.mediaAnimation && (
                        <span className="text-[9px] bg-[#00E5FF]/20 text-[#00E5FF] px-1.5 py-0.5 rounded font-mono font-semibold">
                          Active
                        </span>
                      )}
                    </div>

                    {/* Phase Sub-Tabs: In | Out | Combo */}
                    <div className="capcut-segmented mb-3">
                      {(["entrance", "exit", "loop"] as const).map((ph) => {
                        const label = ph === "entrance" ? "In" : ph === "exit" ? "Out" : "Combo";
                        const hasAnim =
                          animDraft[ph] && animDraft[ph] !== "none";
                        return (
                          <button
                            key={ph}
                            type="button"
                            className={`capcut-segment-btn ${
                              animPhase === ph ? "active" : ""
                            }`}
                            onClick={() => setAnimPhase(ph)}
                          >
                            <span>{label}</span>
                            {hasAnim && (
                              <span className="w-1.5 h-1.5 rounded-full bg-[#00E5FF]" />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Presets Grid */}
                    <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1 mb-3">
                      {(animPhase === "loop" ? MEDIA_LOOPS : MEDIA_MOTIONS).map(
                        (preset) => {
                          const active = animDraft[animPhase] === preset;
                          const label =
                            animPhase === "loop"
                              ? preset[0].toUpperCase() + preset.slice(1)
                              : MEDIA_MOTION_LABELS[preset as MediaMotion] || preset;
                          return (
                            <button
                              key={preset}
                              type="button"
                              onClick={() =>
                                setAnimDraft((d) => ({ ...d, [animPhase]: preset }))
                              }
                              className={`flex items-center gap-2 p-2 rounded text-left transition-all border ${
                                active
                                  ? "bg-[#00E5FF]/10 border-[#00E5FF] text-white"
                                  : "bg-[#18181C] border-[#2E2E33] text-[#A0A0A8] hover:border-[#40404A] hover:text-white"
                              }`}
                            >
                              <div
                                className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border text-[9px] ${
                                  active
                                    ? "border-[#00E5FF] bg-[#00E5FF] text-black"
                                    : "border-[#2E2E33] bg-[#121214]"
                                }`}
                              >
                                {active && <Check size={8} />}
                              </div>
                              <span className="text-[11px] font-medium truncate">
                                {label}
                              </span>
                            </button>
                          );
                        }
                      )}
                    </div>

                    {/* Duration Slider */}
                    {animDraft[animPhase] !== "none" && (
                      <div className="mt-2 pt-2 border-t border-[#2E2E33]">
                        {(() => {
                          const durationKey =
                            animPhase === "entrance"
                              ? "entranceDuration"
                              : animPhase === "exit"
                              ? "exitDuration"
                              : "loopDuration";
                          const isLoop = animPhase === "loop";
                          return (
                            <CapcutSlider
                              label={isLoop ? "Loop Cycle Duration" : "Motion Duration"}
                              value={animDraft[durationKey]}
                              min={isLoop ? 0.5 : 0.05}
                              max={isLoop ? 6 : Math.min(3, c.duration)}
                              step={0.05}
                              unit="s"
                              edit={(v) => {
                                setAnimDraft((d) => ({ ...d, [durationKey]: v }));
                                return (project) => project;
                              }}
                            />
                          );
                        })()}
                      </div>
                    )}

                    {/* Easing Selector */}
                    {animPhase !== "loop" && animDraft[animPhase] !== "none" && (
                      <div className="mt-2">
                        <label className="block text-[10px] text-[#A0A0A8] mb-1 font-medium">
                          Easing Curve
                        </label>
                        <select
                          aria-label="Media animation easing"
                          value={animDraft.easing}
                          onChange={(e) =>
                            setAnimDraft((d) => ({
                              ...d,
                              easing: e.target.value as MediaAnimation["easing"],
                            }))
                          }
                          className="capcut-input w-full"
                        >
                          {MEDIA_EASINGS.map((v) => (
                            <option key={v} value={v}>
                              {v === "smooth"
                                ? "Smooth (Bézier)"
                                : v === "ease-out"
                                ? "Ease Out (Decel)"
                                : v === "overshoot"
                                ? "Spring / Overshoot"
                                : "Linear"}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Action Buttons: Apply & Preview */}
                    <div className="flex gap-2 mt-3 pt-3 border-t border-[#2E2E33]">
                      <button
                        type="button"
                        onClick={() =>
                          run((project) =>
                            setMediaAnimation(project, c.id, animDraft)
                          )
                        }
                        className="flex-1 py-1.5 px-3 rounded bg-[#00E5FF] hover:bg-[#33EAFF] text-black font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-[0_0_12px_rgba(0,229,255,0.3)]"
                      >
                        <Sparkles size={12} />
                        <span>Apply Animation</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const times = mediaAnimationTiming(c);
                          const start =
                            animPhase === "exit"
                              ? c.startTime + Math.max(0, c.duration - times.exit - 0.15)
                              : animPhase === "loop"
                              ? c.startTime + times.entrance
                              : c.startTime;
                          playback.set(start, true);
                        }}
                        className="py-1.5 px-2.5 rounded bg-[#18181C] hover:bg-[#2A2A30] text-white border border-[#2E2E33] text-xs flex items-center justify-center gap-1 transition-colors"
                        title="Preview motion"
                      >
                        <Play size={11} />
                        <span>Preview</span>
                      </button>
                    </div>

                    {c.mediaAnimation && (
                      <button
                        type="button"
                        onClick={() =>
                          run((project) => clearMediaAnimation(project, c.id))
                        }
                        className="w-full mt-2 py-1 text-[11px] text-[#A0A0A8] hover:text-red-400 flex items-center justify-center gap-1 transition-colors"
                      >
                        <RotateCcw size={10} />
                        <span>Remove animation</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: TEXT & CAPTION TAB */}
              {activeTab === "Text" && layer && (
                <div className="space-y-3">
                  <div className="capcut-card">
                    <div className="capcut-card-heading">
                      <div className="flex items-center gap-1.5">
                        <Type size={13} className="text-[#00E5FF]" />
                        <span>{isCaption ? "Caption Content" : "Text Content"}</span>
                      </div>
                    </div>

                    <textarea
                      aria-label="Text content"
                      value={layer.text}
                      rows={3}
                      onFocus={() => store.begin()}
                      onChange={(e) => {
                        try {
                          store.preview((project) =>
                            changeText(project, c.id, e.target.value)
                          );
                        } catch (error) {
                          notify(
                            error instanceof Error
                              ? error.message
                              : "Text edit failed."
                          );
                        }
                      }}
                      onBlur={() => store.commit()}
                      className="capcut-input w-full resize-y min-h-[64px]"
                    />

                    {/* Font & Weight */}
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <label className="block text-[10px] text-[#A0A0A8] mb-1 font-medium">
                          Font
                        </label>
                        <select
                          aria-label="Font"
                          value={layer.style.font}
                          onChange={(e) =>
                            run(textStyle({ font: e.target.value }))
                          }
                          className="capcut-input w-full"
                        >
                          {FONT_FAMILIES.map((font) => (
                            <option key={font} value={font}>
                              {font}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] text-[#A0A0A8] mb-1 font-medium">
                          Weight
                        </label>
                        <select
                          aria-label="Font weight"
                          value={layer.style.weight}
                          onChange={(e) =>
                            run(textStyle({ weight: Number(e.target.value) }))
                          }
                          className="capcut-input w-full"
                        >
                          {[400, 500, 600, 700, 800, 900].map((w) => (
                            <option key={w} value={w}>
                              {w}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Font Size Slider */}
                    <CapcutSlider
                      label="Font Size"
                      value={layer.style.size}
                      min={8}
                      max={300}
                      step={1}
                      unit="px"
                      edit={(v) =>
                        textStyle({ size: Math.max(8, Math.min(300, v)) })
                      }
                    />

                    {/* Alignment */}
                    <div className="mt-2 pt-2 border-t border-[#2E2E33]">
                      <span className="block text-[10px] text-[#A0A0A8] mb-1 font-medium">
                        Alignment
                      </span>
                      <div className="capcut-segmented">
                        <button
                          type="button"
                          className={`capcut-segment-btn ${
                            layer.style.align === "left" ? "active" : ""
                          }`}
                          onClick={() => run(textStyle({ align: "left" }))}
                        >
                          <AlignLeft size={13} />
                        </button>
                        <button
                          type="button"
                          className={`capcut-segment-btn ${
                            layer.style.align === "center" ? "active" : ""
                          }`}
                          onClick={() => run(textStyle({ align: "center" }))}
                        >
                          <AlignCenter size={13} />
                        </button>
                        <button
                          type="button"
                          className={`capcut-segment-btn ${
                            layer.style.align === "right" ? "active" : ""
                          }`}
                          onClick={() => run(textStyle({ align: "right" }))}
                        >
                          <AlignRight size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Colors */}
                    <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-[#2E2E33]">
                      <div>
                        <span className="block text-[10px] text-[#A0A0A8] mb-1 font-medium">
                          Text Color
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            aria-label="Text color"
                            value={layer.style.color}
                            onChange={(e) =>
                              run(
                                textStyle({
                                  color: e.target.value,
                                  gradient: null,
                                })
                              )
                            }
                            className="w-7 h-7 rounded border border-[#2E2E33] bg-transparent cursor-pointer"
                          />
                          <span className="font-mono text-[10px] text-white">
                            {layer.style.color}
                          </span>
                        </div>
                      </div>

                      <div>
                        <span className="block text-[10px] text-[#A0A0A8] mb-1 font-medium">
                          Stroke Color
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            aria-label="Stroke color"
                            value={layer.style.stroke}
                            onChange={(e) =>
                              run(textStyle({ stroke: e.target.value }))
                            }
                            className="w-7 h-7 rounded border border-[#2E2E33] bg-transparent cursor-pointer"
                          />
                          <span className="font-mono text-[10px] text-white">
                            {layer.style.stroke}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Caption Active Word Highlight Palette */}
                    {isCaption && (
                      <div className="mt-3 pt-3 border-t border-[#2E2E33]">
                        <span className="block text-[10px] text-[#A0A0A8] mb-1.5 font-medium flex items-center gap-1">
                          <Sparkles size={11} className="text-[#00E5FF]" /> Active Word Highlight
                        </span>
                        <div className="flex items-center gap-1.5">
                          {CAPTION_HIGHLIGHT_SWATCHES.map((swatch) => (
                            <button
                              key={swatch}
                              type="button"
                              onClick={() =>
                                run((project) =>
                                  changeCaptionProperty(project, c.id, {
                                    highlightColor: swatch,
                                  })
                                )
                              }
                              style={{ backgroundColor: swatch }}
                              className={`w-6 h-6 rounded-full border transition-transform ${
                                (caption?.highlightColor || "#FAFF00").toLowerCase() ===
                                swatch.toLowerCase()
                                  ? "border-white scale-110 shadow-[0_0_8px_rgba(255,255,255,0.5)]"
                                  : "border-transparent opacity-80 hover:opacity-100"
                              }`}
                              title={swatch}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Gradient / Fill Controls */}
                  <div className="capcut-card">
                    <TextFillControls
                      style={layer.style}
                      onChange={(changes) => run(textStyle(changes))}
                    />
                  </div>
                </div>
              )}

              {/* Timing Section */}
              <div className="capcut-card">
                <div className="capcut-card-heading">
                  <div className="flex items-center gap-1.5">
                    <Clock size={12} className="text-[#A0A0A8]" />
                    <span>Clip Timing</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="Start (s)"
                    value={c.startTime}
                    min={0}
                    step={0.05}
                    edit={(v) => (project) => moveClip(project, c.id, v)}
                  />
                  <NumberField
                    label="Duration (s)"
                    value={c.duration}
                    min={1 / fps}
                    step={0.05}
                    edit={(v) => (project) =>
                      trimClip(project, c.id, "right", c.startTime + v)
                    }
                  />
                </div>

                {asset && (
                  <div className="mt-2 pt-2 border-t border-[#2E2E33]">
                    <label className="block text-[10px] text-[#A0A0A8] mb-1 font-medium">
                      Replace Media
                    </label>
                    <select
                      aria-label="Replace clip media"
                      value={asset.id}
                      onChange={(e) =>
                        run((project) =>
                          replaceClipAsset(project, c.id, e.target.value)
                        )
                      }
                      className="capcut-input w-full"
                    >
                      {Object.values(p.assets)
                        .filter((a) => canPlace(track!.kind, a.kind))
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Transition Info */}
              {transition && (
                <div className="capcut-card">
                  <div className="capcut-card-heading">
                    <span>Transition · {transition.kind}</span>
                    <button
                      type="button"
                      onClick={() =>
                        run((project) => {
                          const transitions = { ...project.transitions };
                          delete transitions[transition.id];
                          return { ...project, transitions };
                        })
                      }
                      className="text-[#A0A0A8] hover:text-red-400 p-1"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <NumberField
                    label="Duration (s)"
                    value={transition.duration}
                    min={1 / fps}
                    max={c.duration}
                    edit={(v) => (project) => ({
                      ...project,
                      transitions: {
                        ...project.transitions,
                        [transition.id]: {
                          ...transition,
                          duration: Math.max(1 / fps, Math.min(v, c.duration)),
                        },
                      },
                    })}
                  />
                </div>
              )}
            </fieldset>
          </div>
        </div>
      )}
    </aside>
  );
}
