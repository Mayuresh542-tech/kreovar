"use client";

import React from "react";
import {
  Folder,
  Captions,
  Clapperboard,
  Music,
  Type,
  Split,
  Wand2,
  Settings2,
  SlidersHorizontal,
  Keyboard,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from "lucide-react";

export type EditorToolTab =
  | "media"
  | "audio"
  | "text"
  | "captions"
  | "graphics"
  | "broll"
  | "transitions"
  | "filters"
  | "silence"
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

/**
 * CapCut Desktop Studio Tools Hub:
 * Category tabs: Media, Audio, Text, Captions, B-Roll, Transitions, Filters
 */
const TOOLS: ToolItem[] = [
  {
    id: "media",
    label: "Media",
    icon: Folder,
    description: "User uploads, footage, and project assets",
  },
  {
    id: "audio",
    label: "Audio",
    icon: Music,
    description: "Sound effects, background music, voiceover",
  },
  {
    id: "text",
    label: "Text",
    icon: Type,
    description: "Title templates, lower thirds, typography presets",
  },
  {
    id: "captions",
    label: "Captions",
    icon: Captions,
    description: "Caption Studio templates, kinetic text, and styles",
  },
  {
    id: "graphics",
    label: "Graphics",
    icon: Sparkles,
    description: "18 editable animated charts, lower-thirds, callouts & infographics",
  },
  {
    id: "broll",
    label: "B-Roll",
    icon: Clapperboard,
    description: "Smart B-roll search and stock footage",
  },
  {
    id: "transitions",
    label: "Transitions",
    icon: Split,
    description: "Dissolve, wipes, zoom, motion cut transitions",
  },
  {
    id: "filters",
    label: "Filters",
    icon: Wand2,
    description: "Color grading profiles, camera punch-in zooms, LUTs",
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
      className="w-16 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col items-center justify-between pt-2.5 pb-2 select-none z-30 shadow-xs h-full min-h-0 overflow-hidden"
      aria-label="Primary Editor Tool Navigation"
    >
      {/* Top Tools List (Scrollable on shorter laptop screens so lower buttons never clip) */}
      <nav
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin flex flex-col items-center gap-1.5 w-full px-1.5 pb-2"
        aria-label="Tool Tabs"
      >
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
              className={`w-full h-11 shrink-0 flex flex-col items-center justify-center rounded-xl transition-all relative group cursor-pointer ${
                isActive
                  ? "bg-sky-50 text-sky-700 font-bold border border-sky-200 shadow-2xs"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-2 bottom-2 w-[3px] bg-sky-500 rounded-r" />
              )}
              <Icon
                size={18}
                className={`transition-transform group-hover:scale-105 ${
                  isActive ? "text-sky-600" : "text-slate-500 group-hover:text-slate-900"
                }`}
              />
              <span
                className={`text-[9.5px] mt-0.5 tracking-tight truncate max-w-[54px] ${
                  isActive ? "text-sky-700 font-bold" : "text-slate-500 font-medium group-hover:text-slate-900"
                }`}
              >
                {tool.label}
              </span>
            </button>
          );
        })}

        {/* Inspector Button */}
        <button
          onClick={() => onSelectTab("inspector")}
          title="Inspector — Adjust selected clip properties"
          aria-label="Clip Inspector"
          aria-pressed={isDrawerOpen && activeTab === "inspector"}
          className={`w-full h-11 shrink-0 flex flex-col items-center justify-center rounded-xl transition-all relative group cursor-pointer mt-1 ${
            isDrawerOpen && activeTab === "inspector"
              ? "bg-sky-50 text-sky-700 font-bold border border-sky-200 shadow-2xs"
              : hasSelection
              ? "text-sky-600 bg-sky-50/60 hover:bg-sky-100/80 border border-sky-200"
              : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          {isDrawerOpen && activeTab === "inspector" && (
            <div className="absolute left-0 top-2 bottom-2 w-[3px] bg-sky-500 rounded-r" />
          )}
          <SlidersHorizontal
            size={18}
            className={
              isDrawerOpen && activeTab === "inspector"
                ? "text-sky-600"
                : hasSelection
                ? "text-sky-600"
                : "text-slate-500 group-hover:text-slate-900"
            }
          />
          <span
            className={`text-[9.5px] mt-0.5 tracking-tight ${
              isDrawerOpen && activeTab === "inspector"
                ? "text-sky-700 font-bold"
                : hasSelection
                ? "text-sky-600 font-semibold"
                : "text-slate-500 font-medium group-hover:text-slate-900"
            }`}
          >
            Inspector
          </span>
          {hasSelection && (
            <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-sky-500 ring-2 ring-white" />
          )}
        </button>

        {/* Settings Button */}
        <button
          onClick={() => onSelectTab("settings")}
          title="Project Settings"
          aria-label="Project Settings"
          aria-pressed={isDrawerOpen && activeTab === "settings"}
          className={`w-full h-10 shrink-0 flex flex-col items-center justify-center rounded-xl transition-all relative group cursor-pointer ${
            isDrawerOpen && activeTab === "settings"
              ? "bg-sky-50 text-sky-700 font-bold border border-sky-200 shadow-2xs"
              : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <Settings2
            size={17}
            className={
              isDrawerOpen && activeTab === "settings"
                ? "text-sky-600"
                : "text-slate-500 group-hover:text-slate-900"
            }
          />
          <span
            className={`text-[9px] mt-0.5 tracking-tight ${
              isDrawerOpen && activeTab === "settings"
                ? "text-sky-700 font-bold"
                : "text-slate-500 font-medium group-hover:text-slate-900"
            }`}
          >
            Settings
          </span>
        </button>
      </nav>

      {/* Bottom Actions: Drawer Toggle & Keyboard Shortcuts */}
      <div className="flex-shrink-0 flex flex-col items-center gap-1.5 w-full px-1.5 border-t border-slate-200 pt-2 bg-white">
        {/* Toggle Expand / Collapse Drawer */}
        <button
          onClick={onToggleDrawer}
          title={isDrawerOpen ? "Collapse Tool Drawer" : "Expand Tool Drawer"}
          aria-label={isDrawerOpen ? "Collapse Tool Drawer" : "Expand Tool Drawer"}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          {isDrawerOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        </button>

        {/* Keyboard Shortcuts Help */}
        {onOpenShortcuts && (
          <button
            onClick={onOpenShortcuts}
            title="Keyboard Shortcuts (?)"
            aria-label="Keyboard Shortcuts"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <Keyboard size={17} />
          </button>
        )}
      </div>
    </aside>
  );
}
