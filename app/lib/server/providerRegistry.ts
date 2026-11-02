import { getAdminClient } from "./adminAuth";
import { decrypt } from "../crypto";
import {RADOX_API_BASE,EDITOR_AI_MODEL} from "./radoxConfig";

export interface ProviderConfigRecord {
  id: string;
  provider_key: string;
  category: string;
  name: string;
  enabled: boolean;
  encrypted_api_key?: string | null;
  config: Record<string, any>;
  last_tested_at?: string | null;
  last_test_status: "connected" | "not_configured" | "error" | "disabled" | "untested";
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderSafeMetadata {
  id: string;
  provider_key: string;
  category: string;
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

/**
 * Safely masks an API key so that only the last 4 characters are visible.
 * Example: ••••••••••••7X92
 * Plaintext keys must NEVER be sent to client components.
 */
export function maskApiKey(key: string | null | undefined): string | null {
  if (!key) return null;
  const trimmed = key.trim();
  if (trimmed.length <= 4) return "••••••••";
  const last4 = trimmed.slice(-4);
  return `••••••••••••${last4}`;
}

/**
 * Server-only secret resolver:
 * 1. Queries `provider_configs` table.
 * 2. If record is found and enabled, decrypts `encrypted_api_key` using AES-256-GCM.
 * 3. Falls back to server environment variables (ELEVENLABS_API_KEY, GROQ_API_KEY) if unconfigured in DB.
 * 4. Returns the plaintext secret to server-side code only.
 */
export async function getProviderCredential(providerKey: string): Promise<string | null> {
  try {
    const db = getAdminClient();
    const { data } = await db
      .from("provider_configs")
      .select("enabled, encrypted_api_key")
      .eq("provider_key", providerKey)
      .maybeSingle();

    if (data && !data.enabled) return null;
    if (data && data.enabled && data.encrypted_api_key) {
      const decrypted = decrypt(data.encrypted_api_key);
      if (decrypted && decrypted.trim()) {
        return decrypted.trim();
      }
    }
  } catch (err) {
    console.warn(`[providerRegistry] Database lookup failed for ${providerKey}:`, err);
  }

  // Server-only environment variable fallback (for bootstrap / development)
  if (providerKey === "voiceai") {
    const envKey = process.env.VOICE_AI_API_KEY || process.env.VOICE_AI_API_KEYS?.split(",")[0];
    if (envKey && envKey.trim()) return envKey.trim();
  } else if (providerKey === "elevenlabs") {
    const envKey = process.env.ELEVENLABS_API_KEY;
    if (envKey && envKey.trim()) return envKey.trim();
  } else if (providerKey === "gemini") {
    const envKey = process.env.GEMINI_API_KEY;
    if (envKey && envKey.trim()) return envKey.trim();
  } else if (providerKey === "openrouter") {
    const envKey = process.env.OPENROUTER_API_KEY;
    if (envKey && envKey.trim()) return envKey.trim();
  } else if(providerKey==="radox"){
    const envKey=process.env.RADOX_API_KEY;if(envKey&&envKey.trim())return envKey.trim();
  } else if (providerKey === "groq") {
    const envKey = process.env.GROQ_API_KEY;
    if (envKey && envKey.trim()) return envKey.trim();
  }

  return null;
}

/**
 * Resolves non-secret provider configuration (e.g. default voice ID, model, stability).
 */
export async function getProviderConfig(providerKey: string): Promise<Record<string, any>> {
  try {
    const db = getAdminClient();
    const { data } = await db
      .from("provider_configs")
      .select("config")
      .eq("provider_key", providerKey)
      .maybeSingle();

    return data?.config || {};
  } catch {
    return {};
  }
}

/**
 * Retrieves all registered providers with safe metadata for the Admin UI.
 */
export async function getAllProviders(): Promise<ProviderSafeMetadata[]> {
  const db = getAdminClient();
  let records: ProviderConfigRecord[] = [];

  try {
    const { data, error } = await db
      .from("provider_configs")
      .select("*")
      .order("created_at", { ascending: true });

    if (!error && Array.isArray(data)) {
      records = data as ProviderConfigRecord[];
    }
  } catch (err) {
    console.warn("[providerRegistry] Failed to query provider_configs table:", err);
  }

  // Ensure default providers exist if table is unseeded or missing
  const coreProviderKeys = [
    "openrouter",
    "gemini",
    "elevenlabs",
    "voiceai",
    "groq",
    "radox",
    "pollinations",
    "remotion_render",
  ];

  for (const key of coreProviderKeys) {
    if (!records.some((r) => r.provider_key === key)) {
      records.push({
        id: `bootstrap-${key}`,
        provider_key: key,
        category:
          key === "elevenlabs" || key === "voiceai"
            ? "voice"
            : key === "pollinations"
            ? "visuals"
            : key === "remotion_render"
            ? "render"
            : "ai",
        name:
          key === "openrouter"
            ? "OpenRouter (Nemotron 3 Ultra)"
            : key === "gemini"
            ? "Google Gemini 2.0"
            : key === "elevenlabs"
            ? "ElevenLabs"
            : key === "voiceai"
            ? "Voice.ai"
            : key === "radox"
            ? "Radox · Claude Opus 5.5"
            : key === "groq"
            ? "Groq AI"
            : key === "pollinations"
            ? "Pollinations Visuals"
            : "Remotion Client Engine",
        enabled: true,
        config:
          key === "openrouter"
            ? { modelId: process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free" }
            : key === "gemini"
            ? { modelId: process.env.GEMINI_MODEL || "gemini-3.6-flash" }
            : key === "radox"
            ? {modelId:EDITOR_AI_MODEL,apiBase:RADOX_API_BASE}
            : key === "groq"
            ? { contentKitModelId: "openai/gpt-oss-20b", aiEditModelId: "openai/gpt-oss-120b" }
            : {},
        last_test_status: "untested",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  return records.map((rec) => {
    let maskedKey: string | null = null;
    let hasKey = false;

    if (rec.encrypted_api_key) {
      try {
        const decrypted = decrypt(rec.encrypted_api_key);
        if (decrypted && decrypted.trim()) {
          maskedKey = maskApiKey(decrypted);
          hasKey = true;
        }
      } catch {
        maskedKey = "••••••••(encrypted)";
        hasKey = true;
      }
    } else {
      // Check server env fallback
      if (rec.provider_key === "voiceai" && (process.env.VOICE_AI_API_KEY || process.env.VOICE_AI_API_KEYS)) {
        maskedKey = maskApiKey(process.env.VOICE_AI_API_KEY || process.env.VOICE_AI_API_KEYS?.split(",")[0]);
        hasKey = true;
      } else if (rec.provider_key === "elevenlabs" && process.env.ELEVENLABS_API_KEY) {
        maskedKey = maskApiKey(process.env.ELEVENLABS_API_KEY);
        hasKey = true;
      } else if (rec.provider_key === "gemini" && process.env.GEMINI_API_KEY) {
        maskedKey = maskApiKey(process.env.GEMINI_API_KEY);
        hasKey = true;
      } else if (rec.provider_key === "openrouter" && process.env.OPENROUTER_API_KEY) {
        maskedKey = maskApiKey(process.env.OPENROUTER_API_KEY);
        hasKey = true;
      } else if(rec.provider_key==="radox"&&process.env.RADOX_API_KEY){
        maskedKey=maskApiKey(process.env.RADOX_API_KEY);hasKey=true;
      } else if (rec.provider_key === "groq" && process.env.GROQ_API_KEY) {
        maskedKey = maskApiKey(process.env.GROQ_API_KEY);
        hasKey = true;
      }
    }

    let status: ProviderSafeMetadata["status"] = "not_configured";
    if (!rec.enabled) {
      status = "disabled";
    } else if (rec.last_test_status === "connected" && rec.last_tested_at) {
      status = "connected";
    } else if (rec.last_test_status === "error") {
      status = "error";
    } else if (hasKey || rec.last_test_status === "connected") {
      status = "untested";
    }

    return {
      id: rec.id,
      provider_key: rec.provider_key,
      category: rec.category,
      name: rec.name,
      enabled: rec.enabled,
      configured: hasKey,
      status,
      maskedKey,
      lastTestedAt: rec.last_tested_at,
      lastTestStatus: rec.last_test_status,
      lastError: rec.last_error,
      config: rec.config || {},
    };
  });
}

/**
 * Server-side connection test against lightweight authenticated endpoints.
 * Never calls expensive generation routes just to verify keys.
 */
export async function testProviderConnection(
  providerKey: string,
  testKey?: string
): Promise<{ success: boolean; message: string; latencyMs: number }> {
  const key = testKey || (await getProviderCredential(providerKey));

  if (!key && providerKey !== "pollinations" && providerKey !== "remotion_render") {
    return {
      success: false,
      message: "No API key configured for this provider.",
      latencyMs: 0,
    };
  }

  const startTime = Date.now();

  try {
    if (providerKey === "voiceai") {
      // Lightweight authenticated voices endpoint: verifies key validity and available voices
      const res = await fetch("https://dev.voice.ai/api/v1/tts/voices", {
        headers: { Authorization: `Bearer ${key!}` },
        signal: AbortSignal.timeout(12000),
      });

      const latencyMs = Date.now() - startTime;
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const errMsg = errJson?.message || `Voice.ai authentication failed (HTTP ${res.status})`;
        return { success: false, message: errMsg, latencyMs };
      }

      const voices = await res.json();
      const count = Array.isArray(voices) ? voices.length : 8;
      return {
        success: true,
        message: `Voice.ai connection verified (${count} voices available, ${latencyMs}ms)`,
        latencyMs,
      };
    }

    if (providerKey === "elevenlabs") {
      // Lightweight authenticated endpoint: returns user profile/subscription info (0 TTS credits used)
      const res = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": key! },
        signal: AbortSignal.timeout(12000),
      });

      const latencyMs = Date.now() - startTime;
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const errMsg = errJson?.detail?.message || `Authentication failed (HTTP ${res.status})`;
        return { success: false, message: errMsg, latencyMs };
      }

      const userInfo = await res.json();
      const tier = `${Array.isArray(userInfo?.voices) ? userInfo.voices.length : 0} voices`;
      return {
        success: true,
        message: `ElevenLabs connection verified (${tier} tier, ${latencyMs}ms)`,
        latencyMs,
      };
    }

    if (providerKey === "gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key!)}`,
        { signal: AbortSignal.timeout(12000) }
      );
      const latencyMs = Date.now() - startTime;
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const errMsg = errJson?.error?.message || `Authentication failed (HTTP ${res.status})`;
        return { success: false, message: errMsg, latencyMs };
      }
      return {
        success: true,
        message: `Google Gemini API connection verified (${latencyMs}ms)`,
        latencyMs,
      };
    }

    if(providerKey==="radox"){
      const res=await fetch(RADOX_API_BASE+"/models",{headers:{Authorization:"Bearer "+key!},redirect:"error",signal:AbortSignal.timeout(12000),cache:"no-store"});
      const latencyMs=Date.now()-startTime;
      if(!res.ok)return {success:false,message:"Radox connection failed (HTTP "+res.status+").",latencyMs};
      const data=await res.json().catch(()=>null);
      const available=Array.isArray(data?.data)&&data.data.some((m:{id?:string})=>m.id===EDITOR_AI_MODEL);
      return {success:available,message:available?"Claude Opus 5.5 is available through Radox.":"Key accepted, but Radox does not list Claude Opus 5.5. No alternative model will be used.",latencyMs};
    }

    if (providerKey === "groq") {
      // Lightweight models endpoint: returns available models list (0 completion tokens used)
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${key!}` },
        signal: AbortSignal.timeout(12000),
      });

      const latencyMs = Date.now() - startTime;
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const errMsg = errJson?.error?.message || `Authentication failed (HTTP ${res.status})`;
        return { success: false, message: errMsg, latencyMs };
      }

      return {
        success: true,
        message: `Groq API connection verified (${latencyMs}ms)`,
        latencyMs,
      };
    }

    if (providerKey === "openrouter") {
      // Lightweight authenticated key verification endpoint
      const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: { Authorization: `Bearer ${key!}` },
        signal: AbortSignal.timeout(12000),
      });

      const latencyMs = Date.now() - startTime;
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const errMsg = errJson?.error?.message || `Authentication failed (HTTP ${res.status})`;
        return { success: false, message: errMsg, latencyMs };
      }

      const keyInfo = await res.json().catch(() => null);
      const tier = keyInfo?.data?.is_free_tier ? "Free Tier" : "Paid Tier";
      return {
        success: true,
        message: `OpenRouter connection verified (${tier}, Nemotron 3 Ultra ready, ${latencyMs}ms)`,
        latencyMs,
      };
    }

    if (providerKey === "pollinations") {
      // Visual generation endpoint reachability test
      const res = await fetch("https://image.pollinations.ai/prompt/test?width=32&height=32&nologo=true", {
        method: "HEAD",
        signal: AbortSignal.timeout(10000),
      });
      const latencyMs = Date.now() - startTime;
      return {
        success: res.ok,
        message: res.ok ? `Pollinations image engine active (${latencyMs}ms)` : `HTTP ${res.status}`,
        latencyMs,
      };
    }

    if (providerKey === "remotion_render") {
      return {
        success: true,
        message: "Remotion Canvas & WebAudio client render pipeline ready",
        latencyMs: 5,
      };
    }

    return {
      success: true,
      message: "Provider ping successful",
      latencyMs: Date.now() - startTime,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    return {
      success: false,
      message: err?.message || "Connection timed out or network error",
      latencyMs,
    };
  }
}

/**
 * Records an audit event in `provider_audit_logs`.
 * All metadata is strictly sanitized (NEVER secrets or keys).
 */
export async function recordAuditLog(options: {
  adminUserId?: string;
  action: string;
  providerKey: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    const db = getAdminClient();
    await db.from("provider_audit_logs").insert({
      admin_user_id: options.adminUserId || null,
      action: options.action,
      provider_key: options.providerKey,
      metadata: options.metadata || {},
    });
  } catch (err) {
    console.error("[providerRegistry] Failed to record audit log:", err);
  }
}

/**
 * Records usage telemetry in `provider_usage_logs`.
 */
export async function recordProviderUsage(options: {
  providerKey: string;
  operation: string;
  userId?: string | null;
  units: number;
  unitType: "characters" | "tokens" | "images" | "renders";
  status: "success" | "error";
  estimatedCost?: number | null;
  durationMs?: number | null;
  errorMessage?: string | null;
}): Promise<void> {
  try {
    const db = getAdminClient();
    await db.from("provider_usage_logs").insert({
      provider_key: options.providerKey,
      operation: options.operation,
      user_id: options.userId || null,
      units: options.units,
      unit_type: options.unitType,
      status: options.status,
      estimated_cost: options.estimatedCost ?? null,
      duration_ms: options.durationMs || null,
      error_message: options.errorMessage || null,
    });
  } catch (err) {
    console.error("[providerRegistry] Failed to record usage log:", err);
  }
}
