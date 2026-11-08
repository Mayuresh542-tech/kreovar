# Project: Kreovar AI Editor Intelligent Custom Editing & Preset Repair

## Architecture
- **Model Provider Tier**: `app/lib/server/editorProvider.ts` orchestrates LLM plan generation. Uses Groq with Qwen 3.7 27B (`qwen/qwen3.8-27b`) as the primary provider, with automatic failover on HTTP 429 rate limits, timeouts, or 5xx server errors to Gemini 3.8 Flash (`gemini-3.8-flash`) via `app/lib/server/geminiService.ts`. Telemetry and usage tracked consistently via `recordProviderUsage`.
- **Wire Contract & API Route**: `POST /api/editor/ai-edit` receives `prompt`, `conversationHistory`, `pipelineStage`, and project state. Context-aware prompt generation in `app/lib/server/editorAi.ts` incorporates conversation history, transcript timestamps, sampled visual frames, clip properties, and existing captions.
- **Pipeline Stage Execution & Lifecycle**: `app/lib/editor/sequentialEdit.ts` and `app/lib/editor/sequentialEditClient.ts` manage multistage jobs:
  - Custom edits run `analyzeFootage` locally -> `applyRequestedEdits` atomically (using all 28 native operations and 7 media tools) -> `validateEdit`.
  - Preset pipelines (`engaging`, `clean`, `punchy`) run sequential stages (`applyCaptions`, `applyMotionGraphics`, `applyBroll`, `applyZooms`, `applySoundEffects`).
  - Resilient stage and job validation tolerates 0 additions on short footage (<4s), footage with 0 speech segments, explicit skip rationales, or clarification question returns.
- **Presentation Layer**: `app/components/editor/workspace/AiEditingChat.tsx` presents chat interactions, captures conversation turns, displays clarification questions, and maintains `editingHistory`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Custom stages initialization | Free-form edits initialize `stagesFor(['requestedEdits'])` yielding `['analyzeFootage', 'applyRequestedEdits', 'validateEdit']` | M3 | survey |
| 2 | Local custom `analyzeFootage` | Custom edits analyze duration and speech locally without remote LLM roundtrip, preventing sub-stage decomposition | M3 | survey |
| 3 | Atomic `applyRequestedEdits` execution | Executes full edit plan in single atomic stage supporting all 28 native operations and 7 media tools | M3 | survey |
| 4 | Wire contract `conversationHistory` | Client serializes prior completed/clarified turns and `POST /api/editor/ai-edit` parses and forwards them | M3 | survey |
| 5 | Conversation history extraction | `sequentialEditClient.ts` extracts completed and clarified turns from `project.editingHistory` | M3 | survey |
| 6 | Clarification history preservation | `persist()` saves clarification question summaries without overwriting with generic completion text | M3 | survey |
| 7 | Conversational instruction parsing | Understands free-form natural language instructions and user intent in `editorAi.ts` | M3 | survey |
| 8 | Section bounds & temporal ranges | Supports "first 10s untouched", "after 0:15", "second half" restricting timeline modifications | M3 | survey |
| 9 | Strict negative constraints | Complies with "don't change audio", "no SFX", "don't cut footage", preserving specified tracks/clips | M3 | survey |
| 10 | Conversational refinements | Modifies existing clips/captions in-place (`composeCaption`, `changeClipProperty`, `clearZooms`, `changeText`) without duplicate elements | M3 | survey |
| 11 | Word gap silence trimming | Trims >0.6s speech gaps using speechContext word timestamps into a single consolidated `rippleCut` | M3 | survey |
| 12 | Style directive presets | Understands style directives (podcast, documentary, high-energy) affecting caption styling, zooms, and ducking | M3 | survey |
| 13 | Clarification question detection | Ambiguous or conflicting instructions return `intent.questions` without crashing the pipeline | M3 | survey |
| 14 | `applyRequestedEdits` zero-decision tolerance | Clarification turns with 0 decisions complete successfully without throwing 'no actionable edits' | M3 | survey |
| 15 | `validateStageChanges` clarification tolerance | Permits 0 timeline changes when clarification questions are returned | M3 | survey |
| 16 | `validateCompletedJob` clarification tolerance | Completed jobs with clarification questions pass validation without requiring revision increments | M3 | survey |
| 17 | Chat UI clarification display | `AiEditingChat.tsx` displays clarification questions from the job summary instead of generic export text | M3 | survey |
| 18 | Short footage preset resilience | Supporting stages (`applyZooms`, `applyBroll`, `applyMotionGraphics`, `applySoundEffects`) tolerate 0 additions when duration < 4.0s | M2 | survey |
| 19 | Speech-free preset resilience | Supporting stages tolerate 0 additions when speech segments count === 0 | M2 | survey |
| 20 | Explicit skip rationale resilience | Supporting stages tolerate 0 additions when stage output summary documents an editorial skip rationale | M2 | survey |
| 21 | Preset completed job validation | `validateCompletedJob` passes if at least one meaningful stage (e.g. analysis/captions) completed | M2 | survey |
| 22 | Dynamic caption generation & restyling | `applyCaptions` restyles in-place with `applyCaptionTemplate` if captioned, otherwise generates captions with dynamic motion | M2 | survey |
| 23 | Primary LLM Provider: Groq Qwen 3.7 27B | `editorProvider.ts` uses `qwen/qwen3.8-27b` via Groq for planning | M1 | survey |
| 24 | Gemini 3.8 Flash model support | `geminiService.ts` includes `gemini-3.8-flash` in candidate models with consistent JSON schema support | M1 | survey |
| 25 | Automatic failover to Gemini | `editorProvider.ts` catches Groq 429, timeouts, and 5xx errors and transparently fails over to Gemini 3.8 Flash | M1 | survey |
| 26 | Consistent schema & usage tracking | Primary and fallback providers maintain JSON schema compliance and record usage via `recordProviderUsage` | M1 | survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Model Architecture & Fallback Integration | `app/lib/server/editorProvider.ts`, `app/lib/server/geminiService.ts` (Features 23-26) | none | DONE |
| M2 | Preset Flow Repair & Resilience | `app/lib/editor/sequentialEdit.ts`, `app/lib/editor/sequentialEditClient.ts` (Features 18-22) | none | DONE |
| M3 | Intelligent Custom AI Editing & Clarification | `app/lib/editor/sequentialEdit.ts`, `app/lib/editor/sequentialEditClient.ts`, `app/api/editor/ai-edit/route.ts`, `app/lib/server/editorAi.ts`, `app/components/editor/workspace/AiEditingChat.tsx` (Features 1-17) | M1, M2 | DONE |
| M4 | Final Milestone: 100% E2E Pass & Adversarial Hardening | Full system validation against `scripts/test-custom-ai-editing.mjs` and Tier 5 coverage audit | M3, E2E Track | DONE |

