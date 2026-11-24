import { canPlace, type EditorProject, type Clip, dimensions } from './model';
import type { EditDecision } from './ai';
import type { AiToolRequest } from './aiTools';
import type { EditingConstraints } from './editingIntent';
import { matchPhraseToSpeech, type SpeechSegmentLike } from './phraseMatcher';
import { type KenBurnsPreset } from './kenBurns';
import { detectKeywordMoments } from './kineticStickers';

export interface ReconciliationResult {
  decisions: EditDecision[];
  toolRequests: AiToolRequest[];
  summaryNotes: string[];
}

function getAllSpeechWords(speech?: SpeechSegmentLike[]): Array<{ word: string; start: number; end: number }> {
  if (!speech) return [];
  const list: Array<{ word: string; start: number; end: number }> = [];
  for (const seg of speech) {
    if (seg.words && seg.words.length > 0) {
      list.push(...seg.words);
    } else if (seg.start !== undefined && seg.end !== undefined) {
      list.push({ word: seg.text || '', start: seg.start, end: seg.end });
    }
  }
  return list.sort((a, b) => a.start - b.start);
}

function snapZoomResetToWordOrGap(t: number, words: Array<{ word: string; start: number; end: number }>, minTime: number): number {
  if (!words.length) return Math.max(minTime, t);
  const inside = words.find(w => t >= w.start - 0.02 && t <= w.end + 0.02);
  if (inside) return Math.max(minTime, inside.end);
  const preceding = words.filter(w => w.end <= t).at(-1);
  if (preceding && t - preceding.end < 0.35) return Math.max(minTime, preceding.end);
  return Math.max(minTime, t);
}

function findNaturalSentenceOrPauseEnd(startTime: number, words: Array<{ word: string; start: number; end: number }>, maxDuration = 3.5, minHold = 2.0): number {
  const targetMin = startTime + minHold;
  const targetMax = startTime + maxDuration;
  if (!words.length) return targetMin;
  for (let i = 0; i < words.length - 1; i++) {
    const w = words[i];
    const nextW = words[i + 1];
    if (w.end >= targetMin) {
      const isSentenceEnd = /[.!?]$/.test(w.word.trim());
      const isPause = nextW.start - w.end >= 0.25;
      if (isSentenceEnd || isPause || w.end >= targetMax) {
        return w.end;
      }
    }
  }
  const last = words.filter(w => w.end >= targetMin).at(0);
  return last ? last.end : targetMin;
}

/**
 * Reconciles model decisions against active timeline elements, negative constraints,
 * and temporal bounds. Guarantees in-place mutations without duplicate layer stacking.
 */
