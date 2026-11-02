"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { overlayVariants, modalVariants } from "../../lib/motion";

interface VoiceGeneratorModalProps {
  open: boolean;
  onClose: () => void;
  onUseInScript: (voiceId: string) => void;
}

export default function VoiceGeneratorModal({
  open,
  onClose,
  onUseInScript,
}: VoiceGeneratorModalProps) {
  const [selectedVoice, setSelectedVoice] = useState("21m00Tcm4TlvDq8ikWAM"); // Rachel
  const [playing, setPlaying] = useState<string | null>(null);

  const voices = [
    {
      id: "21m00Tcm4TlvDq8ikWAM",
      name: "Rachel",
      gender: "Female",
      accent: "American",
      tone: "Calm & Professional",
      bestFor: "Explainer & Documentaries",
    },
    {
      id: "pNInz6obpgDQGcFmaJgB",
      name: "Adam",
      gender: "Male",
      accent: "American",
      tone: "Deep & Authoritative",
      bestFor: "Tech News & Storytelling",
    },
    {
      id: "ErXwobaYiN019PkySvjV",
      name: "Antoni",
      gender: "Male",
      accent: "American",
      tone: "Energetic & Dynamic",
      bestFor: "Shorts & Viral Hooks",
    },
    {
      id: "EXAVITQu4vr4xnSDxMaL",
      name: "Bella",
      gender: "Female",
      accent: "British",
      tone: "Sophisticated & Warm",
      bestFor: "Lifestyle & Travel Vlogs",
    },
  ];

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
          />

          <motion.div
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative w-full max-w-xl rounded-2xl bg-[#0D1017] border border-[#1A2030] shadow-2xl p-6 sm:p-7 z-10 space-y-5 select-none"
          >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <line x1="12" y1="2" x2="12" y2="22" />
                  <line x1="6" y1="6" x2="6" y2="18" />
                  <line x1="18" y1="8" x2="18" y2="16" />
                </svg>
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  AI Voice Generator
                </h3>
                <p className="text-xs text-slate-400">
                  Ultra-realistic voice models with human cadence and emotional range.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#151924] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Voices List */}
          <div className="space-y-2.5">
            {voices.map((v) => {
              const isSelected = selectedVoice === v.id;
              const isPlayingThis = playing === v.id;

              return (
                <div
                  key={v.id}
                  onClick={() => setSelectedVoice(v.id)}
                  className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-sky-500/10 border-sky-500/40"
                      : "bg-[#11141E] border-[#1E2536] hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Play Sample Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPlaying(isPlayingThis ? null : v.id);
                      }}
                      aria-label={isPlayingThis ? "Stop audio preview" : `Play preview of ${v.name}`}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                        isPlayingThis
                          ? "bg-sky-500 text-white"
                          : "bg-[#0A0D14] border border-[#1A2030] text-slate-300 hover:text-white hover:border-sky-500/40"
                      }`}
                    >
                      {isPlayingThis ? (
                        <svg className="w-3.5 h-3.5 fill-current animate-pulse" viewBox="0 0 24 24">
                          <rect x="6" y="4" width="4" height="16" />
                          <rect x="14" y="4" width="4" height="16" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5 fill-current translate-x-0.5" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-semibold text-white">{v.name}</span>
                        <span className="text-[10px] text-slate-400 bg-[#0A0D14] px-1.5 py-0.5 rounded border border-[#1A2030]">
                          {v.gender} • {v.accent}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {v.tone} — <span className="text-slate-500">{v.bestFor}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-sky-400" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Actions */}
          <div className="pt-2 border-t border-[#171B26] flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-mono">
              Server-Managed ElevenLabs Engine
            </span>
            <button
              type="button"
              onClick={() => {
                onClose();
                onUseInScript(selectedVoice);
              }}
              className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-medium text-xs sm:text-sm shadow-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              Use Selected Voice in Script →
            </button>
          </div>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
}
