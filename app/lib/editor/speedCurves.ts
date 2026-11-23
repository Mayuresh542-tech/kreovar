/**
 * CapCut Speed Curves & Bézier Velocity Profiles Engine
 * Authoritative implementation of docs/CAPCUT_EDITOR_SPECIFICATION.md Section 4
 *
 * Provides:
 * - Cubic Bézier velocity profile calculator (P0, P1, P2, P3)
 * - Standard CapCut presets ('Hero', 'Bullet', 'Montage', 'Jump Cut', 'Flash In', 'Flash Out')
 * - Piecewise Simpson's 3/8 numerical integration for time-remapping
 * - Audio Retiming: WSOLA vs Resampling pitch calculations
 * - Audio Decibels, Equal-Power Crossfades & Auto-Ducking Envelopes
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface SpeedCurvePresetConfig {
  id: string;
  name: string;
  label: string;
  p0: Point2D;
  p1: Point2D;
  p2: Point2D;
  p3: Point2D;
  description: string;
  motionCharacteristics: string;
  category: "dynamic" | "slow-mo" | "fast" | "constant";
}

/**
 * CapCut Standard Preset Curve Parameters from Specification Section 4.1:
 * - Hero: P0(0, 1.0), P1(0.2, 5.0), P2(0.5, 0.2), P3(1.0, 1.0)
 * - Bullet: P0(0, 1.0), P1(0.4, 0.1), P2(0.6, 0.1), P3(1.0, 1.0)
 * - Montage: P0(0, 0.5), P1(0.3, 3.5), P2(0.7, 0.3), P3(1.0, 2.0)
 * - Jump Cut: P0(0, 2.0), P1(0.4, 0.2), P2(0.6, 5.0), P3(1.0, 0.5)
 * - Flash In: P0(0, 5.0), P1(0.1, 3.0), P2(0.4, 1.0), P3(1.0, 1.0)
 * - Flash Out: P0(0, 1.0), P1(0.6, 1.0), P2(0.9, 3.0), P3(1.0, 5.0)
 */
export const SPEED_CURVE_PRESETS: Record<string, SpeedCurvePresetConfig> = {
  hero: {
    id: "hero",
    name: "Hero",
    label: "Hero",
    p0: { x: 0.0, y: 1.0 },
    p1: { x: 0.2, y: 5.0 },
    p2: { x: 0.5, y: 0.2 },
    p3: { x: 1.0, y: 1.0 },
    description: "Fast zoom-in → dramatic slow-mo → normal",
    motionCharacteristics: "High initial burst slowing down dramatically before recovering to normal tempo.",
    category: "dynamic",
  },
  bullet: {
    id: "bullet",
    name: "Bullet",
    label: "Bullet",
    p0: { x: 0.0, y: 1.0 },
    p1: { x: 0.4, y: 0.1 },
    p2: { x: 0.6, y: 0.1 },
    p3: { x: 1.0, y: 1.0 },
    description: "Fast → ultra slow-mo impact → snap out",
    motionCharacteristics: "Deep impact deceleration for cinematic bullet-time moments.",
    category: "slow-mo",
  },
  montage: {
    id: "montage",
    name: "Montage",
    label: "Montage",
    p0: { x: 0.0, y: 0.5 },
    p1: { x: 0.3, y: 3.5 },
    p2: { x: 0.7, y: 0.3 },
    p3: { x: 1.0, y: 2.0 },
    description: "Rhythmic acceleration and deceleration",
    motionCharacteristics: "Wave-like velocity undulations matched to musical rhythm and beat drops.",
    category: "dynamic",
  },
  jump_cut: {
    id: "jump_cut",
    name: "Jump Cut",
    label: "Jump Cut",
    p0: { x: 0.0, y: 2.0 },
    p1: { x: 0.4, y: 0.2 },
    p2: { x: 0.6, y: 5.0 },
    p3: { x: 1.0, y: 0.5 },
    description: "Staccato beats with high-velocity accents",
    motionCharacteristics: "Aggressive speed pulses with sudden micro-slows for punchy transitions.",
    category: "dynamic",
  },
  flash_in: {
    id: "flash_in",
    name: "Flash In",
    label: "Flash In",
    p0: { x: 0.0, y: 5.0 },
    p1: { x: 0.1, y: 3.0 },
    p2: { x: 0.4, y: 1.0 },
    p3: { x: 1.0, y: 1.0 },
    description: "Extreme velocity deceleration to normal speed",
    motionCharacteristics: "Starts at blinding 5x speed and settles into 1x speed.",
    category: "fast",
  },
  flash_out: {
    id: "flash_out",
    name: "Flash Out",
    label: "Flash Out",
    p0: { x: 0.0, y: 1.0 },
    p1: { x: 0.6, y: 1.0 },
    p2: { x: 0.9, y: 3.0 },
    p3: { x: 1.0, y: 5.0 },
    description: "Normal speed accelerating to extreme exit",
    motionCharacteristics: "Glides at normal tempo and surges into a 5x velocity whip cut out.",
    category: "fast",
  },
  standard: {
    id: "standard",
    name: "Standard",
    label: "Standard",
    p0: { x: 0.0, y: 1.0 },
    p1: { x: 0.333, y: 1.0 },
    p2: { x: 0.667, y: 1.0 },
    p3: { x: 1.0, y: 1.0 },
    description: "Constant 1.0x velocity",
    motionCharacteristics: "Linear playback without velocity modification.",
    category: "constant",
  },
};

