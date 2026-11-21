import { BUILTIN_SFX } from '../assets/builtinSfx';
import { type EditorProject, type Clip, type MediaAsset, projectDuration, uid, clamp } from './model';
import { addAsset, addClip } from './operations';
import { speechContext } from './speechContext';
import { editorialBeats } from './editorialSense';
import { mainFootage } from './aiTools';
import type { EditDecision } from './ai';

export type ContextualSfxType = 'whoosh' | 'pop' | 'riser';

export interface SfxSuggestion {
  soundId: string;
  name: string;
  type: ContextualSfxType;
  startTime: number;
  duration: number;
  volume: number;
  reason: string;
  cueTimestamp: number;
}

export interface AutoSfxOptions {
  intensity?: 'subtle' | 'balanced' | 'punchy';
  includeTransitions?: boolean;
  includeBrollCuts?: boolean;
  includeGraphics?: boolean;
  includeClimaxes?: boolean;
  maxEffects?: number;
  volumeFloor?: number;
  volumeCeiling?: number;
}

const DEFAULT_OPTIONS: Required<AutoSfxOptions> = {
  intensity: 'balanced',
  includeTransitions: true,
  includeBrollCuts: true,
  includeGraphics: true,
  includeClimaxes: true,
  maxEffects: 8,
  volumeFloor: 0.08,
  volumeCeiling: 0.18,
};

/** Create or retrieve the media asset representation of a built-in sound effect */
export function getOrCreateSfxAsset(project: EditorProject, soundId: string): MediaAsset {
  const existing = Object.values(project.assets).find(
    (a) => a.id === `sfx-${soundId}` || (a.kind === 'audio' && a.url === `/sfx/${soundId}.wav`)
  );
  if (existing) return existing;

  const sound = BUILTIN_SFX.find((s) => s.id === soundId) || BUILTIN_SFX[0];
  return {
    id: `sfx-${sound.id}`,
    name: sound.name,
    kind: 'audio',
    mime: 'audio/wav',
    size: 44100,
    duration: sound.duration,
    width: 0,
    height: 0,
    url: sound.url,
  };
}

/**
 * Smart contextual SFX suggester:
 * Analyzes video cuts, transitions, graphic appearances, and speech climaxes
 * to generate sound effects with strictly restrained volume (0.08 to 0.18).
 */
