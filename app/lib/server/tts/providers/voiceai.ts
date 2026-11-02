import { ITTSProvider, TTSOptions, TTSSpeechResult, TTSVoice, TTSWordTimestamp } from "../types";
import { CURATED_VOICES } from "../voices";

/**
 * Curated Voice.ai voice mappings with metadata.
 */
export const VOICE_AI_VOICES: TTSVoice[] = [
  {
    id: "c22f0e4c-e437-4877-9fce-09d33336ca92",
    name: "Lauren",
    category: "Energetic",
    language: "English (US)",
    accent: "American Female",
    gender: "female",
    description: "High-energy, clear, and bright American female cadence built for viral hooks and reels.",
  },
  {
    id: "567bace0-2fee-4585-856d-292c8caf71db",
    name: "Dalton",
    category: "Conversational",
    language: "English (US)",
    accent: "American Male",
    gender: "male",
    description: "Natural, upbeat, and modern American male tone for fast-paced viral reels.",
  },
  {
    id: "c9530f8a-dcb5-4db3-aed0-690694247a1a",
    name: "Matt",
    category: "Cinematic",
    language: "English (US)",
    accent: "American Deep",
    gender: "male",
    description: "Deep, authoritative, and cinematic voice ideal for high-impact hooks.",
  },
  {
    id: "d1bf0f33-8e0e-4fbf-acf8-45c3c6262513",
    name: "Ellie",
    category: "Conversational",
    language: "English (US)",
    accent: "American Casual",
    gender: "female",
    description: "Warm, engaging, and conversational for authentic TikTok storytelling.",
  },
  {
    id: "44de4286-f7aa-4216-845f-807103e33ac8",
    name: "Emma",
    category: "Natural",
    language: "English (UK)",
    accent: "British Confident",
    gender: "female",
    description: "Clear, poised, and articulate British narration suited for explainers.",
  },
  {
    id: "49f8497a-3cb2-4db8-bf94-1c0785fe5e87",
    name: "Lachlan",
    category: "Cinematic",
    language: "English (US)",
    accent: "Australian Dynamic",
    gender: "male",
    description: "Intense, commanding pacing ideal for action and documentary content.",
  },
  {
    id: "e16986bd-1ce9-4c1c-88e7-bbe02b1340d1",
    name: "Alicia",
    category: "Natural",
    language: "English (US)",
    accent: "American Modern",
    gender: "female",
    description: "Articulate, friendly, and smooth cadence for lifestyle and tech videos.",
  },
  {
    id: "9556bcc7-ace2-4510-be5d-31f1165bcc87",
    name: "Ryan",
    category: "Storyteller",
    language: "English (US)",
    accent: "South African Narrative",
    gender: "male",
    description: "Warm, resonant tone perfect for story breakdowns and podcasts.",
  },
];

/**
 * Fallback mapping from legacy IDs (e.g. ElevenLabs presets) to Voice.ai IDs
 */
const LEGACY_VOICE_MAP: Record<string, string> = {
  EXAVITQu4vr4xnSDxMaL: "c22f0e4c-e437-4877-9fce-09d33336ca92", // Bella -> Lauren
  pNInz6obpgDQGcFmaJgB: "c9530f8a-dcb5-4db3-aed0-690694247a1a", // Adam -> Matt
  ErXwobaYiN019PkySvjV: "567bace0-2fee-4585-856d-292c8caf71db", // Antoni -> Dalton
  Xb7hH8MSUJpSbSDYk0k2: "44de4286-f7aa-4216-845f-807103e33ac8", // Alice -> Emma
  JBFqnCBsd6RMkjVDRZzb: "9556bcc7-ace2-4510-be5d-31f1165bcc87", // George -> Ryan
  FGY2WhTYpPnrIDTdsKH5: "c22f0e4c-e437-4877-9fce-09d33336ca92", // Laura -> Lauren
  N2lVS1w4EtoT3dr4eOWO: "49f8497a-3cb2-4db8-bf94-1c0785fe5e87", // Callum -> Lachlan
  pFZP5JQG7iQjIQuC4Bku: "d1bf0f33-8e0e-4fbf-acf8-45c3c6262513", // Lily -> Ellie
};

export class VoiceAITTSProvider implements ITTSProvider {
  name = "Voice.ai";
  private keyPool: string[] = [];
  private currentKeyIndex = 0;

