import { transcribeWithGroq, SpeechProviderError } from "./groqTranscription";
import { transcribeLocally } from "./localTranscription";
import { normalizeHinglishWords, normalizeHinglishText } from "../editor/hinglishNormalizer";

export type TranscriptionLanguage = 'hinglish' | 'en' | 'hi' | 'auto' | string;

export interface TranscriptionOptions {
  audio: Buffer;
  mime: string;
  key?: string | null;
  signal: AbortSignal;
  language?: TranscriptionLanguage;
  provider?: 'groq' | 'local' | 'elevenlabs';
}

export interface TranscriptionResult {
  words: Array<{ text: string; start: number; end: number; type: string }>;
  text: string;
  language_code: string;
  audio_duration_secs: number;
}

/**
 * Unified Server-side Transcription Dispatcher.
 * Natively supports 'hinglish' (Romanized Hindi) with prompt conditioning
 * and post-processing normalization.
 */
export async function transcribeAudio(options: TranscriptionOptions): Promise<TranscriptionResult> {
  const { audio, mime, key, signal, language = 'auto', provider = 'groq' } = options;

  if (provider === 'local') {
    const raw = await transcribeLocally(audio, signal, language === 'hinglish' ? 'hi' : language);
    if (language === 'hinglish') {
      const normalizedWords = normalizeHinglishWords(raw.words as any);
      const normalizedText = normalizeHinglishText(raw.text);
      return {
        ...raw,
        words: normalizedWords as any,
        text: normalizedText,
        language_code: 'hin-Latn'
      };
    }
    return raw as any;
  }

  // Default to Groq Whisper v3 Turbo
  if (!key) {
    throw new SpeechProviderError("Speech transcription key is not configured.", 503);
  }

  return await transcribeWithGroq(audio, mime, key, signal, language);
}

export { SpeechProviderError };
