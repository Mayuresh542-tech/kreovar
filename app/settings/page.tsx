"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthGate } from "../lib/useAuthGate";
import { supabase } from "../lib/supabase";
import {
  BRAND_VOICES,
  CUSTOM_VOICE,
  CUSTOM_VOICE_ID,
  DEFAULT_BRAND_VOICE,
} from "../lib/brandVoice";
import StudioShell from "../components/StudioShell";
import AuthLoadingScreen from "../components/AuthLoadingScreen";

import DeleteAccountSection from "../components/DeleteAccountSection";

type SettingsTab = "profile" | "voice" | "keys" | "preferences" | "security";

export default function Settings() {
  const router = useRouter();
  const { status, session } = useAuthGate();

  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [loading, setLoading] = useState(true);

  // API Keys state
  const [youtubeKey, setYoutubeKey] = useState("");
  const [showYoutube, setShowYoutube] = useState(false);
  const [savingKeys, setSavingKeys] = useState(false);
  const [keysSaved, setKeysSaved] = useState(false);
  const [keysError, setKeysError] = useState("");

  // Brand Voice state
  const [voice, setVoice] = useState<string>(DEFAULT_BRAND_VOICE);
  const [customVoice, setCustomVoice] = useState("");
  const [savingVoice, setSavingVoice] = useState(false);
  const [voiceSaved, setVoiceSaved] = useState(false);
  const [voiceError, setVoiceError] = useState("");

  // Preferences state
  const [defaultDuration, setDefaultDuration] = useState("60");
  const [defaultPlatform, setDefaultPlatform] = useState("youtube");
  const [prefSaved, setPrefSaved] = useState(false);

  // Security state
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (status === "unauthed") router.replace("/login");
  }, [status, router]);

  const loadedRef = useRef(false);
  useEffect(() => {
    if (status !== "authed" || !session || loadedRef.current) return;
    loadedRef.current = true;

    (async () => {
      try {
        // Load API Keys
        const res = await fetch("/api/keys", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setYoutubeKey(data.youtubeApiKey ?? "");
        }
      } catch {
        // ignore
      }

      try {
        // Load Brand Voice
        const { data: profile } = await supabase
          .from("profiles")
          .select("brand_voice, brand_voice_custom")
          .eq("id", session.user.id)
          .maybeSingle();

        if (profile) {
          setVoice(profile.brand_voice ?? DEFAULT_BRAND_VOICE);
          setCustomVoice(profile.brand_voice_custom ?? "");
        }
      } catch {
        // ignore
      }

      // Load preferences from localStorage
      if (typeof window !== "undefined") {
        const storedDur = localStorage.getItem("fretrend_pref_duration");
        if (storedDur) setDefaultDuration(storedDur);
        const storedPlat = localStorage.getItem("fretrend_pref_platform");
        if (storedPlat) setDefaultPlatform(storedPlat);
      }

      setLoading(false);
    })();
  }, [status, session]);

  async function saveKeys() {
    if (!session) return;
    setSavingKeys(true);
    setKeysError("");

    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          youtubeApiKey: youtubeKey.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to save API keys");
      }

      setKeysSaved(true);
      setTimeout(() => setKeysSaved(false), 3000);
    } catch (err) {
      setKeysError(err instanceof Error ? err.message : "Failed to encrypt and store credentials.");
    } finally {
      setSavingKeys(false);
    }
  }

  async function saveVoice() {
    if (!session) return;
    setSavingVoice(true);
    setVoiceError("");

    try {
      const { error } = await supabase
        .from("profiles")
        .upsert({
          id: session.user.id,
          brand_voice: voice,
          brand_voice_custom: voice === CUSTOM_VOICE_ID ? customVoice.trim() : null,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      setVoiceSaved(true);
      setTimeout(() => setVoiceSaved(false), 3000);
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : "Failed to save brand voice.");
    } finally {
      setSavingVoice(false);
    }
  }

  function savePreferences() {
    if (typeof window !== "undefined") {
      localStorage.setItem("fretrend_pref_duration", defaultDuration);
      localStorage.setItem("fretrend_pref_platform", defaultPlatform);
      setPrefSaved(true);
      setTimeout(() => setPrefSaved(false), 2500);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
      router.replace("/login");
    } catch {
      setLoggingOut(false);
    }
  }

  if (status !== "authed" || loading) {
    return <AuthLoadingScreen label="Loading settings…" />;
  }



  return (
    <StudioShell active="settings">
      <div className="max-w-5xl mx-auto w-full space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="space-y-1">

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Settings
            </h1>

          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/settings/billing"
              className="px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <span>💳</span>
              <span>Billing &amp; Usage</span>
            </Link>
          </div>
        </div>

        {session?.user.app_metadata?.account_deletion_pending && <div role="alert" className="rounded-xl border border-rose-500/30 p-4 text-sm text-rose-400">Your account deletion needs to finish. Some data may already be removed. <button type="button" onClick={() => setActiveTab("security")} className="underline font-semibold">Resume account deletion</button></div>}

        {/* Tab Navigation */}
        <div className="vx-mobile-tabs flex items-center gap-1.5 border-b border-slate-200 pb-3 overflow-x-auto">
          {[
            { id: "profile" as SettingsTab, label: "Profile", icon: "👤" },
            { id: "voice" as SettingsTab, label: "Brand voice", icon: "🎭" },
            { id: "keys" as SettingsTab, label: "API keys", icon: "🔐" },
            { id: "preferences" as SettingsTab, label: "Preferences", icon: "⚡" },
            { id: "security" as SettingsTab, label: "Security", icon: "🛡️" },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? "bg-slate-100 border border-slate-300 text-slate-900 font-semibold"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50 border border-transparent"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: Profile */}
        {activeTab === "profile" && (
          <div className="space-y-6">
            <div className="p-6 sm:p-8 rounded-2xl bg-white border border-slate-200 relative overflow-hidden shadow-xs">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 font-heading">Account</h2>
                  
                </div>

              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] uppercase font-mono font-bold text-slate-500 block mb-1">
                    Email
                  </span>
                  <span className="text-sm font-semibold text-slate-900 font-mono">{session?.user.email}</span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] uppercase font-mono font-bold text-slate-500 block mb-1">
                    Account ID
                  </span>
                  <span className="text-xs font-mono text-slate-600 truncate block">{session?.user.id}</span>
                </div>
              </div>

              <Link href="/settings/billing" className="text-sm font-medium text-slate-700 underline underline-offset-4">View plan and usage</Link>
            </div>
          </div>
        )}

        {/* TAB 2: Brand voice */}
        {activeTab === "voice" && (
          <div className="p-6 sm:p-8 rounded-2xl bg-white border border-slate-200 space-y-6 shadow-xs">
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 font-heading">Brand voice</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Choose a writing tone for your scripts.
                  </p>
                </div>
                <span className="text-[10px] font-mono uppercase px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-900 font-semibold">
                  7 VOICES AVAILABLE
                </span>
              </div>
            </div>

            {/* Presets Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              {BRAND_VOICES.map((b) => {
                const isSelected = voice === b.id;
                return (
                  <button
                    key={b.id}
                    onClick={() => setVoice(b.id)}
                    className={`p-4 rounded-xl text-left border transition-all flex flex-col justify-between group cursor-pointer ${
                      isSelected
                        ? "border-slate-400 bg-slate-100 shadow-xs"
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-2xl group-hover:scale-110 transition-transform">{b.icon}</span>
                      <span
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                          isSelected ? "border-slate-400 bg-slate-200" : "border-slate-600"
                        }`}
                      >
                        {isSelected && <span className="w-2 h-2 rounded-full bg-slate-600 shadow-xs" />}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block group-hover:text-slate-900 transition-colors">{b.label}</span>
                      <span className="text-[11px] text-slate-500 block mt-0.5 leading-snug">{b.description}</span>
                    </div>
                  </button>
                );
              })}

              {/* Custom Voice Card */}
              <button
                onClick={() => setVoice(CUSTOM_VOICE_ID)}
                className={`p-4 rounded-xl text-left border transition-all flex flex-col justify-between group cursor-pointer ${
                  voice === CUSTOM_VOICE_ID
                    ? "border-slate-400 bg-slate-100 shadow-xs"
                    : "border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl group-hover:scale-110 transition-transform">{CUSTOM_VOICE.icon}</span>
                  <span
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                      voice === CUSTOM_VOICE_ID ? "border-slate-400 bg-slate-200" : "border-slate-600"
                    }`}
                  >
                    {voice === CUSTOM_VOICE_ID && <span className="w-2 h-2 rounded-full bg-slate-600 shadow-xs" />}
                  </span>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-900 block group-hover:text-slate-900 transition-colors">{CUSTOM_VOICE.label}</span>
                  <span className="text-[11px] text-slate-500 block mt-0.5 leading-snug">{CUSTOM_VOICE.description}</span>
                </div>
              </button>
            </div>

            {/* Custom Voice Input */}
            {voice === CUSTOM_VOICE_ID && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-300 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900 block">
                    Custom tone
                  </label>
                  <span className="text-[10px] font-mono text-slate-500">{customVoice.length} characters</span>
                </div>
                <textarea
                  value={customVoice}
                  onChange={(e) => setCustomVoice(e.target.value)}
                  rows={3}
                  placeholder="e.g. Fast-paced tech explainer with sarcastic humor, short punchy analogies, zero buzzwords, and high technical authority."
                  className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-slate-400/70  transition resize-none leading-relaxed font-sans"
                />
              </div>
            )}

            {voiceError && <p className="text-xs text-rose-400 font-mono">{voiceError}</p>}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={saveVoice}
                disabled={savingVoice}
                className="px-6 py-3 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition disabled:opacity-50 cursor-pointer active:scale-95"
              >
                {savingVoice ? "Saving…" : voiceSaved ? "Saved ✓" : "Save Brand Voice"}
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: API Keys */}
        {activeTab === "keys" && (
          <div className="p-6 sm:p-8 rounded-2xl bg-white border border-slate-200 space-y-6 shadow-xs">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <h2 className="text-lg font-bold text-slate-900 font-heading">Encrypted API keys</h2>

              </div>
              <p className="text-xs text-slate-500 max-w-xl">
                Keys are stored securely.
              </p>
            </div>

            {/* YouTube Key Input */}
            <div className="space-y-2 p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <span>▶️</span>
                  <span>YouTube Data API v3 Key</span>
                  <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-white text-slate-500 border border-slate-200">
                    Optional
                  </span>
                </label>
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-slate-700 hover:text-slate-900 hover:underline font-mono flex items-center gap-1"
                >
                  Google Cloud Console ↗
                </a>
              </div>
              <div className="relative">
                <input
                  type={showYoutube ? "text" : "password"}
                  value={youtubeKey}
                  onChange={(e) => setYoutubeKey(e.target.value)}
                  placeholder="AIzaSy••••••••••••••••••••••••••••••••"
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-slate-400/70  font-mono tracking-wider transition"
                />
                <button
                  type="button"
                  onClick={() => setShowYoutube(!showYoutube)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-900 px-2 py-0.5 rounded bg-slate-50 cursor-pointer"
                >
                  {showYoutube ? "Hide" : "Show"}
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Used for YouTube competitor analysis.
              </p>
            </div>

            {keysError && <p className="text-xs text-rose-400 font-mono">{keysError}</p>}

            <div className="pt-2">
              <button
                onClick={saveKeys}
                disabled={savingKeys}
                className="px-6 py-3 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition disabled:opacity-50 cursor-pointer active:scale-95"
              >
                {savingKeys ? "Saving…" : keysSaved ? "Saved ✓" : "Save API key"}
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: Preferences */}
        {activeTab === "preferences" && (
          <div className="p-6 sm:p-8 rounded-2xl bg-white border border-slate-200 space-y-6 shadow-xs">
            <div>
              <h2 className="text-lg font-bold text-slate-900 font-heading">Studio Defaults</h2>
              
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-900 block">
                Script length
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {[
                  { label: "30 Seconds", sub: "Shorts / Reels", val: "30" },
                  { label: "60 Seconds", sub: "TikTok / Shorts", val: "60" },
                  { label: "3 Minutes", sub: "Deep Dive", val: "180" },
                  { label: "5 Minutes", sub: "Mini Document", val: "300" },
                  { label: "10 Minutes", sub: "Long-Form YT", val: "600" },
                ].map((dur) => (
                  <button
                    key={dur.val}
                    onClick={() => setDefaultDuration(dur.val)}
                    className={`p-3.5 rounded-xl text-left border transition cursor-pointer ${
                      defaultDuration === dur.val
                        ? "bg-slate-100 border-slate-300 text-slate-900 font-bold shadow-xs"
                        : "bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300"
                    }`}
                  >
                    <span className="text-xs font-bold block">{dur.label}</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5 font-mono">{dur.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-200">
              <label className="text-xs font-bold text-slate-900 block">
                Default platform
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {[
                  { id: "youtube", label: "YouTube" },
                  { id: "tiktok", label: "TikTok" },
                  { id: "reels", label: "Instagram" },
                  { id: "x", label: "X / Twitter" },
                  { id: "linkedin", label: "LinkedIn" },
                ].map((plat) => (
                  <button
                    key={plat.id}
                    onClick={() => setDefaultPlatform(plat.id)}
                    className={`p-3 rounded-xl text-center text-xs font-semibold border transition cursor-pointer ${
                      defaultPlatform === plat.id
                        ? "bg-slate-100 border-slate-300 text-slate-900 font-bold shadow-xs"
                        : "bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300"
                    }`}
                  >
                    {plat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200">
              <button
                onClick={savePreferences}
                className="px-6 py-3 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition cursor-pointer active:scale-95"
              >
                {prefSaved ? "Preferences Saved ✓" : "Save Preferences"}
              </button>
            </div>
          </div>
        )}

        {/* TAB 5: Security */}
        {activeTab === "security" && (
          <div className="p-6 sm:p-8 rounded-2xl bg-white border border-slate-200 space-y-6 shadow-xs">
            <div>
              <h2 className="text-lg font-bold text-slate-900 font-heading">Security &amp; Session Management</h2>
              
            </div>

            <DeleteAccountSection userId={session!.user.id} />

            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-900 block">Sign Out</span>
                <span className="text-[11px] text-slate-500">Sign out on this device.</span>
              </div>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition disabled:opacity-50 cursor-pointer active:scale-95"
              >
                {loggingOut ? "Signing Out…" : "Sign Out of Kreovar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </StudioShell>
  );
}
