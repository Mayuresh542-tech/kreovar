import { clamp, type Clip, type EditorProject, type AudioRole } from './model';

export function audioRole(p: EditorProject, c: Clip): AudioRole {
  return c.audioRole || (p.tracks[c.trackId]?.kind === 'video' ? 'speech' : 'background');
}

export interface DuckingConfig {
  /** Attenuation level in decibels (e.g. -16 dB, range -14 dB to -18 dB) */
  duckingDb: number;
  /** Attack ramp down time in seconds (e.g. 0.2s = 200ms) */
  attackSec: number;
  /** Release ramp back up time in seconds (e.g. 0.5s = 500ms) */
  releaseSec: number;
  /** Envelope ramp shape: 'smooth' (S-curve cosine), 'linear', or 'exponential' */
  curve: 'smooth' | 'linear' | 'exponential';
  /** Maximum gap between consecutive speech intervals to hold ducking without pumping (seconds) */
  holdGapSec: number;
}

export const DEFAULT_DUCKING_CONFIG: DuckingConfig = {
  duckingDb: -16, // -16 dB is right within the target -14 dB to -18 dB range (~0.1585 gain)
  attackSec: 0.2, // 200ms smooth attack ramp down
  releaseSec: 0.5, // 500ms smooth release ramp back up
  curve: 'smooth',
  holdGapSec: 0.3, // 300ms speech pause hold to prevent fluttering
};

/** Convert decibels to linear amplitude gain factor (0.0 to 1.0) */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** Convert linear amplitude gain factor to decibels */
export function gainToDb(gain: number): number {
  if (gain <= 1e-9) return -180;
  return 20 * Math.log10(gain);
}

export interface SpeechInterval {
  start: number;
  end: number;
}

/**
 * Extract active speech timing windows from project.
 * Uses visible caption word/segment timestamps when available, falling back to dialogue clip boundaries.
 */
export function getSpeechIntervals(project: EditorProject): SpeechInterval[] {
  const captions = Object.values(project.clips).filter(
    (c) => c.contentId && project.captions[c.contentId] && !project.tracks[c.trackId]?.hidden
  );
  const windows: SpeechInterval[] = [];

  for (const c of Object.values(project.clips)) {
    const track = project.tracks[c.trackId];
    const asset = c.assetId ? project.assets[c.assetId] : undefined;
    if (!asset || asset.kind === 'image' || track?.hidden || track?.muted || !c.volume || audioRole(project, c) !== 'speech') {
      continue;
    }
    const clipEnd = c.startTime + c.duration;
    const overlappingCaps = captions.filter(
      (cap) => cap.startTime < clipEnd && cap.startTime + cap.duration > c.startTime
    );

    if (overlappingCaps.length > 0) {
      for (const cap of overlappingCaps) {
        windows.push({
          start: Math.max(c.startTime, cap.startTime),
          end: Math.min(clipEnd, cap.startTime + cap.duration),
        });
      }
    } else {
      windows.push({ start: c.startTime, end: clipEnd });
    }
  }

  return mergeSpeechIntervals(windows.sort((a, b) => a.start - b.start));
}

/**
 * Merge overlapping or closely spaced speech intervals so background music doesn't chatter or pump.
 */
export function mergeSpeechIntervals(intervals: SpeechInterval[], maxGapSec = 0.3): SpeechInterval[] {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: SpeechInterval[] = [{ start: sorted[0].start, end: sorted[0].end }];

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    const last = merged[merged.length - 1];

    if (curr.start <= last.end + maxGapSec) {
      last.end = Math.max(last.end, curr.end);
    } else {
      merged.push({ start: curr.start, end: curr.end });
    }
  }

  return merged;
}

/**
 * Calculate the ducking envelope gain multiplier (between duckLevel and 1.0) at any timeline time.
 */
export function calculateDuckingGain(
  time: number,
  speechIntervals: SpeechInterval[],
  config: Partial<DuckingConfig> = {}
): number {
  if (!speechIntervals.length) return 1;

  const cfg: DuckingConfig = { ...DEFAULT_DUCKING_CONFIG, ...config };
  const duckGain = clamp(dbToGain(cfg.duckingDb), 0.001, 1.0);
  const attack = Math.max(0.01, cfg.attackSec);
  const release = Math.max(0.01, cfg.releaseSec);

  let minGain = 1.0;

  for (const interval of speechIntervals) {
    const attackStart = interval.start - attack;
    const releaseEnd = interval.end + release;

    if (time < attackStart || time > releaseEnd) {
      continue;
    }

    if (time >= interval.start && time <= interval.end) {
      return duckGain;
    }

    if (time >= attackStart && time < interval.start) {
      const p = clamp((time - attackStart) / attack, 0, 1);
      let g = 1.0;
      if (cfg.curve === 'linear') {
        g = 1.0 - (1.0 - duckGain) * p;
      } else if (cfg.curve === 'exponential') {
        g = Math.exp(Math.log(duckGain) * p);
      } else {
        // Smooth S-curve (cosine ease-in-out)
        g = duckGain + (1.0 - duckGain) * 0.5 * (1.0 + Math.cos(Math.PI * p));
      }
      minGain = Math.min(minGain, g);
    } else if (time > interval.end && time <= releaseEnd) {
      const p = clamp((time - interval.end) / release, 0, 1);
      let g = 1.0;
      if (cfg.curve === 'linear') {
        g = duckGain + (1.0 - duckGain) * p;
      } else if (cfg.curve === 'exponential') {
        g = duckGain * Math.exp(Math.log(1.0 / duckGain) * p);
      } else {
        // Smooth S-curve (cosine ease-in-out)
        g = duckGain + (1.0 - duckGain) * 0.5 * (1.0 - Math.cos(Math.PI * p));
      }
      minGain = Math.min(minGain, g);
    }
  }

  return clamp(minGain, duckGain, 1.0);
}

