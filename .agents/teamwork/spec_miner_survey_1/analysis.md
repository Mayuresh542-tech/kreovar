# Specification Analysis: Intelligent Custom AI Editing System & Preset Flow Repair

## Executive Summary
This document provides an exhaustive, authoritative specification analysis for implementing the **Kreovar Intelligent Custom AI Editing System** and **Preset Flow Repair**, synthesized from `ORIGINAL_REQUEST.md`, `docs/superpowers/specs/2026-11-07-intelligent-custom-editing-and-preset-repair-design.md`, and the existing Kreovar codebase.

The system transitions Kreovar from rigid preset-only and brittle decomposition pipelines into an intelligent, conversational, section-aware, and resilient video editing engine capable of leveraging all 28 native timeline operations, 7 media tools, multi-turn conversational history, clarification workflows, resilient preset completion on short/silent footage, and a Groq Qwen 3.7 27B primary model with automatic Gemini 3.8 Flash fallback.

---

## 1. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Pipeline Routing | Custom Edit Stage Initialization | When `presetId` is undefined, `stagesFor(['requestedEdits'])` initializes `['analyzeFootage', 'applyRequestedEdits', 'validateEdit']`. | `operations: ['requestedEdits']` | Array of 3 stages: `analyzeFootage`, `applyRequestedEdits`, `validateEdit` | Throws if mixed with preset stages (`Custom requestedEdits must run alone`) | `sequentialEdit.ts:48-51`, Spec §4.1 |
| 2 | Pipeline Routing | Local Custom Footage Analysis | For custom edits (`presetId` undefined), `analyzeFootage` in `sequentialEditClient.ts` executes locally without calling the LLM, collecting timeline duration, speech segment count, and sampled frames, returning `operations: ['requestedEdits']`. | `project: EditorProject`, `selection: string[]`, `frames?: FootageFrame[]` | `StageOutput` containing `operations: ['requestedEdits']`, `analysis`, and `summary` | Throws if timeline is corrupted or missing required metadata | Spec §4.1, `sequentialEditClient.ts:62-68` |
| 3 | Pipeline Routing | Atomic Custom Execution (`applyRequestedEdits`) | Executes direct native decisions followed by external media tool preparation and insertion in a single atomic timeline update, eliminating multi-stage timing discrepancies. | `project: EditorProject`, `job: EditingJob`, `frames?: FootageFrame[]` | `StageOutput` with direct `decisions`, resolved `assets`, and prepared clip insertions | Throws if decisions are invalid or outside capability boundaries | Spec §3, §4.1, `sequentialEditClient.ts:86-93` |
| 4 | Wire Contract | Top-Level `conversationHistory` Contract | `POST /api/editor/ai-edit` receives `conversationHistory?: { instructions: string; summary: string }[]` as an explicit top-level body parameter alongside `project`. | HTTP request JSON body | Parsed & validated `conversationHistory` array passed to `planAiEdit` | HTTP 400 if malformed (not array or invalid entry strings) | Spec §4.2, `route.ts:41-53` |
| 5 | Wire Contract | Client Conversation History Extraction | In `sequentialEditClient.ts`, `plan()` extracts completed and clarified editing turns from `project.editingHistory`, filtering out aborted/cancelled/failed attempts to prevent LLM hallucinations. | `project.editingHistory` | Array of `{ instructions, summary }` tuples | None; defaults to empty array if no history | Spec §4.2, `sequentialEditClient.ts:28-35` |
| 6 | Wire Contract | Editing History Clarification Preservation | `runSequentialEdit` `persist()` preserves the exact clarification summary (or question text) in `editingHistory` instead of overwriting with `"All requested stages completed."`. | Completed or clarified `job` | Appended `project.editingHistory` entry with true question/summary | None | Spec §4.3, `sequentialEditClient.ts:28-30` |
| 7 | NLU & Prompting | Conversational Refinement & In-Place Modification | Refinements referencing existing elements ("make captions smaller", "change font to Poppins", "remove zoom") mutate existing clips/captions (`composeCaption`, `changeClipProperty`, `applyCaptionTemplate`, `clearZooms`) rather than creating duplicates. | Follow-up instruction + `project.captions` + `project.clips` | Targeted `decisions` updating existing clip IDs | Validation error if duplicate overlapping captions are generated | Spec §4.2 rule 1, `editorAi.ts:73` |
| 8 | NLU & Prompting | Section & Temporal Range Bounds | Resolves phrases like "keep first 10s untouched", "after 15 seconds", "between 0:10 and 0:25", "only second half", translating to numerical start/end bounds and restricting all operations to that window. | Natural language range phrase + `projectDuration` | `startTime` / `endTime` bounded operations strictly within active range | Validation error if operations placed in protected interval | Spec §4.2 rule 2, `editorAi.ts:74` |
| 9 | NLU & Prompting | Negative Constraint Compliance | Strictly obeys negative constraints ("don't change original audio", "no sound effects", "don't cut footage", Hinglish: "mat", "nahi", "bina"), emitting zero decisions/tools of that type. | Negative phrasing in instruction | Explicit omission of targeted operation/tool types | Fails validation / rejected if negative constraint violated | Spec §4.2 rule 3, `editorAi.ts:31,75` |
| 10 | NLU & Prompting | Pacing & Word Gap Trimming | Analyzes speech word gaps (>0.6s) and plans atomic `rippleCut` ranges as the single last direct decision; all cuts combined into one operation. | "remove pauses", "improve pacing" + `speechContext` word gaps | `{ op: "rippleCut", ranges: [{ start, end }] }` as final direct decision | Throws if multiple `rippleCut` ops or placed before clip edits | Spec §4.2 rule 4, `aiValidation.ts:165-166` |
| 11 | NLU & Prompting | Preset Style Directives | Custom instructions requesting specific styles map to coherent packages: Podcast (`clean-sub`/`signature-poppins`, subtle topic zooms, audio ducking); Documentary (letterbox/cinematic, muted archival B-roll, lower-thirds); High-energy (pop captions, animated callouts, dynamic zooms, SFX). | Style keywords in prompt | Harmonious combination of native operations & media tools | Clarification requested if style is contradictory | Spec §4.2 rule 5 |
| 12 | Timeline Palette | 28 Native Timeline Operations | Full native operation capability: `composeCaption`, `setVisualTreatment`, `addShape`, `keyframes`, `animate`, `addGraphic`, `addOverlay`, `addZoom`, `clearZooms`, `rippleCut`, `applyTextPlacement`, `appendSequence`, `applyCaptionTemplate`, `setAudioDucking`, `addClip`, `removeClip`, `moveClip`, `trimClip`, `splitClip`, `addText`, `addCaption`, `addTransition`, `duplicateClip`, `changeText`, `mergeCaptions`, `changeTrack`, `setAspectRatio`, `changeClipProperty`. | Valid JSON decision objects matching `EditDecision` schemas | Timeline mutation in `applyEditDecisionList` | Throws `Error('Unsupported AI editing operation')` on unknown op | `editingCapabilities.ts:3-5`, `aiValidation.ts:80-160` |
| 13 | External Tools | 7 External Media Tools | Supports external tools in `applyRequestedEdits`: `captions`, `sfx`, `library`, `broll`, `motion`, `voiceover`, `image` (gated by `IMAGE_GENERATION_ENABLED==="true"`). | `AiToolRequest` specifications | Prepared media assets and timeline insertion decisions | Throws if unauthorized tool or image requested while disabled | `editingCapabilities.ts:18`, `aiTools.ts`, `editorAi.ts:87` |
| 14 | Clarification | Clarification Intent Extraction | `readEditingIntent` parses `intent: { goal, preserve, questions }`. If `questions.length > 0`, system treats the turn as a clarification request. | LLM response payload | `{ questions: string[], summary: string }` | Throws if intent structure is malformed | `editingIntent.ts:1-12`, Spec §4.3 |
| 15 | Clarification | Non-Crashing Pipeline Clarification | `editorAi.ts` returns `{ summary: intent.summary, questions: intent.questions, list: { decisions: [] }, toolRequests: [] }`. `applyRequestedEdits` accepts this output without throwing `"AI did not return any actionable requested edits"`. | Ambiguous user prompt producing questions | Empty decisions + questions summary | Replaced existing error with graceful clarification return | Spec §4.3, `sequentialEditClient.ts:88` |
| 16 | Clarification | Clarification Stage Change Validation | `validateStageChanges` accepts clarification output with 0 changed clips when `output.questions?.length > 0`, bypassing `"Requested edits did not change the timeline"`. | Zero-change project + clarification output | Accepted `StageOutput` with questions | Throws only if 0 changes occurred WITHOUT questions | Spec §4.3, `sequentialEdit.ts:112-113` |
| 17 | Clarification | Clarification Completed Job Validation | `validateCompletedJob` detects `job.stages.some(s => s.output?.questions?.length > 0)` and returns a clarification summary without throwing `"No requested edits were committed."`. | Completed job with clarification stage | `{ summary: "Clarification required: ..." }` | Bypasses zero-commit error | Spec §4.3, `sequentialEdit.ts:140` |
| 18 | Clarification UI | Chat UI Clarification Prompt | `AiEditingChat.tsx` renders the AI's question prompt clearly to the user instead of the generic `"Editing completed... Review the preview, then export your MP4"`. | Completed job with questions in stage output | Distinct clarification question bubble/banner in chat UI | Preserves existing layout; does not crash | Spec §4.3, `AiEditingChat.tsx:33` |
| 19 | Preset Resilience | Supporting Stage Zero-Addition Tolerance | `validateStageChanges` permits supporting preset stages (`applyZooms`, `applyBroll`, `applyMotionGraphics`, `applySoundEffects`) to complete with 0 new additions if: (a) `projectDuration < 4.0s`, (b) 0 speech segments in footage, or (c) summary documents skip rationale. | Zero-addition stage output + short/silent project or documented skip rationale | Accepted `StageOutput` without throwing | Throws only if zero additions occur on normal speech footage without rationale | Spec §4.4, `sequentialEdit.ts:116-121` |
| 20 | Preset Resilience | Client-Side Zero-Addition Tolerance | `sequentialEditClient.ts` tolerates zero decisions in `planMotionGraphics`, `applyMotionGraphics`, `findBroll`, `applyBroll`, `applyZooms`, and `applySoundEffects` under resilience conditions. | Short/silent footage | Resolves stage output cleanly without aborting | Previously threw "AI did not plan any requested motion graphics" | Spec §4.4, `sequentialEditClient.ts:75,79,83` |
| 21 | Preset Resilience | Whole-Job Completion Resilience | `validateCompletedJob` succeeds if at least one meaningful stage succeeded (e.g. captions or analyzeFootage) and supporting stages skipped legitimately. | Job where captions succeeded but zooms/broll skipped | Success summary | Throws if zero stages succeeded overall | Spec §4.4, `sequentialEdit.ts:140` |
| 22 | Preset Preservation | PIPELINE_PRESETS Preservation | Retains exact preset configurations: `engaging` (captions, motionGraphics, broll, zooms), `clean` (captions), `punchy` (captions, motionGraphics, zooms, soundEffects). | Preset selection buttons | Preset job creation | None; presets remain untouched in configuration | `sequentialEdit.ts:21-25`, R2 |
| 23 | Model Fallback | Groq Primary Provider (Qwen 3.7 27B) | `editorProvider.ts` uses Groq with `qwen/qwen3.8-27b` as primary model for planning, visual observations, and prompt reasoning. | User prompt + timeline context | Validated edit plan JSON | Catches transient/infrastructure errors to trigger fallback | Spec §4.5, `editorProvider.ts:34`, `groqEditorFallback.ts:12-15` |
| 24 | Model Fallback | Gemini 3.8 Flash Automatic Fallback | `editorProvider.ts` automatically falls back to Gemini 3.8 Flash (`gemini-3.8-flash`) via `app/lib/server/geminiService.ts` on Groq rate limits (429), timeouts, or 5xx server errors. | Groq failure (429, timeout, 5xx) + prompt options | Identical schema edit plan JSON with `provider: 'gemini'` | Throws only if both Groq and Gemini fail | Spec §4.5, R3, `geminiService.ts` |
| 25 | Model Fallback | Consistent Telemetry & Usage Tracking | Fallback to Gemini logs token usage to `recordProviderUsage` with `providerKey: 'gemini'`, operation telemetry, and accurate cost estimation. | Gemini execution metadata | Telemetry rows in provider usage log | None | Spec §4.5, `geminiService.ts:147-156` |
| 26 | Verification | Automated Test Suite (`scripts/test-custom-ai-editing.mjs`) | Dedicated test suite verifying 6 test scenarios: podcast edit, section bounds, negative constraints, conversational refinement, clarification handling, and preset resilience. | Synthetic mock fixtures and speech transcripts | Assertion passes | Test failure on regression | Spec §5, `ORIGINAL_REQUEST.md:30-40` |

