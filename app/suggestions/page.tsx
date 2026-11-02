"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase";
import StudioShell from "../components/StudioShell";

const TYPES = ["New Feature", "Bug Report", "Improvement", "Other"] as const;
type SuggestionType = (typeof TYPES)[number];

const TYPE_ICON: Record<SuggestionType, string> = {
  "New Feature": "✨",
  "Bug Report": "🐞",
  Improvement: "📈",
  Other: "💬",
};

export default function Suggestions() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState<SuggestionType>("New Feature");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!message.trim()) {
      setError("Please enter your suggestion or feedback before submitting.");
      return;
    }

    setSubmitting(true);
    const { error: insertError } = await supabase.from("suggestions").insert({
      name: name.trim() || null,
      email: email.trim() || null,
      type,
      message: message.trim(),
    });
    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSubmitted(true);
  }

  function reset() {
    setName("");
    setEmail("");
    setType("New Feature");
    setMessage("");
    setSubmitted(false);
    setError("");
  }

  return (
    <StudioShell active="suggestions">
      <div className="max-w-3xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#1A2030]">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
              <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-sky-400">
                CREATOR INITIATIVES
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Suggestions &amp; Community Radar
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              Help shape future Kreovar releases. Request new platform adapters, recommend trend feeds, or submit product improvements.
            </p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {submitted ? (
            /* Success State */
            <motion.div
              key="thanks"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="p-8 sm:p-10 rounded-2xl bg-[#0D1017] border border-sky-500/30 text-center shadow-sm"
            >
              <span className="text-4xl block mb-3">🎉</span>
              <h2 className="text-lg font-bold text-white mb-1.5">Thank you for your feedback!</h2>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mb-5 leading-relaxed">
                Your {TYPE_ICON[type]} {type.toLowerCase()} submission has been logged into our queue. We review every note directly.
              </p>
              <button
                onClick={reset}
                className="px-5 py-2.5 rounded-lg text-xs sm:text-sm font-medium bg-sky-500 hover:bg-sky-400 text-white shadow-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                Submit another idea
              </button>
            </motion.div>
          ) : (
            /* Form State */
            <div className="p-6 sm:p-8 rounded-2xl bg-[#0D1017] border border-[#1A2030] space-y-5 shadow-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5 font-medium">
                    Your Name <span className="text-slate-500 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Liam Parker"
                    className="w-full px-3.5 py-2.5 bg-[#11141E] border border-[#202738] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus-visible:ring-1 focus-visible:ring-sky-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5 font-medium">
                    Your Email <span className="text-slate-500 font-normal">(optional)</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="liam@creator.com"
                    className="w-full px-3.5 py-2.5 bg-[#11141E] border border-[#202738] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus-visible:ring-1 focus-visible:ring-sky-500 transition-colors font-mono"
                  />
                </div>
              </div>

              {/* Suggestion Type */}
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2 font-medium">
                  Category
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {TYPES.map((t) => {
                    const active = t === type;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setType(t)}
                        className={`p-3 rounded-xl text-xs font-medium border transition-colors text-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                          active
                            ? "bg-sky-500/15 border-sky-500/40 text-sky-200 shadow-sm"
                            : "bg-[#11141E] border-[#202738] text-slate-400 hover:text-white hover:border-slate-600"
                        }`}
                      >
                        <span className="block text-base mb-1">{TYPE_ICON[t]}</span>
                        <span>{t}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5 font-medium">
                  Message / Details <span className="text-rose-400">*</span>
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  placeholder="Describe your feature concept, source suggestion, or bug encounter in detail…"
                  className="w-full p-3.5 bg-[#11141E] border border-[#202738] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus-visible:ring-1 focus-visible:ring-sky-500 transition-colors resize-none leading-relaxed font-sans"
                />
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs font-mono">
                  {error}
                </div>
              )}

              <button
                onClick={submit}
                disabled={submitting}
                className="w-full py-2.5 rounded-lg font-medium text-xs sm:text-sm bg-sky-500 hover:bg-sky-400 text-white shadow-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                {submitting ? (
                  <>
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span>Submitting feedback…</span>
                  </>
                ) : (
                  <span>Submit Suggestion 🚀</span>
                )}
              </button>
            </div>
          )}
        </AnimatePresence>
      </div>
    </StudioShell>
  );
}
