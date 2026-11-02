"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { useAuthGate } from "@/app/lib/useAuthGate";
import { isAdminEmail } from "@/app/lib/admin";
import StudioShell from "@/app/components/StudioShell";
import AuthLoadingScreen from "@/app/components/AuthLoadingScreen";
import { PRESET_VOICES } from "@/app/lib/services/voiceService";

interface ProviderSafeMetadata {
  id: string;
  provider_key: string;
  category: "voice" | "ai" | "visuals" | "render";
  name: string;
  enabled: boolean;
  configured: boolean;
  status: "connected" | "not_configured" | "error" | "disabled" | "untested";
  maskedKey: string | null;
  lastTestedAt?: string | null;
  lastTestStatus: string;
  lastError?: string | null;
  config: Record<string, any>;
}

type TabCategory = "all" | "voice" | "ai" | "visuals" | "render";

export default function AdminProvidersPage() {
  const router = useRouter();
  const { status, session } = useAuthGate();
  const isAdmin = status === "authed" && isAdminEmail(session?.user?.email);

  const [providers, setProviders] = useState<ProviderSafeMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabCategory>("all");

  // Modal / Drawer state
  const [selectedProvider, setSelectedProvider] = useState<ProviderSafeMetadata | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [editableConfig, setEditableConfig] = useState<Record<string, any>>({});
  const [isEnabled, setIsEnabled] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Testing connection state
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    providerKey: string;
    success: boolean;
    message: string;
    latency?: number;
  } | null>(null);

  useEffect(() => {
    if (status === "unauthed" || (status === "authed" && !isAdmin)) {
      router.replace("/dashboard");
    }
  }, [status, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin || !session) return;
    loadProviders();
  }, [isAdmin, session]);

  async function loadProviders() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/providers", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to fetch providers");
      }
      const data = await res.json();
      setProviders(data.providers || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenConfig(prov: ProviderSafeMetadata) {
    setSelectedProvider(prov);
    setEditableConfig({ ...prov.config });
    setIsEnabled(prov.enabled);
    setNewKey("");
    setShowKeyInput(false);
    setActionMessage(null);
    setDrawerOpen(true);
  }

  async function handleTestConnection(providerKey: string, keyToTest?: string) {
    setTestingKey(providerKey);
    setTestResult(null);
    try {
      const res = await fetch(`/api/admin/providers/${providerKey}/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          apiKey: keyToTest ? keyToTest.trim() : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          providerKey,
          success: true,
          message: data.message || `Connection verified (${data.latency}ms)`,
          latency: data.latency,
        });
      } else {
        setTestResult({
          providerKey,
          success: false,
          message: data.error || data.message || "Connection test failed",
          latency: data.latency,
        });
      }
      // Refresh providers list to update last_test_status
      loadProviders();
    } catch (err: any) {
      setTestResult({
        providerKey,
        success: false,
        message: err.message || "Network error during test",
      });
    } finally {
      setTestingKey(null);
    }
  }

  async function handleSaveConfig() {
    if (!selectedProvider) return;
    setActionLoading(true);
    setActionMessage(null);

    try {
      // 1. If a new key was entered, save via POST /api/admin/providers
      if (newKey.trim()) {
        const postRes = await fetch("/api/admin/providers", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            provider_key: selectedProvider.provider_key,
            api_key: newKey.trim(),
            config: editableConfig,
            enabled: isEnabled,
          }),
        });

        if (!postRes.ok) {
          const err = await postRes.json().catch(() => ({}));
          throw new Error(err.error || "Failed to update provider credentials");
        }
      } else {
        // 2. Otherwise update non-secret config and enabled state via PATCH
        const patchRes = await fetch(`/api/admin/providers/${selectedProvider.provider_key}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            config: editableConfig,
            enabled: isEnabled,
          }),
        });

        if (!patchRes.ok) {
          const err = await patchRes.json().catch(() => ({}));
          throw new Error(err.error || "Failed to update provider settings");
        }
      }

      setActionMessage({ type: "success", text: "Configuration saved successfully." });
      setNewKey("");
      setShowKeyInput(false);
      await loadProviders();
      setTimeout(() => {
        setDrawerOpen(false);
      }, 1200);
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRemoveKey() {
    if (!selectedProvider) return;
    const confirm = window.confirm(
      `Are you sure you want to remove credentials for ${selectedProvider.name}? This will disable the provider until a new key is added.`
    );
    if (!confirm) return;

    setActionLoading(true);
    setActionMessage(null);

    try {
      const res = await fetch(`/api/admin/providers/${selectedProvider.provider_key}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to remove credentials");
      }

      setActionMessage({ type: "success", text: "Credentials removed and provider disabled." });
      await loadProviders();
      setTimeout(() => {
        setDrawerOpen(false);
      }, 1000);
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message });
    } finally {
      setActionLoading(false);
    }
  }

  if (!isAdmin) {
    return <AuthLoadingScreen label={status === "loading" ? "Validating root credentials…" : "Redirecting…"} />;
  }

  const filteredProviders = providers.filter((p) => {
    if (activeTab === "all") return true;
    return p.category.toLowerCase() === activeTab.toLowerCase();
  });

  return (
    <StudioShell active="admin-providers">
      <div className="space-y-6 max-w-6xl w-full pb-20">
          {/* Header Title & Subtitle */}
          <div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight">API Providers</h2>
            <p className="text-sm text-slate-400 mt-1">
              Manage the external and internal services powering KREOVAR AI, voice generation, and asset synthesis.
            </p>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-2 border-b border-[#202534] pb-3">
            {(["all", "voice", "ai", "visuals", "render"] as TabCategory[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                  activeTab === tab
                    ? "bg-sky-500 text-white shadow-sm shadow-sky-500/20"
                    : "bg-[#12151E] text-slate-400 hover:text-white hover:bg-[#161A26] border border-[#202534]"
                }`}
              >
                {tab === "all" ? "All Providers" : tab}
              </button>
            ))}
          </div>

          {/* Providers Grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-48 rounded-xl bg-[#0D0F15] border border-[#202534] animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="p-6 rounded-xl bg-rose-500/10 border border-rose-500/30 text-center">
              <p className="text-sm text-rose-300 font-semibold">{error}</p>
              <button
                onClick={loadProviders}
                className="mt-3 px-4 py-1.5 rounded-lg bg-rose-500 text-white text-xs font-medium"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredProviders.map((prov) => {
                const isTesting = testingKey === prov.provider_key;
                const activeTest = testResult?.providerKey === prov.provider_key ? testResult : null;
                const isConnected = prov.enabled && prov.status === "connected";
                const isDisabled = !prov.enabled;
                const isUntested = prov.status === "untested";
                const isNotConfigured = !prov.configured && prov.status === "not_configured";

                return (
                  <div
                    key={prov.id}
                    className="bg-[#0D0F15] border border-[#202534] hover:border-[#2A3144] rounded-2xl p-5 flex flex-col justify-between transition-all shadow-md group"
                  >
                    <div>
                      {/* Top Row: Category & Status */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#161A26] text-slate-400 border border-[#202534]">
                          {prov.category}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isDisabled
                                ? "bg-slate-500"
                                : isConnected
                                ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                                : isNotConfigured
                                ? "bg-amber-400"
                                : "bg-rose-400"
                            }`}
                          />
                          <span
                            className={`text-xs font-semibold capitalize ${
                              isDisabled
                                ? "text-slate-500"
                                : isConnected
                                ? "text-emerald-400"
                                : isNotConfigured
                                ? "text-amber-400"
                                : "text-rose-400"
                            }`}
                          >
                            {isDisabled
                              ? "Disabled"
                              : isConnected
                              ? "Connected"
                              : isUntested
                              ? "Not Tested"
                              : isNotConfigured
                              ? "Not Configured"
                              : "Error"}
                          </span>
                        </div>
                      </div>

                      {/* Provider Title */}
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-white tracking-tight">{prov.name}</h3>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {prov.provider_key === "elevenlabs"
                              ? "Primary production voiceover engine with word timestamps"
                              : prov.provider_key === "voiceai"
                              ? "Voice synthesis with Voice.ai"
                              : prov.provider_key === "gemini"
                              ? "Primary AI brain for Trend Radar, Competitor Intel & Content Kits"
                              : prov.provider_key === "openrouter"
                              ? "Development AI engine powered by NVIDIA Nemotron 3 Ultra"
                              : prov.provider_key === "radox"
                              ? "Claude Opus 5.5 for AI edit plans and editable motion graphics"
                              : prov.provider_key === "groq"
                              ? "Ultra-low latency LLM inference for ideas and scripting"
                              : prov.provider_key === "pollinations"
                              ? "AI visual asset synthesis & style rendering"
                              : "Remotion video compilation and MP4 export pipeline"}
                          </p>
                        </div>
                      </div>

                      {/* Credential & Config Metadata */}
                      <div className="bg-[#12151E] border border-[#202534] rounded-xl p-3.5 space-y-2.5 mb-4 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">API Key:</span>
                          <span className="font-mono text-slate-300">
                            {prov.maskedKey ? prov.maskedKey : <span className="text-slate-600 italic">None</span>}
                          </span>
                        </div>

                        {prov.provider_key === "elevenlabs" && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Default Voice:</span>
                            <span className="text-slate-300 font-medium">
                              {PRESET_VOICES.find((v) => v.id === prov.config?.defaultVoiceId)?.name ||
                                prov.config?.defaultVoiceId ||
                                "Rachel (Default)"}
                            </span>
                          </div>
                        )}

                        {prov.provider_key === "gemini" && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Model:</span>
                            <span className="font-mono text-slate-300">
                              {prov.config?.modelId || "gemini-3.6-flash"}
                            </span>
                          </div>
                        )}

                        {prov.provider_key === "openrouter" && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Model:</span>
                            <span className="font-mono text-slate-300">
                              {prov.config?.modelId || "nvidia/nemotron-3-ultra-550b-a55b:free"}
                            </span>
                          </div>
                        )}

                        {prov.provider_key === "radox" && <div className="flex items-center justify-between"><span className="text-slate-500">Editing model:</span><span className="font-mono text-slate-300">claude-opus-5.5</span></div>}
                        {prov.provider_key === "groq" && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Model:</span>
                            <span className="font-mono text-slate-300">
                              {prov.config?.modelId || "llama-3.3-70b-versatile"}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1 border-t border-[#202534]/60 text-[11px]">
                          <span className="text-slate-500">Last Tested:</span>
                          <span className="text-slate-400">
                            {prov.lastTestedAt ? new Date(prov.lastTestedAt).toLocaleString() : "Never"}
                          </span>
                        </div>
                      </div>

                      {/* Test feedback banner if present */}
                      {activeTest && (
                        <div
                          className={`p-2.5 rounded-lg text-xs mb-3 flex items-center justify-between ${
                            activeTest.success
                              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                              : "bg-rose-500/10 border border-rose-500/30 text-rose-300"
                          }`}
                        >
                          <span className="truncate">{activeTest.message}</span>
                          {activeTest.latency && (
                            <span className="font-mono text-[10px] ml-2 shrink-0">{activeTest.latency}ms</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions Row */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#202534]">
                      {prov.provider_key !== "remotion_render" && (
                        <button
                          onClick={() => handleTestConnection(prov.provider_key)}
                          disabled={isTesting || !prov.configured}
                          className="px-3 py-1.5 rounded-lg bg-[#161A26] border border-[#202534] text-xs font-semibold text-slate-300 hover:text-white hover:border-[#2A3144] disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5"
                        >
                          {isTesting ? (
                            <>
                              <svg className="w-3 h-3 animate-spin text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" strokeWidth="4" className="opacity-25" />
                                <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" className="opacity-75" />
                              </svg>
                              <span>Testing…</span>
                            </>
                          ) : (
                            <span>Test Connection</span>
                          )}
                        </button>
                      )}

                      <button
                        onClick={() => handleOpenConfig(prov)}
                        className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-xs font-semibold text-white transition shadow-sm shadow-sky-500/20"
                      >
                        Configure
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      {/* Configuration Drawer / Modal */}
      {drawerOpen && selectedProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0D0F15] border border-[#202534] rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#202534] pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#161A26] text-sky-400 border border-sky-500/30">
                  {selectedProvider.category}
                </span>
                <h3 className="text-xl font-bold text-white mt-1">{selectedProvider.name} Configuration</h3>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#161A26] transition"
              >
                ✕
              </button>
            </div>

            {/* Notification Banner */}
            {actionMessage && (
              <div
                className={`p-3 rounded-xl text-xs font-medium ${
                  actionMessage.type === "success"
                    ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
                    : "bg-rose-500/15 border border-rose-500/30 text-rose-300"
                }`}
              >
                {actionMessage.text}
              </div>
            )}

            {/* Connection & API Key Section */}
            {selectedProvider.provider_key !== "remotion_render" && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Connection Credentials</h4>

                <div className="bg-[#12151E] border border-[#202534] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Stored Key:</span>
                    <span className="font-mono text-slate-200">
                      {selectedProvider.maskedKey || "No key saved"}
                    </span>
                  </div>

                  {!showKeyInput ? (
                    <button
                      onClick={() => setShowKeyInput(true)}
                      className="w-full py-2 px-3 rounded-lg bg-[#161A26] hover:bg-[#202534] border border-[#202534] text-xs font-semibold text-slate-200 transition"
                    >
                      {selectedProvider.configured ? "Replace API Key" : "Enter API Key"}
                    </button>
                  ) : (
                    <div className="space-y-2 pt-2 border-t border-[#202534]">
                      <label className="text-[11px] text-slate-400">
                        Enter New Secret Key:
                      </label>
                      <input
                        type="password"
                        placeholder="sk-..."
                        value={newKey}
                        onChange={(e) => setNewKey(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-[#08090C] border border-[#2A3144] focus:border-sky-500 text-white text-xs font-mono outline-none"
                      />
                      <p className="text-[10px] text-slate-500">
                        Keys are encrypted with AES-256-GCM server-side before storage. Never exposed to browser.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Provider-Specific Non-Secret Settings */}
            {selectedProvider.provider_key === "elevenlabs" && (
              <div className="space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Voice Synthesis Settings</h4>

                {/* Default Voice */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-300 font-medium">Default Voice</label>
                  <select
                    value={editableConfig.defaultVoiceId || PRESET_VOICES[0].id}
                    onChange={(e) => setEditableConfig({ ...editableConfig, defaultVoiceId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[#12151E] border border-[#202534] text-white text-xs outline-none focus:border-sky-500"
                  >
                    {PRESET_VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.gender}) — {v.description}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Model ID */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-300 font-medium">Model ID</label>
                  <select
                    value={editableConfig.modelId || "eleven_multilingual_v2"}
                    onChange={(e) => setEditableConfig({ ...editableConfig, modelId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[#12151E] border border-[#202534] text-white text-xs outline-none focus:border-sky-500"
                  >
                    <option value="eleven_multilingual_v2">eleven_multilingual_v2 (Recommended, High Quality)</option>
                    <option value="eleven_turbo_v2_5">eleven_turbo_v2_5 (Ultra Low Latency)</option>
                    <option value="eleven_monolingual_v1">eleven_monolingual_v1 (Standard English)</option>
                  </select>
                </div>

                {/* Stability Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">Stability</span>
                    <span className="text-slate-400 font-mono">{editableConfig.stability ?? 0.5}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={editableConfig.stability ?? 0.5}
                    onChange={(e) => setEditableConfig({ ...editableConfig, stability: parseFloat(e.target.value) })}
                    className="w-full accent-sky-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Variable &amp; expressive</span>
                    <span>Stable &amp; consistent</span>
                  </div>
                </div>

                {/* Similarity Boost Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">Similarity Boost</span>
                    <span className="text-slate-400 font-mono">{editableConfig.similarityBoost ?? 0.75}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={editableConfig.similarityBoost ?? 0.75}
                    onChange={(e) => setEditableConfig({ ...editableConfig, similarityBoost: parseFloat(e.target.value) })}
                    className="w-full accent-sky-500"
                  />
                </div>
              </div>
            )}

            {selectedProvider.provider_key === "gemini" && (
              <div className="space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Gemini Model Settings</h4>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-300 font-medium">Model ID</label>
                  <select
                    value={editableConfig.modelId || "gemini-3.6-flash"}
                    onChange={(e) => setEditableConfig({ ...editableConfig, modelId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[#12151E] border border-[#202534] text-white text-xs outline-none focus:border-sky-500"
                  >
                    <option value="gemini-3.6-flash">gemini-3.6-flash (Recommended • Lightning Fast)</option>
                    <option value="gemini-3.5-flash">gemini-3.5-flash (High Availability)</option>
                    <option value="gemini-2.5-pro">gemini-2.5-pro (Deep Reasoning &amp; Analysis)</option>
                  </select>
                </div>
              </div>
            )}

            {selectedProvider.provider_key === "openrouter" && (
              <div className="space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">OpenRouter Nemotron Settings</h4>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-300 font-medium">Model ID</label>
                  <select
                    value={editableConfig.modelId || "nvidia/nemotron-3-ultra-550b-a55b:free"}
                    onChange={(e) => setEditableConfig({ ...editableConfig, modelId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[#12151E] border border-[#202534] text-white text-xs outline-none focus:border-sky-500"
                  >
                    <option value="nvidia/nemotron-3-ultra-550b-a55b:free">nvidia/nemotron-3-ultra-550b-a55b:free (Recommended • Free Tier)</option>
                    <option value="nvidia/nemotron-3-ultra-550b-a55b">nvidia/nemotron-3-ultra-550b-a55b (Nemotron 3 Ultra • Standard)</option>
                    <option value="nvidia/nemotron-3.5-lightning:free">nvidia/nemotron-3.5-lightning:free (High Speed • Free Tier)</option>
                    <option value="nvidia/nemotron-3.5-lightning">nvidia/nemotron-3.5-lightning (Lightning Inference)</option>
                  </select>
                </div>
              </div>
            )}

            {selectedProvider.provider_key === "groq" && (
              <div className="space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">LLM Inference Settings</h4>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-300 font-medium">Model ID</label>
                  <select
                    value={editableConfig.modelId || "llama-3.3-70b-versatile"}
                    onChange={(e) => setEditableConfig({ ...editableConfig, modelId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[#12151E] border border-[#202534] text-white text-xs outline-none focus:border-sky-500"
                  >
                    <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Fast &amp; Creative)</option>
                    <option value="llama-3.1-8b-instant">llama-3.1-8b-instant (Ultra Fast)</option>
                    <option value="mixtral-8x7b-32768">mixtral-8x7b-32768 (32k Context)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Danger Zone */}
            <div className="pt-4 border-t border-[#202534] space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-rose-400">Status &amp; Danger Zone</h4>

              <div className="flex items-center justify-between p-3 rounded-xl bg-[#12151E] border border-[#202534]">
                <div>
                  <p className="text-xs font-medium text-white">Provider Active</p>
                  <p className="text-[11px] text-slate-400">Enable or disable generation via this service</p>
                </div>
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => setIsEnabled(e.target.checked)}
                  className="w-4 h-4 accent-sky-500 cursor-pointer"
                />
              </div>

              {selectedProvider.configured && selectedProvider.provider_key !== "remotion_render" && (
                <button
                  type="button"
                  onClick={handleRemoveKey}
                  disabled={actionLoading}
                  className="w-full py-2 px-3 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold transition"
                >
                  Remove Stored Credentials
                </button>
              )}
            </div>

            {/* Modal Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#202534]">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#161A26] text-xs font-semibold text-slate-300 hover:text-white border border-[#202534] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={actionLoading}
                className="px-5 py-2 rounded-xl bg-white hover:bg-slate-100 text-zinc-950 font-bold text-xs shadow-[0_0_20px_rgba(255,255,255,0.2)] transition disabled:opacity-50"
              >
                {actionLoading ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </StudioShell>
  );
}
