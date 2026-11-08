import type { EditorProject, Clip } from './model';
import type { EditDecision, AiToolRequest } from './ai';
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

  // 2. Negative Constraints & Selective Removals
  if (constraints) {
    if (constraints.disallowedAudio) {
      reconciledDecisions = reconciledDecisions.filter(d => {
        if (d.op === 'setAudioDucking') return false;
        if (d.op === 'addClip') {
          const track = project.tracks[d.trackId];
          if (track?.kind === 'audio' || d.audioRole === 'sfx') return false;
        }
        if (d.op === 'changeClipProperty' && (d.changes.volume !== undefined || d.changes.ducking !== undefined)) return false;
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
        if (clip.zooms && clip.zooms.length > 0) {
          if (!reconciledDecisions.some(d => d.op === 'clearZooms' && d.clipId === clip.id)) {
            reconciledDecisions.push({ op: 'clearZooms', clipId: clip.id });
          }
        }
      }
      summaryNotes.push('Cleared existing zooms on video clips.');
    }

    // Protected Temporal Intervals
    if (constraints.protectedIntervals && constraints.protectedIntervals.length > 0) {
      reconciledDecisions = reconciledDecisions.filter(d => {
        if ('startTime' in d && typeof d.startTime === 'number') {
          const st = d.startTime;
          return !constraints.protectedIntervals.some(p => st >= p.start && st < p.end);
        }
        if (d.op === 'rippleCut') {
          // Filter cuts that fall within protected intervals
          d.ranges = d.ranges.filter(r => !constraints.protectedIntervals.some(p => r.start < p.end && r.end > p.start));
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
          for (const d of reconciledDecisions) {
            if (d.op === 'addZoom') {
              d.startTime = match.start;
              d.endTime = Math.max(match.start + 0.6, match.end);
              d.clipId = match.clipId;
              break;
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
