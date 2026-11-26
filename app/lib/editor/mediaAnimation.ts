import { clamp, type Clip, type EditorProject } from './model';

export const KEN_BURNS_MOTIONS = [
  'ken-burns-push',
  'ken-burns-pull',
  'ken-burns-pan-left',
  'ken-burns-pan-right',
] as const;
export type KenBurnsMotion = (typeof KEN_BURNS_MOTIONS)[number];

export const MEDIA_MOTIONS = [
  'none',
  'fade',
  'slide-left',
  'slide-right',
  'slide-up',
  'slide-down',
  'zoom-in',
  'zoom-out',
  'pop',
  'bounce',
  'rotate-left',
  'rotate-right',
  'flip-x',
  'flip-y',
  'blur',
  'blur-rise',
  'rock-vertical',
  'rock-horizontal',
  'swing-top',
  'swing-bottom',
  'swing-left',
  'swing-right',
  'whip-in-left',
  'whip-in-right',
  'flash-in',
  'glitch-in',
  'shake-hit',
  'mini-zoom',
  'unfold-h',
  'unfold-v',
  'wipe-left',
  'wipe-right',
  'wipe-up',
  'wipe-down',
  'elastic-pop',
  'drop-in',
  'spin-zoom',
  'skew-slide',
  'pixel-in',
  ...KEN_BURNS_MOTIONS,
] as const;

export const MEDIA_LOOPS = [
  'none',
  'float',
  'pulse',
  'sway',
  'orbit',
  'pendulum',
  'heartbeat',
  'jitter',
  'breathe',
  'glitch-pulse',
  'zoom-drift',
  'tilt-swing',
  'wobble',
] as const;

export const MEDIA_EASINGS = ['linear', 'smooth', 'ease-out', 'overshoot'] as const;
export type MediaMotion = (typeof MEDIA_MOTIONS)[number];
export type MediaLoop = (typeof MEDIA_LOOPS)[number];

export type MediaMotionCategory =
  | 'basic'
  | 'slide'
  | 'swing'
  | 'zoom'
  | 'spin'
  | 'fx'
  | 'wipe'
  | 'ken-burns';

export interface MediaAnimation {
  entrance: MediaMotion;
  exit: MediaMotion;
  loop: MediaLoop;
  entranceDuration: number;
  exitDuration: number;
  loopDuration: number;
  easing: (typeof MEDIA_EASINGS)[number];
  kenBurns?: KenBurnsMotion;
}

export const DEFAULT_MEDIA_ANIMATION: MediaAnimation = {
  entrance: 'fade',
  exit: 'fade',
  loop: 'none',
  entranceDuration: 0.5,
  exitDuration: 0.5,
  loopDuration: 2,
  easing: 'smooth',
};

export interface MediaMotionMeta {
  id: MediaMotion;
  label: string;
  category: MediaMotionCategory;
  shortDesc: string;
  whenToUse: string;
}

