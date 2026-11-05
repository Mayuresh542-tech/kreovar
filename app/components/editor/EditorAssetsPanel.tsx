"use client";

import React, { useState, useEffect, useRef } from "react";
import { BRollVideoItem } from "@/app/api/broll/search/route";
import { CURATED_MUSIC_TRACKS, MusicTrackItem } from "@/app/lib/timeline/musicTracks";
import {
  Folder,
  Music,
  Type,
  MessageSquare,
  Image as ImageIcon,
  Sparkles,
  Palette,
  Layers,
  LayoutTemplate,
  Crown,
  Bot,
  Search,
  Upload,
  Play,
  Pause,
  Plus,
  Trash2,
  Check,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Wand2,
  Video,
  Mic,
  FolderKanban,
} from "lucide-react";
import {
  VeeloxTimelineProject,
  TimelineItem,
  TimelineTrackType,
  TimelineItemType,
  TransitionType,
  FilterPresetId,
  TimelineEffect,
  AspectRatio,
} from "@/app/lib/timeline/types";
import { CAPTION_PRESETS, CaptionPresetId, CaptionStyleConfig } from "@/app/lib/captions/presets";
import {
  DEFAULT_CAPTION_TEMPLATES,
  CAPTION_CATEGORIES,
  CaptionTemplate,
  getTemplateById,
} from "@/app/lib/captions/templates";
import CaptionCustomizer from "../captions/CaptionCustomizer";
import {
  exportToSRT,
  exportToVTT,
  exportToASS,
} from "@/app/lib/captions/subtitlesParser";
import { VeeloxProject } from "@/app/lib/services/types";

export type AssetPanelTab =
  | "media"
  | "audio"
  | "text"
  | "captions"
  | "backgrounds"
  | "effects"
  | "filters"
  | "transitions"
  | "templates"
  | "brand"
  | "ai";

interface EditorAssetsPanelProps {
  timeline: VeeloxTimelineProject;
  selectedClip: TimelineItem | null;
  projectId?: string;
  project?: VeeloxProject | null;
  onReplaceClipSource: (clipId: string, newUrl: string, title?: string, thumbnail?: string) => void;
  onSelectMusicTrack: (track: MusicTrackItem) => void;
  onAddTimelineItem?: (item: Partial<TimelineItem> & { track: TimelineTrackType; type: TimelineItemType }) => void;
  onImportSubtitles?: (content: string, format: "srt" | "vtt" | "ass") => void;
  onExportSubtitles?: (format: "srt" | "vtt" | "ass") => void;
  onApplyCaptionPreset?: (presetId: CaptionPresetId, style?: CaptionStyleConfig) => void;
  onApplyEffectToClip?: (effectType: TimelineEffect["type"], intensity: number) => void;
  onApplyFilterToClip?: (filterPreset: FilterPresetId, intensity: number) => void;
  onApplyTransitionToClip?: (transition: TransitionType) => void;
  onApplyAIAutoEdit?: (mode: "quick_social" | "cinematic" | "clean" | "high_energy" | "storytelling") => void;
  onRemoveSilences?: (sensitivity: number, minDuration: number, padding: number) => void;
  onAutoReframe?: (targetRatio: AspectRatio) => void;
  onApplyBrandKit?: (brandKit: NonNullable<VeeloxTimelineProject["settings"]["brandKit"]>) => void;
  onUpdateWatermark?: (watermark: NonNullable<VeeloxTimelineProject["settings"]["watermark"]>) => void;
  activeMusicUrl?: string;
  scriptText?: string;
  scenes?: Array<{ id: string; label?: string; text: string }>;
  isOpen?: boolean;
  onToggleOpen?: () => void;
  width?: number;
}

interface LocalUploadedMedia {
  id: string;
  name: string;
  url: string;
  type: "video" | "audio" | "image";
  duration: number;
  thumbnail?: string;
}

