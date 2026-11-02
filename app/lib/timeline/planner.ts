import {
  VeeloxTimelineProject,
  TimelineTrack,
  TimelineItem,
  AspectRatio,
  ASPECT_RATIO_DIMENSIONS,
  MotionAnimationType,
  TransitionType,
} from "./types";
import {
  CaptionPresetId,
  CaptionPosition,
  CaptionSegment,
} from "../captions/presets";
import { CURATED_MUSIC_TRACKS } from "./musicTracks";

export interface PlannerSceneInput {
  id: string;
  label?: string;
  text: string;
  duration?: number;
}

export interface PlannerBRollItem {
  id: string;
  title?: string;
  thumbnail: string;
  videoUrl: string;
  duration?: number;
  width?: number;
  height?: number;
  source?: string;
}

export type AIEditingMode =
  | "quick_social"
  | "cinematic"
  | "clean"
  | "high_energy"
  | "storytelling"
  | "custom";

export interface PlannerInput {
  projectId: string;
  title?: string;
  scriptText?: string;
  scenes?: PlannerSceneInput[];
  voiceover?: {
    audioUrl?: string | null;
    duration?: number;
    wordsTimestamps?: Array<{ word: string; start: number; end: number }>;
  };
  brollClips?: PlannerBRollItem[];
  rawVideoUrl?: string | null;
  captions?: {
    presetId?: CaptionPresetId;
    position?: CaptionPosition;
    segments?: CaptionSegment[];
  };
  music?: {
    trackId?: string;
    audioUrl?: string;
    volume?: number;
    disabled?: boolean;
  };
  aspectRatio?: AspectRatio;
  editingMode?: AIEditingMode;
}

/**
 * Extracts key semantic terms from a sentence to match relevant B-roll footage.
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "the", "and", "a", "an", "in", "on", "at", "to", "for", "with", "is",
    "are", "was", "were", "this", "that", "it", "of", "from", "by", "as",
    "you", "your", "we", "our", "if", "or", "so", "but", "not", "have",
    "has", "had", "can", "will", "all", "more", "out", "up", "about",
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

/**
 * Calculates a semantic match score between a script section and a B-roll candidate.
 */
function scoreClipMatch(sentenceKeywords: string[], clip: PlannerBRollItem): number {
  if (sentenceKeywords.length === 0) return 0.5;

  const clipTerms = [
    ...(clip.title ? extractKeywords(clip.title) : []),
    ...(clip.source ? [clip.source.toLowerCase()] : []),
  ];

  let score = 0;
  for (const sk of sentenceKeywords) {
    for (const ct of clipTerms) {
      if (sk === ct) score += 3.0;
      else if (sk.includes(ct) || ct.includes(sk)) score += 1.5;
    }
  }

  return score;
}

/**
 * AI Video Editing Planner:
 * Analyzes script cadence, voiceover timestamps, and available visual assets to synthesize
 * a production-ready, synchronized timeline with intelligent cuts, motion, audio ducking,
 * and kinetic captions.
 */