export const MEDIA_MOTION_CATALOG: readonly MediaMotionMeta[] = [
  { id: 'none', label: 'None', category: 'basic', shortDesc: 'No edge motion', whenToUse: 'Static hard cuts' },
  { id: 'fade', label: 'Fade', category: 'basic', shortDesc: 'Smooth opacity fade', whenToUse: 'Clean B-roll & overlay entries/exits' },
  { id: 'flash-in', label: 'Exposure Flash', category: 'fx', shortDesc: 'Gamma brightness surge into sharp frame', whenToUse: 'CapCut-style hype openers & flash reveals' },
  { id: 'slide-left', label: 'Slide Left', category: 'slide', shortDesc: 'Glide from right/to left', whenToUse: 'Sequential cards & overlay B-roll' },
  { id: 'slide-right', label: 'Slide Right', category: 'slide', shortDesc: 'Glide from left/to right', whenToUse: 'Back-and-forth comparisons & callouts' },
  { id: 'slide-up', label: 'Slide Up', category: 'slide', shortDesc: 'Rise cleanly into frame', whenToUse: 'Vertical cards, product shots & lower overlays' },
  { id: 'slide-down', label: 'Slide Down', category: 'slide', shortDesc: 'Drop smoothly from top', whenToUse: 'Header banners & top-edge inserts' },
  { id: 'whip-in-left', label: 'Whip Pan Left', category: 'slide', shortDesc: 'High-speed blurred lateral whip from left', whenToUse: 'Fast creator cuts, B-roll pop-ins & Shorts' },
  { id: 'whip-in-right', label: 'Whip Pan Right', category: 'slide', shortDesc: 'High-speed blurred lateral whip from right', whenToUse: 'Energetic alternating pan sequences' },
  { id: 'skew-slide', label: 'Skew Velocity Slide', category: 'slide', shortDesc: 'Dynamic slanted fast slide settle', whenToUse: 'Sports, streetwear, tech launch overlays' },
  { id: 'zoom-in', label: 'Zoom In', category: 'zoom', shortDesc: 'Scale up smoothly into position', whenToUse: 'Focus grabs & hero B-roll intros' },
  { id: 'zoom-out', label: 'Zoom Out', category: 'zoom', shortDesc: 'Settle down from close scale', whenToUse: 'Dramatic punch-ins landing smoothly' },
  { id: 'mini-zoom', label: 'Mini Zoom', category: 'zoom', shortDesc: 'Subtle crisp 1.16x -> 1.00x creator snap', whenToUse: 'Clean talking-head hook B-roll without flashiness' },
  { id: 'pop', label: 'Pop', category: 'zoom', shortDesc: 'Bouncy scale-up with spring overshoot', whenToUse: 'Logos, screenshots, badges & product cutouts' },
  { id: 'elastic-pop', label: 'Elastic Spring Pop', category: 'zoom', shortDesc: 'Snappy CapCut spring overshoot with glow', whenToUse: 'Hook openers & high-retention stickers/inserts' },
  { id: 'bounce', label: 'Bounce', category: 'swing', shortDesc: 'Playful vertical gravity bounce', whenToUse: 'Upbeat creator social clips & graphics' },
  { id: 'drop-in', label: 'Heavy Drop In', category: 'swing', shortDesc: 'Overhead slam with brief squash settle', whenToUse: 'Stat callouts & heavy beat drops' },
  { id: 'rock-vertical', label: 'Rock Vertically', category: 'swing', shortDesc: 'CapCut vertical wave settle with tilt', whenToUse: 'Popular CapCut TikTok B-roll & montage swing' },
  { id: 'rock-horizontal', label: 'Rock Horizontally', category: 'swing', shortDesc: 'CapCut crisp side-to-side damped rock', whenToUse: 'Music-driven cuts & product showcase cards' },
  { id: 'swing-top', label: 'Swing Top', category: 'swing', shortDesc: 'Hinged pendulum drop from top edge', whenToUse: 'Tagline cards, receipts, UI panels' },
  { id: 'swing-bottom', label: 'Swing Bottom', category: 'swing', shortDesc: 'Pivoted upward swing into frame', whenToUse: 'Bottom-anchored overlays & reveal photos' },
  { id: 'swing-left', label: 'Swing Left', category: 'swing', shortDesc: 'Diagonal arc swing from left', whenToUse: 'Playful scrapbooks & photo dumps' },
  { id: 'swing-right', label: 'Swing Right', category: 'swing', shortDesc: 'Diagonal arc swing from right', whenToUse: 'Alternating collage & carousel entries' },
  { id: 'rotate-left', label: 'Rotate Left', category: 'spin', shortDesc: 'CCW spin into level framing', whenToUse: 'Creative spins & energetic photo flips' },
  { id: 'rotate-right', label: 'Rotate Right', category: 'spin', shortDesc: 'CW spin into level framing', whenToUse: 'Dynamic cut-ins & logo stings' },
  { id: 'spin-zoom', label: 'Spin & Zoom', category: 'spin', shortDesc: '180-degree whirl + zoom surge lock', whenToUse: 'Signature CapCut hype intro on hook clips' },
  { id: 'flip-x', label: 'Flip Horizontal', category: 'spin', shortDesc: '3D card flip across Y axis', whenToUse: 'Before/after visuals & card toggles' },
  { id: 'flip-y', label: 'Flip Vertical', category: 'spin', shortDesc: '3D tumbler flip across X axis', whenToUse: 'Vertical cards & dramatic UI reveals' },
  { id: 'blur', label: 'Blur', category: 'fx', shortDesc: 'Gaussian defocus ramp into sharp view', whenToUse: 'Clean focus-pull cinematic reveals' },
  { id: 'blur-rise', label: 'Blur Rise', category: 'fx', shortDesc: 'Defocus blend + gentle upward lift', whenToUse: 'Minimalist modern overlays & B-roll titles' },
  { id: 'glitch-in', label: 'RGB Glitch', category: 'fx', shortDesc: 'Chromatic R/B channel tear & digital flicker', whenToUse: 'Tech, gaming, AI visuals & dramatic hooks' },
  { id: 'shake-hit', label: 'Camera Shake Hit', category: 'fx', shortDesc: 'Damped S-shake micro-impact settling flat', whenToUse: 'Beat hits, hype action clips & SFX accents' },
  { id: 'pixel-in', label: 'Pixel Resolve', category: 'fx', shortDesc: 'Mosaic pixel grid sharpening into crisp shot', whenToUse: 'Retro gaming, mystery reveals & tech demos' },
  { id: 'unfold-h', label: 'Unfold Horizontal', category: 'wipe', shortDesc: 'Curtain unfold outward horizontally', whenToUse: 'Sleek editorial title panels & reveal inserts' },
  { id: 'unfold-v', label: 'Unfold Vertical', category: 'wipe', shortDesc: 'Shutter unfold outward vertically', whenToUse: 'Cinema-bar openers & before/after panels' },
  { id: 'wipe-left', label: 'Wipe Left', category: 'wipe', shortDesc: 'Linear mask reveal right-to-left', whenToUse: 'Clean infographic & UI slide reveals' },
  { id: 'wipe-right', label: 'Wipe Right', category: 'wipe', shortDesc: 'Linear mask reveal left-to-right', whenToUse: 'Reading-direction process reveals' },
  { id: 'wipe-up', label: 'Wipe Up', category: 'wipe', shortDesc: 'Linear mask reveal bottom-to-top', whenToUse: 'Growth charts & upward progression cards' },
  { id: 'wipe-down', label: 'Wipe Down', category: 'wipe', shortDesc: 'Linear mask reveal top-to-bottom', whenToUse: 'Menu drops & waterfall disclosures' },
  { id: 'ken-burns-push', label: 'Ken Burns Push (1.00x → 1.08x)', category: 'ken-burns', shortDesc: 'Continuous slow optical push', whenToUse: 'Still photos, documentary quotes, breathing B-roll' },
  { id: 'ken-burns-pull', label: 'Ken Burns Pull (1.08x → 1.00x)', category: 'ken-burns', shortDesc: 'Continuous slow optical pull-back', whenToUse: 'Revealing full scene context over static photos' },
  { id: 'ken-burns-pan-left', label: 'Ken Burns Pan Left', category: 'ken-burns', shortDesc: 'Continuous slow drift leftward', whenToUse: 'Wide landscape photos & architectural frames' },
  { id: 'ken-burns-pan-right', label: 'Ken Burns Pan Right', category: 'ken-burns', shortDesc: 'Continuous slow drift rightward', whenToUse: 'Horizontal panorama photos & timeline stills' },
];

