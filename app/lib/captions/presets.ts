import { TTSWordTimestamp } from "../server/tts/types";
import {
  CaptionTemplate,
  CaptionStyleConfig,
  DEFAULT_CAPTION_TEMPLATES,
  CAPTION_CATEGORIES,
  CaptionCategory,
  CaptionAnimationType,
  HighlightingMode,
  isViralKeyword,
  getTemplateById,
} from "./templates";

export type { TTSWordTimestamp };
export type {
  CaptionTemplate,
  CaptionStyleConfig,
  CaptionCategory,
  CaptionAnimationType,
  HighlightingMode,
};
export {
  DEFAULT_CAPTION_TEMPLATES,
  CAPTION_CATEGORIES,
  isViralKeyword,
  getTemplateById,
};

export type CaptionPresetId =
  | "clean"
  | "bold"
  | "highlight"
  | "minimal"
  | "creator"
  | string;

export type CaptionPosition = "top" | "center" | "bottom" | "custom";

export interface CaptionPreset {
  id: CaptionPresetId;
  name: string;
  tagline: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: number;
  textTransform: "uppercase" | "none" | "capitalize";
  position: CaptionPosition;
  textColor: string;
  highlightColor: string;
  highlightBg?: string;
  containerBg?: string;
  animation: string;
  letterSpacing?: string;
  lineHeight?: string;
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  alignment?: "left" | "center" | "right";
  maxWordsPerLine?: number;
  highlightingMode?: HighlightingMode;
}

// Convert template style into preset
function templateToPreset(tmpl: CaptionTemplate): CaptionPreset {
  return {
    id: tmpl.id,
    name: tmpl.name,
    tagline: tmpl.tagline,
    fontFamily: tmpl.style.fontFamily,
    fontSize: `${tmpl.style.fontSize}px`,
    fontWeight: tmpl.style.fontWeight,
    textTransform: tmpl.style.textTransform,
    position: tmpl.style.position,
    textColor: tmpl.style.textColor,
    highlightColor: tmpl.style.highlightColor,
    highlightBg: tmpl.style.highlightBg,
    containerBg: tmpl.style.containerBg,
    animation: tmpl.style.animation,
    letterSpacing: tmpl.style.letterSpacing,
    lineHeight: `${tmpl.style.lineSpacing}`,
    strokeColor: tmpl.style.strokeColor,
    strokeWidth: tmpl.style.strokeWidth,
    shadowColor: tmpl.style.shadowColor,
    shadowBlur: tmpl.style.shadowBlur,
    shadowOffsetX: tmpl.style.shadowOffsetX,
    shadowOffsetY: tmpl.style.shadowOffsetY,
    alignment: tmpl.style.alignment,
    maxWordsPerLine: tmpl.style.maxWordsPerLine,
    highlightingMode: tmpl.style.highlightingMode,
  };
}

// Base 5 presets for backwards compatibility
const BASE_PRESETS: Record<string, CaptionPreset> = {
  clean: {
    id: "clean",
    name: "Clean",
    tagline: "Crisp, balanced & modern",
    fontFamily: "var(--font-inter), sans-serif",
    fontSize: "26px",
    fontWeight: 600,
    textTransform: "none",
    position: "center",
    textColor: "#F8FAFC",
    highlightColor: "#38BDF8",
    containerBg: "rgba(10, 12, 18, 0.78)",
    animation: "glow",
    letterSpacing: "-0.01em",
    lineHeight: "1.3",
  },
  bold: {
    id: "bold",
    name: "Bold",
    tagline: "High impact & commanding",
    fontFamily: "var(--font-anton), Impact, sans-serif",
    fontSize: "36px",
    fontWeight: 900,
    textTransform: "uppercase",
    position: "center",
    textColor: "#FFFFFF",
    highlightColor: "#FACC15",
    animation: "pop",
    letterSpacing: "0.03em",
    lineHeight: "1.2",
  },
  highlight: {
    id: "highlight",
    name: "Highlight",
    tagline: "Marker box over spoken word",
    fontFamily: "var(--font-poppins), sans-serif",
    fontSize: "30px",
    fontWeight: 700,
    textTransform: "uppercase",
    position: "center",
    textColor: "#FFFFFF",
    highlightColor: "#090A0F",
    highlightBg: "#38BDF8",
    containerBg: "rgba(8, 9, 12, 0.65)",
    animation: "marker",
    letterSpacing: "0.01em",
    lineHeight: "1.3",
  },
  minimal: {
    id: "minimal",
    name: "Minimal",
    tagline: "Understated lower-third glow",
    fontFamily: "var(--font-inter), sans-serif",
    fontSize: "22px",
    fontWeight: 500,
    textTransform: "none",
    position: "bottom",
    textColor: "#94A3B8",
    highlightColor: "#FFFFFF",
    animation: "glow",
    letterSpacing: "0em",
    lineHeight: "1.4",
  },
  creator: {
    id: "creator",
    name: "Creator",
    tagline: "Viral TikTok & Reels energy",
    fontFamily: "var(--font-anton), Impact, sans-serif",
    fontSize: "40px",
    fontWeight: 900,
    textTransform: "uppercase",
    position: "center",
    textColor: "#FFFFFF",
    highlightColor: "#4ADE80",
    containerBg: "rgba(0, 0, 0, 0.8)",
    animation: "bounce",
    letterSpacing: "0.02em",
    lineHeight: "1.2",
  },
};

