import {clamp, type Clip, type EditorProject, type Transform, defaultTransform} from './model';
import {type TransformKeyframe} from './keyframes';
import {
  setMediaAnimation,
  clearMediaAnimation,
  type MediaAnimation,
  KEN_BURNS_MOTIONS,
  type KenBurnsMotion,
  calculateKenBurnsPose
} from './mediaAnimation';

export const KEN_BURNS_PRESETS = KEN_BURNS_MOTIONS;
export type KenBurnsPreset = KenBurnsMotion;

export const KEN_BURNS_LABELS: Record<KenBurnsPreset, string> = {
  'ken-burns-push': 'Ken Burns Push (1.00x → 1.08x)',
  'ken-burns-pull': 'Ken Burns Pull (1.08x → 1.00x)',
  'ken-burns-pan-left': 'Ken Burns Pan Left (horizontal drift)',
  'ken-burns-pan-right': 'Ken Burns Pan Right (horizontal drift)'
};

export function isKenBurnsPreset(value: unknown): value is KenBurnsPreset {
  return typeof value === 'string' && (KEN_BURNS_PRESETS as readonly string[]).includes(value);
}

export interface KenBurnsFrame {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

/**
 * Calculates continuous Ken Burns pose for a given normalized progress [0, 1].
 * Aspect ratios are strictly preserved by using uniform scaling only.
 */
export function calculateKenBurnsFrame(
  preset: KenBurnsPreset,
  progress: number,
  easing: 'linear' | 'smooth' = 'smooth'
): KenBurnsFrame {
  const pose = calculateKenBurnsPose(preset, progress, easing);
  return {
    ...pose,
    rotation: 0,
    opacity: 1
  };
}

/**
 * Evaluates Ken Burns transform for a clip at a timeline time (seconds).
 */
export function kenBurnsFrame(
  clip: Pick<Clip, 'startTime' | 'duration' | 'mediaAnimation'>,
  time: number
): KenBurnsFrame {
  const a = clip.mediaAnimation;
  const preset: KenBurnsPreset | undefined =
    a?.kenBurns ||
    (isKenBurnsPreset(a?.entrance) ? a.entrance : undefined) ||
    (clip as { kenBurns?: KenBurnsPreset }).kenBurns;

  if (!preset || clip.duration <= 0) {
    return { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
  }

  const progress = clamp((time - clip.startTime) / clip.duration, 0, 1);
  return calculateKenBurnsFrame(preset, progress, a?.easing === 'linear' ? 'linear' : 'smooth');
}

function editableVisual(p: EditorProject, id: string): Clip {
  const c = p.clips[id];
  if (!c || !p.tracks[c.trackId] || p.tracks[c.trackId].locked) {
    throw Error('Select an unlocked clip on a visible track.');
  }
  if (!c.assetId || !['video', 'image'].includes(p.assets[c.assetId]?.kind)) {
    throw Error('Ken Burns motion presets require video or image clips.');
  }
  return c;
}

/**
 * Applies a Ken Burns preset to a clip in the project.
 * Composes with existing mediaAnimation, preserving exit transitions.
 */
export function applyKenBurnsPreset(
  p: EditorProject,
  id: string,
  preset: KenBurnsPreset,
  options?: { entranceFade?: boolean; exitFade?: boolean }
): EditorProject {
  const c = editableVisual(p, id);
  if (!isKenBurnsPreset(preset)) {
    throw Error(`Invalid Ken Burns preset "${preset}". Choose: ${KEN_BURNS_PRESETS.join(', ')}.`);
  }

  const existing = c.mediaAnimation;
  const animation: MediaAnimation = {
    entrance: preset,
    exit: options?.exitFade ?? true ? (existing?.exit && existing.exit !== 'none' ? existing.exit : 'fade') : 'none',
    loop: existing?.loop ?? 'none',
    entranceDuration: options?.entranceFade ? Math.min(0.5, c.duration * 0.25) : 0.5,
    exitDuration: options?.exitFade ?? true ? Math.min(0.5, c.duration * 0.25) : 0.5,
    loopDuration: existing?.loopDuration ?? 2,
    easing: existing?.easing ?? 'smooth',
    kenBurns: preset
  };

  const updated = setMediaAnimation(p, id, animation);
  // Also tag on clip for direct inspection
  return {
    ...updated,
    clips: {
      ...updated.clips,
      [id]: {
        ...updated.clips[id],
        kenBurns: preset
      }
    }
  };
}

/**
 * Clears Ken Burns motion from a clip.
 */
export function clearKenBurns(p: EditorProject, id: string): EditorProject {
  const c = editableVisual(p, id);
  const clean = { ...c };
  delete clean.kenBurns;

  if (c.mediaAnimation?.kenBurns || isKenBurnsPreset(c.mediaAnimation?.entrance)) {
    const nextAnim: MediaAnimation = {
      ...c.mediaAnimation,
      entrance: 'none',
      kenBurns: undefined
    };
    if (nextAnim.exit === 'none' && nextAnim.loop === 'none') {
      return clearMediaAnimation({ ...p, clips: { ...p.clips, [id]: clean } }, id);
    }
    return setMediaAnimation({ ...p, clips: { ...p.clips, [id]: clean } }, id, nextAnim);
  }

  return { ...p, clips: { ...p.clips, [id]: clean } };
}

/**
 * Finds all B-roll clips in the project and applies alternating Ken Burns presets.
 * Presets cycle in rhythm: push -> pan-left -> pull -> pan-right.
 */
export function autoApplyKenBurnsToBroll(
  p: EditorProject,
  presets: readonly KenBurnsPreset[] = KEN_BURNS_PRESETS
): { project: EditorProject; modifiedClipIds: string[] } {
  const overlayTrackIds = new Set(
    p.trackOrder.filter(id => ['overlay', 'image'].includes(p.tracks[id]?.kind))
  );

  const brollClips = Object.values(p.clips)
    .filter(c => {
      const track = p.tracks[c.trackId];
      if (!track || track.locked || track.hidden) return false;
      const asset = c.assetId ? p.assets[c.assetId] : undefined;
      if (!asset || !['video', 'image'].includes(asset.kind)) return false;

      // Overlay track clips or muted secondary footage clips are B-roll
      return (
        overlayTrackIds.has(c.trackId) ||
        (c.volume === 0 && track.kind !== 'video') ||
        asset.stockKey?.startsWith('broll:')
      );
    })
    .sort((a, b) => a.startTime - b.startTime);

  if (!brollClips.length) {
    return { project: p, modifiedClipIds: [] };
  }

  let nextProject = p;
  const modifiedClipIds: string[] = [];

  brollClips.forEach((clip, index) => {
    const preset = presets[index % presets.length];
    nextProject = applyKenBurnsPreset(nextProject, clip.id, preset);
    modifiedClipIds.push(clip.id);
  });

  return { project: nextProject, modifiedClipIds };
}

/**
 * Converts a Ken Burns preset into standard TransformKeyframe[] using source-clock timing.
 * Useful for pipelines that serialize keyframes explicitly.
 */
export function kenBurnsToKeyframes(clip: Clip, preset: KenBurnsPreset): TransformKeyframe[] {
  if (!isKenBurnsPreset(preset)) {
    throw Error(`Invalid Ken Burns preset "${preset}".`);
  }

  const base = clip.transform || defaultTransform;
  const startPose = calculateKenBurnsFrame(preset, 0, 'smooth');
  const midPose = calculateKenBurnsFrame(preset, 0.5, 'smooth');
  const endPose = calculateKenBurnsFrame(preset, 1, 'smooth');

  const toTransform = (frame: KenBurnsFrame): Transform => ({
    x: base.x + frame.x,
    y: base.y + frame.y,
    scale: clamp(base.scale * frame.scale, 0.05, 10),
    rotation: base.rotation + frame.rotation,
    opacity: clamp(base.opacity * frame.opacity, 0, 1)
  });

  const duration = Math.max(1e-4, clip.sourceEnd - clip.sourceStart);

  return [
    { sourceTime: clip.sourceStart, value: toTransform(startPose), easing: 'linear' },
    { sourceTime: clip.sourceStart + duration * 0.5, value: toTransform(midPose), easing: 'smooth' },
    { sourceTime: clip.sourceEnd, value: toTransform(endPose), easing: 'smooth' }
  ];
}