export const MEDIA_MOTION_LABELS: Record<MediaMotion, string> = Object.fromEntries(
  MEDIA_MOTION_CATALOG.map((item) => [item.id, item.label])
) as Record<MediaMotion, string>;

export interface MediaLoopMeta {
  id: MediaLoop;
  label: string;
  shortDesc: string;
  whenToUse: string;
}

export const MEDIA_LOOP_CATALOG: readonly MediaLoopMeta[] = [
  { id: 'none', label: 'None', shortDesc: 'Steady held pose', whenToUse: 'Default for clean talking heads & text' },
  { id: 'float', label: 'Float', shortDesc: 'Gentle vertical levitation', whenToUse: 'Product cutouts & floating UI cards' },
  { id: 'pulse', label: 'Pulse', shortDesc: 'Soft rhythmic scale throb', whenToUse: 'Music-driven B-roll & callout badges' },
  { id: 'sway', label: 'Sway', shortDesc: 'Relaxed organic angle drift', whenToUse: 'Vlogs, lifestyle & playful overlays' },
  { id: 'orbit', label: 'Orbit', shortDesc: 'Smooth circular handheld float', whenToUse: 'Still images & floating stickers' },
  { id: 'pendulum', label: 'Pendulum Combo', shortDesc: 'Brisk metronome swing arc', whenToUse: 'CapCut music-beat B-roll combo' },
  { id: 'heartbeat', label: 'Heartbeat Thump', shortDesc: 'Double-peak lub-dub bass pulse', whenToUse: 'Hype highlights, fitness & beat drops' },
  { id: 'jitter', label: 'Handheld Drift', shortDesc: 'Subtle natural camera micro-shake', whenToUse: 'Giving static screen/photo inserts lifelike motion' },
  { id: 'breathe', label: 'Ambient Breathe', shortDesc: 'Slow luminous depth breath', whenToUse: 'Cinematic stills & serene portraits' },
  { id: 'glitch-pulse', label: 'Signal Flicker', shortDesc: 'Periodic chromatic RGB twitch', whenToUse: 'Cyberpunk, gaming & tech inserts' },
  { id: 'zoom-drift', label: 'Zoom Undulate', shortDesc: 'Gentle slow zoom wave', whenToUse: 'Podcast B-roll & visualizers' },
  { id: 'tilt-swing', label: 'Tilt Groove', shortDesc: 'Horizontal rock & slight skew groove', whenToUse: 'Music & dance combo loops' },
  { id: 'wobble', label: 'Jello Wobble', shortDesc: 'Elastic squash & stretch groove', whenToUse: 'Meme overlays, fun creator cutouts' },
];

