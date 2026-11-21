"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  Scissors,
  VolumeX,
  Sparkles,
  Sliders,
  Check,
  AlertCircle,
  Play,
  RotateCcw,
  Zap,
  Volume2
} from "lucide-react";
import { useEditor } from "./EditorContext";
import { useProject } from "@/app/lib/editor/store";
import { projectDuration } from "@/app/lib/editor/model";
import {
  detectSilences,
  SilenceDetectionResult,
  DetectedSilenceRange
} from "@/app/lib/editor/audioSilenceDetector";
import { rippleCut, CutRange } from "@/app/lib/editor/rippleCut";

interface SilenceTrimmerControlsProps {
  compact?: boolean;
}

export default function SilenceTrimmerControls({ compact = false }: SilenceTrimmerControlsProps) {
  const { store, notify, detectedSilences = [], setDetectedSilences } = useEditor();
  const project = useProject(store);

  // Studio Sliders & Toggles
  const [thresholdDb, setThresholdDb] = useState<number>(-38); // -50 to -20 dB
  const [minPauseDuration, setMinPauseDuration] = useState<number>(0.40); // 0.20s to 2.0s
  const [breathPaddingMs, setBreathPaddingMs] = useState<number>(70); // 0ms to 200ms
  const [removeFillerWords, setRemoveFillerWords] = useState<boolean>(false);
  const [alternateCadence, setAlternateCadence] = useState<boolean>(true);
  const [lastScanResult, setLastScanResult] = useState<SilenceDetectionResult | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  // Extract speech words and waveforms from project
  const speechWords = useMemo(() => {
    const list: Array<{ word: string; start: number; end: number }> = [];
    for (const clip of Object.values(project.clips)) {
      if (clip.contentId && project.captions[clip.contentId]?.words) {
        const words = project.captions[clip.contentId].words || [];
        for (const w of words) {
          const start = clip.startTime + (w.start - clip.sourceStart) / clip.speed;
          const end = clip.startTime + (w.end - clip.sourceStart) / clip.speed;
          list.push({ word: w.word, start, end });
        }
      }
    }
    return list.sort((a, b) => a.start - b.start);
  }, [project.clips, project.captions]);

  // Primary video/audio asset waveform if available
  const primaryWaveform = useMemo(() => {
    for (const trackId of project.trackOrder) {
      const track = project.tracks[trackId];
      if (track && (track.kind === "video" || track.kind === "audio") && !track.locked) {
        for (const clipId of track.clipIds) {
          const clip = project.clips[clipId];
          if (clip?.assetId && project.assets[clip.assetId]?.waveform) {
            return project.assets[clip.assetId].waveform;
          }
        }
      }
    }
    return undefined;
  }, [project.tracks, project.trackOrder, project.clips, project.assets]);

  // Handle Scanning Silences
  const handleScanSilences = useCallback(() => {
    setIsScanning(true);
    try {
      const duration = projectDuration(project);
      const padSec = breathPaddingMs / 1000;
      const padBefore = Math.max(0, padSec - 0.010);
      const padAfter = padSec + 0.010;

      const result = detectSilences(
        {
          words: speechWords,
          waveform: primaryWaveform,
          duration
        },
        {
          thresholdDb,
          minSilenceDuration: minPauseDuration,
          paddingBefore: padBefore,
          paddingAfter: padAfter,
          minKeptGap: 0.15,
          removeFillerWords
        }
      );

      setLastScanResult(result);
      if (setDetectedSilences) {
        setDetectedSilences(result.silentRanges);
      }

      if (result.cutCount > 0) {
        notify(`Detected ${result.cutCount} silent pause(s) totaling ${result.totalSilenceDuration.toFixed(2)}s.`);
      } else {
        notify("No silent gaps > " + minPauseDuration.toFixed(2) + "s detected.");
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "Silence scan failed.");
    } finally {
      setIsScanning(false);
    }
  }, [
    project,
    speechWords,
    primaryWaveform,
    thresholdDb,
    minPauseDuration,
    breathPaddingMs,
    removeFillerWords,
    setDetectedSilences,
    notify
  ]);

  // Handle Ripple Cutting All Silences
  const handleTrimSilences = useCallback(() => {
    const rangesToCut = detectedSilences.length > 0
      ? detectedSilences
      : lastScanResult?.silentRanges || [];

    if (!rangesToCut.length) {
      notify("Scan for silences first, or adjust sensitivity.");
      return;
    }

    try {
      const cuts: CutRange[] = rangesToCut.map(r => ({ start: r.start, end: r.end }));
      const totalSec = rangesToCut.reduce((sum, r) => sum + r.duration, 0);

      store.execute(p =>
        rippleCut(p, cuts, {
          alternateCadence,
          applyMicroFades: true,
          microFadeDuration: 0.020,
          punchInScale: 1.16,
          punchInAnchorY: 0.36
        })
      );

      if (setDetectedSilences) {
        setDetectedSilences([]);
      }
      setLastScanResult(null);

      notify(
        `Trimmed ${cuts.length} pause(s) (${totalSec.toFixed(2)}s cut). Micro-fades applied. Undo restores original timing.`
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : "Silence ripple cut failed.");
    }
  }, [detectedSilences, lastScanResult, store, alternateCadence, setDetectedSilences, notify]);

  const handleClearHighlights = useCallback(() => {
    if (setDetectedSilences) {
      setDetectedSilences([]);
    }
    setLastScanResult(null);
  }, [setDetectedSilences]);

  const hasSilences = detectedSilences.length > 0;
  const totalSilenceSeconds = detectedSilences.reduce((sum, r) => sum + r.duration, 0);

  return (
    <div className={`space-y-4 text-slate-800 ${compact ? "text-xs" : "text-sm"}`}>
      {/* Header Banner */}
      <div className="flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50/80 border border-blue-200/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-600 text-white shadow-xs">
            <Scissors size={compact ? 16 : 18} />
          </div>
          <div>
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              <span>Silence Trimmer Studio</span>
              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded-full font-medium">
                Dual-Mode
              </span>
            </div>
            <div className="text-[11px] text-slate-500">
              Acoustic RMS waveform & speech gap detection
            </div>
          </div>
        </div>
      </div>

      {/* Control Sliders Card */}
      <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3.5">
        {/* 1. Sensitivity / Threshold Slider */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-slate-700 flex items-center gap-1">
              <VolumeX size={13} className="text-slate-500" />
              <span>Sensitivity (dBFS)</span>
            </span>
            <span className="font-mono text-slate-900 bg-white px-1.5 py-0.5 rounded border border-slate-200 text-[11px]">
              {thresholdDb} dB
            </span>
          </div>
          <input
            type="range"
            min={-50}
            max={-20}
            step={1}
            value={thresholdDb}
            onChange={e => setThresholdDb(Number(e.target.value))}
            aria-label="Silence threshold in dBFS"
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-[10px] text-slate-500 px-0.5">
            <span>-50 dB (Whisper/Quiet)</span>
            <span>-38 dB (Default)</span>
            <span>-20 dB (Aggressive)</span>
          </div>
        </div>

        {/* 2. Min Pause Duration Slider */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-slate-700">Min Pause Duration</span>
            <span className="font-mono text-slate-900 bg-white px-1.5 py-0.5 rounded border border-slate-200 text-[11px]">
              {minPauseDuration.toFixed(2)}s
            </span>
          </div>
          <input
            type="range"
            min={0.20}
            max={2.0}
            step={0.05}
            value={minPauseDuration}
            onChange={e => setMinPauseDuration(Number(e.target.value))}
            aria-label="Minimum silence pause duration"
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-[10px] text-slate-500 px-0.5">
            <span>0.2s (Fast cuts)</span>
            <span>0.4s (Natural)</span>
            <span>2.0s (Long pauses only)</span>
          </div>
        </div>

        {/* 3. Breath Padding Slider */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-slate-700">Breath Padding</span>
            <span className="font-mono text-slate-900 bg-white px-1.5 py-0.5 rounded border border-slate-200 text-[11px]">
              {breathPaddingMs}ms
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={200}
            step={10}
            value={breathPaddingMs}
            onChange={e => setBreathPaddingMs(Number(e.target.value))}
            aria-label="Breath padding around words"
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-[10px] text-slate-500 px-0.5">
            <span>0ms (Tight jump cut)</span>
            <span>70ms (Clean attack)</span>
            <span>200ms (Relaxed)</span>
          </div>
        </div>

        {/* 4. Filler Words & Pacing Cadence Toggles */}
        <div className="pt-2 border-t border-slate-200/80 space-y-2">
          <label className="flex items-center justify-between cursor-pointer select-none">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={removeFillerWords}
                onChange={e => setRemoveFillerWords(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
              />
              <span className="text-xs font-medium text-slate-800">
                Flag filler tokens (“umm”, “uh”, “aa”, “hmm”, “matlab”)
              </span>
            </div>
          </label>

          <label className="flex items-center justify-between cursor-pointer select-none">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={alternateCadence}
                onChange={e => setAlternateCadence(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
              />
              <span className="text-xs font-medium text-slate-800">
                Punch-in jump cut cadence (1.16x zoom on cuts)
              </span>
            </div>
            <Zap size={13} className="text-amber-500" />
          </label>
        </div>
      </div>

      {/* Detection Results Badge & Feedback */}
      {hasSilences && (
        <div className="p-3 rounded-2xl bg-amber-50/90 border border-amber-300 flex items-start justify-between gap-2 shadow-xs">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-xs font-semibold text-amber-950">
                Found {detectedSilences.length} pause{detectedSilences.length > 1 ? "s" : ""} (
                {totalSilenceSeconds.toFixed(2)}s silence)
              </div>
              <div className="text-[11px] text-amber-800">
                Highlighted with visual shading on timeline. Ready for multi-track ripple cut.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClearHighlights}
            title="Clear timeline highlights"
            className="text-[11px] text-amber-700 hover:text-amber-900 underline font-medium px-1 py-0.5"
          >
            Clear
          </button>
        </div>
      )}

      {/* Scan & Trim Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleScanSilences}
          disabled={isScanning}
          className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 active:bg-slate-200 text-slate-800 font-semibold text-xs flex items-center justify-center gap-1.5 border border-slate-200 transition-all active:scale-[0.99] disabled:opacity-50"
        >
          <Sparkles size={14} className="text-blue-600" />
          <span>{isScanning ? "Scanning…" : "Scan Silences"}</span>
        </button>

        <button
          type="button"
          onClick={handleTrimSilences}
          disabled={!hasSilences}
          className={`min-h-[44px] px-3 py-2 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-[0.99] ${
            hasSilences
              ? "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-xs cursor-pointer"
              : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
          }`}
        >
          <Scissors size={14} />
          <span>Trim All Silences</span>
        </button>
      </div>

      <div className="text-[11px] text-slate-500 text-center flex items-center justify-center gap-1">
        <Volume2 size={12} className="text-slate-400" />
        <span>Synchronized across video, audio, B-roll & captions · 20ms micro-fades</span>
      </div>
    </div>
  );
}
