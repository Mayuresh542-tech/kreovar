"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { BRAND_VOICES, DEFAULT_BRAND_VOICE } from "../lib/brandVoice";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface StepMeta {
  emoji: string;
  tag: string;
  title: string;
  desc: string;
}

const STEPS: StepMeta[] = [
  {
    emoji: "⚡",
    tag: "DISCOVER INTELLIGENCE",
    title: "Welcome to Kreovar",
    desc: "The AI creator platform that turns live trend signals into fully edited, publish-ready videos.",
  },
  {
    emoji: "🎯",
    tag: "CALIBRATE RADAR",
    title: "Select your primary niche",
    desc: "We will prioritize breaking signals and keyword velocity feeds matched to your audience domain.",
  },
  {
    emoji: "🎭",
    tag: "CREATOR SIGNATURE",
    title: "Select your AI brand voice",
    desc: "Injected into every generated hook, title, and script to match your authentic personality.",
  },
  {
    emoji: "⚡",
    tag: "AI BRAIN PRE-CONFIGURED",
    title: "Google Gemini 2.0 Engine",
    desc: "Kreovar automatically handles AI generation server-side. No API keys needed.",
  },
  {
    emoji: "🚀",
    tag: "CALIBRATION COMPLETE",
    title: "Your studio is primed",
    desc: "Your trend radar and custom brand voice are configured. Ready to turn breakout trends into viral content.",
  },
];

const NICHES = [
  "AI & Automation",
  "Gaming & Esports",
  "Technology & Gadgets",
  "Finance & Crypto",
  "Video Editing & Filmmaking",
  "Entertainment & Pop Culture",
  "Productivity & SaaS",
  "Fitness & Longevity",
];

