"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { supabase } from "@/app/lib/supabase";
import PipelineProgress, { StudioPipelineStage } from "./PipelineProgress";
import VoiceSelector, { VoiceConfigState } from "./VoiceSelector";
import AudioPlayer, { SceneItem } from "./AudioPlayer";
import CaptionPreview from "./CaptionPreview";
import CaptionEditor from "./CaptionEditor";
import BRollManager from "./BRollManager";
import RawFootageSetup from "./RawFootageSetup";
import BRollRequirementFinder from "./BRollRequirementFinder";
import VeeloxVideoEditor from "../editor/VeeloxVideoEditor";
import {
  CaptionPresetId,
  CaptionPosition,
  CaptionSegment,
  createSegmentsFromTranscript,
} from "@/app/lib/captions/presets";
import { CURATED_VOICES } from "@/app/lib/server/tts/voices";
import { VOICE_SYNTHESIS_COST } from "@/app/config/credits";
import {
  saveProject,
  getProject,
  generateProjectId,
  isUUID,
} from "@/app/lib/services/projectService";
import { VeeloxProject, VeeloxScene } from "@/app/lib/services/types";

export interface VideoStudioPipelineProps {
  initialScript?: string;
  initialTopic?: string;
  initialScenes?: SceneItem[];
  initialVideoUrl?: string;
  projectId?: string;
  initialMode?: "ai" | "raw";
  initialStage?: StudioPipelineStage;
}

