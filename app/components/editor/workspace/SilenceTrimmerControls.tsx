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
      {/* CapCut-Style Basic Section Header (Matching Image 3) */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-sky-500 flex items-center justify-center text-white text-[10px] font-bold">
            ✓
          </div>
          <span className="font-semibold text-xs text-slate-900 tracking-tight">Basic</span>
          <span className="text-[10px] text-slate-400">▴</span>
        </div>
        <button
          type="button"
          onClick={() => {
            setThresholdDb(-38);
            setMinPauseDuration(0.40);
            setBreathPaddingMs(70);
            setRemoveFillerWords(false);
            setAlternateCadence(true);
          }}
          title="Reset to default settings"
          className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
        >
          <RotateCcw size={13} />
        </button>
      </div>

      {/* Control Sliders with StepperBox (Matching Image 3 & 4) */}
      <div className="space-y-3">
        {/* 1. Sensitivity / Threshold Slider */}
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="w-24 shrink-0 text-slate-700 font-medium">Sensitivity</span>
          <div className="flex-1 relative flex items-center">
            <input
              type="range"
              min={-50}
              max={-20}
              step={1}
              value={thresholdDb}
              onChange={e => setThresholdDb(Number(e.target.value))}
              aria-label="Silence threshold in dBFS"
              className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-500"
            />
          </div>
          <div className="w-18 shrink-0 flex items-center justify-between bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono">
            <span>{thresholdDb}dB</span>
            <div className="flex flex-col text-[8px] leading-[8px] text-slate-400 ml-1">
              <button
                type="button"
                onClick={() => setThresholdDb(Math.min(-20, thresholdDb + 1))}
                className="hover:text-slate-800"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => setThresholdDb(Math.max(-50, thresholdDb - 1))}
                className="hover:text-slate-800"
              >
                ▼
              </button>
            </div>
          </div>
        </div>

        {/* 2. Min Pause Duration Slider */}
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="w-24 shrink-0 text-slate-700 font-medium">Min Pause</span>
          <div className="flex-1 relative flex items-center">
            <input
              type="range"
              min={0.20}
              max={2.0}
              step={0.05}
              value={minPauseDuration}
              onChange={e => setMinPauseDuration(Number(e.target.value))}
              aria-label="Minimum silence pause duration"
              className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-500"
            />
          </div>
          <div className="w-18 shrink-0 flex items-center justify-between bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono">
            <span>{minPauseDuration.toFixed(2)}s</span>
            <div className="flex flex-col text-[8px] leading-[8px] text-slate-400 ml-1">
              <button
                type="button"
                onClick={() => setMinPauseDuration(Math.min(2.0, +(minPauseDuration + 0.05).toFixed(2)))}
                className="hover:text-slate-800"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => setMinPauseDuration(Math.max(0.20, +(minPauseDuration - 0.05).toFixed(2)))}
                className="hover:text-slate-800"
              >
                ▼
              </button>
            </div>
          </div>
        </div>

        {/* 3. Breath Padding Slider */}
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="w-24 shrink-0 text-slate-700 font-medium">Padding</span>
          <div className="flex-1 relative flex items-center">
            <input
              type="range"
              min={0}
              max={200}
              step={10}
              value={breathPaddingMs}
              onChange={e => setBreathPaddingMs(Number(e.target.value))}
              aria-label="Breath padding around words"
              className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-500"
            />
          </div>
          <div className="w-18 shrink-0 flex items-center justify-between bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono">
            <span>{breathPaddingMs}ms</span>
            <div className="flex flex-col text-[8px] leading-[8px] text-slate-400 ml-1">
              <button
                type="button"
                onClick={() => setBreathPaddingMs(Math.min(200, breathPaddingMs + 10))}
                className="hover:text-slate-800"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => setBreathPaddingMs(Math.max(0, breathPaddingMs - 10))}
                className="hover:text-slate-800"
              >
                ▼
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Options: Clean Toggles */}
      <div className="pt-2 border-t border-slate-200 space-y-2">
        <label className="flex items-center justify-between cursor-pointer select-none text-xs">
          <span className="text-slate-700">Remove filler words (“umm”, “uh”)</span>
          <input
            type="checkbox"
            checked={removeFillerWords}
            onChange={e => setRemoveFillerWords(e.target.checked)}
            className="rounded border-slate-300 text-sky-500 focus:ring-sky-400 w-3.5 h-3.5 cursor-pointer"
          />
        </label>

        <label className="flex items-center justify-between cursor-pointer select-none text-xs">
          <span className="text-slate-700">Punch-in cadence on cuts</span>
          <input
            type="checkbox"
            checked={alternateCadence}
            onChange={e => setAlternateCadence(e.target.checked)}
            className="rounded border-slate-300 text-sky-500 focus:ring-sky-400 w-3.5 h-3.5 cursor-pointer"
          />
        </label>
      </div>

      {/* Detection Results Badge & Feedback */}
      {hasSilences && (
        <div className="p-2.5 rounded-lg bg-sky-50 border border-sky-200 flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="text-sky-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-xs font-semibold text-sky-950">
                Found {detectedSilences.length} pause{detectedSilences.length > 1 ? "s" : ""} (
                {totalSilenceSeconds.toFixed(2)}s)
              </div>
              <div className="text-[11px] text-sky-700">
                Ready for multi-track ripple cut.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClearHighlights}
            title="Clear timeline highlights"
            className="text-[11px] text-sky-600 hover:text-sky-900 underline font-medium"
          >
            Clear
          </button>
        </div>
      )}

      {/* Scan & Trim Buttons (Clean light blue non-neon buttons) */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          onClick={handleScanSilences}
          disabled={isScanning}
          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs flex items-center justify-center gap-1.5 border border-slate-300 transition-colors cursor-pointer disabled:opacity-50"
        >
          <Sparkles size={13} className="text-sky-600" />
          <span>{isScanning ? "Scanning…" : "Scan Silences"}</span>
        </button>

        <button
          type="button"
          onClick={handleTrimSilences}
          disabled={!hasSilences}
          className={`min-h-[36px] px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors ${
            hasSilences
              ? "bg-sky-500 hover:bg-sky-600 text-white shadow-xs cursor-pointer"
              : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
          }`}
        >
          <Scissors size={13} />
          <span>Trim All</span>
        </button>
      </div>

      <div className="text-[10.5px] text-slate-400 text-center flex items-center justify-center gap-1 pt-1">
        <Volume2 size={11} className="text-slate-400" />
        <span>Synchronized across tracks with 20ms micro-fades</span>
      </div>
    </div>
  );
}
