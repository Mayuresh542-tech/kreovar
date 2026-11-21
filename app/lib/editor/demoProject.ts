import type { EditorProject, MediaAsset, Track, Clip, Caption, Ratio } from "./model";
import { defaultTransform, defaultStyle } from "./model";
import type { EditorStore } from "./store";

export const DEMO_PROJECT_ID = "demo_creator_starter";
export const DEMO_PROJECT_TITLE = "Creator Starter Reel (Demo)";

export function isDemoProject(projectId?: string | null): boolean {
  if (!projectId) return false;
  return (
    projectId === DEMO_PROJECT_ID ||
    projectId === "demo_project" ||
    projectId === "demo" ||
    projectId.startsWith("demo_")
  );
}

/**
 * Builds an authentic, fully loaded 15-second creator starter project.
 * Features:
 * - 9:16 vertical video format (1080x1920 @ 30fps)
 * - Main A-roll creator talking head clip (0s to 15s)
 * - Timed B-roll overlay cut (5s to 9s)
 * - Real timed caption words spanning the entire project (usable by silence trimmer, phrase matcher, AI tools)
 * - Background music audio with auto-ducking enabled
 */
export function createDemoProject(
  id: string = DEMO_PROJECT_ID,
  title: string = DEMO_PROJECT_TITLE
): EditorProject {
  const aspectRatio: Ratio = "9:16";
  const fps = 30;

  // 1. Assets
  const mainVideoAsset: MediaAsset = {
    id: "asset-demo-creator-video",
    name: "creator_talking_head.mp4",
    kind: "video",
    mime: "video/mp4",
    size: 8500000,
    duration: 15.0,
    width: 1080,
    height: 1920,
    url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    thumbnail: "https://images.pexels.com/photos/3165335/pexels-photo-3165335.jpeg",
  };

  const brollAsset: MediaAsset = {
    id: "asset-demo-broll-tech",
    name: "workspace_tech_broll.mp4",
    kind: "video",
    mime: "video/mp4",
    size: 4200000,
    duration: 4.0,
    width: 1080,
    height: 1920,
    url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4",
    thumbnail: "https://images.pexels.com/photos/3945683/pexels-photo-3945683.jpeg",
  };

  const musicAsset: MediaAsset = {
    id: "asset-demo-music",
    name: "creator_lofi_beat.mp3",
    kind: "audio",
    mime: "audio/mp3",
    size: 1800000,
    duration: 15.0,
    width: 0,
    height: 0,
    url: "https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3",
  };

  const assets: Record<string, MediaAsset> = {
    [mainVideoAsset.id]: mainVideoAsset,
    [brollAsset.id]: brollAsset,
    [musicAsset.id]: musicAsset,
  };

  // 2. Tracks
  const trackVideo: Track = {
    id: "track-video",
    kind: "video",
    name: "Video 1 (A-Roll)",
    clipIds: ["clip-demo-main-video"],
    hidden: false,
    muted: false,
    locked: false,
  };

  const trackOverlay: Track = {
    id: "track-overlay",
    kind: "overlay",
    name: "Overlay (B-Roll)",
    clipIds: ["clip-demo-broll"],
    hidden: false,
    muted: false,
    locked: false,
  };

  const trackCaption: Track = {
    id: "track-caption",
    kind: "caption",
    name: "Captions",
    clipIds: ["clip-demo-cap-1", "clip-demo-cap-2", "clip-demo-cap-3"],
    hidden: false,
    muted: false,
    locked: false,
  };

  const trackAudio: Track = {
    id: "track-audio",
    kind: "audio",
    name: "Audio 1 (Music)",
    clipIds: ["clip-demo-music"],
    hidden: false,
    muted: false,
    locked: false,
  };

  const trackText: Track = {
    id: "track-text",
    kind: "text",
    name: "Text",
    clipIds: [],
    hidden: false,
    muted: false,
    locked: false,
  };

  const trackImage: Track = {
    id: "track-image",
    kind: "image",
    name: "Images",
    clipIds: [],
    hidden: false,
    muted: false,
    locked: false,
  };

  const tracks: Record<string, Track> = {
    [trackOverlay.id]: trackOverlay,
    [trackCaption.id]: trackCaption,
    [trackVideo.id]: trackVideo,
    [trackText.id]: trackText,
    [trackAudio.id]: trackAudio,
    [trackImage.id]: trackImage,
  };

  const trackOrder = [
    trackOverlay.id,
    trackCaption.id,
    trackVideo.id,
    trackText.id,
    trackAudio.id,
    trackImage.id,
  ];

  // 3. Main Clips
  const mainVideoClip: Clip = {
    id: "clip-demo-main-video",
    assetId: mainVideoAsset.id,
    trackId: trackVideo.id,
    name: "Creator Talking Head",
    startTime: 0,
    duration: 15.0,
    sourceStart: 0,
    sourceEnd: 15.0,
    transform: { ...defaultTransform },
    volume: 1.0,
    speed: 1.0,
    fadeIn: 0,
    fadeOut: 0,
    effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
    audioRole: "speech",
  };

  const brollClip: Clip = {
    id: "clip-demo-broll",
    assetId: brollAsset.id,
    trackId: trackOverlay.id,
    name: "Workspace B-Roll",
    startTime: 5.0,
    duration: 4.0,
    sourceStart: 0,
    sourceEnd: 4.0,
    transform: { ...defaultTransform },
    volume: 0,
    speed: 1.0,
    fadeIn: 0.2,
    fadeOut: 0.2,
    effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
  };

  const musicClip: Clip = {
    id: "clip-demo-music",
    assetId: musicAsset.id,
    trackId: trackAudio.id,
    name: "Creator Lo-Fi Beat",
    startTime: 0,
    duration: 15.0,
    sourceStart: 0,
    sourceEnd: 15.0,
    transform: { ...defaultTransform },
    volume: 0.22,
    speed: 1.0,
    fadeIn: 0.5,
    fadeOut: 1.0,
    effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
    audioRole: "background",
    ducking: true,
  };

  // 4. Captions with Timed Word Tokens
  const caption1Content: Caption = {
    id: "caption-demo-1",
    text: "Welcome to Kreovar the AI video editor",
    templateId: "study-hormozi-style",
    motion: "pop",
    highlightColor: "#FACC15",
    style: {
      ...defaultStyle,
      font: "Montserrat",
      size: 64,
      weight: 800,
      color: "#FFFFFF",
      stroke: "#000000",
      strokeWidth: 4,
      shadow: 8,
      align: "center",
      casing: "uppercase",
    },
    words: [
      { word: "Welcome", start: 0.1, end: 0.6 },
      { word: "to", start: 0.6, end: 0.9 },
      { word: "Kreovar", start: 0.9, end: 1.6 },
      { word: "the", start: 1.7, end: 2.0 },
      { word: "AI", start: 2.0, end: 2.5 },
      { word: "video", start: 2.5, end: 3.0 },
      { word: "editor", start: 3.0, end: 3.7 },
    ],
  };

  const caption1Clip: Clip = {
    id: "clip-demo-cap-1",
    contentId: caption1Content.id,
    trackId: trackCaption.id,
    name: "Welcome to Kreovar…",
    startTime: 0.5,
    duration: 4.0,
    sourceStart: 0,
    sourceEnd: 4.0,
    transform: { ...defaultTransform, y: 0.32 },
    volume: 0,
    speed: 1.0,
    fadeIn: 0,
    fadeOut: 0,
    effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
  };

  const caption2Content: Caption = {
    id: "caption-demo-2",
    text: "Watch dynamic B-roll and kinetic captions sync",
    templateId: "study-hormozi-style",
    motion: "pop",
    highlightColor: "#38BDF8",
    style: {
      ...defaultStyle,
      font: "Montserrat",
      size: 64,
      weight: 800,
      color: "#FFFFFF",
      stroke: "#000000",
      strokeWidth: 4,
      shadow: 8,
      align: "center",
      casing: "uppercase",
    },
    words: [
      { word: "Watch", start: 0.1, end: 0.6 },
      { word: "dynamic", start: 0.6, end: 1.2 },
      { word: "B-roll", start: 1.2, end: 1.8 },
      { word: "and", start: 1.9, end: 2.2 },
      { word: "kinetic", start: 2.2, end: 2.8 },
      { word: "captions", start: 2.8, end: 3.4 },
      { word: "sync", start: 3.4, end: 3.8 },
    ],
  };

  const caption2Clip: Clip = {
    id: "clip-demo-cap-2",
    contentId: caption2Content.id,
    trackId: trackCaption.id,
    name: "Watch dynamic B-roll…",
    startTime: 5.0,
    duration: 4.0,
    sourceStart: 0,
    sourceEnd: 4.0,
    transform: { ...defaultTransform, y: 0.32 },
    volume: 0,
    speed: 1.0,
    fadeIn: 0,
    fadeOut: 0,
    effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
  };

  const caption3Content: Caption = {
    id: "caption-demo-3",
    text: "Edit with keyboard shortcuts or AI chat commands",
    templateId: "study-hormozi-style",
    motion: "pop",
    highlightColor: "#34D399",
    style: {
      ...defaultStyle,
      font: "Montserrat",
      size: 64,
      weight: 800,
      color: "#FFFFFF",
      stroke: "#000000",
      strokeWidth: 4,
      shadow: 8,
      align: "center",
      casing: "uppercase",
    },
    words: [
      { word: "Edit", start: 0.1, end: 0.6 },
      { word: "with", start: 0.6, end: 0.9 },
      { word: "keyboard", start: 0.9, end: 1.5 },
      { word: "shortcuts", start: 1.5, end: 2.2 },
      { word: "or", start: 2.3, end: 2.6 },
      { word: "AI", start: 2.6, end: 3.1 },
      { word: "chat", start: 3.1, end: 3.6 },
      { word: "commands", start: 3.6, end: 4.4 },
    ],
  };

  const caption3Clip: Clip = {
    id: "clip-demo-cap-3",
    contentId: caption3Content.id,
    trackId: trackCaption.id,
    name: "Edit with shortcuts…",
    startTime: 9.5,
    duration: 5.0,
    sourceStart: 0,
    sourceEnd: 5.0,
    transform: { ...defaultTransform, y: 0.32 },
    volume: 0,
    speed: 1.0,
    fadeIn: 0,
    fadeOut: 0,
    effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
  };

  const captions: Record<string, Caption> = {
    [caption1Content.id]: caption1Content,
    [caption2Content.id]: caption2Content,
    [caption3Content.id]: caption3Content,
  };

  const clips: Record<string, Clip> = {
    [mainVideoClip.id]: mainVideoClip,
    [brollClip.id]: brollClip,
    [musicClip.id]: musicClip,
    [caption1Clip.id]: caption1Clip,
    [caption2Clip.id]: caption2Clip,
    [caption3Clip.id]: caption3Clip,
  };

  return {
    schemaVersion: 1,
    id,
    title,
    revision: 0,
    updatedAt: new Date().toISOString(),
    trackOrder,
    tracks,
    clips,
    assets,
    textLayers: {},
    captions,
    transitions: {},
    settings: {
      aspectRatio,
      fps,
      background: "#000000",
      audioDucking: true,
    },
  };
}

/**
 * Loads the demo project into an active EditorStore instance.
 */
export function loadDemoProjectIntoStore(store: EditorStore): EditorProject {
  const project = createDemoProject();
  store.load(project);
  return project;
}
