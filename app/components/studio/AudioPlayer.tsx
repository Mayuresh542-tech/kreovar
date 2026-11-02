"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";

export interface SceneItem {
  id: string;
  label?: string;
  text: string;
  audioUrl?: string;
  duration?: number;
}

interface AudioPlayerProps {
  audioUrl: string;
  duration: number;
  scenes?: SceneItem[];
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  onRegenerateVoice?: () => void;
  onRegenerateScene?: (sceneId: string, text: string) => void;
  isRegenerating?: boolean;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function AudioPlayer({
  audioUrl,
  duration,
  scenes,
  currentTime,
  onTimeUpdate,
  onPlayStateChange,
  onRegenerateVoice,
  onRegenerateScene,
  isRegenerating = false,
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [regeneratingSceneId, setRegeneratingSceneId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sceneAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    onPlayStateChange?.(isPlaying);
  }, [isPlaying, onPlayStateChange]);

  // Sync external currentTime changes if needed
  useEffect(() => {
    if (audioRef.current && Math.abs(audioRef.current.currentTime - currentTime) > 0.4) {
      audioRef.current.currentTime = currentTime;
    }
  }, [currentTime]);

  function togglePlay() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      // Pause any active scene audio
      if (sceneAudioRef.current) {
        sceneAudioRef.current.pause();
        setActiveSceneId(null);
      }
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  }

