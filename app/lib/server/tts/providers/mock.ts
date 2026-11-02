import { ITTSProvider, TTSOptions, TTSSpeechResult, TTSVoice, TTSWordTimestamp } from "../types";
import { CURATED_VOICES } from "../voices";

export class MockTTSProvider implements ITTSProvider {
  name = "MockTTSProvider";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getVoices(): Promise<TTSVoice[]> {
    return CURATED_VOICES;
  }

  async generateSpeech(text: string, options: TTSOptions): Promise<TTSSpeechResult> {
    const cleanText = text.trim();
    const rawWords = cleanText.split(/\s+/).filter(Boolean);
    const speed = Math.max(0.5, Math.min(2.0, options.speed ?? 1.0));
    const baseWordDuration = 0.38 / speed;
    const totalDuration = Math.max(2.5, Number((rawWords.length * baseWordDuration).toFixed(2)));

    const words: TTSWordTimestamp[] = rawWords.map((word, index) => {
      const start = Number((index * baseWordDuration).toFixed(2));
      const end = Number(((index + 1) * baseWordDuration).toFixed(2));
      return { word, start, end };
    });

    // Generate genuine playable 8kHz 8-bit mono PCM WAV
    const sampleRate = 8000;
    const numSamples = Math.floor(sampleRate * Math.min(totalDuration, 30));
    const wavHeaderSize = 44;
    const buffer = Buffer.alloc(wavHeaderSize + numSamples);

    // RIFF header
    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + numSamples, 4);
    buffer.write("WAVE", 8);
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // 1 channel
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate, 28);
    buffer.writeUInt16LE(1, 32); // Block align
    buffer.writeUInt16LE(8, 34); // Bits per sample
    buffer.write("data", 36);
    buffer.writeUInt32LE(numSamples, 40);

    // Generate audible melodic voice-like cadence modulation
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      // Envelope smoothly fades at start and end
      const envelope = Math.min(1, t * 5) * Math.min(1, (totalDuration - t) * 5);
      // Gentle soft vocal formant cadence (180Hz fundamental with overtone)
      const pitch = 180 + Math.sin(t * 4) * 20;
      const s1 = Math.sin(2 * Math.PI * pitch * t);
      const s2 = Math.sin(4 * Math.PI * pitch * t) * 0.4;
      const val = 128 + (s1 + s2) * 18 * Math.max(0, envelope);
      buffer[44 + i] = Math.floor(val);
    }

    return {
      audioBuffer: buffer,
      audioBase64: buffer.toString("base64"),
      mimeType: "audio/wav",
      duration: totalDuration,
      words,
      provider: "mock",
    };
  }
}
