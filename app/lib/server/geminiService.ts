import { getProviderCredential, recordProviderUsage } from "./providerRegistry";

export interface GeminiCompletionOptions {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  responseSchema?: Record<string, any>;
  userId?: string | null;
  operation?: string;
  signal?: AbortSignal;
  model?: string;
}

export const GEMINI_EDITOR_MODEL = "gemini-3.8-flash";
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || GEMINI_EDITOR_MODEL;
const FALLBACK_GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3-flash-preview",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-flash-latest",
];

/**
 * Resolves the Gemini API key strictly server-side:
 * 1. Checks encrypted `provider_configs` table in Supabase via providerRegistry
 * 2. Checks environment variable `GEMINI_API_KEY`
 * NEVER exposes this key to client components or browser bundles.
 */
export async function getGeminiApiKey(): Promise<string | null> {
  try {
    const dbKey = await getProviderCredential("gemini");
    if (dbKey && dbKey.trim()) {
      return dbKey.trim();
    }
  } catch (err) {
    console.warn("[geminiService] Failed to fetch provider credential from database:", err);
  }

  const envKey = process.env.GEMINI_API_KEY;
  if (envKey && envKey.trim()) {
    return envKey.trim();
  }

  return null;
}

/**
 * Helper to strip markdown code blocks like ```json ... ``` if the model returns them.
 */
function cleanJsonText(raw: string): string {
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  if (text.startsWith("```json")) {
    text = text.slice(7);
  } else if (text.startsWith("```")) {
    text = text.slice(3);
  }
  if (text.endsWith("```")) {
    text = text.slice(0, -3);
  }
  text = text.trim();
  if (!text.startsWith("{") && !text.startsWith("[")) {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return text.slice(firstBrace, lastBrace + 1);
    }
    const firstBracket = text.indexOf("[");
    const lastBracket = text.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      return text.slice(firstBracket, lastBracket + 1);
    }
  }
  return text;
}

/**
 * Core Gemini completion method utilizing the Google Generative Language REST API.
 * Completely native, zero-dependency, server-only, with automatic model failover & retries.
 */
export async function generateGeminiContent(
  options: GeminiCompletionOptions
): Promise<string> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_NOT_CONFIGURED");
  }

  const startTime = Date.now();
  // Build deduplicated candidate models list: primary model first, followed by fallbacks
  const primaryModel = options.model
    || (options.operation?.includes("model:")
      ? options.operation.split("model:")[1]
      : DEFAULT_GEMINI_MODEL);

  const candidateModels = Array.from(
    new Set([primaryModel, ...FALLBACK_GEMINI_MODELS])
  );

  const bodyPayload: Record<string, any> = {
    contents: [
      {
        role: "user",
        parts: [{ text: options.prompt }],
      },
    ],
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens ?? 6144,
    },
  };

  if (options.systemInstruction) {
    bodyPayload.system_instruction = {
      parts: [{ text: options.systemInstruction }],
    };
  }

  if (options.jsonMode) {
    bodyPayload.generationConfig.responseMimeType = "application/json";
    if (options.responseSchema) {
      bodyPayload.generationConfig.responseSchema = options.responseSchema;
    }
  }

  let lastError: Error | null = null;

  for (const model of candidateModels) {
    options.signal?.throwIfAborted();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;

    // Try up to 2 attempts per model for transient errors (503 / 429)
    for (let attempt = 1; attempt <= 2; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(bodyPayload),
          signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(35000)]) : AbortSignal.timeout(35000),
        });
      } catch (err: any) {
        options.signal?.throwIfAborted();
        if (err?.name === "TimeoutError") {
          lastError = new Error("Gemini API request timed out after 35 seconds");
          break; // move to next candidate model
        }
        lastError = err;
        break;
      }

      if (res.ok) {
        const data = await res.json().catch(() => null);
        const textOutput = (data?.candidates?.[0]?.content?.parts || [])
          .filter((part: { thought?: boolean; text?: string }) => !part.thought && typeof part.text === "string")
          .map((part: { text: string }) => part.text).join("");

        if (!textOutput) {
          lastError = new Error("Gemini returned an empty response.");
          break; // try next candidate
        }

        const durationMs = Date.now() - startTime;
        const totalTokens = data?.usageMetadata?.totalTokenCount || 500;

        // Log usage telemetry
        await recordProviderUsage({
          providerKey: "gemini",
          operation: options.operation || "completion",
          userId: options.userId,
          units: totalTokens,
          unitType: "tokens",
          status: "success",
          estimatedCost: (totalTokens / 1000000) * 0.075,
          durationMs,
        });

        return textOutput;
      }

      const errorData = await res.json().catch(() => null);
      const errorMessage =
        errorData?.error?.message || `Gemini request failed with HTTP ${res.status}`;

      if (res.status === 400 && errorMessage.includes("API key not valid")) {
        const durationMs = Date.now() - startTime;
        await recordProviderUsage({
          providerKey: "gemini",
          operation: options.operation || "completion",
          userId: options.userId,
          units: 0,
          unitType: "tokens",
          status: "error",
          errorMessage: "INVALID_GEMINI_KEY",
          durationMs,
        });
        throw new Error("INVALID_GEMINI_KEY");
      }

      // If high-demand spike (503) or rate-limit (429) on attempt 1, sleep 1000ms and retry
      if ((res.status === 503 || res.status === 429) && attempt === 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      lastError = new Error(
        res.status === 429
          ? "Gemini rate limit reached — please wait a moment and try again."
          : errorMessage
      );
      // Move to next candidate model
      break;
    }
  }

  const durationMs = Date.now() - startTime;
  await recordProviderUsage({
    providerKey: "gemini",
    operation: options.operation || "completion",
    userId: options.userId,
    units: 0,
    unitType: "tokens",
    status: "error",
    errorMessage: lastError?.message || "Gemini completion failed across all models",
    durationMs,
  });

  throw lastError || new Error("Failed to generate content with Gemini.");
}

/**
 * Helper to generate and parse structured JSON: prioritizes OpenRouter (Nemotron 3 Ultra)
 * when configured, with fallback to Google Gemini.
 */
export async function generateGeminiJson<T>(
  options: GeminiCompletionOptions
): Promise<T> {
  const rawText = await generateGeminiContent({
    ...options,
    jsonMode: true,
  });

  const cleaned = cleanJsonText(rawText);
  try {
    return JSON.parse(cleaned) as T;
  } catch (parseErr) {
    console.error("[geminiService] Failed to parse JSON from Gemini output:", parseErr, rawText);
    throw new Error("Gemini returned malformed structured data — please retry.");
  }
}
