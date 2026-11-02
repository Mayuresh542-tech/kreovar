"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "../lib/supabase";
import { voiceDisplay } from "../lib/brandVoice";

/**
 * Small pill showing the user's active Brand Voice. Self-contained — it resolves
 * the session and reads profiles.brand_voice itself, so any authed page can drop
 * it in with no props. Clicking it jumps to Settings to change the voice. Renders
 * nothing until the voice is known (no flash / layout shift).
 */
export default function BrandVoiceBadge({ className = "" }: { className?: string }) {
  const [display, setDisplay] = useState<{ label: string; icon: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || cancelled) return;
        const { data } = await supabase
          .from("profiles")
          .select("brand_voice, brand_voice_custom")
          .eq("id", session.user.id)
          .maybeSingle();
        if (cancelled) return;
        setDisplay(voiceDisplay(data?.brand_voice, data?.brand_voice_custom));
      } catch {
        /* leave hidden on any failure (e.g. columns not yet migrated) */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!display) return null;

  return (
    <motion.a
      href="/settings"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      title="Change your Brand Voice in Settings"
      className={`inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-200 transition-colors hover:border-sky-400/50 hover:bg-sky-500/20 ${className}`}
    >
      <span aria-hidden>{display.icon}</span>
      <span className="text-white/40 font-medium">Voice</span>
      <span>{display.label}</span>
    </motion.a>
  );
}