export function generateAutoTimeline(input: PlannerInput): VeeloxTimelineProject {
  const {
    projectId,
    title = "Untitled Video Project",
    scriptText = "",
    scenes = [],
    voiceover,
    brollClips = [],
    rawVideoUrl,
    captions,
    music,
    aspectRatio = "9:16",
  } = input;

  // 1. Calculate Target Video Duration
  let totalDuration = 0;
  if (voiceover?.duration && voiceover.duration > 0) {
    totalDuration = voiceover.duration;
  } else if (captions?.segments && captions.segments.length > 0) {
    const lastSeg = captions.segments[captions.segments.length - 1];
    totalDuration = lastSeg.end;
  } else if (scenes.length > 0) {
    totalDuration = scenes.reduce((sum, s) => sum + (s.duration || 4), 0);
  } else {
    // Fallback: estimate from script words (~0.35s per word)
    const wordCount = scriptText.trim().split(/\s+/).filter(Boolean).length;
    totalDuration = Math.max(5, wordCount * 0.35);
  }

  // Ensure minimum duration
  totalDuration = Math.max(3.0, Math.round(totalDuration * 10) / 10);

  // 2. Identify Script Segments / Sentences for Visual Pacing
  interface SentenceSlice {
    text: string;
    startTime: number;
    endTime: number;
    duration: number;
    isHook: boolean;
    isOutro: boolean;
  }

  const slices: SentenceSlice[] = [];

  // Case A: Exact Word Timestamps available from Voiceover
  if (voiceover?.wordsTimestamps && voiceover.wordsTimestamps.length > 0) {
    const words = voiceover.wordsTimestamps;
    let currentSliceWords: Array<{ word: string; start: number; end: number }> = [];

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      currentSliceWords.push(w);

      const isPunctuation = /[.!?]$/.test(w.word);
      const isTimeGap = i < words.length - 1 && (words[i + 1].start - w.end > 0.45);
      const isWordLimit = currentSliceWords.length >= 10;
      const isLastWord = i === words.length - 1;

      if (isPunctuation || isTimeGap || isWordLimit || isLastWord) {
        const sStart = currentSliceWords[0].start;
        const sEnd = currentSliceWords[currentSliceWords.length - 1].end;
        const sText = currentSliceWords.map((cw) => cw.word).join(" ");
        const sDuration = Math.max(1.5, Math.round((sEnd - sStart) * 100) / 100);

        slices.push({
          text: sText,
          startTime: sStart,
          endTime: sEnd,
          duration: sDuration,
          isHook: slices.length === 0,
          isOutro: false,
        });

        currentSliceWords = [];
      }
    }

    if (slices.length > 0) {
      slices[slices.length - 1].isOutro = true;
      // Guarantee last slice extends to totalDuration
      slices[slices.length - 1].endTime = totalDuration;
      slices[slices.length - 1].duration = Math.max(
        1.5,
        totalDuration - slices[slices.length - 1].startTime
      );
    }
  } else if (scenes.length > 0) {
    // Case B: Scenes breakdown provided
    let currentTime = 0;
    scenes.forEach((scene, idx) => {
      const sceneDur = scene.duration || Math.max(2.5, totalDuration / scenes.length);
      const endTime = Math.min(totalDuration, currentTime + sceneDur);
      slices.push({
        text: scene.text,
        startTime: currentTime,
        endTime: idx === scenes.length - 1 ? totalDuration : endTime,
        duration: (idx === scenes.length - 1 ? totalDuration : endTime) - currentTime,
        isHook: idx === 0,
        isOutro: idx === scenes.length - 1,
      });
      currentTime = endTime;
    });
  } else {
    // Case C: Raw script text parsed by sentence punctuation
    const rawSentences = scriptText
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const sentenceList = rawSentences.length > 0 ? rawSentences : ["Engaging short-form video content."];
    const avgDuration = totalDuration / sentenceList.length;

    let curTime = 0;
    sentenceList.forEach((text, idx) => {
      const isLast = idx === sentenceList.length - 1;
      const sEnd = isLast ? totalDuration : Math.min(totalDuration, curTime + avgDuration);
      slices.push({
        text,
        startTime: curTime,
        endTime: sEnd,
        duration: sEnd - curTime,
        isHook: idx === 0,
        isOutro: isLast,
      });
      curTime = sEnd;
    });
  }

  // Fallback if no slices generated
  if (slices.length === 0) {
    slices.push({
      text: scriptText || "Main video visual",
      startTime: 0,
      endTime: totalDuration,
      duration: totalDuration,
      isHook: true,
      isOutro: true,
    });
  }

  // 3. Match and Assign B-Roll Items
  const videoItems: TimelineItem[] = [];
  const usedClipIds = new Set<string>();

  // Determine fallback visual asset (either user raw footage or curated stock)
  const defaultFallbackUrl =
    rawVideoUrl ||
    (brollClips.length > 0 ? brollClips[0].videoUrl : "https://cdn.coverr.co/videos/coverr-modern-city-skyline-at-night-8451/1080p.mp4");

  slices.forEach((slice, idx) => {
    const keywords = extractKeywords(slice.text);

    // Score all candidate clips
    let bestClip: PlannerBRollItem | null = null;
    let highestScore = -1;

    for (const clip of brollClips) {
      if (!clip.videoUrl) continue;
      let score = scoreClipMatch(keywords, clip);
      // Penalize recently used clips to encourage visual variety
      if (usedClipIds.has(clip.id)) {
        score -= 2.0;
      }
      if (score > highestScore) {
        highestScore = score;
        bestClip = clip;
      }
    }

    // Fallback if clips pool is empty or exhausted
    if (!bestClip && brollClips.length > 0) {
      bestClip = brollClips[idx % brollClips.length];
    }

    const clipSource = bestClip?.videoUrl || defaultFallbackUrl;
    if (bestClip?.id) {
      usedClipIds.add(bestClip.id);
    }

    const mode = input.editingMode || "quick_social";

    // Assign Motion Effect according to AI editing mode
    let animation: MotionAnimationType = "none";
    if (mode === "quick_social") {
      if (slice.isHook) animation = "slow_zoom_in";
      else if (idx % 2 === 1) animation = "slow_zoom_out";
    } else if (mode === "cinematic") {
      animation = idx % 2 === 0 ? "pan_left" : "slow_zoom_out";
    } else if (mode === "high_energy") {
      animation = idx % 2 === 0 ? "slow_zoom_in" : "slow_zoom_out";
    } else if (mode === "clean") {
      animation = "none";
    } else if (mode === "storytelling") {
      animation = idx % 3 === 0 ? "slow_zoom_in" : "none";
    }

    // Assign Transition according to AI editing mode
    let transition: TransitionType = "cut";
    if (mode === "quick_social") {
      if (idx === 1) transition = "zoom";
      else if (slice.isOutro) transition = "fade";
      else transition = "cut";
    } else if (mode === "cinematic") {
      transition = idx === 0 ? "cut" : "dissolve";
    } else if (mode === "high_energy") {
      transition = idx % 3 === 1 ? "zoom" : idx % 3 === 2 ? "slide" : "cut";
    } else if (mode === "clean") {
      transition = "cut";
    } else if (mode === "storytelling") {
      transition = idx % 2 === 1 ? "dissolve" : "cut";
    }

    videoItems.push({
      id: `clip_${idx + 1}_${Math.random().toString(36).slice(2, 7)}`,
      track: "video",
      startTime: slice.startTime,
      endTime: slice.endTime,
      duration: slice.duration,
      source: clipSource,
      type: "broll",
      volume: 0, // Video track audio muted in favor of voiceover & soundtrack
      transition,
      animation,
      metadata: {
        title: bestClip?.title || `Scene ${idx + 1}`,
        matchedSentence: slice.text,
        sentenceIndex: idx,
        thumbnail: bestClip?.thumbnail,
        sourceDuration: bestClip?.duration || 10,
        creator: bestClip?.source || "Pexels / Studio Stock",
      },
    });
  });

  // 4. Construct Caption Track from Existing Segments
  let defaultPreset: CaptionPresetId = "clean";
  const editMode = input.editingMode || "quick_social";
  if (editMode === "quick_social") defaultPreset = "creator";
  else if (editMode === "cinematic") defaultPreset = "minimal";
  else if (editMode === "high_energy") defaultPreset = "bold";

  const captionPreset = captions?.presetId || defaultPreset;
  const captionPosition = captions?.position || "center";
  const captionItems: TimelineItem[] = [];

  if (captions?.segments && captions.segments.length > 0) {
    captions.segments.forEach((seg, sIdx) => {
      captionItems.push({
        id: `cap_${sIdx + 1}_${seg.id}`,
        track: "captions",
        startTime: seg.start,
        endTime: Math.min(totalDuration, seg.end),
        duration: Math.max(0.5, seg.end - seg.start),
        source: seg.text,
        type: "caption",
        volume: 0,
        transition: "cut",
        animation: "none",
        metadata: {
          captionSegment: seg,
          captionPreset,
          captionPosition,
        },
      });
    });
  }

  // 5. Construct Voiceover Track
  const voiceoverItems: TimelineItem[] = [];
  if (voiceover?.audioUrl) {
    voiceoverItems.push({
      id: "voiceover_primary",
      track: "voiceover",
      startTime: 0,
      endTime: totalDuration,
      duration: totalDuration,
      source: voiceover.audioUrl,
      type: "voiceover",
      volume: 1.0, // 100% voiceover volume
      transition: "cut",
      animation: "none",
      metadata: {
        title: "AI Voiceover",
        duration: voiceover.duration || totalDuration,
      },
    });
  }

  // 6. Construct Background Music Track
  const musicItems: TimelineItem[] = [];
  const isMusicDisabled = Boolean(music?.disabled);

  if (!isMusicDisabled) {
    const selectedMusic =
      CURATED_MUSIC_TRACKS.find((m) => m.id === music?.trackId) ||
      CURATED_MUSIC_TRACKS[0];

    const musicUrl = music?.audioUrl || selectedMusic.audioUrl;
    const baseVolume = music?.volume ?? selectedMusic.defaultVolume;

    musicItems.push({
      id: "bg_music_primary",
      track: "music",
      startTime: 0,
      endTime: totalDuration,
      duration: totalDuration,
      source: musicUrl,
      type: "music",
      volume: baseVolume, // 10-20% default volume with ducking envelope
      transition: "fade",
      animation: "none",
      metadata: {
        title: selectedMusic.title,
        artist: selectedMusic.artist,
        genre: selectedMusic.genre,
        ducking: true,
        duckingVolume: 0.12,
        pauseVolume: 0.22,
      },
    });
  }

  // Assemble Tracks
  const tracks: TimelineTrack[] = [
    {
      id: "track_video",
      type: "video",
      name: "Video & B-Roll",
      items: videoItems,
    },
    {
      id: "track_overlays",
      type: "overlays",
      name: "Graphics & Overlays",
      items: [],
    },
    {
      id: "track_captions",
      type: "captions",
      name: "Kinetic Captions",
      items: captionItems,
    },
    {
      id: "track_voiceover",
      type: "voiceover",
      name: "Spoken Voiceover",
      items: voiceoverItems,
    },
    {
      id: "track_music",
      type: "music",
      name: "Background Music",
      items: musicItems,
    },
    {
      id: "track_sfx",
      type: "sfx",
      name: "Sound Effects",
      items: [],
    },
  ];

  return {
    id: projectId || `proj_${Date.now()}`,
    title,
    duration: totalDuration,
    aspectRatio,
    resolution: ASPECT_RATIO_DIMENSIONS[aspectRatio],
    tracks,
    settings: {
      audioDucking: true,
      duckingFactor: 0.15,
      musicVolume: music?.volume ?? 0.18,
      voiceVolume: 1.0,
      captionPreset,
      captionPosition,
      fps: 30,
    },
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
