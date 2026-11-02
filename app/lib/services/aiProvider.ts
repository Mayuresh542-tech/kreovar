export interface AICompletionOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  jsonMode?: boolean;
}

export interface AIProvider {
  isAvailable(): boolean;
  complete(options: AICompletionOptions): Promise<string>;
}

export class GroqAIProvider implements AIProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "llama-3.3-70b-versatile") {
    this.apiKey = apiKey.trim();
    this.model = model;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(options: AICompletionOptions): Promise<string> {
    if (!this.apiKey) {
      throw new Error("Groq API key not provided.");
    }

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: options.systemPrompt },
          { role: "user", content: options.userPrompt },
        ],
        temperature: options.temperature ?? 0.7,
        max_tokens: 6144,
        response_format: options.jsonMode ? { type: "json_object" } : undefined,
      }),
      signal: AbortSignal.timeout(35000),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      throw new Error(errData?.error?.message ?? `Groq request failed with HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }
}

export class OpenRouterAIProvider implements AIProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "nvidia/nemotron-3-ultra-550b-a55b:free") {
    this.apiKey = apiKey.trim();
    this.model = model;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(options: AICompletionOptions): Promise<string> {
    if (!this.apiKey) {
      throw new Error("OpenRouter API key not provided.");
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (options.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }
    messages.push({ role: "user", content: options.userPrompt });

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://veelox.app",
        "X-Title": "Kreovar Dev",
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: 6144,
        response_format: options.jsonMode ? { type: "json_object" } : undefined,
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      throw new Error(errData?.error?.message ?? `OpenRouter request failed with HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }
}

export class MockAIProvider implements AIProvider {
  isAvailable(): boolean {
    return true; // Always available for offline / development mode
  }

  async complete(options: AICompletionOptions): Promise<string> {
    // Artificial latency for realistic creator experience
    await new Promise((r) => setTimeout(r, 600));

    if (options.jsonMode) {
      return JSON.stringify({
        developmentMode: true,
        message: "Generated via Kreovar Development Engine",
      });
    }

    return "Kreovar Development Mode Response";
  }
}

import { supabase } from "../supabase";

export class RemoteAIProvider implements AIProvider {
  isAvailable(): boolean {
    return true;
  }

  async complete(options: AICompletionOptions): Promise<string> {
    let token: string | null = null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token || null;
    } catch {
      // Ignored
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    try {
      const res = await fetch("/api/ai/complete", {
        method: "POST",
        headers,
        body: JSON.stringify(options),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "AI generation is temporarily unavailable.");
      }

      const data = await res.json();
      return data.content || "";
    } catch (err: any) {
      throw err;
    }
  }
}

/**
 * Factory helper: resolves the appropriate AIProvider based on environment and key:
 * - If explicit apiKey is provided, uses GroqAIProvider directly.
 * - In browser, uses RemoteAIProvider (/api/ai/complete) so credentials stay server-side.
 * - Fallback to MockAIProvider for offline/local development.
 */
export function getAIProvider(apiKey?: string | null): AIProvider {
  if (apiKey && apiKey.trim().length > 0) {
    return new GroqAIProvider(apiKey);
  }
  if (typeof window !== "undefined") {
    return new RemoteAIProvider();
  }
  return new MockAIProvider();
}

