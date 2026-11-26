"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Download,
  Cloud,
  Check,
  LoaderCircle,
  AlertCircle,
  X,
  Keyboard,
  Sparkles,
  SlidersHorizontal,
  Smartphone,
  ChevronDown,
} from "lucide-react";
import BrandMark from "../BrandMark";
import CaptionFonts from "../captions/CaptionFonts";
import ToolSidebar, { EditorToolTab } from "./ToolSidebar";
import AssetDrawer from "./AssetDrawer";
import CanvasStage from "./CanvasStage";
import EditorAIChat from "./EditorAIChat";
import EditorPropertiesInspector from "./EditorPropertiesInspector";
import TimelinePanel from "./TimelinePanel";
import { useEditor } from "./workspace/EditorContext";
import { useProject } from "@/app/lib/editor/store";
import {
  Ratio,
  aspectRatios,
  dimensions,
  projectDuration,
  textForClip,
  defaultStyle,
  type TextStyle,
  type TransitionKind,
} from "@/app/lib/editor/model";
import {
  addTransition,
  removeTransition,
  changeClipProperty,
  changeText,
  duplicateClip,
  removeClip,
  splitClip,
  pasteClips,
  reframeProject,
  trimToPlayhead,
  type ReframeMode,
} from "@/app/lib/editor/operations";
import { setTransformKeyframes, type TransformKeyframe } from "@/app/lib/editor/keyframes";
import { resolveTransitionKind } from "@/app/lib/editor/transitions";
import { changeMotionGraphic, removeMotionGraphic } from "@/app/lib/editor/motionGraphics";
import { applyStudioStyle, studioCaptions } from "@/app/lib/editor/editorCaptionStudio";
import { nudgeClips } from "@/app/lib/editor/timelineNavigation";
import {
  resolveShortcutAction,
  getShuttleNextState,
  splitTopmostUnmutedClipAtPlayhead,
  deleteOrRippleDeleteClips,
  toggleSelectedTrackMute,
  SHORTCUT_DEFINITIONS,
} from "@/app/lib/editor/shortcuts";
import { loadDemoProjectIntoStore } from "@/app/lib/editor/demoProject";

const ExportDialog = dynamic(() => import("./workspace/ExportDialog"), {
  ssr: false,
});

export interface EditorLayoutProps {
  onExit?: () => void;
  persistenceState?: string;
  retrySave?: () => void;
  recoveryMessage?: string;
  dismissRecovery?: () => void;
  notice?: string;
  onDismissNotice?: () => void;
  conflict?: boolean;
  onReloadConflict?: () => void;
}