export const MEDIA_LOOP_LABELS: Record<MediaLoop, string> = Object.fromEntries(
  MEDIA_LOOP_CATALOG.map((item) => [item.id, item.label])
) as Record<MediaLoop, string>;

export interface CapCutComboPreset {
  id: string;
  name: string;
  description: string;
  animation: MediaAnimation;
}

export const CAPCUT_COMBO_PRESETS: readonly CapCutComboPreset[] = [
  {
    id: 'clean-creator',
    name: 'Clean Creator Blur Rise',
    description: 'Smooth blur-rise entry + soft fade out for modern SaaS/creator B-roll',
    animation: { entrance: 'blur-rise', exit: 'fade', loop: 'none', entranceDuration: 0.35, exitDuration: 0.25, loopDuration: 2, easing: 'ease-out' },
  },
  {
    id: 'capcut-rock-hype',
    name: 'CapCut Rock Vertically',
    description: 'Viral CapCut vertical rock entrance with subtle pendulum groove',
    animation: { entrance: 'rock-vertical', exit: 'whip-in-left', loop: 'pendulum', entranceDuration: 0.45, exitDuration: 0.25, loopDuration: 2.2, easing: 'ease-out' },
  },
  {
    id: 'mini-zoom-snap',
    name: 'Mini Zoom Snap',
    description: 'Crisp 1.16x -> 1.00x hook punch without hiding initial frames',
    animation: { entrance: 'mini-zoom', exit: 'none', loop: 'none', entranceDuration: 0.3, exitDuration: 0.2, loopDuration: 2, easing: 'ease-out' },
  },
  {
    id: 'whip-shake-drop',
    name: 'Whip & S-Shake Hit',
    description: 'Fast whip-in + beat-drop impact thump loop',
    animation: { entrance: 'whip-in-left', exit: 'whip-in-right', loop: 'heartbeat', entranceDuration: 0.28, exitDuration: 0.25, loopDuration: 1.4, easing: 'ease-out' },
  },
  {
    id: 'flash-exposure',
    name: 'Flash Overexposure',
    description: 'Bright gamma exposure flash entrance + smooth zoom drift',
    animation: { entrance: 'flash-in', exit: 'fade', loop: 'zoom-drift', entranceDuration: 0.32, exitDuration: 0.25, loopDuration: 2.4, easing: 'ease-out' },
  },
  {
    id: 'cyber-glitch',
    name: 'Cyber RGB Glitch',
    description: 'Opposing RGB channel tear entrance + periodic signal twitch',
    animation: { entrance: 'glitch-in', exit: 'glitch-in', loop: 'glitch-pulse', entranceDuration: 0.3, exitDuration: 0.22, loopDuration: 1.8, easing: 'ease-out' },
  },
  {
    id: 'elastic-spring',
    name: 'Elastic Spring Pop',
    description: 'Bouncy CapCut spring pop for UI callouts, product cards & overlays',
    animation: { entrance: 'elastic-pop', exit: 'zoom-in', loop: 'float', entranceDuration: 0.4, exitDuration: 0.24, loopDuration: 2.4, easing: 'overshoot' },
  },
  {
    id: 'ken-burns-doc',
    name: 'Documentary Ken Burns Push',
    description: 'Continuous 1.00x -> 1.08x push on static photos with soft fade',
    animation: { entrance: 'fade', exit: 'fade', loop: 'none', entranceDuration: 0.35, exitDuration: 0.35, loopDuration: 2, easing: 'smooth', kenBurns: 'ken-burns-push' },
  },
];

