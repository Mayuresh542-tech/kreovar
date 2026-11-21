import {clamp,type Clip,type EditorProject} from './model';

export const KEN_BURNS_MOTIONS = ['ken-burns-push','ken-burns-pull','ken-burns-pan-left','ken-burns-pan-right'] as const;
export type KenBurnsMotion = typeof KEN_BURNS_MOTIONS[number];

export const MEDIA_MOTIONS = [
  'none','fade','slide-left','slide-right','slide-up','slide-down','zoom-in','zoom-out','pop','bounce',
  'rotate-left','rotate-right','flip-x','flip-y','blur','blur-rise',
  ...KEN_BURNS_MOTIONS
] as const;

export const MEDIA_LOOPS = ['none','float','pulse','sway','orbit'] as const;
export const MEDIA_EASINGS = ['linear','smooth','ease-out','overshoot'] as const;
export type MediaMotion = typeof MEDIA_MOTIONS[number];

export interface MediaAnimation {
  entrance: MediaMotion;
  exit: MediaMotion;
  loop: typeof MEDIA_LOOPS[number];
  entranceDuration: number;
  exitDuration: number;
  loopDuration: number;
  easing: typeof MEDIA_EASINGS[number];
  kenBurns?: KenBurnsMotion;
}

export const DEFAULT_MEDIA_ANIMATION: MediaAnimation = {
  entrance: 'fade',
  exit: 'fade',
  loop: 'none',
  entranceDuration: .5,
  exitDuration: .5,
  loopDuration: 2,
  easing: 'smooth'
};

export const MEDIA_MOTION_LABELS: Record<MediaMotion, string> = {
  none: 'None',
  fade: 'Fade',
  'slide-left': 'Slide left',
  'slide-right': 'Slide right',
  'slide-up': 'Slide up',
  'slide-down': 'Slide down',
  'zoom-in': 'Zoom in',
  'zoom-out': 'Zoom out',
  pop: 'Pop',
  bounce: 'Bounce',
  'rotate-left': 'Rotate left',
  'rotate-right': 'Rotate right',
  'flip-x': 'Flip horizontal',
  'flip-y': 'Flip vertical',
  blur: 'Blur',
  'blur-rise': 'Blur rise',
  'ken-burns-push': 'Ken Burns Push (1.00x → 1.08x)',
  'ken-burns-pull': 'Ken Burns Pull (1.08x → 1.00x)',
  'ken-burns-pan-left': 'Ken Burns Pan Left',
  'ken-burns-pan-right': 'Ken Burns Pan Right'
};

export function calculateKenBurnsPose(
  motion: KenBurnsMotion,
  progress: number,
  easing: MediaAnimation['easing'] = 'smooth'
): { x: number; y: number; scale: number } {
  const t = clamp(progress, 0, 1);
  const p = easing === 'linear' ? t : t * t * (3 - 2 * t);
  switch (motion) {
    case 'ken-burns-push':
      return { x: 0, y: 0, scale: 1.00 + 0.08 * p };
    case 'ken-burns-pull':
      return { x: 0, y: 0, scale: 1.08 - 0.08 * p };
    case 'ken-burns-pan-left':
      return { x: 0.025 - 0.05 * p, y: 0, scale: 1.05 };
    case 'ken-burns-pan-right':
      return { x: -0.025 + 0.05 * p, y: 0, scale: 1.05 };
    default:
      return { x: 0, y: 0, scale: 1 };
  }
}

export function readMediaAnimation(value: unknown): MediaAnimation {
  const raw = value as MediaAnimation;
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    !MEDIA_MOTIONS.includes(raw.entrance) ||
    !MEDIA_MOTIONS.includes(raw.exit) ||
    !MEDIA_LOOPS.includes(raw.loop) ||
    !MEDIA_EASINGS.includes(raw.easing) ||
    ![raw.entranceDuration, raw.exitDuration].every(n => Number.isFinite(n) && n >= .05 && n <= 3) ||
    !Number.isFinite(raw.loopDuration) ||
    raw.loopDuration < .5 ||
    raw.loopDuration > 6
  ) {
    throw Error('Choose supported animations and durations from 0.05–3 seconds (loop: 0.5–6 seconds).');
  }
  if (raw.kenBurns !== undefined && !KEN_BURNS_MOTIONS.includes(raw.kenBurns)) {
    throw Error('Choose a supported Ken Burns preset (push, pull, pan-left, pan-right).');
  }
  return {
    entrance: raw.entrance,
    exit: raw.exit,
    loop: raw.loop,
    entranceDuration: raw.entranceDuration,
    exitDuration: raw.exitDuration,
    loopDuration: raw.loopDuration,
    easing: raw.easing,
    ...(raw.kenBurns ? { kenBurns: raw.kenBurns } : {})
  };
}

function editable(p: EditorProject, id: string) {
  const c = p.clips[id];
  if (!c || !p.tracks[c.trackId] || p.tracks[c.trackId].locked || !c.assetId || !['video', 'image'].includes(p.assets[c.assetId]?.kind)) {
    throw Error('Select an unlocked video or image clip.');
  }
  return c;
}

export function setMediaAnimation(p: EditorProject, id: string, value: unknown): EditorProject {
  const c = editable(p, id), mediaAnimation = readMediaAnimation(value);
  if (mediaAnimation.entrance === 'none' && mediaAnimation.exit === 'none' && mediaAnimation.loop === 'none' && !mediaAnimation.kenBurns) {
    return clearMediaAnimation(p, id);
  }
  return { ...p, clips: { ...p.clips, [id]: { ...c, mediaAnimation } } };
}

export function clearMediaAnimation(p: EditorProject, id: string): EditorProject {
  const c = editable(p, id);
  if (!c.mediaAnimation) return p;
  const clean = { ...c };
  delete clean.mediaAnimation;
  return { ...p, clips: { ...p.clips, [id]: clean } };
}