---

## 2. Detailed Edge Cases & Boundary Conditions

| # | Feature / Area | Input / Condition | Expected & Observed Behavior |
|---|----------------|-------------------|------------------------------|
| 1 | Preset Resilience | Short video duration (<4.0s) with `engaging` preset | Zooms require minimum 6s interval and >=0.4s duration; B-roll requires >=2s duration. Stages `applyZooms` and `applyBroll` skip additions cleanly with documented rationale (e.g. *"Preserved original framing; footage duration <4s too short for zooms"*). Job completes successfully. |
| 2 | Preset Resilience | Footage with zero speech segments (`speechSegments === 0`) | `applyMotionGraphics` and `applyZooms` have no spoken emphasis moments to anchor accents. Stages complete with 0 decisions, documenting skip rationale. `validateStageChanges` accepts 0 additions. Overall job completes without failure. |
| 3 | Section Bounds | Instruction: *"Keep first 10 seconds untouched and improve everything after that"* | Operations (`composeCaption`, `addZoom`, `addGraphic`, `addClip`) must have `startTime >= 10.0` or `clip.startTime >= 10.0`. Direct edits to clips spanning 0–10s are forbidden. |
| 4 | Section Bounds | Instruction: *"Between 0:15 and 0:30 add B-roll, leave rest alone"* | Supporting B-roll clips placed only between 15s and 30s. Video before 15s and after 30s remains completely untouched. |
| 5 | Negative Constraints | Instruction: *"Make it engaging but don't touch audio and no SFX"* | Model emits zero `setAudioDucking`, zero `addClip` with `audioRole: 'sfx'`, zero SFX tool requests, and preserves all existing audio/video clip volume and speed. |
| 6 | Negative Constraints | Instruction: *"Add captions and motion graphics, don't cut any footage"* | Model emits zero `rippleCut`, `trimClip`, `splitClip`, or `removeClip` operations. |
| 7 | Conversational Refinement | Previous turn created captions; follow-up instruction: *"Make captions smaller, yellow, and use Poppins font"* | Inspects `project.captions` and `project.clips`; updates existing captions via `composeCaption` or `applyCaptionTemplate`. Emits ZERO `captions` tool requests and ZERO `addClip` operations, preventing duplicate overlapping caption layers. |
| 8 | Conversational Refinement | Follow-up instruction: *"Remove the zoom from the second clip"* | Finds the target clip ID and emits `{ op: "clearZooms", clipId: targetClipId }` instead of replacing the clip or removing footage. |
| 9 | Clarification | Ambiguous / conflicting instruction: *"Make it 10x faster but keep the exact duration the same"* | Model detects contradictory instructions, emits `intent.questions: ["Do you want to speed up video playback (which shortens duration) or change the pacing?"]` and empty decisions. System preserves question in `editingHistory` and chat UI prompts user without failing the job. |
| 10 | Clarification | Vague instruction: *"Do something cool with the video"* | Model emits clarification question regarding preferred style (podcast, documentary, high-energy) and zero decisions. Pipeline completes clarification turn gracefully. |
| 11 | Pacing & Ripple Cuts | User requests: *"Remove awkward silences and long pauses"* | Model analyzes word gaps in `speechContext` (>0.6s), emits exactly ONE `rippleCut` decision containing all intervals as the LAST direct decision. Post-cut times for subsequent tool additions are mapped correctly. |
| 12 | Provider Fallback | Groq API returns HTTP 429 (Rate Limit Exceeded) with `Retry-After: 30` | `editorProvider.ts` catches `GroqEditorError('GROQ_RATE_LIMIT')` with status 429, logs warning, and seamlessly switches to `gemini-3.8-flash` via `geminiService.ts`. User request succeeds without error. |
| 13 | Provider Fallback | Groq API times out (>35s/45s) or returns HTTP 503 / 500 | `editorProvider.ts` catches timeout or 5xx outage, switches to `gemini-3.8-flash`, completes planning, and records usage telemetry under `gemini`. |
| 14 | Provider Fallback | Groq succeeds on attempt 1 | No fallback triggered. `provider: 'groq'`, `model: 'qwen/qwen3.8-27b'`. |
| 15 | Input Validation | Instruction text is empty, whitespace-only, or >2000 characters | Rejected immediately at `createEditingJob` and API route with HTTP 400 (`Describe your edit in 1–2000 characters`). No LLM tokens consumed. |
| 16 | Concurrency Control | User opens project in two browser tabs and triggers AI edit | Web Locks API (`navigator.locks.request('kreovar-ai-edit:' + scope)`) blocks concurrent execution in second tab with message: `"This project already has an AI edit running in another tab."` |
| 17 | Concurrent Manual Edit | User edits timeline manually during an ongoing AI stage | Revision mismatch (`store.getSnapshot().revision !== job.timelineRevision`) detected during stage validation; job marks `requiresNewJob: true` and aborts safely to prevent clobbering manual edits. |
| 18 | Multi-Turn Context | Previous turn had a failed/cancelled job | `plan()` filters `project.editingHistory`, excluding failed/cancelled turns so the LLM is not biased by incomplete or aborted attempts. |
| 19 | Asset Bounds | Video timeline has 0 video assets (audio/text-only project) | `applyRequestedEdits` operates on available text/audio layers without crashing on missing video footage. |
| 20 | Image Generation Gating | User requests AI image generation while `process.env.IMAGE_GENERATION_ENABLED !== "true"` | Model prompt specifies `imageGenerationAvailable = false`. If model still emits `{ type: "image" }`, `editorAi.ts` validator rejects plan before execution with clear explanation. |

