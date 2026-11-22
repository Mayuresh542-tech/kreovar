"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  X,
  Scissors,
  Copy,
  Trash2,
  Upload,
  Search,
  Play,
  Pause,
  Plus,
  Sparkles,
  Film,
  Music,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Check,
  LoaderCircle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowUp,
  ArrowDown,
  Target,
  Shield,
  Layers,
} from "lucide-react";
import type { MobileToolDrawerTab } from "./MobileBottomBar";
import { useEditor } from "../workspace/EditorContext";
import { usePlayback, useProject } from "@/app/lib/editor/store";
import {
  canPlace,
  MediaAsset,
  uid,
} from "@/app/lib/editor/model";
import {
  addAsset,
  addCaption,
  addClip,
  addTrack,
  changeClipProperty,
  duplicateClip,
  moveClip,
  removeClip,
  splitClip,
  reframeProject,
} from "@/app/lib/editor/operations";
import { importMedia } from "@/app/lib/editor/media";
import { BUILTIN_SFX } from "@/app/lib/assets/builtinSfx";
import { CURATED_MUSIC_TRACKS, MusicTrackItem } from "@/app/lib/timeline/musicTracks";
import { DEFAULT_CAPTION_TEMPLATES } from "@/app/lib/captions/templates";
import { REFERENCE_CAPTION_TEMPLATES } from "@/app/lib/captions/referenceTemplates";
import {
  applyStudioStyle,
  studioCaptions,
  studioTemplate,
} from "@/app/lib/editor/editorCaptionStudio";
import CaptionStylePreview from "../../captions/CaptionStylePreview";
import SilenceTrimmerControls from "../workspace/SilenceTrimmerControls";
import { supabase } from "@/app/lib/supabase";
import { uploadAssetFile, linkAsset } from "@/app/lib/assets/client";
import { mediaFilename } from "@/app/lib/media/download";

type ScriptMode = "hinglish" | "hindi" | "english";

interface MobileDrawerSheetProps {
  activeTab: MobileToolDrawerTab | null;
  onClose: () => void;
}

