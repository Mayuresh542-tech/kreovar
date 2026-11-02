import { ITTSProvider, TTSVoice } from "./types";
import { VoiceAITTSProvider, VOICE_AI_VOICES } from "./providers/voiceai";
import { ElevenLabsTTSProvider } from "./providers/elevenlabs";
import { CURATED_VOICES } from "./voices";
import { getProviderCredential } from "../providerRegistry";

/**
 * Resolves the active TTS provider.
 * 1. Checks providerRegistry and environment for Voice.ai API keys (supports 4-key pool with failover).
 * 2. Checks providerRegistry and environment for ElevenLabs API key.
 * 3. In dev / fallback mode, returns MockTTSProvider so the pipeline is fully testable without breaking.
 */
export async function getTTSProvider(): Promise<ITTSProvider> {
  try {
    // 1. Voice.ai Provider (Active Multi-Key Pool)
    const voiceAiDbKey = await getProviderCredential("voiceai");
    const voiceAiEnvKeys = voiceAiDbKey ? process.env.VOICE_AI_API_KEYS || voiceAiDbKey : null;
    if (voiceAiEnvKeys && voiceAiEnvKeys.trim().includes("vk_")) {
      return new VoiceAITTSProvider(voiceAiEnvKeys);
    }

    // 2. ElevenLabs Provider
    const elevenLabsKey = await getProviderCredential("elevenlabs");
    if (elevenLabsKey && elevenLabsKey.trim().length > 5) {
      return new ElevenLabsTTSProvider(elevenLabsKey);
    }
  } catch (err) {
    console.warn("[TTS Registry] Error resolving provider credentials:", err);
  }

  throw new Error("No voice provider is configured. Configure a voice provider in admin settings.");
}

/**
 * Returns available voices with descriptions and characteristics.
 */
export async function getAvailableVoices(): Promise<TTSVoice[]> {
  return [...VOICE_AI_VOICES, ...CURATED_VOICES];
}