## E2E Testing Track (Parallel)
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | Comprehensive Opaque-Box Test Suite | `scripts/test-custom-ai-editing.mjs` (Tiers 1-4 coverage, 6 core acceptance scenarios, >=30 test cases) -> publishes `TEST_READY.md` | none | DONE |

## Interface Contracts
### `editorProvider.ts` ↔ `geminiService.ts`
- `generateEditPlanJson<T>(options, preferred)`:
  - Calls `generateGroqEditorJson<T>(options, preferred?.visualContext)`.
  - On error matching 429 (`GROQ_RATE_LIMIT`), timeout, or 5xx, falls back to `generateGeminiJson<T>({ ...options, model: 'gemini-3.8-flash' })`.
  - Returns `{ ...result, provider: 'gemini', fallbackReason: error.message }`.

### `sequentialEditClient.ts` ↔ `/api/editor/ai-edit/route.ts`
- Client POST body:
  ```typescript
  {
    projectId: project.id,
    prompt: stagePrompt,
    pipelineStage: stage.id,
    project,
    conversationHistory: Array<{ role: 'user' | 'assistant', content: string }>
  }
  ```
- Server response:
  ```typescript
  {
    summary: string,
    questions?: string[],
    list: EditDecisionList,
    toolRequests: AiToolRequest[],
    requiredOperations?: RequestedOperation[]
  }
  ```

### `sequentialEditClient.ts` ↔ `sequentialEdit.ts`
- `StageOutput`:
  ```typescript
  export interface StageOutput {
    summary: string;
    questions?: string[];
    decisions?: EditDecision[];
    requests?: AiToolRequest[];
    operations?: RequestedOperation[];
    skipRationale?: string;
  }
  ```
- Validation rules:
  - If `stageOutput.questions?.length > 0`: `validateStageChanges` accepts 0 changes; `validateCompletedJob` accepts revision === initialRevision.
  - Supporting preset stages (`applyZooms`, `applyBroll`, `applyMotionGraphics`, `applySoundEffects`): tolerate 0 additions if `duration < 4.0` OR `speechContext.length === 0` OR `output.summary` matches skip keywords.

## Code Layout
- `app/lib/server/editorProvider.ts`: Model provider dispatch & fallback orchestration
- `app/lib/server/geminiService.ts`: Gemini SDK wrapper, models list, token usage accounting
- `app/lib/server/editorAi.ts`: AI prompt construction, schema validation, timeline tool preparation
- `app/api/editor/ai-edit/route.ts`: API route handling `/api/editor/ai-edit`
- `app/lib/editor/sequentialEdit.ts`: Pure sequential editing pipeline, preset definitions, stage validation, completed job verification
- `app/lib/editor/sequentialEditClient.ts`: Client execution runner, asset preparation, history persistence
- `app/components/editor/workspace/AiEditingChat.tsx`: User interface for AI editing chat, presets, and clarification display
- `scripts/test-custom-ai-editing.mjs`: Automated verification test suite
