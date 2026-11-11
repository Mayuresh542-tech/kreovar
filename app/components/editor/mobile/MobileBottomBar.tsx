"use client";

import React from "react";
import {
  Scissors,
  Captions,
  Clapperboard,
  AudioLines,
  Sparkles,
} from "lucide-react";

export type MobileToolDrawerTab = "edit" | "captions" | "broll" | "audio";

interface MobileBottomBarProps {
  activeDrawer: MobileToolDrawerTab | null;
  isAiSheetOpen: boolean;
  onSelectDrawer: (tab: MobileToolDrawerTab) => void;
  onOpenAiCopilot: () => void;
  hasSelection?: boolean;
}

export default function MobileBottomBar({
  activeDrawer,
  isAiSheetOpen,
  onSelectDrawer,
  onOpenAiCopilot,
  hasSelection = false,
}: MobileBottomBarProps) {
  const leftItems: {
    id: MobileToolDrawerTab;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
  }[] = [
    { id: "edit", label: "Edit", icon: Scissors },
    { id: "captions", label: "Captions", icon: Captions },
  ];

  const rightItems: {
    id: MobileToolDrawerTab;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
  }[] = [
    { id: "broll", label: "B-Roll", icon: Clapperboard },
    { id: "audio", label: "Audio", icon: AudioLines },
  ];

  const renderToolBtn = (item: (typeof leftItems)[number]) => {
    const Icon = item.icon;
    const isActive = activeDrawer === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => {
          navigator.vibrate?.(6);
          onSelectDrawer(item.id);
        }}
        aria-pressed={isActive}
        aria-label={item.label}
        className={`relative min-w-[48px] min-h-[44px] px-2 py-1 flex flex-col items-center justify-center rounded-xl transition-colors active:scale-95 ${
          isActive
            ? "text-blue-600 bg-blue-50 font-semibold"
            : "text-slate-500 hover:text-slate-900"
        }`}
      >
        <Icon size={18} />
        <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
        {item.id === "edit" && hasSelection && (
          <span className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-emerald-500" />
        )}
      </button>
    );
  };

  return (
    <nav
      className="flex-shrink-0 w-full bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)] z-30 select-none"
      aria-label="Mobile Editor Tool Dock"
    >
      <div className="h-[56px] flex items-center justify-around px-2">
        {leftItems.map(renderToolBtn)}

        {/* Floating Glowing Circular AI Copilot Action Button */}
        <button
          type="button"
          onClick={() => {
            navigator.vibrate?.(10);
            onOpenAiCopilot();
          }}
          aria-pressed={isAiSheetOpen}
          aria-label="Open Kreovar AI Copilot"
          className={`min-w-[50px] min-h-[50px] w-[50px] h-[50px] -mt-4 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg shadow-blue-600/25 text-white flex items-center justify-center ring-4 ring-white transition-transform active:scale-90 ${
            isAiSheetOpen ? "scale-105 ring-blue-100" : ""
          }`}
        >
          <Sparkles size={21} />
        </button>

        {rightItems.map(renderToolBtn)}
      </div>
    </nav>
  );
}