/** Normalized alias dictionary for flexible lookups */
const PRESET_ALIASES: Record<string, string> = {
  hero: "hero",
  "hero curve": "hero",
  bullet: "bullet",
  "bullet curve": "bullet",
  montage: "montage",
  "montage curve": "montage",
  "jump cut": "jump_cut",
  jumpcut: "jump_cut",
  jump_cut: "jump_cut",
  "flash in": "flash_in",
  flashin: "flash_in",
  flash_in: "flash_in",
  "flash out": "flash_out",
  flashout: "flash_out",
  flash_out: "flash_out",
  standard: "standard",
  normal: "standard",
  constant: "standard",
  custom: "standard",
};

/**
 * Resolves a speed curve preset configuration by name or id (case-insensitive).
 */
export function getSpeedCurvePreset(nameOrId?: string): SpeedCurvePresetConfig {
  if (!nameOrId) return SPEED_CURVE_PRESETS.standard;
  const key = nameOrId.trim().toLowerCase();
  const canonicalId = PRESET_ALIASES[key] || "standard";
  return SPEED_CURVE_PRESETS[canonicalId] || SPEED_CURVE_PRESETS.standard;
}

/**
 * Evaluates the 1D Cubic Bézier polynomial for parameter u in [0, 1]:
 * B(u) = (1-u)^3 * c0 + 3(1-u)^2 * u * c1 + 3(1-u) * u^2 * c2 + u^3 * c3
 */
export function evaluateBezier1D(u: number, c0: number, c1: number, c2: number, c3: number): number {
  const clampedU = Math.max(0, Math.min(1, u));
  const oneMinusU = 1 - clampedU;
  const oneMinusU2 = oneMinusU * oneMinusU;
  const oneMinusU3 = oneMinusU2 * oneMinusU;
  const u2 = clampedU * clampedU;
  const u3 = u2 * clampedU;

  return (
    oneMinusU3 * c0 +
    3 * oneMinusU2 * clampedU * c1 +
    3 * oneMinusU * u2 * c2 +
    u3 * c3
  );
}

/**
 * Computes the derivative of 1D Cubic Bézier with respect to parameter u:
 * B'(u) = 3(1-u)^2 * (c1 - c0) + 6(1-u) * u * (c2 - c1) + 3u^2 * (c3 - c2)
 */
export function evaluateBezierDerivative1D(
  u: number,
  c0: number,
  c1: number,
  c2: number,
  c3: number
): number {
  const clampedU = Math.max(0, Math.min(1, u));
  const oneMinusU = 1 - clampedU;
  const oneMinusU2 = oneMinusU * oneMinusU;
  const u2 = clampedU * clampedU;

  return (
    3 * oneMinusU2 * (c1 - c0) +
    6 * oneMinusU * clampedU * (c2 - c1) +
    3 * u2 * (c3 - c2)
  );
}

/**
 * Solves for parameter u in [0, 1] such that X(u) = x using Newton-Raphson iteration
 * with bisection fallback for monotonic convergence.
 */