export function calculateKenBurnsPose(
  motion: KenBurnsMotion,
  progress: number,
  easing: MediaAnimation['easing'] = 'smooth'
): { x: number; y: number; scale: number } {
  const t = clamp(progress, 0, 1);
  const p = easing === 'linear' ? t : t * t * (3 - 2 * t);
  switch (motion) {
    case 'ken-burns-push':
      return { x: 0, y: 0, scale: 1.0 + 0.08 * p };
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

export function resolveMediaMotion(value: unknown): MediaMotion | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if ((MEDIA_MOTIONS as readonly string[]).includes(trimmed)) return trimmed as MediaMotion;
  const aliases: Record<string, MediaMotion> = {
    rock: 'rock-vertical',
    'rock vertically': 'rock-vertical',
    'rock horizontally': 'rock-horizontal',
    'swing top': 'swing-top',
    'swing bottom': 'swing-bottom',
    'swing left': 'swing-left',
    'swing right': 'swing-right',
    flash: 'flash-in',
    glitch: 'glitch-in',
    shake: 'shake-hit',
    unfold: 'unfold-h',
    wipe: 'wipe-right',
    'spin zoom': 'spin-zoom',
    pixel: 'pixel-in',
    'ken burns': 'ken-burns-push',
  };
  return aliases[trimmed] ?? aliases[trimmed.replace(/[_-]+/g, ' ')] ?? null;
}

export function resolveMediaLoop(value: unknown): MediaLoop | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if ((MEDIA_LOOPS as readonly string[]).includes(trimmed)) return trimmed as MediaLoop;
  const aliases: Record<string, MediaLoop> = {
    'pendulum swing': 'pendulum',
    heart: 'heartbeat',
    handheld: 'jitter',
    breathing: 'breathe',
    flicker: 'glitch-pulse',
    jello: 'wobble',
  };
  return aliases[trimmed] ?? aliases[trimmed.replace(/[_-]+/g, ' ')] ?? null;
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
    ![raw.entranceDuration, raw.exitDuration].every((n) => Number.isFinite(n) && n >= 0.05 && n <= 3) ||
    !Number.isFinite(raw.loopDuration) ||
    raw.loopDuration < 0.5 ||
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
    ...(raw.kenBurns ? { kenBurns: raw.kenBurns } : {}),
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
  const c = editable(p, id);
  const mediaAnimation = readMediaAnimation(value);
  if (
    mediaAnimation.entrance === 'none' &&
    mediaAnimation.exit === 'none' &&
    mediaAnimation.loop === 'none' &&
    !mediaAnimation.kenBurns
  ) {
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
  const a = c.mediaAnimation;
  const rawIn = a && a.entrance !== 'none' ? a.entranceDuration : 0;
  const rawOut = a && a.exit !== 'none' ? a.exitDuration : 0;
  const total = rawIn + rawOut;
  const factor = total > c.duration * 0.8 ? (c.duration * 0.8) / total : 1;
  return { entrance: rawIn * factor, exit: rawOut * factor };
}

const identity = () => ({
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
  scaleX: 1,
  scaleY: 1,
  blur: 0,
  brightness: 1,
  rgbOffset: 0,
  pixelate: 0,
  skewX: 0,
  wipeMode: 0, // 0=none, 1=left, 2=right, 3=up, 4=down, 5=unfold-h, 6=unfold-v
  wipeProgress: 1,
});
export type MediaAnimationPose = ReturnType<typeof identity>;
type Pose = MediaAnimationPose;

function bounce(t: number) {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) {
    t -= 1.5 / d;
    return n * t * t + 0.75;
  }
  if (t < 2.5 / d) {
    t -= 2.25 / d;
    return n * t * t + 0.9375;
  }
  t -= 2.625 / d;
  return n * t * t + 0.984375;
}

function ease(t: number, kind: MediaAnimation['easing']) {
  if (t === 0 || t === 1) return t;
  if (kind === 'linear') return t;
  if (kind === 'ease-out') return 1 - Math.pow(1 - t, 3);
  if (kind === 'overshoot') {
    const q = t - 1;
    return 1 + 2.70158 * q * q * q + 1.70158 * q * q;
  }
  return t * t * (3 - 2 * t);
}

