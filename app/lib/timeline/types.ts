import { CaptionPresetId, CaptionPosition, CaptionSegment, CaptionStyleConfig } from "../captions/presets";

export type AspectRatio = "9:16" | "16:9" | "1:1" | "4:5" | "4:3" | "custom";

export type TimelineTrackType =
  | "video"
  | "overlays"
  | "captions"
  | "text"
  | "voiceover"
  | "music"
  | "sfx";

export type TimelineItemType =
  | "broll"
  | "raw"
  | "image"
  | "caption"
  | "text"
  | "voiceover"
  | "music"
  | "sfx"
  | "overlay";

export type TransitionType =
  | "cut"
  | "fade"
  | "dissolve"
  | "dip_black"
  | "dip_white"
  | "slide"
  | "zoom"
  | "wipe"
  | "push"
  | "blur";

export type MotionAnimationType =
  | "none"
  | "slow_zoom_in"
  | "slow_zoom_out"
  | "pan_left"
  | "pan_right";

export type SpeedCurvePreset =
  | "normal"
  | "montage"
  | "hero"
  | "bullet"
  | "fast"
  | "slowmo"
  | "custom";

export type KeyframeProperty =
  | "position_x"
  | "position_y"
  | "scale"
  | "rotation"
  | "opacity"
  | "volume";

export type KeyframeEasing = "linear" | "ease_in" | "ease_out" | "ease_in_out";

export interface TimelineKeyframe {
  id: string;
  time: number; // seconds relative to clip start
  property: KeyframeProperty;
  value: number;
  easing: KeyframeEasing;
}

export interface TimelineCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TimelinePosition {
  x: number;
  y: number;
}

export interface TimelineColorAdjustments {
  brightness: number;  // -100 to 100, default 0
  contrast: number;    // -100 to 100, default 0
  saturation: number;  // -100 to 100, default 0
  exposure: number;    // -100 to 100, default 0
  temperature: number; // -100 to 100, default 0
  tint: number;        // -100 to 100, default 0
  highlights: number;  // -100 to 100, default 0
  shadows: number;     // -100 to 100, default 0
  vignette: number;    // 0 to 100, default 0
}

export type FilterPresetId =
  | "none"
  | "cinematic"
  | "warm"
  | "cool"
  | "vintage"
  | "bw"
  | "film"
  | "clean";

export interface TimelineEffect {
  type: "blur" | "sharpen" | "noise" | "grain" | "glitch" | "rgb_split" | "vhs" | "pixelate";
  intensity: number; // 0 to 100
}

export interface TimelineTextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  outlineColor?: string;
  outlineWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  backgroundColor?: string;
  backgroundPadding?: number;
  textAlign: "left" | "center" | "right";
  letterSpacing?: number;
  lineHeight?: number;
  textTransform?: "uppercase" | "lowercase" | "capitalize" | "none";
  animation?: "none" | "fade" | "slide" | "pop" | "typewriter" | "word_reveal" | "glow" | "bounce";
}

export interface TimelineMarker {
  id: string;
  time: number;
  label: string;
  color: string;
}

export interface TimelineItem {
  id: string;
  track: TimelineTrackType;
  startTime: number; // in seconds
  endTime: number;   // in seconds
  duration: number;  // in seconds
  source: string;    // url, text, or asset identifier
  type: TimelineItemType;
  volume: number;    // 0 to 1
  pan?: number;      // -1 (left) to +1 (right), default 0
  fadeIn?: number;   // fade in duration in seconds
  fadeOut?: number;  // fade out duration in seconds
  transition: TransitionType;
  transitionDuration?: number; // default 0.5s
  animation: MotionAnimationType;
  position?: TimelinePosition;
  scale?: number;
  rotation?: number;  // in degrees (-360 to +360)
  opacity?: number;   // 0 to 1
  fit?: "cover" | "contain" | "fill";
  crop?: TimelineCrop;
  speed?: number;     // 0.1 to 8.0, default 1.0
  speedCurvePreset?: SpeedCurvePreset;
  speedPoints?: Array<{ time: number; speed: number }>;
  colorAdjustments?: TimelineColorAdjustments;
  filterPreset?: FilterPresetId;
  filterIntensity?: number; // 0 to 1.0
  effects?: TimelineEffect[];
  textStyle?: TimelineTextStyle;
  keyframes?: TimelineKeyframe[];
  metadata?: {
    title?: string;
    description?: string;
    matchedSentence?: string;
    sentenceIndex?: number;
    thumbnail?: string;
    width?: number;
    height?: number;
    sourceOffset?: number; // trim offset from original clip start
    sourceDuration?: number;
    creator?: string;
    captionPreset?: CaptionPresetId;
    captionPosition?: CaptionPosition;
    captionSegment?: CaptionSegment;
    [key: string]: unknown;
  };
}

export interface TimelineTrack {
  id: string;
  type: TimelineTrackType;
  name: string;
  muted?: boolean;
  solo?: boolean;
  locked?: boolean;
  hidden?: boolean;
  items: TimelineItem[];
}

export interface TimelineSettings {
  audioDucking: boolean;
  duckingFactor: number;   // default 0.15 (15% volume during speech)
  musicVolume: number;     // default 0.18
  voiceVolume: number;     // default 1.0
  captionPreset: CaptionPresetId;
  captionPosition: CaptionPosition;
  captionStyle?: CaptionStyleConfig;
  captionTemplateId?: string;
  fps: number;
  markers?: TimelineMarker[];
  brandKit?: {
    brandName?: string;
    primaryColor?: string;
    secondaryColor?: string;
    fontFamily?: string;
    logoUrl?: string;
  };
  watermark?: {
    enabled: boolean;
    logoUrl: string;
    position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    scale: number;
    opacity: number;
  };
  background?: {
    type: "color" | "gradient" | "image";
    value: string;
  };
}

export interface VeeloxTimelineProject {
  id: string;
  title: string;
  duration: number;
  aspectRatio: AspectRatio;
  resolution: {
    width: number;
    height: number;
  };
  tracks: TimelineTrack[];
  settings: TimelineSettings;
  version: number;
  revision?: number;
  lastSavedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const ASPECT_RATIO_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "4:3": { width: 1440, height: 1080 },
  "custom": { width: 1080, height: 1920 },
};