export function solveBezierU(
  x: number,
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  epsilon = 1e-6
): number {
  const targetX = Math.max(0, Math.min(1, x));
  if (targetX <= 0) return 0;
  if (targetX >= 1) return 1;

  // Initial estimate
  let u = targetX;
  let lowerBound = 0;
  let upperBound = 1;

  // Newton-Raphson with bounds
  for (let i = 0; i < 16; i++) {
    const currentX = evaluateBezier1D(u, p0.x, p1.x, p2.x, p3.x);
    const diff = currentX - targetX;

    if (Math.abs(diff) < epsilon) {
      return u;
    }

    if (diff > 0) {
      upperBound = u;
    } else {
      lowerBound = u;
    }

    const slope = evaluateBezierDerivative1D(u, p0.x, p1.x, p2.x, p3.x);

    // If slope is sufficiently steep, take Newton-Raphson step
    if (Math.abs(slope) > 1e-5) {
      const nextU = u - diff / slope;
      if (nextU > lowerBound && nextU < upperBound) {
        u = nextU;
        continue;
      }
    }

    // Bisection fallback
    u = (lowerBound + upperBound) * 0.5;
  }

  return u;
}

/**
 * Evaluates instantaneous velocity v(x) at normalized timeline progress x in [0, 1]
 * for a given Cubic Bézier curve profile.
 */
export function evaluateVelocityAtNormalizedTime(
  x: number,
  curve: { p0: Point2D; p1: Point2D; p2: Point2D; p3: Point2D }
): number {
  const clampedX = Math.max(0, Math.min(1, x));
  const u = solveBezierU(clampedX, curve.p0, curve.p1, curve.p2, curve.p3);
  const velocity = evaluateBezier1D(u, curve.p0.y, curve.p1.y, curve.p2.y, curve.p3.y);
  // Velocity multiplier is non-negative and bounded to sensible range [0.01, 100.0]
  return Math.max(0.01, Math.min(100.0, velocity));
}

/**
 * Evaluates velocity v(t) at absolute clip-relative timeline time t in [0, duration].
 */
export function evaluateVelocityAtTime(
  t: number,
  duration: number,
  curve: { p0: Point2D; p1: Point2D; p2: Point2D; p3: Point2D }
): number {
  if (duration <= 0) return 1.0;
  const progress = Math.max(0, Math.min(1, t / duration));
  return evaluateVelocityAtNormalizedTime(progress, curve);
}

/**
 * Numerical Integration via Piecewise Simpson's 3/8 Rule
 *
 * Formal spec Section 4.2:
 * h = T / N
 * tau(t_k) ~= tau_0 + (3h / 8) * sum_{j=1}^{N/3} [ v(t_{3j-3}) + 3v(t_{3j-2}) + 3v(t_{3j-1}) + v(t_{3j}) ]
 *
 * @param vFunc Continuous velocity evaluator function v(t)
 * @param tStart Start of integration interval (seconds)
 * @param tEnd End of integration interval (seconds)
 * @param intervals Total sub-intervals N (must be a positive multiple of 3)
 */
export function integrateSimpson38(
  vFunc: (t: number) => number,
  tStart: number,
  tEnd: number,
  intervals = 48
): number {
  if (tEnd <= tStart) return 0;

  // Ensure N is a multiple of 3
  const n = Math.max(3, Math.round(intervals / 3) * 3);
  const h = (tEnd - tStart) / n;
  const threeEighthsH = (3 * h) / 8;

  let sum = 0;
  const groups = n / 3;

  for (let j = 1; j <= groups; j++) {
    const t0 = tStart + (3 * j - 3) * h;
    const t1 = tStart + (3 * j - 2) * h;
    const t2 = tStart + (3 * j - 1) * h;
    const t3 = tStart + (3 * j) * h;

    const v0 = vFunc(t0);
    const v1 = vFunc(t1);
    const v2 = vFunc(t2);
    const v3 = vFunc(t3);

    sum += v0 + 3 * v1 + 3 * v2 + v3;
  }

  return threeEighthsH * sum;
}

/**
 * Maps project timeline time to source media time via velocity curve integration:
 * tau(t) = tau_0 + integral_0^t v(sigma) d(sigma)
 */
export function mapTimelineTimeToSourceTime(options: {
  timelineTime: number;
  clipStartTime?: number;
  sourceStartTime?: number;
  duration: number;
  curve: { p0: Point2D; p1: Point2D; p2: Point2D; p3: Point2D };
  steps?: number;
}): number {
  const {
    timelineTime,
    clipStartTime = 0,
    sourceStartTime = 0,
    duration,
    curve,
    steps = 48,
  } = options;

  if (duration <= 0) return sourceStartTime;

  // Local time offset within clip
  const localT = Math.max(0, Math.min(duration, timelineTime - clipStartTime));
  if (localT <= 0) return sourceStartTime;

  const integral = integrateSimpson38(
    (t) => evaluateVelocityAtTime(t, duration, curve),
    0,
    localT,
    steps
  );

  return sourceStartTime + integral;
}

