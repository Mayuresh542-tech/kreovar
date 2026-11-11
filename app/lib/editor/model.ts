import type { CloudOriginal } from "./cloudMedia";
/** Serializable, versioned editing document. Media bytes and UI/playback never live here. */
export const aspectRatios = ["9:16", "16:9", "1:1", "4:5", "4:3"] as const;
export type Ratio = typeof aspectRatios[number];
export type TrackKind = "video" | "overlay" | "image" | "text" | "caption" | "audio";
export type AssetKind = "video" | "image" | "audio";
export interface MediaAsset {
  id: string; name: string; kind: AssetKind; mime: string; size: number;
  stockKey?:string;
  duration: number; width: number; height: number;
  /** Remote URL or IndexedDB key. Never persist blob: URLs. */
  libraryId?: string;
  cloud?: CloudOriginal;
  url?: string; localKey?: string; thumbnail?: string; thumbnails?: string[]; waveform?: number[];
}
export interface Transform { x: number; y: number; scale: number; rotation: number; opacity: number }
export interface TextStyle {
  fontAccent?: import("../captions/typography").FontAccent|null;
  maxWordsPerLine?:number;
  gradient?: import("./textGradient").TextGradient|null;
  maxWidth?:number;
  casing?: "uppercase"|"none"|"capitalize";
  font: string; size: number; weight: number; align: "left" | "center" | "right";
  color: string; background: string; stroke: string; strokeWidth: number;
  shadow: number; letterSpacing: number; lineHeight: number;
}
export interface TextLayer { id: string; text: string; style: TextStyle }
export interface CaptionWord { word:string; start:number; end:number }
export type CaptionMotion = "none" | "pop" | "word-reveal" | "karaoke";
/** Word intervals use the caption source clock, so moves, splits and speed edits stay aligned. */
export interface Caption extends TextLayer { templateId?: string; studioStyle?:import("../captions/templates").CaptionStyleConfig;studioData?:import("./editorCaptionStudio").StudioCaptionData; highlightMode?:import("../captions/templates").HighlightingMode; highlightWords?:string; transcriptionId?: string; words?:CaptionWord[]; motion?:CaptionMotion; highlightColor?:string }
export type AudioRole="speech"|"background"|"sfx";
export interface Clip {
  mediaAnimation?:import("./mediaAnimation").MediaAnimation;
  visualTreatment?:import("./visualTreatment").VisualTreatment;
  shape?:import("./shapes").ShapeStyle;
  surface?:import("./styleSurface").StyleSurface;
  keyframes?:import('./keyframes').TransformKeyframe[];
  graphic?:import('./motionGraphics').MotionGraphic;
  zooms?: import("./zoom").ZoomMotion[];
  audioRole?:AudioRole; ducking?:boolean;
  id: string; assetId?: string; contentId?: string; trackId: string; name: string;
  startTime: number; duration: number; sourceStart: number; sourceEnd: number;
  transform: Transform; volume: number; speed: number; fadeIn: number; fadeOut: number;
  effects: { brightness: number; contrast: number; saturation: number; blur: number };
}
export interface Track { id: string; name: string; kind: TrackKind; clipIds: string[]; hidden: boolean; muted: boolean; locked: boolean }
export type TransitionKind = "fade" | "dissolve" | "slide" | "zoom";
export interface Transition { id: string; fromClipId: string; toClipId: string; kind: TransitionKind; duration: number }
export interface EditorProject {
  /** Editor-only removals remain excluded when legacy project sources are merged. */
  removedProjectAssetIds?:string[];
  editingHistory?:{jobId:string;instructions:string;status:string;summary:string}[];
  editingJob?:import("./sequentialEdit").EditingJob;
  importedProjectCaptionIds?: string[];
  schemaVersion: 1; id: string; title: string; revision: number; updatedAt: string;
  trackOrder: string[]; tracks: Record<string, Track>; clips: Record<string, Clip>;
  assets: Record<string, MediaAsset>; textLayers: Record<string, TextLayer>;
  captions: Record<string, Caption>; transitions: Record<string, Transition>;
  settings: { aspectRatio: Ratio; fps: number; background: string; audioDucking?:boolean };
}
export const dimensions: Record<Ratio, [number, number]> = { "16:9": [1920,1080], "9:16": [1080,1920], "1:1": [1080,1080], "4:5": [1080,1350], "4:3": [1440,1080] };
export const defaultTransform: Transform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
export const defaultStyle: TextStyle = { font: "Inter", size: 72, weight: 700, align: "center", color: "#ffffff", background: "transparent", stroke: "#000000", strokeWidth: 0, shadow: 0, letterSpacing: 0, lineHeight: 1.2 };
export const uid = () => crypto.randomUUID();
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const projectDuration = (p: EditorProject) => Object.values(p.clips).reduce((end,c) => Math.max(end,c.startTime+c.duration),0);
export const isVisual = (kind: TrackKind) => kind !== "audio";
export const canPlace = (kind: TrackKind, asset: AssetKind) => asset === "audio" ? kind === "audio" : kind === "video" || kind === "overlay" || (asset === "image" && kind === "image");
export function createProject(id: string, title = "Untitled video"): EditorProject {
  const kinds: TrackKind[] = ["video","overlay","image","text","caption","audio"];
  const names = ["Video 1","Overlay 1","Images","Text","Captions","Audio 1"];
  const tracks = Object.fromEntries(kinds.map((kind,i) => [`track-${kind}`,{ id:`track-${kind}`, kind, name:names[i], clipIds:[], hidden:false, muted:false, locked:false }]));
  return { schemaVersion:1,id,title,revision:0,updatedAt:new Date().toISOString(),trackOrder:Object.keys(tracks),tracks,clips:{},assets:{},textLayers:{},captions:{},transitions:{},settings:{aspectRatio:"16:9",fps:30,background:"#000000"} };
}
export function textForClip(p: EditorProject, c: Clip): TextLayer | undefined {
  return c.contentId ? p.textLayers[c.contentId] || p.captions[c.contentId] : undefined;
}
export function formatTime(time: number, fps = 30) {
  const frames = Math.round(Math.max(0,time)*fps);
  return `${String(Math.floor(frames/fps/60)).padStart(2,"0")}:${String(Math.floor(frames/fps)%60).padStart(2,"0")}:${String(frames%fps).padStart(2,"0")}`;
}

