"use client";
import UsageSummary from '../UsageSummary';

import React, { useState, useRef, useEffect } from "react";

import { motion } from "framer-motion";
import { CURATED_VOICES } from "@/app/lib/server/tts/voices";
import { TTSVoice } from "@/app/lib/server/tts/types";


export interface VoiceConfigState {
  voiceId: string;
  speed: number;
  stability: number;
  language: string;
  emotion: string;
}

interface VoiceSelectorProps {
  voiceConfig: VoiceConfigState;
  onVoiceConfigChange: (config: VoiceConfigState) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  userCredits?: number | null;
  scriptWordsCount: number;
}

const LANGUAGES = [
  "English (US)",
  "English (UK)",
  "Spanish (ES)",
  "French (FR)",
  "German (DE)",
  "Japanese (JA)",
  "Hindi (IN)",
];

const EMOTIONS = [
  { id: "neutral", label: "Neutral / Conversational", icon: "🎙️" },
  { id: "excited", label: "Excited / Energetic", icon: "⚡" },
  { id: "dramatic", label: "Dramatic / Cinematic", icon: "🎬" },
  { id: "calm", label: "Calm / Storyteller", icon: "🌙" },
];

export default function VoiceSelector({
  voiceConfig,
  onVoiceConfigChange,
  onGenerate,
  isGenerating,
  scriptWordsCount,
}: VoiceSelectorProps) {
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentOscillatorRef = useRef<OscillatorNode | null>(null);

  const stopPreview = React.useCallback(() => {
    if (currentOscillatorRef.current) {
      try {
        currentOscillatorRef.current.stop();
        currentOscillatorRef.current.disconnect();
      } catch {}
      currentOscillatorRef.current = null;
    }
    setPlayingVoiceId(null);
  }, []);

  // Stop preview on unmount
  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, [stopPreview]);

  // Live in-browser audible voice preview
  function playVoicePreview(voice: TTSVoice, e: React.MouseEvent) {
    e.stopPropagation();

    if (playingVoiceId === voice.id) {
      stopPreview();
      return;
    }

    stopPreview();
    setPlayingVoiceId(voice.id);

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Pitch variation based on voice character
      const baseFreq = voice.gender === "female" ? 240 : 130;
      osc.type = "sine";
      osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);

      // Pitch cadence envelope resembling speech prosody
      osc.frequency.linearRampToValueAtTime(baseFreq + 35, ctx.currentTime + 0.3);
      osc.frequency.linearRampToValueAtTime(baseFreq - 15, ctx.currentTime + 0.7);
      osc.frequency.linearRampToValueAtTime(baseFreq + 10, ctx.currentTime + 1.2);
      osc.frequency.linearRampToValueAtTime(baseFreq - 20, ctx.currentTime + 1.8);

      // Gain envelope
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.18, ctx.currentTime + 1.6);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.0);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      currentOscillatorRef.current = osc;

      osc.onended = () => {
        setPlayingVoiceId(null);
      };
      setTimeout(() => {
        stopPreview();
      }, 2000);
    } catch {
      setPlayingVoiceId(null);
    }
  }

  const selectedVoice =
    CURATED_VOICES.find((v) => v.id === voiceConfig.voiceId) || CURATED_VOICES[0];



  return (
    <div className="flex flex-col gap-6">
      {/* Top Header */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-sm font-mono uppercase tracking-wider font-bold text-white flex items-center gap-2">
            <span>🎙️</span>
            <span>Select AI Voice</span>
          </h3>
          <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300">
            Character allowance
          </span>
        </div>
        <p className="text-xs text-slate-400 font-sans">
          Choose a natural, cinematic voice model. Audio generation includes word-level synchronization for auto captions.
        </p>
      </div>

      {/* Voice Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CURATED_VOICES.map((voice) => {
          const isSelected = voice.id === voiceConfig.voiceId;
          const isPlaying = playingVoiceId === voice.id;

          return (
            <motion.div
              key={voice.id}
              onClick={() => onVoiceConfigChange({ ...voiceConfig, voiceId: voice.id })}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer relative text-left ${
                isSelected
                  ? "bg-sky-500/10 border-sky-500/40"
                  : "bg-[#11141E] border-[#1E2536] hover:border-slate-600"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-heading font-bold text-sm text-white truncate">
                      {voice.name}
                    </span>
                    <span
                      className={`text-[9px] font-mono uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${
                        voice.category === "Cinematic"
                          ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                          : voice.category === "Energetic"
                          ? "bg-rose-500/15 border-rose-500/30 text-rose-300"
                          : voice.category === "Storyteller"
                          ? "bg-purple-500/15 border-purple-500/30 text-purple-300"
                          : "bg-sky-500/15 border-sky-500/30 text-sky-300"
                      }`}
                    >
                      {voice.category}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 block">
                    {voice.accent} · {voice.gender}
                  </span>
                </div>

                {/* Audio preview button */}
                <button
                  type="button"
                  onClick={(e) => playVoicePreview(voice, e)}
                  title="Listen to preview sample"
                  aria-label={isPlaying ? "Stop audio preview" : `Play sample of ${voice.name}`}
                  className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                    isPlaying
                      ? "bg-sky-500 text-white"
                      : "bg-[#0A0D14] border border-[#1A2030] text-slate-300 hover:text-white hover:border-sky-500/50"
                  }`}
                >
                  {isPlaying ? (
                    <span className="flex items-center gap-0.5 h-3">
                      <span className="w-0.5 h-3 bg-white animate-pulse" />
                      <span className="w-0.5 h-2 bg-white animate-pulse delay-75" />
                      <span className="w-0.5 h-3 bg-white animate-pulse delay-150" />
                    </span>
                  ) : (
                    <span className="text-xs">▶</span>
                  )}
                </button>
              </div>

              <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed font-sans">
                {voice.description}
              </p>

              {isSelected && (
                <div className="mt-2.5 pt-2 border-t border-sky-500/20 flex items-center justify-between text-[10px] font-mono text-sky-400">
                  <span>Selected Model</span>
                  <span>✓ Active</span>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Progressive Disclosure: Advanced Voice Settings Accordion */}
      <div className="rounded-xl bg-[#0D1017] border border-[#1A2030] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSettings((prev) => !prev)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-[#11141E] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          aria-expanded={showSettings}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-sm">⚙️</span>
            <div>
              <div className="text-xs font-semibold text-white">
                Fine-Tune Voice Settings · {selectedVoice.name}
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                {voiceConfig.speed.toFixed(2)}x speed · {(voiceConfig.stability * 100).toFixed(0)}% stability · {voiceConfig.language}
              </div>
            </div>
          </div>
          <span className="text-xs text-sky-400 font-mono flex items-center gap-1.5 shrink-0">
            <span>{showSettings ? "Hide Settings" : "Adjust"}</span>
            <span className={`inline-block transition-transform duration-200 ${showSettings ? "rotate-180" : ""}`}>
              ▼
            </span>
          </span>
        </button>

        {showSettings && (
          <div className="p-4 border-t border-[#1A2030] space-y-4 bg-[#0A0D14]/60">
            {/* Speed Slider */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-slate-300">Pacing / Speed</span>
                <span className="font-mono text-sky-400 tabular-nums">{voiceConfig.speed.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.7}
                max={1.5}
                step={0.05}
                value={voiceConfig.speed}
                onChange={(e) =>
                  onVoiceConfigChange({ ...voiceConfig, speed: parseFloat(e.target.value) })
                }
                className="w-full h-1.5 bg-[#1B2030] rounded-lg appearance-none cursor-pointer accent-sky-500"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
                <span>0.7x (Deliberate)</span>
                <span>1.0x (Natural)</span>
                <span>1.5x (Fast viral)</span>
              </div>
            </div>

            {/* Stability / Style Slider */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-slate-300">Tone Stability / Style</span>
                <span className="font-mono text-sky-400 tabular-nums">
                  {(voiceConfig.stability * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0.2}
                max={0.9}
                step={0.05}
                value={voiceConfig.stability}
                onChange={(e) =>
                  onVoiceConfigChange({ ...voiceConfig, stability: parseFloat(e.target.value) })
                }
                className="w-full h-1.5 bg-[#1B2030] rounded-lg appearance-none cursor-pointer accent-sky-500"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
                <span>Expressive / Dynamic</span>
                <span>Stable / Consistent</span>
              </div>
            </div>

            {/* Language & Emotion Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[11px] font-mono font-semibold text-slate-400 block mb-1">
                  Language
                </label>
                <select
                  value={voiceConfig.language}
                  onChange={(e) => onVoiceConfigChange({ ...voiceConfig, language: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#12151E] border border-[#202534] text-xs text-white focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang} value={lang} className="bg-[#08090C] text-white">
                      {lang}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-mono font-semibold text-slate-400 block mb-1">
                  Intonation / Tone
                </label>
                <select
                  value={voiceConfig.emotion}
                  onChange={(e) => onVoiceConfigChange({ ...voiceConfig, emotion: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#12151E] border border-[#202534] text-xs text-white focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  {EMOTIONS.map((em) => (
                    <option key={em.id} value={em.id} className="bg-[#08090C] text-white">
                      {em.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      <UsageSummary compact feature="voice"/>
      {/* Credit status & Generate CTA */}
      <div className="space-y-3">

          <div className="flex items-center justify-between text-xs px-1 text-slate-400">
            <span>
              Script size: <strong className="text-slate-200">{scriptWordsCount} words</strong>
            </span>
            <span>
              Uses your monthly character allowance
            </span>
          </div>


        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating}
          className="w-full py-3 px-4 rounded-xl font-medium text-xs sm:text-sm bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          {isGenerating ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Generating your voiceover...</span>
            </>
          ) : (
            <>
              <span>Generate Voiceover</span>
              <span>🎙️</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
