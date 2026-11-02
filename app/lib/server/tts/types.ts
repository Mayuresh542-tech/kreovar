export interface TTSVoice {
  id: string;
  name: string;
  category: "Natural" | "Cinematic" | "Conversational" | "Energetic" | "Storyteller";
  language: string;
  accent: string;
  gender: "male" | "female";
  description: string;
  sampleAudioUrl?: string;
}

export interface TTSOptions {
  voiceId: string;
  speed?: number; // 0.5 to 2.0, default 1.0
  stability?: number; // 0.0 to 1.0, default 0.5
  similarityBoost?: number; // 0.0 to 1.0, default 0.75
  language?: string;
  emotion?: string; // "neutral" | "excited" | "dramatic" | "calm"
}

export interface TTSWordTimestamp {
  word: string;
  start: number; // in seconds
  end: number;   // in seconds
}

export interface TTSSpeechResult {
  audioBuffer: Buffer;
  audioBase64?: string;
  audioUrl?: string;
  mimeType: string;
  duration: number; // in seconds
  words: TTSWordTimestamp[];
  provider: string;
}

export interface ITTSProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  getVoices(): Promise<TTSVoice[]>;
  generateSpeech(text: string, options: TTSOptions): Promise<TTSSpeechResult>;
}