/**
 * Generate a sampled ducking envelope array across a duration, suitable for WebAudio AudioParam or canvas visualization.
 */
export function computeDuckingEnvelope(
  duration: number,
  speechIntervals: SpeechInterval[],
  sampleRate = 30,
  config: Partial<DuckingConfig> = {}
): Float32Array {
  const steps = Math.max(2, Math.round(duration * sampleRate));
  const envelope = new Float32Array(steps);
  const intervals = mergeSpeechIntervals(speechIntervals, config.holdGapSec ?? DEFAULT_DUCKING_CONFIG.holdGapSec);

  for (let i = 0; i < steps; i++) {
    const t = (i / (steps - 1)) * duration;
    envelope[i] = calculateDuckingGain(t, intervals, config);
  }

  return envelope;
}

/**
 * Smart clip gain incorporating clip volume, fades, and smooth envelope ducking.
 * Used for both real-time client playback preview and offline rendering.
 */
export function smartClipGain(
  project: EditorProject,
  clip: Clip,
  time: number,
  windows = getSpeechIntervals(project),
  config: Partial<DuckingConfig> = {}
): number {
  const track = project.tracks[clip.trackId];
  const local = time - clip.startTime;
  if (!track || track.hidden || track.muted || local < 0 || local > clip.duration) return 0;

  const fade = Math.min(
    clip.fadeIn ? clamp(local / clip.fadeIn, 0, 1) : 1,
    clip.fadeOut ? clamp((clip.duration - local) / clip.fadeOut, 0, 1) : 1
  );

  let duck = 1.0;
  if (project.settings.audioDucking && clip.ducking !== false && audioRole(project, clip) !== 'speech') {
    duck = calculateDuckingGain(time, windows, config);
  }

  return clip.volume * fade * duck;
}

/**
 * Build an FFmpeg volume filter expression that applies the ducking envelope during server export.
 * Returns null if no speech intervals intersect the clip or ducking is inactive.
 */
export function buildFfmpegDuckingFilter(
  clip: Clip,
  speechIntervals: SpeechInterval[],
  config: Partial<DuckingConfig> = {}
): string | null {
  const cfg: DuckingConfig = { ...DEFAULT_DUCKING_CONFIG, ...config };
  const duckGain = Number(clamp(dbToGain(cfg.duckingDb), 0.001, 1.0).toFixed(4));
  const attack = Math.max(0.01, cfg.attackSec);
  const release = Math.max(0.01, cfg.releaseSec);

  const clipStart = clip.startTime;
  const clipEnd = clip.startTime + clip.duration;

  // Filter and convert to local clip time t = timelineTime - clipStart
  const relevant: SpeechInterval[] = [];
  for (const interval of mergeSpeechIntervals(speechIntervals, cfg.holdGapSec)) {
    if (interval.start - attack < clipEnd && interval.end + release > clipStart) {
      relevant.push(interval);
    }
  }

  if (!relevant.length) return null;

  // Build piecewise if-else expression for each disjoint interval
  // Each interval has:
  // - attack: [a0, a1] where a0 = start - attack, a1 = start
  // - ducked: [a1, r0] where r0 = end
  // - release: [r0, r1] where r1 = end + release
  const pieces: string[] = [];

  for (const w of relevant) {
    const a0 = Number((w.start - attack - clipStart).toFixed(4));
    const a1 = Number((w.start - clipStart).toFixed(4));
    const r0 = Number((w.end - clipStart).toFixed(4));
    const r1 = Number((w.end + release - clipStart).toFixed(4));

    // Attack ramp
    if (cfg.curve === 'smooth') {
      pieces.push(`if(between(t,${a0},${a1}),${duckGain}+(1-${duckGain})*0.5*(1+cos(PI*(t-${a0})/${attack}))`);
    } else {
      pieces.push(`if(between(t,${a0},${a1}),1-(1-${duckGain})*(t-${a0})/${attack}`);
    }

    // Ducked plateau
    pieces.push(`if(between(t,${a1},${r0}),${duckGain}`);

    // Release ramp
    if (cfg.curve === 'smooth') {
      pieces.push(`if(between(t,${r0},${r1}),${duckGain}+(1-${duckGain})*0.5*(1-cos(PI*(t-${r0})/${release}))`);
    } else {
      pieces.push(`if(between(t,${r0},${r1}),${duckGain}+(1-${duckGain})*(t-${r0})/${release}`);
    }
  }

  // Nest the if() statements and close with default volume 1.0
  const expr = pieces.join(',') + ',1' + ')'.repeat(pieces.length);
  return `volume=eval=frame:volume='${expr}'`;
}
