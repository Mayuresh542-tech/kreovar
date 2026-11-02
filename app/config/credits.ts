/**
 * Centralized credit cost configuration for Veelox.
 * Generic system so other features (video editing, voice synthesis, etc.)
 * can later have their own dedicated credit costs.
 */

export const FEATURE_CREDIT_COSTS = {
  CONTENT_KIT: 5,
  VOICE_SYNTHESIS: 5,
  VIDEO_DRAFT: 25,
} as const;

/**
 * Core Rule: 1 Content Kit = 5 credits.
 * Centralized constant to prevent hard-coding across multiple components.
 */
export const CONTENT_KIT_COST = FEATURE_CREDIT_COSTS.CONTENT_KIT;
export const VOICE_SYNTHESIS_COST = FEATURE_CREDIT_COSTS.VOICE_SYNTHESIS;

/**
 * Calculates how many Content Kits can be generated with a given credit balance.
 * Allowance = Math.floor(available_credits / CONTENT_KIT_COST)
 */
export function calculateContentKitAllowance(availableCredits: number | null | undefined): number {
  if (typeof availableCredits !== "number" || availableCredits <= 0 || !Number.isFinite(availableCredits)) {
    return 0;
  }
  return Math.floor(availableCredits / CONTENT_KIT_COST);
}

/**
 * Formats credit and kit allowance text for plan cards and dashboard telemetry.
 * Example: "30 credits · up to 6 Content Kits"
 */
export function formatKitAllowanceSummary(credits: number): string {
  const kits = calculateContentKitAllowance(credits);
  return `${credits} credits (up to ${kits} Content Kits)`;
}
