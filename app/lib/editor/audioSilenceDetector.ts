/**
 * Audio Silence Detector & Acoustic Analysis Primitives
 * Supports Mode A (Acoustic PCM/RMS waveform analysis) and
 * Mode B (Transcript speech timestamp gap & filler word analysis).
 */

export interface SilenceDetectorOptions {
  /** Silence threshold in dBFS (default: -38 dB, range: -50 to -20 dB) */
  thresholdDb?: number;
  /** Minimum silence duration in seconds to qualify as a cut (default: 0.40s, range: 0.20s to 2.0s) */
  minSilenceDuration?: number;
  /** Padding before spoken words in seconds to preserve consonant attacks (default: 0.060s / 60ms) */
  paddingBefore?: number;
  /** Padding after spoken words in seconds to preserve word tails/release (default: 0.080s / 80ms) */
  paddingAfter?: number;
  /** Minimum remaining silence gap in seconds after breath padding to justify a cut (default: 0.15s) */
  minKeptGap?: number;
  /** Whether to flag and remove isolated filler tokens (default: false) */
  removeFillerWords?: boolean;
  /** Filler word tokens to identify (default: umm, uh, aa, hmm, matlab, etc.) */
  fillerWords?: string[];
}

export interface DetectedSilenceRange {
  start: number;
  end: number;
  duration: number;
  mode: 'acoustic' | 'transcript' | 'filler';
  dBFS?: number;
  confidence?: number;
}

export interface SilenceDetectionResult {
  silentRanges: DetectedSilenceRange[];
  totalSilenceDuration: number;
  originalDuration: number;
  speechDuration: number;
  projectedDuration: number;
  cutCount: number;
  summary: string;
}

export const DEFAULT_SILENCE_OPTIONS: Required<SilenceDetectorOptions> = {
  thresholdDb: -38,
  minSilenceDuration: 0.40,
  paddingBefore: 0.060,
  paddingAfter: 0.080,
  minKeptGap: 0.15,
  removeFillerWords: false,
  fillerWords: ['umm', 'uh', 'aa', 'hmm', 'matlab', 'um', 'er', 'ah', 'uhm', 'haan']
};

/**
 * Computes Root Mean Square (RMS) in dBFS for a buffer of audio samples.
 * 0 dBFS represents full scale sinusoidal peak.
 */
export function computeRmsDbfs(samples: Float32Array | number[]): number {
  if (!samples.length) return -100;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    sumSq += s * s;
  }
  const rms = Math.sqrt(sumSq / samples.length);
  if (rms <= 1e-7) return -100;
  return 20 * Math.log10(rms);
}

/**
 * Mode A: Acoustic PCM/RMS Waveform Analysis
 * Analyzes audio sample buffers using 20ms sliding windows, computing RMS dBFS.
 * Identifies silent ranges where dBFS < thresholdDb lasting >= minSilenceDuration,
 * and applies breath padding (paddingBefore & paddingAfter) and minKeptGap merging.
 */
