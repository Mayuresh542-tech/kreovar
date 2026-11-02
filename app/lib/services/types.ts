export type ProjectStatus =
  | "draft"
  | "in_progress"
  | "completed"
  | "researching"
  | "scripting"
  | "generating_voice"
  | "generating_assets"
  | "editing"
  | "ready"
  | "rendering"
  | "exported"
  | "error";

export type AspectRatio = "9:16" | "16:9" | "1:1";

export interface VeeloxIdea {
  id: string;
  title: string;
  hook: string;
  angle: string;
  targetAudience: string;
  format: "Shorts" | "Reels" | "TikTok" | "Long-form" | "Explainer" | "Tutorial" | "Commentary" | "Reaction" | "Listicle";
  estimatedDuration: number; // in seconds
  reasoning: string;
  platform: string;
}

export interface VeeloxResearchFact {
  fact: string;
  source?: string;
  verified: boolean;
}

export interface VeeloxResearch {
  topic: string;
  summary: string;
  keyFacts: VeeloxResearchFact[];
  statistics: string[];
  audienceSentiment: string;
  competitorObservations: string[];
  references: string[];
  isSimulated: boolean;
}

export type AssetType =
  | "generated_image"
  | "stock_video"
  | "stock_image"
  | "uploaded_media"
  | "generated_video"
  | "motion_graphic"
  | "text_only";

export type TransitionType = "fade" | "slide_left" | "slide_right" | "zoom_in" | "cut" | "wipe";

export interface VeeloxScene {
  id: string;
  order: number;
  duration: number; // in seconds
  voiceoverText: string;
  visualPrompt: string;
  assetType: AssetType;
  assetUrl: string;
  onScreenText: string;
  transition: TransitionType;
  animation?: "ken_burns" | "pulse" | "float" | "static";
  voiceAudioUrl?: string;
  voiceDuration?: number;
  isRegenerating?: boolean;
}

export interface VeeloxScript {
  title: string;
  hook: string;
  intro: string;
  bodyPoints: string[];
  payoff: string;
  cta: string;
  format: string;
  duration: number;
  scenes: VeeloxScene[];
}

export interface VeeloxCaptionWord {
  word: string;
  start: number; // in seconds
  end: number; // in seconds
}

export interface VeeloxCaption {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  words: VeeloxCaptionWord[];
  style?: {
    textColor?: string;
    highlightColor?: string;
    position?: "top" | "center" | "bottom" | "custom";
    fontSize?: number;
  };
}

export interface VeeloxTimelineClip {
  id: string;
  sceneId: string;
  trackType: "video" | "voice" | "music" | "sfx" | "text" | "caption";
  startTime: number; // in seconds
  duration: number; // in seconds
  content: string; // url or text
  properties?: Record<string, unknown>;
}

export interface VeeloxTimelineTrack {
  id: string;
  name: string;
  type: "video" | "voice" | "music" | "sfx" | "text" | "caption";
  muted?: boolean;
  volume?: number;
  clips: VeeloxTimelineClip[];
}

export interface VeeloxTimeline {
  duration: number; // total duration in seconds
  fps: number;
  resolution: {
    width: number;
    height: number;
  };
  videoTracks: VeeloxTimelineTrack[];
  audioTracks: VeeloxTimelineTrack[];
  captionTrack: VeeloxCaption[];
  backgroundMusicUrl?: string;
  musicVolume?: number;
}

export interface VeeloxVoiceConfig {
  voiceId: string;
  voiceName: string;
  provider: "elevenlabs" | "mock";
  stability?: number;
  similarityBoost?: number;
  speed?: number;
}

export interface ProjectRawFootage {
  id: string;
  url: string;
  name: string;
  duration?: number;
  size?: number;
  order?: number;
  analysis?: {
    transcript?: string;
    scenesCount?: number;
    scenes?: number;
    speakerCount?: number;
    silenceSections?: number;
    silenceCount?: number;
    potentialClips?: number;
    clips?: number;
    silenceIntervals?: Array<{ start: number; end: number; duration: number }>;
    highlights?: string[] | Array<{ text: string; start: number; end: number; score: number }>;
    analyzed?: boolean;
  };
  ai_analysis?: {
    transcript?: string;
    scenes?: number;
    clips?: number;
    silence?: number;
  };
  created_at: string;
}

