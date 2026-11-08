export interface PhraseMatchResult {
  start: number;
  end: number;
  clipId: string;
  matchedText: string;
}

export interface SpeechSegmentLike {
  clipId: string;
  start: number;
  end: number;
  text: string;
  words?: Array<{ word: string; start: number; end: number }>;
}

function cleanWord(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Searches speechContext segments for a natural language phrase or keyword quote.
 * Returns the exact timeline start/end seconds and target clipId.
 */
export function matchPhraseToSpeech(
  targetPhrase: string,
  segments: SpeechSegmentLike[]
): PhraseMatchResult | undefined {
  if (!targetPhrase || !segments || !segments.length) return undefined;

  const rawTokens = targetPhrase.trim().split(/\s+/);
  const targetTokens = rawTokens.map(cleanWord).filter(t => t.length > 0);
  if (!targetTokens.length) return undefined;

  // 1. First attempt: match across granular word-level timestamps in each segment
  for (const seg of segments) {
    if (!seg.words || !seg.words.length) continue;

    const segWords = seg.words.map(w => ({
      raw: w.word,
      norm: cleanWord(w.word),
      start: w.start,
      end: w.end
    })).filter(w => w.norm.length > 0);

    if (segWords.length < targetTokens.length) continue;

    for (let i = 0; i <= segWords.length - targetTokens.length; i++) {
      let matches = true;
      for (let j = 0; j < targetTokens.length; j++) {
        if (segWords[i + j].norm !== targetTokens[j]) {
          matches = false;
          break;
        }
      }

      if (matches) {
        const start = segWords[i].start;
        const end = segWords[i + targetTokens.length - 1].end;
        const matchedText = segWords.slice(i, i + targetTokens.length).map(w => w.raw.replace(/[,.!?;:]+$/, '')).join(' ');
        return {
          start: Math.round(start * 1000) / 1000,
          end: Math.round(end * 1000) / 1000,
          clipId: seg.clipId,
          matchedText
        };
      }
    }
  }

  // 2. Fallback attempt: segment-level string search when word timings are absent
  const targetClean = targetTokens.join(' ');
  for (const seg of segments) {
    const segClean = (seg.text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (segClean.includes(targetClean)) {
      return {
        start: seg.start,
        end: seg.end,
        clipId: seg.clipId,
        matchedText: seg.text
      };
    }
  }

  return undefined;
}