export function detectSilencesAcoustic(
  pcmData: Float32Array | Float32Array[] | number[],
  sampleRate: number,
  options: SilenceDetectorOptions = {}
): DetectedSilenceRange[] {
  if (!pcmData || sampleRate <= 0) return [];

  const opts: Required<SilenceDetectorOptions> = { ...DEFAULT_SILENCE_OPTIONS, ...options };
  const threshold = Math.min(-20, Math.max(-50, opts.thresholdDb));
  const minDuration = Math.max(0.10, opts.minSilenceDuration);
  const padBefore = Math.max(0, opts.paddingBefore);
  const padAfter = Math.max(0, opts.paddingAfter);
  const minGap = Math.max(0.05, opts.minKeptGap);

  // Normalize multi-channel or single-channel data
  let samples: Float32Array | number[];
  if (Array.isArray(pcmData) && pcmData.length > 0 && pcmData[0] instanceof Float32Array) {
    const channels = pcmData as Float32Array[];
    const len = channels[0].length;
    const mixed = new Float32Array(len);
    const numChannels = channels.length;
    for (let i = 0; i < len; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        sum += channels[ch][i];
      }
      mixed[i] = sum / numChannels;
    }
    samples = mixed;
  } else {
    samples = pcmData as Float32Array | number[];
  }

  const totalSamples = samples.length;
  if (!totalSamples) return [];

  // 20ms sliding window
  const windowSamples = Math.max(1, Math.round(sampleRate * 0.020));
  const hopSamples = Math.max(1, Math.round(sampleRate * 0.010)); // 10ms hop for precise timing

  const numWindows = Math.floor((totalSamples - windowSamples) / hopSamples) + 1;
  if (numWindows <= 0) return [];

  const isSilentWindow = new Uint8Array(numWindows);
  const windowDbfs = new Float32Array(numWindows);

  // Compute RMS dBFS per window
  for (let w = 0; w < numWindows; w++) {
    const startIdx = w * hopSamples;
    let sumSq = 0;
    for (let i = 0; i < windowSamples; i++) {
      const s = samples[startIdx + i];
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / windowSamples);
    const dbfs = rms <= 1e-7 ? -100 : 20 * Math.log10(rms);
    windowDbfs[w] = dbfs;
    if (dbfs < threshold) {
      isSilentWindow[w] = 1;
    }
  }

  // Group contiguous silent windows into candidate silence intervals
  const rawIntervals: Array<{ start: number; end: number; avgDbfs: number }> = [];
  let inSilence = false;
  let silenceStartWin = 0;

  for (let w = 0; w < numWindows; w++) {
    if (isSilentWindow[w] === 1) {
      if (!inSilence) {
        inSilence = true;
        silenceStartWin = w;
      }
    } else {
      if (inSilence) {
        inSilence = false;
        const startSec = (silenceStartWin * hopSamples) / sampleRate;
        const endSec = ((w - 1) * hopSamples + windowSamples) / sampleRate;
        const dur = endSec - startSec;
        if (dur >= minDuration) {
          let sumDb = 0;
          for (let k = silenceStartWin; k < w; k++) sumDb += windowDbfs[k];
          rawIntervals.push({
            start: startSec,
            end: endSec,
            avgDbfs: sumDb / (w - silenceStartWin)
          });
        }
      }
    }
  }

  // Handle trailing silence window
  if (inSilence) {
    const startSec = (silenceStartWin * hopSamples) / sampleRate;
    const endSec = totalSamples / sampleRate;
    const dur = endSec - startSec;
    if (dur >= minDuration) {
      let sumDb = 0;
      for (let k = silenceStartWin; k < numWindows; k++) sumDb += windowDbfs[k];
      rawIntervals.push({
        start: startSec,
        end: endSec,
        avgDbfs: sumDb / (numWindows - silenceStartWin)
      });
    }
  }

  // Apply natural breath padding and merge logic:
  // - Speech before silence ends at interval.start; protect word tail with padAfter
  // - Speech after silence starts at interval.end; protect attack with padBefore
  // Cut range: [interval.start + padAfter, interval.end - padBefore]
  const paddedCuts: DetectedSilenceRange[] = [];
  for (const interval of rawIntervals) {
    const isAtStart = interval.start < 0.05;
    const isAtEnd = (totalSamples / sampleRate) - interval.end < 0.05;

    const cutStart = isAtStart ? 0 : interval.start + padAfter;
    const cutEnd = isAtEnd ? (totalSamples / sampleRate) : interval.end - padBefore;
    const cutDur = cutEnd - cutStart;

    // Merge adjacent kept intervals if silence gap after padding is < minKeptGap (default 0.15s)
    if (cutDur >= minGap && cutEnd > cutStart) {
      paddedCuts.push({
        start: Math.round(cutStart * 1000) / 1000,
        end: Math.round(cutEnd * 1000) / 1000,
        duration: Math.round(cutDur * 1000) / 1000,
        mode: 'acoustic',
        dBFS: Math.round(interval.avgDbfs * 10) / 10,
        confidence: 0.95
      });
    }
  }

  return mergeOverlappingRanges(paddedCuts);
}

/**
 * Mode B: Transcript & Filler-Word Gap Analysis
 * Detects inter-word speech timestamp gaps >= minSilenceDuration,
 * and optionally flags filler tokens ("umm", "uh", "aa", "hmm", "matlab") when isolated.
 * Applies breath padding (paddingBefore & paddingAfter).
 */
