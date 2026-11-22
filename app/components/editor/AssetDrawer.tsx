"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Upload,
  Search,
  Plus,
  Play,
  Pause,
  Trash2,
  Film,
  Music,
  Image as ImageIcon,
  Check,
  Sparkles,
  Sliders,
  Maximize,
  SlidersHorizontal,
  FolderOpen,
  Volume2,
  VolumeX,
  ExternalLink,
  Layers,
  ArrowRight,
  RefreshCw,
  Copy,
  Split,
  Scissors,
  AlignLeft,
  AlignCenter,
  AlignRight,
  RotateCcw,
  Gauge,
} from "lucide-react";
import { EditorToolTab } from "./ToolSidebar";
import { useEditor } from "./workspace/EditorContext";
import { useProject } from "@/app/lib/editor/store";
import { loadDemoProjectIntoStore } from "@/app/lib/editor/demoProject";
import {
  MediaAsset,
  canPlace,
  Ratio,
  aspectRatios,
  dimensions,
  textForClip,
  TextStyle,
  AudioRole,
  TransitionKind,
} from "@/app/lib/editor/model";
import {
  addAsset,
  addClip,
  addTrack,
  addTransition,
  changeClipProperty,
  changeTrack,
  changeText,
  duplicateClip,
  frameClip,
  moveClip,
  removeClip,
  replaceClipAsset,
  splitClip,
  trimClip,
  reframeProject,
  resetClipTransform,
  changeCaptionProperty,
} from "@/app/lib/editor/operations";
import { importMedia, visualDimensions } from "@/app/lib/editor/media";
import { audioRole } from "@/app/lib/editor/audioMix";
import { BUILTIN_SFX } from "@/app/lib/assets/builtinSfx";
import { DEFAULT_CAPTION_TEMPLATES } from "@/app/lib/captions/templates";
import { ALL_CAPTION_TEMPLATES } from "@/app/lib/captions/referenceTemplates";
import CaptionRenderer from "../captions/CaptionRenderer";
import { applyCaptionTemplate } from "@/app/lib/editor/captionTemplates";
import { applyStudioStyle, studioCaptions } from "@/app/lib/editor/editorCaptionStudio";
import { setVisualTreatment } from "@/app/lib/editor/visualTreatment";
import { uploadAssetFile, linkAsset } from "@/app/lib/assets/client";
import { supabase } from "@/app/lib/supabase";
import type { StockVideo } from "@/app/lib/server/stockSearch";
import { BROLL_CATEGORIES, type BrollNiche, searchCuratedBroll } from "@/app/lib/assets/curatedBrollCatalog";
import MediaAnimationControls from "./workspace/MediaAnimationControls";
import TextFillControls from "./workspace/TextFillControls";
import SilenceTrimmerControls from "./workspace/SilenceTrimmerControls";

interface AssetDrawerProps {
  activeTab: EditorToolTab;
  onClose: () => void;
}

