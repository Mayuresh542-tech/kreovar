"use client";

import React from "react";
import EditorAIChat from "../EditorAIChat";

export const FEATURED_PRESET_IDS = [
  "hormozi",
  "podcast-pro",
  "mrbeast",
  "documentary",
  "clean",
] as const;

export interface AiEditingChatProps {
  active?: boolean;
  onManual?: () => void;
}

/**
 * Minimalist conversational AI sidebar wrapper retained for backward compatibility.
 * All dual-tab, checkbox, preset card, and dropdown clutter has been removed.
 */
export default function AiEditingChat({ active = true }: AiEditingChatProps) {
  if (!active) return null;
  return <EditorAIChat />;
}