export function detectSilencesTranscript(
  words: Array<{ word: string; start: number; end: number }>,
  totalDuration: number,
  options: SilenceDetectorOptions = {}
): DetectedSilenceRange[] {
  if (!words || !words.length) {
    if (totalDuration > 0 && totalDuration >= (options.minSilenceDuration ?? DEFAULT_SILENCE_OPTIONS.minSilenceDuration)) {
      return [{
        start: 0,
        end: totalDuration,
        duration: totalDuration,
        mode: 'transcript',
        confidence: 0.9
      }];
    }
    return [];
  }

  const opts: Required<SilenceDetectorOptions> = { ...DEFAULT_SILENCE_OPTIONS, ...options };
  const minDuration = Math.max(0.10, opts.minSilenceDuration);
  const padBefore = Math.max(0, opts.paddingBefore);
  const padAfter = Math.max(0, opts.paddingAfter);
  const minGap = Math.max(0.05, opts.minKeptGap);

  // Clean and sort words by start timestamp
  const sortedWords = words
    .filter(w => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start && w.word?.trim())
    .map(w => ({
      word: w.word.trim(),
      start: Math.max(0, w.start),
      end: Math.max(0, w.end)
    }))
    .sort((a, b) => a.start - b.start);

  if (!sortedWords.length) return [];

  const rawRanges: DetectedSilenceRange[] = [];
  const fillerSet = new Set(opts.fillerWords.map(f => f.toLowerCase().trim()));

  // 1. Lead-in silence before the first word
  const firstWord = sortedWords[0];
  if (firstWord.start >= minDuration) {
    const cutStart = 0;
    const cutEnd = Math.max(0, firstWord.start - padBefore);
    if (cutEnd - cutStart >= minGap) {
      rawRanges.push({
        start: Math.round(cutStart * 1000) / 1000,
        end: Math.round(cutEnd * 1000) / 1000,
        duration: Math.round((cutEnd - cutStart) * 1000) / 1000,
        mode: 'transcript',
        confidence: 0.92
      });
    }
  }

  // 2. Inter-word gaps and optional filler word extraction
  for (let i = 0; i < sortedWords.length; i++) {
    const current = sortedWords[i];

    // Optional filler word flagging
    if (opts.removeFillerWords) {
      const cleanToken = current.word.toLowerCase().replace(/[^a-z]/g, '');
      if (cleanToken && fillerSet.has(cleanToken)) {
        const prevEnd = i > 0 ? sortedWords[i - 1].end : 0;
        const nextStart = i < sortedWords.length - 1 ? sortedWords[i + 1].start : totalDuration;
        const gapBefore = current.start - prevEnd;
        const gapAfter = nextStart - current.end;

        // An isolated filler word has surrounding breath space (>= 0.15s on either side or short token)
        if (gapBefore >= 0.15 || gapAfter >= 0.15 || (current.end - current.start) <= 0.45) {
          const cutStart = Math.max(0, prevEnd + (gapBefore >= 0.15 ? padAfter : 0));
          const cutEnd = Math.min(totalDuration, nextStart - (gapAfter >= 0.15 ? padBefore : 0));
          if (cutEnd - cutStart >= minGap) {
            rawRanges.push({
              start: Math.round(cutStart * 1000) / 1000,
              end: Math.round(cutEnd * 1000) / 1000,
              duration: Math.round((cutEnd - cutStart) * 1000) / 1000,
              mode: 'filler',
              confidence: 0.88
            });
            continue;
          }
        }
      }
    }

    // Inter-word silence gap
    if (i < sortedWords.length - 1) {
      const nextWord = sortedWords[i + 1];
      const gap = nextWord.start - current.end;
      if (gap >= minDuration) {
        const cutStart = current.end + padAfter;
        const cutEnd = nextWord.start - padBefore;
        const cutDur = cutEnd - cutStart;
        if (cutDur >= minGap && cutEnd > cutStart) {
          rawRanges.push({
            start: Math.round(cutStart * 1000) / 1000,
            end: Math.round(cutEnd * 1000) / 1000,
            duration: Math.round(cutDur * 1000) / 1000,
            mode: 'transcript',
            confidence: 0.95
          });
        }
      }
    }
  }

  // 3. Lead-out silence after the last word
  const lastWord = sortedWords[sortedWords.length - 1];
  if (totalDuration > lastWord.end && (totalDuration - lastWord.end) >= minDuration) {
    const cutStart = lastWord.end + padAfter;
    const cutEnd = totalDuration;
    if (cutEnd - cutStart >= minGap) {
      rawRanges.push({
        start: Math.round(cutStart * 1000) / 1000,
        end: Math.round(cutEnd * 1000) / 1000,
        duration: Math.round((cutEnd - cutStart) * 1000) / 1000,
        mode: 'transcript',
        confidence: 0.92
      });
    }
  }

  return mergeOverlappingRanges(rawRanges);
}