/**
 * Determines frame-accurate source media frame index:
 * F_source(t) = floor(tau(t) * FPS_source)
 */
export function getSourceFrameNumber(options: {
  timelineTime: number;
  clipStartTime?: number;
  sourceStartTime?: number;
  duration: number;
  curve: { p0: Point2D; p1: Point2D; p2: Point2D; p3: Point2D };
  sourceFps?: number;
}): number {
  const sourceFps = options.sourceFps || 30;
  const tau = mapTimelineTimeToSourceTime(options);
  return Math.floor(tau * sourceFps);
}

/**
 * Computes average speed factor across the entire curve:
 * v_avg = (1 / duration) * integral_0^duration v(t) dt
 */
export function calculateAverageSpeed(
  curve: { p0: Point2D; p1: Point2D; p2: Point2D; p3: Point2D },
  duration = 1.0
): number {
  if (duration <= 0) return 1.0;
  const totalIntegral = integrateSimpson38(
    (t) => evaluateVelocityAtTime(t, duration, curve),
    0,
    duration,
    48
  );
  return totalIntegral / duration;
}

/**
 * Inverts the time mapping: given an elapsed source media duration (e.g. 5 seconds of source footage),
 * calculates what the timeline clip duration will be under this speed curve.
 */
export function calculateTimelineDurationFromSource(
  sourceDuration: number,
  curve: { p0: Point2D; p1: Point2D; p2: Point2D; p3: Point2D }
): number {
  if (sourceDuration <= 0) return 0;
  const avgSpeed = calculateAverageSpeed(curve, 1.0);
  return sourceDuration / Math.max(0.01, avgSpeed);
}

/**
 * Solves inverse mapping: given a target source media time, finds the exact timeline time
 * within the clip via bisection search.
 */
export function mapSourceTimeToTimelineTime(options: {
  targetSourceTime: number;
  sourceStartTime: number;
  duration: number;
  curve: { p0: Point2D; p1: Point2D; p2: Point2D; p3: Point2D };
  toleranceSec?: number;
}): number {
  const {
    targetSourceTime,
    sourceStartTime,
    duration,
    curve,
    toleranceSec = 1e-4,
  } = options;

  if (targetSourceTime <= sourceStartTime) return 0;

  let low = 0;
  let high = duration;
  let result = duration * 0.5;

  for (let i = 0; i < 24; i++) {
    result = (low + high) * 0.5;
    const currentSrc = mapTimelineTimeToSourceTime({
      timelineTime: result,
      clipStartTime: 0,
      sourceStartTime,
      duration,
      curve,
      steps: 24,
    });

    const diff = currentSrc - targetSourceTime;
    if (Math.abs(diff) < toleranceSec) {
      return result;
    }

    if (diff > 0) {
      high = result;
    } else {
      low = result;
    }
  }

  return result;
}

/**
 * Generates N discrete SVG path coordinates representing the speed curve
 * for rendering visual waveform/curve diagrams in the inspector UI.
 */
export function generateSpeedCurveSvgPoints(
  curve: { p0: Point2D; p1: Point2D; p2: Point2D; p3: Point2D },
  width = 120,
  height = 40,
  samples = 32
): string {
  const points: string[] = [];
  // Find maximum velocity across samples to scale Y appropriately
  let maxV = 1.0;
  const vSamples: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const x = i / samples;
    const v = evaluateVelocityAtNormalizedTime(x, curve);
    vSamples.push(v);
    if (v > maxV) maxV = v;
  }

  // Add 15% headroom
  const scaleY = maxV * 1.15;

  for (let i = 0; i <= samples; i++) {
    const xPx = (i / samples) * width;
    const yPx = height - (vSamples[i] / scaleY) * height;
    points.push(`${xPx.toFixed(1)},${yPx.toFixed(1)}`);
  }

  return points.join(" ");
}

/* ========================================================================= */
/* AUDIO RETIMING, WSOLA & EQUAL-POWER DECIBEL CALCULATIONS (SECTIONS 4.3/4.4) */
/* ========================================================================= */

/**
 * Calculates audio pitch shift in cents when Pitch Lock is OFF (varispeed / tape-stop):
 * Pitch Shift (cents) = 1200 * log2(v(t))
 */
export function calculateVarispeedPitchShiftCents(velocity: number): number {
  if (velocity <= 0) return -12000;
  return 1200 * Math.log2(velocity);
}

