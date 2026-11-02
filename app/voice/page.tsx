"use client";
import UsageSummary from "../components/UsageSummary";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Download,
  Sparkles,
  Volume2,
} from "lucide-react";
import StudioShell from "../components/StudioShell";
import AudioPlayer from "../components/AudioPlayer";
import VoiceHistory, {type SavedVoice} from "../components/VoiceHistory";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import { useAuthGate } from "../lib/useAuthGate";
import { CURATED_VOICES } from "../lib/server/tts/voices";
import {downloadAsset} from "../lib/assets/client";
import type {StudioAsset} from "../lib/assets/types";


function VoiceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, session } = useAuthGate();

  const queryScript = searchParams.get("script") || "";

  const [text, setText] = useState(
    queryScript ||
      "Stop scrolling if you want to turn trending topics into viral videos in seconds. With Kreovar, you generate research, voiceovers, and kinetic cutaways in one modular workflow."
  );
  const [selectedVoiceId, setSelectedVoiceId] = useState(CURATED_VOICES[0].id);
  const [speed, setSpeed] = useState(1.0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAsset,setGeneratedAsset]=useState<StudioAsset|null>(null);
  const [downloading,setDownloading]=useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const [historyVersion,setHistoryVersion]=useState(0);
  const [playingVoice,setPlayingVoice]=useState<{name:string;id:string;text:string}|null>(null);

  function selectPrevious(voice:SavedVoice){
    if(!voice.asset)return;
    setGeneratedAsset(voice.asset);setAudioUrl(voice.asset.url);setAudioDuration(Number(voice.duration)||0);
    setPlayingVoice({name:voice.voice_name,id:voice.voice_id,text:voice.script_text});setError(null);
  }

  // Add to Project modal



  useEffect(() => {
    if (status === "unauthed") {
      router.replace("/login");
    }
  }, [status, router]);

  async function handleGenerate() {
    if (!text.trim()) return;
    setIsGenerating(true);
    setError(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch("/api/voice/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({
          text,
          saveToLibrary:false,
          voiceConfig: {
            voiceId: selectedVoiceId,
            speed,
            stability: 0.5,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Voice synthesis failed");
      }

      setPlayingVoice({name:CURATED_VOICES.find(v=>v.id===selectedVoiceId)?.name||"Voiceover",id:selectedVoiceId,text});
      setHistoryVersion(version=>version+1);
      setGeneratedAsset(data.asset);
      setAudioUrl(data.audioUrl);
      setAudioDuration(data.duration || 0);
    } catch (err: any) {
      console.error("Voice generation error:", err);
      setError(err.message || "Failed to synthesize voiceover");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleDownload() {
    if(!generatedAsset||downloading)return;setDownloading(true);
    try{await downloadAsset(generatedAsset);}catch(error){setError(error instanceof Error?error.message:"Download failed.");}finally{setDownloading(false);}
  }

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const estimatedSeconds = Math.round(wordCount * 0.38);
  const selectedVoice = CURATED_VOICES.find((v) => v.id === selectedVoiceId) || CURATED_VOICES[0];

  if (status !== "authed") {
    return <AuthLoadingScreen label="Loading Voice Studio…" />;
  }

  return (
    <StudioShell active="voice"><UsageSummary compact feature="voice"/>
      <div className="space-y-8 pb-16">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            AI Voice Generator
          </h1>
          
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Text Input & Voice Controls */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">
                  Script to Voicify
                </label>
                <span className="text-xs text-slate-400">
                  {wordCount} words · ~{estimatedSeconds}s estimated
                </span>
              </div>

              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={7}
                placeholder="Paste or type script for voice synthesis..."
                className="w-full p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 font-sans leading-relaxed focus:outline-none focus:border-slate-400"
              />

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">Speed:</span>
                  {[0.9, 1.0, 1.15].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSpeed(s)}
                      className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors cursor-pointer ${
                        speed === s
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating || !text.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-medium text-xs sm:text-sm transition-colors shadow-2xs cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isGenerating ? "Generating Voice..." : "Generate Voiceover"}</span>
                </button>
              </div>
            </div>

            {/* Generated Audio Player Card */}
            {audioUrl && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <Volume2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">
                        {playingVoice?.name||selectedVoice.name} Voiceover
                      </h4>
                      <span className="text-xs text-slate-400">
                        Duration: {audioDuration.toFixed(1)}s
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={downloading} onClick={()=>void handleDownload()}
                      className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors"
                      title={downloading ? "Downloading…" : "Download audio"}
                    >
                      <Download className="w-4 h-4" />
                    </button>


                  </div>
                </div>

                <AudioPlayer key={audioUrl} src={audioUrl} onDuration={setAudioDuration} onError={setError} />
              </div>
            )}
            {session?.user.id && <VoiceHistory key={session.user.id} userId={session.user.id} refreshKey={historyVersion} onSelect={selectPrevious} />}
          </div>

          {/* Right: Curated Voice Selector Cards */}
          <div className="lg:col-span-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Select Voice Model
            </h3>

            <div className="space-y-2.5">
              {CURATED_VOICES.map((voice) => {
                const isSelected = selectedVoiceId === voice.id;
                return (
                  <div
                    key={voice.id}
                    onClick={() => setSelectedVoiceId(voice.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? "bg-slate-50 border-slate-900 shadow-2xs"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900">{voice.name}</h4>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          {voice.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                        {voice.description}
                      </p>
                    </div>

                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        isSelected
                          ? "border-slate-900 bg-slate-900"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>


    </StudioShell>
  );
}

export default function VoicePage() {
  return (
    <Suspense fallback={<AuthLoadingScreen label="Loading Voice Studio…" />}>
      <VoiceContent />
    </Suspense>
  );
}