---

## 3. Timeline Operation & Tool Mappings

### 3.1 All 28 Native Timeline Operations (`NATIVE_EDIT_OPERATIONS`)
All 28 operations are fully supported in `applyRequestedEdits`:
1. `composeCaption`: Clip ID + presentation styling (`xPercent`, `yPercent`, `fontSize`, `fontWeight`, `textColor`, `emphasisColor`, `emphasisWeight`, `emphasisItalic`, `emphasisScale`, `emphasisFont`, `emphasizedWords`, `highlightingMode`, `build`, `entrance`, `exit`, `transitionDuration`).
2. `setVisualTreatment`: Clip ID + card framing (`width`, `height`, `radius`, `shadow`, `fit`, `background`), timed blur/scale effects, and source-clock media masks (`circle`, `rounded-rect`, `polygon`, `stepped`, `torn-paper`).
3. `addShape`: Shape overlay (`rectangle`, `ellipse`, `triangle`, `arrow`, `line`, `star`) with fill, stroke, outline, glow, and drawn path stroke (`rough-ellipse`, `box`, `underline`, `polyline`).
4. `keyframes`: Transform keyframes on existing clip (`x`, `y`, `scale`, `rotation`, `opacity`, `easing`).
5. `animate`: Preset animation (`slide-up`, `slide-left`, `pop`, `float`, `spin-in`).
6. `addGraphic`: Animated callout / lower-third / stat / label with motion presets.
7. `addOverlay`: Animated small image overlay from project assets.
8. `addZoom`: Subtle zoom keyframe on video clip (scale 1.05–1.18x, duration >=0.4s).
9. `clearZooms`: Removes all zoom keyframes on target clip (used when replacing zooms).
10. `rippleCut`: Synchronized interval removal across all tracks (`ranges: [{start, end}]`). Must be the single last direct decision.
11. `applyTextPlacement`: Applies predefined safe text layout anchors (`top-center`, `bottom-center`, etc.).
12. `appendSequence`: Sequences assets onto timeline.
13. `applyCaptionTemplate`: Restyles in-scope captions with a shared design template (`signature-poppins`, `clean-sub`, `dancing-poppins`, `hormozi-punch`).
14. `setAudioDucking`: Toggles automatic background music ducking under spoken dialogue.
15. `addClip`: Places media asset on track with exact timing, transform, and volume.
16. `removeClip`: Deletes clip from timeline.
17. `moveClip`: Repositions clip to new start time or track.
18. `trimClip`: Adjusts left or right edge of clip.
19. `splitClip`: Splits clip at specified timeline time into two contiguous pieces.
20. `addText`: Adds a 3-second text layer.
21. `addCaption`: Adds a timed caption from speech transcript.
22. `addTransition`: Adds visual transition (`fade`, `dissolve`, `slide`, `zoom`) between adjacent visual clips.
23. `duplicateClip`: Duplicates an existing clip at a new start time.
24. `changeText`: Edits text content or style of an existing text/caption layer.
25. `mergeCaptions`: Combines adjacent captions into a single phrase.
26. `changeTrack`: Modifies track state (`hidden`, `muted`).
27. `setAspectRatio`: Changes project aspect ratio (`16:9`, `9:16`, `1:1`, `4:5`, `4:3`).
28. `changeClipProperty`: Modifies properties (`transform`, `effects`, `volume`, `speed`, `fadeIn`, `fadeOut`, `audioRole`, `ducking`, `surface`).

