"use client";

import React from "react";
import {
  Scissors,
  Music2,
  Type,
  Layers,
  Sparkles,
  Wand2,
  Smartphone,
  ChevronLeft,
  Gauge,
  Volume2,
  Film,
  Trash2,
  Copy,
  Maximize2,
} from "lucide-react";

export type MobileToolDrawerTab =
  | "edit"
  | "audio"
  | "text"
  | "overlay"
  | "effects"
  | "filters"
  | "format"
  | "speed"
  | "volume"
  | "animation"
  | "transform"
  | "silence"
  | "broll"
  | "captions";

interface MobileBottomBarProps {
  activeDrawer: MobileToolDrawerTab | null;
  isAiSheetOpen: boolean;
  onSelectDrawer: (tab: MobileToolDrawerTab) => void;
  onOpenAiCopilot: () => void;
  hasSelection?: boolean;
  onDeselect?: () => void;
  onSplit?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
}

export default function MobileBottomBar({
  activeDrawer,
  isAiSheetOpen,
  onSelectDrawer,
  onOpenAiCopilot,
  hasSelection = false,
  onDeselect,
  onSplit,
  onDelete,
  onDuplicate,
}: MobileBottomBarProps) {
  // 1. Root State Toolbar Items (CapCut Mobile default toolbar when no clip is selected)
  const rootItems: {
    id: MobileToolDrawerTab | "ai";
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
  }[] = [
    { id: "edit", label: "Edit", icon: Scissors },
    { id: "audio", label: "Audio", icon: Music2 },
    { id: "text", label: "Text", icon: Type },
    { id: "overlay", label: "Overlay", icon: Layers },
    { id: "effects", label: "Effects", icon: Sparkles },
    { id: "filters", label: "Filters", icon: Wand2 },
    { id: "format", label: "Format", icon: Smartphone },
  ];

  // 2. Selected State Toolbar Items (CapCut Mobile clip edit toolbar when a clip is active)
  const selectedItems: {
    id: MobileToolDrawerTab | "split" | "delete" | "duplicate";
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    action?: () => void;
    destructive?: boolean;
  }[] = [
    { id: "split", label: "Split", icon: Scissors, action: onSplit },
    { id: "speed", label: "Speed", icon: Gauge },
    { id: "volume", label: "Volume", icon: Volume2 },
    { id: "animation", label: "Animation", icon: Film },
    { id: "delete", label: "Delete", icon: Trash2, action: onDelete, destructive: true },
    { id: "duplicate", label: "Duplicate", icon: Copy, action: onDuplicate },
    { id: "transform", label: "Transform", icon: Maximize2 },
  ];

  return (
    <nav
      className="flex-shrink-0 w-full bg-[#16161C] border-t border-[#26262E] pb-[env(safe-area-inset-bottom)] z-30 select-none shadow-2xl"
      aria-label="CapCut Mobile Tool Dock"
    >
      <div className="h-[56px] flex items-center px-1">
        {hasSelection ? (
          // ================= SELECTED STATE TOOLBAR =================
          <div className="flex items-center w-full h-full overflow-x-auto no-scrollbar touch-pan-x px-1">
            {/* Back button to return to root toolbar */}
            <button
              type="button"
              onClick={() => {
                navigator.vibrate?.(6);
                onDeselect?.();
              }}
              aria-label="Back to main tools"
              className="flex-shrink-0 min-w-[50px] h-[48px] px-2 flex flex-col items-center justify-center text-white/90 active:scale-95 transition-all border-r border-[#26262E] mr-1"
            >
              <ChevronLeft size={20} className="text-[#00E5FF]" />
              <span className="text-[10px] mt-0.5 tracking-tight font-medium text-white/80">
                Back
              </span>
            </button>

            {/* Selected Clip Operations */}
            <div className="flex items-center flex-1 space-x-1">
              {selectedItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeDrawer === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      navigator.vibrate?.(8);
                      if (item.action) {
                        item.action();
                      } else {
                        onSelectDrawer(item.id as MobileToolDrawerTab);
                      }
                    }}
                    aria-pressed={isActive}
                    aria-label={item.label}
                    className={`flex-shrink-0 min-w-[52px] h-[48px] px-1.5 flex flex-col items-center justify-center rounded-xl transition-all active:scale-95 ${
                      isActive
                        ? "text-[#00E5FF] bg-[#00E5FF]/10 font-bold border border-[#00E5FF]/40 shadow-[0_0_8px_rgba(0,229,255,0.25)]"
                        : item.destructive
                        ? "text-rose-400/90 hover:text-rose-300"
                        : "text-[#9E9EA8] hover:text-white"
                    }`}
                  >
                    <Icon
                      size={18}
                      className={
                        isActive
                          ? "text-[#00E5FF]"
                          : item.destructive
                          ? "text-rose-400"
                          : "text-[#C4C4CC]"
                      }
                    />
                    <span
                      className={`text-[10px] mt-0.5 tracking-tight whitespace-nowrap ${
                        isActive
                          ? "text-[#00E5FF] font-bold"
                          : item.destructive
                          ? "text-rose-400 font-medium"
                          : "text-[#A0A0A8] font-medium"
                      }`}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          // ================= ROOT STATE TOOLBAR =================
          <div className="flex items-center justify-between w-full h-full overflow-x-auto no-scrollbar touch-pan-x px-1">
            <div className="flex items-center flex-1 justify-around">
              {rootItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeDrawer === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      navigator.vibrate?.(6);
                      onSelectDrawer(item.id as MobileToolDrawerTab);
                    }}
                    aria-pressed={isActive}
                    aria-label={item.label}
                    className={`flex-shrink-0 min-w-[46px] sm:min-w-[50px] h-[48px] px-1 flex flex-col items-center justify-center rounded-xl transition-all active:scale-95 ${
                      isActive
                        ? "text-[#00E5FF] bg-[#00E5FF]/10 font-bold border border-[#00E5FF]/40 shadow-[0_0_8px_rgba(0,229,255,0.25)]"
                        : "text-[#9E9EA8] hover:text-white"
                    }`}
                  >
                    <Icon
                      size={18}
                      className={isActive ? "text-[#00E5FF]" : "text-[#C4C4CC]"}
                    />
                    <span
                      className={`text-[10px] mt-0.5 tracking-tight whitespace-nowrap ${
                        isActive
                          ? "text-[#00E5FF] font-bold"
                          : "text-[#A0A0A8] font-medium"
                      }`}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* AI Copilot Quick Action Button */}
            <div className="flex-shrink-0 pl-1 pr-1 border-l border-[#26262E] ml-1">
              <button
                type="button"
                onClick={() => {
                  navigator.vibrate?.(10);
                  onOpenAiCopilot();
                }}
                aria-pressed={isAiSheetOpen}
                aria-label="Open Kreovar AI Copilot"
                className={`min-w-[46px] h-[48px] px-1.5 rounded-xl flex flex-col items-center justify-center transition-all active:scale-95 ${
                  isAiSheetOpen
                    ? "bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/50 shadow-[0_0_10px_rgba(0,229,255,0.35)]"
                    : "text-[#00E5FF] hover:bg-white/5"
                }`}
              >
                <div className="relative">
                  <Sparkles size={18} className="text-[#00E5FF] animate-pulse" />
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#00E5FF] shadow-[0_0_6px_#00E5FF]" />
                </div>
                <span className="text-[10px] mt-0.5 tracking-tight font-semibold text-[#00E5FF]">
                  Copilot
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