export default function EditorAssetsPanel({
  timeline,
  selectedClip,
  onReplaceClipSource,
  onSelectMusicTrack,
  onAddTimelineItem,
  onImportSubtitles,
  onExportSubtitles,
  onApplyCaptionPreset,
  onApplyEffectToClip,
  onApplyFilterToClip,
  onApplyTransitionToClip,
  onApplyAIAutoEdit,
  onRemoveSilences,
  onAutoReframe,
  onApplyBrandKit,
  onUpdateWatermark,
  activeMusicUrl,
  scriptText,
  scenes,
  projectId,
  project,
  isOpen = true,
  onToggleOpen,
  width = 336,
}: EditorAssetsPanelProps) {
  const [activeTab, setActiveTab] = useState<AssetPanelTab>("media");
  const [searchQuery, setSearchQuery] = useState("cinematic drone city");
  const [stockVideos, setStockVideos] = useState<BRollVideoItem[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [playingMusicId, setPlayingMusicId] = useState<string | null>(null);
  const [hoveredVideoId, setHoveredVideoId] = useState<string | null>(null);
  const [localMediaList, setLocalMediaList] = useState<LocalUploadedMedia[]>([]);

  // AI Silence Removals state
  const [silenceSensitivity, setSilenceSensitivity] = useState(30); // dB threshold
  const [silenceMinDur, setSilenceMinDur] = useState(0.4); // seconds
  const silencePadding = 0.1; // seconds

  // Filter intensity state
  const [filterIntensity, setFilterIntensity] = useState(80);

  // Caption Templates state
  const [captionCategory, setCaptionCategory] = useState<string>("All");
  const [isCustomizingCaption, setIsCustomizingCaption] = useState(false);

  // Subtitle import file ref
  const subtitleFileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaFileInputRef = useRef<HTMLInputElement | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  const QUICK_TAGS = [
    "Technology",
    "Cyberpunk",
    "City Drone",
    "AI Future",
    "Coding",
    "Finance",
    "Speed Car",
    "Abstract",
  ];

  async function searchStock(term: string) {
    if (!term.trim()) return;
    setLoadingVideos(true);
    try {
      const res = await fetch(
        `/api/broll/search?query=${encodeURIComponent(term)}&orientation=portrait&per_page=12`
      );
      const data = await res.json();
      if (res.ok && data.videos) {
        setStockVideos(data.videos);
      }
    } catch (err) {
      console.warn("Failed to load stock videos:", err);
    } finally {
      setLoadingVideos(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/broll/search?query=cinematic%20drone%20city&orientation=portrait&per_page=12`)
      .then((res) => res.json())
      .then((data) => {
        if (active && data.videos) {
          setStockVideos(data.videos);
        }
      })
      .catch((err) => console.warn("Failed initial stock load:", err));

    return () => {
      active = false;
    };
  }, []);

  function togglePreviewAudio(track: MusicTrackItem) {
    if (playingMusicId === track.id) {
      audioPreviewRef.current?.pause();
      setPlayingMusicId(null);
    } else {
      if (audioPreviewRef.current) {
        audioPreviewRef.current.src = track.audioUrl;
        audioPreviewRef.current.volume = 0.5;
        audioPreviewRef.current.play().catch(() => {});
      }
      setPlayingMusicId(track.id);
    }
  }

  // Handle local media file upload
  function handleMediaFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const objectUrl = URL.createObjectURL(file);
      const isVideo = file.type.startsWith("video/") || file.name.endsWith(".mp4") || file.name.endsWith(".mov");
      const isAudio = file.type.startsWith("audio/") || file.name.endsWith(".mp3") || file.name.endsWith(".wav");
      const isImage = file.type.startsWith("image/");

      const itemType = isVideo ? "video" : isAudio ? "audio" : isImage ? "image" : "video";

      const newMedia: LocalUploadedMedia = {
        id: `local_${Date.now()}_${i}`,
        name: file.name,
        url: objectUrl,
        type: itemType,
        duration: isVideo ? 15 : isAudio ? 30 : 5,
        thumbnail: isImage ? objectUrl : undefined,
      };

      setLocalMediaList((prev) => [newMedia, ...prev]);
    }
  }

  // Handle subtitle file upload
  async function handleSubtitleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split(".").pop()?.toLowerCase();
    const content = await file.text();

    if (extension === "srt") {
      onImportSubtitles?.(content, "srt");
    } else if (extension === "vtt") {
      onImportSubtitles?.(content, "vtt");
    } else if (extension === "ass" || extension === "ssa") {
      onImportSubtitles?.(content, "ass");
    } else {
      // Default to SRT parsing
      onImportSubtitles?.(content, "srt");
    }
  }

  // Export captions as file
  function handleExportCaptions(format: "srt" | "vtt" | "ass") {
    if (onExportSubtitles) {
      onExportSubtitles(format);
      return;
    }
    const captionTrack = timeline.tracks.find((t) => t.type === "captions");
    if (!captionTrack || captionTrack.items.length === 0) {
      alert("No captions found on timeline to export.");
      return;
    }
    const exportable = captionTrack.items.map((c) => ({
      text: c.source,
      startTime: c.startTime,
      endTime: c.endTime,
    }));

    let output = "";
    let mimeType = "text/plain";
    const filename = `captions_${timeline.id || "project"}.${format}`;

    if (format === "srt") {
      output = exportToSRT(exportable);
    } else if (format === "vtt") {
      output = exportToVTT(exportable);
      mimeType = "text/vtt";
    } else if (format === "ass") {
      output = exportToASS(exportable, timeline.resolution.width, timeline.resolution.height);
    }

    const blob = new Blob([output], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!isOpen) {
    return (
      <div className="w-12 h-full bg-white border-r border-slate-200 flex flex-col items-center py-3 gap-3 shrink-0 select-none">
        <button
          type="button"
          onClick={onToggleOpen}
          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer transition-colors"
          title="Expand Tools Panel"
        >
          <FolderKanban className="w-4 h-4" />
        </button>
        <span className="text-[10px] font-mono text-slate-400 [writing-mode:vertical-lr] tracking-widest uppercase mt-4">
          Assets
        </span>
      </div>
    );
  }

  return (
    <div
      style={{ width: `${width}px` }}
      className="h-full bg-white border-r border-slate-200 flex shrink-0 overflow-hidden select-none"
    >
      <audio
        ref={audioPreviewRef}
        onEnded={() => setPlayingMusicId(null)}
        className="hidden"
      />

      {/* Hidden File Inputs */}
      <input
        ref={mediaFileInputRef}
        type="file"
        multiple
        accept="video/*,audio/*,image/*,.mp4,.mov,.webm,.mkv,.mp3,.wav,.m4a,.aac,.png,.jpg,.jpeg,.webp"
        onChange={handleMediaFileUpload}
        className="hidden"
      />
      <input
        ref={subtitleFileInputRef}
        type="file"
        accept=".srt,.vtt,.ass,.ssa"
        onChange={handleSubtitleFileUpload}
        className="hidden"
      />

      {/* 1. LEFT ICON TAB STRIP (Sleek, Clean SaaS Workstation) */}
      <div className="w-14 h-full bg-slate-50 border-r border-slate-200 flex flex-col items-center py-2.5 gap-1 shrink-0 overflow-y-auto custom-scrollbar select-none">
        {[
          { id: "media", label: "Media", icon: Folder },
          { id: "audio", label: "Audio", icon: Music },
          { id: "text", label: "Text", icon: Type },
          { id: "captions", label: "Captions", icon: MessageSquare },
          { id: "backgrounds", label: "Backdrop", icon: ImageIcon },
          { id: "effects", label: "Effects", icon: Sparkles },
          { id: "filters", label: "Filters", icon: Palette },
          { id: "transitions", label: "Transitions", icon: Layers },
          { id: "templates", label: "Templates", icon: LayoutTemplate },
          { id: "brand", label: "Brand", icon: Crown },
          { id: "ai", label: "AI Tools", icon: Wand2 },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as AssetPanelTab)}
              className={`w-11 py-2 rounded-xl flex flex-col items-center gap-1 cursor-pointer transition-all ${
                isActive
                  ? "bg-slate-900 text-white shadow-2xs font-semibold"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/60"
              }`}
              title={tab.label}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[9px] font-medium tracking-tight">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* 2. TAB CONTENT AREA */}
      <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
        {/* Header with Title & Collapse */}
        <div className="h-11 px-3 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 tracking-tight">
            {activeTab === "media" && <><Folder className="w-3.5 h-3.5 text-slate-700" /><span>Media Library</span></>}
            {activeTab === "audio" && <><Music className="w-3.5 h-3.5 text-slate-700" /><span>Audio & Music</span></>}
            {activeTab === "text" && <><Type className="w-3.5 h-3.5 text-slate-700" /><span>Text Overlays</span></>}
            {activeTab === "captions" && <><MessageSquare className="w-3.5 h-3.5 text-slate-700" /><span>Subtitle Editor</span></>}
            {activeTab === "backgrounds" && <><ImageIcon className="w-3.5 h-3.5 text-slate-700" /><span>Backdrops & Backgrounds</span></>}
            {activeTab === "effects" && <><Sparkles className="w-3.5 h-3.5 text-slate-700" /><span>Visual Effects</span></>}
            {activeTab === "filters" && <><Palette className="w-3.5 h-3.5 text-slate-700" /><span>Color Filters</span></>}
            {activeTab === "transitions" && <><Layers className="w-3.5 h-3.5 text-slate-700" /><span>Transitions</span></>}
            {activeTab === "templates" && <><LayoutTemplate className="w-3.5 h-3.5 text-slate-700" /><span>Video Templates</span></>}
            {activeTab === "brand" && <><Crown className="w-3.5 h-3.5 text-slate-700" /><span>Brand Kit & Logo</span></>}
            {activeTab === "ai" && <><Wand2 className="w-3.5 h-3.5 text-slate-700" /><span>AI Auto-Editing</span></>}
          </div>
          {onToggleOpen && (
            <button
              type="button"
              onClick={onToggleOpen}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 cursor-pointer transition-colors"
              title="Collapse Panel"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
          {/* TAB 1: MEDIA (Stock B-Roll & Local Uploads) */}
          {activeTab === "media" && (
            <div className="flex flex-col gap-3">
              {/* ATTACHED PROJECT ASSETS (Auto-loaded from Project Hub) */}
              {project && (
                ((project.raw_footage && project.raw_footage.length > 0) ||
                (project.broll_assets && project.broll_assets.length > 0) ||
                (project.voiceovers && project.voiceovers.length > 0)) && (
                  <div className="flex flex-col gap-2 p-2.5 rounded-xl bg-blue-50/40 border border-blue-200/80">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-blue-700 font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                        Project Assets
                      </span>
                      <span className="text-[9px] font-mono text-slate-500">
                        {(project.raw_footage?.length || 0) + (project.broll_assets?.length || 0) + (project.voiceovers?.length || 0)} items
                      </span>
                    </div>

                    {/* Raw Footage Clips */}
                    {project.raw_footage && project.raw_footage.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[9px] font-mono text-slate-500 font-semibold uppercase">
                          Raw Footage ({project.raw_footage.length})
                        </span>
                        <div className="grid grid-cols-1 gap-1">
                          {project.raw_footage.map((rf) => (
                            <div
                              key={rf.id}
                              className="p-1.5 rounded-lg bg-white border border-slate-200 flex items-center justify-between gap-2 shadow-2xs"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-[11px] font-semibold text-slate-900 truncate">{rf.name}</div>
                                <div className="text-[9px] font-mono text-slate-500">{rf.duration ? `${rf.duration}s` : "Video Clip"}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  onAddTimelineItem?.({
                                    track: "video",
                                    type: "raw",
                                    metadata: { title: rf.name },
                                    source: rf.url,
                                    duration: rf.duration || 10,
                                    startTime: timeline.duration || 0,
                                  })
                                }
                                className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-semibold cursor-pointer shrink-0 transition-colors"
                              >
                                + Video
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Project B-Roll Assets */}
                    {project.broll_assets && project.broll_assets.length > 0 && (
                      <div className="space-y-1 pt-1 border-t border-blue-200/60">
                        <span className="text-[9px] font-mono text-slate-500 font-semibold uppercase">
                          B-Roll Cutaways ({project.broll_assets.length})
                        </span>
                        <div className="grid grid-cols-2 gap-1.5">
                          {project.broll_assets.map((ba) => (
                            <div
                              key={ba.id}
                              className="p-1.5 rounded-lg bg-white border border-slate-200 flex flex-col gap-1 shadow-2xs"
                            >
                              <div className="w-full h-12 rounded bg-slate-100 overflow-hidden border border-slate-200">
                                <img src={ba.thumbnail_url || ba.thumbnail || ""} alt="" className="w-full h-full object-cover" />
                              </div>
                              <div className="text-[9px] font-medium text-slate-800 truncate">{ba.title}</div>
                              <button
                                type="button"
                                onClick={() =>
                                  onAddTimelineItem?.({
                                    track: "overlays",
                                    type: "broll",
                                    metadata: { title: ba.title },
                                    source: ba.url,
                                    duration: ba.duration || 5,
                                    startTime: 0,
                                  })
                                }
                                className="w-full py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[9px] font-medium cursor-pointer transition-colors"
                              >
                                + Cutaway
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Project Voiceovers */}
                    {project.voiceovers && project.voiceovers.length > 0 && (
                      <div className="space-y-1 pt-1 border-t border-blue-200/60">
                        <span className="text-[9px] font-mono text-slate-500 font-semibold uppercase">
                          Voiceovers ({project.voiceovers.length})
                        </span>
                        <div className="grid grid-cols-1 gap-1">
                          {project.voiceovers.map((vo) => (
                            <div
                              key={vo.id}
                              className="p-1.5 rounded-lg bg-white border border-slate-200 flex items-center justify-between gap-2 shadow-2xs"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-[11px] font-semibold text-slate-900 truncate">{vo.title || vo.voiceName || "Voiceover"}</div>
                                <div className="text-[9px] font-mono text-slate-500">{vo.voice_id || vo.voiceId || "Voice service"}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  onAddTimelineItem?.({
                                    track: "voiceover",
                                    type: "voiceover",
                                    metadata: { title: vo.title || vo.voiceName || "Voiceover Audio" },
                                    source: vo.audio_url || vo.url,
                                    duration: vo.duration || 15,
                                    startTime: 0,
                                  })
                                }
                                className="px-2 py-0.5 rounded bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-semibold cursor-pointer shrink-0 transition-colors"
                              >
                                + Voice
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              )}

              {/* Upload Files CTA */}
              <div
                onClick={() => mediaFileInputRef.current?.click()}
                className="p-3 rounded-xl border border-dashed border-slate-300 hover:border-slate-500 bg-slate-50 hover:bg-slate-100 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all group"
              >
                <Upload className="w-5 h-5 text-slate-500 group-hover:text-slate-900 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-semibold text-slate-800">Import Media Files</span>
                <span className="text-[9px] font-mono text-slate-500 text-center">
                  MP4, MOV, WebM, MP3, WAV, PNG, JPG (Click or Drag &amp; Drop)
                </span>
              </div>

              {/* Local Uploaded Files (if any) */}
              {localMediaList.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">
                    Project Uploads ({localMediaList.length})
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {localMediaList.map((media) => (
                      <div
                        key={media.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            "application/json",
                            JSON.stringify({
                              type: "broll",
                              videoUrl: media.url,
                              title: media.name,
                              thumbnail: media.thumbnail,
                              duration: media.duration,
                              source: "local_upload",
                            })
                          );
                        }}
                        className="p-2 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-400 flex flex-col gap-1 cursor-grab active:cursor-grabbing group shadow-2xs"
                      >
                        <div className="w-full h-16 rounded-lg bg-slate-200 flex items-center justify-center overflow-hidden border border-slate-200">
                          {media.thumbnail ? (
                            <img src={media.thumbnail} alt="thumb" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-2xl">{media.type === "audio" ? "🎵" : "🎬"}</span>
                          )}
                        </div>
                        <span className="text-[10px] font-semibold text-slate-900 truncate">{media.name}</span>
                        <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
                          <span>{media.duration}s</span>
                          <span className="text-blue-600 group-hover:underline">Drag ⠿</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stock B-Roll Search */}
              <div className="flex flex-col gap-2 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">
                    Stock B-Roll Library
                  </span>
                  <span className="text-[9px] font-mono text-blue-600 font-semibold">HD Royalty Free</span>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void searchStock(searchQuery);
                  }}
                  className="flex gap-1.5"
                >
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search footage (e.g. city, drone, coding)..."
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer shrink-0 transition-colors shadow-2xs"
                  >
                    Search
                  </button>
                </form>

                {/* Quick tags */}
                <div className="flex flex-wrap gap-1">
                  {QUICK_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setSearchQuery(tag);
                        void searchStock(tag);
                      }}
                      className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-200 text-[9px] font-mono text-slate-700 cursor-pointer"
                    >
                      {tag}
                    </button>
                  ))}
                </div>

                {/* Stock Video Grid */}
                {loadingVideos ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                    <div className="w-5 h-5 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" />
                    <span className="text-[10px] font-mono">Fetching stock footage...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {stockVideos.map((vid) => {
                      const videoSrc = vid.videoUrl || "";
                      const thumb = vid.thumbnail || "";
                      return (
                        <div
                          key={vid.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData(
                              "application/json",
                              JSON.stringify({
                                type: "broll",
                                videoUrl: videoSrc,
                                title: `Stock #${vid.id}`,
                                thumbnail: thumb,
                                duration: vid.duration || 8,
                                source: "pexels",
                              })
                            );
                          }}
                          onMouseEnter={() => setHoveredVideoId(String(vid.id))}
                          onMouseLeave={() => setHoveredVideoId(null)}
                          onClick={() => {
                            if (selectedClip) {
                              onReplaceClipSource(selectedClip.id, videoSrc, `Stock #${vid.id}`, thumb);
                            }
                          }}
                          className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-200 hover:border-blue-500 group cursor-grab active:cursor-grabbing transition-all aspect-[9/14] shadow-2xs"
                        >
                          {hoveredVideoId === String(vid.id) ? (
                            <video
                              src={videoSrc}
                              autoPlay
                              muted
                              loop
                              playsInline
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <img src={thumb} alt="thumb" className="w-full h-full object-cover" />
                          )}

                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 pointer-events-none">
                            <span className="text-[9px] font-mono font-bold text-white">
                              {vid.duration}s · Drag ⠿
                            </span>
                            <span className="text-[8px] text-blue-200 font-mono">
                              {selectedClip ? "Click to Replace" : "Drag to Timeline"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: AUDIO (Music & SFX) */}
          {activeTab === "audio" && (
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">
                Curated Soundtrack Tracks
              </span>
              <div className="flex flex-col gap-2">
                {CURATED_MUSIC_TRACKS.map((track) => {
                  const isCurrent = activeMusicUrl === track.audioUrl;
                  const isAuditioning = playingMusicId === track.id;

                  return (
                    <div
                      key={track.id}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                        isCurrent
                          ? "bg-purple-50/70 border-purple-300 shadow-2xs"
                          : "bg-white border-slate-200 hover:border-slate-300 shadow-2xs"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => togglePreviewAudio(track)}
                          className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center text-xs shrink-0 cursor-pointer"
                        >
                          {isAuditioning ? "⏸" : "▶"}
                        </button>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-semibold text-slate-900 truncate">{track.title}</span>
                          <span className="text-[9px] font-mono text-purple-700 truncate font-medium">
                            {track.genre} · {track.artist}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onSelectMusicTrack(track)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold cursor-pointer transition-colors ${
                          isCurrent
                            ? "bg-purple-600 text-white"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {isCurrent ? "Active ✓" : "Use"}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Sound Effects (SFX) Presets */}
              <div className="pt-3 border-t border-slate-200 flex flex-col gap-2">
                <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">
                  Sound Effects (SFX)
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { name: "Whoosh Transition", icon: "💨", dur: 1.2 },
                    { name: "Camera Shutter", icon: "📸", dur: 0.8 },
                    { name: "Pop Notification", icon: "🔔", dur: 0.5 },
                    { name: "Impact Boom", icon: "💥", dur: 2.0 },
                  ].map((sfx) => (
                    <button
                      key={sfx.name}
                      type="button"
                      onClick={() => {
                        onAddTimelineItem?.({
                          track: "sfx",
                          type: "sfx",
                          source: `sfx_${sfx.name.toLowerCase().replace(/\s+/g, "_")}`,
                          duration: sfx.dur,
                          volume: 0.8,
                        });
                      }}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 text-left flex items-center gap-2 cursor-pointer transition-all shadow-2xs"
                    >
                      <span className="text-base">{sfx.icon}</span>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-bold text-slate-900 truncate">{sfx.name}</span>
                        <span className="text-[8px] font-mono text-slate-500">{sfx.dur}s</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TEXT (Text Overlays & Titles) */}
          {activeTab === "text" && (
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">
                Text Layer Styles
              </span>

              <div className="grid grid-cols-1 gap-2">
                {[
                  {
                    name: "Punchy Headline",
                    desc: "Impact font, high-contrast drop shadow",
                    preview: "VIRAL HOOK",
                    style: { fontFamily: "Impact", fontSize: 44, color: "#FFFFFF", animation: "pop" as const },
                  },
                  {
                    name: "Neon Glow Heading",
                    desc: "Vibrant cyan border & neon shadow",
                    preview: "CYBERPUNK",
                    style: { fontFamily: "Montserrat", fontSize: 38, color: "#38BDF8", animation: "glow" as const },
                  },
                  {
                    name: "Lower Third Title",
                    desc: "Clean minimal name & subtitle banner",
                    preview: "SPEAKER NAME",
                    style: { fontFamily: "Arial", fontSize: 28, color: "#FFFFFF", animation: "slide" as const },
                  },
                  {
                    name: "Typewriter Reveal",
                    desc: "Letter-by-letter typing animation",
                    preview: "Secret revealed...",
                    style: { fontFamily: "monospace", fontSize: 26, color: "#FDE047", animation: "typewriter" as const },
                  },
                ].map((txtPreset) => (
                  <div
                    key={txtPreset.name}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 flex flex-col gap-2 transition-all shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900">{txtPreset.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          onAddTimelineItem?.({
                            track: "text",
                            type: "text",
                            source: txtPreset.preview,
                            duration: 3.5,
                            textStyle: {
                              fontFamily: txtPreset.style.fontFamily,
                              fontSize: txtPreset.style.fontSize,
                              fontWeight: 800,
                              color: txtPreset.style.color,
                              textAlign: "center",
                              animation: txtPreset.style.animation,
                            },
                          });
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-medium cursor-pointer shadow-2xs"
                      >
                        + Add to Timeline
                      </button>
                    </div>
                    <div className="h-12 rounded-lg bg-slate-900 flex items-center justify-center px-2">
                      <span
                        style={{
                          fontFamily: txtPreset.style.fontFamily,
                          color: txtPreset.style.color,
                        }}
                        className="text-base font-black uppercase tracking-wider"
                      >
                        {txtPreset.preview}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500">{txtPreset.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: CAPTIONS (SRT/VTT/ASS Import, Export, Style Presets) */}
          {activeTab === "captions" && (
            <div className="flex flex-col gap-3">
              {/* Import & Export CTA Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => subtitleFileInputRef.current?.click()}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors shadow-2xs"
                >
                  <span className="text-base">📥</span>
                  <span className="text-xs font-bold text-slate-900">Import Subtitles</span>
                  <span className="text-[9px] font-mono text-slate-500">SRT, VTT, ASS</span>
                </button>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-center gap-1 shadow-2xs">
                  <span className="text-[9px] font-mono text-slate-500 uppercase font-bold text-center">
                    Export Captions
                  </span>
                  <div className="grid grid-cols-3 gap-1">
                    {(["srt", "vtt", "ass"] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => handleExportCaptions(fmt)}
                        className="py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-900 hover:text-white text-slate-700 font-mono text-[9px] uppercase font-bold cursor-pointer transition-colors shadow-2xs"
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Caption Typography Presets & Templates */}
              <div className="flex flex-col gap-2.5 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-slate-700 uppercase font-bold">
                      Caption Templates ({DEFAULT_CAPTION_TEMPLATES.length})
                    </span>
                    <span className="text-[9px] font-mono text-blue-600 font-bold bg-blue-50 px-1.5 py-0.2 rounded">
                      Trending
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsCustomizingCaption(!isCustomizingCaption)}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                    >
                      {isCustomizingCaption ? "View Library" : "Customize"}
                    </button>
                    <a
                      href="/caption-templates"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-mono text-slate-500 hover:text-slate-900 underline"
                      title="Open full template studio in new tab"
                    >
                      Studio ↗
                    </a>
                  </div>
                </div>

                {isCustomizingCaption ? (
                  <div className="space-y-3">
                    <CaptionCustomizer
                      style={
                        timeline.settings?.captionStyle ||
                        getTemplateById(timeline.settings?.captionPreset || "clean").style
                      }
                      templateName={
                        getTemplateById(timeline.settings?.captionPreset || "clean").name
                      }
                      onChange={(newStyle) => {
                        onApplyCaptionPreset?.(
                          timeline.settings?.captionPreset || "clean",
                          newStyle
                        );
                      }}
                      onReset={() => {
                        const defaultTmpl = getTemplateById(
                          timeline.settings?.captionPreset || "clean"
                        );
                        onApplyCaptionPreset?.(defaultTmpl.id, defaultTmpl.style);
                      }}
                    />
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {/* Category Selector Pills */}
                    <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
                      {["All", ...CAPTION_CATEGORIES.filter((c) => c !== "Custom")].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCaptionCategory(cat)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                            captionCategory === cat
                              ? "bg-slate-900 text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>

                    {/* Template Items List */}
                    <div className="grid grid-cols-1 gap-2 max-h-[380px] overflow-y-auto pr-1">
                      {DEFAULT_CAPTION_TEMPLATES.filter(
                        (t) => captionCategory === "All" || t.category === captionCategory
                      ).map((tmpl) => {
                        const isSelected = timeline.settings?.captionPreset === tmpl.id;

                        return (
                          <div
                            key={tmpl.id}
                            onClick={() => onApplyCaptionPreset?.(tmpl.id, tmpl.style)}
                            className={`p-2.5 rounded-xl border flex flex-col gap-1.5 cursor-pointer transition-all ${
                              isSelected
                                ? "bg-blue-50/80 border-blue-400 shadow-2xs ring-1 ring-blue-400/50"
                                : "bg-white border-slate-200 hover:border-slate-300 shadow-2xs hover:shadow-xs"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-xs font-bold text-slate-900 truncate">
                                  {tmpl.name}
                                </span>
                                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-500">
                                  {tmpl.category}
                                </span>
                              </div>
                              {isSelected ? (
                                <span className="text-[9px] font-mono text-blue-600 font-bold">
                                  ACTIVE ✓
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onApplyCaptionPreset?.(tmpl.id, tmpl.style);
                                  }}
                                  className="text-[10px] font-semibold text-slate-600 hover:text-slate-900 px-2 py-0.5 rounded border border-slate-200 hover:bg-slate-50"
                                >
                                  Apply
                                </button>
                              )}
                            </div>

                            {/* Styled Visual Preview Box */}
                            <div
                              className="h-10 rounded-lg flex items-center justify-center px-3 overflow-hidden select-none"
                              style={{
                                backgroundColor: tmpl.style.containerBg && tmpl.style.containerBg !== "transparent"
                                  ? tmpl.style.containerBg
                                  : "#05070B",
                                border: tmpl.style.containerBorder || "1px solid rgba(255,255,255,0.06)",
                              }}
                            >
                              <span
                                className="font-bold text-xs tracking-wider uppercase truncate"
                                style={{
                                  fontFamily: tmpl.style.fontFamily,
                                  color: tmpl.style.textColor,
                                  WebkitTextStroke:
                                    tmpl.style.strokeWidth && tmpl.style.strokeWidth > 0
                                      ? `${Math.max(1, Math.round(tmpl.style.strokeWidth * 0.7))}px ${tmpl.style.strokeColor}`
                                      : undefined,
                                }}
                              >
                                VIRAL{" "}
                                <span
                                  style={{
                                    color: tmpl.style.highlightColor,
                                    backgroundColor: tmpl.style.highlightBg || "transparent",
                                    padding: tmpl.style.highlightBg ? "0 3px" : undefined,
                                    borderRadius: "3px",
                                  }}
                                >
                                  WORD
                                </span>
                              </span>
                            </div>

                            <span className="text-[9px] text-slate-500 line-clamp-1">
                              {tmpl.tagline}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: BACKGROUNDS & BACKDROPS */}
          {activeTab === "backgrounds" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">
                  Background Backdrops
                </span>
                <span className="text-[9px] font-mono text-slate-400">Minimal Styles</span>
              </div>

              <div className="space-y-3">
                {/* Solid Colors */}
                <div className="space-y-1.5">
                  <span className="text-[9px] font-mono text-slate-500 uppercase font-semibold">Solid Colors</span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { name: "Obsidian", color: "#0A0D14" },
                      { name: "Slate", color: "#0F172A" },
                      { name: "Titanium", color: "#18181B" },
                      { name: "Pure Black", color: "#000000" },
                    ].map((col) => (
                      <button
                        key={col.color}
                        type="button"
                        onClick={() =>
                          onAddTimelineItem?.({
                            track: "video",
                            type: "image",
                            source: col.color,
                            duration: timeline.duration || 10,
                            metadata: { title: `${col.name} Backdrop` },
                          })
                        }
                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:border-slate-400 flex flex-col items-center gap-1 cursor-pointer transition-all shadow-2xs"
                      >
                        <div className="w-full h-7 rounded border border-slate-200" style={{ background: col.color }} />
                        <span className="text-[8px] font-mono text-slate-700 truncate">{col.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Gradients */}
                <div className="space-y-1.5 pt-2 border-t border-slate-200">
                  <span className="text-[9px] font-mono text-slate-500 uppercase font-semibold">Clean Gradients</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { name: "Midnight Fade", grad: "linear-gradient(180deg, #0F172A 0%, #020617 100%)" },
                      { name: "Deep Space", grad: "linear-gradient(135deg, #18181B 0%, #09090B 100%)" },
                      { name: "Dark Indigo", grad: "linear-gradient(180deg, #1e1b4b 0%, #090d16 100%)" },
                      { name: "Graphite Glow", grad: "linear-gradient(135deg, #27272a 0%, #09090b 100%)" },
                    ].map((gr) => (
                      <button
                        key={gr.name}
                        type="button"
                        onClick={() =>
                          onAddTimelineItem?.({
                            track: "video",
                            type: "image",
                            source: gr.grad,
                            duration: timeline.duration || 10,
                            metadata: { title: gr.name },
                          })
                        }
                        className="p-2 rounded-xl border border-slate-200 bg-white hover:border-slate-400 text-left flex flex-col gap-1.5 cursor-pointer transition-all shadow-2xs"
                      >
                        <div className="w-full h-8 rounded border border-slate-200" style={{ background: gr.grad }} />
                        <span className="text-[10px] font-bold text-slate-900 truncate">{gr.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Video Loop Backgrounds */}
                <div className="space-y-1.5 pt-2 border-t border-slate-200">
                  <span className="text-[9px] font-mono text-slate-500 uppercase font-semibold">Loop Backdrops</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {
                        name: "Ambient Motion Grid",
                        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
                        dur: 15,
                      },
                      {
                        name: "City Lights Subtle",
                        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
                        dur: 15,
                      },
                    ].map((loop) => (
                      <button
                        key={loop.name}
                        type="button"
                        onClick={() =>
                          onAddTimelineItem?.({
                            track: "video",
                            type: "broll",
                            source: loop.url,
                            duration: loop.dur,
                            metadata: { title: loop.name },
                          })
                        }
                        className="p-2 rounded-xl border border-slate-200 bg-white hover:border-slate-400 text-left flex flex-col gap-1.5 cursor-pointer transition-all shadow-2xs"
                      >
                        <div className="w-full h-10 rounded bg-slate-900 overflow-hidden flex items-center justify-center">
                          <video src={loop.url} className="w-full h-full object-cover opacity-60" />
                        </div>
                        <span className="text-[10px] font-bold text-slate-900 truncate">{loop.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: EFFECTS (Visual Enhancements) */}
          {activeTab === "effects" && (
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">
                Non-Destructive Effects
              </span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "glitch", name: "Glitch", icon: "⚡" },
                  { id: "vhs", name: "VHS Retro", icon: "📼" },
                  { id: "rgb_split", name: "RGB Split", icon: "🌈" },
                  { id: "grain", name: "Film Grain", icon: "🎞️" },
                  { id: "blur", name: "Gaussian Blur", icon: "💧" },
                  { id: "sharpen", name: "Sharpen", icon: "🗡️" },
                  { id: "noise", name: "Noise", icon: "📻" },
                  { id: "pixelate", name: "Pixelate", icon: "👾" },
                ].map((eff) => (
                  <button
                    key={eff.id}
                    type="button"
                    onClick={() => {
                      onApplyEffectToClip?.(eff.id as TimelineEffect["type"], 50);
                    }}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-400 text-left flex flex-col gap-1 cursor-pointer transition-all group shadow-2xs"
                  >
                    <span className="text-xl group-hover:scale-110 transition-transform">{eff.icon}</span>
                    <span className="text-[11px] font-bold text-slate-900">{eff.name}</span>
                    <span className="text-[8px] font-mono text-slate-500">1-Click Apply</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: FILTERS (Cinematic, Warm, Cool, Vintage, B&W) */}
          {activeTab === "filters" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">
                  Filter Presets
                </span>
                <span className="text-[10px] font-mono text-slate-900 font-bold">{filterIntensity}% Intensity</span>
              </div>

              {/* Intensity Slider */}
              <input
                type="range"
                min="10"
                max="100"
                value={filterIntensity}
                onChange={(e) => setFilterIntensity(parseInt(e.target.value))}
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
              />

              <div className="grid grid-cols-2 gap-2 mt-1">
                {[
                  { id: "cinematic", name: "Cinematic", color: "from-blue-900 to-amber-900" },
                  { id: "warm", name: "Warm Sun", color: "from-amber-600 to-orange-800" },
                  { id: "cool", name: "Cool Frost", color: "from-cyan-900 to-blue-950" },
                  { id: "vintage", name: "Vintage 70s", color: "from-yellow-900 to-amber-950" },
                  { id: "bw", name: "Black & White", color: "from-neutral-800 to-black" },
                  { id: "film", name: "Kodak Film", color: "from-red-900 to-neutral-900" },
                  { id: "clean", name: "Clean Vivid", color: "from-sky-800 to-indigo-900" },
                ].map((flt) => (
                  <button
                    key={flt.id}
                    type="button"
                    onClick={() => {
                      onApplyFilterToClip?.(flt.id as FilterPresetId, filterIntensity / 100);
                    }}
                    className="rounded-xl overflow-hidden border border-slate-200 hover:border-slate-400 flex flex-col cursor-pointer transition-all group shadow-2xs"
                  >
                    <div className={`h-12 w-full bg-gradient-to-br ${flt.color} flex items-center justify-center`}>
                      <span className="text-xs font-bold text-white drop-shadow">{flt.name}</span>
                    </div>
                    <div className="p-1.5 bg-white text-center">
                      <span className="text-[9px] font-mono text-slate-600 group-hover:text-slate-900 font-medium">
                        Apply Filter
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: TRANSITIONS (Motion & Cutaways) */}
          {activeTab === "transitions" && (
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">
                Transition Library
              </span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "cut", name: "Cut", desc: "Default instant cut" },
                  { id: "dissolve", name: "Cross Dissolve", desc: "Smooth blend" },
                  { id: "fade", name: "Dip to Black", desc: "Fade to dark" },
                  { id: "dip_white", name: "Dip to White", desc: "Flash white" },
                  { id: "zoom", name: "Zoom In", desc: "Dynamic scale punch" },
                  { id: "push", name: "Push Left", desc: "Motion push" },
                  { id: "slide", name: "Slide Left", desc: "Gliding transition" },
                  { id: "wipe", name: "Linear Wipe", desc: "Sharp wipe across" },
                  { id: "blur", name: "Motion Blur", desc: "Fast blur whip" },
                ].map((tr) => (
                  <button
                    key={tr.id}
                    type="button"
                    onClick={() => {
                      onApplyTransitionToClip?.(tr.id as TransitionType);
                    }}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 text-left flex flex-col gap-1 cursor-pointer transition-all shadow-2xs"
                  >
                    <span className="text-xs font-bold text-slate-900">{tr.name}</span>
                    <span className="text-[9px] text-slate-500">{tr.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* TAB 8: TEMPLATES (Social Video Layouts) */}
          {activeTab === "templates" && (
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">
                Social Video Templates
              </span>
              <div className="flex flex-col gap-2">
                {[
                  {
                    id: "quick_social",
                    name: "Quick Social (TikTok / Shorts)",
                    desc: "Fast cuts (1.5-2.5s), bold highlight captions, high energy music.",
                    ratio: "9:16",
                  },
                  {
                    id: "cinematic",
                    name: "Cinematic Landscape",
                    desc: "16:9 widescreen, slow Ken Burns zoom out, clean subtitles.",
                    ratio: "16:9",
                  },
                  {
                    id: "high_energy",
                    name: "High Energy Creator",
                    desc: "Rapid transitions, neon green active words, dynamic zoom pans.",
                    ratio: "9:16",
                  },
                  {
                    id: "clean",
                    name: "Clean Minimalist",
                    desc: "Minimal caption cards, soft dissolve transitions, quiet backdrop.",
                    ratio: "1:1",
                  },
                ].map((tpl) => (
                  <div
                    key={tpl.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 flex flex-col gap-2 transition-all shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">{tpl.name}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-white font-bold">
                        {tpl.ratio}
                      </span>
                    </div>
                    <span className="text-[9px] text-slate-500">{tpl.desc}</span>
                    <button
                      type="button"
                      onClick={() => onApplyAIAutoEdit?.(tpl.id as any)}
                      className="w-full py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-[10px] cursor-pointer transition-colors shadow-2xs"
                    >
                      Apply Template
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 9: BRAND KIT & WATERMARK */}
          {activeTab === "brand" && (
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">
                Brand Kit Configuration
              </span>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2.5 shadow-2xs">
                <label className="text-[10px] font-mono text-slate-500 uppercase font-bold">Brand Name</label>
                <input
                  type="text"
                  defaultValue={timeline.settings?.brandKit?.brandName || "My Brand"}
                  placeholder="e.g. Kreovar Media"
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-mono text-slate-500 font-bold uppercase">Primary Color</label>
                    <input
                      type="color"
                      defaultValue={timeline.settings?.brandKit?.primaryColor || "#38BDF8"}
                      className="w-full h-8 rounded-lg cursor-pointer bg-white border border-slate-200 p-0.5"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-mono text-slate-500 font-bold uppercase">Secondary Color</label>
                    <input
                      type="color"
                      defaultValue={timeline.settings?.brandKit?.secondaryColor || "#FBBF24"}
                      className="w-full h-8 rounded-lg cursor-pointer bg-white border border-slate-200 p-0.5"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onApplyBrandKit?.({
                      brandName: "My Brand",
                      primaryColor: "#38BDF8",
                      secondaryColor: "#FBBF24",
                      fontFamily: "Inter",
                    });
                  }}
                  className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs cursor-pointer shadow-xs transition-colors"
                >
                  Apply Brand Kit to Video
                </button>
              </div>

              {/* Watermark Controls */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-700 uppercase font-bold">
                    Logo Watermark
                  </span>
                  <input
                    type="checkbox"
                    checked={timeline.settings?.watermark?.enabled ?? false}
                    onChange={(e) => {
                      onUpdateWatermark?.({
                        enabled: e.target.checked,
                        logoUrl: timeline.settings?.watermark?.logoUrl || "/logo.png",
                        position: timeline.settings?.watermark?.position || "top-right",
                        scale: timeline.settings?.watermark?.scale || 0.15,
                        opacity: timeline.settings?.watermark?.opacity || 0.8,
                      });
                    }}
                    className="w-4 h-4 accent-slate-900 cursor-pointer"
                  />
                </div>

                <span className="text-[9px] text-slate-500">
                  Burns your logo into the corner of the exported MP4 video.
                </span>
              </div>
            </div>
          )}

          {/* TAB 10: AI TOOLS (Silence Removal, Auto Reframe, Auto Edit) */}
          {activeTab === "ai" && (
            <div className="flex flex-col gap-3">
              {/* AI Auto Edit */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2 shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="text-base text-amber-500">✨</span>
                  <span className="text-xs font-bold text-slate-900">AI Auto-Editor</span>
                </div>
                <p className="text-[10px] text-slate-500">
                  Analyzes script pacing, audio pauses, and scene semantics to construct an optimal cut timeline.
                </p>
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {[
                    { id: "quick_social", label: "Quick Social" },
                    { id: "cinematic", label: "Cinematic" },
                    { id: "clean", label: "Clean" },
                    { id: "high_energy", label: "High Energy" },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => onApplyAIAutoEdit?.(mode.id as any)}
                      className="py-1.5 px-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-900 hover:text-white text-slate-800 font-medium text-[10px] cursor-pointer transition-colors shadow-2xs"
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* AI Silence Removal */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span>✂️</span> Remove Audio Silences
                  </span>
                  <span className="text-[9px] font-mono text-emerald-600 font-bold">AI Powered</span>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-[10px] font-mono text-slate-700">
                    <span>Sensitivity Threshold</span>
                    <span className="font-bold text-slate-900">-{silenceSensitivity} dB</span>
                  </div>
                  <input
                    type="range"
                    min="15"
                    max="50"
                    value={silenceSensitivity}
                    onChange={(e) => setSilenceSensitivity(parseInt(e.target.value))}
                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-[10px] font-mono text-slate-700">
                    <span>Min Silence Duration</span>
                    <span className="font-bold text-slate-900">{silenceMinDur}s</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="1.5"
                    step="0.1"
                    value={silenceMinDur}
                    onChange={(e) => setSilenceMinDur(parseFloat(e.target.value))}
                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => onRemoveSilences?.(silenceSensitivity, silenceMinDur, silencePadding)}
                  className="w-full py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs cursor-pointer transition-colors shadow-2xs"
                >
                  Detect &amp; Cut Silences
                </button>
              </div>

              {/* AI Auto Reframe */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2 shadow-2xs">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span>📐</span> AI Auto Reframe
                </span>
                <p className="text-[10px] text-slate-500">
                  Intelligently re-centers video subjects when converting between landscape and vertical.
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["9:16", "16:9", "1:1"] as AspectRatio[]).map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => onAutoReframe?.(ratio)}
                      className="py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-900 hover:text-white text-slate-800 font-medium text-xs cursor-pointer transition-colors shadow-2xs"
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
