import { getProviderCredential, recordProviderUsage } from "./providerRegistry";

export interface OpenRouterCompletionOptions {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  userId?: string | null;
  operation?: string;
  model?: string;
}

export const DEFAULT_OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free";

export const FALLBACK_NEMOTRON_MODELS = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-ultra-550b-a55b",
  "nvidia/nemotron-3.5-lightning:free",
  "nvidia/nemotron-3.5-lightning",
  "nvidia/nemotron-3-super-120b-a12b:free",
];

/**
 * Resolves the OpenRouter API key strictly server-side:
 * 1. Checks environment variable `OPENROUTER_API_KEY`
 * 2. Checks encrypted `provider_configs` table in Supabase via providerRegistry
 * NEVER exposes this key to client components or browser bundles.
 */
export async function getOpenRouterApiKey(): Promise<string | null> {
  const envKey = process.env.OPENROUTER_API_KEY;
  if (envKey && envKey.trim()) {
    return envKey.trim();
  }

  try {
    const dbKey = await getProviderCredential("openrouter");
    if (dbKey && dbKey.trim()) {
      return dbKey.trim();
    }
  } catch (err) {
    console.warn("[openrouterService] Failed to fetch provider credential from database:", err);
  }

  return null;
}

/**
 * Helper to strip markdown code blocks like ```json ... ``` if the model returns them.
 */
export function cleanJsonText(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("```json")) {
    text = text.slice(7);
  } else if (text.startsWith("```")) {
    text = text.slice(3);
  }
  if (text.endsWith("```")) {
    text = text.slice(0, -3);
  }
  return text.trim();
}

/**
 * Core OpenRouter completion method utilizing NVIDIA Nemotron 3 Ultra.
 * Native, zero-dependency, server-only, with automatic model failover & retries.
 */
export async function generateOpenRouterContent(
  options: OpenRouterCompletionOptions
): Promise<string> {
  const apiKey = await getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error("OPENROUTER_NOT_CONFIGURED");
  }

  const startTime = Date.now();

  const primaryModel = options.model
    ? options.model
    : options.operation?.includes("model:")
    ? options.operation.split("model:")[1]
    : DEFAULT_OPENROUTER_MODEL;

  const candidateModels = Array.from(
    new Set([primaryModel, ...FALLBACK_NEMOTRON_MODELS])
  );

  const messages: Array<{ role: string; content: string }> = [];
  if (options.systemInstruction) {
    messages.push({
      role: "system",
      content: options.systemInstruction,
    });
  }
  messages.push({
    role: "user",
    content: options.prompt,
  });

  const requestPayload: Record<string, any> = {
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 6144,
  };

  if (options.jsonMode) {
    requestPayload.response_format = { type: "json_object" };
  }

  let lastError: Error | null = null;

  for (const model of candidateModels) {
    requestPayload.model = model;

    // Try up to 2 attempts per model for transient errors
    for (let attempt = 1; attempt <= 2; attempt++) {
      let res: Response;
      try {
        res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": "https://veelox.app",
            "X-Title": "Kreovar",
          },
          body: JSON.stringify(requestPayload),
          signal: AbortSignal.timeout(50000),
        });
      } catch (err: any) {
        if (err?.name === "TimeoutError") {
          lastError = new Error(`OpenRouter (${model}) request timed out after 50 seconds`);
          break; // move to next candidate model
        }
        lastError = err;
        break;
      }

      const data = await res.json().catch(() => null);

      if (res.ok && !data?.error) {
        const textOutput = data?.choices?.[0]?.message?.content || "";

        if (textOutput) {
          const durationMs = Date.now() - startTime;
          const totalTokens = data?.usage?.total_tokens || 500;

          // Log usage telemetry
          await recordProviderUsage({
            providerKey: "openrouter",
            operation: options.operation || `completion:${model}`,
            userId: options.userId,
            units: totalTokens,
            unitType: "tokens",
            status: "success",
            estimatedCost: data?.usage?.cost ?? 0,
            durationMs,
          });

          return textOutput;
        }
      }

      // If we reach here, an error occurred either via status or payload
      const errorCode = data?.error?.code || res.status;
      const errorMessage =
        data?.error?.message || `OpenRouter request failed with HTTP ${res.status}`;

      if (
        errorCode === 401 ||
        (errorCode === 400 && errorMessage.toLowerCase().includes("key"))
      ) {
        const durationMs = Date.now() - startTime;
        await recordProviderUsage({
          providerKey: "openrouter",
          operation: options.operation || "completion",
          userId: options.userId,
          units: 0,
          unitType: "tokens",
          status: "error",
          errorMessage: "INVALID_OPENROUTER_KEY",
          durationMs,
        });
        throw new Error("INVALID_OPENROUTER_KEY");
      }

      // If credit limit reached on paid variant (402), immediately skip to free variant without retry
      if (errorCode === 402 || errorMessage.toLowerCase().includes("credit")) {
        lastError = new Error(errorMessage);
        break; // skip to next candidate model
      }

      // If rate-limited (429) or temporary gateway/overloaded (502/503) on attempt 1, sleep 1500ms and retry
      const isTransient =
        errorCode === 429 ||
        errorCode === 502 ||
        errorCode === 503 ||
        errorMessage.toLowerCase().includes("overloaded") ||
        errorMessage.toLowerCase().includes("rate limit");

      if (isTransient && attempt === 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }

      lastError = new Error(
        errorCode === 429
          ? "OpenRouter rate limit reached — please wait a moment and try again."
          : errorMessage
      );
      // Move to next candidate model
      break;
    }
  }

  const durationMs = Date.now() - startTime;
  await recordProviderUsage({
    providerKey: "openrouter",
    operation: options.operation || "completion",
    userId: options.userId,
    units: 0,
    unitType: "tokens",
    status: "error",
    errorMessage: lastError?.message || "OpenRouter completion failed across all models",
    durationMs,
  });

  throw lastError || new Error("Failed to generate content with OpenRouter Nemotron 3 Ultra.");
}

/**
 * Helper to generate and parse structured JSON from OpenRouter Nemotron 3 Ultra.
 */
export async function generateOpenRouterJson<T>(
  options: OpenRouterCompletionOptions
): Promise<T> {
  const rawText = await generateOpenRouterContent({
    ...options,
    jsonMode: true,
  });

  const cleaned = cleanJsonText(rawText);
  try {
    return JSON.parse(cleaned) as T;
  } catch (parseErr) {
    console.error("[openrouterService] Failed to parse JSON from output:", parseErr, rawText);
    throw new Error("Nemotron 3 Ultra returned malformed structured data — please retry.");
  }
}
