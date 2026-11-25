"use client";

import React from "react";
import { Sparkles } from "lucide-react";
import {
  GRAPHIC_KINDS,
  GRAPHIC_THEMES,
  GRAPHIC_ICONS,
  changeMotionGraphic,
  type GraphicKind,
  type GraphicTheme,
  type GraphicIcon,
} from "@/app/lib/editor/motionGraphics";
import { useProject } from "@/app/lib/editor/store";
import { useEditor } from "./EditorContext";

const KIND_LABELS: Record<GraphicKind, string> = {
  "stat-counter": "Stat Counter",
  "progress-ring": "Progress Ring",
  "bar-chart": "Bar Chart",
  comparison: "Comparison (VS)",
  checklist: "Checklist",
  "step-flow": "Step Flow",
  "lower-third": "Lower Third",
  notification: "Notification",
  "pointer-callout": "Pointer Callout",
  "quote-card": "Quote Card",
  "kinetic-badge": "Kinetic Badge",
  label: "Label",
  stat: "Stat Box",
  callout: "Callout",
};

const THEME_LABELS: Record<GraphicTheme, string> = {
  "clean-light": "Clean Light",
  "frosted-glass": "Frosted Glass",
  "editorial-paper": "Editorial Paper",
  "dark-slate": "Dark Slate",
};

export default function GraphicControls({ clipId }: { clipId: string }) {
  const { store, run } = useEditor();
  const project = useProject(store);
  const clip = project.clips[clipId];
  const graphic = clip?.graphic;

  if (!graphic) return null;

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-slate-500 uppercase font-bold tracking-wider">
          <Sparkles size={12} className="text-violet-600" />
          Motion Graphic
        </span>
        <span className="text-[10px] font-medium text-slate-500">
          {KIND_LABELS[graphic.kind] ?? graphic.kind}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[11px] text-slate-600">Template</span>
          <select
            aria-label="Graphic template"
            value={graphic.kind}
            onChange={(e) =>
              run((p) => changeMotionGraphic(p, clipId, { kind: e.target.value as GraphicKind }))
            }
            className="w-full p-1.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:outline-none"
          >
            {GRAPHIC_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k] ?? k}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[11px] text-slate-600">Theme</span>
          <select
            aria-label="Graphic theme"
            value={graphic.theme ?? "dark-slate"}
            onChange={(e) =>
              run((p) => changeMotionGraphic(p, clipId, { theme: e.target.value as GraphicTheme }))
            }
            className="w-full p-1.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:outline-none"
          >
            {GRAPHIC_THEMES.map((t) => (
              <option key={t} value={t}>
                {THEME_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[11px] text-slate-600">Icon</span>
          <select
            aria-label="Graphic icon"
            value={graphic.icon ?? "none"}
            onChange={(e) =>
              run((p) => changeMotionGraphic(p, clipId, { icon: e.target.value as GraphicIcon }))
            }
            className="w-full p-1.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:outline-none"
          >
            {GRAPHIC_ICONS.map((icon) => (
              <option key={icon} value={icon}>
                {icon}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[11px] text-slate-600">Accent</span>
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1">
            <input
              type="color"
              aria-label="Graphic accent color"
              value={graphic.accent}
              onChange={(e) =>
                run((p) => changeMotionGraphic(p, clipId, { accent: e.target.value }))
              }
              className="w-5 h-5 rounded border border-slate-200 bg-transparent cursor-pointer"
            />
            <span className="font-mono text-[10px] text-slate-700 uppercase">{graphic.accent}</span>
          </div>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-[11px] text-slate-600">Subtitle / Context</span>
        <input
          type="text"
          maxLength={120}
          aria-label="Graphic subtitle"
          value={graphic.subtitle ?? ""}
          placeholder="Optional subtitle or attribution..."
          onChange={(e) =>
            run((p) => changeMotionGraphic(p, clipId, { subtitle: e.target.value }))
          }
          className="w-full p-1.5 rounded-md border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none"
        />
      </label>

      {(graphic.kind === "stat-counter" || graphic.kind === "progress-ring" || graphic.value !== undefined) && (
        <div className="grid grid-cols-3 gap-2">
          <label className="space-y-1">
            <span className="text-[11px] text-slate-600">Prefix</span>
            <input
              type="text"
              maxLength={12}
              value={graphic.prefix ?? ""}
              placeholder="$"
              onChange={(e) =>
                run((p) => changeMotionGraphic(p, clipId, { prefix: e.target.value }))
              }
              className="w-full p-1.5 rounded-md border border-slate-200 bg-white text-xs text-slate-800"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-slate-600">Value</span>
            <input
              type="number"
              value={graphic.value ?? ""}
              placeholder="100"
              onChange={(e) => {
                const v = e.target.value === "" ? undefined : e.target.valueAsNumber;
                if (v === undefined || Number.isFinite(v)) {
                  run((p) => changeMotionGraphic(p, clipId, { value: v }));
                }
              }}
              className="w-full p-1.5 rounded-md border border-slate-200 bg-white text-xs font-mono text-slate-800"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-slate-600">Suffix</span>
            <input
              type="text"
              maxLength={16}
              value={graphic.suffix ?? ""}
              placeholder="%"
              onChange={(e) =>
                run((p) => changeMotionGraphic(p, clipId, { suffix: e.target.value }))
              }
              className="w-full p-1.5 rounded-md border border-slate-200 bg-white text-xs text-slate-800"
            />
          </label>
        </div>
      )}
    </div>
  );
}
