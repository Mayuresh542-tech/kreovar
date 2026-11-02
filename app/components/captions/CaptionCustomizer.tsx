"use client";

import React, { useState } from "react";
import {
  Type,
  Palette,
  Layout,
  Sparkles,
  Zap,
  Bookmark,
  Check,
  RotateCcw,
  Sliders,
} from "lucide-react";
import {
  CaptionStyleConfig,
  CaptionAnimationType,
  HighlightingMode,
  CaptionCategory,
  CAPTION_CATEGORIES,
} from "@/app/lib/captions/templates";

export interface CaptionCustomizerProps {
  style: CaptionStyleConfig;
  templateName?: string;
  onChange: (updatedStyle: CaptionStyleConfig) => void;
  onSaveAsCustomTemplate?: (name: string, category: CaptionCategory, style: CaptionStyleConfig) => void;
  onReset?: () => void;
  className?: string;
}

const FONT_OPTIONS = [
  { label: "Montserrat (Viral)", value: "'Montserrat', -apple-system, sans-serif" },
  { label: "Anton (Impact)", value: "'Anton', 'Impact', sans-serif" },
  { label: "Poppins (Modern)", value: "'Poppins', sans-serif" },
  { label: "Inter (Clean)", value: "'Inter', sans-serif" },
  { label: "Bebas Neue (Tall Bold)", value: "'Bebas Neue', sans-serif" },
  { label: "Oswald (Condensed)", value: "'Oswald', sans-serif" },
  { label: "Outfit (Geometric)", value: "'Outfit', sans-serif" },
  { label: "Syne (Aesthetic)", value: "'Syne', sans-serif" },
  { label: "Bangers (Comic/Hype)", value: "'Bangers', 'Impact', cursive, sans-serif" },
  { label: "JetBrains Mono (Tech)", value: "'JetBrains Mono', monospace" },
];

const QUICK_COLORS = [
  "#FFFFFF",
  "#FFE600",
  "#FACC15",
  "#00F5D4",
  "#38BDF8",
  "#4ADE80",
  "#FF3366",
  "#F43F5E",
  "#A855F7",
  "#F97316",
  "#0F172A",
  "#000000",
];

const ANIMATION_OPTIONS: { label: string; value: CaptionAnimationType }[] = [
  { label: "Pop", value: "pop" },
  { label: "Bounce", value: "bounce" },
  { label: "Fade", value: "fade" },
  { label: "Scale", value: "scale" },
  { label: "Slide Up", value: "slide-up" },
  { label: "Slide Down", value: "slide-down" },
  { label: "Type", value: "type" },
  { label: "Word Reveal", value: "word-by-word" },
];

const HIGHLIGHT_MODES: { label: string; value: HighlightingMode; desc: string }[] = [
  { label: "Current Word", value: "current-word", desc: "Active word highlights as spoken" },
  { label: "Keywords", value: "keyword", desc: "Auto-emphasizes high-impact words" },
  { label: "Alternating", value: "alternating", desc: "Dual-color alternating words" },
  { label: "Full Line", value: "full-line", desc: "Illuminates entire active subtitle block" },
];

