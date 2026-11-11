"use client";

import React from "react";
import {
  Folder,
  Captions,
  Clapperboard,
  AudioLines,
  Wand2,
  Settings2,
  SlidersHorizontal,
  Keyboard,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

export type EditorToolTab =
  | "media"
  | "captions"
  | "broll"
  | "audio"
  | "effects"
  | "settings"
  | "inspector";

interface ToolSidebarProps {
  activeTab: EditorToolTab | null;
  onSelectTab: (tab: EditorToolTab) => void;
  isDrawerOpen: boolean;
  onToggleDrawer: () => void;
  hasSelection?: boolean;
  onOpenShortcuts?: () => void;
}

interface ToolItem {
  id: EditorToolTab;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  description: string;
}

const TOOLS: ToolItem[] = [
  {
    id: "media",
    label: "Media",
    icon: Folder,
    description: "User uploads, raw A-roll footage",
  },
  {
    id: "captions",
    label: "Captions",
    icon: Captions,
    description: "Caption Studio templates & styles",
  },
  {
    id: "broll",
    label: "B-Roll",
    icon: Clapperboard,
    description: "Smart stock footage search",
  },
  {
    id: "audio",
    label: "Audio & SFX",
    icon: AudioLines,
    description: "Sound effects, background music, voice",
  },
  {
    id: "effects",
    label: "Effects",
    icon: Wand2,
    description: "Punch-in zooms & transitions",
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings2,
    description: "Resolution, FPS, base revision",
  },
];

export default function ToolSidebar({
  activeTab,
  onSelectTab,
  isDrawerOpen,
  onToggleDrawer,
  hasSelection = false,
  onOpenShortcuts,
}: ToolSidebarProps) {
  return (
    <aside
      className="w-16 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col items-center justify-between py-3 select-none z-30"
      aria-label="Primary Editor Tool Navigation"
    >
      {/* Top Tools List */}
      <nav className="flex flex-col items-center gap-2 w-full px-1.5" aria-label="Tool Tabs">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isActive = isDrawerOpen && activeTab === tool.id;

          return (
            <button
              key={tool.id}
              onClick={() => onSelectTab(tool.id)}
              title={`${tool.label} — ${tool.description}`}
              aria-label={tool.label}
              aria-pressed={isActive}
              className={`w-full h-12 flex flex-col items-center justify-center rounded-xl transition-all relative group ${
                isActive
                  ? "bg-blue-50 text-blue-600 font-semibold border border-blue-200 shadow-xs"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              {/* Active Pill Indicator */}
              {isActive && (
                <div className="absolute left-0 top-2 bottom-2 w-1 bg-blue-600 rounded-r-full" />
              )}
              <Icon size={19} className="transition-transform group-hover:scale-105" />
              <span className="text-[10px] mt-1 tracking-tight truncate max-w-[54px]">
                {tool.label}
              </span>
            </button>
          );
        })}

        {/* Inspector Button (Highlighted if clip selected) */}
        <button
          onClick={() => onSelectTab("inspector")}
          title="Inspector — Adjust selected clip properties"
          aria-label="Clip Inspector"
          aria-pressed={isDrawerOpen && activeTab === "inspector"}
          className={`w-full h-12 flex flex-col items-center justify-center rounded-xl transition-all relative group mt-1 ${
            isDrawerOpen && activeTab === "inspector"
              ? "bg-blue-50 text-blue-600 font-semibold border border-blue-200 shadow-xs"
              : hasSelection
              ? "text-emerald-700 bg-emerald-50/70 hover:bg-emerald-50 border border-emerald-200/70"
              : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          {isDrawerOpen && activeTab === "inspector" && (
            <div className="absolute left-0 top-2 bottom-2 w-1 bg-blue-600 rounded-r-full" />
          )}
          <SlidersHorizontal size={19} />
          <span className="text-[10px] mt-1 tracking-tight">Inspector</span>
          {hasSelection && (
            <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
          )}
        </button>
      </nav>

      {/* Bottom Actions: Drawer Toggle & Keyboard Shortcuts */}
      <div className="flex flex-col items-center gap-2 w-full px-1.5 border-t border-slate-200 pt-3">
        {/* Toggle Expand / Collapse Drawer */}
        <button
          onClick={onToggleDrawer}
          title={isDrawerOpen ? "Collapse Tool Drawer" : "Expand Tool Drawer"}
          aria-label={isDrawerOpen ? "Collapse Tool Drawer" : "Expand Tool Drawer"}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          {isDrawerOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>

        {/* Keyboard Shortcuts Dialog Trigger */}
        {onOpenShortcuts && (
          <button
            onClick={onOpenShortcuts}
            title="Keyboard Shortcuts (?)"
            aria-label="Keyboard Shortcuts"
            className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <Keyboard size={18} />
          </button>
        )}
      </div>
    </aside>
  );
}