/**
 * Merges adjacent or overlapping silence cut ranges.
 */
export function mergeOverlappingRanges(ranges: DetectedSilenceRange[]): DetectedSilenceRange[] {
  if (!ranges || ranges.length <= 1) return ranges || [];

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: DetectedSilenceRange[] = [];

  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end + 0.05) {
      last.end = Math.max(last.end, r.end);
      last.duration = Math.round((last.end - last.start) * 1000) / 1000;
      if (r.dBFS !== undefined && last.dBFS !== undefined) {
        last.dBFS = Math.round(((last.dBFS + r.dBFS) / 2) * 10) / 10;
      }
    } else {
      merged.push({ ...r });
    }
  }

  return merged;
}

/**
 * Dual-Mode Silence Detector Entry Point
 * Orchestrates Mode A (Acoustic Waveform) and Mode B (Transcript Words),
 * providing cross-validation and fallback when one signal is absent.
 */
export function detectSilences(
  input: {
    pcmData?: Float32Array | Float32Array[] | number[];
    sampleRate?: number;
    words?: Array<{ word: string; start: number; end: number }>;
    waveform?: number[];
    duration?: number;
  },
  options: SilenceDetectorOptions = {}
): SilenceDetectionResult {
  const opts: Required<SilenceDetectorOptions> = { ...DEFAULT_SILENCE_OPTIONS, ...options };
  const originalDuration = Math.max(0, input.duration || 0);

  let detected: DetectedSilenceRange[] = [];

  // Mode A: Run acoustic analysis if PCM data and sample rate are provided
  if (input.pcmData && input.sampleRate && input.sampleRate > 0) {
    const acoustic = detectSilencesAcoustic(input.pcmData, input.sampleRate, opts);
    detected = acoustic;
  }

  // Mode B: Run transcript analysis if speech words are available
  if (input.words && input.words.length > 0) {
    const transcript = detectSilencesTranscript(input.words, originalDuration, opts);
    if (!detected.length) {
      detected = transcript;
    } else {
      // Cross-validation: merge acoustic and transcript silences, but ensure no spoken word is clipped
      detected = crossValidateSilences(detected, input.words, originalDuration, opts);
    }
  } else if (!detected.length && input.waveform && input.waveform.length > 0 && originalDuration > 0) {
    // Fallback: estimate silences from pre-computed waveform peak array
    detected = detectSilencesFromWaveformPeaks(input.waveform, originalDuration, opts);
  }

  const merged = mergeOverlappingRanges(detected);
  const totalSilenceDuration = Math.round(merged.reduce((sum, r) => sum + r.duration, 0) * 100) / 100;
  const projectedDuration = Math.max(0, Math.round((originalDuration - totalSilenceDuration) * 100) / 100);
  const speechDuration = Math.max(0, Math.round((originalDuration - totalSilenceDuration) * 100) / 100);

  const summary = merged.length > 0
    ? `Detected ${merged.length} pause(s) totaling ${totalSilenceDuration.toFixed(2)}s of silence (cut to ${projectedDuration.toFixed(2)}s)`
    : `No silent gaps > ${(opts.minSilenceDuration).toFixed(2)}s detected; kept original clip timing intact`;

  return {
    silentRanges: merged,
    totalSilenceDuration,
    originalDuration,
    speechDuration,
    projectedDuration,
    cutCount: merged.length,
    summary
  };
}

