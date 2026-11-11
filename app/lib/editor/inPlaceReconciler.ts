import type { EditorProject, Clip } from './model';
import type { EditDecision } from './ai';
import type { AiToolRequest } from './aiTools';
import type { EditingConstraints } from './editingIntent';
import { matchPhraseToSpeech, type SpeechSegmentLike } from './phraseMatcher';

export interface ReconciliationResult {
  decisions: EditDecision[];
  toolRequests: AiToolRequest[];
  summaryNotes: string[];
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
  speech?: SpeechSegmentLike[]
): ReconciliationResult {
  const summaryNotes: string[] = [];
  let reconciledDecisions: EditDecision[] = [...decisions];
  let reconciledTools: AiToolRequest[] = [...toolRequests];

  // 1. In-Place Caption Reconciliation (Duplicate Prevention)
  const existingCaptionClips = Object.values(project.clips).filter(
    c => c.contentId && project.captions[c.contentId] && !project.tracks[c.trackId]?.hidden
  );

  const addCaptionDecisions = reconciledDecisions.filter(d => d.op === 'addCaption');
  if (existingCaptionClips.length > 0 && addCaptionDecisions.length > 0) {
    // Redundant transcription detected: restyle existing captions in-place!
    const targetTemplateId = (addCaptionDecisions[0] as { templateId?: string }).templateId || 'study-clean-motion';
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
  if (constraints?.requestedCaptionPreset && existingCaptionClips.length > 0) {
    const existingClipIds = existingCaptionClips.map(c => c.id);
    reconciledDecisions = reconciledDecisions.filter(d => d.op !== 'applyCaptionTemplate' && d.op !== 'addCaption');
    // Strip manual changeText styling overrides on caption clips
    reconciledDecisions = reconciledDecisions.filter(d => !(d.op === 'changeText' && existingClipIds.includes(d.clipId)));
    reconciledDecisions.unshift({
      op: 'applyCaptionTemplate',
      clipIds: existingClipIds,
      templateId: constraints.requestedCaptionPreset
    });
    reconciledTools = reconciledTools.filter(r => r.type !== 'captions');
    summaryNotes.push(`Applied ${constraints.requestedCaptionPreset} template to ${existingClipIds.length} captions.`);
  } else if (constraints?.requestedCaptionPreset && reconciledTools.some(r => r.type === 'captions')) {
    reconciledTools = reconciledTools.map(r =>
      r.type === 'captions' ? { ...r, templateId: constraints.requestedCaptionPreset } : r
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

  // Filter out any unapproved arbitrary floating text (only standard lower-thirds permitted)
  reconciledDecisions = reconciledDecisions.filter(d => {
    if (d.op === 'addText') {
      const isStandardLowerThird = d.placementId === 'lower-third';
      if (!isStandardLowerThird) return false;
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

    // Silence & Pause Trimming (>0.6s word gaps into consolidated rippleCut)
    if (constraints.requestedSilenceCut && !constraints.disallowedCuts) {
      if (!reconciledDecisions.some(d => d.op === 'rippleCut') && speech && speech.length > 0) {
        // Collect all word boundaries across segments
        const allWords: Array<{ word: string; start: number; end: number }> = [];
        for (const seg of speech) {
          if (seg.words && seg.words.length > 0) {
            allWords.push(...seg.words);
          } else if (seg.start !== undefined && seg.end !== undefined) {
            allWords.push({ word: seg.text || '', start: seg.start, end: seg.end });
          }
        }
        allWords.sort((a, b) => a.start - b.start);

        const rawRanges: Array<{ start: number; end: number }> = [];
        for (let i = 0; i < allWords.length - 1; i++) {
          const gap = allWords[i + 1].start - allWords[i].end;
          if (gap > 0.6) {
            rawRanges.push({ start: allWords[i].end, end: allWords[i + 1].start });
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
          summaryNotes.push(`Trimmed ${consolidated.length} awkward speech pause(s) (>0.6s) into consolidated rippleCut.`);
        }
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
              d.endTime = Math.max(match.start + 0.6, match.end);
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
                  d.endTime = Math.min(videoClip.startTime + videoClip.duration, Math.max(match.start + 0.6, match.end));
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
              reconciledDecisions.push({
                op: 'addZoom',
                clipId: videoClip.id,
                startTime: match.start,
                endTime: Math.min(videoClip.startTime + videoClip.duration, Math.max(match.start + 0.6, match.end)),
                fromScale: 1.0,
                toScale: 1.15,
                returnToStart: true,
                easing: 'smooth'
              });
              summaryNotes.push(`Anchored punch zoom to phrase "${phrase}".`);
            }
          }
        }
      }
    }
  }

  return {
    decisions: reconciledDecisions,
    toolRequests: reconciledTools,
    summaryNotes
  };
}
