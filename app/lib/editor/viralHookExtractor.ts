import type { EditorProject, CaptionWord } from "./model";
import { speechContext } from "./speechContext";

export interface TimedWord {
  word: string;
  start: number;
  end: number;
}

export interface TimedCaptionInput {
  text: string;
  start: number;
  end: number;
  words?: TimedWord[];
}

export type TranscriptInput =
  | EditorProject
  | TimedWord[]
  | TimedCaptionInput[]
  | string;

export type HookCategory =
  | "question"
  | "controversial"
  | "emotional"
  | "high-density";

export interface ViralHookMetrics {
  hookScore: number;
  densityScore: number;
  cadenceScore: number;
  keywordScore: number;
  wpm: number;
  wordCount: number;
}

export interface ViralHookSegment {
  id: string;
  start: number;
  end: number;
  duration: number;
  title: string;
  confidence: number;
  hookType: HookCategory;
  reason: string;
  metrics: ViralHookMetrics;
  sampleText: string;
}

export interface ViralHookOptions {
  /** Target minimum segment duration in seconds (default: 30) */
  minDuration?: number;
  /** Target maximum segment duration in seconds (default: 60) */
  maxDuration?: number;
  /** Sliding window step in seconds (default: 3) */
  stepSeconds?: number;
  /** Maximum number of non-overlapping hooks to return (default: 5) */
  topK?: number;
  /** Minimum confidence threshold between 0.0 and 1.0 (default: 0.45) */
  minConfidence?: number;
}

// High-converting question openers
const QUESTION_HOOK_PATTERNS = [
  /^(why\s+(do|does|did|is|are|was|were|would|should|could|can|can't|won't))\b/i,
  /^(how\s+(to|did|does|do|can|could|would|is|are))\b/i,
  /^(what\s+(if|happens|is|are|actually|really))\b/i,
  /^(have\s+you\s+ever\s+(noticed|wondered|thought|seen))\b/i,
  /^(did\s+you\s+know\s+(that)?)\b/i,
  /^(is\s+it\s+(really|actually|possible|true))\b/i,
  /^(can\s+you\s+(actually|really|believe))\b/i,
  /^(who\s+else\s+(wants|is|does))\b/i,
  /^(where\s+(does|did|is|are))\b/i,
];

