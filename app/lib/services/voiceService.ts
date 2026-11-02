import { VeeloxCaptionWord, VeeloxVoiceConfig } from "./types";

export interface VoiceGenerationResult {
  audioUrl: string;
  duration: number; // in seconds
  words: VeeloxCaptionWord[];
  isDevelopmentMode: boolean;
  providerUsed: "elevenlabs" | "mock";
}

export interface VoiceProvider {
  name: string;
  isAvailable(): boolean;
  generateSceneVoice(
    text: string,
    voiceConfig?: VeeloxVoiceConfig
  ): Promise<VoiceGenerationResult>;
}

export const PRESET_VOICES: Array<{ id: string; name: string; description: string; gender: "male" | "female" }> = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", description: "Calm, clear, and professional", gender: "female" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", description: "Deep, authoritative, and cinematic", gender: "male" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", description: "Warm, engaging, and conversational", gender: "male" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", description: "Dynamic, energetic, and modern", gender: "female" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", description: "Young, confident, and natural", gender: "male" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", description: "Approachable and clear storyteller", gender: "male" },
];

export class ElevenLabsProvider implements VoiceProvider {
  name = "ElevenLabs";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 0);
  }

  async generateSceneVoice(
    text: string,
    voiceConfig?: VeeloxVoiceConfig
  ): Promise<VoiceGenerationResult> {
    if (!this.apiKey) {
      throw new Error("ElevenLabs API key is missing.");
    }

    const voiceId = voiceConfig?.voiceId || PRESET_VOICES[0].id;
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": this.apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: voiceConfig?.stability ?? 0.5,
            similarity_boost: voiceConfig?.similarityBoost ?? 0.75,
            speed: voiceConfig?.speed ?? 1.0,
          },
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.detail?.message ?? `ElevenLabs TTS failed with HTTP ${res.status}`);
      }

      const data = await res.json();
      const audioBase64 = data.audio_base64;
      const alignment = data.alignment;

      const words: VeeloxCaptionWord[] = [];
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
                start: wordStart,
                end: end,
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

      const audioUrl = `data:audio/mp3;base64,${audioBase64}`;
      const duration = words.length > 0 ? words[words.length - 1].end : Math.max(2, text.split(/\s+/).length * 0.4);

      return {
        audioUrl,
        duration,
        words,
        isDevelopmentMode: false,
        providerUsed: "elevenlabs",
      };
    } catch (err) {
      console.warn("ElevenLabs generation error:", err);
      throw err;
    }
  }
}

export class MockVoiceProvider implements VoiceProvider {
  name = "Kreovar Development Voice";

  isAvailable(): boolean {
    return true; // Always available
  }

  async generateSceneVoice(
    text: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _voiceConfig?: VeeloxVoiceConfig
  ): Promise<VoiceGenerationResult> {
    // Artificial latency for realistic async state handling
    await new Promise((r) => setTimeout(r, 400));

    const rawWords = text.trim().split(/\s+/).filter(Boolean);
    const wordDuration = 0.38; // ~158 words per minute average speaking rate
    const totalDuration = Math.max(2.5, rawWords.length * wordDuration);

    const words: VeeloxCaptionWord[] = rawWords.map((word, index) => ({
      word,
      start: Number((index * wordDuration).toFixed(2)),
      end: Number(((index + 1) * wordDuration).toFixed(2)),
    }));

    // In development mode, generate a lightweight synthesized audio tone or silent WAV data URI
    // so Remotion and browser audio elements can play without errors or network dependencies.
    const sampleRate = 8000;
    const numSamples = Math.floor(sampleRate * Math.min(totalDuration, 12));
    const wavHeaderSize = 44;
    const buffer = new Uint8Array(wavHeaderSize + numSamples);

    // Write simple WAV Header
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) buffer[offset + i] = str.charCodeAt(i);
    };
    writeString(0, "RIFF");
    const view = new DataView(buffer.buffer);
    view.setUint32(4, 36 + numSamples, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true); // 8-bit
    writeString(36, "data");
    view.setUint32(40, numSamples, true);

    // Subtle gentle ambient modulation so audio track registers in timeline and player
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      // Very soft, barely audible tone at 220Hz with fade in/out
      const envelope = Math.min(1, t * 4) * Math.min(1, (totalDuration - t) * 4);
      const val = 128 + Math.sin(2 * Math.PI * 220 * t) * 12 * Math.max(0, envelope);
      buffer[44 + i] = Math.floor(val);
    }

    let binary = "";
    const len = buffer.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    const base64Wav = typeof btoa !== "undefined" ? btoa(binary) : Buffer.from(buffer).toString("base64");
    const audioUrl = `data:audio/wav;base64,${base64Wav}`;

    return {
      audioUrl,
      duration: totalDuration,
      words,
      isDevelopmentMode: true,
      providerUsed: "mock",
    };
  }
}

import { supabase } from "../supabase";

export class RemoteVoiceProvider implements VoiceProvider {
  name = "Kreovar Voice Engine";

  isAvailable(): boolean {
    return true;
  }

  async generateSceneVoice(
    text: string,
    voiceConfig?: VeeloxVoiceConfig
  ): Promise<VoiceGenerationResult> {
    let token: string | null = null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token || null;
    } catch {
      // Ignored if session is unavailable
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    try {
      const res = await fetch("/api/voice/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({ text, voiceConfig }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "Voice generation is temporarily unavailable.");
      }

      const data = await res.json();
      return data;
    } catch (err: any) {
      throw err;
    }
  }
}

/**
 * Factory to resolve VoiceProvider:
 * - If explicit apiKey is given (e.g. server-side/direct), uses ElevenLabsProvider.
 * - In browser, uses RemoteVoiceProvider (/api/voice/generate).
 * - Fallback to MockVoiceProvider for offline/local dev.
 */
export function getVoiceProvider(apiKey?: string | null): VoiceProvider {
  if (apiKey && apiKey.trim().length > 0) {
    return new ElevenLabsProvider(apiKey);
  }
  if (typeof window !== "undefined") {
    return new RemoteVoiceProvider();
  }
  return new MockVoiceProvider();
}

