# Task Assignment: Milestone 1 — Model Architecture & Fallback Integration

You are `worker_m1_1`, a `teamwork_worker`.
Working directory: c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\worker_m1_1\
Original Request: c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\ORIGINAL_REQUEST.md
PROJECT document: c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\orchestrator\PROJECT.md
Survey Analysis: c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\explorer_editor_survey_1\analysis.md

## File Ownership
You exclusively own and modify:
- `app/lib/server/editorProvider.ts`
- `app/lib/server/geminiService.ts`

## MANDATORY INTEGRITY WARNING
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Objective
Implement R3: Model Architecture and Fallback Integration:
1. In `app/lib/server/geminiService.ts`:
   - Support `gemini-3.8-flash` in default / fallback models list or allow `model` option override in `GeminiCompletionOptions`.
   - Ensure structured JSON generation (`generateGeminiJson<T>`) produces schema-compliant output and properly accounts for usage with `recordProviderUsage`.
2. In `app/lib/server/editorProvider.ts`:
   - Ensure primary provider is Groq using Qwen 3.7 27B (`qwen/qwen3.8-27b`).
   - Catch Groq HTTP 429 rate limits, timeouts, and 5xx errors.
   - Automatically fall back to Gemini 3.8 Flash (`gemini-3.8-flash`) via `geminiService.ts`.
   - Return `{ ...result, provider: 'gemini', fallbackReason: ... }` so subsequent validation corrections or calls know the active provider.
   - Maintain consistent JSON schemas and usage tracking.
3. Verify your changes:
   - Run `npx tsc --noEmit` and ensure 0 type errors.
   - Run `npm run build:cloudflare` to ensure clean build.
   - Run existing tests: `node --test scripts/test-chat-tool-routing.mjs`

Write your report to `c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\worker_m1_1\handoff.md`.
Send a message back when completed.

## 2026-11-07T10:45:48Z
**Context**: Milestone 1 Model Architecture & Fallback Liveness Check
**Content**: Checking in on implementation of Groq Qwen 3.7 27B and Gemini 3.8 Flash fallback in `editorProvider.ts` and `geminiService.ts`.
**Action**: Reply with your current status and update progress.md.