/** Curated registry whitelist of all 47+ valid Caption Studio template presets */
export const VALID_CAPTION_PRESETS = [
  'study-hormozi-style',
  'study-ali-abdaal',
  'thora-cinematic',
  'liquid-glass',
  'mota-athletic',
  'deep-glow',
  'science-blueprint',
  'viral-hinglish-pop',
  // Curated 48 study reference templates
  'study-scribble',
  'study-lahore',
  'study-dynamic',
  'study-devin-jatho-2-0',
  'study-lala',
  'study-double-trouble',
  'study-delhi',
  'study-kalakar-motion',
  'study-kathmandu',
  'study-bubbles',
  'study-ij-template',
  'study-kalakar-glow',
  'study-clean-motion',
  'study-goa',
  'study-islamabad',
  'study-mumbai',
  'study-karachi',
  'study-shamani',
  'study-shamani-2',
  'study-flicker',
  'study-underline',
  'study-pop-up',
  'study-dhaka',
  'study-kalakar-shadow',
  'study-kalakar',
  'study-editing-skool',
  'study-mr-beast-style-1',
  'study-mr-beast-style-2',
  'study-iman-gadzhi',
  'study-devin-jatho',
  'study-highlighted-word',
  'study-clean-glow-style',
  'study-kalakar-clean',
  'study-black-punch',
  'study-kalakar-word',
  'study-pixelated-word',
  'study-ziada',
  'study-liquid-glass',
  'study-top-up',
  'study-mota',
  'study-tabahi',
  'study-deep-glow',
  'study-seedha-saadha',
  'study-thora-cinematic',
  'study-viral-hinglish-pop',
  'study-zero-gravity',
  // Canonical aliases & trending studio templates
  'hormozi-punch',
  'viral-beast',
  'quiet-luxury',
  'clean-sub',
  'kinetic-impact',
  'heavy-shadow',
  'ali-clean',
  'tiktok-pop',
  'diary-ceo',
  'studio-pill',
  'cyber-neon',
  'arcade-punch',
  'ugc-organic',
  'tiktok-native',
  'cinematic-letterbox',
  'vox-tape',
  'studio-lime',
  'studio-cobalt',
  'studio-ivory',
  'studio-ink',
  'studio-amber',
  'studio-mono',
  'studio-rose',
  'studio-podcast',
  'signature-poppins',
  'dancing-poppins',
  'editorial-serif',
  'handwritten-outfit',
  // AI Edit style recipes
  'edit-paper',
  'edit-impact',
  'edit-vinyl',
  'edit-blueprint',
  'edit-sketch',
  'edit-story',
  'edit-prism',
  'edit-prime',
  'edit-vista'
] as const;

export type CaptionPresetId = typeof VALID_CAPTION_PRESETS[number];

export interface CaptionDecision {
  presetId: CaptionPresetId; // MUST be one of VALID_CAPTION_PRESETS
  caseMode?: 'uppercase' | 'original' | 'titlecase';
  positionY?: 'top' | 'center' | 'bottom';
  maxWordsPerBatch?: 1 | 2 | 3;
}

export function isKnownCaptionPreset(id: unknown): id is CaptionPresetId {
  return typeof id === 'string' && (VALID_CAPTION_PRESETS as readonly string[]).includes(id);
}

export function normalizeCaptionPresetId(rawId: string): CaptionPresetId {
  const clean = String(rawId || '').toLowerCase().trim();
  if (clean.includes('ali') || clean.includes('abdaal')) return 'study-ali-abdaal';
  if (clean.includes('hormozi')) return 'study-hormozi-style';
  if (clean.includes('beast')) return 'study-mr-beast-style-2';
  if (clean.includes('thora') || clean.includes('cinema')) return 'study-thora-cinematic';
  if (clean.includes('glass')) return 'study-liquid-glass';
  if (clean.includes('glow')) return 'study-deep-glow';
  if (clean.includes('mota') || clean.includes('athletic')) return 'study-mota';
  if (clean.includes('hinglish')) return 'viral-hinglish-pop';
  if (clean.includes('blueprint') || clean.includes('science')) return 'edit-blueprint';
  if (clean.includes('clean') || clean.includes('sub')) return 'study-clean-motion';
  if (clean.includes('scribble')) return 'study-scribble';
  if (clean.includes('paper')) return 'edit-paper';
  if (clean.includes('impact')) return 'edit-impact';
  if (isKnownCaptionPreset(rawId)) return rawId;
  if (isKnownCaptionPreset(clean)) return clean as CaptionPresetId;
  const withStudy = ('study-' + clean.replace(/^study-/, '')) as CaptionPresetId;
  if (isKnownCaptionPreset(withStudy)) return withStudy;
  return 'study-hormozi-style';
}