/**
 * Computes WSOLA synthesis hop size S_s = round(alpha * S_a)
 * where S_a is analysis hop size (default 512) and alpha is speed factor.
 */
export function calculateWsolaSynthesisHop(speedFactor: number, analysisHop = 512): number {
  return Math.max(1, Math.round(speedFactor * analysisHop));
}

/**
 * Converts linear gain (0.0 to 2.0+) to Decibels (dB):
 * dB = 20 * log10(max(gain, 1e-4))
 */
export function linearGainToDecibels(gain: number): number {
  if (gain <= 1e-4) return -80.0;
  return 20 * Math.log10(gain);
}

/**
 * Converts Decibels (dB) to linear amplitude gain:
 * Gain_linear(dB) = 10^(dB / 20)
 */
export function decibelsToLinearGain(dB: number): number {
  if (dB <= -80.0) return 0;
  return Math.pow(10, dB / 20);
}

/**
 * Formats a decibel value into standard engineering readout string:
 * e.g. "0 dB", "-6.0 dB", "+3.5 dB", "-inf dB"
 */
export function formatDecibels(dB: number): string {
  if (dB <= -79.5 || !Number.isFinite(dB)) return "-∞ dB";
  const rounded = Math.round(dB * 10) / 10;
  if (Math.abs(rounded) < 0.05) return "0.0 dB";
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(1)} dB`;
}

/**
 * Formats a linear gain factor (0..1.5) into decibel string:
 * 1.0 -> "0.0 dB", 0.5 -> "-6.0 dB", 1.5 -> "+3.5 dB", 0 -> "-∞ dB"
 */
export function formatGainAsDecibels(gain: number): string {
  if (gain <= 0.001) return "-∞ dB";
  const dB = linearGainToDecibels(gain);
  return formatDecibels(dB);
}

/**
 * Equal-Power Audio Crossfade
 * Formal spec Section 4.4 B:
 * Gain_A(x) = cos(pi/2 * x)
 * Gain_B(x) = sin(pi/2 * x)
 * Power_total = Gain_A^2 + Gain_B^2 = 1.0 (constant power, no 3dB dip)
 *
 * @param progress Normalized crossfade transition progress in [0, 1]
 */
export function equalPowerCrossfade(progress: number): { gainA: number; gainB: number } {
  const x = Math.max(0, Math.min(1, progress));
  const angle = (Math.PI / 2) * x;
  return {
    gainA: Math.cos(angle),
    gainB: Math.sin(angle),
  };
}

/**
 * Smooth Auto-Ducking Envelope Calculator
 * Formal spec Section 4.4 C:
 * Uses smooth sin^2 envelope during attack and release phases:
 * - Attack Phase: 1.0 - (1 - G_duck) * sin^2((pi/2) * (t - (t_start - tau_att)) / tau_att)
 * - Hold Phase: G_duck
 * - Release Phase: G_duck + (1 - G_duck) * sin^2((pi/2) * (t - t_end) / tau_rel)
 */
export function calculateAutoDuckingEnvelopeGain(
  currentTime: number,
  speechIntervals: Array<{ start: number; end: number }>,
  duckingGain = 0.2, // -14 dB
  attackSec = 0.12,  // 120ms
  releaseSec = 0.35  // 350ms
): number {
  if (!speechIntervals.length) return 1.0;

  for (const interval of speechIntervals) {
    const speechStart = interval.start;
    const speechEnd = interval.end;

    // 1. Before attack
    if (currentTime < speechStart - attackSec) {
      continue;
    }

    // 2. Attack phase: smoothly ramp down
    if (currentTime >= speechStart - attackSec && currentTime < speechStart) {
      const progress = (currentTime - (speechStart - attackSec)) / attackSec;
      const factor = Math.sin((Math.PI / 2) * progress);
      const gain = 1.0 - (1.0 - duckingGain) * (factor * factor);
      return gain;
    }

    // 3. Hold phase: during speech
    if (currentTime >= speechStart && currentTime <= speechEnd) {
      return duckingGain;
    }

    // 4. Release phase: smoothly ramp back up
    if (currentTime > speechEnd && currentTime <= speechEnd + releaseSec) {
      const progress = (currentTime - speechEnd) / releaseSec;
      const factor = Math.sin((Math.PI / 2) * progress);
      const gain = duckingGain + (1.0 - duckingGain) * (factor * factor);
      return gain;
    }
  }

  return 1.0;
}
