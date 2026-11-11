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
  changeClipProperty,
  duplicateClip,
  removeClip,
  splitClip,
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

  // Audio tab state
  const [audioCategory, setAudioCategory] = useState<string>("All");
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // B-Roll tab state
  const [brollQuery, setBrollQuery] = useState("");
  const [brollResults, setBrollResults] = useState<
    { id: string; thumbnail: string; videoUrl: string; duration: number; creatorName: string }[]
  >([]);
  const [brollBusy, setBrollBusy] = useState(false);

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

  // Apply Caption Preset immediately on preview
  const handleSelectCaptionPreset = (templateId: string) => {
    setActiveCaptionId(templateId);
    navigator.vibrate?.(8);
    const tpl = studioTemplate(templateId) || captionCatalog.find((c) => c.id === templateId);
    if (!tpl) return;

    const existing = studioCaptions(project).filter(
      (s) => !project.tracks[project.clips[s.id]?.trackId]?.locked
    );

    if (existing.length > 0) {
      run((p) => applyStudioStyle(p, existing.map((c) => c.id), tpl.style));
      notify(`Applied "${tpl.name}" style.`);
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
        return newClipId ? applyStudioStyle(added, [newClipId], tpl.style) : added;
      });
      notify(`Added "${tpl.name}" caption preview at playhead.`);
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
    const audioTrack = project.trackOrder
      .map((id) => project.tracks[id])
      .find((t) => t && t.kind === "audio" && !t.locked);
    if (!audioTrack) {
      notify("Unlock an audio track first.");
      return;
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
    run((p) =>
      addClip(addAsset(p, asset), assetId, audioTrack.id, playback.getSnapshot().time, {
        name: sfx.name,
        duration: sfx.duration,
        audioRole: "sfx",
      })
    );
    navigator.vibrate?.(10);
    notify(`Added "${sfx.name}" at playhead.`);
  };

  const handleAddMusicTrack = (track: MusicTrackItem) => {
    const audioTrack = project.trackOrder
      .map((id) => project.tracks[id])
      .find((t) => t && t.kind === "audio" && !t.locked);
    if (!audioTrack) {
      notify("Unlock an audio track first.");
      return;
    }
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
    run((p) =>
      addClip(addAsset(p, asset), assetId, audioTrack.id, playback.getSnapshot().time, {
        name: track.title,
        duration: Math.min(track.duration, 30),
        volume: track.defaultVolume,
        audioRole: "background",
      })
    );
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
      const overlayTrack =
        project.trackOrder
          .map((id) => project.tracks[id])
          .find((t) => t && t.kind === "overlay" && !t.locked) ||
        project.trackOrder
          .map((id) => project.tracks[id])
          .find((t) => t && !t.locked && canPlace(t.kind, "video"));
      if (!overlayTrack) throw new Error("Unlock an overlay track to insert B-roll.");
      const clipId = uid();
      run((p) =>
        addClip(addAsset(p, asset), asset.id, overlayTrack.id, playback.getSnapshot().time, {
          id: clipId,
          volume: 0,
        })
      );
      select([clipId]);
      navigator.vibrate?.(10);
      notify("B-roll inserted onto overlay track.");
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

          {/* ======================= TAB: EDIT & MEDIA ======================= */}
          {activeTab === "edit" && (
            <div className="space-y-4">
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