### 3.2 External Media Tools (7 Tools)
1. `captions`: Transcribes speech from source clip or scope (`scope: 'footage'`).
2. `sfx`: Retrieves sound effect from curated library (`BUILTIN_SFX`).
3. `library`: Places an asset from the project/user media catalog.
4. `broll`: Searches illustrative footage matching speech semantics.
5. `motion`: Searches stock motion graphic templates.
6. `voiceover`: Generates speech audio from text using curated voices.
7. `image`: Generates custom image (enabled strictly when `IMAGE_GENERATION_ENABLED === "true"`).

---

## 4. Prompt Contracts & Schema Specifications

### 4.1 Wire Request Contract (`POST /api/editor/ai-edit`)
```typescript
interface AiEditRequestBody {
  instruction: string;
  pipelineStage?: EditStage;
  editingJobId?: string;
  project: EditorProject; // aiProjectSnapshot
  selectedClipIds: string[];
  conversationHistory?: {
    instructions: string;
    summary: string;
  }[];
  footageFrames?: FootageFrame[];
  fallbackFootageFrames?: FootageFrame[];
  playheadTime?: number;
  completeEdit?: boolean;
}
```

### 4.2 LLM Response JSON Contract
```typescript
interface EditPlanJsonResponse {
  summary: string;
  intent: {
    goal: string;
    preserve: string[];
    questions: string[]; // Non-empty triggers clarification workflow
  };
  editorialAnalysis?: {
    summary: string;
    captionStyle: {
      templateId: string;
      reason: string;
    };
    brollStrategy: string;
  };
  decisions: EditDecision[];
  toolRequests: AiToolRequest[];
  requiredOperations?: EditOperation[];
}
```