// Animations where the frame should remain visible rather than fading from opacity 0
const OPAQUE_AT_ZERO = new Set<MediaMotion>([
  'mini-zoom',
  'shake-hit',
  'flash-in',
  'pixel-in',
  'wipe-left',
  'wipe-right',
  'wipe-up',
  'wipe-down',
  'unfold-h',
  'unfold-v',
  'ken-burns-push',
  'ken-burns-pull',
  'ken-burns-pan-left',
  'ken-burns-pan-right',
]);

function edge(pose: Pose, motion: MediaMotion, progress: number, exiting: boolean, easing: MediaAnimation['easing']) {
  if (motion === 'none') return;
  const q =
    motion === 'bounce'
      ? exiting
        ? 1 - bounce(1 - progress)
        : bounce(progress)
      : ease(progress, motion === 'pop' || motion === 'elastic-pop' ? 'overshoot' : easing);
  const amount = exiting ? q : 1 - q;
  if (!OPAQUE_AT_ZERO.has(motion)) {
    pose.opacity *= 1 - clamp(amount, 0, 1);
  }
  switch (motion) {
    case 'slide-left':
      pose.x -= 1.1 * amount;
      break;
    case 'slide-right':
      pose.x += 1.1 * amount;
      break;
    case 'slide-up':
      pose.y -= 1.1 * amount;
      break;
    case 'slide-down':
      pose.y += 1.1 * amount;
      break;
    case 'zoom-in':
      pose.scale *= 1 + (exiting ? 0.3 : -0.3) * amount;
      break;
    case 'zoom-out':
      pose.scale *= 1 + (exiting ? -0.3 : 0.3) * amount;
      break;
    case 'mini-zoom': {
      const m = clamp(Math.abs(amount), 0, 1);
      pose.scale *= 1 + 0.16 * m;
      pose.opacity *= 1 - (exiting ? clamp(q, 0, 1) * 0.85 : 0);
      break;
    }
    case 'pop':
      pose.scale *= 1 - 0.6 * amount;
      break;
    case 'elastic-pop':
      pose.scale *= 1 - 0.45 * amount;
      pose.blur += 8 * Math.max(0, amount);
      break;
    case 'bounce':
      pose.y += 0.35 * amount;
      break;
    case 'drop-in': {
      const b = exiting ? 1 - bounce(1 - progress) : bounce(progress);
      const drop = exiting ? b : 1 - b;
      pose.y -= 0.75 * drop;
      pose.scaleY *= 1 - 0.14 * Math.sin(Math.PI * progress);
      pose.scaleX *= 1 + 0.1 * Math.sin(Math.PI * progress);
      break;
    }
    case 'rotate-left':
      pose.rotation -= 35 * amount;
      pose.scale *= 1 - 0.12 * amount;
      break;
    case 'rotate-right':
      pose.rotation += 35 * amount;
      pose.scale *= 1 - 0.12 * amount;
      break;
    case 'spin-zoom':
      pose.rotation += (exiting ? 180 : -180) * amount;
      pose.scale *= 1 + (exiting ? 0.45 : -0.45) * clamp(amount, 0, 1);
      pose.blur += 12 * Math.sin(Math.PI * progress);
      break;
    case 'flip-x':
      pose.scaleX *= 1 - 1.85 * clamp(amount, 0, 1);
      break;
    case 'flip-y':
      pose.scaleY *= 1 - 1.85 * clamp(amount, 0, 1);
      break;
    case 'blur':
      pose.blur += 16 * Math.max(0, amount);
      break;
    case 'blur-rise':
      pose.blur += 16 * Math.max(0, amount);
      pose.y += 0.07 * amount;
      break;
    case 'rock-vertical': {
      const m = Math.max(0, amount);
      const osc = Math.sin(progress * Math.PI * 2.5) * m;
      pose.y += 0.18 * amount + 0.05 * osc;
      pose.rotation += osc * 12;
      pose.scale *= 1 + 0.08 * m;
      pose.blur += 6 * m;
      break;
    }
    case 'rock-horizontal': {
      const m = Math.max(0, amount);
      const osc = Math.sin(progress * Math.PI * 2.5) * m;
      pose.x += 0.16 * amount + 0.06 * osc;
      pose.rotation += osc * 10;
      pose.scale *= 1 + 0.08 * m;
      pose.blur += 6 * m;
      break;
    }
    case 'swing-top': {
      const m = clamp(amount, 0, 1);
      pose.y -= 0.42 * m;
      pose.rotation += Math.sin(m * Math.PI * 1.4) * 18 * m;
      pose.scale *= 1 - 0.12 * m;
      break;
    }
    case 'swing-bottom': {
      const m = clamp(amount, 0, 1);
      pose.y += 0.42 * m;
      pose.rotation -= Math.sin(m * Math.PI * 1.4) * 18 * m;
      pose.scale *= 1 - 0.12 * m;
      break;
    }
    case 'swing-left': {
      const m = clamp(amount, 0, 1);
      pose.x -= 0.45 * m;
      pose.y += 0.12 * m;
      pose.rotation -= 22 * m;
      break;
    }
    case 'swing-right': {
      const m = clamp(amount, 0, 1);
      pose.x += 0.45 * m;
      pose.y += 0.12 * m;
      pose.rotation += 22 * m;
      break;
    }
    case 'whip-in-left': {
      const m = clamp(amount, 0, 1);
      pose.x -= 0.95 * m;
      pose.blur += 18 * Math.sin(Math.PI * clamp(progress, 0, 1));
      pose.rgbOffset += 0.014 * Math.sin(Math.PI * clamp(progress, 0, 1));
      pose.scale *= 1 + 0.06 * m;
      break;
    }
    case 'whip-in-right': {
      const m = clamp(amount, 0, 1);
      pose.x += 0.95 * m;
      pose.blur += 18 * Math.sin(Math.PI * clamp(progress, 0, 1));
      pose.rgbOffset += 0.014 * Math.sin(Math.PI * clamp(progress, 0, 1));
      pose.scale *= 1 + 0.06 * m;
      break;
    }
    case 'skew-slide': {
      const m = clamp(amount, 0, 1);
      pose.x -= 0.85 * m;
      pose.skewX += 0.38 * m;
      pose.blur += 10 * m;
      break;
    }
    case 'flash-in': {
      const m = Math.max(0, amount);
      pose.brightness += 2.2 * Math.pow(m, 1.3);
      pose.scale *= 1 + 0.06 * m;
      pose.opacity *= exiting ? 1 - clamp(q, 0, 1) : 0.45 + 0.55 * (1 - clamp(m, 0, 1));
      break;
    }
    case 'glitch-in': {
      const m = Math.max(0, amount);
      const jitter = Math.sin(progress * 47);
      pose.rgbOffset += 0.03 * m;
      pose.x += jitter * 0.03 * m;
      pose.scale *= 1 + 0.04 * m;
      if (Math.sin(progress * 67) < -0.55 && m > 0.3) {
        pose.opacity *= 0.6;
      }
      break;
    }
    case 'shake-hit': {
      const m = Math.max(0, amount);
      pose.x += Math.sin(progress * 38) * 0.045 * m;
      pose.y += Math.cos(progress * 31) * 0.035 * m;
      pose.rotation += Math.sin(progress * 44) * 3.5 * m;
      pose.scale *= 1 + 0.14 * m;
      pose.blur += 6 * m;
      pose.rgbOffset += 0.01 * m;
      if (exiting) pose.opacity *= 1 - clamp(q, 0, 1);
      break;
    }
    case 'pixel-in': {
      const m = Math.max(0, amount);
      pose.pixelate = Math.max(pose.pixelate, m);
      if (exiting) pose.opacity *= 1 - clamp(q * 0.9, 0, 1);
      break;
    }
    case 'wipe-left':
      pose.wipeMode = 1;
      pose.wipeProgress = clamp(exiting ? 1 - q : q, 0, 1);
      break;
    case 'wipe-right':
      pose.wipeMode = 2;
      pose.wipeProgress = clamp(exiting ? 1 - q : q, 0, 1);
      break;
    case 'wipe-up':
      pose.wipeMode = 3;
      pose.wipeProgress = clamp(exiting ? 1 - q : q, 0, 1);
      break;
    case 'wipe-down':
      pose.wipeMode = 4;
      pose.wipeProgress = clamp(exiting ? 1 - q : q, 0, 1);
      break;
    case 'unfold-h':
      pose.wipeMode = 5;
      pose.wipeProgress = clamp(exiting ? 1 - q : q, 0, 1);
      break;
    case 'unfold-v':
      pose.wipeMode = 6;
      pose.wipeProgress = clamp(exiting ? 1 - q : q, 0, 1);
      break;
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
export function mediaAnimationFrame(
  c: Pick<Clip, 'startTime' | 'duration' | 'mediaAnimation'>,
  time: number
): Pose {
  const pose = identity();
  const a = c.mediaAnimation;
  if (!a || c.duration <= 0) return pose;

  const local = clamp(time - c.startTime, 0, c.duration);
  const timing = mediaAnimationTiming(c);
  if (timing.entrance) edge(pose, a.entrance, clamp(local / timing.entrance, 0, 1), false, a.easing);
  if (timing.exit) edge(pose, a.exit, clamp((local - (c.duration - timing.exit)) / timing.exit, 0, 1), true, a.easing);

  // Ken Burns dynamic motion applies continuously across the full clip duration
  const kbMotion =
    a.kenBurns ||
    (KEN_BURNS_MOTIONS.includes(a.entrance as KenBurnsMotion) ? (a.entrance as KenBurnsMotion) : undefined) ||
    (c as { kenBurns?: KenBurnsMotion }).kenBurns;
  if (kbMotion && KEN_BURNS_MOTIONS.includes(kbMotion)) {
    const progress = clamp(local / c.duration, 0, 1);
    const kb = calculateKenBurnsPose(kbMotion, progress, a.easing);
    pose.x += kb.x;
    pose.y += kb.y;
    pose.scale *= kb.scale;
  }

  const hold = c.duration - timing.entrance - timing.exit;
  if (a.loop !== 'none' && hold > 1e-7 && local > timing.entrance && local < c.duration - timing.exit) {
    const elapsed = local - timing.entrance;
    const phase = (elapsed / a.loopDuration) * Math.PI * 2;
    const envelope = Math.pow(Math.sin((Math.PI * elapsed) / hold), 2);
    switch (a.loop) {
      case 'float':
        pose.y -= Math.sin(phase) * 0.025 * envelope;
        break;
      case 'pulse':
        pose.scale *= 1 + (1 - Math.cos(phase)) * 0.035 * envelope;
        break;
      case 'sway':
        pose.rotation += Math.sin(phase) * 3 * envelope;
        break;
      case 'orbit':
        pose.x += Math.cos(phase) * 0.025 * envelope;
        pose.y += Math.sin(phase) * 0.025 * envelope;
        break;
      case 'pendulum':
        pose.rotation += Math.sin(phase) * 6 * envelope;
        pose.x += Math.sin(phase) * 0.025 * envelope;
        pose.scale *= 1 + 0.04 * envelope;
        break;
      case 'heartbeat': {
        const beat = (elapsed % a.loopDuration) / a.loopDuration;
        const thump =
          Math.exp(-Math.pow((beat - 0.14) / 0.06, 2)) +
          0.72 * Math.exp(-Math.pow((beat - 0.3) / 0.06, 2));
        pose.scale *= 1 + 0.08 * thump * envelope;
        break;
      }
      case 'jitter':
        pose.x += Math.sin(phase * 3.1) * 0.009 * envelope;
        pose.y += Math.cos(phase * 2.7) * 0.008 * envelope;
        pose.rotation += Math.sin(phase * 3.7) * 0.8 * envelope;
        pose.scale *= 1 + 0.025 * envelope;
        break;
      case 'breathe':
        pose.scale *= 1 + (0.5 - 0.5 * Math.cos(phase)) * 0.045 * envelope;
        pose.brightness += (0.5 - 0.5 * Math.cos(phase)) * 0.12 * envelope;
        break;
      case 'glitch-pulse': {
        const windowPulse = Math.max(0, Math.sin(phase * 2) - 0.78) * 4.5;
        pose.rgbOffset += 0.018 * windowPulse * envelope;
        pose.x += Math.sin(phase * 17) * 0.014 * windowPulse * envelope;
        break;
      }
      case 'zoom-drift':
        pose.scale *= 1 + (0.045 + 0.025 * Math.sin(phase)) * envelope;
        break;
      case 'tilt-swing':
        pose.skewX += Math.sin(phase) * 0.07 * envelope;
        pose.x += Math.sin(phase) * 0.02 * envelope;
        pose.scale *= 1 + 0.04 * envelope;
        break;
      case 'wobble':
        pose.scaleX *= 1 + Math.sin(phase * 2) * 0.06 * envelope;
        pose.scaleY *= 1 - Math.sin(phase * 2) * 0.06 * envelope;
        break;
    }
  }
  return pose;
}
