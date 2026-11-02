import { ITTSProvider, TTSOptions, TTSSpeechResult, TTSVoice, TTSWordTimestamp } from "../types";
import { CURATED_VOICES } from "../voices";

export class ElevenLabsTTSProvider implements ITTSProvider {
  name = "ElevenLabs";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey && this.apiKey.length > 5);
  }

  async getVoices(): Promise<TTSVoice[]> {
    return CURATED_VOICES;
  }

  async generateSpeech(text: string, options: TTSOptions): Promise<TTSSpeechResult> {
    if (!this.apiKey) {
      throw new Error("ElevenLabs is not configured.");
    }

    let activeVoiceId = options.voiceId || CURATED_VOICES[0].id;
    const stability = options.stability ?? 0.5;
    const similarityBoost = options.similarityBoost ?? 0.75;
    const speed = Math.max(0.5, Math.min(2.0, options.speed ?? 1.0));
    const apiKey = this.apiKey;

    const callElevenLabs = async (vid: string) => {
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${vid}/with-timestamps`;
      return fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability,
            similarity_boost: similarityBoost,
            speed,
          },
        }),
        signal: AbortSignal.timeout(35000),
      });
    };

    try {
      let res = await callElevenLabs(activeVoiceId);

      // If requested voice returns 402/400 (voice restriction or free tier block), auto retry with default verified Bella
      if (!res.ok && (res.status === 402 || res.status === 400) && activeVoiceId !== CURATED_VOICES[0].id) {
        console.warn(`[ElevenLabs] Voice ${activeVoiceId} returned ${res.status}, retrying with default verified voice ${CURATED_VOICES[0].id}`);
        activeVoiceId = CURATED_VOICES[0].id;
        res = await callElevenLabs(activeVoiceId);
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const detail = errJson?.detail?.message || `ElevenLabs HTTP ${res.status}`;
        throw new Error("Voice generation failed. Check the provider quota and credentials, then retry.");
      }

      const data = await res.json();
      const audioBase64: string = data.audio_base64;
      const alignment = data.alignment;

      const words: TTSWordTimestamp[] = [];
      if (alignment && Array.isArray(alignment.characters)) {
        let currentWord = "";
        let wordStart = 0;
        for (let i = 0; i < alignment.characters.length; i++) {
          const char = alignment.characters[i];
          const start = alignment.character_start_times_seconds[i];
          const end = alignment.character_end_times_seconds[i];

          if (char === " " || i === alignment.characters.length - 1) {
            if (char !== " ") currentWord += char;
            if (currentWord.trim()) {
              words.push({
                word: currentWord.trim(),
                start: Number(wordStart.toFixed(2)),
                end: Number(end.toFixed(2)),
              });
            }
            currentWord = "";
            wordStart = end;
          } else {
            if (!currentWord) wordStart = start;
            currentWord += char;
          }
        }
      }

      const audioBuffer = Buffer.from(audioBase64, "base64");
      const duration = words.length > 0 ? words[words.length - 1].end : Math.max(2.5, text.split(/\s+/).length * 0.4);

      return {
        audioBuffer,
        audioBase64,
        mimeType: "audio/mpeg",
        duration,
        words,
        provider: "elevenlabs",
      };
    } catch (err: any) {
      throw new Error(err?.message || "Voice generation failed. Please retry.");
    }
  }
}
