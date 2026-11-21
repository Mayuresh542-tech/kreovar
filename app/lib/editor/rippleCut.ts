import {anchorVisualTreatment} from './visualTreatment';
import {type Clip,type EditorProject,projectDuration,uid} from './model';

export const MAX_RIPPLE_CUT_RANGES = 150;

export interface CutRange {
  start: number;
  end: number;
}

export interface RippleCutOptions {
  /** Alternate zoom punch-in cadence on consecutive sliced segments (default: true) */
  alternateCadence?: boolean;
  /** Automatically apply 15ms-25ms micro-fades at cut boundaries to prevent digital clicks/pops (default: true) */
  applyMicroFades?: boolean;
  /** Micro-fade duration in seconds (default: 0.02s / 20ms, range: 0.015s to 0.025s) */
  microFadeDuration?: number;
  /** Scale for alternating punch-in cadence (default: 1.16x) */
  punchInScale?: number;
  /** Eye-line anchorY for cadence zoom (default: 0.36 -> focusY: -0.14) */
  punchInAnchorY?: number;
}

export function normalizedCuts(p: EditorProject, ranges: CutRange[]): CutRange[] {
  if (!Array.isArray(ranges) || !ranges.length || ranges.length > MAX_RIPPLE_CUT_RANGES) {
    throw Error(`Choose between 1 and ${MAX_RIPPLE_CUT_RANGES} cut ranges.`);
  }
  const fps = p.settings.fps;
  const duration = projectDuration(p);
  const sorted = ranges.map(r => {
    if (!Number.isFinite(r.start) || !Number.isFinite(r.end) || r.start < 0 || r.end > duration + 1e-6 || r.end <= r.start) {
      throw Error('Cut ranges must be inside the timeline.');
    }
    const start = Math.round(r.start * fps) / fps;
    const end = Math.min(duration, Math.round(r.end * fps) / fps);
    if (end - start < 1 / fps - 1e-6) throw Error('A cut must remove at least one frame.');
    return { start, end };
  }).sort((a, b) => a.start - b.start);

  const merged: CutRange[] = [];
  for (const r of sorted) {
    const last = merged.at(-1);
    if (last && r.start <= last.end + 1e-6) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }

  if (merged.reduce((sum, r) => sum + r.end - r.start, 0) >= duration - 1 / fps) {
    throw Error('Keep at least one frame of the project.');
  }
  return merged;
}

/**
 * Remove time globally across all tracks (video, audio, overlays, captions, text),
 * keeping all surviving tracks, time-locked clips, and word captions 100% aligned.
 */