// Controversial pattern interrupts & disruptive declarations
const CONTROVERSIAL_HOOK_PATTERNS = [
  /\b(nobody\s+tells\s+you|no\s+one\s+is\s+talking\s+about)\b/i,
  /\b(stop\s+doing\s+this|stop\s+making\s+this|never\s+do\s+this)\b/i,
  /\b(is\s+a\s+complete\s+lie|is\s+a\s+scam|is\s+a\s+trap|is\s+a\s+myth)\b/i,
  /\b(biggest\s+mistake|worst\s+mistake|fatal\s+mistake)\b/i,
  /\b(everyone\s+is\s+wrong|everyone\s+got\s+this\s+wrong)\b/i,
  /\b(the\s+harsh\s+truth|the\s+ugly\s+truth|the\s+real\s+truth)\b/i,
  /\b(unpopular\s+opinion|controversial\s+take)\b/i,
  /\b(they\s+don't\s+want\s+you\s+to\s+know|they're\s+lying\s+to\s+you)\b/i,
  /\b(wasting\s+your\s+(time|money)|ruining\s+your)\b/i,
  /\b(i\s+was\s+completely\s+wrong|i\s+regret)\b/i,
  /\b(don't\s+buy|don't\s+use|don't\s+ever)\b/i,
  /\b(secret\s+that|secret\s+method|secret\s+formula)\b/i,
  /\b(exposing\s+the|the\s+dark\s+side\s+of)\b/i,
];

// High-arousal emotional & curiosity hooks
const EMOTIONAL_HOOK_PATTERNS = [
  /\b(insane|unbelievable|shocking|crazy|mind[- ]blowing)\b/i,
  /\b(game[- ]changer|life[- ]changing|transformational)\b/i,
  /\b(terrifying|horrifying|heartbreaking|devastating)\b/i,
  /\b(pure\s+genius|brilliant|masterclass)\b/i,
  /\b(holy\s+shit|oh\s+my\s+god|i\s+can't\s+believe)\b/i,
  /\b(destroyed|ruined|saved\s+my\s+life)\b/i,
  /\b(millionaire|billionaire|financial\s+freedom)\b/i,
  /\b(impossible|miracle|nightmare)\b/i,
  /\b(changed\s+everything|blew\s+my\s+mind)\b/i,
];

// Viral keyword groups for retention & authority scoring
const VIRAL_KEYWORDS = new Set([
  // Wealth & Money
  "money", "cash", "profit", "rich", "dollar", "wealth", "income", "million",
  "billion", "crypto", "bitcoin", "investing", "invest", "stock", "stocks",
  "passive", "revenue", "bank", "cost", "free", "cheap", "broke",
  // AI & Tech
  "ai", "chatgpt", "openai", "gpt", "model", "algorithm", "software", "tool",
  "automate", "automation", "code", "tech", "technology", "bot", "agents",
  // Performance & Psychology
  "hack", "secret", "strategy", "formula", "cheat", "system", "rule", "rules",
  "mistake", "mistakes", "growth", "fast", "instant", "habit", "habits",
  "focus", "discipline", "brain", "dopamine", "psychology", "mindset",
  // Virality & Reach
  "viral", "views", "tiktok", "youtube", "shorts", "reels", "audience",
  "followers", "retention", "hook", "conversion", "sales", "funnel",
]);

/**
 * Normalizes any transcript input format into a chronological list of timed words.
 */
export function normalizeTranscript(input: TranscriptInput): TimedWord[] {
  if (!input) return [];

  // 1. EditorProject input
  if (typeof input === "object" && "tracks" in input && "clips" in input) {
    const sc = speechContext(input as EditorProject);
    const words: TimedWord[] = [];
    for (const segment of sc) {
      if (segment.words && segment.words.length > 0) {
        for (const w of segment.words) {
          if (w.word && Number.isFinite(w.start) && Number.isFinite(w.end)) {
            words.push({ word: w.word.trim(), start: w.start, end: w.end });
          }
        }
      } else if (segment.text) {
        // Synthesize word timings across segment duration
        const tokens = segment.text.trim().split(/\s+/).filter(Boolean);
        const dur = Math.max(0.1, segment.end - segment.start);
        const step = dur / tokens.length;
        tokens.forEach((token, i) => {
          words.push({
            word: token,
            start: Number((segment.start + i * step).toFixed(3)),
            end: Number((segment.start + (i + 1) * step).toFixed(3)),
          });
        });
      }
    }
    return words.sort((a, b) => a.start - b.start);
  }

  // 2. Array of TimedWord
  if (
    Array.isArray(input) &&
    input.length > 0 &&
    typeof input[0] === "object" &&
    "word" in input[0] &&
    "start" in input[0]
  ) {
    return (input as TimedWord[])
      .filter((w) => w.word && Number.isFinite(w.start) && Number.isFinite(w.end))
      .sort((a, b) => a.start - b.start);
  }

  // 3. Array of TimedCaptionInput
  if (
    Array.isArray(input) &&
    input.length > 0 &&
    typeof input[0] === "object" &&
    "text" in input[0]
  ) {
    const words: TimedWord[] = [];
    for (const item of input as TimedCaptionInput[]) {
      if (item.words && item.words.length > 0) {
        for (const w of item.words) {
          words.push({ word: w.word, start: w.start, end: w.end });
        }
      } else {
        const tokens = String(item.text).trim().split(/\s+/).filter(Boolean);
        const dur = Math.max(0.1, item.end - item.start);
        const step = dur / Math.max(1, tokens.length);
        tokens.forEach((token, i) => {
          words.push({
            word: token,
            start: Number((item.start + i * step).toFixed(3)),
            end: Number((item.start + (i + 1) * step).toFixed(3)),
          });
        });
      }
    }
    return words.sort((a, b) => a.start - b.start);
  }

  // 4. Raw text string (may contain timestamps or plain text)
  if (typeof input === "string") {
    const text = input.trim();
    if (!text) return [];

    // Check for SRT / VTT or timestamp pattern: [00:12.300] or 00:00:12,300
    const tsRegex = /(?:\[?(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,](\d{1,3}))?\]?)/g;
    const tokens = text.split(/\s+/).filter(Boolean);
    const words: TimedWord[] = [];

    // Fallback: estimate speech timing at standard 155 WPM (0.387 seconds per word)
    const avgWordSec = 60 / 155;
    tokens.forEach((tok, i) => {
      words.push({
        word: tok,
        start: Number((i * avgWordSec).toFixed(3)),
        end: Number(((i + 1) * avgWordSec).toFixed(3)),
      });
    });
    return words;
  }

  return [];
}

/**
 * Evaluates the first 3-8 seconds of a window to score the hook type and punch.
 */
export function detectHookType(
  openingWords: TimedWord[]
): { hookType: HookCategory; score: number; reason: string } {
  if (!openingWords.length) {
    return { hookType: "high-density", score: 0.3, reason: "Baseline speech segment" };
  }

  const openingText = openingWords.map((w) => w.word).join(" ");
  const cleanOpening = openingText.toLowerCase().replace(/[^\w\s'?]/g, "");

  // 1. Question Openings
  for (const pattern of QUESTION_HOOK_PATTERNS) {
    if (pattern.test(cleanOpening)) {
      return {
        hookType: "question",
        score: 0.95,
        reason: `High-retention question hook: "${openingText.slice(0, 48)}…"`,
      };
    }
  }
  if (openingText.slice(0, 80).includes("?")) {
    return {
      hookType: "question",
      score: 0.88,
      reason: `Direct rhetorical question opener in first 6 seconds`,
    };
  }

  // 2. Controversial Statements / Pattern Interrupts
  for (const pattern of CONTROVERSIAL_HOOK_PATTERNS) {
    if (pattern.test(cleanOpening)) {
      return {
        hookType: "controversial",
        score: 0.96,
        reason: `Disruptive declaration or contrarian hook: "${openingText.slice(0, 50)}…"`,
      };
    }
  }

  // 3. Emotional / High-Curiosity Hooks
  for (const pattern of EMOTIONAL_HOOK_PATTERNS) {
    if (pattern.test(cleanOpening)) {
      return {
        hookType: "emotional",
        score: 0.91,
        reason: `High-arousal emotional or curiosity hook: "${openingText.slice(0, 48)}…"`,
      };
    }
  }

  return {
    hookType: "high-density",
    score: 0.45,
    reason: "Standard narrative opening with positive speech flow",
  };
}

/**
 * Calculates speech density (WPM) and dynamic cadence variance.
 */
export function calculateSpeechMetrics(
  words: TimedWord[],
  duration: number
): { wpm: number; densityScore: number; cadenceScore: number } {
  if (duration <= 0 || !words.length) {
    return { wpm: 0, densityScore: 0, cadenceScore: 0 };
  }

  const wordCount = words.length;
  const wpm = (wordCount / duration) * 60;

  // Viral short-form content retention peaks between 145 and 195 WPM.
  let densityScore = 0.5;
  if (wpm >= 145 && wpm <= 195) {
    densityScore = 0.95 + 0.05 * (1 - Math.abs(wpm - 170) / 25);
  } else if (wpm > 195 && wpm <= 230) {
    densityScore = 0.85;
  } else if (wpm >= 120 && wpm < 145) {
    densityScore = 0.75 + (wpm - 120) * 0.008;
  } else if (wpm < 120) {
    densityScore = Math.max(0.2, (wpm / 120) * 0.7);
  } else {
    // Excessive speed (>230 WPM) hurts comprehension
    densityScore = Math.max(0.3, 1.0 - (wpm - 230) * 0.01);
  }

  // Calculate dynamic cadence: variation between word durations and punchy micro-pauses
  const intervals: number[] = [];
  for (let i = 1; i < words.length; i++) {
    const gap = Math.max(0, words[i].start - words[i - 1].end);
    intervals.push(gap);
  }

  let cadenceScore = 0.5;
  if (intervals.length > 3) {
    // Punish sustained dead air (> 1.2s gaps)
    const deadAirCount = intervals.filter((gap) => gap > 1.2).length;
    // Reward natural micro-pauses (0.15s - 0.40s) between punchy phrases
    const microPauses = intervals.filter((gap) => gap >= 0.15 && gap <= 0.4).length;
    const microPauseRatio = microPauses / intervals.length;

    cadenceScore = Math.max(
      0.1,
      Math.min(1.0, 0.65 + microPauseRatio * 0.35 - deadAirCount * 0.15)
    );
  }

  return {
    wpm: Math.round(wpm),
    densityScore: Number(densityScore.toFixed(3)),
    cadenceScore: Number(cadenceScore.toFixed(3)),
  };
}

/**
 * Scores viral keyword presence normalized across word volume.
 */
export function scoreKeywordVirality(words: TimedWord[]): number {
  if (!words.length) return 0;

  let viralCount = 0;
  for (const w of words) {
    const clean = w.word.toLowerCase().replace(/[^\w]/g, "");
    if (VIRAL_KEYWORDS.has(clean)) {
      viralCount++;
    }
  }

  // Normalize: 5-8% viral keyword density achieves top score
  const density = viralCount / words.length;
  const score = Math.min(1.0, density * 12);
  return Number(score.toFixed(3));
}

/**
 * Generates a viral, clickable title based on the hook category and segment subject.
 */
export function generateViralTitle(
  hookType: HookCategory,
  sampleText: string,
  words: TimedWord[]
): string {
  const cleanFirstSentence = sampleText
    .split(/[.?!]/)[0]
    .trim()
    .replace(/^["'\s]+|["'\s]+$/g, "");

  // Find prominent viral keywords in this segment
  const prominentKeywords = words
    .map((w) => w.word.toLowerCase().replace(/[^\w]/g, ""))
    .filter((k) => VIRAL_KEYWORDS.has(k));

  const mainTopic = prominentKeywords[0]
    ? prominentKeywords[0].toUpperCase()
    : "THIS";

  if (hookType === "question") {
    if (cleanFirstSentence.length >= 10 && cleanFirstSentence.length <= 60) {
      return cleanFirstSentence.endsWith("?")
        ? cleanFirstSentence
        : `${cleanFirstSentence}?`;
    }
    return `Why 99% Of People Fail At ${mainTopic}`;
  }

  if (hookType === "controversial") {
    if (cleanFirstSentence.length >= 12 && cleanFirstSentence.length <= 55) {
      return cleanFirstSentence;
    }
    return `The Harsh Truth About ${mainTopic} Nobody Tells You`;
  }

  if (hookType === "emotional") {
    if (cleanFirstSentence.length >= 12 && cleanFirstSentence.length <= 55) {
      return cleanFirstSentence;
    }
    return `This Insane ${mainTopic} Discovery Changed Everything`;
  }

  // High density / insight
  if (cleanFirstSentence.length >= 12 && cleanFirstSentence.length <= 50) {
    return cleanFirstSentence;
  }
  return `The Secret ${mainTopic} Formula That Actually Works`;
}

/**
 * Calculates Intersection Over Union (IoU) / overlap between two time intervals.
 */
function intervalOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number }
): number {
  const overlapStart = Math.max(a.start, b.start);
  const overlapEnd = Math.min(a.end, b.end);
  if (overlapEnd <= overlapStart) return 0;
  const overlapDur = overlapEnd - overlapStart;
  const minDur = Math.min(a.end - a.start, b.end - b.start);
  return minDur > 0 ? overlapDur / minDur : 0;
}

/**
 * Analyzes long-form transcripts to extract the top viral hook segments (30-60s)
 * based on question openings, controversial statements, speech density, cadence,
 * and viral keyword scoring.
 *
 * Returns ranked clip intervals [start, end] with confidence scores and viral titles.
 */
export function extractViralHooks(
  input: TranscriptInput,
  options: ViralHookOptions = {}
): ViralHookSegment[] {
  const minDur = options.minDuration ?? 30;
  const maxDur = options.maxDuration ?? 60;
  const step = options.stepSeconds ?? 3;
  const topK = options.topK ?? 5;
  const minConfidence = options.minConfidence ?? 0.45;

  const timedWords = normalizeTranscript(input);
  if (timedWords.length < 5) {
    return [];
  }

  const totalStartTime = timedWords[0].start;
  const totalEndTime = timedWords[timedWords.length - 1].end;
  const totalDuration = totalEndTime - totalStartTime;

  // If transcript is shorter than minDuration, evaluate the whole available speech as 1 candidate
  if (totalDuration < minDur) {
    const hookEval = detectHookType(timedWords.slice(0, 15));
    const speech = calculateSpeechMetrics(timedWords, totalDuration);
    const kwScore = scoreKeywordVirality(timedWords);

    const confidence = Number(
      (
        hookEval.score * 0.4 +
        speech.densityScore * 0.25 +
        speech.cadenceScore * 0.15 +
        kwScore * 0.2
      ).toFixed(2)
    );

    const sampleText = timedWords.map((w) => w.word).join(" ");
    return [
      {
        id: `hook-clip-0`,
        start: totalStartTime,
        end: totalEndTime,
        duration: Number(totalDuration.toFixed(2)),
        title: generateViralTitle(hookEval.hookType, sampleText, timedWords),
        confidence: Math.max(0.5, Math.min(1.0, confidence)),
        hookType: hookEval.hookType,
        reason: hookEval.reason,
        metrics: {
          hookScore: hookEval.score,
          densityScore: speech.densityScore,
          cadenceScore: speech.cadenceScore,
          keywordScore: kwScore,
          wpm: speech.wpm,
          wordCount: timedWords.length,
        },
        sampleText: sampleText.slice(0, 160),
      },
    ];
  }

  const candidates: ViralHookSegment[] = [];

  // Window sweeps: test target viral durations (e.g. 30s, 45s, 60s)
  const targetWindowDurations = [minDur, Math.round((minDur + maxDur) / 2), maxDur];

  for (const windowDur of targetWindowDurations) {
    let windowStart = totalStartTime;

    while (windowStart + windowDur <= totalEndTime + 1) {
      const windowEnd = windowStart + windowDur;

      // Extract words inside this window
      const wordsInWindow = timedWords.filter(
        (w) => w.start >= windowStart - 0.2 && w.end <= windowEnd + 0.2
      );

      if (wordsInWindow.length >= 15) {
        // Evaluate the opening 6 seconds of this window
        const openingWords = wordsInWindow.filter(
          (w) => w.start <= windowStart + 6.5
        );
        const hookEval = detectHookType(openingWords);
        const speech = calculateSpeechMetrics(wordsInWindow, windowDur);
        const kwScore = scoreKeywordVirality(wordsInWindow);

        // Weighted confidence composite:
        // 40% hook opening strength + 25% speech density + 15% cadence + 20% viral keywords
        const compositeScore =
          hookEval.score * 0.4 +
          speech.densityScore * 0.25 +
          speech.cadenceScore * 0.15 +
          kwScore * 0.2;

        const confidence = Number(
          Math.max(0, Math.min(1.0, compositeScore)).toFixed(2)
        );

        if (confidence >= minConfidence) {
          const sampleText = wordsInWindow.map((w) => w.word).join(" ");
          const actualStart = wordsInWindow[0].start;
          const wordSpanEnd = wordsInWindow[wordsInWindow.length - 1].end;
          // Align clip interval: begin with first spoken word, and span target duration (at least minDur)
          const clipStart = Number(actualStart.toFixed(2));
          const clipEnd = Number(
            Math.min(totalEndTime, Math.max(actualStart + minDur, wordSpanEnd)).toFixed(2)
          );
          const clipDuration = Number((clipEnd - clipStart).toFixed(2));

          candidates.push({
            id: `hook-${Math.round(clipStart)}-${Math.round(clipEnd)}`,
            start: clipStart,
            end: clipEnd,
            duration: clipDuration,
            title: generateViralTitle(hookEval.hookType, sampleText, wordsInWindow),
            confidence,
            hookType: hookEval.hookType,
            reason: hookEval.reason,
            metrics: {
              hookScore: hookEval.score,
              densityScore: speech.densityScore,
              cadenceScore: speech.cadenceScore,
              keywordScore: kwScore,
              wpm: speech.wpm,
              wordCount: wordsInWindow.length,
            },
            sampleText: sampleText.slice(0, 160),
          });
        }
      }

      windowStart += step;
    }
  }

  // Sort candidates by confidence descending
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Non-overlapping Top-K suppression
  const selected: ViralHookSegment[] = [];
  for (const cand of candidates) {
    if (selected.length >= topK) break;

    // Check overlap with already selected segments
    const hasOverlap = selected.some(
      (sel) => intervalOverlap(sel, cand) > 0.45
    );

    if (!hasOverlap) {
      selected.push({
        ...cand,
        id: `viral-hook-${selected.length + 1}`,
      });
    }
  }

  // If strict non-overlap leaves us with nothing above threshold, return top candidate
  if (selected.length === 0 && candidates.length > 0) {
    selected.push({
      ...candidates[0],
      id: "viral-hook-1",
    });
  }

  return selected;
}
