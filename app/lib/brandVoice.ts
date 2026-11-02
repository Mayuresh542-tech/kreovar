// Custom Brand Voice — shared, framework-agnostic config.
//
// Imported by BOTH client code (Settings cards, the active-voice badge) and the
// server-side content-kit / platform-kit route handlers, so this file must stay
// free of any React or "use client" — it's plain data plus pure functions.
//
// The user's chosen voice is persisted to profiles.brand_voice (+ brand_voice_custom
// for the free-text option) by migration 0009, then injected into the Groq system
// prompt so every generated title, hook, and script matches their tone.

export interface BrandVoice {
  /** Stable id stored in profiles.brand_voice. */
  id: string;
  /** Display name on the selection card / badge. */
  label: string;
  /** One-line description shown under the label. */
  description: string;
  /** Emoji icon. */
  icon: string;
  /** Tailwind gradient for the card/badge accent (matches the Fretrend palette). */
  gradient: string;
  /** Tailwind border color used when the card is selected. */
  ring: string;
  /** The phrase fed to the model describing how to write — keep it concrete. */
  tone: string;
}

/** The six presets, in the order they appear in Settings. */
export const BRAND_VOICES: BrandVoice[] = [
  {
    id: "professional",
    label: "Professional",
    description: "Polished, authoritative",
    icon: "💼",
    gradient: "from-blue-500/25 to-indigo-500/10",
    ring: "border-blue-500/50",
    tone: "polished, authoritative, and credible — confident and expert, with precise language and no fluff",
  },
  {
    id: "funny",
    label: "Funny",
    description: "Witty, humorous, casual",
    icon: "😂",
    gradient: "from-amber-500/25 to-orange-500/10",
    ring: "border-amber-500/50",
    tone: "witty, humorous, and casual — playful, with jokes, wordplay, and a relaxed conversational attitude",
  },
  {
    id: "edgy",
    label: "Edgy",
    description: "Bold, punchy, provocative",
    icon: "🔥",
    gradient: "from-rose-500/25 to-red-500/10",
    ring: "border-rose-500/50",
    tone: "bold, punchy, and provocative — short hard-hitting sentences, strong opinions, and a little rebellious",
  },
  {
    id: "educational",
    label: "Educational",
    description: "Clear, informative, helpful",
    icon: "🎓",
    gradient: "from-cyan-500/25 to-teal-500/10",
    ring: "border-cyan-500/50",
    tone: "clear, informative, and helpful — break ideas down simply, explain the why, and teach the viewer something",
  },
  {
    id: "inspirational",
    label: "Inspirational",
    description: "Motivating, uplifting",
    icon: "✨",
    gradient: "from-amber-500/25 to-orange-500/10",
    ring: "border-amber-500/50",
    tone: "motivating, uplifting, and aspirational — energize the viewer and make them feel capable and excited to act",
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Default, neutral",
    icon: "⚖️",
    gradient: "from-sky-500/25 to-cyan-500/10",
    ring: "border-sky-500/50",
    tone: "balanced and neutral — clear and engaging without leaning heavily in any one stylistic direction",
  },
];

/** Voice applied when a user has never chosen one. */
export const DEFAULT_BRAND_VOICE = "balanced";

/** Sentinel id for the user-described free-text voice. */
export const CUSTOM_VOICE_ID = "custom";

/** Visual metadata for the "Custom" selection card (mirrors a BrandVoice). */
export const CUSTOM_VOICE = {
  id: CUSTOM_VOICE_ID,
  label: "Custom",
  description: "Describe your own",
  icon: "✏️",
  gradient: "from-emerald-500/25 to-green-500/10",
  ring: "border-emerald-500/50",
} as const;

/** Look up a preset by id (returns null for unknown ids, incl. 'custom'). */
export function getBrandVoice(id?: string | null): BrandVoice | null {
  return BRAND_VOICES.find((v) => v.id === id) ?? null;
}

/**
 * Build the tone instruction injected into the Groq system prompt. Falls back to
 * the Balanced preset for an unset/unknown voice, or for 'custom' with no text.
 */
export function buildVoiceInstruction(voiceId?: string | null, custom?: string | null): string {
  const trimmedCustom = (custom ?? "").trim();
  if (voiceId === CUSTOM_VOICE_ID && trimmedCustom) {
    return `Write ALL of the content to match this custom brand voice: "${trimmedCustom}". Fully commit to this voice across every title, hook, thumbnail idea, content angle, tip, and the entire script — never break character.`;
  }
  const voice = getBrandVoice(voiceId) ?? getBrandVoice(DEFAULT_BRAND_VOICE)!;
  return `Write ALL of the content in a ${voice.label} tone — ${voice.tone}. Apply this voice consistently across every title, hook, thumbnail idea, content angle, tip, and the entire script.`;
}

/** Label + icon to show on the active-voice badge for a stored voice. */
export function voiceDisplay(voiceId?: string | null, custom?: string | null): { label: string; icon: string } {
  if (voiceId === CUSTOM_VOICE_ID && (custom ?? "").trim()) {
    return { label: CUSTOM_VOICE.label, icon: CUSTOM_VOICE.icon };
  }
  const voice = getBrandVoice(voiceId) ?? getBrandVoice(DEFAULT_BRAND_VOICE)!;
  return { label: voice.label, icon: voice.icon };
}