export default function CaptionCustomizer({
  style,
  templateName = "Custom Style",
  onChange,
  onSaveAsCustomTemplate,
  onReset,
  className = "",
}: CaptionCustomizerProps) {
  const [activeTab, setActiveTab] = useState<"typography" | "colors" | "layout" | "animation" | "highlight">("typography");
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState(templateName ? `${templateName} (Remix)` : "My Creator Preset");
  const [saveCategory, setSaveCategory] = useState<CaptionCategory>("Custom");
  const [savedSuccess, setSavedSuccess] = useState(false);

  function update(patch: Partial<CaptionStyleConfig>) {
    onChange({ ...style, ...patch });
  }

  function handleSave() {
    if (!saveName.trim() || !onSaveAsCustomTemplate) return;
    onSaveAsCustomTemplate(saveName.trim(), saveCategory, style);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      setIsSaveModalOpen(false);
    }, 1200);
  }

  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-2xl flex flex-col overflow-hidden text-slate-100 shadow-xl ${className}`}>
      {/* Top Header & Save Button */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-blue-400" />
          <h3 className="font-bold text-sm text-white">Customize Caption Style</h3>
        </div>

        <div className="flex items-center gap-2">
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              title="Reset to template defaults"
              className="p-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          {onSaveAsCustomTemplate && (
            <button
              type="button"
              onClick={() => setIsSaveModalOpen(true)}
              className="py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>Save As My Template</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-slate-800 px-3 pt-2 gap-1 overflow-x-auto text-xs font-medium">
        {[
          { id: "typography", label: "Typography", icon: Type },
          { id: "colors", label: "Colors", icon: Palette },
          { id: "layout", label: "Layout", icon: Layout },
          { id: "animation", label: "Animation", icon: Sparkles },
          { id: "highlight", label: "Highlight", icon: Zap },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? "border-blue-500 text-blue-400 font-bold"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="p-4 space-y-4 max-h-[460px] overflow-y-auto">
        {/* 1. TYPOGRAPHY */}
        {activeTab === "typography" && (
          <div className="space-y-4">
            {/* Font Family */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Font Family
              </label>
              <select
                value={style.fontFamily}
                onChange={(e) => update({ fontFamily: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Font Size */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-mono text-[11px] uppercase">Font Size</span>
                <span className="font-mono text-blue-400 font-bold">{style.fontSize}px</span>
              </div>
              <input
                type="range"
                min={16}
                max={60}
                step={1}
                value={style.fontSize}
                onChange={(e) => update({ fontSize: parseInt(e.target.value, 10) })}
                className="w-full accent-blue-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Font Weight */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Font Weight
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {[500, 600, 700, 800, 900].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => update({ fontWeight: w })}
                    className={`py-1.5 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                      style.fontWeight === w
                        ? "bg-blue-600 text-white font-bold"
                        : "bg-slate-950 border border-slate-800 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>

            {/* Text Transform */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Capitalization
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["uppercase", "none", "capitalize"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => update({ textTransform: t })}
                    className={`py-1.5 rounded-lg text-xs capitalize transition-colors cursor-pointer ${
                      style.textTransform === t
                        ? "bg-blue-600 text-white font-bold"
                        : "bg-slate-950 border border-slate-800 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {t === "none" ? "Normal" : t}
                  </button>
                ))}
              </div>
            </div>

            {/* Letter Spacing */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Letter Spacing
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {["-0.02em", "0em", "0.03em", "0.15em"].map((ls) => (
                  <button
                    key={ls}
                    type="button"
                    onClick={() => update({ letterSpacing: ls })}
                    className={`py-1 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                      style.letterSpacing === ls
                        ? "bg-blue-600 text-white font-bold"
                        : "bg-slate-950 border border-slate-800 text-slate-400 hover:bg-slate-800"
                    }`}
                  >
                    {ls}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 2. COLORS & STROKE */}
        {activeTab === "colors" && (
          <div className="space-y-4">
            {/* Text Color */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-mono text-[11px] uppercase">Base Text Color</span>
                <span className="font-mono text-slate-300">{style.textColor}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={style.textColor}
                  onChange={(e) => update({ textColor: e.target.value })}
                  className="w-9 h-9 rounded-lg border border-slate-700 bg-transparent cursor-pointer shrink-0"
                />
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_COLORS.slice(0, 8).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => update({ textColor: c })}
                      style={{ backgroundColor: c }}
                      className="w-5 h-5 rounded-full border border-white/20 transition-transform hover:scale-110 cursor-pointer"
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Highlight Color */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-mono text-[11px] uppercase">Spoken Highlight Color</span>
                <span className="font-mono text-blue-400 font-bold">{style.highlightColor}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={style.highlightColor}
                  onChange={(e) => update({ highlightColor: e.target.value })}
                  className="w-9 h-9 rounded-lg border border-slate-700 bg-transparent cursor-pointer shrink-0"
                />
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_COLORS.slice(1, 9).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => update({ highlightColor: c })}
                      style={{ backgroundColor: c }}
                      className="w-5 h-5 rounded-full border border-white/20 transition-transform hover:scale-110 cursor-pointer"
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Text Stroke / Outline */}
            <div className="space-y-2 p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-semibold">Text Outline / Stroke</span>
                <span className="font-mono text-blue-400">{style.strokeWidth || 0}px</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={style.strokeColor || "#000000"}
                  onChange={(e) => update({ strokeColor: e.target.value })}
                  className="w-8 h-8 rounded-lg border border-slate-700 bg-transparent cursor-pointer shrink-0"
                />
                <input
                  type="range"
                  min={0}
                  max={6}
                  step={0.5}
                  value={style.strokeWidth || 0}
                  onChange={(e) => update({ strokeWidth: parseFloat(e.target.value) })}
                  className="w-full accent-blue-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Container Box / Background */}
            <div className="space-y-2 p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-semibold">Box Background</span>
                <button
                  type="button"
                  onClick={() => update({ containerBg: "transparent" })}
                  className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer"
                >
                  Clear Box
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-xs">
                {[
                  { label: "None", val: "transparent" },
                  { label: "Dark Pill", val: "rgba(0, 0, 0, 0.75)" },
                  { label: "Glass Slate", val: "rgba(15, 23, 42, 0.85)" },
                  { label: "Clean White", val: "rgba(255, 255, 255, 0.94)" },
                  { label: "Midnight Box", val: "rgba(6, 15, 22, 0.92)" },
                  { label: "Cyan Tint", val: "rgba(2, 6, 23, 0.9)" },
                ].map((bg) => (
                  <button
                    key={bg.label}
                    type="button"
                    onClick={() =>
                      update({
                        containerBg: bg.val,
                        containerBorderRadius: bg.val !== "transparent" ? 14 : undefined,
                        containerPadding: bg.val !== "transparent" ? "8px 18px" : undefined,
                      })
                    }
                    className={`py-1.5 rounded-lg border text-[11px] transition-colors cursor-pointer ${
                      style.containerBg === bg.val
                        ? "bg-blue-600 border-blue-500 text-white font-bold"
                        : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {bg.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 3. LAYOUT & POSITIONING */}
        {activeTab === "layout" && (
          <div className="space-y-4">
            {/* Position */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Vertical Position
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "top", label: "Top (14%)", y: 16 },
                  { id: "center", label: "Center (60%)", y: 60 },
                  { id: "bottom", label: "Bottom (82%)", y: 82 },
                ].map((pos) => (
                  <button
                    key={pos.id}
                    type="button"
                    onClick={() =>
                      update({
                        position: pos.id as any,
                        positionYPercent: pos.y,
                      })
                    }
                    className={`py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      style.position === pos.id
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-slate-950 border border-slate-800 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Vertical Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-mono text-[11px] uppercase">
                  Fine-tune Height (Y%)
                </span>
                <span className="font-mono text-blue-400 font-bold">
                  {style.positionYPercent ?? 60}%
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={90}
                step={1}
                value={style.positionYPercent ?? 60}
                onChange={(e) =>
                  update({
                    position: "custom",
                    positionYPercent: parseInt(e.target.value, 10),
                  })
                }
                className="w-full accent-blue-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Max Words Per Line */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-mono text-[11px] uppercase">
                  Max Words Per Subtitle Line
                </span>
                <span className="font-mono text-blue-400 font-bold">
                  {style.maxWordsPerLine} words
                </span>
              </div>
              <div className="grid grid-cols-6 gap-1">
                {[1, 2, 3, 4, 5, 6].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => update({ maxWordsPerLine: num })}
                    className={`py-1.5 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                      style.maxWordsPerLine === num
                        ? "bg-blue-600 text-white font-bold"
                        : "bg-slate-950 border border-slate-800 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Text Alignment */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Alignment
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["left", "center", "right"] as const).map((align) => (
                  <button
                    key={align}
                    type="button"
                    onClick={() => update({ alignment: align })}
                    className={`py-1.5 rounded-lg text-xs capitalize transition-colors cursor-pointer ${
                      style.alignment === align
                        ? "bg-blue-600 text-white font-bold"
                        : "bg-slate-950 border border-slate-800 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {align}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 4. ANIMATION */}
        {activeTab === "animation" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Caption Animation Style
              </label>
              <div className="grid grid-cols-2 gap-2">
                {ANIMATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => update({ animation: opt.value })}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      style.animation === opt.value
                        ? "bg-blue-600/20 border-blue-500 text-white font-bold"
                        : "bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800/60"
                    }`}
                  >
                    <div className="text-xs">{opt.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Speed slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-mono text-[11px] uppercase">Animation Speed</span>
                <span className="font-mono text-blue-400 font-bold">{style.animationSpeed || 0.18}s</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={0.5}
                step={0.02}
                value={style.animationSpeed || 0.18}
                onChange={(e) => update({ animationSpeed: parseFloat(e.target.value) })}
                className="w-full accent-blue-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* 5. HIGHLIGHTING MODES */}
        {activeTab === "highlight" && (
          <div className="space-y-3">
            <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Word Highlighting Mode
            </label>
            <div className="space-y-2">
              {HIGHLIGHT_MODES.map((mode) => {
                const isSelected = style.highlightingMode === mode.value;
                return (
                  <div
                    key={mode.value}
                    onClick={() => update({ highlightingMode: mode.value })}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? "bg-blue-600/15 border-blue-500 text-white shadow-sm"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">{mode.label}</span>
                      {isSelected && <span className="text-[10px] font-mono text-blue-400 font-bold">ACTIVE</span>}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">{mode.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Save Modal */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white">Save Custom Caption Template</h3>
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Template Name</label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g. My Viral Punch 2.0"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Category</label>
                <select
                  value={saveCategory}
                  onChange={(e) => setSaveCategory(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  {CAPTION_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="px-3 py-2 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!saveName.trim() || savedSuccess}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <>
                    <Bookmark className="w-3.5 h-3.5" />
                    <span>Save Template</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