export function suggestContextualSfx(
  project: EditorProject,
  userOptions: AutoSfxOptions = {}
): SfxSuggestion[] {
  const opts: Required<AutoSfxOptions> = { ...DEFAULT_OPTIONS, ...userOptions };
  const maxTotal = opts.maxEffects ?? (opts.intensity === 'subtle' ? 4 : opts.intensity === 'punchy' ? 12 : 8);
  const totalDuration = projectDuration(project);
  if (totalDuration < 1.0) return [];

  const suggestions: SfxSuggestion[] = [];
  const footage = mainFootage(project);

  // 1. Cuts and Transitions -> whoosh
  if (opts.includeTransitions) {
    const cutPoints: Array<{ time: number; reason: string }> = [];

    // Explicit transitions
    for (const tr of Object.values(project.transitions)) {
      const fromClip = project.clips[tr.fromClipId];
      if (fromClip) {
        const time = fromClip.startTime + fromClip.duration;
        cutPoints.push({ time, reason: `Visual ${tr.kind} transition` });
      }
    }

    // Main footage cut boundaries
    const sortedFootage = [...footage].sort((a, b) => a.startTime - b.startTime);
    for (let i = 0; i < sortedFootage.length - 1; i++) {
      const curr = sortedFootage[i];
      const next = sortedFootage[i + 1];
      const cutTime = curr.startTime + curr.duration;
      if (Math.abs(cutTime - next.startTime) < 0.05) {
        cutPoints.push({ time: cutTime, reason: `Footage cut from ${curr.name} to ${next.name}` });
      }
    }

    // B-roll cut boundaries (overlay/image tracks)
    if (opts.includeBrollCuts) {
      const brollClips = Object.values(project.clips).filter((c) => {
        const kind = project.tracks[c.trackId]?.kind;
        return (kind === 'overlay' || kind === 'image') && !project.tracks[c.trackId]?.hidden;
      });
      for (const b of brollClips) {
        cutPoints.push({ time: b.startTime, reason: `B-roll cut-in: ${b.name}` });
        if (b.duration >= 1.5) {
          cutPoints.push({ time: b.startTime + b.duration, reason: `B-roll cut-out back to main footage` });
        }
      }
    }

    // Sort and deduplicate cut points with minimum 2.0s spacing
    cutPoints.sort((a, b) => a.time - b.time);
    let lastWhooshTime = -999;
    for (const cut of cutPoints) {
      if (cut.time < 0.3 || cut.time > totalDuration - 0.5) continue;
      if (cut.time - lastWhooshTime < 2.0) continue;

      const isFast = opts.intensity === 'punchy';
      const soundId = isFast ? 'fast-swish' : 'soft-whoosh';
      const sound = BUILTIN_SFX.find((s) => s.id === soundId)!;
      const lead = isFast ? 0.15 : 0.25;
      const startTime = Math.max(0, cut.time - lead);

      if (startTime + sound.duration > totalDuration + 0.1) continue;

      // Restrained whoosh volume (0.10 to 0.14)
      const volume = clamp(
        opts.intensity === 'subtle' ? 0.09 : opts.intensity === 'punchy' ? 0.14 : 0.12,
        opts.volumeFloor,
        opts.volumeCeiling
      );

      suggestions.push({
        soundId: sound.id,
        name: sound.name,
        type: 'whoosh',
        startTime,
        duration: sound.duration,
        volume,
        reason: cut.reason,
        cueTimestamp: cut.time,
      });
      lastWhooshTime = cut.time;
    }
  }

  // 2. Graphic Appearances -> pop
  if (opts.includeGraphics) {
    const graphicClips = Object.values(project.clips).filter((c) => {
      const track = project.tracks[c.trackId];
      if (!track || track.hidden) return false;
      return (
        !!c.graphic ||
        !!c.shape ||
        (track.kind === 'text' && !c.contentId?.startsWith('cap-'))
      );
    });

    graphicClips.sort((a, b) => a.startTime - b.startTime);
    let lastPopTime = -999;
    for (const g of graphicClips) {
      if (g.startTime - lastPopTime < 1.0) continue;
      if (g.startTime > totalDuration - 0.2) continue;

      const sound = BUILTIN_SFX.find((s) => s.id === 'digital-pop')!;
      // Restrained pop volume (0.09 to 0.13)
      const volume = clamp(
        opts.intensity === 'subtle' ? 0.08 : opts.intensity === 'punchy' ? 0.13 : 0.10,
        opts.volumeFloor,
        opts.volumeCeiling
      );

      suggestions.push({
        soundId: sound.id,
        name: sound.name,
        type: 'pop',
        startTime: g.startTime,
        duration: sound.duration,
        volume,
        reason: `Graphic appearance: ${g.graphic?.kind || g.name || 'graphic'}`,
        cueTimestamp: g.startTime,
      });
      lastPopTime = g.startTime;
    }
  }

  // 3. Climaxes / Emphasis Cues -> riser
  if (opts.includeClimaxes) {
    const beats = editorialBeats(project, footage);
    const speechLines = speechContext(project);

    // Identify high-impact climax words
    const climaxes: Array<{ time: number; text: string }> = [];
    for (const beat of beats) {
      climaxes.push({ time: beat.start, text: beat.text });
    }

    for (const line of speechLines) {
      for (const w of line.words || []) {
        const clean = w.word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        if (/^(never|secret|truth|finally|huge|boom|climax|gamechanger|crucial|essential)$/i.test(clean)) {
          if (!climaxes.some((c) => Math.abs(c.time - w.start) < 2.0)) {
            climaxes.push({ time: w.start, text: w.word });
          }
        }
      }
    }

    climaxes.sort((a, b) => a.time - b.time);
    let lastRiserTime = -999;
    const riserSound = BUILTIN_SFX.find((s) => s.id === 'cinematic-rise')!;

    for (const climax of climaxes) {
      // Risers need at least 1.8s build-up time
      if (climax.time < 1.8) continue;
      if (climax.time - lastRiserTime < 6.0) continue;

      const startTime = Math.max(0, climax.time - riserSound.duration);
      if (startTime + riserSound.duration > totalDuration + 0.1) continue;

      // Restrained riser volume (0.11 to 0.16)
      const volume = clamp(
        opts.intensity === 'subtle' ? 0.10 : opts.intensity === 'punchy' ? 0.16 : 0.13,
        opts.volumeFloor,
        opts.volumeCeiling
      );

      suggestions.push({
        soundId: riserSound.id,
        name: riserSound.name,
        type: 'riser',
        startTime,
        duration: riserSound.duration,
        volume,
        reason: `Build-up riser leading to climax emphasis at ${climax.time.toFixed(2)}s: “${climax.text}”`,
        cueTimestamp: climax.time,
      });
      lastRiserTime = climax.time;
    }
  }

  // Global sort by timeline timestamp and cap to max total
  suggestions.sort((a, b) => a.startTime - b.startTime);
  return suggestions.slice(0, maxTotal);
}