export default function EditorLayout({
  onExit,
  persistenceState = "saved",
  retrySave,
  recoveryMessage,
  dismissRecovery,
  notice,
  onDismissNotice,
  conflict,
  onReloadConflict,
}: EditorLayoutProps) {
  const { store, playback, selection, select, run, notify } = useEditor();
  const project = useProject(store);

  // Left Sidebar Drawer State
  const [activeTab, setActiveTab] = useState<EditorToolTab>("media");
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);

  // Preview Quality State
  const [previewQuality, setPreviewQuality] = useState<number>(720);

  // Modals
  const [exportOpen, setExportOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [reframeOpen, setReframeOpen] = useState(false);
  const clipboardRef = useRef<{ project: typeof project; ids: string[] } | null>(null);

  // Resizable Bottom Timeline Height (Range: 220px to 450px, default 300px)
  const [timelineHeight, setTimelineHeight] = useState<number>(() => {
    if (typeof window !== "undefined") {
      return Math.max(220, Math.min(380, Math.round(window.innerHeight * 0.32)));
    }
    return 300;
  });

  const clipboard = useRef<{ project: typeof project; ids: string[] } | undefined>(undefined);
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isCompactDesktop, setIsCompactDesktop] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 1360 : false
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1359px)");
    const update = () => setIsCompactDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const handleToggleAi = () => {
      setIsAiChatOpen((prev) => {
        const next = !prev;
        // On compact laptop widths, collapse the asset drawer when opening AI Chat
        // so the video preview stage and transport controls stay completely unclipped.
        if (next && typeof window !== "undefined" && window.innerWidth < 1360) {
          setIsDrawerOpen(false);
        }
        return next;
      });
    };
    window.addEventListener("veelox:toggle-ai-chat", handleToggleAi);
    return () => window.removeEventListener("veelox:toggle-ai-chat", handleToggleAi);
  }, []);

  const selectedClip = selection[0] ? project.clips[selection[0]] : null;

  const toInspectorItem = useCallback((clip: (typeof project.clips)[string], proj: typeof project) => {
    const track = proj.tracks[clip.trackId];
    const layer = textForClip(proj, clip);
    const kindTrack =
      track?.kind === "caption"
        ? "captions"
        : track?.kind === "text"
        ? "text"
        : track?.kind === "audio"
        ? "music"
        : track?.kind === "overlay"
        ? "overlays"
        : "video";
    const srcSpan = Math.max(0.05, clip.sourceEnd - clip.sourceStart);
    const kfs = (clip.keyframes || []).map((kf, idx) => ({
      id: `tf_${idx}_${kf.sourceTime.toFixed(3)}`,
      time: Math.max(0, (kf.sourceTime - clip.sourceStart) / Math.max(clip.speed || 1, 0.1)),
      property: "scale" as const,
      value: kf.value.scale,
      easing: (kf.easing === "ease-out"
        ? "ease_out"
        : kf.easing === "smooth" || kf.easing === "overshoot"
        ? "ease_in_out"
        : "linear") as "linear" | "ease_in" | "ease_out" | "ease_in_out",
      _rawTransform: kf.value,
      _sourceTime: kf.sourceTime,
    }));

    return {
      ...clip,
      track: kindTrack,
      type:
        track?.kind === "caption"
          ? "caption"
          : track?.kind === "text"
          ? "text"
          : track?.kind === "audio"
          ? "music"
          : track?.kind === "overlay"
          ? "broll"
          : "raw",
      endTime: clip.startTime + clip.duration,
      position: {
        x: Math.round((clip.transform?.x ?? 0) * 100),
        y: Math.round((clip.transform?.y ?? 0) * 100),
      },
      scale: clip.transform?.scale ?? 1,
      rotation: clip.transform?.rotation ?? 0,
      opacity: clip.transform?.opacity ?? 1,
      preservePitch: clip.preservePitch ?? true,
      speedCurvePreset: clip.speedCurveId,
      colorAdjustments: {
        brightness: clip.effects?.brightness ?? 0,
        contrast: clip.effects?.contrast ?? 0,
        saturation: clip.effects?.saturation ?? 0,
        exposure: 0,
        temperature: 0,
        tint: 0,
        highlights: 0,
        shadows: 0,
        vignette: clip.effects?.blur ?? 0,
      },
      source: layer?.text ?? clip.name,
      textStyle: layer
        ? {
            fontFamily: layer.style.font,
            fontSize: layer.style.size,
            fontWeight: layer.style.weight,
            color: layer.style.color,
            textAlign: layer.style.align,
            outlineWidth: layer.style.strokeWidth,
            outlineColor: layer.style.stroke,
          }
        : undefined,
      metadata: { sourceDuration: srcSpan },
      keyframes: kfs,
    } as any;
  }, []);

  const inspectorSelectedClip = useMemo(
    () => (selectedClip ? toInspectorItem(selectedClip, project) : null),
    [selectedClip, project, toInspectorItem]
  );

  const timelineForInspector = useMemo(() => ({
    id: project.id,
    title: project.title,
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    duration: projectDuration(project),
    aspectRatio: project.settings.aspectRatio,
    resolution: {
      width: dimensions[project.settings.aspectRatio]?.[0] ?? 1080,
      height: dimensions[project.settings.aspectRatio]?.[1] ?? 1920,
    },
    settings: {
      fps: project.settings.fps,
      audioDucking: project.settings.audioDucking ?? true,
      duckingFactor: 0.35,
      musicVolume: 0.8,
      voiceVolume: 1.0,
      captionPreset: "viral-hinglish-pop",
      captionTemplateId: (project.settings as any)?.captionTemplateId,
      captionPosition: (project.settings as any)?.captionPosition,
    },
    tracks: Object.values(project.tracks).map((t) => ({
      ...t,
      clips: t.clipIds
        .map((id) => project.clips[id])
        .filter(Boolean)
        .map((c) => toInspectorItem(c, project)),
    })) as any,
  } as any), [project, toInspectorItem]);

  const handleUpdateClip = useCallback((updated: any) => {
    run((p) => {
      const existing = p.clips[updated.id];
      if (!existing) return p;

      let next = p;
      const nextTransform = {
        ...existing.transform,
        ...(updated.scale !== undefined ? { scale: updated.scale } : {}),
        ...(updated.rotation !== undefined ? { rotation: updated.rotation } : {}),
        ...(updated.opacity !== undefined ? { opacity: updated.opacity } : {}),
        ...(updated.position
          ? { x: Number(updated.position.x) / 100, y: Number(updated.position.y) / 100 }
          : {}),
      };

      const nextEffects = updated.colorAdjustments
        ? {
            brightness: Number(updated.colorAdjustments.brightness ?? existing.effects.brightness ?? 0),
            contrast: Number(updated.colorAdjustments.contrast ?? existing.effects.contrast ?? 0),
            saturation: Number(updated.colorAdjustments.saturation ?? existing.effects.saturation ?? 0),
            blur: Number(updated.colorAdjustments.vignette ?? existing.effects.blur ?? 0),
          }
        : existing.effects;

      const rawCurve =
        typeof updated.speedCurvePreset === "string"
          ? updated.speedCurvePreset.toLowerCase().replace(/\s+/g, "_")
          : updated.speedCurveId;
      const normalizedCurve =
        rawCurve && ["hero", "bullet", "montage", "jump_cut", "flash_in", "flash_out", "standard"].includes(rawCurve)
          ? (rawCurve as typeof existing.speedCurveId)
          : undefined;

      next = changeClipProperty(next, existing.id, {
        transform: nextTransform,
        effects: nextEffects,
        volume: updated.volume !== undefined ? updated.volume : existing.volume,
        fadeIn: updated.fadeIn !== undefined ? updated.fadeIn : existing.fadeIn,
        fadeOut: updated.fadeOut !== undefined ? updated.fadeOut : existing.fadeOut,
        preservePitch: updated.preservePitch !== undefined ? updated.preservePitch : existing.preservePitch,
        speed: updated.speed !== undefined ? updated.speed : existing.speed,
        speedCurveId: normalizedCurve,
      });

      // Handle Inspector keyframe additions/deletions into real TransformKeyframes
      if (Array.isArray(updated.keyframes) && next.tracks[existing.trackId]?.kind !== "audio") {
        const mergedByTime = new Map<number, TransformKeyframe>();
        for (const kf of updated.keyframes as any[]) {
          const srcTime =
            typeof kf._sourceTime === "number"
              ? kf._sourceTime
              : existing.sourceStart + Math.max(0, Number(kf.time || 0)) * Math.max(existing.speed || 1, 0.1);
          const timeKey = Math.round(srcTime * 10000);
          const prevEntry = mergedByTime.get(timeKey);
          const baseTf = prevEntry
            ? { ...prevEntry.value }
            : kf._rawTransform
            ? { ...kf._rawTransform }
            : { ...nextTransform };
          if (kf.property === "scale") baseTf.scale = Number(kf.value ?? baseTf.scale);
          else if (kf.property === "rotation") baseTf.rotation = Number(kf.value ?? baseTf.rotation);
          else if (kf.property === "opacity") baseTf.opacity = Number(kf.value ?? baseTf.opacity);
          else if (kf.property === "position_x") baseTf.x = Number(kf.value ?? 0) / 100;
          else if (kf.property === "position_y") baseTf.y = Number(kf.value ?? 0) / 100;

          const easing: TransformKeyframe["easing"] =
            kf.easing === "ease_out"
              ? "ease-out"
              : kf.easing === "ease_in_out" || kf.easing === "ease_in"
              ? "smooth"
              : "linear";
          mergedByTime.set(timeKey, { sourceTime: srcTime, value: baseTf, easing });
        }
        next = setTransformKeyframes(next, existing.id, Array.from(mergedByTime.values()));
      }

      // Sync text / caption edits from Inspector
      if (existing.contentId && (updated.source !== undefined || updated.textStyle !== undefined)) {
        const layer = textForClip(next, existing);
        if (layer) {
          const ts = updated.textStyle;
          const stylePatch: Partial<TextStyle> | undefined = ts
            ? {
                ...(ts.fontFamily ? { font: ts.fontFamily } : {}),
                ...(ts.fontSize ? { size: Number(ts.fontSize) } : {}),
                ...(ts.fontWeight ? { weight: Number(ts.fontWeight) } : {}),
                ...(ts.color ? { color: ts.color } : {}),
                ...(ts.textAlign ? { align: ts.textAlign } : {}),
                ...(ts.outlineWidth !== undefined ? { strokeWidth: Number(ts.outlineWidth) } : {}),
                ...(ts.outlineColor ? { stroke: ts.outlineColor } : {}),
              }
            : undefined;
          const nextText = typeof updated.source === "string" ? updated.source : layer.text;
          next = changeText(next, existing.id, nextText, stylePatch || defaultStyle);
        }
      }

      // Sync editable Motion Graphic properties from Inspector
      if (updated.graphic === null && next.clips[existing.id]?.graphic) {
        next = removeMotionGraphic(next, existing.id);
      } else if (updated.graphic && next.clips[existing.id]?.graphic) {
        next = changeMotionGraphic(next, existing.id, updated.graphic);
      }

      // Apply or clear selected transition when changed in Animation tab
      if (updated.transition === "cut") {
        const existingTransition = Object.values(next.transitions).find((t) => t.toClipId === existing.id);
        if (existingTransition) {
          next = removeTransition(next, existingTransition.id);
        }
      } else if (updated.transition) {
        const mappedKind: TransitionKind = resolveTransitionKind(updated.transition) || "dissolve";
        const track = next.tracks[existing.trackId];
        if (track) {
          const sorted = track.clipIds
            .map((id) => next.clips[id])
            .filter(Boolean)
            .sort((a, b) => a.startTime - b.startTime);
          const idx = sorted.findIndex((c) => c.id === existing.id);
          const adjacent = sorted[idx - 1] || sorted[idx + 1];
          if (adjacent) {
            const [from, to] = idx > 0 && sorted[idx - 1] === adjacent ? [adjacent, existing] : [existing, adjacent];
            try {
              next = addTransition(next, from.id, to.id, mappedKind, updated.transitionDuration || 0.45);
            } catch {
              // Ignore if transition cannot be placed on non-adjacent clips
            }
          }
        }
      }

      return next;
    });
  }, [run]);

  const handleUpdateMultipleClips = useCallback(
    (clipIds: string[], updates: any) => {
      if (!clipIds.length) return;
      run((p) => {
        let next = p;
        for (const id of clipIds) {
          const clip = next.clips[id];
          if (!clip || next.tracks[clip.trackId]?.locked) continue;
          next = changeClipProperty(next, id, {
            ...(updates.speed !== undefined ? { speed: updates.speed } : {}),
            ...(updates.volume !== undefined ? { volume: updates.volume } : {}),
            ...(updates.opacity !== undefined
              ? { transform: { ...clip.transform, opacity: updates.opacity } }
              : {}),
          });
        }
        return next;
      });
    },
    [run]
  );

  const handleDeleteMultipleClips = useCallback(
    (clipIds: string[]) => {
      if (!clipIds.length) return;
      run((p) => deleteOrRippleDeleteClips(p, clipIds, { ripple: false }));
      select([]);
      notify(`Deleted ${clipIds.length} clip(s).`);
    },
    [run, select, notify]
  );

  const handleApplyStyleToAllCaptions = useCallback(() => {
    const captions = studioCaptions(project).filter(
      (s) => !project.tracks[project.clips[s.id]?.trackId]?.locked
    );
    const activeClip = selection[0] ? project.clips[selection[0]] : undefined;
    const activeCap = activeClip?.contentId ? project.captions[activeClip.contentId] : undefined;
    if (!captions.length) {
      notify("No unlocked captions found on timeline.");
      return;
    }
    if (activeCap?.studioStyle) {
      run((p) => applyStudioStyle(p, captions.map((c) => c.id), activeCap.studioStyle!));
      notify(`Applied caption style to all ${captions.length} caption(s).`);
    } else {
      notify("Choose a caption template style first.");
    }
  }, [project, selection, run, notify]);

  const handleUpdateSettings = useCallback((settings: any) => {
    run((p) => ({
      ...p,
      settings: { ...p.settings, ...settings },
    }));
  }, [run]);

  const handleUpdateAspectRatio = useCallback((ratio: any) => {
    run((p) => ({
      ...p,
      settings: { ...p.settings, aspectRatio: ratio },
    }));
  }, [run]);

  // Automatically switch tab to inspector if a clip is selected and drawer is open
  useEffect(() => {
    if (selection.length > 0 && isDrawerOpen && activeTab !== "inspector") {
      // Keep user on tab unless they clicked inspector
    }
  }, [selection, isDrawerOpen, activeTab]);

  // Global NLE Keyboard Shortcuts
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const curProject = store.getSnapshot();
      const time = playback.getSnapshot().time;

      const action = resolveShortcutAction(
        {
          key: event.key,
          code: event.code,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          target: event.target,
        },
        { shortcutsOpen, exportOpen }
      );

      if (!action) return;

      switch (action) {
        case "escape": {
          if (shortcutsOpen) {
            event.preventDefault();
            setShortcutsOpen(false);
            return;
          }
          if (exportOpen) {
            event.preventDefault();
            setExportOpen(false);
            return;
          }
          store.cancel();
          select([]);
          break;
        }

        case "toggle-play": {
          event.preventDefault();
          const state = playback.getSnapshot();
          if (state.playing) {
            playback.set(state.time, false, 1);
          } else {
            const dur = projectDuration(curProject);
            playback.set(state.time >= dur ? 0 : state.time, true, 1);
          }
          break;
        }

        case "shuttle-forward": {
          event.preventDefault();
          const state = playback.getSnapshot();
          const next = getShuttleNextState(state.speed ?? 1, state.playing, "forward");
          const dur = projectDuration(curProject);
          playback.set(state.time >= dur && next.playing ? 0 : state.time, next.playing, next.speed);
          notify(next.speed === 2 ? "Shuttle Forward 2x" : "Play Forward 1x");
          break;
        }

        case "shuttle-pause": {
          event.preventDefault();
          const state = playback.getSnapshot();
          const next = getShuttleNextState(state.speed ?? 1, state.playing, "pause");
          playback.set(state.time, next.playing, next.speed);
          notify("Shuttle Paused");
          break;
        }

        case "shuttle-backward": {
          event.preventDefault();
          const state = playback.getSnapshot();
          const next = getShuttleNextState(state.speed ?? 1, state.playing, "backward");
          const dur = projectDuration(curProject);
          playback.set(state.time <= 0 && next.playing ? dur : state.time, next.playing, next.speed);
          notify(next.speed === -2 ? "Shuttle Reverse -2x" : "Shuttle Reverse -1x");
          break;
        }

        case "split-clip": {
          event.preventDefault();
          const result = splitTopmostUnmutedClipAtPlayhead(curProject, time, selection);
          if (result.splitClipId) {
            run(() => result.nextProject);
            notify(result.wasTopmostFallback ? "Split topmost unmuted clip" : "Split selected clip");
          } else {
            notify("Move playhead inside an unlocked clip to split.");
          }
          break;
        }

        case "trim-start-to-playhead": {
          event.preventDefault();
          const result = trimToPlayhead(curProject, "start", time, selection);
          if (result.modifiedClipIds.length > 0) {
            run(() => result.project);
            notify("Trimmed start to playhead ([)");
          } else {
            notify("Move playhead inside an unlocked clip to trim start.");
          }
          break;
        }

        case "trim-end-to-playhead": {
          event.preventDefault();
          const result = trimToPlayhead(curProject, "end", time, selection);
          if (result.modifiedClipIds.length > 0) {
            run(() => result.project);
            notify("Trimmed end to playhead (])");
          } else {
            notify("Move playhead inside an unlocked clip to trim end.");
          }
          break;
        }

        case "delete-clip": {
          if (selection.length) {
            event.preventDefault();
            run((p) => deleteOrRippleDeleteClips(p, selection, { ripple: false }));
            select([]);
            notify(`Deleted ${selection.length} clip(s).`);
          }
          break;
        }

        case "ripple-delete-clip": {
          if (selection.length) {
            event.preventDefault();
            run((p) => deleteOrRippleDeleteClips(p, selection, { ripple: true }));
            select([]);
            notify(`Ripple deleted ${selection.length} clip(s).`);
          }
          break;
        }

        case "toggle-mute": {
          event.preventDefault();
          const result = toggleSelectedTrackMute(curProject, selection);
          if (result.trackId) {
            run(() => result.project);
            const trackName = curProject.tracks[result.trackId]?.name || "Track";
            notify(`${result.muted ? "Muted" : "Unmuted"} ${trackName}`);
          }
          break;
        }

        case "undo": {
          event.preventDefault();
          store.undo();
          break;
        }

        case "redo": {
          event.preventDefault();
          store.redo();
          break;
        }

        case "save": {
          event.preventDefault();
          retrySave?.();
          break;
        }

        case "select-all": {
          event.preventDefault();
          select(
            Object.keys(curProject.clips).filter(
              (id) => !curProject.tracks[curProject.clips[id].trackId]?.locked
            )
          );
          break;
        }

        case "nudge-left":
        case "nudge-right": {
          if (selection.length) {
            event.preventDefault();
            run((p) =>
              nudgeClips(p, selection, (action === "nudge-right" ? 1 : -1) * (event.shiftKey ? 10 : 1))
            );
          }
          break;
        }

        case "step-backward":
        case "step-forward": {
          event.preventDefault();
          const dur = projectDuration(curProject);
          const delta = ((action === "step-forward" ? 1 : -1) * (event.shiftKey ? 10 : 1)) / curProject.settings.fps;
          playback.set(Math.max(0, Math.min(dur, time + delta)), false);
          break;
        }

        case "duplicate-clip": {
          if (selection.length) {
            event.preventDefault();
            run((p) => selection.reduce((next, id) => duplicateClip(next, id), p));
          }
          break;
        }

        case "copy-clips": {
          if (selection.length) {
            event.preventDefault();
            clipboardRef.current = { project: curProject, ids: [...selection] };
            notify(`Copied ${selection.length} clip(s).`);
          }
          break;
        }

        case "paste-clips": {
          if (clipboardRef.current?.ids.length) {
            event.preventDefault();
            try {
              run((p) => pasteClips(p, clipboardRef.current!.project, clipboardRef.current!.ids, time));
              notify(`Pasted ${clipboardRef.current.ids.length} clip(s).`);
            } catch (err) {
              notify(err instanceof Error ? err.message : "Paste failed.");
            }
          }
          break;
        }

        case "toggle-shortcuts-modal": {
          event.preventDefault();
          setShortcutsOpen((prev) => !prev);
          break;
        }

        case "toggle-snapping": {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent("veelox:toggle-snapping"));
          break;
        }

        case "fit-timeline": {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent("veelox:fit-timeline"));
          break;
        }

        case "zoom-in": {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent("veelox:timeline-zoom", { detail: "in" }));
          break;
        }

        case "zoom-out": {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent("veelox:timeline-zoom", { detail: "out" }));
          break;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [store, playback, selection, run, notify, select, retrySave, exportOpen, shortcutsOpen]);

  // Timeline resize drag gesture
  const handleTimelineResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const startY = event.clientY;
    const initialHeight = timelineHeight;

    const onPointerMove = (e: PointerEvent) => {
      const delta = startY - e.clientY;
      const nextHeight = Math.max(200, Math.min(window.innerHeight * 0.55, initialHeight + delta));
      setTimelineHeight(Math.round(nextHeight));
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerUp, { once: true });
  };

  const handleToolTabSelect = (tab: EditorToolTab) => {
    if (activeTab === tab && isDrawerOpen) {
      // Toggle drawer closed on second click of active tab
      setIsDrawerOpen(false);
    } else {
      setActiveTab(tab);
      setIsDrawerOpen(true);
    }
  };

  return (
    <div className="hidden md:flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 flex-col font-sans select-none antialiased">
      <CaptionFonts />

      {/* ========================================================================= */}
      {/* 1. TOP NAVIGATION BAR (CapCut Desktop Studio UI - Clean White Theme)     */}
      {/* ========================================================================= */}
      <header className="h-14 bg-white border-b border-slate-200 px-3 flex items-center justify-between gap-2 flex-shrink-0 z-30 select-none text-slate-900 overflow-x-auto overflow-y-hidden scrollbar-none">
        {/* Left: Back, Brand, Export (Upper Left Corner), Project Title, Save State */}
        <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
          {onExit && (
            <button
              onClick={onExit}
              title="Back to Projects"
              aria-label="Back to Projects"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            >
              <ArrowLeft size={16} />
            </button>
          )}

          <div className="flex items-center gap-2 font-bold text-sm text-slate-900 shrink-0">
            <BrandMark size={26} />
            <span className="tracking-tight hidden lg:inline">Kreovar</span>
          </div>

          {/* Prominent Light Blue Export Button on Upper Left Corner */}
          <button
            onClick={() => setExportOpen(true)}
            disabled={!projectDuration(project)}
            title="Export Video"
            className="bg-sky-500 hover:bg-sky-600 text-white font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-40 active:scale-95 text-xs cursor-pointer ml-1 shrink-0"
          >
            <Download size={14} className="stroke-[2.5]" />
            <span>Export</span>
          </button>

          <div className="h-4 w-[1px] bg-slate-200 shrink-0" />

          {/* Editable Project Title Input */}
          <input
            value={project.title}
            aria-label="Project Title"
            onFocus={() => store.begin()}
            onChange={(e) =>
              store.preview((p) => ({ ...p, title: e.target.value }))
            }
            onBlur={() => {
              if (!store.getSnapshot().title.trim()) {
                store.preview((p) => ({ ...p, title: "Untitled video" }));
              }
              store.commit();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200 focus:border-sky-500 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-900 outline-none w-28 lg:w-44 xl:w-56 truncate transition-colors placeholder-slate-400"
          />

          {/* Cloud Auto-Save Status Indicator */}
          <button
            onClick={retrySave}
            title="Save status / Click to sync with cloud"
            className="flex items-center gap-1.5 text-[11px] font-mono text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer shrink-0"
          >
            {persistenceState === "saving" || persistenceState === "loading" ? (
              <LoaderCircle size={12} className="animate-spin text-sky-500" />
            ) : persistenceState === "failed" ? (
              <AlertCircle size={12} className="text-rose-500" />
            ) : (
              <Check size={12} className="text-sky-600" />
            )}
            <span className="hidden lg:inline">
              {
                {
                  saved: "Saved",
                  local: "Local",
                  saving: "Saving…",
                  unsaved: "Unsaved",
                  failed: "Save Failed",
                  loading: "Syncing…",
                }[persistenceState] || "Saved"
              }
            </span>
          </button>
        </div>

        {/* Right: Keyboard Shortcuts Help, Undo/Redo, Single Aspect Ratio Selector, Preview Quality */}
        <div className="flex items-center gap-1.5 lg:gap-2 flex-shrink-0">
          {/* Keyboard Shortcuts Help Button */}
          <button
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard Shortcuts (?)"
            aria-label="Keyboard Shortcuts"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <Keyboard size={15} />
          </button>

          {/* Undo */}
          <button
            disabled={!store.canUndo}
            onClick={() => store.undo()}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-25 disabled:hover:bg-transparent transition-colors cursor-pointer"
          >
            <Undo2 size={15} />
          </button>

          {/* Redo */}
          <button
            disabled={!store.canRedo}
            onClick={() => store.redo()}
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-25 disabled:hover:bg-transparent transition-colors cursor-pointer"
          >
            <Redo2 size={15} />
          </button>

          <div className="h-4 w-[1px] bg-slate-200 mx-1" />

          {/* Single Aspect Ratio Selector (9:16, 16:9, 1:1, 4:5, 4:3) */}
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900">
            <span className="text-slate-500 mr-1.5 font-medium hidden sm:inline">Ratio</span>
            <select
              value={project.settings.aspectRatio}
              aria-label="Video Aspect Ratio"
              onChange={(e) =>
                run((p) => ({
                  ...p,
                  settings: {
                    ...p.settings,
                    aspectRatio: e.target.value as Ratio,
                  },
                }))
              }
              className="bg-transparent text-slate-900 text-xs font-semibold focus:outline-none cursor-pointer"
            >
              {aspectRatios.map((ratio) => (
                <option key={ratio} value={ratio} className="bg-white text-slate-900">
                  {ratio} ·{" "}
                  {
                    {
                      "9:16": "Portrait (9:16)",
                      "16:9": "Widescreen (16:9)",
                      "1:1": "Square (1:1)",
                      "4:5": "Social (4:5)",
                      "4:3": "Classic (4:3)",
                    }[ratio]
                  }
                </option>
              ))}
            </select>
          </div>

          {/* Preview Quality Selector */}
          <select
            value={previewQuality}
            onChange={(e) => setPreviewQuality(Number(e.target.value))}
            aria-label="Preview Resolution"
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:outline-none focus:border-sky-500 cursor-pointer hidden sm:block"
          >
            <option value={540} className="bg-white text-slate-800">540p Draft</option>
            <option value={720} className="bg-white text-slate-800">720p HD</option>
            <option value={1080} className="bg-white text-slate-800">1080p FHD</option>
          </select>
        </div>
      </header>

      {/* Recovery / Conflict / Notice Banners */}
      {recoveryMessage && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-1.5 flex items-center justify-between text-xs text-blue-800 z-30">
          <span>{recoveryMessage}</span>
          <button onClick={dismissRecovery} className="p-0.5 text-slate-500 hover:text-slate-900 cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}
      {(notice || conflict) && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 flex items-center justify-between text-xs text-amber-900 z-30">
          <span>
            {conflict
              ? "This project was saved in another window. Cloud autosave paused to protect your edit."
              : notice}
          </span>
          {conflict ? (
            <button
              onClick={onReloadConflict}
              className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-0.5 rounded font-semibold cursor-pointer"
            >
              Reload Saved
            </button>
          ) : (
            <button onClick={onDismissNotice} className="p-0.5 text-amber-600 hover:text-amber-900 cursor-pointer">
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MIDDLE REGION: MEDIA HUB + INSPECTOR + PREVIEW + AI EDITOR             */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden relative bg-slate-100">
        {/* Left: Mini-Bar Tool Navigation (Width: 64px) */}
        <ToolSidebar
          activeTab={activeTab}
          onSelectTab={handleToolTabSelect}
          isDrawerOpen={isDrawerOpen}
          onToggleDrawer={() => setIsDrawerOpen(!isDrawerOpen)}
          hasSelection={selection.length > 0}
          onOpenShortcuts={() => setShortcutsOpen(true)}
        />

        {/* Collapsible Secondary Tool Drawer (Width: 320px) */}
        {isDrawerOpen && (
          <AssetDrawer
            activeTab={activeTab}
            onClose={() => setIsDrawerOpen(false)}
          />
        )}

        {/* Center-Left: CapCut Properties Inspector (Video | Audio | Speed | Animation | Adjust) */}
        <div
          className={`${
            isInspectorOpen ? "w-[276px] xl:w-[320px]" : "w-12"
          } flex-shrink-0 h-full bg-white border-r border-slate-200 overflow-hidden z-10 flex flex-col transition-all duration-150`}
        >
          <EditorPropertiesInspector
            timeline={timelineForInspector}
            selectedClip={inspectorSelectedClip}
            selectedClipIds={selection}
            playback={playback}
            width={isInspectorOpen ? (isCompactDesktop ? 276 : 320) : 48}
            isOpen={isInspectorOpen}
            onToggleOpen={() => setIsInspectorOpen((prev) => !prev)}
            onUpdateClip={handleUpdateClip}
            onUpdateMultipleClips={handleUpdateMultipleClips}
            onDeleteMultipleClips={handleDeleteMultipleClips}
            onUpdateSettings={handleUpdateSettings}
            onUpdateAspectRatio={handleUpdateAspectRatio}
            onApplyStyleToAllCaptions={handleApplyStyleToAllCaptions}
            onSeek={(t) =>
              playback.set(
                Math.max(0, Math.min(projectDuration(store.getSnapshot()), t)),
                false
              )
            }
          />
        </div>

        {/* Center-Right: Video Preview Canvas Stage */}
        <CanvasStage quality={previewQuality} />

        {/* Right Slide-Over: Conversational AI Editor (Toggled via AI Editor button) */}
        {isAiChatOpen && (
          <EditorAIChat onClose={() => setIsAiChatOpen(false)} />
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. RESIZER HANDLE FOR TIMELINE                                            */}
      {/* ========================================================================= */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize timeline height"
        tabIndex={0}
        onPointerDown={handleTimelineResize}
        onDoubleClick={() => setTimelineHeight(300)}
        className="h-2 w-full bg-slate-200 hover:bg-slate-300 border-t border-b border-slate-300 cursor-row-resize flex items-center justify-center transition-colors group z-20"
      >
        <div className="w-10 h-1 bg-slate-400 group-hover:bg-slate-600 rounded-full transition-colors" />
      </div>

      {/* ========================================================================= */}
      {/* 4. BOTTOM REGION: RESIZABLE MULTI-TRACK TIMELINE (280px-360px)            */}
      {/* ========================================================================= */}
      <div className="flex-shrink-0" style={{ height: `${timelineHeight}px` }}>
        <TimelinePanel height={timelineHeight} />
      </div>

      {/* Export Modal */}
      {exportOpen && <ExportDialog close={() => setExportOpen(false)} />}

      {/* Keyboard Shortcuts Dialog */}
      {shortcutsOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShortcutsOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl text-slate-800 space-y-4 max-h-[88vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Keyboard size={20} className="text-slate-500" />
                <div>
                  <h2 id="shortcuts-title" className="font-semibold text-sm text-slate-900">
                    NLE Keyboard Shortcuts &amp; Navigation
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Pro CapCut Studio editing workflows (Split, Trim, Magnetic Ripple, Snapping).
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShortcutsOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 pr-1 flex-1">
              {(
                [
                  "Playback & Shuttle",
                  "Editing & Split",
                  "Tracks & Audio",
                  "History & Clipboard",
                  "Navigation & View",
                ] as const
              ).map((category) => {
                const items = SHORTCUT_DEFINITIONS.filter((d) => d.category === category);
                if (!items.length) return null;
                return (
                  <div key={category} className="space-y-1.5">
                    <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      {category}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {items.map((def) => (
                        <div
                          key={def.id}
                          className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-slate-800 text-[11px] font-medium font-sans truncate">
                              {def.label}
                            </div>
                            <div className="text-slate-400 text-[10px] truncate">
                              {def.description}
                            </div>
                          </div>
                          <span className="text-slate-700 font-mono font-bold text-[10px] bg-white border border-slate-200 px-2 py-0.5 rounded shadow-2xs whitespace-nowrap shrink-0">
                            {def.keys}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-200 pt-3 flex items-center justify-between flex-shrink-0 text-[11px] text-slate-500">
              <span>On macOS, use ⌘ Command instead of Ctrl.</span>
              <button
                type="button"
                onClick={() => {
                  loadDemoProjectIntoStore(store);
                  setShortcutsOpen(false);
                  notify("Loaded 15-second creator demo project.");
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold border border-slate-200 transition-colors cursor-pointer"
              >
                <Sparkles size={13} />
                <span>Try Demo Project</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