### 4.3 Clarification Response Wire Contract
When `intent.questions.length > 0`:
```typescript
{
  summary: "My understanding: ...\nPlease clarify: [Question text]",
  questions: ["Specific question for the user"],
  list: {
    version: 1,
    projectId: "<project-id>",
    baseRevision: 0,
    decisions: []
  },
  toolRequests: [],
  catalog: []
}
```

---

## 5. Model Architecture & Fallback Ladder

```
[User Edit Request]
        │
        ▼
[editorProvider.ts: generateEditPlanJson]
        │
        ▼
   Primary: Groq (qwen/qwen3.8-27b)
   via generateGroqEditorJson
        │
        ├────────────────────────────────────────────────┐
        │ Success                                        │ Failure:
        ▼                                                │ - HTTP 429 (Rate Limit)
[Return Groq Plan]                                       │ - Timeout (>35s/45s)
(provider: 'groq')                                       │ - HTTP 5xx (500, 502, 503, 504)
                                                         │ - GROQ_UNAVAILABLE / NOT_CONFIGURED
                                                         ▼
                                          Fallback: Gemini 3.8 Flash
                                          via geminiService.ts (gemini-3.8-flash)
                                                         │
                                                         ├─────────────────────────┐
                                                         │ Success                 │ Failure
                                                         ▼                         ▼
                                                  [Return Gemini Plan]      [Throw Clean Error]
                                                  (provider: 'gemini',       "AI could not produce
                                                   fallbackReason: reason)    a valid edit...")
```