export default function AssetDrawer({ activeTab, onClose }: AssetDrawerProps) {
  const { store, playback, repository, scope, selection, select, run, notify } =
    useEditor();
  const project = useProject(store);

  // Audio Previewer State
  const [playingSfxId, setPlayingSfxId] = useState<string | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  // Media Tab State
  const [mediaQuery, setMediaQuery] = useState("");
  const [mediaFilter, setMediaFilter] = useState<"all" | "video" | "audio" | "image">("all");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Captions Tab State
  const [captionQuery, setCaptionQuery] = useState("");
  const [isHinglishMode, setIsHinglishMode] = useState(false);
  const [hoveredPreset, setHoveredPreset] = useState<string | null>(null);
  const [activeCaptionTemplate, setActiveCaptionTemplate] = useState("study-hormozi-style");
  const previousCaptionTemplateRef = useRef("study-hormozi-style");

  // SFX Tab Category
  const [sfxCategory, setSfxCategory] = useState<string>("All");
  const [sfxQuery, setSfxQuery] = useState("");

  // B-Roll State
  const [brollCategory, setBrollCategory] = useState<string>("all");
  const [brollQuery, setBrollQuery] = useState("");
  const [isSearchingBroll, setIsSearchingBroll] = useState(false);
  const [brollResults, setBrollResults] = useState<StockVideo[]>([]);

  // Framing State
  const [framing, setFraming] = useState(false);

  // Stop audio on unmount or tab change
  useEffect(() => {
    return () => {
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
        audioPreviewRef.current = null;
      }
    };
  }, [activeTab]);

  const togglePlaySfx = (id: string, url: string) => {
    if (playingSfxId === id) {
      audioPreviewRef.current?.pause();
      setPlayingSfxId(null);
      return;
    }
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
    }
    const audio = new Audio(url);
    audioPreviewRef.current = audio;
    audio.play().catch(() => {});
    setPlayingSfxId(id);
    audio.onended = () => setPlayingSfxId(null);
  };

  // Add SFX directly to audio track at playhead
  const handleAddSfxToTimeline = (sfx: typeof BUILTIN_SFX[number]) => {
    const audioTrack = project.trackOrder
      .map((id) => project.tracks[id])
      .find((t) => t && t.kind === "audio" && !t.locked);
    if (!audioTrack) {
      notify("Please add or unlock an audio track first.");
      return;
    }
    const assetId = `sfx-${sfx.id}`;
    const newAsset: MediaAsset = {
      id: assetId,
      name: sfx.name,
      kind: "audio",
      mime: "audio/wav",
      size: 1024 * 64,
      duration: sfx.duration,
      width: 0,
      height: 0,
      url: sfx.url,
    };
    run((p) => {
      let next = addAsset(p, newAsset);
      return addClip(next, assetId, audioTrack.id, playback.getSnapshot().time, {
        name: sfx.name,
        duration: sfx.duration,
      });
    });
    notify(`Added "${sfx.name}" sound effect to timeline.`);
  };

  // Upload local media
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !files.length || isUploading) return;
    setIsUploading(true);
    setUploadProgress(10);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 100 * 1024 * 1024) {
          notify("Please upload files under 100 MB.");
          continue;
        }
        setUploadProgress(30);
        const imported = await importMedia(file, scope, (pct) =>
          setUploadProgress(Math.round(30 + pct * 0.3))
        );
        try {
          const saved = await uploadAssetFile(
            file,
            { duration: imported.duration, width: imported.width, height: imported.height },
            undefined,
            (_msg, pct) => {
              if (typeof pct === "number") setUploadProgress(60 + Math.round(pct * 0.35));
            }
          );
          await linkAsset(
            project.id,
            saved.kind === "audio" ? "voiceovers" : saved.kind === "image" ? "backgrounds" : "raw_footage",
            saved.id
          );
          run((p) => addAsset(p, { ...imported, libraryId: saved.id, url: saved.url }));
        } catch {
          // If server upload fails (e.g. offline/mock environment), retain locally imported asset
          run((p) => addAsset(p, imported));
        }
      }
      notify(`Imported media successfully.`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Place asset on compatible track
  const handlePlaceMedia = (asset: MediaAsset) => {
    const track = project.trackOrder
      .map((id) => project.tracks[id])
      .find((t) => t && !t.locked && canPlace(t.kind, asset.kind));
    if (!track) {
      notify("Add or unlock a compatible track first.");
      return;
    }
    const clipId = crypto.randomUUID();
    run((p) => addClip(p, asset.id, track.id, playback.getSnapshot().time, { id: clipId }));
    select([clipId]);
    notify(`Added ${asset.name} to timeline.`);
  };

  // Apply Caption Preset
  const handleApplyCaptionPreset = (templateId: string) => {
    setActiveCaptionTemplate(templateId);
    const template = ALL_CAPTION_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;

    const captions = studioCaptions(project).filter(
      (s) => !project.tracks[project.clips[s.id]?.trackId]?.locked
    );
    if (captions.length > 0) {
      run((p) => applyStudioStyle(p, captions.map((c) => c.id), template.style));
      notify(`Applied "${template.name}" look to captions.`);
    } else {
      notify(`Selected ${template.name}. Add captions to see preview.`);
    }
  };

  // Load curated B-roll clips when tab is active or category changes
  useEffect(() => {
    if (activeTab === "broll") {
      const orientation = project.settings.aspectRatio === "9:16" ? "portrait" : "landscape";
      const cat = brollCategory === "all" ? undefined : (brollCategory as BrollNiche);
      const items = searchCuratedBroll(brollQuery, {
        category: cat,
        orientation,
        limit: 14,
      });
      setBrollResults(items);
    }
  }, [activeTab, brollCategory, project.settings.aspectRatio]);

  // B-Roll Search & Placement
  const handleSearchBroll = async (queryText: string) => {
    if (!queryText.trim() || isSearchingBroll) return;
    setIsSearchingBroll(true);
    try {
      const orientation = project.settings.aspectRatio === "9:16" ? "portrait" : "landscape";
      const catParam = brollCategory !== "all" ? `&category=${brollCategory}` : "";
      const res = await fetch(
        `/api/broll/search?query=${encodeURIComponent(queryText.trim())}&orientation=${orientation}&per_page=14${catParam}`
      );
      const data = await res.json().catch(() => ({}));
      if (data.videos && Array.isArray(data.videos) && data.videos.length > 0) {
        setBrollResults(data.videos);
        notify(`Found ${data.videos.length} clips for "${queryText}".`);
      } else {
        const cat = brollCategory === "all" ? undefined : (brollCategory as BrollNiche);
        const fallback = searchCuratedBroll(queryText, {
          category: cat,
          orientation,
          limit: 14,
        });
        setBrollResults(fallback);
        notify(`Showing ${fallback.length} matching clips.`);
      }
    } catch {
      const orientation = project.settings.aspectRatio === "9:16" ? "portrait" : "landscape";
      const cat = brollCategory === "all" ? undefined : (brollCategory as BrollNiche);
      const fallback = searchCuratedBroll(queryText, {
        category: cat,
        orientation,
        limit: 14,
      });
      setBrollResults(fallback);
    } finally {
      setIsSearchingBroll(false);
    }
  };

  const handleAddBrollToTimeline = (v: StockVideo) => {
    const assetId = crypto.randomUUID();
    const clipId = crypto.randomUUID();
    const time = playback.getSnapshot().time;
    run((p) => {
      let overlayTrack = p.trackOrder.map((id) => p.tracks[id]).find((t) => t.kind === "overlay" && !t.locked);
      let next = p;
      if (!overlayTrack) {
        next = addTrack(next, "overlay");
        overlayTrack = next.tracks[next.trackOrder[next.trackOrder.length - 1]];
      }
      const asset: MediaAsset = {
        id: assetId,
        kind: "video",
        name: v.title,
        duration: v.duration,
        width: v.width,
        height: v.height,
        url: v.videoUrl,
        thumbnail: v.thumbnail,
        size: 0,
        mime: "video/mp4",
      };
      next = addAsset(next, asset);
      return addClip(next, assetId, overlayTrack.id, time, {
        id: clipId,
        name: v.title,
        duration: Math.min(v.duration, 4),
      });
    });
    select([clipId]);
    notify(`Added "${v.title}" B-roll to overlay track.`);
  };

  // Add Transition between selected adjacent clips
  const handleAddTransition = (kind: TransitionKind) => {
    if (selection.length === 2) {
      const c1 = project.clips[selection[0]];
      const c2 = project.clips[selection[1]];
      if (!c1 || !c2 || c1.trackId !== c2.trackId) {
        notify("Transitions need two clips on the same track.");
        return;
      }
      const [from, to] = c1.startTime <= c2.startTime ? [c1, c2] : [c2, c1];
      try {
        run((p) => addTransition(p, from.id, to.id, kind, 0.5));
        notify(`Added ${kind} transition.`);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Could not add transition.");
      }
    } else if (selection.length === 1) {
      const c = project.clips[selection[0]];
      const track = c ? project.tracks[c.trackId] : undefined;
      if (!c || !track) {
        notify("Select a clip to add a transition.");
        return;
      }
      const trackClips = track.clipIds
        .map((id) => project.clips[id])
        .filter(Boolean)
        .sort((a, b) => a.startTime - b.startTime);
      const idx = trackClips.findIndex((clip) => clip.id === c.id);
      const nextClip = trackClips[idx + 1];
      const prevClip = trackClips[idx - 1];
      if (nextClip && Math.abs(c.startTime + c.duration - nextClip.startTime) <= 1 / project.settings.fps) {
        try {
          run((p) => addTransition(p, c.id, nextClip.id, kind, 0.5));
          notify(`Added ${kind} transition.`);
          return;
        } catch (e) {
          notify(e instanceof Error ? e.message : "Could not add transition.");
          return;
        }
      }
      if (prevClip && Math.abs(prevClip.startTime + prevClip.duration - c.startTime) <= 1 / project.settings.fps) {
        try {
          run((p) => addTransition(p, prevClip.id, c.id, kind, 0.5));
          notify(`Added ${kind} transition.`);
          return;
        } catch (e) {
          notify(e instanceof Error ? e.message : "Could not add transition.");
          return;
        }
      }
      notify("Select two adjacent visual clips on the same track to add a transition.");
    } else {
      notify("Select two adjacent visual clips on the same track to add a transition.");
    }
  };

  // Framing (Fit / Fill)
  const handleFrame = async (mode: "fit" | "fill") => {
    const c = selection[0] ? project.clips[selection[0]] : null;
    if (!c || !c.assetId || framing) return;
    const asset = project.assets[c.assetId];
    if (!asset) return;
    setFraming(true);
    try {
      const size = await visualDimensions(asset, repository);
      run((p) => frameClip(addAsset(p, { ...asset, ...size }), c.id, mode));
      notify(`Framed clip to ${mode}.`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Framing failed.");
    } finally {
      setFraming(false);
    }
  };

  // Inspector selected clip
  const selectedClip = selection[0] ? project.clips[selection[0]] : null;
  const selectedTrack = selectedClip ? project.tracks[selectedClip.trackId] : null;
  const selectedAsset = selectedClip?.assetId ? project.assets[selectedClip.assetId] : null;
  const selectedLayer = selectedClip ? textForClip(project, selectedClip) : undefined;
  const isVisual = selectedTrack ? selectedTrack.kind !== "audio" : false;
  const currentRgb = selectedClip?.visualTreatment?.effects?.find((e) => e.rgbOffset)?.rgbOffset || { x: 0, y: 0 };

  const handleRgbChange = (axis: "x" | "y", value: number) => {
    if (!selectedClip || !isVisual) return;
    const newX = axis === "x" ? value : currentRgb.x;
    const newY = axis === "y" ? value : currentRgb.y;
    run((p) => {
      const clip = p.clips[selectedClip.id];
      if (!clip) return p;
      if (newX === 0 && newY === 0) {
        const existing = clip.visualTreatment;
        if (!existing) return p;
        const otherEffects = (existing.effects || []).filter((e) => !e.rgbOffset);
        if (!otherEffects.length && !existing.card && !existing.mask && !existing.entrance && !existing.exit) {
          return { ...p, clips: { ...p.clips, [clip.id]: { ...clip, visualTreatment: undefined } } };
        }
        return setVisualTreatment(p, clip.id, { ...existing, effects: otherEffects });
      }
      const existing = clip.visualTreatment || {};
      const otherEffects = (existing.effects || []).filter((e) => !e.rgbOffset);
      const rgbEffect = {
        sourceStart: clip.sourceStart,
        sourceEnd: clip.sourceEnd,
        rgbOffset: { x: newX, y: newY },
      };
      return setVisualTreatment(p, clip.id, {
        ...existing,
        effects: [...otherEffects, rgbEffect],
      });
    });
  };

  const handleTextStyleChange = (changes: Partial<TextStyle>) => {
    if (!selectedClip || !selectedLayer) return;
    run((p) => changeText(p, selectedClip.id, selectedLayer.text, changes));
  };

  const titles: Record<EditorToolTab, string> = {
    media: "Project Media",
    captions: "Caption Studio",
    broll: "B-Roll Stock Footage",
    audio: "Audio & SFX Library",
    silence: "Silence Trimmer Studio",
    effects: "Effects & Zooms",
    settings: "Project Settings",
    inspector: "Clip Properties",
  };

  return (
    <aside
      className="w-80 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col h-full overflow-hidden text-slate-900 z-20 select-none"
      aria-label="Secondary Asset & Tool Drawer"
    >
      {/* Drawer Header */}
      <header className="h-12 px-4 flex items-center justify-between border-b border-slate-200 bg-slate-50/80 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-sm text-slate-900 truncate">
            {titles[activeTab]}
          </span>
          <span className="text-[10px] bg-slate-200/80 text-slate-600 px-1.5 py-0.5 rounded font-mono">
            {activeTab === "media"
              ? `${Object.keys(project.assets).length} assets`
              : activeTab === "captions"
              ? "47+ styles"
              : activeTab === "silence"
              ? "Acoustic & Gap"
              : "Kreovar"}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="p-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 transition-colors"
        >
          <X size={16} />
        </button>
      </header>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
        {/* ======================= TAB: CAPTIONS ======================= */}
        {activeTab === "captions" && (
          <div className="space-y-4">
            {/* Hinglish Toggle & Info */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-200">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-amber-600" />
                  Hinglish & Hindi Pop
                </span>
                <p className="text-[10px] text-amber-700">
                  Dynamic color accents on Hindi/Hinglish keywords
                </p>
              </div>
              <button
                onClick={() => {
                  const next = !isHinglishMode;
                  setIsHinglishMode(next);
                  if (next) {
                    previousCaptionTemplateRef.current = activeCaptionTemplate;
                    handleApplyCaptionPreset("viral-hinglish-pop");
                  } else {
                    handleApplyCaptionPreset(previousCaptionTemplateRef.current || "study-hormozi-style");
                  }
                }}
                aria-pressed={isHinglishMode}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                  isHinglishMode
                    ? "bg-amber-500 text-white font-semibold shadow-sm"
                    : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {isHinglishMode ? "Active" : "Enable"}
              </button>
            </div>

            {/* Template Search */}
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Search styles (Hormozi, Ali Abdaal, Beast)..."
                value={captionQuery}
                onChange={(e) => setCaptionQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>

            {/* Registered Caption Presets Cards */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  Caption Presets ({ALL_CAPTION_TEMPLATES.length})
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {ALL_CAPTION_TEMPLATES.filter(
                  (p) =>
                    p.name.toLowerCase().includes(captionQuery.toLowerCase()) ||
                    (p.tagline || p.description || "").toLowerCase().includes(captionQuery.toLowerCase())
                ).map((preset) => {
                  const isSelected = activeCaptionTemplate === preset.id;
                  const sampleText =
                    "sampleText" in preset && typeof preset.sampleText === "string"
                      ? preset.sampleText
                      : "MAKE IT MATTER";
                  const tagline = preset.tagline || preset.description || preset.category || "Caption style";
                  return (
                    <div
                      key={preset.id}
                      onMouseEnter={() => setHoveredPreset(preset.id)}
                      onMouseLeave={() => setHoveredPreset(null)}
                      className={`p-3 rounded-xl border bg-white transition-all cursor-pointer group ${
                        isSelected
                          ? "border-blue-600 bg-blue-50/50 shadow-sm"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                      onClick={() => handleApplyCaptionPreset(preset.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-slate-900">
                          {preset.name}
                        </span>
                        {isSelected && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-mono font-medium">
                            Active
                          </span>
                        )}
                      </div>

                      {/* Live Hovering Preview Box */}
                      <div className="mt-2 h-14 rounded-lg bg-[#0F172A] flex items-center justify-center p-2 relative overflow-hidden border border-slate-200 group-hover:border-slate-300 transition-colors">
                        <CaptionRenderer
                          text={sampleText}
                          currentTime={1.0}
                          style={preset.style}
                          scaleMultiplier={0.52}
                        />
                      </div>

                      <p className="mt-2 text-[11px] text-slate-600 line-clamp-1">
                        {tagline}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ======================= TAB: SILENCE TRIMMER ======================= */}
        {activeTab === "silence" && (
          <div className="space-y-4">
            <SilenceTrimmerControls />
          </div>
        )}

        {/* ======================= TAB: AUDIO & SFX ======================= */}
        {activeTab === "audio" && (
          <div className="space-y-4">
            {/* Quick Silence Trimmer Feature Card */}
            <details className="rounded-2xl border border-blue-200 bg-blue-50/60 p-3 group">
              <summary className="cursor-pointer text-xs font-semibold text-blue-900 flex items-center justify-between select-none">
                <span className="flex items-center gap-2">
                  <Scissors size={14} className="text-blue-600" />
                  <span>Silence Trimmer Studio</span>
                </span>
                <span className="text-[10px] text-blue-600 font-normal group-open:hidden">Open Controls ↓</span>
              </summary>
              <div className="pt-3">
                <SilenceTrimmerControls compact />
              </div>
            </details>
            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
              {["All", "Transitions", "Impacts", "UI", "Accents"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSfxCategory(cat)}
                  className={`px-3 py-1 rounded-full whitespace-nowrap transition-colors ${
                    sfxCategory === cat
                      ? "bg-blue-600 text-white font-bold shadow-2xs"
                      : "bg-slate-100 border border-slate-200 text-slate-800 hover:text-black hover:bg-slate-200 font-medium"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* SFX Search */}
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Search SFX (Whoosh, click, pop, sub-drop)..."
                value={sfxQuery}
                onChange={(e) => setSfxQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-600 focus:bg-white"
              />
            </div>

            {/* Categorized SFX List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Sound Effects ({BUILTIN_SFX.length})</span>
                <span className="font-mono text-[10px]">WAV 48kHz</span>
              </div>

              <div className="space-y-1.5">
                {BUILTIN_SFX.filter(
                  (s) =>
                    (sfxCategory === "All" || s.category === sfxCategory) &&
                    (s.name + " " + s.category).toLowerCase().includes(sfxQuery.toLowerCase())
                ).map((sfx) => {
                  const isPlaying = playingSfxId === sfx.id;
                  return (
                    <div
                      key={sfx.id}
                      className="p-2.5 rounded-lg bg-slate-50/80 border border-slate-200 flex items-center justify-between hover:border-slate-300 hover:bg-white transition-colors group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Instant Preview Play Button */}
                        <button
                          onClick={() => togglePlaySfx(sfx.id, sfx.url)}
                          title={isPlaying ? "Stop Preview" : "Play Preview"}
                          aria-label={`Preview ${sfx.name}`}
                          className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                            isPlaying
                              ? "bg-violet-600 text-white"
                              : "bg-white border border-slate-200 text-slate-600 hover:bg-violet-600 hover:text-white hover:border-violet-600"
                          }`}
                        >
                          {isPlaying ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
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

                      {/* Add to Timeline Button */}
                      <button
                        onClick={() => handleAddSfxToTimeline(sfx)}
                        title="Add to Audio Track at Playhead"
                        className="opacity-90 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 rounded bg-violet-50 hover:bg-violet-600 text-violet-700 hover:text-white text-[10px] font-semibold border border-violet-200 hover:border-violet-600 transition-colors"
                      >
                        <Plus size={11} />
                        <span>Add</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ======================= TAB: MEDIA ======================= */}
        {activeTab === "media" && (
          <div className="space-y-4">
            {/* Upload Zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="p-5 border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl bg-slate-50 hover:bg-blue-50/30 text-center cursor-pointer transition-colors group"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="video/*,audio/*,image/*"
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files)}
              />
              <Upload
                size={22}
                className="mx-auto text-slate-400 group-hover:text-blue-600 group-hover:scale-110 transition-all"
              />
              <p className="mt-2 text-xs font-semibold text-slate-800">
                {isUploading ? `Uploading (${uploadProgress}%)` : "Upload Raw Footage"}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                MP4, MOV, WAV, MP3, PNG up to 100MB
              </p>
            </div>

            {/* Media Search & Filter */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  placeholder="Filter media..."
                  value={mediaQuery}
                  onChange={(e) => setMediaQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>
              <select
                value={mediaFilter}
                onChange={(e) => setMediaFilter(e.target.value as any)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-blue-600"
              >
                <option value="all">All</option>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
                <option value="image">Image</option>
              </select>
            </div>

            {/* Media Asset Grid */}
            <div className="space-y-2">
              {Object.values(project.assets)
                .filter(
                  (a) =>
                    (mediaFilter === "all" || a.kind === mediaFilter) &&
                    a.name.toLowerCase().includes(mediaQuery.toLowerCase())
                )
                .map((asset) => (
                  <div
                    key={asset.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "application/veelox-asset",
                        JSON.stringify({
                          assetId: asset.id,
                          name: asset.name,
                          duration: asset.duration,
                          kind: asset.kind,
                        })
                      );
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    className="p-2 rounded-xl bg-white border border-slate-200 flex items-center justify-between group hover:border-slate-300 transition-colors cursor-grab active:cursor-grabbing"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {asset.thumbnail ? (
                          <img
                            src={asset.thumbnail}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : asset.kind === "audio" ? (
                          <Music size={16} className="text-violet-600" />
                        ) : asset.kind === "image" ? (
                          <ImageIcon size={16} className="text-pink-600" />
                        ) : (
                          <Film size={16} className="text-blue-600" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-900 truncate">
                          {asset.name}
                        </p>
                        <p className="text-[10px] text-slate-500 font-mono">
                          {asset.kind.toUpperCase()}
                          {asset.duration > 0 ? ` · ${asset.duration.toFixed(1)}s` : ""}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handlePlaceMedia(asset)}
                      title="Add to timeline"
                      className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white border border-blue-200 hover:border-blue-600 transition-colors"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                ))}

              {Object.keys(project.assets).length === 0 && (
                <div className="text-center py-6 px-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2.5">
                  <p className="text-xs text-slate-600">
                    No assets uploaded yet.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      loadDemoProjectIntoStore(store);
                      notify("Loaded 15-second creator demo project.");
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs border border-blue-200 transition-colors cursor-pointer"
                  >
                    <Sparkles size={13} />
                    <span>Try Demo Project</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================= TAB: B-ROLL ======================= */}
        {activeTab === "broll" && (
          <div className="space-y-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSearchBroll(brollQuery);
              }}
              className="relative"
            >
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Search stock footage across 10 niches..."
                value={brollQuery}
                onChange={(e) => setBrollQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-16 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-cyan-600 focus:bg-white"
              />
              <button
                type="submit"
                disabled={isSearchingBroll}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-1 bg-cyan-600 hover:bg-cyan-700 text-white rounded text-[10px] font-medium disabled:opacity-50 transition-colors"
              >
                {isSearchingBroll ? "Searching…" : "Search"}
              </button>
            </form>

            {/* 10-Niche Category Filter Pills */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase">
                  Categories & Niches
                </span>
                <span className="text-[10px] text-cyan-600 font-medium">10 Niches</span>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
                <button
                  type="button"
                  onClick={() => setBrollCategory("all")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer ${
                    brollCategory === "all"
                      ? "bg-blue-600 text-white shadow-2xs"
                      : "bg-slate-100 text-slate-800 hover:text-black hover:bg-slate-200"
                  }`}
                >
                  <span>All Niches</span>
                </button>
                {BROLL_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setBrollCategory(cat.id)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer ${
                      brollCategory === cat.id
                        ? "bg-blue-600 text-white shadow-2xs"
                        : "bg-slate-100 text-slate-800 hover:text-black hover:bg-slate-200"
                    }`}
                  >
                    <span>{cat.label.split(" ")[0]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Live Search Results */}
            {brollResults.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">
                    Available Footage ({brollResults.length})
                  </span>
                  <span className="text-[10px] text-slate-400 capitalize">
                    {brollCategory === "all" ? "All Niches" : brollCategory}
                  </span>
                </div>
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {brollResults.map((v) => (
                    <div
                      key={v.id}
                      className="p-2 rounded-xl bg-white border border-slate-200 flex items-center justify-between hover:border-cyan-400 transition-colors group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-12 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {v.thumbnail ? (
                            <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Film size={16} className="text-cyan-600" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-900 truncate">{v.title}</p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            {v.duration.toFixed(1)}s · {v.width}×{v.height}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddBrollToTimeline(v)}
                        title="Add to timeline"
                        className="p-1.5 rounded-lg bg-cyan-50 hover:bg-cyan-600 text-cyan-600 hover:text-white border border-cyan-200 hover:border-cyan-600 transition-colors flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                      >
                        <Plus size={13} />
                        <span>Add</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">
                Trending Smart Searches
              </span>

              {[
                { title: "Esports Arena Tournament", category: "Gaming", duration: "8.5s" },
                { title: "Dramatic Zoom Shock", category: "Memes", duration: "4.5s" },
                { title: "Deep Work Mechanical Keyboard", category: "Productivity", duration: "8.0s" },
                { title: "Stock Market Candlestick Chart", category: "Finance", duration: "8.5s" },
                { title: "Matrix Digital Code Rain", category: "Tech", duration: "10.0s" },
                { title: "Heavy Barbell Deadlift", category: "Fitness", duration: "6.5s" },
                { title: "Studio Broadcast Condenser Mic", category: "Podcast", duration: "8.0s" },
                { title: "Exotic Supercar Coastal Highway", category: "Luxury", duration: "8.2s" },
                { title: "University Amphitheater Lecture", category: "Education", duration: "8.0s" },
                { title: "Drone Aerial Mountain Peaks", category: "Travel", duration: "10.0s" },
              ].map((item, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between hover:border-cyan-400 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-600">
                      <Film size={14} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-900">{item.title}</p>
                      <span className="text-[10px] text-slate-500">{item.category} · {item.duration}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setBrollQuery(item.title);
                      void handleSearchBroll(item.title);
                    }}
                    className="p-1 rounded bg-slate-100 hover:bg-cyan-600 text-slate-600 hover:text-white transition-colors cursor-pointer"
                  >
                    <Plus size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======================= TAB: EFFECTS & ZOOMS ======================= */}
        {activeTab === "effects" && (
          <div className="space-y-4">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">
              Punch-in Camera Zooms
            </span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: "Center Punch", scale: 1.25, desc: "Quick focus" },
                { name: "Emphasis Zoom", scale: 1.4, desc: "Keyword hit" },
                { name: "Extreme Punch", scale: 1.6, desc: "High drama" },
                { name: "Slow Push-In", scale: 1.15, desc: "Story drift" },
              ].map((zoom, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (selectedClip) {
                      run((p) =>
                        changeClipProperty(p, selectedClip.id, {
                          transform: {
                            ...selectedClip.transform,
                            scale: zoom.scale,
                          },
                        })
                      );
                      notify(`Applied ${zoom.name} to selected clip.`);
                    } else {
                      notify("Select a clip on the timeline first.");
                    }
                  }}
                  className="p-2.5 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/40 text-left transition-colors"
                >
                  <p className="text-xs font-semibold text-slate-900">{zoom.name}</p>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {zoom.scale}× · {zoom.desc}
                  </span>
                </button>
              ))}
            </div>

            <span className="text-[11px] font-semibold text-slate-500 uppercase mt-4 block">
              Transitions
            </span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: "Cross Dissolve", kind: "dissolve" as TransitionKind, desc: "Smooth blend" },
                { name: "Fade to Black", kind: "fade" as TransitionKind, desc: "Classic scene fade" },
                { name: "Whip Slide", kind: "slide" as TransitionKind, desc: "Dynamic motion" },
                { name: "Zoom Cross", kind: "zoom" as TransitionKind, desc: "Fast push zoom" },
              ].map((tr) => (
                <button
                  key={tr.kind}
                  type="button"
                  onClick={() => handleAddTransition(tr.kind)}
                  className="p-2.5 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/40 text-left transition-colors"
                >
                  <p className="text-xs font-semibold text-slate-900">{tr.name}</p>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {tr.kind} · {tr.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ======================= TAB: PROJECT SETTINGS ======================= */}
        {activeTab === "settings" && (
          <div className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="text-slate-600 font-medium">Canvas Resolution</label>
              <select
                value={project.settings.aspectRatio}
                onChange={(e) =>
                  run((p) => ({
                    ...p,
                    settings: {
                      ...p.settings,
                      aspectRatio: e.target.value as Ratio,
                    },
                  }))
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
              >
                {aspectRatios.map((ratio) => (
                  <option key={ratio} value={ratio}>
                    {ratio} ·{" "}
                    {
                      {
                        "9:16": "Shorts / TikTok (1080×1920)",
                        "16:9": "Widescreen / YouTube (1920×1080)",
                        "1:1": "Square (1080×1080)",
                        "4:5": "Social Feed (1080×1350)",
                        "4:3": "Classic (1440×1080)",
                      }[ratio]
                    }
                  </option>
                ))}
              </select>
            </div>

            {/* 1-Click 9:16 Smart Reframing Suite */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 flex items-center gap-1.5 text-xs">
                  <Sparkles size={13} className="text-blue-600" /> 1-Click 9:16 Reframe
                </span>
                <span className="text-[10px] text-blue-600 font-medium bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-200">
                  AI Smart
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Instantly convert 16:9 landscape footage into viral 9:16 vertical video without distortion.
              </p>
              <div className="grid grid-cols-1 gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    run((p) => reframeProject(p, "fit-with-blur"));
                    notify("Applied 1-Click Fit with Blur (9:16)");
                  }}
                  className="w-full text-left p-2 rounded-lg bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 text-slate-800 transition-colors flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-xs flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500" /> Fit with Blur
                    </div>
                    <div className="text-[10px] text-slate-500">Blurred duplicate background wings</div>
                  </div>
                  <span className="text-[10px] font-semibold text-blue-600">Apply</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    run((p) => reframeProject(p, "center-crop"));
                    notify("Applied 1-Click Center Crop (1.77x Eye-Line)");
                  }}
                  className="w-full text-left p-2 rounded-lg bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 text-slate-800 transition-colors flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-xs flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-500" /> Center Crop
                    </div>
                    <div className="text-[10px] text-slate-500">1.77x punch-in locked to eye-line (-0.14)</div>
                  </div>
                  <span className="text-[10px] font-semibold text-indigo-600">Apply</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    run((p) => reframeProject(p, "split-screen"));
                    notify("Applied 1-Click Split Screen (A-Roll + B-Roll)");
                  }}
                  className="w-full text-left p-2 rounded-lg bg-white border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40 text-slate-800 transition-colors flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-xs flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" /> Split Screen
                    </div>
                    <div className="text-[10px] text-slate-500">A-roll top half + B-roll bottom half</div>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-600">Apply</span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-600 font-medium">Project Frame Rate</label>
              <select
                value={project.settings.fps}
                onChange={(e) =>
                  run((p) => ({
                    ...p,
                    settings: { ...p.settings, fps: Number(e.target.value) },
                  }))
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
              >
                {[24, 30, 60].map((fps) => (
                  <option key={fps} value={fps}>
                    {fps} FPS
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1 font-mono text-[11px] text-slate-500">
              <div className="flex justify-between">
                <span>Base Revision:</span>
                <span className="text-slate-900 font-semibold">v{project.revision}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Tracks:</span>
                <span className="text-slate-900 font-semibold">{project.trackOrder.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Clips:</span>
                <span className="text-slate-900 font-semibold">{Object.keys(project.clips).length}</span>
              </div>
            </div>
          </div>
        )}

        {/* ======================= TAB: INSPECTOR ======================= */}
        {activeTab === "inspector" && (
          <div className="space-y-4 text-xs">
            {selectedClip ? (
              <div className="space-y-4">
                {/* Selected Clip Header */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="flex items-center justify-between">
                    <strong className="text-slate-900 truncate">{selectedClip.name}</strong>
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-mono font-medium capitalize">
                      {selectedTrack?.kind || "clip"}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono">
                    Start: {selectedClip.startTime.toFixed(2)}s · Dur: {selectedClip.duration.toFixed(2)}s
                  </p>
                </div>

                {/* Quick Actions */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">Quick Actions</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => run((p) => splitClip(p, selectedClip.id, playback.getSnapshot().time))}
                      className="py-1.5 px-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium flex items-center justify-center gap-1.5"
                    >
                      <Split size={12} />
                      <span>Split here</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => run((p) => duplicateClip(p, selectedClip.id))}
                      className="py-1.5 px-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium flex items-center justify-center gap-1.5"
                    >
                      <Copy size={12} />
                      <span>Duplicate</span>
                    </button>
                  </div>
                </div>

                {/* Quick Framing (Fit / Fill) for visual assets */}
                {isVisual && selectedAsset && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase">Frame Fitting</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={framing}
                        onClick={() => void handleFrame("fit")}
                        className="py-1.5 px-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium disabled:opacity-50"
                      >
                        Fit Frame
                      </button>
                      <button
                        type="button"
                        disabled={framing}
                        onClick={() => void handleFrame("fill")}
                        className="py-1.5 px-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium disabled:opacity-50"
                      >
                        Fill Frame
                      </button>
                    </div>
                  </div>
                )}

                {/* Transform & Layout Controls */}
                {isVisual && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase">
                        Transform &amp; Layout
                      </span>
                      <button
                        type="button"
                        onClick={() => run((p) => resetClipTransform(p, selectedClip.id))}
                        className="text-[10px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                        title="Reset transform to default"
                      >
                        <RotateCcw size={10} />
                        <span>Reset</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1 text-[11px] text-slate-600">
                        Position X (%)
                        <input
                          type="number"
                          value={Math.round(selectedClip.transform.x * 100)}
                          onChange={(e) =>
                            run((p) =>
                              changeClipProperty(p, selectedClip.id, {
                                transform: {
                                  ...selectedClip.transform,
                                  x: Number(e.target.value) / 100,
                                },
                              })
                            )
                          }
                          className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[11px] text-slate-600">
                        Position Y (%)
                        <input
                          type="number"
                          value={Math.round(selectedClip.transform.y * 100)}
                          onChange={(e) =>
                            run((p) =>
                              changeClipProperty(p, selectedClip.id, {
                                transform: {
                                  ...selectedClip.transform,
                                  y: Number(e.target.value) / 100,
                                },
                              })
                            )
                          }
                          className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                        />
                      </label>
                    </div>

                    {/* Scale: Slider & Number Field (10% to 500%) */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-slate-600 text-[11px]">
                        <span>Scale</span>
                        <span className="font-mono">{Math.round(selectedClip.transform.scale * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={500}
                        step={1}
                        value={Math.round(selectedClip.transform.scale * 100)}
                        onChange={(e) =>
                          run((p) =>
                            changeClipProperty(p, selectedClip.id, {
                              transform: {
                                ...selectedClip.transform,
                                scale: Number(e.target.value) / 100,
                              },
                            })
                          )
                        }
                        className="w-full h-1.5 bg-slate-200 rounded accent-blue-600 cursor-pointer"
                      />
                    </div>

                    {/* Rotation: Slider & Number Field (-180° to +180°) */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-slate-600 text-[11px]">
                        <span>Rotation</span>
                        <span className="font-mono">{Math.round(selectedClip.transform.rotation)}°</span>
                      </div>
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        step={1}
                        value={Math.round(selectedClip.transform.rotation)}
                        onChange={(e) =>
                          run((p) =>
                            changeClipProperty(p, selectedClip.id, {
                              transform: {
                                ...selectedClip.transform,
                                rotation: Number(e.target.value),
                              },
                            })
                          )
                        }
                        className="w-full h-1.5 bg-slate-200 rounded accent-blue-600 cursor-pointer"
                      />
                    </div>

                    {/* Opacity Slider */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-slate-600 text-[11px]">
                        <span>Opacity</span>
                        <span className="font-mono">{Math.round((selectedClip.transform.opacity ?? 1) * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round((selectedClip.transform.opacity ?? 1) * 100)}
                        onChange={(e) =>
                          run((p) =>
                            changeClipProperty(p, selectedClip.id, {
                              transform: {
                                ...selectedClip.transform,
                                opacity: Number(e.target.value) / 100,
                              },
                            })
                          )
                        }
                        className="w-full h-1.5 bg-slate-200 rounded accent-blue-600 cursor-pointer"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => run((p) => resetClipTransform(p, selectedClip.id))}
                      className="w-full py-1.5 px-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium flex items-center justify-center gap-1.5 text-xs mt-1"
                    >
                      <RotateCcw size={12} />
                      <span>Reset Transform</span>
                    </button>
                  </div>
                )}

                {/* Timing & Playback Controls */}
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">Timing &amp; Playback</span>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-[11px] text-slate-600">
                      Start (s)
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        value={Number(selectedClip.startTime.toFixed(2))}
                        onChange={(e) =>
                          run((p) => moveClip(p, selectedClip.id, Math.max(0, Number(e.target.value))))
                        }
                        className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] text-slate-600">
                      Duration (s)
                      <input
                        type="number"
                        step={0.1}
                        min={0.1}
                        value={Number(selectedClip.duration.toFixed(2))}
                        onChange={(e) =>
                          run((p) =>
                            trimClip(
                              p,
                              selectedClip.id,
                              "right",
                              selectedClip.startTime + Math.max(0.1, Number(e.target.value))
                            )
                          )
                        }
                        className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-[11px] text-slate-600">
                      Fade In (s)
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        max={selectedClip.duration}
                        value={selectedClip.fadeIn}
                        onChange={(e) =>
                          run((p) =>
                            changeClipProperty(p, selectedClip.id, {
                              fadeIn: Math.max(0, Number(e.target.value)),
                            })
                          )
                        }
                        className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] text-slate-600">
                      Fade Out (s)
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        max={selectedClip.duration}
                        value={selectedClip.fadeOut}
                        onChange={(e) =>
                          run((p) =>
                            changeClipProperty(p, selectedClip.id, {
                              fadeOut: Math.max(0, Number(e.target.value)),
                            })
                          )
                        }
                        className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900"
                      />
                    </label>
                  </div>

                  {/* Speed Controls: 0.1x to 10x slider, preset chips, pitch preservation */}
                  <div className="space-y-1.5 pt-1 border-t border-slate-100">
                    <div className="flex justify-between items-center text-slate-600 text-[11px]">
                      <span className="font-semibold uppercase text-slate-500 text-[10px] flex items-center gap-1">
                        <Gauge size={11} /> Playback Speed
                      </span>
                      <span className="font-mono text-blue-600 font-bold">{selectedClip.speed.toFixed(2)}×</span>
                    </div>

                    {/* Speed Preset Chips */}
                    <div className="flex gap-1.5">
                      {[0.5, 1, 1.5, 2].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() =>
                            run((p) => changeClipProperty(p, selectedClip.id, { speed: preset }))
                          }
                          className={`flex-1 py-1 rounded text-[10px] font-semibold border ${
                            Math.abs(selectedClip.speed - preset) < 0.01
                              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          {preset}×
                        </button>
                      ))}
                    </div>

                    {/* Speed Slider (0.1x to 10x) */}
                    <input
                      type="range"
                      min={0.1}
                      max={10}
                      step={0.05}
                      value={selectedClip.speed}
                      onChange={(e) =>
                        run((p) =>
                          changeClipProperty(p, selectedClip.id, {
                            speed: Math.max(0.1, Math.min(10, Number(e.target.value))),
                          })
                        )
                      }
                      className="w-full h-1.5 bg-slate-200 rounded accent-blue-600 cursor-pointer"
                    />

                    {/* Pitch Preservation Toggle */}
                    {selectedAsset?.kind !== "image" && (
                      <label className="flex items-center gap-2 text-[10px] text-slate-600 cursor-pointer pt-0.5">
                        <input
                          type="checkbox"
                          checked={selectedClip.preservePitch !== false}
                          onChange={(e) =>
                            run((p) =>
                              changeClipProperty(p, selectedClip.id, {
                                preservePitch: e.target.checked,
                              })
                            )
                          }
                          className="rounded border-slate-300 text-blue-600 accent-blue-600"
                        />
                        <span>Preserve pitch (voice tone)</span>
                      </label>
                    )}
                  </div>

                  {/* Replace Media Dropdown */}
                  {selectedAsset && selectedTrack && (
                    <label className="flex flex-col gap-1 text-[11px] text-slate-600">
                      Replace clip media
                      <select
                        aria-label="Replace clip media"
                        value={selectedAsset.id}
                        onChange={(e) => run((p) => replaceClipAsset(p, selectedClip.id, e.target.value))}
                        className="bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-slate-900"
                      >
                        {Object.values(project.assets)
                          .filter((a) => canPlace(selectedTrack.kind, a.kind))
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({a.kind})
                            </option>
                          ))}
                      </select>
                    </label>
                  )}

                  {selectedAsset && (
                    <p className="text-[10px] text-slate-500 font-mono">
                      Source: {selectedClip.sourceStart.toFixed(2)}s → {selectedClip.sourceEnd.toFixed(2)}s
                    </p>
                  )}
                </div>

                {/* Visual Adjustments & Media Animations */}
                {isVisual && (
                  <div className="space-y-2.5">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase">
                      Visual Adjustments
                    </span>
                    {(["brightness", "contrast", "saturation"] as const).map((key) => (
                      <div key={key} className="space-y-1">
                        <div className="flex justify-between text-slate-600 text-[11px] capitalize">
                          <span>{key}</span>
                          <span>{selectedClip.effects[key]}</span>
                        </div>
                        <input
                          type="range"
                          min={-100}
                          max={100}
                          value={selectedClip.effects[key]}
                          onChange={(e) =>
                            run((p) =>
                              changeClipProperty(p, selectedClip.id, {
                                effects: { ...selectedClip.effects, [key]: Number(e.target.value) },
                              })
                            )
                          }
                          className="w-full h-1.5 bg-slate-200 rounded accent-blue-600 cursor-pointer"
                        />
                      </div>
                    ))}

                    <div className="space-y-1">
                      <div className="flex justify-between text-slate-600 text-[11px]">
                        <span>Blur</span>
                        <span>{selectedClip.effects.blur.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={20}
                        step={0.5}
                        value={selectedClip.effects.blur}
                        onChange={(e) =>
                          run((p) =>
                            changeClipProperty(p, selectedClip.id, {
                              effects: { ...selectedClip.effects, blur: Number(e.target.value) },
                            })
                          )
                        }
                        className="w-full h-1.5 bg-slate-200 rounded accent-blue-600 cursor-pointer"
                      />
                    </div>

                    {/* Chromatic RGB Offset */}
                    <div className="space-y-1 pt-1 border-t border-slate-100">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase">
                        Chromatic RGB Offset
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <div className="flex justify-between text-slate-600 text-[10px]">
                            <span>Shift X</span>
                            <span>{currentRgb.x}px</span>
                          </div>
                          <input
                            type="range"
                            min={-24}
                            max={24}
                            value={currentRgb.x}
                            onChange={(e) => handleRgbChange("x", Number(e.target.value))}
                            className="w-full h-1 bg-slate-200 rounded accent-cyan-600 cursor-pointer"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-slate-600 text-[10px]">
                            <span>Shift Y</span>
                            <span>{currentRgb.y}px</span>
                          </div>
                          <input
                            type="range"
                            min={-24}
                            max={24}
                            value={currentRgb.y}
                            onChange={(e) => handleRgbChange("y", Number(e.target.value))}
                            className="w-full h-1 bg-slate-200 rounded accent-cyan-600 cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Media Animation Controls (Entrance, Exit, Loop) */}
                    <MediaAnimationControls clipId={selectedClip.id} />
                  </div>
                )}

                {/* Caption & Text Editing Controls */}
                {selectedLayer && (
                  <div className="space-y-2.5 pt-2 border-t border-slate-200">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase">
                      {selectedTrack?.kind === "caption" ? "Caption Content & Style" : "Text Layer"}
                    </span>

                    <label className="flex flex-col gap-1 text-[11px] text-slate-600">
                      Text Content
                      <textarea
                        rows={3}
                        value={selectedLayer.text}
                        onChange={(e) => run((p) => changeText(p, selectedClip.id, e.target.value))}
                        className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white resize-y"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1 text-[11px] text-slate-600">
                        Font Family
                        <select
                          value={selectedLayer.style.font}
                          onChange={(e) => handleTextStyleChange({ font: e.target.value })}
                          className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900"
                        >
                          {["Inter", "Montserrat", "Outfit", "Oswald", "Poppins", "JetBrains Mono"].map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-[11px] text-slate-600">
                        Font Weight
                        <select
                          value={selectedLayer.style.weight}
                          onChange={(e) => handleTextStyleChange({ weight: Number(e.target.value) })}
                          className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900"
                        >
                          {[400, 500, 600, 700, 800, 900].map((w) => (
                            <option key={w} value={w}>
                              {w}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1 text-[11px] text-slate-600">
                        Font Size (px)
                        <input
                          type="number"
                          min={8}
                          max={400}
                          value={selectedLayer.style.size}
                          onChange={(e) =>
                            handleTextStyleChange({ size: Math.max(8, Math.min(400, Number(e.target.value))) })
                          }
                          className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900"
                        />
                      </label>
                      <div className="flex flex-col gap-1 text-[11px] text-slate-600">
                        <span>Alignment</span>
                        <div className="grid grid-cols-3 gap-1">
                          {(["left", "center", "right"] as const).map((align) => (
                            <button
                              key={align}
                              type="button"
                              onClick={() => handleTextStyleChange({ align })}
                              className={`py-1 rounded border text-[10px] font-medium flex items-center justify-center ${
                                selectedLayer.style.align === align
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                              }`}
                            >
                              {align === "left" ? <AlignLeft size={11} /> : align === "center" ? <AlignCenter size={11} /> : <AlignRight size={11} />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center justify-between text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                        <span>Text Color</span>
                        <input
                          type="color"
                          value={selectedLayer.style.color}
                          onChange={(e) => handleTextStyleChange({ color: e.target.value, gradient: null })}
                          className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                        />
                      </label>
                      <label className="flex items-center justify-between text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                        <span>Stroke Color</span>
                        <input
                          type="color"
                          value={selectedLayer.style.stroke}
                          onChange={(e) => handleTextStyleChange({ stroke: e.target.value })}
                          className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1 text-[11px] text-slate-600">
                        Stroke Width
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={selectedLayer.style.strokeWidth}
                          onChange={(e) =>
                            handleTextStyleChange({ strokeWidth: Math.max(0, Number(e.target.value)) })
                          }
                          className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[11px] text-slate-600">
                        Shadow Blur
                        <input
                          type="number"
                          min={0}
                          max={50}
                          value={selectedLayer.style.shadow}
                          onChange={(e) =>
                            handleTextStyleChange({ shadow: Math.max(0, Number(e.target.value)) })
                          }
                          className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900"
                        />
                      </label>
                    </div>

                    {/* Gradient fill controls */}
                    <TextFillControls style={selectedLayer.style} onChange={handleTextStyleChange} />

                    {/* Caption Studio Template Selector & Highlight Color for Captions */}
                    {selectedTrack?.kind === "caption" && (
                      <div className="space-y-2 pt-1 border-t border-slate-100">
                        <label className="flex flex-col gap-1 text-[11px] text-slate-600">
                          Apply Caption Template Preset
                          <select
                            value={project.captions[selectedClip.contentId!]?.templateId || activeCaptionTemplate}
                            onChange={(e) => {
                              const template = ALL_CAPTION_TEMPLATES.find((t) => t.id === e.target.value);
                              if (template) {
                                run((p) => applyCaptionTemplate(p, [selectedClip.id], template));
                                notify(`Applied "${template.name}" template to caption.`);
                              }
                            }}
                            className="bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-slate-900 font-medium"
                          >
                            {ALL_CAPTION_TEMPLATES.map((tmpl) => (
                              <option key={tmpl.id} value={tmpl.id}>
                                {tmpl.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        {/* Active Word Highlight Color */}
                        <div className="space-y-1.5 pt-1">
                          <div className="flex justify-between items-center text-[11px] text-slate-600">
                            <span className="font-semibold text-slate-500 uppercase text-[10px] flex items-center gap-1">
                              <Sparkles size={11} className="text-blue-600" /> Active Word Highlight
                            </span>
                            <span className="font-mono text-blue-600 font-bold uppercase text-[10px]">
                              {project.captions[selectedClip.contentId!]?.highlightColor || "#FAFF00"}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              aria-label="Active word highlight color"
                              value={project.captions[selectedClip.contentId!]?.highlightColor || "#FAFF00"}
                              onChange={(e) =>
                                run((p) =>
                                  changeCaptionProperty(p, selectedClip.id, {
                                    highlightColor: e.target.value,
                                  })
                                )
                              }
                              className="w-7 h-7 rounded border border-slate-200 p-0.5 cursor-pointer bg-white"
                            />
                            <div className="flex gap-1 flex-1">
                              {["#FAFF00", "#00F0FF", "#00F298", "#FF6B00", "#FF2A85", "#FFFFFF"].map((col) => (
                                <button
                                  key={col}
                                  type="button"
                                  onClick={() =>
                                    run((p) =>
                                      changeCaptionProperty(p, selectedClip.id, {
                                        highlightColor: col,
                                      })
                                    )
                                  }
                                  className={`w-5 h-5 rounded border ${
                                    (project.captions[selectedClip.contentId!]?.highlightColor || "#FAFF00").toLowerCase() === col.toLowerCase()
                                      ? "ring-2 ring-blue-600 ring-offset-1"
                                      : "border-slate-300"
                                  }`}
                                  style={{ backgroundColor: col }}
                                  title={`Set highlight color to ${col}`}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Audio Controls */}
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">Audio Settings</span>

                  <label className="flex flex-col gap-1 text-[11px] text-slate-600">
                    Audio Role
                    <select
                      value={selectedClip.audioRole || audioRole(project, selectedClip)}
                      onChange={(e) =>
                        run((p) =>
                          changeClipProperty(p, selectedClip.id, {
                            audioRole: e.target.value as AudioRole,
                          })
                        )
                      }
                      className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900"
                    >
                      <option value="speech">Speech / Dialogue</option>
                      <option value="background">Background / Music</option>
                      <option value="sfx">Sound Effect (SFX)</option>
                    </select>
                  </label>

                  {(selectedClip.audioRole || audioRole(project, selectedClip)) !== "speech" && (
                    <label className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedClip.ducking !== false}
                        onChange={(e) =>
                          run((p) => changeClipProperty(p, selectedClip.id, { ducking: e.target.checked }))
                        }
                        className="rounded border-slate-300 text-blue-600 accent-blue-600"
                      />
                      <span>Soften under speech (Audio Ducking)</span>
                    </label>
                  )}

                  {/* Audio Volume & Mute Toggle with dB readout */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-slate-600 text-[11px]">
                      <span>Volume</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px]">
                          {Math.round(selectedClip.volume * 100)}% (
                          {selectedClip.volume > 0
                            ? (20 * Math.log10(selectedClip.volume) >= 0 ? "+" : "") +
                              (20 * Math.log10(selectedClip.volume)).toFixed(1) +
                              " dB"
                            : "-∞ dB"}
                          )
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            run((p) =>
                              changeClipProperty(p, selectedClip.id, {
                                volume: selectedClip.volume ? 0 : 1,
                              })
                            )
                          }
                          className={`p-1 rounded text-slate-600 ${
                            selectedClip.volume === 0 ? "bg-rose-100 text-rose-700" : "hover:bg-slate-100"
                          }`}
                          title={selectedClip.volume ? "Mute" : "Unmute"}
                        >
                          {selectedClip.volume === 0 ? <VolumeX size={12} /> : <Volume2 size={12} />}
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={200}
                      value={Math.round(selectedClip.volume * 100)}
                      onChange={(e) =>
                        run((p) =>
                          changeClipProperty(p, selectedClip.id, {
                            volume: Number(e.target.value) / 100,
                          })
                        )
                      }
                      className="w-full h-1.5 bg-slate-200 rounded accent-blue-600 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Delete Button */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      run((p) => removeClip(p, selectedClip.id));
                      select([]);
                    }}
                    className="w-full py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-colors font-medium text-xs flex items-center justify-center gap-1.5"
                  >
                    <Trash2 size={13} />
                    <span>Delete Clip</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500 space-y-2">
                <SlidersHorizontal size={24} className="mx-auto opacity-40" />
                <p>Select any clip on the timeline to inspect and edit its properties.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