export default function VideoStudioPipeline({
  initialScript = "",
  initialTopic = "Trending AI Video",
  initialScenes = [],
  initialVideoUrl,
  projectId,
  initialMode = "ai",
  initialStage,
}: VideoStudioPipelineProps) {
  // Mode State (AI Video vs Raw Footage Workflow)
  const [mode, setMode] = useState<"ai" | "raw">(initialMode);

  // Idea Prompt State for Step 1
  const [ideaPrompt, setIdeaPrompt] = useState(initialTopic || "");

  // Stage State
  const [currentStage, setCurrentStage] = useState<StudioPipelineStage>(
    initialStage || (initialMode === "raw" ? "raw_upload" : initialTopic || initialScript ? "script" : "idea")
  );
  const [completedStages, setCompletedStages] = useState<StudioPipelineStage[]>(
    initialStage
      ? [initialStage]
      : initialMode === "raw"
      ? ["raw_upload"]
      : initialTopic || initialScript
      ? ["idea", "script"]
      : ["idea"]
  );

  // Active Project ID & Auto-Save State
  const [currentProjectId, setCurrentProjectId] = useState<string>(() => {
    if (projectId && isUUID(projectId)) return projectId;
    return generateProjectId();
  });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [isProjectLoaded, setIsProjectLoaded] = useState<boolean>(false);

  // Raw Footage Workflow Specific State
  const [rawTranscript, setRawTranscript] = useState<string>(
    "Welcome back to my channel! In this video I want to share why short form video creation with captions and cutaways is the fastest way to grow your audience today."
  );
  const [visualsTab, setVisualsTab] = useState<"requirement" | "library">("requirement");


  // Script & Project State
  const [topic, setTopic] = useState(initialTopic);
  const [scriptText, setScriptText] = useState(
    initialScript ||
      "HOOK:\nStop scrolling if you want to turn trending topics into viral videos in seconds.\n\nMAIN CONTENT:\nMost creators spend hours writing scripts and recording voiceovers. With Kreovar, you generate the script, voice, and kinetic captions instantly in one unified pipeline.\n\nCTA:\nHit follow and try Kreovar today to automate your short-form video creation."
  );
  const [scenes, setScenes] = useState<SceneItem[]>(
    initialScenes.length > 0
      ? initialScenes
      : [
          {
            id: "scene_1",
            label: "Hook (0:00 - 0:04)",
            text: "Stop scrolling if you want to turn trending topics into viral videos in seconds.",
          },
          {
            id: "scene_2",
            label: "Main Content (0:04 - 0:18)",
            text: "Most creators spend hours writing scripts and recording voiceovers. With Kreovar, you generate the script, voice, and kinetic captions instantly in one unified pipeline.",
          },
          {
            id: "scene_3",
            label: "Call to Action (0:18 - 0:25)",
            text: "Hit follow and try Kreovar today to automate your short-form video creation.",
          },
        ]
  );

  // User Credits & Auth
  const [userCredits, setUserCredits] = useState<number | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Voiceover State
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfigState>({
    voiceId: CURATED_VOICES[0].id,
    speed: 1.0,
    stability: 0.5,
    language: "English (US)",
    emotion: "neutral",
  });
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [voiceGenerationId, setVoiceGenerationId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [wordsTimestamps, setWordsTimestamps] = useState<Array<{ word: string; start: number; end: number }>>([]);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // Captions State & Placement
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const [captionGenerationId, setCaptionGenerationId] = useState<string | null>(null);
  const [activePresetId, setActivePresetId] = useState<CaptionPresetId>("clean");
  const [captionPosition, setCaptionPosition] = useState<CaptionPosition>("center");
  const [captionSegments, setCaptionSegments] = useState<CaptionSegment[]>([]);
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [isSavingCaptions, setIsSavingCaptions] = useState(false);

  // Background Video / Footage / B-Roll State
  const [backgroundVideoUrl, setBackgroundVideoUrl] = useState<string | null>(initialVideoUrl || null);
  const [backgroundVideoTitle, setBackgroundVideoTitle] = useState<string>("");
  const [isGlobalUploading, setIsGlobalUploading] = useState<boolean>(false);
  const pipelineVideoInputRef = React.useRef<HTMLInputElement | null>(null);

  // Playback Synchronization State
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Fetch session and credits
  useEffect(() => {
    async function loadUser() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setAuthToken(session.access_token);
          const { data: sub } = await supabase
            .from("subscriptions")
            .select("credits")
            .eq("user_id", session.user.id)
            .maybeSingle();

          if (sub && typeof sub.credits === "number") {
            setUserCredits(sub.credits);
          }
        }
      } catch (err) {
        console.warn("[Studio] Error loading user credits:", err);
      }
    }
    void loadUser();
  }, []);

  // Restore existing project if available
  useEffect(() => {
    let cancelled = false;
    async function loadExistingProject() {
      const targetId =
        projectId ||
        (typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("projectId")
          : null);
      if (!targetId) return;

      try {
        const existing = await getProject(targetId);
        if (cancelled || !existing) return;

        setCurrentProjectId(existing.id);
        if (existing.title) setTopic(existing.title);

        const firstScene = existing.scenes?.[0];
        const isRaw =
          existing.niche === "raw_footage" ||
          firstScene?.assetType === "uploaded_media" ||
          firstScene?.visualPrompt?.includes("Raw uploaded");

        if (isRaw) {
          setMode("raw");
          if (firstScene?.assetUrl) {
            setBackgroundVideoUrl(firstScene.assetUrl);
            setBackgroundVideoTitle(firstScene.onScreenText || existing.title);
          }
          if (existing.script?.scenes?.[0]?.voiceoverText) {
            setRawTranscript(existing.script.scenes[0].voiceoverText);
          } else if (existing.script?.hook) {
            setRawTranscript(existing.script.hook);
          }
        } else {
          if (existing.script?.intro || existing.script?.hook) {
            setScriptText(existing.script.intro || existing.script.hook);
          }
          if (existing.scenes && existing.scenes.length > 0) {
            setScenes(
              existing.scenes.map((s, idx) => ({
                id: s.id || `scene_${idx + 1}`,
                label: s.onScreenText || s.visualPrompt || `Scene ${idx + 1}`,
                text: s.voiceoverText,
              }))
            );
            if (firstScene?.voiceAudioUrl) {
              setAudioUrl(firstScene.voiceAudioUrl);
            }
          }
        }

        if (existing.captions && existing.captions.length > 0) {
          const segs: CaptionSegment[] = existing.captions.map((c) => ({
            id: c.id,
            text: c.text,
            start: c.startTime,
            end: c.endTime,
            words: c.words || [],
          }));
          setCaptionSegments(segs);
          if (existing.captions[0]?.style?.position) {
            setCaptionPosition(existing.captions[0].style.position as CaptionPosition);
          }
        }

        if (typeof existing.duration === "number" && existing.duration > 0) {
          setAudioDuration(existing.duration);
        }

        if (initialStage) {
          setCurrentStage(initialStage);
          setCompletedStages((prev) => Array.from(new Set([...prev, initialStage])));
        } else if (isRaw) {
          if (existing.captions && existing.captions.length > 0) {
            setCurrentStage("captions");
            setCompletedStages(["raw_upload", "captions"]);
          } else {
            setCurrentStage("raw_upload");
            setCompletedStages(["raw_upload"]);
          }
        }
      } catch (err) {
        console.warn("[Studio] Error restoring existing project:", err);
      } finally {
        if (!cancelled) setIsProjectLoaded(true);
      }
    }

    void loadExistingProject();
    return () => {
      cancelled = true;
    };
  }, [projectId, initialStage]);

  // Unified Project Auto-Save & Manual Save Handler
  const syncProjectWorkflow = React.useCallback(
    async (overrides?: Partial<VeeloxProject>) => {
      setSaveStatus("saving");
      try {
        const isRaw = mode === "raw";
        const finalTitle =
          overrides?.title ||
          backgroundVideoTitle ||
          (isRaw ? (topic ? `Raw: ${topic}` : "Raw Video Footage") : topic || "Trending AI Video");

        const targetDuration =
          typeof overrides?.duration === "number"
            ? overrides.duration
            : audioDuration > 0
            ? Math.round(audioDuration)
            : 30;

        const effectiveScenes: VeeloxScene[] = isRaw
          ? [
              {
                id: "scene_raw_1",
                order: 1,
                duration: targetDuration,
                voiceoverText: overrides?.script?.hook || rawTranscript,
                visualPrompt: "Raw uploaded video footage",
                assetType: "uploaded_media",
                assetUrl: overrides?.scenes?.[0]?.assetUrl || backgroundVideoUrl || "",
                onScreenText: backgroundVideoTitle || finalTitle,
                transition: "cut",
              },
            ]
          : scenes.map((s, idx) => ({
              id: s.id || `scene_${idx + 1}`,
              order: idx + 1,
              duration: Math.max(4, Math.round(targetDuration / (scenes.length || 1))),
              voiceoverText: s.text,
              visualPrompt: s.label || s.text || "Scene visual",
              assetType: "stock_video" as const,
              assetUrl: backgroundVideoUrl || "",
              onScreenText: s.label || s.text || "",
              transition: "fade" as const,
              voiceAudioUrl: audioUrl || undefined,
            }));

        const effectiveCaptions =
          overrides?.captions ||
          captionSegments.map((seg) => ({
            id: seg.id,
            text: seg.text,
            startTime: seg.start,
            endTime: seg.end,
            words: seg.words || [],
            style: {
              position: captionPosition,
            },
          }));

        const projectPayload: Partial<VeeloxProject> & { id: string; title: string } = {
          id: currentProjectId,
          title: finalTitle,
          trend_topic: topic || "Video Production",
          niche: isRaw ? "raw_footage" : "general",
          status: "draft",
          aspect_ratio: "9:16",
          duration: targetDuration,
          script: {
            title: finalTitle,
            hook: (isRaw ? rawTranscript : scriptText).slice(0, 140),
            intro: isRaw ? "" : scriptText.slice(0, 240),
            bodyPoints: [],
            payoff: "",
            cta: "",
            format: isRaw ? "Raw Footage" : "Shorts",
            duration: targetDuration,
            scenes: effectiveScenes,
          },
          scenes: effectiveScenes,
          captions: effectiveCaptions,
          thumbnail_url: backgroundVideoUrl || undefined,
          ...overrides,
        };

        const saved = await saveProject(projectPayload);
        setSaveStatus("saved");
        setLastSavedTime(
          new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        );

        // Keep browser URL updated with projectId and mode without reloading
        if (typeof window !== "undefined" && window.history?.replaceState) {
          const currentUrl = new URL(window.location.href);
          if (currentUrl.searchParams.get("projectId") !== currentProjectId) {
            currentUrl.searchParams.set("projectId", currentProjectId);
            if (isRaw) currentUrl.searchParams.set("mode", "raw");
            window.history.replaceState({}, "", currentUrl.toString());
          }
        }

        return saved;
      } catch (err) {
        console.warn("[Studio] Auto-save error:", err);
        setSaveStatus("error");
        return null;
      }
    },
    [
      currentProjectId,
      mode,
      backgroundVideoTitle,
      topic,
      audioDuration,
      rawTranscript,
      backgroundVideoUrl,
      scenes,
      scriptText,
      captionSegments,
      captionPosition,
      audioUrl,
    ]
  );

  // Update scenes if script changes and no manual scenes
  function handleScriptChange(text: string) {
    setScriptText(text);

    // Auto-parse sections if user uses HOOK:, MAIN CONTENT:, CTA: markers
    const sections = text.split(/(?=HOOK:|MAIN CONTENT:|CTA:|INTRO:|SCENE \d+:)/i).filter((s) => s.trim());
    if (sections.length > 1) {
      const parsedScenes: SceneItem[] = sections.map((sec, idx) => {
        const lines = sec.trim().split("\n");
        const header = lines[0].replace(/:$/, "").trim();
        const body = lines.slice(1).join(" ").trim() || sec.trim();
        return {
          id: `scene_${idx + 1}`,
          label: header,
          text: body,
        };
      });
      setScenes(parsedScenes);
    }
  }

  // Auth token resolver helper
  async function getFreshAuthToken(): Promise<string | null> {
    if (authToken) return authToken;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        setAuthToken(session.access_token);
        return session.access_token;
      }
    } catch {}
    return null;
  }

  // Handle direct video upload from any stage
  async function handleGlobalVideoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsGlobalUploading(true);
    try {
      const token = await getFreshAuthToken();
      const formData = new FormData();
      formData.append("file", file);

      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/media/upload", {
        method: "POST",
        headers,
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to upload video.");

      if (data.video?.videoUrl) {
        setBackgroundVideoUrl(data.video.videoUrl);
        setBackgroundVideoTitle(file.name);
        void syncProjectWorkflow({
          title: file.name,
          scenes: [
            {
              id: "scene_raw_1",
              order: 1,
              duration: audioDuration > 0 ? audioDuration : 30,
              voiceoverText: rawTranscript,
              visualPrompt: "Raw uploaded video footage",
              assetType: "uploaded_media",
              assetUrl: data.video.videoUrl,
              onScreenText: file.name,
              transition: "cut",
            },
          ],
        });
      }
    } catch (err: any) {
      console.error("[Studio] Video upload error:", err);
      setCaptionError(err?.message || "Failed to upload video clip.");
    } finally {
      setIsGlobalUploading(false);
      if (e.target) e.target.value = "";
    }
  }
  async function handleGenerateVoiceover() {
    setIsGeneratingVoice(true);
    setVoiceError(null);

    try {
      const token = await getFreshAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/voice/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({
          projectId,
          text: scriptText,
          scenes,
          voiceConfig,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate voiceover.");
      }

      setAudioUrl(data.audioUrl);
      setAudioDuration(data.duration || 0);
      setWordsTimestamps(data.words || []);
      setVoiceGenerationId(data.voiceGeneration?.id || null);

      if (data.scenes && Array.isArray(data.scenes)) {
        setScenes(data.scenes);
      }

      if (typeof data.creditsRemaining === "number") {
        setUserCredits(data.creditsRemaining);
      }

      // Mark stage complete and transition to voiceover preview
      setCompletedStages((prev) => Array.from(new Set([...prev, "voiceover"])));
      setCurrentStage("voiceover");
    } catch (err: any) {
      setVoiceError(err?.message || "Voice generation failed. Please try again.");
    } finally {
      setIsGeneratingVoice(false);
    }
  }

  // Regenerate single scene
  async function handleRegenerateScene(sceneId: string, text: string) {
    if (!voiceGenerationId) return;

    try {
      const token = await getFreshAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`/api/voice/${voiceGenerationId}/regenerate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          sceneId,
          text,
          voiceConfig,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to regenerate scene");

      if (data.scenes) {
        setScenes(data.scenes);
      }
    } catch (err: any) {
      setVoiceError(err?.message || "Scene regeneration failed.");
    }
  }

  // 2. Generate Auto Captions Action
  async function handleGenerateCaptions() {
    if (!voiceGenerationId && wordsTimestamps.length === 0) {
      setCaptionError("Please generate a voiceover first.");
      return;
    }

    setIsGeneratingCaptions(true);
    setCaptionError(null);

    try {
      const token = await getFreshAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/captions/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({
          voiceGenerationId,
          projectId,
          preset: activePresetId,
          words: wordsTimestamps,
          transcript: scriptText,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate captions.");

      setCaptionGenerationId(data.captionGeneration?.id || null);
      setCaptionSegments(data.segments || []);
      setActivePresetId(data.preset || "clean");

      setCompletedStages((prev) => Array.from(new Set([...prev, "captions"])));
      setCurrentStage("captions");
    } catch (err: any) {
      setCaptionError(err?.message || "Caption generation failed.");
    } finally {
      setIsGeneratingCaptions(false);
    }
  }

  // Save edited captions
  async function handleSaveCaptions() {
    if (!captionGenerationId) return;
    setIsSavingCaptions(true);

    try {
      const token = await getFreshAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      await fetch(`/api/captions/${captionGenerationId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          segments: captionSegments,
          preset: activePresetId,
        }),
      });
    } catch (err) {
      console.warn("Save captions error:", err);
    } finally {
      setIsSavingCaptions(false);
    }
  }

  // Handle Raw Footage workflow -> direct Captions generation
  async function handleProceedRawToCaptions(transcribedSegments?: CaptionSegment[]) {
    if (!backgroundVideoUrl) {
      setCaptionError("Please upload or attach your raw video footage first.");
      return;
    }

    if (transcribedSegments && transcribedSegments.length > 0) {
      setCaptionSegments(transcribedSegments);
      setCompletedStages((prev) => Array.from(new Set([...prev, "raw_upload", "captions"])));
      setCurrentStage("captions");
      return;
    }

    setIsGeneratingCaptions(true);
    setCaptionError(null);

    try {
      const token = await getFreshAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/captions/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({
          projectId,
          preset: activePresetId,
          transcript: rawTranscript,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate captions for raw footage.");

      setCaptionGenerationId(data.captionGeneration?.id || null);
      setCaptionSegments(
        data.segments && data.segments.length > 0
          ? data.segments
          : createSegmentsFromTranscript(rawTranscript)
      );
      setActivePresetId(data.preset || "clean");

      setCompletedStages((prev) => Array.from(new Set([...prev, "raw_upload", "captions"])));
      setCurrentStage("captions");
    } catch (err: any) {
      console.warn("[Studio] Falling back to local segment generation:", err);
      const fallbackSegments = createSegmentsFromTranscript(rawTranscript);
      setCaptionSegments(fallbackSegments);
      setCompletedStages((prev) => Array.from(new Set([...prev, "raw_upload", "captions"])));
      setCurrentStage("captions");
    } finally {
      setIsGeneratingCaptions(false);
    }
  }

  // Handle mode toggle (AI Video vs Raw Footage)
  function handleToggleMode(newMode: "ai" | "raw") {
    setMode(newMode);
    if (newMode === "raw") {
      if (currentStage === "script" || currentStage === "voiceover") {
        setCurrentStage("raw_upload");
      }
    } else {
      if (currentStage === "raw_upload") {
        setCurrentStage("script");
      }
    }
  }

  const scriptWordsCount = scriptText.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="w-full flex flex-col min-h-screen bg-[#08090C] text-slate-100">
      {/* Hidden Global Video Upload Input */}
      <input
        ref={pipelineVideoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={handleGlobalVideoSelect}
      />

      {/* 1. Top Pipeline Stage Navigation Bar with Mode Switcher */}
      <PipelineProgress
        currentStage={currentStage}
        completedStages={completedStages}
        onSelectStage={setCurrentStage}
        mode={mode}
        onToggleMode={handleToggleMode}
      />

      {/* Studio Quick Status & Video Footage Bar */}
      <div className="w-full border-b border-[#1A1F2C] bg-[#0A0C11]/90 backdrop-blur-md px-4 sm:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-400 font-mono text-[11px] overflow-x-auto">
            <span>Mode:</span>
            {mode === "raw" ? (
              <span className="text-emerald-400 font-bold uppercase bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                📹 Raw Footage (Script/Voice Skipped)
              </span>
            ) : (
              <span className="text-sky-400 font-bold uppercase bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                ✨ AI Generation Pipeline
              </span>
            )}
            <span className="text-slate-600">·</span>
            <span>Stage:</span>
            <span className="text-white font-bold uppercase">{currentStage}</span>
            <span className="text-slate-600">·</span>
            <span>Captions:</span>
            <span className="text-white font-semibold capitalize">
              {captionPosition === "center" ? "Middle (Viral Eye-Level)" : captionPosition}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Auto-Save & Sync Status Pill */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border transition-all ${
                saveStatus === "saving"
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                  : saveStatus === "saved"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : saveStatus === "error"
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                  : "bg-[#12151E] border-[#202534] text-slate-400"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  saveStatus === "saving"
                    ? "bg-amber-400 animate-pulse"
                    : saveStatus === "saved"
                    ? "bg-emerald-400"
                    : saveStatus === "error"
                    ? "bg-rose-400"
                    : "bg-slate-500"
                }`}
              />
              <span>
                {saveStatus === "saving"
                  ? "Saving..."
                  : saveStatus === "saved"
                  ? `Saved ${lastSavedTime ? '· ' + lastSavedTime : '✓'}`
                  : saveStatus === "error"
                  ? "Save Error"
                  : "Draft"}
              </span>
            </div>

            {/* Manual Save Button */}
            <button
              type="button"
              onClick={() => void syncProjectWorkflow()}
              disabled={saveStatus === "saving"}
              className="px-3 py-1.5 rounded-full bg-[#121622] hover:bg-[#1A2030] border border-[#232B3E] hover:border-sky-500/40 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              title="Save project workflow to your workspace"
            >
              <span>💾</span>
              <span className="hidden sm:inline">Save</span>
            </button>

            {/* Quick Link to Projects */}
            <Link
              href="/projects"
              className="px-3 py-1.5 rounded-full bg-[#121622] hover:bg-[#1A2030] border border-[#232B3E] text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1 transition"
              title="View all workspace video projects"
            >
              <span>📁</span>
              <span className="hidden md:inline">Projects</span>
            </Link>

            <button
              type="button"
              onClick={() => pipelineVideoInputRef.current?.click()}
              disabled={isGlobalUploading}
              className="px-3.5 py-1.5 rounded-full bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            >
              <span>{isGlobalUploading ? "⏳ Uploading..." : backgroundVideoUrl ? "🎬 Video Attached ✓" : "📤 Put Video Here"}</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentStage("visuals")}
              className="px-3 py-1.5 rounded-full bg-[#12151E] hover:bg-[#1A1F2C] border border-[#202534] text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
            >
              <span>{mode === "raw" ? "🎯 B-Roll Requirements" : "🔍 Stock B-Roll"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Studio Content Area */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        {/* Error Alert Banner */}
        {(voiceError || captionError) && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs sm:text-sm flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-base">⚠️</span>
              <span>{voiceError || captionError}</span>
            </div>
            <button
              onClick={() => {
                setVoiceError(null);
                setCaptionError(null);
              }}
              className="text-xs font-mono text-slate-400 hover:text-white"
            >
              ✕ Dismiss
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STAGE: RAW FOOTAGE SETUP (For mode="raw") */}
        {/* ========================================================================= */}
        {currentStage === "raw_upload" && (
          <RawFootageSetup
            videoUrl={backgroundVideoUrl}
            videoTitle={backgroundVideoTitle}
            onVideoUploaded={(vUrl, title) => {
              setBackgroundVideoUrl(vUrl);
              const effectiveTitle = title || backgroundVideoTitle || "Raw Video Footage";
              if (title) setBackgroundVideoTitle(title);
              void syncProjectWorkflow({
                title: effectiveTitle,
                scenes: [
                  {
                    id: "scene_raw_1",
                    order: 1,
                    duration: audioDuration > 0 ? audioDuration : 30,
                    voiceoverText: rawTranscript,
                    visualPrompt: "Raw uploaded video footage",
                    assetType: "uploaded_media",
                    assetUrl: vUrl,
                    onScreenText: effectiveTitle,
                    transition: "cut",
                  },
                ],
              });
            }}
            transcript={rawTranscript}
            onTranscriptChange={setRawTranscript}
            onProceedToCaptions={(transcribedSegments) => {
              handleProceedRawToCaptions(transcribedSegments);
              void syncProjectWorkflow();
            }}
            isGeneratingCaptions={isGeneratingCaptions}
            authToken={authToken}
            onTranscribeComplete={(t, segs) => {
              setRawTranscript(t);
              if (segs && segs.length > 0) {
                setCaptionSegments(segs);
              }
              void syncProjectWorkflow({
                script: {
                  title: backgroundVideoTitle || topic,
                  hook: t.slice(0, 140),
                  intro: "",
                  bodyPoints: [],
                  payoff: "",
                  cta: "",
                  format: "Raw Footage",
                  duration: audioDuration > 0 ? audioDuration : 30,
                  scenes: [
                    {
                      id: "scene_raw_1",
                      order: 1,
                      duration: audioDuration > 0 ? audioDuration : 30,
                      voiceoverText: t,
                      visualPrompt: "Raw uploaded video footage",
                      assetType: "uploaded_media",
                      assetUrl: backgroundVideoUrl || "",
                      onScreenText: backgroundVideoTitle || "Raw Video Footage",
                      transition: "cut",
                    },
                  ],
                },
                captions: (segs && segs.length > 0 ? segs : captionSegments).map((s) => ({
                  id: s.id,
                  text: s.text,
                  startTime: s.start,
                  endTime: s.end,
                  words: s.words || [],
                  style: { position: captionPosition },
                })),
              });
            }}
          />
        )}

        {/* ========================================================================= */}
        {/* STAGE 0: CHOOSE A TOPIC OR IDEA (Screen 3) */}
        {/* ========================================================================= */}
        {currentStage === "idea" && (
          <div className="max-w-2xl mx-auto space-y-6 pt-4">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900">
                1. Choose a topic or idea
              </h2>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
              <textarea
                value={ideaPrompt}
                onChange={(e) => setIdeaPrompt(e.target.value)}
                placeholder="Enter your topic, idea or paste a script..."
                rows={5}
                className="w-full bg-transparent resize-none border-none outline-none text-slate-900 placeholder:text-slate-400 text-sm sm:text-base leading-relaxed"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    const text = (ideaPrompt || topic).trim();
                    if (text) {
                      setTopic(text);
                      if (text.includes("\n") || text.split(" ").length > 20) {
                        setScriptText(text);
                      }
                    }
                    setCompletedStages((prev) => Array.from(new Set([...prev, "idea", "script"])));
                    setCurrentStage("script");
                  }
                }}
              />

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <span className="text-xs text-slate-400">
                  Example: &ldquo;AI tools for productivity&rdquo;
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const text = (ideaPrompt || topic).trim();
                    if (text) {
                      setTopic(text);
                      if (text.includes("\n") || text.split(" ").length > 20) {
                        setScriptText(text);
                      }
                    }
                    setCompletedStages((prev) => Array.from(new Set([...prev, "idea", "script"])));
                    setCurrentStage("script");
                  }}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs sm:text-sm transition-colors shadow-xs"
                >
                  <span>Next</span>
                  <span>&gt;</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STAGE 1: SCRIPT REVIEW & SETUP (For mode="ai") */}
        {/* ========================================================================= */}
        {currentStage === "script" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Script Editor / Breakdown */}
            <div className="lg:col-span-8 flex flex-col gap-5">
              <div className="p-5 sm:p-6 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                    <span className="text-[11px] font-mono uppercase font-bold tracking-wider text-sky-400">
                      STEP 01 · SCRIPT GENERATION
                    </span>
                  </div>
                  <span className="text-xs font-mono text-slate-400">
                    {scriptWordsCount} words · ~{Math.round(scriptWordsCount * 0.38)}s read time
                  </span>
                </div>

                <div>
                  <label className="text-xs font-mono font-semibold text-slate-400 block mb-1">
                    Project / Trend Topic
                  </label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#12151E] border border-[#202534] text-sm text-white font-heading font-bold focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-mono font-semibold text-slate-400 block mb-1">
                    Full Video Script (Narrative Spoken Text)
                  </label>
                  <textarea
                    rows={8}
                    value={scriptText}
                    onChange={(e) => handleScriptChange(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-[#12151E] border border-[#202534] text-xs sm:text-sm text-slate-200 font-sans leading-relaxed focus:outline-none focus:border-sky-500"
                    placeholder="Enter or paste your spoken script..."
                  />
                </div>
              </div>

              {/* Scene Breakdown preview */}
              {scenes.length > 0 && (
                <div className="p-5 sm:p-6 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-3">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <span>🎬</span>
                    <span>Scene &amp; Paragraph Breakdown ({scenes.length} Scenes)</span>
                  </h4>
                  <div className="space-y-2.5">
                    {scenes.map((scene, i) => (
                      <div
                        key={scene.id}
                        className="p-3 rounded-xl bg-[#12151E] border border-[#202534] flex items-start gap-3"
                      >
                        <span className="w-5 h-5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-mono font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] font-mono font-bold text-sky-400 block mb-0.5">
                            {scene.label}
                          </span>
                          <p className="text-xs text-slate-300 font-sans leading-relaxed">
                            {scene.text}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Quick Voice Preview Card & Action */}
            <div className="lg:col-span-4 flex flex-col gap-5">
              <div className="p-5 sm:p-6 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🎙️</span>
                  <div>
                    <h4 className="font-heading font-bold text-sm text-white">Next Stage: AI Voiceover</h4>
                    <p className="text-[11px] text-slate-400">Generate high-fidelity spoken audio</p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#12151E] border border-[#202534] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Selected Voice:</span>
                    <span className="font-semibold text-white font-mono">
                      {CURATED_VOICES.find((v) => v.id === voiceConfig.voiceId)?.name || "Rachel"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Available Credits:</span>
                    <span className="font-bold text-sky-400 font-mono">
                      {typeof userCredits === "number" ? `${userCredits} Credits` : "Loading..."}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs border-t border-[#202534] pt-2">
                    <span className="text-slate-400">Voiceover Cost:</span>
                    <span className="font-bold text-emerald-400 font-mono">
                      {VOICE_SYNTHESIS_COST} Credits
                    </span>
                  </div>
                </div>

                <motion.button
                  onClick={() => setCurrentStage("voiceover")}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs sm:text-sm bg-sky-500 hover:bg-sky-400 text-white shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Configure &amp; Create Voiceover</span>
                  <span>→</span>
                </motion.button>
              </div>

              {/* Put Your Video Card (Stage 1) */}
              <div className="p-5 sm:p-6 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🎬</span>
                    <div>
                      <h4 className="font-heading font-bold text-sm text-white">Your Video Footage</h4>
                      <p className="text-[11px] text-slate-400">Put your video clip or use stock B-roll</p>
                    </div>
                  </div>
                  {backgroundVideoUrl ? (
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      Attached ✓
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-slate-400">Optional</span>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => pipelineVideoInputRef.current?.click()}
                    disabled={isGlobalUploading}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-all"
                  >
                    <span>📤</span>
                    <span>{backgroundVideoUrl ? "Change Video" : "Upload My Video"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentStage("visuals")}
                    className="py-2.5 px-3 rounded-xl bg-[#12151E] hover:bg-[#1A1F2C] border border-[#202534] hover:border-sky-500/50 text-slate-300 hover:text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                  >
                    <span>🔍</span>
                    <span>B-Roll</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STAGE 2: AI VOICEOVER GENERATION & PLAYER */}
        {/* ========================================================================= */}
        {currentStage === "voiceover" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Script & Scene Context */}
            <div className="lg:col-span-4 flex flex-col gap-4 order-2 lg:order-1">
              <div className="p-5 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
                    Spoken Script
                  </h4>
                  <button
                    onClick={() => setCurrentStage("script")}
                    className="text-[10px] font-mono text-sky-400 hover:underline cursor-pointer"
                  >
                    Edit Script
                  </button>
                </div>
                <div className="p-3 rounded-xl bg-[#12151E] border border-[#202534] max-h-60 overflow-y-auto">
                  <p className="text-xs text-slate-300 font-sans leading-relaxed whitespace-pre-line">
                    {scriptText}
                  </p>
                </div>
              </div>

              {audioUrl && (
                <div className="p-5 rounded-2xl bg-gradient-to-br from-sky-950/20 to-[#0D0F15] border border-sky-500/30 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-mono text-sky-400 font-bold uppercase">
                    <span>✨</span>
                    <span>Voiceover Ready</span>
                  </div>
                  <p className="text-xs text-slate-300 font-sans">
                    Audio generated with word timestamps. You can now generate synchronized captions.
                  </p>
                  <button
                    type="button"
                    onClick={handleGenerateCaptions}
                    disabled={isGeneratingCaptions}
                    className="w-full py-3 px-4 rounded-xl font-medium text-xs sm:text-sm bg-sky-500 hover:bg-sky-400 text-white shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  >
                    {isGeneratingCaptions ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Generating Auto Captions...</span>
                      </>
                    ) : (
                      <>
                        <span>Generate Auto Captions</span>
                        <span>💬</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Put Your Video Card (Stage 2) */}
              <div className="p-5 rounded-2xl bg-[#0D0F15] border border-[#202534] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🎬</span>
                    <div>
                      <h4 className="font-heading font-bold text-sm text-white">Your Video Footage</h4>
                      <p className="text-[11px] text-slate-400">Put your video clip or use stock B-roll</p>
                    </div>
                  </div>
                  {backgroundVideoUrl ? (
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      Attached ✓
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-slate-400">Optional</span>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => pipelineVideoInputRef.current?.click()}
                    disabled={isGlobalUploading}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-all"
                  >
                    <span>📤</span>
                    <span>{backgroundVideoUrl ? "Change Video" : "Upload My Video"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentStage("visuals")}
                    className="py-2.5 px-3 rounded-xl bg-[#12151E] hover:bg-[#1A1F2C] border border-[#202534] hover:border-sky-500/50 text-slate-300 hover:text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                  >
                    <span>🔍</span>
                    <span>B-Roll</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Center/Right: Audio Player (if generated) OR Voice Selector & Settings */}
            <div className="lg:col-span-8 flex flex-col gap-6 order-1 lg:order-2">
              {audioUrl ? (
                <div className="space-y-6">
                  {/* Full Audio Player */}
                  <AudioPlayer
                    audioUrl={audioUrl}
                    duration={audioDuration}
                    scenes={scenes}
                    currentTime={currentTime}
                    onTimeUpdate={setCurrentTime}
                    onPlayStateChange={setIsPlaying}
                    onRegenerateVoice={handleGenerateVoiceover}
                    onRegenerateScene={handleRegenerateScene}
                    isRegenerating={isGeneratingVoice}
                  />

                  {/* Option to change voice and regenerate */}
                  <div className="p-5 rounded-2xl bg-[#0D0F15] border border-[#202534]">
                    <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 mb-3">
                      Adjust Voice Settings &amp; Regenerate
                    </h4>
                    <VoiceSelector
                      voiceConfig={voiceConfig}
                      onVoiceConfigChange={setVoiceConfig}
                      onGenerate={handleGenerateVoiceover}
                      isGenerating={isGeneratingVoice}
                      userCredits={userCredits}
                      scriptWordsCount={scriptWordsCount}
                    />
                  </div>
                </div>
              ) : (
                <div className="p-5 sm:p-6 rounded-2xl bg-[#0D0F15] border border-[#202534]">
                  <VoiceSelector
                    voiceConfig={voiceConfig}
                    onVoiceConfigChange={setVoiceConfig}
                    onGenerate={handleGenerateVoiceover}
                    isGenerating={isGeneratingVoice}
                    userCredits={userCredits}
                    scriptWordsCount={scriptWordsCount}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STAGE 3: AUTO CAPTIONS PREVIEW & EDITOR */}
        {/* ========================================================================= */}
        {currentStage === "captions" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Center (Vertical 9:16 Video Preview): lg:col-span-5 */}
            <div className="lg:col-span-5 flex flex-col items-center gap-4">
              <CaptionPreview
                audioUrl={audioUrl || undefined}
                videoUrl={backgroundVideoUrl}
                onVideoChange={(vUrl, title) => {
                  setBackgroundVideoUrl(vUrl);
                  const effectiveTitle = title || backgroundVideoTitle || "Video Clip";
                  if (title) setBackgroundVideoTitle(title);
                  void syncProjectWorkflow({
                    title: effectiveTitle,
                    scenes: [
                      {
                        id: "scene_raw_1",
                        order: 1,
                        duration: audioDuration > 0 ? audioDuration : 30,
                        voiceoverText: rawTranscript,
                        visualPrompt: "Raw uploaded video footage",
                        assetType: "uploaded_media",
                        assetUrl: vUrl || "",
                        onScreenText: effectiveTitle,
                        transition: "cut",
                      },
                    ],
                  });
                }}
                segments={captionSegments}
                activePresetId={activePresetId}
                onPresetChange={(preset) => {
                  setActivePresetId(preset);
                  void syncProjectWorkflow();
                }}
                captionPosition={captionPosition}
                onPositionChange={(pos) => {
                  setCaptionPosition(pos);
                  void syncProjectWorkflow();
                }}
                currentTime={currentTime}
                isPlaying={isPlaying}
                onTogglePlay={() => setIsPlaying((p) => !p)}
                onRestart={() => setCurrentTime(0)}
                onTimeUpdate={setCurrentTime}
                duration={audioDuration}
                onDurationChange={(d) => setAudioDuration(d)}
                onOpenBRollSelector={() => setCurrentStage("visuals")}
                authToken={authToken}
              />

              {/* Underlying Audio Player bar */}
              {audioUrl && (
                <div className="w-full max-w-[310px]">
                  <AudioPlayer
                    audioUrl={audioUrl}
                    duration={audioDuration}
                    currentTime={currentTime}
                    onTimeUpdate={setCurrentTime}
                    onPlayStateChange={setIsPlaying}
                  />
                </div>
              )}
            </div>

            {/* Right (Caption Editor): lg:col-span-7 */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              <div className="p-5 sm:p-6 rounded-2xl bg-[#0D0F15] border border-[#202534]">
                <CaptionEditor
                  segments={captionSegments}
                  onSegmentsChange={setCaptionSegments}
                  activePresetId={activePresetId}
                  onPresetChange={setActivePresetId}
                  captionPosition={captionPosition}
                  onPositionChange={setCaptionPosition}
                  videoUrl={backgroundVideoUrl}
                  onUploadVideoClick={() => pipelineVideoInputRef.current?.click()}
                  onSaveCaptions={handleSaveCaptions}
                  isSaving={isSavingCaptions}
                />
              </div>

              {/* Proceed to Stage 4 CTA */}
              <div className="p-5 rounded-2xl bg-[#0D0F15] border border-[#202534] flex items-center justify-between">
                <div>
                  <h4 className="font-heading font-bold text-sm text-white">Captions Configured</h4>
                  <p className="text-xs text-slate-400">Ready for visual composition &amp; B-roll</p>
                </div>
                <motion.button
                  onClick={() => {
                    setCompletedStages((prev) => Array.from(new Set([...prev, "visuals"])));
                    setCurrentStage("visuals");
                  }}
                  whileTap={{ scale: 0.98 }}
                  className="px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm bg-sky-500 hover:bg-sky-400 text-white shadow-sm transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span>Next: B-roll &amp; Visuals</span>
                  <span>→</span>
                </motion.button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STAGE 4: B-ROLL & VISUALS STUDIO */}
        {/* ========================================================================= */}
        {currentStage === "visuals" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Live 9:16 Vertical Video Canvas Preview */}
              <div className="lg:col-span-5 flex flex-col items-center gap-4">
                <CaptionPreview
                  audioUrl={audioUrl || undefined}
                  videoUrl={backgroundVideoUrl}
                  onVideoChange={(vUrl, title) => {
                    setBackgroundVideoUrl(vUrl);
                    const effectiveTitle = title || backgroundVideoTitle || "Video Clip";
                    if (title) setBackgroundVideoTitle(title);
                    void syncProjectWorkflow({
                      title: effectiveTitle,
                      scenes: [
                        {
                          id: "scene_raw_1",
                          order: 1,
                          duration: audioDuration > 0 ? audioDuration : 30,
                          voiceoverText: rawTranscript,
                          visualPrompt: "Raw uploaded video footage",
                          assetType: "uploaded_media",
                          assetUrl: vUrl || "",
                          onScreenText: effectiveTitle,
                          transition: "cut",
                        },
                      ],
                    });
                  }}
                  segments={captionSegments}
                  activePresetId={activePresetId}
                  onPresetChange={(p) => {
                    setActivePresetId(p);
                    void syncProjectWorkflow();
                  }}
                  captionPosition={captionPosition}
                  onPositionChange={(pos) => {
                    setCaptionPosition(pos);
                    void syncProjectWorkflow();
                  }}
                  currentTime={currentTime}
                  isPlaying={isPlaying}
                  onTogglePlay={() => setIsPlaying((p) => !p)}
                  onRestart={() => setCurrentTime(0)}
                  onTimeUpdate={setCurrentTime}
                  duration={audioDuration}
                  onDurationChange={(d) => setAudioDuration(d)}
                  authToken={authToken}
                />

                {/* Underlying Audio Player bar */}
                {audioUrl && (
                  <div className="w-full max-w-[310px]">
                    <AudioPlayer
                      audioUrl={audioUrl}
                      duration={audioDuration}
                      currentTime={currentTime}
                      onTimeUpdate={setCurrentTime}
                      onPlayStateChange={setIsPlaying}
                    />
                  </div>
                )}
              </div>

              {/* Right Column: B-Roll Search (Pexels) / Requirement Finder */}
              <div className="lg:col-span-7 flex flex-col gap-5">
                {/* Visuals Sub-Nav / Mode Tab Bar */}
                <div className="flex flex-wrap items-center justify-between bg-[#0D0F15] border border-[#202534] p-1.5 rounded-2xl gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setVisualsTab("requirement")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        visualsTab === "requirement"
                          ? "bg-sky-500 text-white shadow-sm"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <span>🎯</span>
                      <span>Scene Requirements Finder</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisualsTab("library")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        visualsTab === "library"
                          ? "bg-sky-500 text-white shadow-sm"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <span>📁</span>
                      <span>Stock Library</span>
                    </button>
                  </div>

                  <a
                    href="/broll"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-mono text-sky-400 hover:text-sky-300 px-3 py-1 flex items-center gap-1"
                  >
                    <span>Full /broll Page ↗</span>
                  </a>
                </div>

                {visualsTab === "requirement" ? (
                  <BRollRequirementFinder
                    rawVideoUrl={backgroundVideoUrl}
                    activeVideoUrl={backgroundVideoUrl}
                    onSelectCutaway={(vUrl, title) => {
                      setBackgroundVideoUrl(vUrl);
                      if (title) setBackgroundVideoTitle(title);
                      void syncProjectWorkflow();
                    }}
                  />
                ) : (
                  <div className="p-5 sm:p-6 rounded-2xl bg-[#0D0F15] border border-[#202534]">
                    <BRollManager
                      initialQuery={topic}
                      activeVideoUrl={backgroundVideoUrl}
                      onSelectVideo={(vUrl, title) => {
                        setBackgroundVideoUrl(vUrl || null);
                        if (title) setBackgroundVideoTitle(title);
                        void syncProjectWorkflow();
                      }}
                      authToken={authToken}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Pipeline Stage Summary Card */}
            <div className="w-full p-5 rounded-2xl bg-[#0D0F15] border border-[#202534] grid grid-cols-1 sm:grid-cols-4 gap-3 text-left">
              {mode === "raw" ? (
                <>
                  <div className="p-3 rounded-xl bg-[#12151E] border border-[#202534]">
                    <span className="text-[10px] font-mono text-slate-400 block mb-1">STAGE 01</span>
                    <span className="text-xs font-bold text-white block">Raw Footage Attached</span>
                    <span className="text-[11px] font-mono text-emerald-400 truncate block">
                      ✓ {backgroundVideoTitle || "Raw Video Uploaded"}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#12151E] border border-[#202534]">
                    <span className="text-[10px] font-mono text-slate-400 block mb-1">STAGE 02</span>
                    <span className="text-xs font-bold text-white block">Concept &amp; Spoken Audio</span>
                    <span className="text-[11px] font-mono text-emerald-400 block">
                      ✓ Original Voice Preserved
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#12151E] border border-[#202534]">
                    <span className="text-[10px] font-mono text-slate-400 block mb-1">STAGE 03</span>
                    <span className="text-xs font-bold text-white block">Kinetic Captions</span>
                    <span className="text-[11px] font-mono text-emerald-400 block">
                      ✓ {captionSegments.length} Segments Styled
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#12151E] border border-[#202534]">
                    <span className="text-[10px] font-mono text-slate-400 block mb-1">STAGE 04</span>
                    <span className="text-xs font-bold text-white block">B-Roll Cutaways</span>
                    <span className="text-[11px] font-mono text-emerald-400 truncate block">
                      ✓ Requirements Ready
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-3 rounded-xl bg-[#12151E] border border-[#202534]">
                    <span className="text-[10px] font-mono text-slate-400 block mb-1">STAGE 01</span>
                    <span className="text-xs font-bold text-white block">Script Ready</span>
                    <span className="text-[11px] font-mono text-emerald-400">✓ {scriptWordsCount} words</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#12151E] border border-[#202534]">
                    <span className="text-[10px] font-mono text-slate-400 block mb-1">STAGE 02</span>
                    <span className="text-xs font-bold text-white block">Voiceover Synthesized</span>
                    <span className="text-[11px] font-mono text-emerald-400">
                      ✓ {audioDuration.toFixed(1)}s audio{wordsTimestamps.length > 0 ? ` (${wordsTimestamps.length} words)` : ""}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#12151E] border border-[#202534]">
                    <span className="text-[10px] font-mono text-slate-400 block mb-1">STAGE 03</span>
                    <span className="text-xs font-bold text-white block">Auto Captions</span>
                    <span className="text-[11px] font-mono text-emerald-400">✓ {captionSegments.length} Segments</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#12151E] border border-[#202534]">
                    <span className="text-[10px] font-mono text-slate-400 block mb-1">STAGE 04</span>
                    <span className="text-xs font-bold text-white block">Visual Footage</span>
                    <span className="text-[11px] font-mono text-emerald-400 truncate block">
                      {backgroundVideoUrl ? `✓ ${backgroundVideoTitle || "Video Attached"}` : "⚡ Ready to Attach"}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentStage("captions")}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium bg-[#11141E] border border-[#1E2436] hover:bg-[#171B26] text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  ← Back to Captions
                </button>
                {mode === "raw" ? (
                  <button
                    type="button"
                    onClick={() => setCurrentStage("raw_upload")}
                    className="px-3.5 py-2 rounded-xl text-xs font-medium bg-[#11141E] border border-[#1E2436] hover:bg-[#171B26] text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    ← Back to Raw Footage Setup
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCurrentStage("voiceover")}
                    className="px-3.5 py-2 rounded-xl text-xs font-medium bg-[#11141E] border border-[#1E2436] hover:bg-[#171B26] text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    ← Back to Voiceover
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-400 hidden sm:inline">
                  Kreovar Studio · {mode === "raw" ? "Raw Footage Ready ✓" : "All Stages Configured ✓"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentStage("editor");
                    setCompletedStages((prev) => Array.from(new Set([...prev, "visuals", "editor"])));
                    void syncProjectWorkflow();
                  }}
                  className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-sky-500 hover:bg-sky-400 text-white shadow-sm transition-all cursor-pointer flex items-center gap-2"
                >
                  <span>Open Video Editor &amp; Render</span>
                  <span>⚡</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STAGE 5: AI VIDEO EDITOR & COMPILER (For both AI & Raw Mode) */}
        {/* ========================================================================= */}
        {currentStage === "editor" && (
          <div className="w-full -mx-4 sm:-mx-6 -my-6">
            <VeeloxVideoEditor
              projectId={currentProjectId}
              projectTitle={backgroundVideoTitle || topic || "Video Project"}
              plannerInput={{
                projectId: currentProjectId,
                title: backgroundVideoTitle || topic || "Video Project",
                scriptText: mode === "raw" ? rawTranscript : scriptText,
                scenes: scenes.map((s) => ({
                  id: s.id,
                  label: s.label,
                  text: s.text,
                })),
                voiceover: {
                  audioUrl: audioUrl || undefined,
                  duration: audioDuration > 0 ? audioDuration : undefined,
                  wordsTimestamps: wordsTimestamps.length > 0 ? wordsTimestamps : undefined,
                },
                brollClips: backgroundVideoUrl
                  ? [
                      {
                        id: "attached_footage",
                        title: backgroundVideoTitle || "Attached Raw Footage",
                        thumbnail: "",
                        videoUrl: backgroundVideoUrl,
                        source: "upload",
                      },
                    ]
                  : [],
                rawVideoUrl: backgroundVideoUrl,
                captions: {
                  presetId: activePresetId,
                  position: captionPosition,
                  segments: captionSegments,
                },
              }}
              userCredits={userCredits}
              authToken={authToken}
              onRefreshCredits={async () => {
                try {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (session) {
                    const { data: sub } = await supabase
                      .from("subscriptions")
                      .select("credits")
                      .eq("user_id", session.user.id)
                      .maybeSingle();
                    if (sub && typeof sub.credits === "number") {
                      setUserCredits(sub.credits);
                    }
                  }
                } catch (e) {}
              }}
              onExit={() => setCurrentStage("visuals")}
            />
          </div>
        )}
      </div>
    </div>
  );
}