  constructor(keys: string | string[]) {
    const rawKeys = Array.isArray(keys) ? keys : keys.split(",");
    this.keyPool = rawKeys.map((k) => k.trim()).filter((k) => k.startsWith("vk_"));
  }

  async isAvailable(): Promise<boolean> {
    return this.keyPool.length > 0;
  }

  async getVoices(): Promise<TTSVoice[]> {
    return VOICE_AI_VOICES;
  }

  /**
   * Returns the next active key from the pool (with rotation support).
   */
  private getKey(): string | null {
    if (this.keyPool.length === 0) return null;
    const key = this.keyPool[this.currentKeyIndex % this.keyPool.length];
    return key;
  }

  /**
   * Advances the key index to the next active key.
   */
  private rotateKey(): void {
    if (this.keyPool.length > 1) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keyPool.length;
      console.log(`[Voice.ai] Rotated to key pool index ${this.currentKeyIndex}`);
    }
  }

  async generateSpeech(text: string, options: TTSOptions): Promise<TTSSpeechResult> {
    if (this.keyPool.length === 0) {
      throw new Error("Voice.ai is not configured with a valid key.");
    }

    const cleanText = text.trim();
    if (!cleanText) {
      throw new Error("Enter text to generate speech.");
    }

    // Resolve voice ID: map legacy IDs or fallback to default Lauren / Dalton
    let targetVoiceId = options.voiceId;
    if (targetVoiceId && LEGACY_VOICE_MAP[targetVoiceId]) {
      targetVoiceId = LEGACY_VOICE_MAP[targetVoiceId];
    }
    const validVoice = VOICE_AI_VOICES.find((v) => v.id === targetVoiceId);
    const finalVoiceId = validVoice ? validVoice.id : VOICE_AI_VOICES[0].id;

    // Try keys sequentially from the pool (automatic failover)
    const attempts = Math.min(this.keyPool.length, 4);
    let lastError: string | null = null;

    for (let attempt = 0; attempt < attempts; attempt++) {
      const activeKey = this.getKey();
      if (!activeKey) break;

      try {
        const response = await fetch("https://dev.voice.ai/api/v1/tts/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${activeKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: cleanText,
            voice_id: finalVoiceId,
          }),
          signal: AbortSignal.timeout(35000),
        });

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = Buffer.from(arrayBuffer);
          const audioBase64 = audioBuffer.toString("base64");

          // Calculate duration based on MP3 size and character count (Voice.ai streams at ~128kbps = 16,000 bytes/sec)
          const rawDuration = audioBuffer.byteLength / 16000;
          const wordsList = cleanText.split(/\s+/).filter(Boolean);
          const estimatedWordDuration = 0.38 / Math.max(0.5, Math.min(2.0, options.speed ?? 1.0));
          const textEstimatedDuration = wordsList.length * estimatedWordDuration;

          // Clamp calculated duration
          const duration = Number(
            Math.max(1.0, rawDuration > 0.5 ? rawDuration : textEstimatedDuration).toFixed(2)
          );

          // Generate word-level timestamps synchronized with audio duration
          const perWordDuration = duration / Math.max(1, wordsList.length);
          const words: TTSWordTimestamp[] = wordsList.map((word, i) => {
            const start = Number((i * perWordDuration).toFixed(2));
            const end = Number(((i + 1) * perWordDuration).toFixed(2));
            return { word, start, end };
          });

          // Rotate key for load-balancing across future calls
          this.rotateKey();

          return {
            audioBuffer,
            audioBase64,
            mimeType: "audio/mpeg",
            duration,
            words,
            provider: "voiceai",
          };
        }

        // On rate-limit (429) or auth error (401), rotate and retry
        const errText = await response.text().catch(() => "");
        lastError = `HTTP ${response.status}: ${errText.slice(0, 150)}`;
        console.warn(`[Voice.ai] Key index ${this.currentKeyIndex} failed (${lastError}), trying next key...`);
        this.rotateKey();
      } catch (err: any) {
        lastError = err?.message || "Network timeout";
        console.warn(`[Voice.ai] Key index ${this.currentKeyIndex} exception:`, lastError);
        this.rotateKey();
      }
    }

    throw new Error("Voice generation failed. Check the provider quota and credentials, then retry.");
  }
}