export function mediaAnimationTiming(c: Pick<Clip, 'duration' | 'mediaAnimation'>) {
  const a = c.mediaAnimation,
    rawIn = a && a.entrance !== 'none' ? a.entranceDuration : 0,
    rawOut = a && a.exit !== 'none' ? a.exitDuration : 0,
    total = rawIn + rawOut,
    factor = total > c.duration * .8 ? (c.duration * .8) / total : 1;
  return { entrance: rawIn * factor, exit: rawOut * factor };
}

const identity = () => ({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, scaleX: 1, scaleY: 1, blur: 0 });
type Pose = ReturnType<typeof identity>;

function bounce(t: number) {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) { t -= 1.5 / d; return n * t * t + .75; }
  if (t < 2.5 / d) { t -= 2.25 / d; return n * t * t + .9375; }
  t -= 2.625 / d;
  return n * t * t + .984375;
}

function ease(t: number, kind: MediaAnimation['easing']) {
  if (t === 0 || t === 1) return t;
  if (kind === 'linear') return t;
  if (kind === 'ease-out') return 1 - Math.pow(1 - t, 3);
  if (kind === 'overshoot') { const q = t - 1; return 1 + 2.70158 * q * q * q + 1.70158 * q * q; }
  return t * t * (3 - 2 * t);
}

function edge(pose: Pose, motion: MediaMotion, progress: number, exiting: boolean, easing: MediaAnimation['easing']) {
  if (motion === 'none') return;
  const q = motion === 'bounce' ? (exiting ? 1 - bounce(1 - progress) : bounce(progress)) : ease(progress, motion === 'pop' ? 'overshoot' : easing);
  const amount = exiting ? q : 1 - q;
  pose.opacity *= 1 - clamp(amount, 0, 1);
  switch (motion) {
    case 'slide-left': pose.x -= 1.1 * amount; break;
    case 'slide-right': pose.x += 1.1 * amount; break;
    case 'slide-up': pose.y -= 1.1 * amount; break;
    case 'slide-down': pose.y += 1.1 * amount; break;
    case 'zoom-in': pose.scale *= 1 + (exiting ? .3 : -.3) * amount; break;
    case 'zoom-out': pose.scale *= 1 + (exiting ? -.3 : .3) * amount; break;
    case 'pop': pose.scale *= 1 - .6 * amount; break;
    case 'bounce': pose.y += .35 * amount; break;
    case 'rotate-left': pose.rotation -= 35 * amount; pose.scale *= 1 - .12 * amount; break;
    case 'rotate-right': pose.rotation += 35 * amount; pose.scale *= 1 - .12 * amount; break;
    case 'flip-x': pose.scaleX *= 1 - 1.85 * clamp(amount, 0, 1); break;
    case 'flip-y': pose.scaleY *= 1 - 1.85 * clamp(amount, 0, 1); break;
    case 'blur': pose.blur += 16 * Math.max(0, amount); break;
    case 'blur-rise': pose.blur += 16 * Math.max(0, amount); pose.y += .07 * amount; break;
    case 'ken-burns-push':
    case 'ken-burns-pull':
    case 'ken-burns-pan-left':
    case 'ken-burns-pan-right':
      break;
  }
}

/** An additional visual layer: existing keyframes, zooms, treatment and audio
 * remain intact. The same deterministic pose is used by preview and MP4 export.
 * Durations are timeline seconds; moved/trimmed/split clips retain their edge choices.
 */
export function mediaAnimationFrame(c: Pick<Clip, 'startTime' | 'duration' | 'mediaAnimation'>, time: number): Pose {
  const pose = identity(), a = c.mediaAnimation;
  if (!a || c.duration <= 0) return pose;

  const local = clamp(time - c.startTime, 0, c.duration), timing = mediaAnimationTiming(c);
  if (timing.entrance) edge(pose, a.entrance, clamp(local / timing.entrance, 0, 1), false, a.easing);
  if (timing.exit) edge(pose, a.exit, clamp((local - (c.duration - timing.exit)) / timing.exit, 0, 1), true, a.easing);

  // Ken Burns dynamic motion applies continuously across the full clip duration
  const kbMotion = a.kenBurns || (KEN_BURNS_MOTIONS.includes(a.entrance as KenBurnsMotion) ? (a.entrance as KenBurnsMotion) : undefined) || (c as { kenBurns?: KenBurnsMotion }).kenBurns;
  if (kbMotion && KEN_BURNS_MOTIONS.includes(kbMotion)) {
    const progress = clamp(local / c.duration, 0, 1);
    const kb = calculateKenBurnsPose(kbMotion, progress, a.easing);
    pose.x += kb.x;
    pose.y += kb.y;
    pose.scale *= kb.scale;
  }

  const hold = c.duration - timing.entrance - timing.exit;
  if (a.loop !== 'none' && hold > 1e-7 && local > timing.entrance && local < c.duration - timing.exit) {
    const elapsed = local - timing.entrance,
      phase = (elapsed / a.loopDuration) * Math.PI * 2,
      envelope = Math.pow(Math.sin((Math.PI * elapsed) / hold), 2);
    if (a.loop === 'float') pose.y -= Math.sin(phase) * .025 * envelope;
    if (a.loop === 'pulse') pose.scale *= 1 + (1 - Math.cos(phase)) * .035 * envelope;
    if (a.loop === 'sway') pose.rotation += Math.sin(phase) * 3 * envelope;
    if (a.loop === 'orbit') {
      pose.x += Math.cos(phase) * .025 * envelope;
      pose.y += Math.sin(phase) * .025 * envelope;
    }
  }
  return pose;
}