/**
 * Cross-validates acoustic detected silences against transcript speech word boundaries.
 * Guarantees that spoken words from the transcript are never clipped by an acoustic cut.
 */
function crossValidateSilences(
  acousticCuts: DetectedSilenceRange[],
  words: Array<{ word: string; start: number; end: number }>,
  totalDuration: number,
  options: Required<SilenceDetectorOptions>
): DetectedSilenceRange[] {
  const padBefore = options.paddingBefore;
  const padAfter = options.paddingAfter;
  const minGap = options.minKeptGap;

  const refined: DetectedSilenceRange[] = [];

  for (const cut of acousticCuts) {
    let start = cut.start;
    let end = cut.end;

    // Check if any word starts or ends near or inside this cut
    for (const w of words) {
      // If a word ends right before this cut, ensure breath tail padding
      if (w.end <= start && start < w.end + padAfter) {
        start = w.end + padAfter;
      }
      // If a word starts right after this cut, ensure breath attack padding
      if (w.start >= end && end > w.start - padBefore) {
        end = w.start - padBefore;
      }
      // If a cut overlaps a spoken word interval, split or shrink the cut to protect the word
      if (start < w.end && end > w.start) {
        // If the cut encloses the word, do not remove the word
        if (start < w.start - padBefore && end > w.end + padAfter) {
          // Keep left slice if long enough
          if ((w.start - padBefore) - start >= minGap) {
            refined.push({
              ...cut,
              start: Math.round(start * 1000) / 1000,
              end: Math.round((w.start - padBefore) * 1000) / 1000,
              duration: Math.round(((w.start - padBefore) - start) * 1000) / 1000
            });
          }
          start = w.end + padAfter;
        } else if (end > w.start && start < w.start) {
          end = Math.max(start, w.start - padBefore);
        } else if (start < w.end && end > w.end) {
          start = Math.min(end, w.end + padAfter);
        } else {
          // Cut is entirely within a word: discard cut
          start = end;
        }
      }
    }

    if (end - start >= minGap && end <= totalDuration) {
      refined.push({
        ...cut,
        start: Math.round(start * 1000) / 1000,
        end: Math.round(end * 1000) / 1000,
        duration: Math.round((end - start) * 1000) / 1000
      });
    }
  }

  return refined;
}

/**
 * Fallback detector when only pre-extracted waveform peak values are available.
 */
function detectSilencesFromWaveformPeaks(
  peaks: number[],
  duration: number,
  options: Required<SilenceDetectorOptions>
): DetectedSilenceRange[] {
  if (!peaks.length || duration <= 0) return [];

  // Convert dBFS threshold to normalized linear peak threshold (0..1)
  // -38 dBFS = 10^(-38/20) ~= 0.0126
  const linearThreshold = Math.pow(10, options.thresholdDb / 20);
  const secPerPeak = duration / peaks.length;
  const minPeaks = Math.max(2, Math.round(options.minSilenceDuration / secPerPeak));

  const ranges: DetectedSilenceRange[] = [];
  let silentStreak = 0;
  let streakStart = 0;

  for (let i = 0; i < peaks.length; i++) {
    const val = peaks[i];
    if (val < linearThreshold) {
      if (silentStreak === 0) streakStart = i;
      silentStreak++;
    } else {
      if (silentStreak >= minPeaks) {
        const start = streakStart * secPerPeak + options.paddingAfter;
        const end = i * secPerPeak - options.paddingBefore;
        if (end - start >= options.minKeptGap) {
          ranges.push({
            start: Math.round(start * 1000) / 1000,
            end: Math.round(end * 1000) / 1000,
            duration: Math.round((end - start) * 1000) / 1000,
            mode: 'acoustic',
            confidence: 0.82
          });
        }
      }
      silentStreak = 0;
    }
  }

  if (silentStreak >= minPeaks) {
    const start = streakStart * secPerPeak + options.paddingAfter;
    const end = duration;
    if (end - start >= options.minKeptGap) {
      ranges.push({
        start: Math.round(start * 1000) / 1000,
        end: Math.round(end * 1000) / 1000,
        duration: Math.round((end - start) * 1000) / 1000,
        mode: 'acoustic',
        confidence: 0.82
      });
    }
  }

  return ranges;
}