export function reconcileEditingDecisions(
  project: EditorProject,
  decisions: EditDecision[],
  toolRequests: AiToolRequest[] = [],
  constraints?: EditingConstraints,
  speech?: SpeechSegmentLike[],
  detectedSilences?: Array<{ start: number; end: number; duration: number; source?: string }>
): ReconciliationResult {
  const summaryNotes: string[] = [];
  let reconciledDecisions: EditDecision[] = [...decisions];
  let reconciledTools: AiToolRequest[] = [...toolRequests];
  const allWords = getAllSpeechWords(speech);

  // 1. In-Place Caption Reconciliation (Duplicate Prevention)
  const existingCaptionClips = Object.values(project.clips).filter(
    c => c.contentId && project.captions[c.contentId] && !project.tracks[c.trackId]?.hidden
  );

  const addCaptionDecisions = reconciledDecisions.filter(d => d.op === 'addCaption');
  if (existingCaptionClips.length > 0 && addCaptionDecisions.length > 0) {
    // Redundant transcription detected: restyle existing captions in-place!
    const targetTemplateId = (addCaptionDecisions[0] as { templateId?: string }).templateId || 'viral-hinglish-pop';
    const existingClipIds = existingCaptionClips.map(c => c.id);

    // Strip addCaption operations
    reconciledDecisions = reconciledDecisions.filter(d => d.op !== 'addCaption');

    // Add applyCaptionTemplate if not already present
    if (!reconciledDecisions.some(d => d.op === 'applyCaptionTemplate')) {
      reconciledDecisions.unshift({
        op: 'applyCaptionTemplate',
        clipIds: existingClipIds,
        templateId: targetTemplateId
      });
      summaryNotes.push(`Restyled ${existingClipIds.length} existing captions in-place.`);
    }

    // Filter out captions tool requests
    reconciledTools = reconciledTools.filter(r => r.type !== 'captions');
  }

  // 1b. Explicit Caption Preset Switch & Zero-Hallucination Guardrail
  if ((constraints?.requestedCaptionPreset || constraints?.requestedCaptionStudio) && existingCaptionClips.length > 0) {
    const existingClipIds = existingCaptionClips.map(c => c.id);
    const targetPreset = constraints.requestedCaptionPreset || 'study-hormozi-style';
    reconciledDecisions = reconciledDecisions.filter(d => d.op !== 'applyCaptionTemplate' && d.op !== 'addCaption');
    // Strip manual changeText styling overrides on caption clips
    reconciledDecisions = reconciledDecisions.filter(d => !(d.op === 'changeText' && existingClipIds.includes(d.clipId)));
    reconciledDecisions.unshift({
      op: 'applyCaptionTemplate',
      clipIds: existingClipIds,
      templateId: targetPreset
    });
    reconciledTools = reconciledTools.filter(r => r.type !== 'captions');
    summaryNotes.push(`Applied Caption Studio template ${targetPreset} to ${existingClipIds.length} captions.`);
  } else if ((constraints?.requestedCaptionPreset || constraints?.requestedCaptionStudio) && reconciledTools.some(r => r.type === 'captions')) {
    const targetPreset = constraints.requestedCaptionPreset || 'study-hormozi-style';
    reconciledTools = reconciledTools.map(r =>
      r.type === 'captions' ? { ...r, templateId: targetPreset } : r
    );
  }

  // 1c. Zero-Hallucinated Text Guardrail (Block arbitrary floating summary text)
  if (constraints?.requestedFloatingSummaryText) {
    reconciledDecisions = reconciledDecisions.filter(d => d.op !== 'addText');
    if (existingCaptionClips.length > 0) {
      const existingClipIds = existingCaptionClips.map(c => c.id);
      if (!reconciledDecisions.some(d => d.op === 'applyCaptionTemplate')) {
        reconciledDecisions.unshift({
          op: 'applyCaptionTemplate',
          clipIds: existingClipIds,
          templateId: 'study-hormozi-style'
        });
      }
    } else if (!reconciledTools.some(r => r.type === 'captions')) {
      const firstFootage = Object.values(project.clips).find(c => c.assetId && project.assets[c.assetId]?.kind === 'video');
      if (firstFootage) {
        reconciledTools.push({ type: 'captions', clipId: firstFootage.id, templateId: 'study-hormozi-style' });
      }
    }
    summaryNotes.push('Zero-hallucination guardrail active: Floating summary text blocked. Spoken dialogue bound to caption template instead.');
  }

  // Preserve manual titles and AI addText decisions, removing only if explicitly flagged as an invalid hallucination
  reconciledDecisions = reconciledDecisions.filter(d => {
    if (d.op === 'addText' && (d as { invalidHallucination?: boolean }).invalidHallucination) {
      return false;
    }
    return true;
  });

  // 2. Negative Constraints & Selective Removals
  if (constraints) {
    if (constraints.disallowedAudio) {
      reconciledDecisions = reconciledDecisions.filter(d => {
        if (d.op === 'setAudioDucking') return false;
        if (d.op === 'addClip') {
          const track = project.tracks[d.trackId];
          if (track?.kind === 'audio' || d.audioRole === 'sfx') return false;
        }
        if (d.op === 'changeClipProperty' && (d.changes?.volume !== undefined || d.changes?.ducking !== undefined)) return false;
        return true;
      });
      reconciledTools = reconciledTools.filter(r => r.type !== 'sfx');
      summaryNotes.push('Preserved audio untouched (negative audio constraint).');
    } else if (constraints.disallowedSfx) {
      reconciledDecisions = reconciledDecisions.filter(d => {
        if (d.op === 'addClip' && (d.audioRole === 'sfx' || project.tracks[d.trackId]?.kind === 'audio')) return false;
        return true;
      });
      reconciledTools = reconciledTools.filter(r => r.type !== 'sfx');
    }

    if (constraints.disallowedCuts) {
      reconciledDecisions = reconciledDecisions.filter(d => !['rippleCut', 'trimClip', 'splitClip'].includes(d.op));
      summaryNotes.push('Preserved dialogue and framing without cuts.');
    }

    if (constraints.disallowedBroll) {
      reconciledDecisions = reconciledDecisions.filter(d => {
        if (d.op === 'addClip') {
          const track = project.tracks[d.trackId];
          if (track?.kind === 'overlay' || track?.kind === 'image') return false;
        }
        return true;
      });
      reconciledTools = reconciledTools.filter(r => r.type !== 'broll' && r.type !== 'motion');
    }

    if (constraints.disallowedZooms) {
      reconciledDecisions = reconciledDecisions.filter(d => d.op !== 'addZoom');
    }

    // Selective Zoom Removal
    if (constraints.removeZooms) {
      reconciledDecisions = reconciledDecisions.filter(d => d.op !== 'addZoom');
      for (const clip of Object.values(project.clips)) {
        if (clip.zooms && clip.zooms.length > 0 && !project.tracks[clip.trackId]?.locked) {
          if (!reconciledDecisions.some(d => d.op === 'clearZooms' && d.clipId === clip.id)) {
            reconciledDecisions.push({ op: 'clearZooms', clipId: clip.id });
          }
        }
      }
      summaryNotes.push('Cleared existing zooms on video clips.');
    }

    // Selective SFX Removal
    if (constraints.removeSfx) {
      reconciledDecisions = reconciledDecisions.filter(d => !(d.op === 'addClip' && d.audioRole === 'sfx'));
      reconciledTools = reconciledTools.filter(r => r.type !== 'sfx');
      for (const clip of Object.values(project.clips)) {
        const track = project.tracks[clip.trackId];
        if (track?.kind === 'audio' && clip.audioRole === 'sfx' && !track.locked) {
          if (!reconciledDecisions.some(d => d.op === 'removeClip' && d.clipId === clip.id)) {
            reconciledDecisions.push({ op: 'removeClip', clipId: clip.id });
          }
        }
      }
      summaryNotes.push('Removed existing sound effects from timeline.');
    }

    // Selective B-roll Removal
    if (constraints.removeBroll) {
      reconciledDecisions = reconciledDecisions.filter(d => !(d.op === 'addClip' && ['overlay','image'].includes(project.tracks[d.trackId]?.kind)));
      reconciledTools = reconciledTools.filter(r => r.type !== 'broll' && r.type !== 'motion');
      for (const clip of Object.values(project.clips)) {
        const track = project.tracks[clip.trackId];
        if (['overlay','image'].includes(track?.kind) && !track.locked) {
          if (!reconciledDecisions.some(d => d.op === 'removeClip' && d.clipId === clip.id)) {
            reconciledDecisions.push({ op: 'removeClip', clipId: clip.id });
          }
        }
      }
      summaryNotes.push('Removed B-roll overlays from timeline.');
    }

    // Silence & Pause Trimming (detectedSilences or >0.40s word gaps into consolidated rippleCut with cadence alternation)
    if (constraints.requestedSilenceCut && !constraints.disallowedCuts) {
      if (!reconciledDecisions.some(d => d.op === 'rippleCut')) {
        let rawRanges: Array<{ start: number; end: number }> = [];

        if (detectedSilences && detectedSilences.length > 0) {
          rawRanges = detectedSilences.map(s => ({ start: s.start, end: s.end }));
        } else if (speech && speech.length > 0) {
          for (let i = 0; i < allWords.length - 1; i++) {
            const gap = allWords[i + 1].start - allWords[i].end;
            if (gap > 0.40) {
              rawRanges.push({ start: allWords[i].end, end: allWords[i + 1].start });
            }
          }
        }

        // Filter out ranges that overlap protected intervals
        const validRanges = rawRanges.filter(r =>
          !constraints.protectedIntervals?.some(p => r.start < p.end && r.end > p.start)
        );

        if (validRanges.length > 0) {
          // Consolidate overlapping / adjacent ranges
          const consolidated: Array<{ start: number; end: number }> = [];
          for (const r of validRanges) {
            if (!consolidated.length) {
              consolidated.push({ ...r });
            } else {
              const last = consolidated[consolidated.length - 1];
              if (r.start <= last.end + 0.05) {
                last.end = Math.max(last.end, r.end);
              } else {
                consolidated.push({ ...r });
              }
            }
          }

          reconciledDecisions.push({ op: 'rippleCut', ranges: consolidated });
          const sourceLabel = (detectedSilences && detectedSilences.length > 0) ? 'measured acoustic silence interval(s)' : 'awkward speech pause(s) (>0.40s)';
          summaryNotes.push(`Trimmed ${consolidated.length} ${sourceLabel} into consolidated rippleCut with cadence alternation.`);
        } else {
          summaryNotes.push('No silent gaps > 0.4s detected; kept original clip timing intact.');
        }
      } else if (!reconciledDecisions.some(d => d.op === 'rippleCut')) {
        summaryNotes.push('No silent gaps > 0.4s detected; kept original clip timing intact.');
      }
    }

    // Custom Caption Styling (colors, size, position, weight)
    if (constraints.requestedCaptionStyling && existingCaptionClips.length > 0) {
      for (const clip of existingCaptionClips) {
        const existing = reconciledDecisions.find(d => d.op === 'composeCaption' && d.clipId === clip.id);
        if (existing && existing.op === 'composeCaption') {
          existing.presentation = { ...existing.presentation, ...constraints.requestedCaptionStyling };
        } else {
          reconciledDecisions.push({
            op: 'composeCaption',
            clipId: clip.id,
            presentation: { ...constraints.requestedCaptionStyling }
          });
        }
      }
      summaryNotes.push('Applied custom caption styling (colors, size, and position) in-place.');
    }

    // Audio Ducking
    if (constraints.requestedAudioDucking !== undefined) {
      reconciledDecisions = reconciledDecisions.filter(d => d.op !== 'setAudioDucking');
      reconciledDecisions.unshift({ op: 'setAudioDucking', enabled: constraints.requestedAudioDucking });
      summaryNotes.push(constraints.requestedAudioDucking ? 'Enabled automatic audio ducking.' : 'Disabled audio ducking.');
    }

    // Aspect Ratio
    if (constraints.requestedAspectRatio) {
      reconciledDecisions = reconciledDecisions.filter(d => d.op !== 'setAspectRatio');
      reconciledDecisions.unshift({ op: 'setAspectRatio', aspectRatio: constraints.requestedAspectRatio });
      summaryNotes.push(`Changed aspect ratio to ${constraints.requestedAspectRatio}.`);
    }

    // Smart Reframing (fit-with-blur, center-crop, split-screen)
    if (constraints.requestedReframeMode) {
      reconciledDecisions = reconciledDecisions.filter(d => d.op !== 'reframeProject');
      reconciledDecisions.unshift({ op: 'reframeProject', mode: constraints.requestedReframeMode });
      summaryNotes.push(`Applied smart reframing (${constraints.requestedReframeMode}) to adapt project layout.`);
    }

    // Speed adjustments (0.1x to 10x with pitch preservation)
    if (constraints.requestedSpeed) {
      const targetClips = Object.values(project.clips).filter(c => {
        const track = project.tracks[c.trackId];
        return track && !track.locked && ['video', 'overlay', 'image'].includes(track.kind);
      });
      for (const clip of targetClips) {
        const existingIdx = reconciledDecisions.findIndex(d => d.op === 'changeClipProperty' && d.clipId === clip.id);
        const changes = {
          speed: Math.min(10, Math.max(0.1, constraints.requestedSpeed.multiplier)),
          preservePitch: constraints.requestedSpeed.preservePitch ?? true,
        };
        if (existingIdx >= 0) {
          const existing = reconciledDecisions[existingIdx] as Extract<EditDecision, { op: 'changeClipProperty' }>;
          existing.changes = { ...existing.changes, ...changes };
        } else {
          reconciledDecisions.push({ op: 'changeClipProperty', clipId: clip.id, changes });
        }
      }
      if (targetClips.length > 0) {
        summaryNotes.push(`Adjusted playback speed to ${constraints.requestedSpeed.multiplier}x (pitch preserved) on ${targetClips.length} clip(s).`);
      }
    }

    // Volume & Audio level adjustments (0% to 200%, dB scaling)
    if (constraints.requestedVolume) {
      const isMute = constraints.requestedVolume.mute || constraints.requestedVolume.level === 0;
      const targetClips = Object.values(project.clips).filter(c => {
        const track = project.tracks[c.trackId];
        return track && !track.locked && (track.kind === 'audio' || c.volume > 0);
      });
      for (const clip of targetClips) {
        const existingIdx = reconciledDecisions.findIndex(d => d.op === 'changeClipProperty' && d.clipId === clip.id);
        const changes: Record<string, unknown> = {};
        if (constraints.requestedVolume.level !== undefined) {
          changes.volume = Math.min(2, Math.max(0, constraints.requestedVolume.level));
        }
        if (constraints.requestedVolume.fadeIn !== undefined) {
          changes.fadeIn = Math.min(clip.duration, constraints.requestedVolume.fadeIn);
        }
        if (constraints.requestedVolume.fadeOut !== undefined) {
          changes.fadeOut = Math.min(clip.duration, constraints.requestedVolume.fadeOut);
        }
        if (Object.keys(changes).length > 0) {
          if (existingIdx >= 0) {
            const existing = reconciledDecisions[existingIdx] as Extract<EditDecision, { op: 'changeClipProperty' }>;
            existing.changes = { ...existing.changes, ...changes };
          } else {
            reconciledDecisions.push({ op: 'changeClipProperty', clipId: clip.id, changes });
          }
        }
      }
      if (targetClips.length > 0) {
        summaryNotes.push(isMute ? 'Muted audio tracks.' : `Adjusted audio levels on ${targetClips.length} clip(s).`);
      }
    }

    // Transform, Positioning & Scale adjustments
    if (constraints.requestedTransform) {
      const targetClips = Object.values(project.clips).filter(c => {
        const track = project.tracks[c.trackId];
        return track && !track.locked && ['video', 'overlay', 'image'].includes(track.kind);
      });
      for (const clip of targetClips) {
        const existingIdx = reconciledDecisions.findIndex(d => d.op === 'changeClipProperty' && d.clipId === clip.id);
        const currentTransform = clip.transform || { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
        const newTransform = constraints.requestedTransform.reset
          ? { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }
          : {
              ...currentTransform,
              ...(constraints.requestedTransform.scale !== undefined ? { scale: constraints.requestedTransform.scale } : {}),
              ...(constraints.requestedTransform.x !== undefined ? { x: constraints.requestedTransform.x } : {}),
              ...(constraints.requestedTransform.y !== undefined ? { y: constraints.requestedTransform.y } : {}),
              ...(constraints.requestedTransform.rotation !== undefined ? { rotation: constraints.requestedTransform.rotation } : {}),
            };
        if (existingIdx >= 0) {
          const existing = reconciledDecisions[existingIdx] as Extract<EditDecision, { op: 'changeClipProperty' }>;
          existing.changes = { ...existing.changes, transform: newTransform };
        } else {
          reconciledDecisions.push({ op: 'changeClipProperty', clipId: clip.id, changes: { transform: newTransform } });
        }
      }
      if (targetClips.length > 0) {
        summaryNotes.push(constraints.requestedTransform.reset ? 'Reset transform to default framing.' : `Updated transform framing on ${targetClips.length} clip(s).`);
      }
    }

    // Dynamic Ken Burns Motion Presets for B-roll & Overlays
    if (constraints.requestedKenBurns) {
      const brollClips = Object.values(project.clips).filter(c => {
        const track = project.tracks[c.trackId];
        if (!track || track.locked) return false;
        const asset = c.assetId ? project.assets[c.assetId] : undefined;
        if (!asset || !['video', 'image'].includes(asset.kind)) return false;
        return (
          ['overlay', 'image'].includes(track.kind) ||
          (c.volume === 0 && track.kind !== 'video') ||
          asset.stockKey?.startsWith('broll:')
        );
      }).sort((a, b) => a.startTime - b.startTime);

      const presets: KenBurnsPreset[] = ['ken-burns-push', 'ken-burns-pan-left', 'ken-burns-pull', 'ken-burns-pan-right'];
      const targetPreset = typeof constraints.requestedKenBurns === 'string' ? (`ken-burns-${constraints.requestedKenBurns}` as KenBurnsPreset) : undefined;

      let appliedCount = 0;
      brollClips.forEach((clip, index) => {
        const preset = targetPreset || presets[index % presets.length];
        const mediaAnimation = {
          entrance: preset,
          exit: (clip.mediaAnimation?.exit && clip.mediaAnimation.exit !== 'none') ? clip.mediaAnimation.exit : 'fade',
          loop: clip.mediaAnimation?.loop ?? 'none',
          entranceDuration: 0.5,
          exitDuration: 0.5,
          loopDuration: 2,
          easing: 'smooth' as const,
          kenBurns: preset
        };

        const existingIdx = reconciledDecisions.findIndex(d => d.op === 'changeClipProperty' && d.clipId === clip.id);
        if (existingIdx >= 0) {
          const existing = reconciledDecisions[existingIdx] as Extract<EditDecision, { op: 'changeClipProperty' }>;
          existing.changes = { ...existing.changes, mediaAnimation };
        } else {
          reconciledDecisions.push({
            op: 'changeClipProperty',
            clipId: clip.id,
            changes: { mediaAnimation }
          });
        }
        appliedCount++;
      });

      if (appliedCount > 0) {
        summaryNotes.push(`Applied dynamic Ken Burns motion presets (${targetPreset || 'alternating push/pull/pan'}) to ${appliedCount} B-roll clip(s).`);
      } else {
        summaryNotes.push('No B-roll clips found on timeline for Ken Burns motion.');
      }
    }

    // Animated Kinetic Emojis & Keyword Stickers from Speech Context
    if (constraints.requestedKineticStickers) {
      const moments = detectKeywordMoments(allWords, { maxStickers: 6, minInterval: 1.5 });
      if (moments.length > 0) {
        let textTrack = Object.values(project.tracks).find(t => t.kind === 'text' && !t.locked && !t.hidden);
        let stickerCount = 0;
        moments.forEach(m => {
          const collides = Object.values(project.clips).some(c =>
            c.trackId === textTrack?.id && Math.abs(c.startTime - m.startTime) < 0.6
          );
          if (!collides) {
            reconciledDecisions.push({
              op: 'addGraphic',
              kind: 'callout',
              text: `${m.sticker.emoji} ${m.cleanWord.toUpperCase()}`,
              startTime: m.startTime,
              duration: m.duration,
              accent: m.sticker.accentColor,
              motion: 'pop'
            });
            stickerCount++;
          }
        });

        if (stickerCount > 0) {
          const emojis = moments.slice(0, stickerCount).map(m => m.sticker.emoji).join(' ');
          summaryNotes.push(`Placed ${stickerCount} animated kinetic keyword sticker(s) (${emojis}) timed to spoken punch moments.`);
        }
      } else {
        summaryNotes.push('No keyword punch moments detected in speech for kinetic stickers.');
      }
    }

    // Protected Temporal Intervals
    if (constraints.protectedIntervals && constraints.protectedIntervals.length > 0) {
      reconciledDecisions = reconciledDecisions.filter(d => {
        const opTime = 'startTime' in d && typeof d.startTime === 'number' ? d.startTime : 'time' in d && typeof d.time === 'number' ? d.time : undefined;
        if (opTime !== undefined) {
          return !constraints.protectedIntervals.some(p => opTime >= p.start && opTime < p.end);
        }
        if (d.op === 'rippleCut') {
          // Filter cuts that fall within protected intervals
          d.ranges = [...d.ranges].filter(r => !constraints.protectedIntervals.some(p => r.start < p.end && r.end > p.start));
          return d.ranges.length > 0;
        }
        return true;
      });
    }

    // Semantic Phrase Anchoring
    if (constraints.phraseQuotes && constraints.phraseQuotes.length > 0 && speech && speech.length > 0) {
      for (const phrase of constraints.phraseQuotes) {
        const match = matchPhraseToSpeech(phrase, speech);
        if (match) {
          let zoomUpdated = false;
          for (const d of reconciledDecisions) {
            if (d.op === 'addZoom') {
              d.startTime = match.start;
              const naturalEnd = findNaturalSentenceOrPauseEnd(match.start, allWords, 3.5, 2.0);
              d.endTime = Math.max(naturalEnd, match.end);
              d.style = 'punch-in';
              d.fromScale = 1.0;
              d.toScale = 1.18;
              d.returnToStart = true;
              d.focusY = -0.14;
              const currentClip = project.clips[d.clipId];
              const isVideoClip = currentClip && (currentClip.trackId === 'track-video' || project.tracks[currentClip.trackId]?.kind === 'video' || project.tracks[currentClip.trackId]?.kind === 'image');
              const fitsCurrent = isVideoClip && currentClip.startTime <= match.start && (currentClip.startTime + currentClip.duration) >= match.end;
              if (!fitsCurrent) {
                const videoClip = Object.values(project.clips).find(
                  c => (c.trackId === 'track-video' || project.tracks[c.trackId]?.kind === 'video' || project.tracks[c.trackId]?.kind === 'image') &&
                       c.startTime <= match.start && (c.startTime + c.duration) >= match.end
                );
                if (videoClip) {
                  d.clipId = videoClip.id;
                  d.endTime = Math.min(videoClip.startTime + videoClip.duration, d.endTime);
                }
              }
              zoomUpdated = true;
              break;
            }
          }
          if (!zoomUpdated && !constraints.disallowedZooms) {
            const videoClip = Object.values(project.clips).find(
              c => (c.trackId === 'track-video' || project.tracks[c.trackId]?.kind === 'video' || project.tracks[c.trackId]?.kind === 'image') &&
                   c.startTime <= match.start && (c.startTime + c.duration) >= match.end
            );
            if (videoClip) {
              const naturalEnd = findNaturalSentenceOrPauseEnd(match.start, allWords, 3.5, 2.0);
              reconciledDecisions.push({
                op: 'addZoom',
                clipId: videoClip.id,
                startTime: match.start,
                endTime: Math.min(videoClip.startTime + videoClip.duration, Math.max(naturalEnd, match.end)),
                fromScale: 1.0,
                toScale: 1.18,
                returnToStart: true,
                easing: 'smooth',
                style: 'punch-in',
                focusX: 0,
                focusY: -0.14
              });
              summaryNotes.push(`Anchored punch zoom to phrase "${phrase}".`);
            }
          }
        }
      }
    }
  }

  // 3. Defensive Sanitization and Healing of Decisions against project timeline
  reconciledDecisions = reconciledDecisions.filter(d => {
    switch (d.op) {
      case 'addClip': {
        const asset = project.assets[d.assetId];
        if (!asset) return false;
        let track = project.tracks[d.trackId];
        if (!track || !canPlace(track.kind, asset.kind) || track.locked) {
          const validTrack = Object.values(project.tracks).find(
            t => !t.locked && canPlace(t.kind, asset.kind)
          );
          if (validTrack) {
            d.trackId = validTrack.id;
          } else {
            return false;
          }
        }
        if (asset.kind !== 'image' && d.duration !== undefined && d.duration > asset.duration + 0.01) {
          d.duration = asset.duration;
        }
        return true;
      }
      case 'addZoom': {
        let clip = project.clips[d.clipId];
        const isValidVisualClip = (c: Clip | undefined) => {
          if (!c) return false;
          const t = project.tracks[c.trackId];
          return Boolean(t && !t.locked && (t.kind === 'video' || t.kind === 'overlay' || t.kind === 'image'));
        };
        if (!isValidVisualClip(clip)) {
          const fallbackClip = Object.values(project.clips).find(c => isValidVisualClip(c));
          if (fallbackClip) {
            d.clipId = fallbackClip.id;
            clip = fallbackClip;
          } else {
            return false;
          }
        }
        if (typeof d.fromScale !== 'number' || !Number.isFinite(d.fromScale)) d.fromScale = 1.0;
        if (typeof d.toScale !== 'number' || !Number.isFinite(d.toScale)) d.toScale = 1.18;
        d.fromScale = Math.max(1.0, Math.min(1.25, d.fromScale));
        d.toScale = Math.max(1.0, Math.min(1.25, d.toScale));

        if (!d.style) d.style = 'punch-in';
        if (d.focusY === undefined || d.focusY === 0) d.focusY = -0.14; // Eye-line upper-third anchor (anchorY = 0.36)

        if (d.startTime === undefined || !Number.isFinite(d.startTime)) d.startTime = clip.startTime;

        if (d.style === 'punch-in') {
          d.fromScale = 1.0;
          d.returnToStart = true;
          const naturalEnd = findNaturalSentenceOrPauseEnd(d.startTime, allWords, 3.5, 2.0);
          d.endTime = Math.min(clip.startTime + clip.duration, naturalEnd);
        } else if (d.style === 'snap-in') {
          d.fromScale = 1.0;
          d.toScale = Math.max(1.18, Math.min(1.22, d.toScale));
          d.returnToStart = true;
          const naturalEnd = findNaturalSentenceOrPauseEnd(d.startTime, allWords, 3.5, 2.0);
          d.endTime = Math.min(clip.startTime + clip.duration, naturalEnd);
          if (!constraints?.disallowedSfx && !constraints?.disallowedAudio) {
            const hasWhoosh = reconciledTools.some(r => r.type === 'sfx' && Math.abs(r.startTime - d.startTime) < 0.5);
            if (!hasWhoosh) {
              const audioTrack = Object.values(project.tracks).find(t => t.kind === 'audio' && !t.locked);
              if (audioTrack) {
                reconciledTools.push({
                  type: 'sfx',
                  soundId: 'fast-swish',
                  trackId: audioTrack.id,
                  startTime: d.startTime,
                  duration: 0.35,
                  volume: 0.12
                });
              }
            }
          }
        } else if (d.style === 'smooth-push') {
          const naturalEnd = findNaturalSentenceOrPauseEnd(d.startTime, allWords, 5.0, 3.0);
          d.endTime = Math.min(clip.startTime + clip.duration, naturalEnd);
          d.returnToStart = true;
        } else {
          d.endTime = snapZoomResetToWordOrGap(d.endTime ?? (d.startTime + 2.0), allWords, d.startTime + 0.8);
          d.endTime = Math.min(clip.startTime + clip.duration, d.endTime);
        }

        if (d.endTime <= d.startTime) {
          d.endTime = Math.min(clip.startTime + clip.duration, d.startTime + 2.0);
        }
        return true;
      }
      case 'clearZooms':
      case 'removeClip':
      case 'duplicateClip':
      case 'trimClip':
      case 'splitClip':
      case 'changeClipProperty':
      case 'keyframes':
      case 'animate':
      case 'setVisualTreatment': {
        const clip = project.clips[d.clipId];
        return Boolean(!clip || !project.tracks[clip.trackId]?.locked);
      }
      case 'composeCaption': {
        const clip = project.clips[d.clipId];
        return Boolean(clip && clip.contentId && project.captions[clip.contentId] && !project.tracks[clip.trackId]?.locked);
      }
      case 'applyCaptionTemplate': {
        d.clipIds = (d.clipIds || []).filter(id => {
          const clip = project.clips[id];
          return Boolean(clip && clip.contentId && project.captions[clip.contentId] && !project.tracks[clip.trackId]?.locked);
        });
        return d.clipIds.length > 0;
      }
      case 'changeText': {
        const clip = project.clips[d.clipId];
        return Boolean(!clip || !project.tracks[clip.trackId]?.locked);
      }
      case 'mergeCaptions': {
        d.clipIds = (d.clipIds || []).filter(id => {
          const clip = project.clips[id];
          return Boolean(clip && clip.contentId && project.captions[clip.contentId] && !project.tracks[clip.trackId]?.locked);
        });
        return d.clipIds.length >= 2;
      }
      case 'addOverlay': {
        const asset = project.assets[d.assetId];
        if (!asset) return false;
        let track = project.tracks[d.trackId];
        if (!track || !canPlace(track.kind, asset.kind) || track.locked) {
          const validTrack = Object.values(project.tracks).find(
            t => !t.locked && canPlace(t.kind, asset.kind)
          );
          if (validTrack) d.trackId = validTrack.id;
          else return false;
        }
        return true;
      }
      case 'addTransition': {
        const from = project.clips[d.fromClipId];
        const to = project.clips[d.toClipId];
        if (!from || !to || from.trackId !== to.trackId || project.tracks[from.trackId]?.locked) return false;
        return true;
      }
      case 'changeTrack': {
        const track = project.tracks[d.trackId];
        return Boolean(track && !track.locked);
      }
      case 'applyTextPlacement': {
        d.clipIds = (d.clipIds || []).filter(id => {
          const clip = project.clips[id];
          return Boolean(clip && !project.tracks[clip.trackId]?.locked);
        });
        return d.clipIds.length > 0;
      }
      default:
        return true;
    }
  });

  // 4. Defensive Sanitization of Tool Requests
  reconciledTools = reconciledTools.filter(r => {
    if (r.type === 'captions') {
      const hasCaptionTrack = Object.values(project.tracks).some(t => t.kind === 'caption' && !t.locked);
      if (!hasCaptionTrack) return false;
      const validClips = Object.values(project.clips).filter(c => {
        const a = c.assetId ? project.assets[c.assetId] : undefined;
        return c && a && a.kind !== 'image' && !project.tracks[c.trackId]?.locked;
      });
      if (!validClips.length) return false;
      if ('clipId' in r && typeof r.clipId === 'string') {
        const clip = project.clips[r.clipId];
        const a = clip?.assetId ? project.assets[clip.assetId] : undefined;
        if (!clip || !a || a.kind === 'image' || project.tracks[clip.trackId]?.locked) {
          r.clipId = validClips[0].id;
        }
      }
      return true;
    }
    const kind = (r.type === 'sfx' || r.type === 'voiceover') ? 'audio' : r.type === 'image' ? 'image' : 'video';
    const placement = r as { trackId?: string };
    if (placement.trackId) {
      let track = project.tracks[placement.trackId];
      if (!track || track.locked || !canPlace(track.kind, kind)) {
        const validTrack = Object.values(project.tracks).find(t => !t.locked && canPlace(t.kind, kind));
        if (validTrack) {
          placement.trackId = validTrack.id;
        } else {
          return false;
        }
      }
    }
    return true;
  });

  // 5. Cadence & Anti-Bounce Rules: Enforce >= 2.2s cooldown between consecutive zooms & forbid paired bounce within 2.5s
  let lastZoomStart = -999;
  const validZooms: EditDecision[] = [];
  const nonZooms: EditDecision[] = [];
  const zoomsOnly = (reconciledDecisions.filter(d => d.op === 'addZoom') as Array<Extract<EditDecision, { op: 'addZoom' }>>)
    .sort((a, b) => a.startTime - b.startTime);
  for (const z of zoomsOnly) {
    if (z.startTime >= lastZoomStart + 2.2) {
      lastZoomStart = z.startTime;
      validZooms.push(z);
    }
  }
  for (const d of reconciledDecisions) {
    if (d.op !== 'addZoom') nonZooms.push(d);
  }
  reconciledDecisions = [...nonZooms, ...validZooms];

  // Guarantee Reconciler Invariant:
  // EXACTLY ONE single consolidated rippleCut decision placed at the very end of decisions array
  // (after phraseQuotes/addZoom, captions, and B-roll decisions), as required by aiValidation.
  const nonRippleCuts = reconciledDecisions.filter(d => d.op !== 'rippleCut');
  const rippleCuts = reconciledDecisions.filter(d => d.op === 'rippleCut') as Array<Extract<EditDecision, { op: 'rippleCut' }>>;
  if (rippleCuts.length > 0) {
    const rawRanges = rippleCuts.flatMap(rc => Array.isArray(rc.ranges) ? rc.ranges : []);
    const validRanges = rawRanges
      .filter(r => typeof r.start === 'number' && typeof r.end === 'number' && r.end > r.start)
      .sort((a, b) => a.start - b.start);
    const consolidated: Array<{ start: number; end: number }> = [];
    for (const r of validRanges) {
      if (!consolidated.length) {
        consolidated.push({ start: r.start, end: r.end });
      } else {
        const last = consolidated[consolidated.length - 1];
        if (r.start <= last.end + 0.02) {
          last.end = Math.max(last.end, r.end);
        } else {
          consolidated.push({ start: r.start, end: r.end });
        }
      }
    }
    if (consolidated.length > 0) {
      reconciledDecisions = [...nonRippleCuts, { op: 'rippleCut', ranges: consolidated }];
    } else {
      reconciledDecisions = nonRippleCuts;
    }
  } else {
    reconciledDecisions = nonRippleCuts;
  }

  return {
    decisions: reconciledDecisions,
    toolRequests: reconciledTools,
    summaryNotes
  };
}