// Build comprehensive preset registry with both legacy and new templates
export const CAPTION_PRESETS: Record<string, CaptionPreset> = {
  ...BASE_PRESETS,
};

DEFAULT_CAPTION_TEMPLATES.forEach((tmpl) => {
  CAPTION_PRESETS[tmpl.id] = templateToPreset(tmpl);
});

export interface CaptionSegment {
  templateId?:string;styleOverride?:Partial<CaptionStyleConfig>;emphasizedWords?:number[];wordStyles?:Record<number,{entrance?:import("./studioDesign").CaptionTransition;spotlight?:boolean}>;
  id: string;
  text: string;
  start: number; // in seconds
  end: number;   // in seconds
  words: TTSWordTimestamp[];
}

/**
 * Groups word timestamps into natural short-form subtitle segments (1 to 6 words max).
 * Retains exact word-level start & end timestamps for real-time word highlighting.
 */
export function groupWordsIntoSegments(
  words: TTSWordTimestamp[],
  targetWordsPerSegment: number = 4
): CaptionSegment[] {
  if (!words || words.length === 0) return [];

  const segments: CaptionSegment[] = [];
  let currentGroup: TTSWordTimestamp[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    currentGroup.push(w);

    const isPunctuationBreak = /[.!?]$/.test(w.word);
    const isTargetCountReached = currentGroup.length >= targetWordsPerSegment;
    const isLastWord = i === words.length - 1;

    if (isPunctuationBreak || isTargetCountReached || isLastWord) {
      const segText = currentGroup.map((cw) => cw.word).join(" ");
      const segStart = currentGroup[0].start;
      const segEnd = currentGroup[currentGroup.length - 1].end;

      // Whisper can align punctuation or short words to a single instant.
      // Keep the actual words and measured interval; merge with the adjoining phrase.
      if(segEnd-segStart<.002){
        const previous=segments.at(-1);
        if(previous&&segStart<=previous.end+.001&&segEnd>=previous.start){
          previous.text+=' '+segText;previous.words=[...(previous.words||[]),...currentGroup];currentGroup=[];continue;
        }
        if(isLastWord)throw new Error('Speech timing is unavailable for the last words. Retry transcription.');
        continue;
      }

      segments.push({
        id: `seg_${segments.length + 1}_${Math.random().toString(36).slice(2, 6)}`,
        text: segText,
        start: segStart,
        end: segEnd,
        words: [...currentGroup],
      });

      currentGroup = [];
    }
  }

  return segments;
}

/**
 * Creates timed caption segments from raw transcript text (for user-uploaded raw footage).
 * Approximates natural speech cadence (~0.35s per word or scaled to total video duration).
 */
export function createSegmentsFromTranscript(
  transcript: string,
  totalDurationSeconds?: number,
  targetWordsPerSegment: number = 4
): CaptionSegment[] {
  if (!transcript || !transcript.trim()) return [];

  // Normalize and tokenize words
  const rawWords = transcript
    .trim()
    .split(/\s+/)
    .filter((w) => Boolean(w.trim()));

  if (rawWords.length === 0) return [];

  const defaultWordDuration = 0.35; // standard speech rate (~170 wpm)
  const totalEstimatedTime = rawWords.length * defaultWordDuration;
  const scale = totalDurationSeconds && totalDurationSeconds > 0
    ? totalDurationSeconds / totalEstimatedTime
    : 1;

  let currentStart = 0;
  const wordTimestamps: TTSWordTimestamp[] = rawWords.map((word) => {
    const isPunctuation = /[.!?]$/.test(word);
    const baseDuration = (isPunctuation ? 0.45 : 0.32) * scale;
    const start = Math.round(currentStart * 100) / 100;
    const end = Math.round((currentStart + baseDuration) * 100) / 100;
    currentStart = end + (isPunctuation ? 0.1 * scale : 0.02 * scale);
    return { word, start, end };
  });

  return groupWordsIntoSegments(wordTimestamps, targetWordsPerSegment);
}
