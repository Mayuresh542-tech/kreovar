"use client";

import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import { CaptionSegment } from "@/app/lib/captions/presets";

interface RawFootageSetupProps {
  videoUrl: string | null;
  videoTitle: string;
  onVideoUploaded: (url: string, title?: string) => void;
  transcript: string;
  onTranscriptChange: (text: string) => void;
  onProceedToCaptions: (transcribedSegments?: CaptionSegment[]) => void;
  isGeneratingCaptions: boolean;
  authToken?: string | null;
  onTranscribeComplete?: (transcript: string, segments: CaptionSegment[], words?: any[]) => void;
}

export default function RawFootageSetup({
  videoUrl,
  videoTitle,
  onVideoUploaded,
  transcript,
  onTranscriptChange,
  onProceedToCaptions,
  isGeneratingCaptions,
  authToken,
  onTranscribeComplete,
}: RawFootageSetupProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Transcribe State
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeSuccess, setTranscribeSuccess] = useState<string | null>(null);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [capturedSegments, setCapturedSegments] = useState<CaptionSegment[] | null>(null);

  async function transcribeVideo(targetUrl: string) {
    if (!targetUrl) return;
    setIsTranscribing(true);
    setTranscribeError(null);
    setTranscribeSuccess(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers,
        body: JSON.stringify({ videoUrl: targetUrl }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to transcribe audio from video.");
      }

      if (data.transcript) {
        onTranscriptChange(data.transcript);
        setTranscribeSuccess(
          `Transcribed ${data.words?.length || 0} words with millisecond timestamps ✓`
        );
      }

      if (data.segments && Array.isArray(data.segments)) {
        setCapturedSegments(data.segments);
        if (onTranscribeComplete) {
          onTranscribeComplete(data.transcript, data.segments, data.words);
        }
      }
    } catch (err: any) {
      console.warn("[RawFootage] Transcription error:", err);
      setTranscribeError(
        err.message || "Could not transcribe audio automatically. You can still type your script."
      );
    } finally {
      setIsTranscribing(false);
    }
  }

  async function handleFile(file: File) {
    if (!file) return;
    setIsUploading(true);
    setUploadError(null);
    setTranscribeSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const headers: Record<string, string> = {};
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      const res = await fetch("/api/media/upload", {
        method: "POST",
        headers,
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to upload video clip.");
      }

      if (data.video?.videoUrl) {
        onVideoUploaded(data.video.videoUrl, file.name);
        // Automatically trigger transcription on successful upload!
        void transcribeVideo(data.video.videoUrl);
      }
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload video.");
    } finally {
      setIsUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  const wordsCount = transcript.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {/* Left Column: Video Dropzone & Preview (lg:col-span-6) */}
      <div className="lg:col-span-6 flex flex-col gap-4">
        <div className="p-5 sm:p-6 rounded-3xl bg-[#0D0F15] border border-[#202534] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-mono uppercase font-bold tracking-wider text-emerald-400">
                STEP 01 · RAW FOOTAGE UPLOAD
              </span>
            </div>
            {videoUrl && (
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                Attached ✓
              </span>
            )}
          </div>

          <h3 className="font-heading text-lg sm:text-xl font-bold text-white tracking-tight">
            Add Your Raw Talking-Head / Video
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Upload your recorded selfie video, podcast snippet, or raw footage. Script writing and AI voiceover are skipped because you already have your concept and voice in the video.
          </p>

          {/* Upload Drop Area or Video Preview */}
          {videoUrl ? (
            <div className="relative rounded-2xl overflow-hidden border border-[#202534] bg-black group aspect-[9/14] sm:aspect-[9/12] max-h-[480px] mx-auto w-full flex items-center justify-center">
              <video
                src={videoUrl}
                controls
                playsInline
                className="w-full h-full object-contain"
              />
              <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="px-3 py-1.5 rounded-xl bg-black/70 hover:bg-black/90 backdrop-blur-md text-slate-200 hover:text-white text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
                >
                  Change Video
                </button>
              </div>
              {videoTitle && (
                <div className="absolute bottom-3 left-3 right-3 z-10 px-3 py-1.5 rounded-xl bg-black/70 backdrop-blur-md text-[11px] font-mono text-slate-300 border border-white/10 truncate">
                  🎬 {videoTitle}
                </div>
              )}
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-8 sm:p-12 rounded-2xl border-2 border-dashed transition-all cursor-pointer text-center flex flex-col items-center justify-center gap-3.5 ${
                isDragging
                  ? "border-sky-400 bg-sky-500/10 scale-[1.01]"
                  : "border-[#252B3B] hover:border-sky-500/50 bg-[#10131B]/60 hover:bg-[#121622]"
              }`}
            >
              <div className="w-14 h-14 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-2xl text-sky-400 shadow-[0_0_20px_rgba(14,165,233,0.15)]">
                {isUploading ? "⏳" : "📹"}
              </div>

              <div>
                <h4 className="text-sm sm:text-base font-bold text-white">
                  {isUploading ? "Uploading Raw Video…" : "Drop Your Raw Video Here"}
                </h4>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  Supports MP4, MOV, WebM (up to 100MB). Audio will be automatically transcribed into captions.
                </p>
              </div>

              <button
                type="button"
                disabled={isUploading}
                className="mt-1 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-md transition-colors"
              >
                {isUploading ? "Processing..." : "Select Video File"}
              </button>
            </div>
          )}

          {uploadError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              ⚠️ {uploadError}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Transcript & Proceed to Captions (lg:col-span-6) */}
      <div className="lg:col-span-6 flex flex-col gap-4">
        <div className="p-5 sm:p-6 rounded-3xl bg-[#0D0F15] border border-[#202534] space-y-4 flex-1 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">💬</span>
                <div>
                  <h4 className="font-heading font-bold text-sm text-white">
                    Spoken Video Transcript &amp; Captions
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    What is spoken in your video
                  </p>
                </div>
              </div>

              <span className="text-xs font-mono text-slate-400">
                {wordsCount} words · ~{Math.round(wordsCount * 0.35)}s speech
              </span>
            </div>

            {/* Auto Transcribe Action Banner */}
            {videoUrl && (
              <div className="p-3 rounded-2xl bg-[#121622] border border-[#232B3E] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">{isTranscribing ? "⏳" : "🎙️"}</span>
                  <div className="text-xs">
                    <span className="text-white font-semibold block">
                      {isTranscribing
                        ? "Transcribing video speech with AI…"
                        : "AI Speech-to-Text Transcriber"}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Extracts exact word timestamps directly from your video audio
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isTranscribing}
                  onClick={() => transcribeVideo(videoUrl)}
                  className="px-3 py-1.5 rounded-lg bg-[#141824] hover:bg-[#1C2234] border border-sky-500/30 text-sky-300 font-medium text-xs shadow-sm transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {isTranscribing ? "Transcribing…" : "🎙️ Auto-Transcribe"}
                </button>
              </div>
            )}

            {/* Success or error message */}
            {transcribeSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center gap-2">
                <span>✓</span>
                <span>{transcribeSuccess}</span>
              </div>
            )}
            {transcribeError && (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                ⚠️ {transcribeError}
              </div>
            )}

            {/* Transcript Textarea */}
            <div>
              <textarea
                value={transcript}
                onChange={(e) => onTranscriptChange(e.target.value)}
                rows={7}
                placeholder="What did you say in your raw video? Click 'Auto-Transcribe' above or paste your spoken words here..."
                className="w-full p-4 rounded-2xl bg-[#080A0F] border border-[#232A3B] focus:border-sky-500 text-slate-200 placeholder-slate-500 text-xs sm:text-sm font-sans focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all resize-y leading-relaxed"
              />
            </div>

            {/* Helper tips */}
            <div className="p-3.5 rounded-2xl bg-[#12151E] border border-[#202534] space-y-2 text-xs">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <span>✓</span>
                <span>Scripting &amp; ElevenLabs Voiceover Skipped</span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Your video’s original spoken voice remains 100% intact. Kreovar synchronizes animated kinetic captions with your voiceover and advances directly to the captions editor.
              </p>
            </div>
          </div>

          {/* Proceed CTA */}
          <div className="pt-4 border-t border-[#1C2232] space-y-3">
            <motion.button
              type="button"
              onClick={() => onProceedToCaptions(capturedSegments || undefined)}
              disabled={isGeneratingCaptions || !videoUrl}
              whileTap={{ scale: videoUrl ? 0.99 : 1 }}
              className={`w-full py-3 rounded-xl font-semibold text-xs sm:text-sm tracking-normal transition-all flex items-center justify-center gap-2 cursor-pointer ${
                videoUrl
                  ? "bg-sky-500 hover:bg-sky-400 text-white shadow-sm"
                  : "bg-[#141824] text-slate-500 cursor-not-allowed border border-[#1E2436]"
              }`}
            >
              <span>{isGeneratingCaptions ? "Generating Captions…" : "Proceed to Auto Captions"}</span>
              <span>→</span>
            </motion.button>

            {!videoUrl && (
              <p className="text-center text-[11px] font-mono text-slate-500">
                Please attach or upload your raw video footage above to proceed.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