  function handleReplay() {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    onTimeUpdate(0);
    audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
    onTimeUpdate(val);
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
    }
    setIsMuted(val === 0);
  }

  function toggleMute() {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.volume = volume || 0.8;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  }

  // Scene-level playback
  function playScene(scene: SceneItem) {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }

    if (activeSceneId === scene.id && sceneAudioRef.current) {
      sceneAudioRef.current.pause();
      setActiveSceneId(null);
      return;
    }

    if (!scene.audioUrl) {
      return;
    }

    if (sceneAudioRef.current) {
      sceneAudioRef.current.pause();
    }

    const audio = new Audio(scene.audioUrl);
    sceneAudioRef.current = audio;
    audio.volume = volume;
    setActiveSceneId(scene.id);

    audio.play().catch(() => setActiveSceneId(null));
    audio.onended = () => setActiveSceneId(null);
  }

  async function handleSceneRegen(scene: SceneItem) {
    if (!onRegenerateScene) return;
    setRegeneratingSceneId(scene.id);
    try {
      await onRegenerateScene(scene.id, scene.text);
    } finally {
      setRegeneratingSceneId(null);
    }
  }

  const [loadedDuration, setLoadedDuration] = useState(0);
  const effectiveDuration = duration > 0 ? duration : loadedDuration;

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={audioUrl}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (!isNaN(d) && d > 0) {
            setLoadedDuration(d);
          }
        }}
        onTimeUpdate={(e) => {
          onTimeUpdate(e.currentTarget.currentTime);
        }}
        onEnded={() => {
          setIsPlaying(false);
          onTimeUpdate(0);
        }}
      />

      {/* Main Professional Audio Player Card */}
      <div className="rounded-2xl bg-[#0D0F15] border border-[#202534] p-4 sm:p-5 shadow-[0_8px_30px_rgb(0,0,0,0.45)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono uppercase font-bold tracking-wider text-slate-300">
              VOICEOVER AUDIO
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onRegenerateVoice && (
              <button
                type="button"
                onClick={onRegenerateVoice}
                disabled={isRegenerating}
                className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold bg-[#12151E] border border-[#202534] text-slate-300 hover:text-white hover:border-sky-500/40 transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                <span>{isRegenerating ? "Regenerating..." : "↻ Regenerate Voiceover"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Visual Waveform Frequency Animation */}
        <div className="h-10 w-full rounded-xl bg-[#08090C] border border-[#1B2030] px-3 flex items-center justify-between gap-1 overflow-hidden my-3">
          {Array.from({ length: 32 }).map((_, i) => {
            const progress = effectiveDuration > 0 ? currentTime / effectiveDuration : 0;
            const barProgress = i / 32;
            const isPassed = barProgress <= progress;

            // Varied heights for realistic audio look
            const heights = [35, 60, 45, 80, 100, 50, 70, 90, 40, 65, 85, 95, 30, 75, 60, 90, 100, 55, 70, 40, 80, 65, 50, 85, 95, 60, 40, 75, 55, 90, 45, 60];
            const heightPercent = heights[i % heights.length];

            return (
              <div
                key={i}
                style={{ height: `${heightPercent}%` }}
                className={`w-full rounded-full transition-all duration-150 ${
                  isPassed
                    ? "bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.5)]"
                    : "bg-[#1E2333]"
                } ${isPlaying && isPassed ? "animate-pulse" : ""}`}
              />
            );
          })}
        </div>

        {/* Scrubber Progress Bar */}
        <div className="space-y-1.5">
          <input
            type="range"
            min={0}
            max={effectiveDuration || 1}
            step={0.05}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-[#1B2030] rounded-lg appearance-none cursor-pointer accent-sky-400"
          />

          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(effectiveDuration)}</span>
          </div>
        </div>

        {/* Playback Controls Row */}
        <div className="flex items-center justify-between pt-3 border-t border-[#1B2030] mt-3">
          {/* Replay */}
          <button
            type="button"
            onClick={handleReplay}
            title="Replay from start"
            className="p-2 rounded-lg bg-[#12151E] border border-[#202534] text-slate-400 hover:text-white transition-colors cursor-pointer text-xs"
          >
            ⏮ Restart
          </button>

          {/* Primary Play / Pause Button */}
          <motion.button
            type="button"
            onClick={togglePlay}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-6 py-2 rounded-full font-bold text-xs uppercase tracking-wider bg-sky-500 hover:bg-sky-400 text-white shadow-[0_0_20px_rgba(14,165,233,0.35)] flex items-center gap-2 cursor-pointer"
          >
            <span className="text-sm">{isPlaying ? "⏸" : "▶"}</span>
            <span>{isPlaying ? "Pause" : "Play Voiceover"}</span>
          </motion.button>

          {/* Volume Control */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              {isMuted || volume === 0 ? "🔇" : "🔊"}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-16 h-1 bg-[#1B2030] rounded-lg appearance-none cursor-pointer accent-sky-400 hidden sm:block"
            />
          </div>
        </div>
      </div>

      {/* Scene-Level Voiceover Breakdown if scenes are present */}
      {scenes && scenes.length > 0 && (
        <div className="rounded-2xl bg-[#0D0F15] border border-[#202534] p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <span>🎬</span>
              <span>Scene-Level Voiceover Breakdown</span>
            </h4>
            <span className="text-[10px] font-mono text-slate-500">
              {scenes.length} Scenes · Modular Regeneration
            </span>
          </div>
          <p className="text-xs text-slate-400 font-sans">
            Preview or regenerate individual scenes without recreating the entire script voiceover.
          </p>

          <div className="space-y-2 pt-1">
            {scenes.map((scene, idx) => {
              const isScenePlaying = activeSceneId === scene.id;
              const isSceneRegenerating = regeneratingSceneId === scene.id;

              return (
                <div
                  key={scene.id || idx}
                  className="p-3 rounded-xl bg-[#12151E] border border-[#202534] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-500/15 border border-sky-500/30 text-sky-300">
                        {scene.label || `Scene ${idx + 1}`}
                      </span>
                      {scene.duration && (
                        <span className="text-[10px] font-mono text-slate-500">
                          ~{scene.duration.toFixed(1)}s
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 font-sans line-clamp-2 leading-relaxed">
                      {scene.text}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Play Scene Button */}
                    <button
                      type="button"
                      onClick={() => playScene(scene)}
                      disabled={!scene.audioUrl}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                        isScenePlaying
                          ? "bg-sky-500 text-white border-sky-400 shadow-[0_0_12px_rgba(14,165,233,0.4)]"
                          : "bg-[#08090C] border-[#202534] text-slate-300 hover:text-white hover:border-sky-500/40"
                      } disabled:opacity-40`}
                    >
                      <span>{isScenePlaying ? "⏸ Pause" : "▶ Play"}</span>
                    </button>

                    {/* Regenerate Scene Button */}
                    {onRegenerateScene && (
                      <button
                        type="button"
                        onClick={() => handleSceneRegen(scene)}
                        disabled={isSceneRegenerating}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-[#08090C] border border-[#202534] text-slate-400 hover:text-white hover:border-slate-600 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {isSceneRegenerating ? "Regen..." : "↻ Regenerate"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