export function rippleCut(
  p: EditorProject,
  ranges: CutRange[],
  options: RippleCutOptions = { alternateCadence: false, applyMicroFades: true }
): EditorProject {
  const cuts = normalizedCuts(p, ranges);
  const min = 1 / p.settings.fps;
  const shift = (t: number) => cuts.reduce((sum, r) => sum + Math.max(0, Math.min(t, r.end) - r.start), 0);
  const clips: Record<string, Clip> = {};
  const tracks = Object.fromEntries(Object.entries(p.tracks).map(([id, t]) => [id, { ...t, clipIds: [] as string[] }]));
  const captions = { ...p.captions };
  const textLayers = { ...p.textLayers };

  const microFade = Math.min(0.050, Math.max(0.005, options.microFadeDuration ?? 0.020)); // clamped 5ms-50ms linear micro-fade
  const applyMicro = options.applyMicroFades !== false;
  const punchScale = Math.min(2.0, Math.max(1.0, options.punchInScale ?? 1.16));
  const rawFocusY = options.punchInAnchorY !== undefined ? options.punchInAnchorY - 0.5 : -0.14;
  const focusY = Math.min(0.4, Math.max(-0.4, rawFocusY));

  for (const trackId of p.trackOrder) {
    for (const id of p.tracks[trackId].clipIds) {
      const c = p.clips[id];
      let segments = [{ start: c.startTime, end: c.startTime + c.duration }];
      for (const r of cuts) {
        segments = segments.flatMap(s =>
          r.end <= s.start || r.start >= s.end
            ? [s]
            : [
                ...(r.start > s.start ? [{ start: s.start, end: r.start }] : []),
                ...(r.end < s.end ? [{ start: r.end, end: s.end }] : [])
              ]
        );
      }

      const changed =
        segments.length !== 1 ||
        Math.abs((segments[0]?.start ?? 0) - c.startTime) > 1e-6 ||
        Math.abs((segments[0]?.end ?? 0) - (c.startTime + c.duration)) > 1e-6 ||
        shift(c.startTime) > 1e-6;

      if (changed && p.tracks[c.trackId].locked) {
        throw Error('Unlock every affected track before ripple cutting; audio and captions must stay aligned.');
      }
      if (!changed) {
        clips[id] = c;
        tracks[trackId].clipIds.push(id);
        continue;
      }
      if (segments.some(s => s.end - s.start < min - 1e-6)) {
        throw Error('This cut would leave a fragment shorter than one frame. Adjust the cut boundary.');
      }
      if (c.contentId) {
        delete captions[c.contentId];
        delete textLayers[c.contentId];
      }

      segments.forEach((s, index) => {
        const newId = index === 0 ? id : uid();
        const sourceStart = c.sourceStart + (s.start - c.startTime) * c.speed;
        const sourceEnd = c.sourceStart + (s.end - c.startTime) * c.speed;
        const contentId = c.contentId ? uid() : undefined;

        if (contentId && c.contentId) {
          const caption = p.captions[c.contentId];
          const text = p.textLayers[c.contentId];
          if (caption) {
            const originalWords = caption.words || [];
            const surviving = originalWords
              .map((w, origIdx) => ({ w, origIdx }))
              .filter(({ w }) => w.end > sourceStart && w.start < sourceEnd);

            // If this slice has timed words but none survived the silence cut, skip creating empty caption slice
            if (caption.words && caption.words.length > 0 && surviving.length === 0 && segments.length > 1) {
              return;
            }

            const words = surviving.map(({ w }) => ({
              ...w,
              start: Math.max(sourceStart, w.start),
              end: Math.min(sourceEnd, w.end)
            }));

            let studioData = caption.studioData;
            if (studioData) {
              const origToNew = new Map<number, number>();
              surviving.forEach(({ origIdx }, newIdx) => origToNew.set(origIdx, newIdx));
              const emphasizedWords = studioData.emphasizedWords
                ?.map(i => origToNew.get(i))
                .filter((i): i is number => i !== undefined);
              const wordStyles: Record<string, any> = {};
              if (studioData.wordStyles) {
                for (const [k, v] of Object.entries(studioData.wordStyles)) {
                  const newIdx = origToNew.get(Number(k));
                  if (newIdx !== undefined) wordStyles[String(newIdx)] = v;
                }
              }
              studioData = {
                ...studioData,
                ...(emphasizedWords !== undefined ? { emphasizedWords } : {}),
                ...(studioData.wordStyles ? { wordStyles } : {})
              };
            }

            captions[contentId] = {
              ...caption,
              id: contentId,
              ...(caption.words ? { words, text: words.map(w => w.word).join(' ') } : {}),
              ...(studioData ? { studioData } : {})
            };
          }
          if (text) textLayers[contentId] = { ...text, id: contentId };
        }

        const visual = anchorVisualTreatment(c);
        const isVideoFootage = p.tracks[trackId]?.kind === 'video' && c.assetId && p.assets[c.assetId]?.kind === 'video';
        const cadenceZoom =
          options.alternateCadence !== false &&
          isVideoFootage &&
          segments.length > 1 &&
          index % 2 === 1 &&
          !c.zooms?.length
            ? [
                {
                  sourceStart,
                  sourceEnd,
                  fromScale: punchScale,
                  toScale: punchScale,
                  returnToStart: false,
                  easing: 'smooth' as const,
                  focusX: 0,
                  focusY,
                  style: 'punch-in' as const
                }
              ]
            : undefined;

        // Micro-fades: 15ms-25ms linear fadeIn/fadeOut on cut boundaries to eliminate clicks/pops
        const isAudioTrack = p.tracks[trackId]?.kind === 'audio' || p.tracks[trackId]?.kind === 'video';
        const isSlicedStart = s.start > c.startTime + 1e-6;
        const isSlicedEnd = s.end < c.startTime + c.duration - 1e-6;

        const fadeIn = !isSlicedStart
          ? Math.min(c.fadeIn ?? 0, s.end - s.start)
          : (applyMicro && isAudioTrack ? Math.min(microFade, (s.end - s.start) / 2) : 0);

        const fadeOut = !isSlicedEnd
          ? Math.min(c.fadeOut ?? 0, s.end - s.start)
          : (applyMicro && isAudioTrack ? Math.min(microFade, (s.end - s.start) / 2) : 0);

        const clip: Clip = {
          ...c,
          ...(visual ? { visualTreatment: visual } : {}),
          ...(cadenceZoom ? { zooms: cadenceZoom } : {}),
          id: newId,
          ...(contentId ? { contentId } : {}),
          startTime: Math.max(0, s.start - shift(s.start)),
          duration: s.end - s.start,
          sourceStart,
          sourceEnd,
          fadeIn,
          fadeOut
        };
        clips[newId] = clip;
        tracks[trackId].clipIds.push(newId);
      });
    }
  }

  const transitions = Object.fromEntries(
    Object.entries(p.transitions).filter(([, t]) => {
      const a = clips[t.fromClipId];
      const b = clips[t.toClipId];
      const oldA = p.clips[t.fromClipId];
      const oldB = p.clips[t.toClipId];
      return (
        a &&
        b &&
        Math.abs(a.sourceEnd - oldA.sourceEnd) < 1e-6 &&
        Math.abs(b.sourceStart - oldB.sourceStart) < 1e-6 &&
        Math.abs(a.startTime + a.duration - b.startTime) < min &&
        t.duration <= Math.min(a.duration, b.duration)
      );
    })
  );

  return { ...p, clips, tracks, captions, textLayers, transitions };
}