---

## 6. Implementation Gap Analysis (Current vs Target)

1. **`sequentialEdit.ts`**:
   - Line 55: `createEditingJob` initializes with `stagesFor(preset?.operations || [])`. When `preset` is undefined, `stagesFor([])` yields `['analyzeFootage', 'validateEdit']` omitting `applyRequestedEdits`. Must initialize with `stagesFor(preset?.operations || ['requestedEdits'])`.
   - Line 113: `validateStageChanges` throws `'Requested edits did not change the timeline'` even when `output.questions?.length > 0`. Must accept clarification outputs.
   - Lines 116–121: `validateStageChanges` enforces mandatory additions for supporting preset stages (`applyZooms`, `applyBroll`, `applyMotionGraphics`, `applySoundEffects`). Must incorporate resilience criteria: `projectDuration < 4.0s`, `speechSegments === 0`, or explicit skip summary.
   - Line 140: `validateCompletedJob` throws `'No requested edits were committed'`. Must check for clarification questions (`job.stages.some(s => s.output?.questions?.length > 0)`) and allow legitimate supporting stage skips if at least one stage completed.

2. **`sequentialEditClient.ts`**:
   - Lines 28–30: `persist()` overwrites completed clarification jobs with `'All requested stages completed.'`. Must preserve the actual clarification summary.
   - Line 39: `plan()` does not extract or send `conversationHistory` to `POST /api/editor/ai-edit`. Must extract completed/clarified turns from `project.editingHistory`.
   - Lines 65–67: `analyzeFootage` for custom edits does not run locally; it calls `plan(stage)`. Must run locally and return `operations: ['requestedEdits']`.
   - Lines 75, 79, 83: `planMotionGraphics`, `findBroll`, and `applyBroll` throw errors on 0 decisions. Must tolerate zero-decision completions when project is short or silent.
   - Line 88: `applyRequestedEdits` throws `'AI did not return any actionable requested edits'` on 0 decisions, even if `output.questions?.length > 0`. Must accept clarification.

3. **`editorAi.ts`**:
   - Lines 85–91: In `validate()`, if `context.pipelineStage` is present, `readEditingIntent(value)` is never called, so `intent.questions` is ignored. Must check `intent.questions` and return clarification structure.
   - Prompt input: Add `conversationHistory` to prompt options.

4. **`editorProvider.ts`**:
   - Currently only falls back from Radox to Groq. Does not implement Groq -> Gemini 3.8 Flash fallback. Must catch Groq 429, timeouts, and 5xx errors and route to `gemini-3.8-flash` via `geminiService.ts`.

5. **`AiEditingChat.tsx`**:
   - Line 33: Renders `"Review preview, then export your MP4"` even when job finished with clarification questions. Must display the question prompt.

6. **Automated Test Suite**:
   - `scripts/test-custom-ai-editing.mjs` must be implemented to cover all 6 required test scenarios.
