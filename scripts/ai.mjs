import fs from "fs";
import path from "path";
import readline from "readline";

// 1. Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const apiKey = process.env.OPENROUTER_API_KEY;
const model = process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free";

if (!apiKey) {
  console.error("\x1b[31mError: OPENROUTER_API_KEY is not set in .env.local\x1b[0m");
  process.exit(1);
}

async function askNemotron(prompt, isJson = false) {
  process.stdout.write("\x1b[36mNemotron 3 Ultra thinking...\x1b[0m\r");

  const fallbackModels = [
    model,
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "nvidia/nemotron-3-ultra-550b-a55b",
    "nvidia/nemotron-3.5-lightning:free",
  ];

  const uniqueModels = Array.from(new Set(fallbackModels));
  let lastError = null;

  for (const m of uniqueModels) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://veelox.app",
          "X-Title": "Veelox CLI",
        },
        body: JSON.stringify({
          model: m,
          messages: [
            {
              role: "system",
              content: isJson
                ? "You are a helpful assistant for Veelox. Respond with strictly valid JSON."
                : "You are a helpful expert creator and developer assistant for Veelox.",
            },
            { role: "user", content: prompt },
          ],
          response_format: isJson ? { type: "json_object" } : undefined,
          temperature: 0.7,
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.choices?.[0]?.message?.content) {
        process.stdout.write("                                        \r");
        return {
          content: data.choices[0].message.content,
          modelUsed: m,
        };
      }

      const err = data?.error?.message || `HTTP ${res.status}`;
      if (err.toLowerCase().includes("credit") || res.status === 402) {
        continue; // try next candidate (e.g. :free variant)
      }
      lastError = new Error(err);
    } catch (e) {
      lastError = e;
    }
  }

  process.stdout.write("                                        \r");
  throw lastError || new Error("Failed to get response from OpenRouter");
}

async function main() {
  const args = process.argv.slice(2);
  const isJson = args.includes("--json");
  const filteredArgs = args.filter((a) => a !== "--json");

  // Single prompt mode
  if (filteredArgs.length > 0) {
    const prompt = filteredArgs.join(" ");
    try {
      const result = await askNemotron(prompt, isJson);
      console.log(`\x1b[32m[${result.modelUsed}]\x1b[0m\n${result.content}`);
    } catch (err) {
      console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
    }
    return;
  }

  // Interactive chat mode
  console.log(`\x1b[1m\x1b[34m=== Veelox OpenRouter CLI (NVIDIA Nemotron 3 Ultra) ===\x1b[0m`);
  console.log(`Model: \x1b[33m${model}\x1b[0m`);
  console.log(`Type your prompt and press Enter. Type "exit" or Ctrl+C to quit.\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\x1b[35mveelox-ai>\x1b[0m ",
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }
    if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
      rl.close();
      return;
    }

    try {
      const result = await askNemotron(input);
      console.log(`\n\x1b[32m[${result.modelUsed}]\x1b[0m\n${result.content}\n`);
    } catch (err) {
      console.error(`\n\x1b[31mError: ${err.message}\x1b[0m\n`);
    }

    rl.prompt();
  });

  rl.on("close", () => {
    console.log("\nBye!");
    process.exit(0);
  });
}

main();