export interface ProjectBRollAsset {
  id: string;
  url: string;
  title: string;
  thumbnail?: string;
  thumbnail_url?: string;
  duration?: number;
  query?: string;
  source?: string;
  aspect_ratio?: string;
  created_at: string;
}

export interface ProjectVoiceover {
  id: string;
  url: string;
  audio_url?: string;
  title?: string;
  voiceName?: string;
  voiceId?: string;
  voice_id?: string;
  duration?: number;
  text?: string;
  created_at: string;
}

export interface ProjectThumbnail {
  id: string;
  url?: string;
  image_url?: string;
  title?: string;
  prompt?: string;
  style?: string;
  badge_text?: string;
  headline_text?: string;
  created_at: string;
}

export interface ProjectIdea {
  id: string;
  title: string;
  hook?: string;
  angle?: string;
  format?: string;
  score?: number;
  created_at: string;
}

export interface ProjectScriptItem {
  id: string;
  title: string;
  content: string;
  format?: string;
  word_count?: number;
  created_at: string;
}

export interface ProjectActivityItem {
  id: string;
  action?: string;
  type?: string;
  description?: string;
  timestamp?: string;
  created_at?: string;
}

export interface ProjectSfxAsset {
  id: string;
  name: string;
  category: "transition" | "impact" | "emphasis" | "ui" | "ambient" | "pop";
  url?: string;
  duration: number;
  trigger_time?: number;
  created_at: string;
}

export interface ProjectBackgroundAsset {
  id: string;
  type: "solid" | "gradient" | "image" | "video";
  name: string;
  value: string; // hex code, css gradient, image url, or video url
  preview_url?: string;
  created_at: string;
}

export interface ProjectTypographyScene {
  id: string;
  order: number;
  text: string;
  highlight_words?: string[];
  animation_preset?: "hormozi" | "minimal" | "kinetic" | "documentary" | "tech" | "editorial";
  start_time: number;
  duration: number;
  background_id?: string;
  broll_url?: string;
  sfx_trigger?: string;
  created_at: string;
}

export interface VeeloxProject {
  id: string;
  user_id?: string;
  title: string;
  trend_topic: string;
  niche: string;
  status: ProjectStatus;
  video_mode?: "raw_footage" | "typography" | "mixed";
  aspect_ratio: AspectRatio;
  duration: number;
  idea?: VeeloxIdea | null;
  ideas?: ProjectIdea[];
  research?: VeeloxResearch | null;
  script?: VeeloxScript | null;
  scripts?: ProjectScriptItem[];
  scenes: VeeloxScene[];
  timeline?: VeeloxTimeline | null;
  captions?: VeeloxCaption[] | null;
  raw_footage?: ProjectRawFootage[];
  broll_assets?: ProjectBRollAsset[];
  voiceovers?: ProjectVoiceover[];
  thumbnails?: ProjectThumbnail[];
  sfx_assets?: ProjectSfxAsset[];
  backgrounds?: ProjectBackgroundAsset[];
  typography_scenes?: ProjectTypographyScene[];
  activity?: ProjectActivityItem[];
  export_url?: string | null;
  thumbnail_url?: string | null;
  revision?: number;
  last_saved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ProviderStatus {
  ai: {
    provider: "groq" | "mock";
    isConnected: boolean;
    model: string;
  };
  voice: {
    provider: "elevenlabs" | "mock";
    isConnected: boolean;
    activeVoice: string;
  };
  assets: {
    provider: "pollinations" | "unsplash" | "mock";
    isConnected: boolean;
  };
  renderer: {
    provider: "remotion" | "canvas_mock";
    isReady: boolean;
  };
}