export default function MobileDrawerSheet({
  activeTab,
  onClose,
}: MobileDrawerSheetProps) {
  const { store, playback, scope, authToken, selection, select, run, notify } =
    useEditor();
  const project = useProject(store);
  const { time } = usePlayback(playback);

  const [expanded, setExpanded] = useState(false); // false = 50dvh, true = 75dvh
  const [translateY, setTranslateY] = useState(0);
  const dragStartYRef = useRef<number | null>(null);

  // Captions tab state
  const [scriptMode, setScriptMode] = useState<ScriptMode>("hinglish");
  const [activeCaptionId, setActiveCaptionId] = useState<string>("study-hormozi-style");
  const [captionPlacement, setCaptionPlacement] = useState<"top" | "center" | "bottom">("bottom");
  const [captionAlign, setCaptionAlign] = useState<"left" | "center" | "right">("center");
  const [captionSize, setCaptionSize] = useState<"sm" | "md" | "lg">("md");

  // Audio tab state
  const [audioCategory, setAudioCategory] = useState<string>("All");
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [sfxAlignment, setSfxAlignment] = useState<"playhead" | "nearest_cut" | "caption">("playhead");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // B-Roll tab state
  const [brollQuery, setBrollQuery] = useState("");
  const [brollResults, setBrollResults] = useState<
    { id: string; thumbnail: string; videoUrl: string; duration: number; creatorName: string }[]
  >([]);
  const [brollBusy, setBrollBusy] = useState(false);
  const [brollDurationPreset, setBrollDurationPreset] = useState<"cut" | "scene" | "full">("cut");
  const [brollFraming, setBrollFraming] = useState<"cover" | "pip">("cover");

  // Media upload state
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioUploadRef = useRef<HTMLInputElement>(null);

  // Reset sheet translate on open
  useEffect(() => {
    setTranslateY(0);
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingAudioId(null);
    };
  }, [activeTab]);

  // Curated + reference caption templates
  const captionCatalog = useMemo(() => {
    const featuredIds = [
      "study-hormozi-style",
      "study-ali-abdaal",
      "study-mr-beast-style-2",
      "study-thora-cinematic",
      "viral-hinglish-pop",
      "study-clean-motion",
      "liquid-glass",
      "deep-glow",
    ];
    const all = [...REFERENCE_CAPTION_TEMPLATES, ...DEFAULT_CAPTION_TEMPLATES];
    const featured = featuredIds
      .map((id) => all.find((t) => t.id === id))
      .filter((t): t is NonNullable<typeof t> => !!t);
    const rest = all.filter((t) => !featuredIds.includes(t.id)).slice(0, 16);
    return [...featured, ...rest];
  }, []);

  // Currently selected clip or clip under playhead
  const activeClip = useMemo(() => {
    if (selection[0] && project.clips[selection[0]]) {
      return project.clips[selection[0]];
    }
    return Object.values(project.clips).find(
      (c) => time >= c.startTime && time <= c.startTime + c.duration
    );
  }, [selection, project.clips, time]);

  if (!activeTab) return null;

  // Swipe-down gesture on top drag handle
  const onHandleTouchStart = (e: React.TouchEvent) => {
    dragStartYRef.current = e.touches[0].clientY;
  };
  const onHandleTouchMove = (e: React.TouchEvent) => {
    if (dragStartYRef.current === null) return;
    const delta = e.touches[0].clientY - dragStartYRef.current;
    if (delta > 0) {
      setTranslateY(delta);
    } else if (delta < -40 && !expanded) {
      setExpanded(true);
      dragStartYRef.current = null;
      setTranslateY(0);
    }
  };
  const onHandleTouchEnd = () => {
    if (translateY > 90) {
      onClose();
    }
    setTranslateY(0);
    dragStartYRef.current = null;
  };

  // Apply Caption Preset immediately on preview with placement compliance
  const handleSelectCaptionPreset = (templateId: string) => {
    setActiveCaptionId(templateId);
    navigator.vibrate?.(8);
    const tpl = studioTemplate(templateId) || captionCatalog.find((c) => c.id === templateId);
    if (!tpl) return;

    const yPercent = captionPlacement === "top" ? 16 : captionPlacement === "bottom" ? 76 : 48;
    const fontSize = captionSize === "sm" ? 44 : captionSize === "lg" ? 68 : 56;
    const mergedStyle = {
      ...tpl.style,
      position: captionPlacement,
      positionYPercent: yPercent,
      alignment: captionAlign,
      fontSize,
    };

    const existing = studioCaptions(project).filter(
      (s) => !project.tracks[project.clips[s.id]?.trackId]?.locked
    );

    if (existing.length > 0) {
      run((p) => applyStudioStyle(p, existing.map((c) => c.id), mergedStyle));
      notify(`Applied "${tpl.name}" style at ${captionPlacement}.`);
    } else {
      // Insert a quick live preview caption at playhead so user sees immediate canvas update
      const sampleText =
        scriptMode === "hinglish"
          ? "Ab video editing hua super fast!"
          : scriptMode === "hindi"
          ? "अब वीडियो एडिटिंग हुई सुपर फास्ट!"
          : "Make every second count!";
      const wordsArr = sampleText.split(" ");
      const dur = 2.5;
      const words = wordsArr.map((word, idx) => ({
        word,
        start: (dur * idx) / wordsArr.length,
        end: (dur * (idx + 1)) / wordsArr.length,
      }));
      run((p) => {
        const before = p;
        const added = addCaption(p, sampleText, time, dur, {}, words);
        const newClipId = Object.keys(added.clips).find((id) => !before.clips[id]);
        return newClipId ? applyStudioStyle(added, [newClipId], mergedStyle) : added;
      });
      notify(`Added "${tpl.name}" caption preview at ${captionPlacement}.`);
    }
  };

  const applyCaptionPlacement = (pos: "top" | "center" | "bottom") => {
    setCaptionPlacement(pos);
    navigator.vibrate?.(6);
    const yPercent = pos === "top" ? 16 : pos === "bottom" ? 76 : 48;
    const existing = studioCaptions(project).filter(
      (s) => !project.tracks[project.clips[s.id]?.trackId]?.locked
    );
    if (existing.length > 0) {
      run((p) => {
        let next = p;
        for (const s of existing) {
          const cap = p.captions[s.id];
          const curStyle = cap?.studioStyle;
          if (curStyle) {
            next = applyStudioStyle(next, [s.id], {
              ...curStyle,
              position: pos,
              positionYPercent: yPercent,
            });
          }
        }
        return next;
      });
      notify(`Captions placed at ${pos === "center" ? "middle (eye-level)" : pos}.`);
    } else {
      notify(`Caption placement set to ${pos}. Tap a preset below to insert.`);
    }
  };

  const applyCaptionAlignment = (align: "left" | "center" | "right") => {
    setCaptionAlign(align);
    navigator.vibrate?.(6);
    const existing = studioCaptions(project).filter(
      (s) => !project.tracks[project.clips[s.id]?.trackId]?.locked
    );
    if (existing.length > 0) {
      run((p) => {
        let next = p;
        for (const s of existing) {
          const cap = p.captions[s.id];
          const curStyle = cap?.studioStyle;
          if (curStyle) {
            next = applyStudioStyle(next, [s.id], {
              ...curStyle,
              alignment: align,
            });
          }
        }
        return next;
      });
      notify(`Caption text aligned ${align}.`);
    }
  };

  const applyCaptionSize = (size: "sm" | "md" | "lg") => {
    setCaptionSize(size);
    navigator.vibrate?.(6);
    const fontSize = size === "sm" ? 44 : size === "lg" ? 68 : 56;
    const existing = studioCaptions(project).filter(
      (s) => !project.tracks[project.clips[s.id]?.trackId]?.locked
    );
    if (existing.length > 0) {
      run((p) => {
        let next = p;
        for (const s of existing) {
          const cap = p.captions[s.id];
          const curStyle = cap?.studioStyle;
          if (curStyle) {
            next = applyStudioStyle(next, [s.id], {
              ...curStyle,
              fontSize,
            });
          }
        }
        return next;
      });
      notify(`Caption size set to ${size.toUpperCase()}.`);
    }
  };

  // Upload media from phone
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !files.length || uploading) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 100 * 1024 * 1024) {
          notify("Choose files under 100 MB.");
          continue;
        }
        const imported = await importMedia(file, scope, () => {});
        const track = project.trackOrder
          .map((id) => project.tracks[id])
          .find((t) => t && !t.locked && canPlace(t.kind, imported.kind));
        const clipId = uid();
        run((p) => {
          const next = addAsset(p, imported);
          return track
            ? addClip(next, imported.id, track.id, playback.getSnapshot().time, { id: clipId })
            : next;
        });
        if (track) select([clipId]);
      }
      navigator.vibrate?.(10);
      notify("Media added to timeline.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (audioUploadRef.current) audioUploadRef.current.value = "";
    }
  };

  // Play / Pause SFX preview
  const togglePreviewAudio = (id: string, url: string) => {
    if (playingAudioId === id) {
      audioRef.current?.pause();
      setPlayingAudioId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.play().catch(() => notify("Preview audio blocked by browser."));
    setPlayingAudioId(id);
    audio.onended = () => setPlayingAudioId(null);
  };

  const handleAddSfx = (sfx: (typeof BUILTIN_SFX)[number]) => {
    let targetTime = playback.getSnapshot().time;

    if (sfxAlignment === "caption") {
      const caps = studioCaptions(project);
      const activeCap =
        caps.find((c) => time >= c.start && time <= c.end) || caps[0];
      if (activeCap) targetTime = activeCap.start;
    } else if (sfxAlignment === "nearest_cut") {
      const edges = [0];
      for (const c of Object.values(project.clips)) {
        edges.push(Number(c.startTime.toFixed(2)));
        edges.push(Number((c.startTime + c.duration).toFixed(2)));
      }
      const nearest = edges.reduce(
        (prev, curr) => (Math.abs(curr - time) < Math.abs(prev - time) ? curr : prev),
        time
      );
      targetTime = nearest;
    }

    const assetId = `sfx-${sfx.id}`;
    const asset: MediaAsset = {
      id: assetId,
      name: sfx.name,
      kind: "audio",
      mime: "audio/wav",
      size: 65536,
      duration: sfx.duration,
      width: 0,
      height: 0,
      url: sfx.url,
    };
    const clipId = uid();
    run((p) => {
      let audioTrack = p.trackOrder
        .map((id) => p.tracks[id])
        .find((t) => t && t.kind === "audio" && !t.locked);
      let nextP = p;
      if (!audioTrack) {
        nextP = addTrack(nextP, "audio");
        const newTrackId = nextP.trackOrder[nextP.trackOrder.length - 1];
        audioTrack = nextP.tracks[newTrackId];
      }
      return addClip(addAsset(nextP, asset), assetId, audioTrack.id, targetTime, {
        id: clipId,
        name: sfx.name,
        duration: sfx.duration,
        audioRole: "sfx",
        volume: 0.75,
      });
    });
    select([clipId]);
    navigator.vibrate?.(10);
    notify(`Added "${sfx.name}" aligned at ${targetTime.toFixed(2)}s.`);
  };

  const handleAddMusicTrack = (track: MusicTrackItem) => {
    const audioTrack = project.trackOrder
      .map((id) => project.tracks[id])
      .find((t) => t && t.kind === "audio" && !t.locked);
    let nextTrackId = audioTrack?.id;
    const assetId = `bgm-${track.id}`;
    const asset: MediaAsset = {
      id: assetId,
      name: track.title,
      kind: "audio",
      mime: "audio/mpeg",
      size: 1024 * 512,
      duration: track.duration,
      width: 0,
      height: 0,
      url: track.audioUrl,
    };
    run((p) => {
      let trackObj = p.trackOrder
        .map((id) => p.tracks[id])
        .find((t) => t && t.kind === "audio" && !t.locked);
      let nextP = p;
      if (!trackObj) {
        nextP = addTrack(nextP, "audio");
        const newId = nextP.trackOrder[nextP.trackOrder.length - 1];
        trackObj = nextP.tracks[newId];
      }
      return addClip(addAsset(nextP, asset), assetId, trackObj.id, playback.getSnapshot().time, {
        name: track.title,
        duration: Math.min(track.duration, 30),
        volume: track.defaultVolume,
        audioRole: "background",
      });
    });
    navigator.vibrate?.(10);
    notify(`Added "${track.title}" background track.`);
  };

  // B-Roll Search (9:16 portrait by default)
  const searchBroll = async (queryText: string) => {
    const q = queryText.trim();
    if (!q) return;
    setBrollQuery(q);
    setBrollBusy(true);
    try {
      const res = await fetch(
        `/api/broll/search?${new URLSearchParams({
          query: q,
          per_page: "8",
          orientation: "portrait",
        })}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "B-Roll search failed.");
      setBrollResults(data.videos || []);
      if (!data.videos?.length) notify("No portrait B-roll matched that search.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not search B-roll.");
    } finally {
      setBrollBusy(false);
    }
  };

  const insertBroll = async (video: (typeof brollResults)[number]) => {
    setBrollBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || authToken;
      if (!token) throw new Error("Sign in to insert stock B-Roll.");
      const endpoint = `/api/broll/download?${new URLSearchParams({
        url: video.videoUrl,
        name: `B-roll-${video.id}.mp4`,
      })}`;
      const resp = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) throw new Error("Failed to download B-roll clip.");
      const blob = await resp.blob();
      const file = new File([blob], mediaFilename(`B-roll-${video.id}`, blob.type), {
        type: blob.type,
      });
      const imported = await importMedia(file, scope, () => {});
      const saved = await uploadAssetFile(file, {
        duration: imported.duration,
        width: imported.width,
        height: imported.height,
      });
      await linkAsset(project.id, "broll_assets", saved.id);
      const asset: MediaAsset = { ...imported, libraryId: saved.id, url: saved.url };
      const clipId = uid();
      const clipDuration =
        brollDurationPreset === "cut"
          ? Math.min(imported.duration || 2.5, 2.5)
          : brollDurationPreset === "scene"
          ? Math.min(imported.duration || 4.0, 4.0)
          : imported.duration || 5;

      const visualTreatment =
        brollFraming === "pip"
          ? { card: { width: 0.88, radius: 16, shadow: 14 } }
          : undefined;

      run((p) => {
        let overlayTrack =
          p.trackOrder
            .map((id) => p.tracks[id])
            .find((t) => t && t.kind === "overlay" && !t.locked);
        let nextP = p;
        if (!overlayTrack) {
          nextP = addTrack(nextP, "overlay");
          const newTrackId = nextP.trackOrder[nextP.trackOrder.length - 1];
          overlayTrack = nextP.tracks[newTrackId];
        }
        return addClip(
          addAsset(nextP, asset),
          asset.id,
          overlayTrack.id,
          playback.getSnapshot().time,
          {
            id: clipId,
            duration: clipDuration,
            volume: 0,
            visualTreatment,
          }
        );
      });
      select([clipId]);
      navigator.vibrate?.(10);
      notify(`B-roll inserted (${clipDuration.toFixed(1)}s cutaway).`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to insert B-roll.");
    } finally {
      setBrollBusy(false);
    }
  };

  const titles: Record<MobileToolDrawerTab, string> = {
    edit: "Edit & Media",
    captions: "Caption Studio",
    broll: "B-Roll Footage (9:16)",
    audio: "Audio & Sound FX",
    silence: "Silence Trimmer Studio",
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      {/* Backdrop Blur */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm transition-opacity"
        aria-hidden="true"
      />

      {/* Sliding Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titles[activeTab]}
        style={{
          height: expanded ? "75dvh" : "52dvh",
          transform: `translateY(${translateY}px)`,
        }}
        className="relative w-full bg-white/95 backdrop-blur-xl border-t border-slate-200 rounded-t-3xl shadow-2xl flex flex-col overflow-hidden transition-transform duration-200 ease-out pb-[env(safe-area-inset-bottom)]"
      >
        {/* Top Drag Handle */}
        <div
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          className="pt-2 pb-1 px-4 flex flex-col items-center cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
        >
          <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto my-2" />
          <div className="w-full flex items-center justify-between pb-2 border-b border-slate-200">
            <span className="text-sm font-semibold text-slate-900">{titles[activeTab]}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                aria-label={expanded ? "Shrink drawer" : "Expand drawer"}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 active:bg-slate-100"
              >
                {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close drawer"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 active:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Sheet Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 overscroll-contain scrollbar-thin scrollbar-thumb-slate-300">
          {/* ======================= TAB: CAPTIONS ======================= */}
          {activeTab === "captions" && (
            <div className="space-y-4">
              {/* Prominent Script Mode Toggle */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Script Mode
                </span>
                <div
                  role="radiogroup"
                  aria-label="Caption Script Mode"
                  className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200"
                >
                  {(
                    [
                      { id: "hinglish", label: "Hinglish (Latin)" },
                      { id: "hindi", label: "Hindi" },
                      { id: "english", label: "English" },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        setScriptMode(mode.id);
                        navigator.vibrate?.(6);
                        if (mode.id === "hinglish") {
                          handleSelectCaptionPreset("viral-hinglish-pop");
                        }
                      }}
                      aria-checked={scriptMode === mode.id}
                      role="radio"
                      className={`min-h-[40px] px-2 rounded-lg text-[11px] font-semibold transition-all ${
                        scriptMode === mode.id
                          ? "bg-blue-600 text-white shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Caption Placement & Alignment Controls */}
              <div className="space-y-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                    <Shield size={12} className="text-blue-600" />
                    <span>9:16 Safe Placement</span>
                  </span>
                  <span className="text-[10px] font-mono text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    Safe-Zone Compliant
                  </span>
                </div>

                {/* Vertical Position */}
                <div className="space-y-1">
                  <span className="text-[10px] font-medium text-slate-500">Vertical Position</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyCaptionPlacement("top")}
                      className={`min-h-[40px] px-2 rounded-xl text-xs font-semibold flex flex-col items-center justify-center transition-all ${
                        captionPlacement === "top"
                          ? "bg-blue-600 text-white shadow-sm font-bold"
                          : "bg-white border border-slate-200 text-slate-800 font-semibold"
                      }`}
                    >
                      <span>Top</span>
                      <span className="text-[9px] font-mono opacity-80">16% Hook</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyCaptionPlacement("center")}
                      className={`min-h-[40px] px-2 rounded-xl text-xs flex flex-col items-center justify-center transition-all ${
                        captionPlacement === "center"
                          ? "bg-blue-600 text-white shadow-sm font-bold"
                          : "bg-white border border-slate-200 text-slate-800 font-semibold"
                      }`}
                    >
                      <span>Middle</span>
                      <span className="text-[9px] font-mono opacity-80">48% Viral</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyCaptionPlacement("bottom")}
                      className={`min-h-[40px] px-2 rounded-xl text-xs flex flex-col items-center justify-center transition-all ${
                        captionPlacement === "bottom"
                          ? "bg-blue-600 text-white shadow-sm font-bold"
                          : "bg-white border border-slate-200 text-slate-800 font-semibold"
                      }`}
                    >
                      <span>Safe Bot</span>
                      <span className="text-[9px] font-mono opacity-80">76% Lower</span>
                    </button>
                  </div>
                </div>

                {/* Horizontal Alignment & Font Size */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/80">
                  <div className="space-y-1">
                    <span className="text-[10px] font-medium text-slate-500">Alignment</span>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        type="button"
                        onClick={() => applyCaptionAlignment("left")}
                        className={`min-h-[34px] rounded-lg text-xs font-semibold flex items-center justify-center ${
                          captionAlign === "left"
                            ? "bg-blue-600 text-white"
                            : "bg-white border border-slate-200 text-slate-600"
                        }`}
                      >
                        <AlignLeft size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => applyCaptionAlignment("center")}
                        className={`min-h-[34px] rounded-lg text-xs font-semibold flex items-center justify-center ${
                          captionAlign === "center"
                            ? "bg-blue-600 text-white"
                            : "bg-white border border-slate-200 text-slate-600"
                        }`}
                      >
                        <AlignCenter size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => applyCaptionAlignment("right")}
                        className={`min-h-[34px] rounded-lg text-xs font-semibold flex items-center justify-center ${
                          captionAlign === "right"
                            ? "bg-blue-600 text-white"
                            : "bg-white border border-slate-200 text-slate-600"
                        }`}
                      >
                        <AlignRight size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-medium text-slate-500">Size</span>
                    <div className="grid grid-cols-3 gap-1">
                      {(["sm", "md", "lg"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => applyCaptionSize(s)}
                          className={`min-h-[34px] rounded-lg text-[11px] font-mono font-semibold uppercase ${
                            captionSize === s
                              ? "bg-blue-600 text-white"
                              : "bg-white border border-slate-200 text-slate-600"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Horizontal Swipeable Carousel of Caption Studio Presets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Caption Presets (Tap for Live Preview)
                  </span>
                  <span className="text-[10px] font-mono text-blue-600 font-medium">Swipe →</span>
                </div>

                <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-2 no-scrollbar touch-pan-x">
                  {captionCatalog.map((tpl) => {
                    const isSelected = activeCaptionId === tpl.id;
                    const sampleText =
                      scriptMode === "hinglish"
                        ? "Sach bolo toh viral"
                        : scriptMode === "hindi"
                        ? "सुपर फास्ट एडिट"
                        : "Make it matter";
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => handleSelectCaptionPreset(tpl.id)}
                        className={`snap-start flex-shrink-0 w-[160px] rounded-2xl border p-2 text-left transition-all active:scale-95 ${
                          isSelected
                            ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-600/40 shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <CaptionStylePreview
                          style={tpl.style}
                          compact
                          sampleText={
                            "sampleText" in tpl && tpl.sampleText && scriptMode === "english"
                              ? String(tpl.sampleText)
                              : sampleText
                          }
                          previewFontSize={
                            "previewFontSize" in tpl ? Number(tpl.previewFontSize) : undefined
                          }
                        />
                        <div className="mt-2 flex items-center justify-between gap-1">
                          <span className="text-xs font-semibold text-slate-900 truncate">
                            {tpl.name}
                          </span>
                          {isSelected && (
                            <Check size={13} className="text-blue-600 flex-shrink-0" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ======================= TAB: SILENCE TRIMMER ======================= */}
          {activeTab === "silence" && (
            <div className="space-y-4">
              <SilenceTrimmerControls compact />
            </div>
          )}

          {/* ======================= TAB: EDIT & MEDIA ======================= */}
          {activeTab === "edit" && (
            <div className="space-y-4">
              {/* Silence Trimmer Studio Card */}
              <div className="p-3 rounded-2xl bg-white border border-slate-200 shadow-xs">
                <SilenceTrimmerControls compact />
              </div>

              {/* 1-Click 9:16 Smart Reframing Card */}
              <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5 text-xs">
                    <Sparkles size={14} className="text-blue-600" /> 1-Click 9:16 Reframe
                  </span>
                  <span className="text-[10px] text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                    Smart Fit
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      run((p) => reframeProject(p, "fit-with-blur"));
                      notify("Applied 1-Click Fit with Blur (9:16)");
                    }}
                    className="p-2 rounded-xl bg-slate-50 border border-slate-200 hover:border-blue-300 text-center flex flex-col items-center gap-1 active:scale-95 transition-all"
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <span className="text-[11px] font-semibold text-slate-800">Fit + Blur</span>
                    <span className="text-[9px] text-slate-500">Blurred wings</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      run((p) => reframeProject(p, "center-crop"));
                      notify("Applied 1-Click Center Crop (1.77x Eye-Line)");
                    }}
                    className="p-2 rounded-xl bg-slate-50 border border-slate-200 hover:border-indigo-300 text-center flex flex-col items-center gap-1 active:scale-95 transition-all"
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                    <span className="text-[11px] font-semibold text-slate-800">Center Crop</span>
                    <span className="text-[9px] text-slate-500">1.77x eye-line</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      run((p) => reframeProject(p, "split-screen"));
                      notify("Applied 1-Click Split Screen (A-Roll + B-Roll)");
                    }}
                    className="p-2 rounded-xl bg-slate-50 border border-slate-200 hover:border-emerald-300 text-center flex flex-col items-center gap-1 active:scale-95 transition-all"
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-[11px] font-semibold text-slate-800">Split Screen</span>
                    <span className="text-[9px] text-slate-500">A-roll + B-roll</span>
                  </button>
                </div>
              </div>

              {/* Upload Media Button */}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,audio/*,image/*"
                multiple
                hidden
                onChange={(e) => void handleFileUpload(e.target.files)}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="w-full min-h-[48px] rounded-2xl border border-dashed border-blue-300 bg-blue-50/70 text-blue-700 hover:bg-blue-50 text-xs font-semibold flex items-center justify-center gap-2 active:scale-[0.99]"
              >
                {uploading ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <Upload size={16} />
                )}
                <span>{uploading ? "Importing Media…" : "Import Video, Image, or Audio"}</span>
              </button>

              {/* Active Clip Controls */}
              {activeClip ? (
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900 truncate max-w-[200px]">
                      {activeClip.name}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {activeClip.duration.toFixed(1)}s
                    </span>
                  </div>

                  {/* Precision Timing & Timeline Alignment */}
                  <div className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-700 flex items-center gap-1">
                        <Target size={12} className="text-blue-600" />
                        <span>Timeline Alignment</span>
                      </span>
                      <span className="font-mono text-blue-600 font-medium">
                        {activeClip.startTime.toFixed(2)}s → {(activeClip.startTime + activeClip.duration).toFixed(2)}s
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const nextStart = Math.max(0, activeClip.startTime - 0.5);
                          run((p) => moveClip(p, activeClip.id, nextStart));
                          navigator.vibrate?.(6);
                        }}
                        className="flex-1 min-h-[36px] rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs font-mono font-medium"
                      >
                        -0.5s
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextStart = Math.max(0, activeClip.startTime - 0.1);
                          run((p) => moveClip(p, activeClip.id, nextStart));
                          navigator.vibrate?.(6);
                        }}
                        className="flex-1 min-h-[36px] rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs font-mono font-medium"
                      >
                        -0.1s
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          run((p) => moveClip(p, activeClip.id, time));
                          navigator.vibrate?.(8);
                          notify("Aligned start to playhead.");
                        }}
                        className="flex-1 min-h-[36px] px-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-semibold flex items-center justify-center gap-1"
                      >
                        <Target size={11} />
                        <span>Playhead</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextStart = activeClip.startTime + 0.1;
                          run((p) => moveClip(p, activeClip.id, nextStart));
                          navigator.vibrate?.(6);
                        }}
                        className="flex-1 min-h-[36px] rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs font-mono font-medium"
                      >
                        +0.1s
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextStart = activeClip.startTime + 0.5;
                          run((p) => moveClip(p, activeClip.id, nextStart));
                          navigator.vibrate?.(6);
                        }}
                        className="flex-1 min-h-[36px] rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs font-mono font-medium"
                      >
                        +0.5s
                      </button>
                    </div>

                    {/* If visual clip (B-roll, caption, video), add safe placement buttons */}
                    {project.tracks[activeClip.trackId]?.kind !== "audio" && (
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1">
                        <span className="text-[10px] text-slate-500 font-medium">Placement:</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              run((p) => {
                                const clip = p.clips[activeClip.id];
                                if (!clip) return p;
                                if (clip.contentId && p.captions[clip.contentId]) {
                                  const cap = p.captions[clip.contentId];
                                  const baseStyle = cap.studioStyle || DEFAULT_CAPTION_TEMPLATES[0].style;
                                  return applyStudioStyle(p, [clip.id], {
                                    ...baseStyle,
                                    position: "top",
                                    positionYPercent: 16,
                                  });
                                }
                                return changeClipProperty(p, clip.id, {
                                  transform: { ...clip.transform, y: -0.32 },
                                });
                              });
                              notify("Aligned to top (16% hook).");
                            }}
                            className="min-h-[32px] px-2 rounded-lg bg-slate-100 border border-slate-200 text-[11px] font-medium text-slate-700"
                          >
                            Top
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              run((p) => {
                                const clip = p.clips[activeClip.id];
                                if (!clip) return p;
                                if (clip.contentId && p.captions[clip.contentId]) {
                                  const cap = p.captions[clip.contentId];
                                  const baseStyle = cap.studioStyle || DEFAULT_CAPTION_TEMPLATES[0].style;
                                  return applyStudioStyle(p, [clip.id], {
                                    ...baseStyle,
                                    position: "center",
                                    positionYPercent: 48,
                                  });
                                }
                                return changeClipProperty(p, clip.id, {
                                  transform: { ...clip.transform, y: 0 },
                                });
                              });
                              notify("Aligned to middle eye-level (48%).");
                            }}
                            className="min-h-[32px] px-2 rounded-lg bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-800"
                          >
                            Middle
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              run((p) => {
                                const clip = p.clips[activeClip.id];
                                if (!clip) return p;
                                if (clip.contentId && p.captions[clip.contentId]) {
                                  const cap = p.captions[clip.contentId];
                                  const baseStyle = cap.studioStyle || DEFAULT_CAPTION_TEMPLATES[0].style;
                                  return applyStudioStyle(p, [clip.id], {
                                    ...baseStyle,
                                    position: "bottom",
                                    positionYPercent: 76,
                                  });
                                }
                                return changeClipProperty(p, clip.id, {
                                  transform: { ...clip.transform, y: 0.26 },
                                });
                              });
                              notify("Aligned to safe lower third (76%).");
                            }}
                            className="min-h-[32px] px-2 rounded-lg bg-slate-100 border border-slate-200 text-[11px] font-medium text-slate-700"
                          >
                            Safe Bot
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              run((p) => {
                                const clip = p.clips[activeClip.id];
                                if (!clip) return p;
                                if (clip.contentId && p.captions[clip.contentId]) {
                                  const cap = p.captions[clip.contentId];
                                  const baseStyle = cap.studioStyle || DEFAULT_CAPTION_TEMPLATES[0].style;
                                  return applyStudioStyle(p, [clip.id], {
                                    ...baseStyle,
                                    studio: { ...baseStyle.studio, positionXPercent: 50 },
                                  });
                                }
                                return changeClipProperty(p, clip.id, {
                                  transform: { ...clip.transform, x: 0 },
                                });
                              });
                              notify("Centered horizontally.");
                            }}
                            className="min-h-[32px] px-2 rounded-lg bg-slate-100 border border-slate-200 text-[11px] font-medium text-slate-700"
                          >
                            Center X
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quick Actions: Split / Duplicate / Delete */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          run((p) => splitClip(p, activeClip.id, time));
                          navigator.vibrate?.(10);
                          notify("Clip split at playhead.");
                        } catch (e) {
                          notify(e instanceof Error ? e.message : "Move playhead inside clip.");
                        }
                      }}
                      className="min-h-[44px] rounded-xl bg-white border border-slate-200 text-xs font-medium text-amber-700 flex items-center justify-center gap-1.5"
                    >
                      <Scissors size={14} />
                      <span>Split</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        run((p) => duplicateClip(p, activeClip.id));
                        navigator.vibrate?.(8);
                      }}
                      className="min-h-[44px] rounded-xl bg-white border border-slate-200 text-xs font-medium text-blue-700 flex items-center justify-center gap-1.5"
                    >
                      <Copy size={14} />
                      <span>Duplicate</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        run((p) => removeClip(p, activeClip.id));
                        select([]);
                        navigator.vibrate?.(10);
                      }}
                      className="min-h-[44px] rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700 flex items-center justify-center gap-1.5"
                    >
                      <Trash2 size={14} />
                      <span>Delete</span>
                    </button>
                  </div>

                  {/* Speed Presets */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] text-slate-600 font-medium">Speed</span>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[0.5, 1, 1.25, 1.5, 2].map((spd) => (
                        <button
                          key={spd}
                          type="button"
                          onClick={() =>
                            run((p) => changeClipProperty(p, activeClip.id, { speed: spd }))
                          }
                          className={`min-h-[40px] rounded-xl text-xs font-mono font-semibold border ${
                            activeClip.speed === spd
                              ? "bg-blue-600 border-blue-600 text-white"
                              : "bg-white border-slate-200 text-slate-700"
                          }`}
                        >
                          {spd}×
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Volume Slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] text-slate-600">
                      <span>Volume</span>
                      <span className="font-mono text-slate-900 font-medium">
                        {Math.round(activeClip.volume * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={200}
                      value={Math.round(activeClip.volume * 100)}
                      onChange={(e) =>
                        run((p) =>
                          changeClipProperty(p, activeClip.id, {
                            volume: Number(e.target.value) / 100,
                          })
                        )
                      }
                      aria-label="Clip Volume"
                      className="w-full h-2 bg-slate-200 rounded-lg accent-blue-600 cursor-pointer"
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 text-center py-4">
                  Tap any clip on the timeline to adjust split, speed, or volume.
                </p>
              )}

              {/* Project Media Library quick insert */}
              {Object.values(project.assets).length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Project Media
                  </span>
                  <div className="space-y-1.5">
                    {Object.values(project.assets).map((asset) => (
                      <div
                        key={asset.id}
                        className="p-2 rounded-xl bg-white border border-slate-200 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {asset.kind === "audio" ? (
                            <Music size={15} className="text-violet-600 flex-shrink-0" />
                          ) : asset.kind === "image" ? (
                            <ImageIcon size={15} className="text-pink-600 flex-shrink-0" />
                          ) : (
                            <Film size={15} className="text-blue-600 flex-shrink-0" />
                          )}
                          <span className="text-xs text-slate-900 font-medium truncate">{asset.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const track = project.trackOrder
                              .map((id) => project.tracks[id])
                              .find((t) => t && !t.locked && canPlace(t.kind, asset.kind));
                            if (!track) {
                              notify("No compatible unlocked track available.");
                              return;
                            }
                            const id = uid();
                            run((p) => addClip(p, asset.id, track.id, time, { id }));
                            select([id]);
                            navigator.vibrate?.(8);
                          }}
                          className="min-h-[38px] px-3 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 text-xs font-semibold flex items-center gap-1"
                        >
                          <Plus size={13} />
                          <span>Add</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================= TAB: B-ROLL (9:16) ======================= */}
          {activeTab === "broll" && (
            <div className="space-y-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void searchBroll(brollQuery);
                }}
                className="flex gap-2"
              >
                <div className="relative flex-1">
                  <Search
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="search"
                    value={brollQuery}
                    onChange={(e) => setBrollQuery(e.target.value)}
                    placeholder="Search 9:16 portrait B-roll…"
                    className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:border-cyan-600 focus:bg-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={brollBusy || !brollQuery.trim()}
                  className="min-h-[44px] px-4 rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 text-white text-xs font-semibold"
                >
                  {brollBusy ? <LoaderCircle size={15} className="animate-spin" /> : "Search"}
                </button>
              </form>

              {/* Quick Suggestions */}
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {["AI Technology", "Coding Laptop", "City Night", "Money Finance", "Studio Mic"].map(
                  (tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => void searchBroll(tag)}
                      className="min-h-[36px] px-3 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-700 active:bg-cyan-50 whitespace-nowrap"
                    >
                      {tag}
                    </button>
                  )
                )}
              </div>

              {/* B-Roll Placement, Duration & Framing Presets */}
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-700 flex items-center gap-1">
                    <Layers size={12} className="text-cyan-600" />
                    <span>Insert Cutaway Preset</span>
                  </span>
                  <span className="font-mono text-cyan-700 text-[10px] bg-cyan-100 px-1.5 py-0.5 rounded">
                    Overlay Track
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <span className="text-[10px] font-medium text-slate-500">Duration</span>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setBrollDurationPreset("cut");
                          navigator.vibrate?.(6);
                        }}
                        className={`min-h-[32px] rounded-lg text-[10px] font-semibold transition-all ${
                          brollDurationPreset === "cut"
                            ? "bg-cyan-600 text-white shadow-xs"
                            : "bg-white border border-slate-200 text-slate-700"
                        }`}
                      >
                        2.5s Cut
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBrollDurationPreset("scene");
                          navigator.vibrate?.(6);
                        }}
                        className={`min-h-[32px] rounded-lg text-[10px] font-semibold transition-all ${
                          brollDurationPreset === "scene"
                            ? "bg-cyan-600 text-white shadow-xs"
                            : "bg-white border border-slate-200 text-slate-700"
                        }`}
                      >
                        4.0s Scene
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBrollDurationPreset("full");
                          navigator.vibrate?.(6);
                        }}
                        className={`min-h-[32px] rounded-lg text-[10px] font-semibold transition-all ${
                          brollDurationPreset === "full"
                            ? "bg-cyan-600 text-white shadow-xs"
                            : "bg-white border border-slate-200 text-slate-700"
                        }`}
                      >
                        Full
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-medium text-slate-500">Framing</span>
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setBrollFraming("cover");
                          navigator.vibrate?.(6);
                        }}
                        className={`min-h-[32px] rounded-lg text-[10px] font-semibold transition-all ${
                          brollFraming === "cover"
                            ? "bg-cyan-600 text-white shadow-xs"
                            : "bg-white border border-slate-200 text-slate-700"
                        }`}
                      >
                        Full Screen
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBrollFraming("pip");
                          navigator.vibrate?.(6);
                        }}
                        className={`min-h-[32px] rounded-lg text-[10px] font-semibold transition-all ${
                          brollFraming === "pip"
                            ? "bg-cyan-600 text-white shadow-xs"
                            : "bg-white border border-slate-200 text-slate-700"
                        }`}
                      >
                        PiP Card
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Search Results */}
              {brollResults.length > 0 ? (
                <div className="grid grid-cols-2 gap-2.5">
                  {brollResults.map((vid) => (
                    <button
                      key={vid.id}
                      type="button"
                      disabled={brollBusy}
                      onClick={() => void insertBroll(vid)}
                      className="relative aspect-[9/16] max-h-[190px] rounded-xl overflow-hidden border border-slate-200 bg-slate-900 text-left group"
                    >
                      <img
                        src={vid.thumbnail}
                        alt={`B-Roll by ${vid.creatorName}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-between">
                        <span className="text-[10px] font-mono text-cyan-300">
                          {vid.duration}s
                        </span>
                        <span className="px-2 py-0.5 rounded bg-cyan-600 text-white text-[10px] font-semibold">
                          + Insert
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-500">
                  Tap a quick tag or search Pexels/Pixabay 9:16 clips above.
                </div>
              )}
            </div>
          )}

          {/* ======================= TAB: AUDIO & SFX ======================= */}
          {activeTab === "audio" && (
            <div className="space-y-3">
              {/* Upload Voiceover / Audio */}
              <input
                ref={audioUploadRef}
                type="file"
                accept="audio/*"
                hidden
                onChange={(e) => void handleFileUpload(e.target.files)}
              />
              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                  {["All", "Transitions", "Impacts", "UI", "Accents", "Music"].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setAudioCategory(cat)}
                      className={`min-h-[36px] px-3 rounded-full text-xs whitespace-nowrap ${
                        audioCategory === cat
                          ? "bg-violet-600 text-white font-semibold"
                          : "bg-slate-100 border border-slate-200 text-slate-600"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => audioUploadRef.current?.click()}
                  aria-label="Import Voiceover or Audio"
                  className="min-w-[44px] min-h-[36px] px-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs flex items-center gap-1 flex-shrink-0"
                >
                  <Upload size={13} />
                  <span>Import</span>
                </button>
              </div>

              {/* SFX Alignment & Timing Mode */}
              {audioCategory !== "Music" && (
                <div className="p-2.5 rounded-xl bg-violet-50/70 border border-violet-200/80 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-violet-900 flex items-center gap-1">
                      <Target size={12} className="text-violet-600" />
                      <span>SFX Sync &amp; Alignment</span>
                    </span>
                    <span className="text-[10px] font-mono text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded font-medium">
                      Vol: 75%
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSfxAlignment("playhead");
                        navigator.vibrate?.(6);
                      }}
                      className={`min-h-[34px] px-1 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 transition-all ${
                        sfxAlignment === "playhead"
                          ? "bg-blue-600 text-white shadow-xs font-bold"
                          : "bg-white border border-slate-200 text-slate-800 font-medium"
                      }`}
                    >
                      <span>Playhead</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSfxAlignment("nearest_cut");
                        navigator.vibrate?.(6);
                      }}
                      className={`min-h-[34px] px-1 rounded-lg text-[10px] flex items-center justify-center gap-1 transition-all ${
                        sfxAlignment === "nearest_cut"
                          ? "bg-blue-600 text-white shadow-xs font-bold"
                          : "bg-white border border-slate-200 text-slate-800 font-medium"
                      }`}
                    >
                      <span>Snap Cut</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSfxAlignment("caption");
                        navigator.vibrate?.(6);
                      }}
                      className={`min-h-[34px] px-1 rounded-lg text-[10px] flex items-center justify-center gap-1 transition-all ${
                        sfxAlignment === "caption"
                          ? "bg-blue-600 text-white shadow-xs font-bold"
                          : "bg-white border border-slate-200 text-slate-800 font-medium"
                      }`}
                    >
                      <span>To Caption</span>
                    </button>
                  </div>
                </div>
              )}

              {audioCategory === "Music" ? (
                <div className="space-y-2">
                  {CURATED_MUSIC_TRACKS.map((track) => {
                    const isPlaying = playingAudioId === track.id;
                    return (
                      <div
                        key={track.id}
                        className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => togglePreviewAudio(track.id, track.audioUrl)}
                            aria-label={`Preview ${track.title}`}
                            className={`min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center flex-shrink-0 ${
                              isPlaying
                                ? "bg-violet-600 text-white"
                                : "bg-violet-50 border border-violet-200 text-violet-700"
                            }`}
                          >
                            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                          </button>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900 truncate">
                              {track.title}
                            </p>
                            <p className="text-[10px] text-slate-500 truncate">
                              {track.genre} · {track.duration}s
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddMusicTrack(track)}
                          className="min-h-[40px] px-3 rounded-xl bg-violet-600 text-white text-xs font-semibold flex-shrink-0"
                        >
                          + Use
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  {BUILTIN_SFX.filter(
                    (s) => audioCategory === "All" || s.category === audioCategory
                  ).map((sfx) => {
                    const isPlaying = playingAudioId === sfx.id;
                    return (
                      <div
                        key={sfx.id}
                        className="p-2 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => togglePreviewAudio(sfx.id, sfx.url)}
                            aria-label={`Preview ${sfx.name}`}
                            className={`min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center flex-shrink-0 ${
                              isPlaying
                                ? "bg-violet-600 text-white"
                                : "bg-slate-100 border border-slate-200 text-slate-700"
                            }`}
                          >
                            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
                          </button>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-900 truncate">
                              {sfx.name}
                            </p>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {sfx.category} · {sfx.duration}s
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddSfx(sfx)}
                          className="min-h-[40px] px-3 rounded-xl bg-violet-50 border border-violet-200 text-violet-700 text-xs font-semibold flex items-center gap-1 flex-shrink-0"
                        >
                          <Plus size={13} />
                          <span>Add</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
