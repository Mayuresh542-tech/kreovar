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
  ExternalLink,
  Layers,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { EditorToolTab } from "./ToolSidebar";
import { useEditor } from "./workspace/EditorContext";
import { useProject } from "@/app/lib/editor/store";
import {
  MediaAsset,
  canPlace,
  Ratio,
  aspectRatios,
  dimensions,
} from "@/app/lib/editor/model";
import {
  addAsset,
  addClip,
  changeClipProperty,
  changeTrack,
  removeClip,
  replaceClipAsset,
  splitClip,
} from "@/app/lib/editor/operations";
import { importMedia } from "@/app/lib/editor/media";
import { BUILTIN_SFX } from "@/app/lib/assets/builtinSfx";
import { DEFAULT_CAPTION_TEMPLATES } from "@/app/lib/captions/templates";
import { REFERENCE_CAPTION_TEMPLATES } from "@/app/lib/captions/referenceTemplates";
import { applyStudioStyle, studioCaptions } from "@/app/lib/editor/editorCaptionStudio";

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

  // SFX Tab Category
  const [sfxCategory, setSfxCategory] = useState<string>("All");
  const [sfxQuery, setSfxQuery] = useState("");

  // B-Roll State
  const [brollQuery, setBrollQuery] = useState("");
  const [isSearchingBroll, setIsSearchingBroll] = useState(false);

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
        setUploadProgress(40);
        const imported = await importMedia(file, scope, (pct) =>
          setUploadProgress(Math.round(40 + pct * 0.5))
        );
        run((p) => addAsset(p, imported));
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
    const template =
      REFERENCE_CAPTION_TEMPLATES.find((t) => t.id === templateId) ||
      DEFAULT_CAPTION_TEMPLATES.find((t) => t.id === templateId);
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

  // Inspector selected clip
  const selectedClip = selection[0] ? project.clips[selection[0]] : null;
  const selectedTrack = selectedClip ? project.tracks[selectedClip.trackId] : null;

  const titles: Record<EditorToolTab, string> = {
    media: "Project Media",
    captions: "Caption Studio",
    broll: "B-Roll Stock Footage",
    audio: "Audio & SFX Library",
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
                  setIsHinglishMode(!isHinglishMode);
                  if (!isHinglishMode) {
                    handleApplyCaptionPreset("viral-hinglish-pop");
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
              <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                Featured Creator Presets
              </span>

              <div className="grid grid-cols-1 gap-2.5">
                {[
                  {
                    id: "study-hormozi-style",
                    name: "Hormozi Viral",
                    tagline: "Bold uppercase, dynamic punch zooms, yellow pop",
                    sample: "MAKE IT MATTER",
                    accent: "text-yellow-400",
                    border: "border-yellow-500/40",
                  },
                  {
                    id: "study-ali-abdaal",
                    name: "Ali Abdaal Spotlight",
                    tagline: "Clean, high readability, soft spotlight glow",
                    sample: "The Secret to Focus",
                    accent: "text-blue-400",
                    border: "border-blue-500/40",
                  },
                  {
                    id: "study-mr-beast-style-2",
                    name: "MrBeast Energy",
                    tagline: "High-contrast bouncing kinetic words",
                    sample: "10,000,000 DOLLARS",
                    accent: "text-emerald-400",
                    border: "border-emerald-500/40",
                  },
                  {
                    id: "study-thora-cinematic",
                    name: "Thora Cinematic",
                    tagline: "Wide-spaced elegant subtitle letterboxing",
                    sample: "A quiet moment in time.",
                    accent: "text-slate-100",
                    border: "border-slate-500/40",
                  },
                  {
                    id: "viral-hinglish-pop",
                    name: "Viral Hinglish Pop",
                    tagline: "Optimized for Desi Reels & Hinglish slang accents",
                    sample: "Sach bolo toh...",
                    accent: "text-amber-400",
                    border: "border-amber-500/40",
                  },
                  {
                    id: "study-clean-motion",
                    name: "Clean Subtitles",
                    tagline: "Minimalist modern sans-serif subtitles",
                    sample: "Simply understandable.",
                    accent: "text-cyan-300",
                    border: "border-cyan-500/40",
                  },
                ]
                  .filter(
                    (p) =>
                      p.name.toLowerCase().includes(captionQuery.toLowerCase()) ||
                      p.tagline.toLowerCase().includes(captionQuery.toLowerCase())
                  )
                  .map((preset) => {
                    const isSelected = activeCaptionTemplate === preset.id;
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

                        {/* Live Hovering Preview Box (dark swatch kept for crisp caption text legibility) */}
                        <div className="mt-2 h-14 rounded-lg bg-[#0F172A] flex items-center justify-center p-2 relative overflow-hidden border border-slate-200 group-hover:border-slate-300 transition-colors">
                          <span
                            className={`font-black text-sm tracking-wide transition-transform group-hover:scale-105 duration-200 ${preset.accent}`}
                          >
                            {preset.sample}
                          </span>
                        </div>

                        <p className="mt-2 text-[11px] text-slate-600 line-clamp-1">
                          {preset.tagline}
                        </p>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* ======================= TAB: AUDIO & SFX ======================= */}
        {activeTab === "audio" && (
          <div className="space-y-4">
            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
              {["All", "Transitions", "Impacts", "UI", "Accents"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSfxCategory(cat)}
                  className={`px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                    sfxCategory === cat
                      ? "bg-violet-600 text-white font-medium"
                      : "bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70"
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
                    className="p-2 rounded-xl bg-white border border-slate-200 flex items-center justify-between group hover:border-slate-300 transition-colors"
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
                <div className="text-center py-8 text-slate-500 text-xs">
                  No assets uploaded yet. Drop a video clip above.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================= TAB: B-ROLL ======================= */}
        {activeTab === "broll" && (
          <div className="space-y-4">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Search stock footage (Tech, AI, nature)..."
                value={brollQuery}
                onChange={(e) => setBrollQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-cyan-600 focus:bg-white"
              />
            </div>

            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">
                Smart Suggestions
              </span>

              {[
                { title: "Artificial Intelligence Circuit", category: "Technology", duration: "4.2s" },
                { title: "Financial Market Graph", category: "Business", duration: "5.0s" },
                { title: "Typing on Laptop Code", category: "Productivity", duration: "3.8s" },
                { title: "Crowd in Megacity Timelapse", category: "Urban", duration: "6.1s" },
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
                    onClick={() => {
                      notify(`Searching B-roll for "${item.title}"...`);
                    }}
                    className="p-1 rounded bg-slate-100 hover:bg-cyan-600 text-slate-600 hover:text-white transition-colors"
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
              {["Dissolve", "Fade to Black", "Whip Slide", "Zoom Cross"].map(
                (tr, i) => (
                  <button
                    key={i}
                    onClick={() => notify(`Selected ${tr} transition.`)}
                    className="p-2 rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-xs text-slate-700 text-left transition-colors"
                  >
                    {tr}
                  </button>
                )
              )}
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
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="flex items-center justify-between">
                    <strong className="text-slate-900 truncate">{selectedClip.name}</strong>
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-mono font-medium">
                      {selectedTrack?.kind || "clip"}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono">
                    Start: {selectedClip.startTime.toFixed(2)}s · Dur: {selectedClip.duration.toFixed(2)}s
                  </p>
                </div>

                {/* Transform Controls */}
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">
                    Transform
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-[11px] text-slate-600">
                      Scale (%)
                      <input
                        type="number"
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
                        className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] text-slate-600">
                      Rotation (°)
                      <input
                        type="number"
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
                        className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                      />
                    </label>
                  </div>
                </div>

                {/* Audio Volume */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-slate-600 text-[11px]">
                    <span>Volume</span>
                    <span>{Math.round(selectedClip.volume * 100)}%</span>
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

                {/* Quick Actions */}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      run((p) => removeClip(p, selectedClip.id));
                      select([]);
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-colors font-medium text-xs flex items-center justify-center gap-1.5"
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