/**
 * Generate EditDecisions and MediaAssets for applying contextual SFX via sequentialEdit or autoEdit.
 */
export function createAutoSfxDecisions(
  project: EditorProject,
  options: AutoSfxOptions = {}
): {
  decisions: EditDecision[];
  assets: MediaAsset[];
  suggestions: SfxSuggestion[];
} {
  const suggestions = suggestContextualSfx(project, options);
  if (!suggestions.length) return { decisions: [], assets: [], suggestions: [] };

  // Find or target an unlocked audio track
  const audioTrack =
    project.trackOrder
      .map((id) => project.tracks[id])
      .find((t) => t.kind === 'audio' && !t.locked && !t.hidden) || project.tracks['track-audio'];

  const trackId = audioTrack ? audioTrack.id : 'track-audio';

  const assets: MediaAsset[] = [];
  const decisions: EditDecision[] = [];
  const seenAssets = new Set<string>();

  for (const sfx of suggestions) {
    const asset = getOrCreateSfxAsset(project, sfx.soundId);
    if (!seenAssets.has(asset.id) && !project.assets[asset.id]) {
      assets.push(asset);
      seenAssets.add(asset.id);
    }

    decisions.push({
      op: 'addClip',
      assetId: asset.id,
      trackId,
      startTime: Number(sfx.startTime.toFixed(3)),
      duration: sfx.duration,
      volume: clamp(sfx.volume, 0.08, 0.18),
      audioRole: 'sfx',
    });
  }

  return { decisions, assets, suggestions };
}

/**
 * Directly insert contextual SFX into an EditorProject document.
 */
export function applyContextualSfx(
  project: EditorProject,
  options: AutoSfxOptions = {}
): {
  project: EditorProject;
  placed: Clip[];
  suggestions: SfxSuggestion[];
} {
  const { decisions, assets, suggestions } = createAutoSfxDecisions(project, options);
  if (!decisions.length) {
    return { project, placed: [], suggestions: [] };
  }

  let next = assets.reduce((p, a) => addAsset(p, a), project);
  const placed: Clip[] = [];

  for (const d of decisions) {
    if (d.op === 'addClip') {
      const priorClipIds = new Set(Object.keys(next.clips));
      next = addClip(next, d.assetId, d.trackId, d.startTime, {
        duration: d.duration,
        volume: d.volume,
        audioRole: 'sfx',
      });
      const newClipId = Object.keys(next.clips).find((id) => !priorClipIds.has(id));
      if (newClipId) {
        placed.push(next.clips[newClipId]);
      }
    }
  }

  return { project: next, placed, suggestions };
}