export default function OnboardingFlow({ userId }: { userId: string }) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);

  // Selections
  const [selectedNiche, setSelectedNiche] = useState("AI & Automation");
  const [selectedVoice, setSelectedVoice] = useState(DEFAULT_BRAND_VOICE);

  const last = STEPS.length - 1;

  const checkedRef = useRef(false);
  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("onboarding_completed")
          .eq("id", userId)
          .maybeSingle();

        if (error) return;

        if (!data) {
          await supabase
            .from("profiles")
            .upsert({ id: userId, onboarding_completed: false }, { onConflict: "id", ignoreDuplicates: true });
          setVisible(true);
          return;
        }

        if (data.onboarding_completed === false) {
          setVisible(true);
        }
      } catch {
        // ignore
      }
    })();
  }, [userId]);

  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  function goTo(next: number) {
    setStep(next);
  }

  async function markCompleted() {
    try {
      await supabase
        .from("profiles")
        .update({
          onboarding_completed: true,
          brand_voice: selectedVoice,
        })
        .eq("id", userId);

      // Save niche
      if (selectedNiche) {
        await supabase
          .from("saved_niches")
          .insert({ user_id: userId, niche: selectedNiche });
      }
    } catch {
      // best-effort
    }
  }

  async function finish(destination?: string) {
    if (finishing) return;
    setFinishing(true);
    await markCompleted();
    if (destination) {
      router.push(destination);
    } else {
      setVisible(false);
      setFinishing(false);
    }
  }

  async function handlePrimary() {
    if (step === 1 && selectedNiche) {
      try {
        await supabase.from("saved_niches").insert({ user_id: userId, niche: selectedNiche });
      } catch {
        // ignore
      }
    }

    if (step === 2 && selectedVoice) {
      try {
        await supabase.from("profiles").update({ brand_voice: selectedVoice }).eq("id", userId);
      } catch {
        // ignore
      }
    }

    if (step === last) {
      void finish("/trends");
    } else {
      goTo(step + 1);
    }
  }

  const ctaLabel = [
    "Begin Setup →",
    "Confirm Niche →",
    "Lock Brand Voice →",
    "Confirm AI Engine →",
    "Launch Trend Radar 🔥",
  ][step];

  function renderBody() {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4 max-w-md mx-auto text-left">
            <p className="text-white/60 text-xs sm:text-sm leading-relaxed text-center">
              Kreovar replaces guesswork with continuous market intelligence. Track velocity, understand why audiences care, and generate fully edited videos in minutes.
            </p>
            <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs text-sky-200/90 space-y-2.5 font-medium">
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                <span>Multi-Source Trend Discovery (Google Trends, Reddit, HN, YouTube)</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                <span>Instant AI Content Kits tailored to your unique voice tone</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                <span>1-Click Omni-Channel Repurposing (YouTube, TikTok, Reels, X, LinkedIn)</span>
              </div>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-3 max-w-md mx-auto text-left">
            <div className="grid grid-cols-2 gap-2">
              {NICHES.map((n) => {
                const isSelected = selectedNiche === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSelectedNiche(n)}
                    className={`p-3 rounded-xl border text-xs font-semibold text-left transition flex items-center justify-between ${
                      isSelected
                        ? "bg-sky-500/20 border-sky-500/60 text-white shadow-[0_0_15px_-4px_rgba(14,165,233,0.3)]"
                        : "bg-white/[0.02] border-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className="truncate">{n}</span>
                    {isSelected && <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0 ml-1.5" />}
                  </button>
                );
              })}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-3 max-w-md mx-auto text-left">
            <div className="grid grid-cols-2 gap-2">
              {BRAND_VOICES.map((b) => {
                const isSelected = selectedVoice === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedVoice(b.id)}
                    className={`p-3 rounded-xl border transition text-left flex flex-col justify-between ${
                      isSelected
                        ? "bg-sky-500/20 border-sky-500/60 text-white shadow-[0_0_15px_-4px_rgba(14,165,233,0.3)]"
                        : "bg-white/[0.02] border-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-lg">{b.icon}</span>
                      {isSelected && <span className="w-2 h-2 rounded-full bg-sky-400" />}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block">{b.label}</span>
                      <span className="text-[10px] text-white/40 block truncate mt-0.5">{b.description}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-3 max-w-md mx-auto text-left">
            <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/25 text-xs text-white/90 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sky-300">Kreovar AI Engine</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Google Gemini 2.0 Active
                </span>
              </div>
              <p className="text-[11px] text-white/70 leading-relaxed">
                Kreovar connects server-side to Google Gemini 2.0 to synthesize trend data into viral hooks, high-CTR titles, thumbnail concepts, and complete scripts.
              </p>
              <div className="pt-2 border-t border-white/[0.08] grid grid-cols-2 gap-2 text-[10px] font-mono text-white/60">
                <div>✓ Zero Key Setup Required</div>
                <div>✓ Server-Side Security</div>
                <div>✓ Multi-Source Trend Data</div>
                <div>✓ Omni-Channel Content Kit</div>
              </div>
            </div>
            <p className="text-[11px] text-white/40 text-center font-mono">
              30 free credits available on your starter tier.
            </p>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4 max-w-md mx-auto text-left">
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08] text-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-white/40 font-mono text-[11px]">TARGET NICHE</span>
                <span className="font-semibold text-white font-mono">{selectedNiche}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/40 font-mono text-[11px]">BRAND VOICE</span>
                <span className="font-semibold text-sky-300 font-mono capitalize">{selectedVoice}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/40 font-mono text-[11px]">ACCESS LEVEL</span>
                <span className="font-bold text-emerald-400 font-mono flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Community Pro (Lifetime Free)
                </span>
              </div>
            </div>
            <p className="text-xs text-white/60 text-center leading-relaxed">
              Click below to jump directly into the Trend Discovery engine and start turning breakout insights into viral content.
            </p>
          </div>
        );

      default:
        return null;
    }
  }

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md antialiased"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="relative w-full max-w-lg rounded-2xl bg-[#0D0F15] border border-[#202534] shadow-[0_20px_60px_rgba(0,0,0,0.85)] p-6 sm:p-8 overflow-hidden"
        >
          {/* Header & Step progress bar */}
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-white/[0.08]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400">
                Step {step + 1} of {STEPS.length} — {STEPS[step].tag}
              </span>
            </div>

            <button
              onClick={() => void finish()}
              disabled={finishing}
              className="text-xs text-white/40 hover:text-white transition font-mono"
            >
              Skip Setup
            </button>
          </div>

          {/* Animated step content */}
          <div className="min-h-[280px] flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-2xl mb-3.5 text-sky-300">
              {STEPS[step].emoji}
            </div>
            <h2 className="text-xl font-bold text-white mb-1.5 font-heading tracking-tight">{STEPS[step].title}</h2>
            <p className="text-xs text-white/50 mb-4 max-w-sm">{STEPS[step].desc}</p>
            <div className="w-full">{renderBody()}</div>
          </div>

          {/* Footer controls & progress dots */}
          <div className="mt-8 pt-4 border-t border-white/[0.08] flex items-center justify-between gap-4">
            {/* Dots */}
            <div className="flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === step
                      ? "w-6 bg-sky-400"
                      : i < step
                      ? "w-1.5 bg-sky-400/50"
                      : "w-1.5 bg-white/20"
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => goTo(step - 1)}
                  disabled={finishing}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white/60 hover:text-white transition"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={handlePrimary}
                disabled={finishing}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-zinc-950 shadow-[0_0_20px_rgba(255,255,255,0.2)] transition disabled:opacity-50"
              >
                {finishing ? "Configuring…" : ctaLabel}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
