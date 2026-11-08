# Technical Analysis: Kreovar AI Editor Intelligent Custom Editing System & Preset Repair

**Date:** 2026-11-07  
**Explorer:** explorer_editor_survey_1 (teamwork_explorer)  
**Scope:** AI Editor Pipeline, Model Providers, Timeline Operations, Preset Resilience, and Context Preservation

---

## 1. Executive Summary

Kreovar's AI video editor provides both preset-driven editing (`engaging`, `clean`, `punchy`) and conversational natural language editing. The timeline engine implements a rich set of **28 native timeline operations** and multiple external media tools (`captions`, `sfx`, `broll`, `motion`, `voiceover`, `library`, `image`).

Our deep-dive investigation into the codebase revealed critical friction points and architectural gaps preventing natural language custom editing and causing preset failures:
1. **Dynamic Stage Decomposition Trap:** When a user enters a free-form custom prompt without a preset ID, `sequentialEditClient.ts` currently sends `analyzeFootage` to the remote AI planner. The planner returns a subset of preset operations (e.g. `['captions', 'zooms']`), which triggers `sequentialEdit.ts` to dynamically replace the job stages with preset sub-stages—completely dropping `applyRequestedEdits`.
2. **Provider Fallback Absence:** `editorProvider.ts` only invokes Groq with Qwen 3.7 27B (`qwen/qwen3.8-27b`) or legacy Radox. There is no fallback to Gemini 3.8 Flash (`gemini-3.8-flash`) via `geminiService.ts` when Groq experiences HTTP 429 rate limits, network timeouts, or 5xx server errors.
3. **Clarification Pipeline Cascading Failure:** When ambiguous instructions generate clarification questions, `editorAi.ts` bypasses `readEditingIntent` because `pipelineStage` is set. Furthermore, `sequentialEditClient.ts` rejects 0 decisions with an error, `validateStageChanges` throws because the timeline is unchanged, `validateCompletedJob` throws because `appliedOperations` is empty, and `persist()` overwrites the history summary with `"All requested stages completed."`.
4. **Preset Fragility on Short/Speechless Footage:** Supporting preset stages (`applyZooms`, `applyBroll`, `applyMotionGraphics`, `applySoundEffects`) enforce strict nonzero addition rules, failing the entire job on video clips under 4 seconds or footage lacking speech.
5. **Missing Wire Contract for Conversational Context:** Neither `sequentialEditClient.ts` nor `route.ts` transmits `conversationHistory` to `planAiEdit`, leaving the AI planner blind to previous conversational turns and leading to duplicate caption/clip generation.

---

## 2. End-to-End Pipeline Architecture

The AI editing subsystem operates as a synchronized pipeline spanning browser client, Next.js server route, and remote LLM providers:

```
[Browser: AiEditingChat.tsx]
      │ User enters custom prompt / selects preset
      ▼
[Browser: sequentialEditClient.ts -> runSequentialEdit()]
      │ Reads frames via captureFootageEvidence()
      │ Persists state via EditorStore / saveCheckpoint()
      │ Calls POST /api/editor/ai-edit (HTTP stream / JSON)
      ▼
[Server Route: app/api/editor/ai-edit/route.ts]
      │ Authenticates user via Supabase admin auth
      │ Validates project snapshot & token budget
      │ Enforces rate limits (6 req / min)
      ▼
[Server Planner: app/lib/server/editorAi.ts -> planAiEdit()]
      │ Gathers speechContext, footage observations, catalog
      │ Compacts prompt via compactEditorFallback()
      ▼
[Provider Router: app/lib/server/editorProvider.ts -> generateEditPlanJson()]
      │ Primary: groqEditorFallback.ts (qwen/qwen3.8-27b)
      │ [GAP] Fallback: geminiService.ts (gemini-3.8-flash)
      ▼
[Server Validation: editorAi.ts -> validateAiPlan() / assertStagePlan()]
      │ Validates decision schemas and dry-runs on timeline
      ▼
[Client State Machine: sequentialEdit.ts -> runEditingJob()]
      │ Executes stages: buildStageProject() -> applyEditDecisionList()
      │ Validates changes: validateStageChanges()
      │ Validates completed job: validateCompletedJob()
```

---

## 3. Investigation Target 1: Model Provider Architecture

### 3.1 `app/lib/server/editorProvider.ts`
- **Location:** `app/lib/server/editorProvider.ts:1-42`
- **Current Flow:**
  - Lines 16-36 define `generateEditPlanJson<T>(options: EditorFallbackOptions, preferred?: EditorProviderChoice): Promise<EditorProviderResult<T>>`.
  - Checks if `process.env.EDITOR_AI_PRIMARY_PROVIDER === 'radox'`. If not opted into Radox, directly delegates to `generateGroqEditorJson<T>(options, preferred?.visualContext)`.
  - Groq errors (`GroqEditorError`) are caught nowhere in `editorProvider.ts`. They bubble directly out to `route.ts`, resulting in immediate 502/504 HTTP responses to the user.
- **Provider Choice Interface:**
  - Line 9 defines:
    ```typescript
    export interface EditorProviderChoice {
      provider: 'radox' | 'groq';
      fallbackReason?: string;
      visualContext?: EditorVisualContext;
    }
    ```
  - Does NOT include `'gemini'`.
- **Required Fallback Routing (R3):**
  - Primary provider: Groq with Qwen 3.7 27B (`qwen/qwen3.8-27b`).
  - Fallback provider: Gemini 3.8 Flash (`gemini-3.8-flash`) via `geminiService.ts`.
  - Trigger conditions for Gemini fallback:
    1. Groq rate limit: `error instanceof GroqEditorError && (error.code === 'GROQ_RATE_LIMIT' || error.status === 429)`.
    2. Groq timeouts: `error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')` (when `options.signal` is not user-aborted).
    3. Groq service outages / 5xx: `error instanceof GroqEditorError && (error.status >= 500 || error.code === 'GROQ_UNAVAILABLE')`.
    4. Preferred provider sticky routing: if `preferred?.provider === 'gemini'`, route validation correction attempts directly to Gemini without hitting Groq again.

### 3.2 `app/lib/server/geminiService.ts`
- **Location:** `app/lib/server/geminiService.ts:1-231`
- **Current Capabilities:**
  - Line 14-20:
    ```typescript
    const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
    const FALLBACK_GEMINI_MODELS = [
      "gemini-3-flash-preview",
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-flash-latest",
    ];
    ```
  - `generateGeminiContent(options: GeminiCompletionOptions)`: Native HTTP client to `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`.
  - `generateGeminiJson<T>(options)`: Calls `generateGeminiContent` with `jsonMode: true`, cleans markdown formatting (`cleanJsonText`), and parses JSON.
  - Usage tracking: Calls `recordProviderUsage` with `providerKey: 'gemini'`, `units: totalTokens`, `unitType: 'tokens'`, `status: 'success'`.
- **Target Changes:**
  - Add `"gemini-3.8-flash"` as the primary model or support explicit model override in `GeminiCompletionOptions` (`model?: string`).
  - Wire `generateGeminiJson` into `editorProvider.ts` when Groq encounters rate limit, timeout, or 5xx.

---

## 4. Investigation Target 2: Native Timeline Operations (28 Operations)

### 4.1 Specification and Definitions
All 28 operations are declared in `app/lib/editor/editingCapabilities.ts:3-5`:
```typescript
export const NATIVE_EDIT_OPERATIONS = [
  'composeCaption', 'setVisualTreatment', 'addShape', 'keyframes', 'animate',
  'addGraphic', 'addOverlay', 'addZoom', 'clearZooms', 'rippleCut',
  'applyTextPlacement', 'appendSequence', 'applyCaptionTemplate', 'setAudioDucking',
  'addClip', 'removeClip', 'moveClip', 'trimClip', 'splitClip', 'addText',
  'addCaption', 'addTransition', 'duplicateClip', 'changeText', 'mergeCaptions',
  'changeTrack', 'setAspectRatio', 'changeClipProperty'
] as const satisfies readonly EditDecision['op'][];
```

### 4.2 Implementation & Project Mutation Mapping
In `app/lib/editor/ai.ts:49-87`, `applyEditDecisionList(p: EditorProject, list: EditDecisionList)` applies decisions through pure document transformations:

| Operation | Module Location | Timeline & Document Mutation |
|---|---|---|
| `composeCaption` | `captionComposition.ts` | Updates caption styling, word-level font weight, color, highlighting mode (`cumulative`, `keyword`), and entrance/exit animations. |
| `setVisualTreatment` | `visualTreatment.ts` | Adds card styling, blur ramps, aperture masks (`circle`, `rounded-rect`, `polygon`, `stepped`, `torn-paper`). |
| `addShape` | `shapes.ts` | Creates vector overlay clips (rectangles, ellipses, arrows, rough hand-drawn strokes) on overlay tracks. |
| `keyframes` | `keyframes.ts` | Applies explicit transform keyframe lists (`sourceTime`, `x`, `y`, `scale`, `rotation`, `opacity`) to a visual clip. |
| `animate` | `keyframes.ts` | Applies a canned motion preset (`slide-up`, `slide-left`, `pop`, `float`, `spin-in`). |
| `addGraphic` | `motionGraphics.ts` | Generates lower-thirds, callouts, and stats with built-in styling and motion presets. |
| `addOverlay` | `motionGraphics.ts` | Inserts owned image asset as an animated overlay on image/overlay tracks. |
| `addZoom` | `zoom.ts` | Appends zoom keyframes (`fromScale`, `toScale`, `focusX`, `focusY`, `easing`, `returnToStart`) to a visual clip. |
| `clearZooms` | `zoom.ts` | Removes all zoom keyframes from a designated clip. |
| `rippleCut` | `rippleCut.ts` | Deletes timeline intervals across all tracks synchronously, shifting downstream clips and preserving track alignment. |
| `applyTextPlacement` | `textPlacement.ts` | Repositions text or caption clips to preset frame zones (`caption-safe`, `title-center`, etc.). |
| `appendSequence` | `sequence.ts` | Sequentially places a list of asset IDs back-to-back on a target track. |
| `applyCaptionTemplate` | `captionTemplates.ts` & `captionAnchors.ts` | Restyles existing captions using a predefined template while preserving physical visual anchors. |
| `setAudioDucking` | `ai.ts:67` | Sets `project.settings.audioDucking = boolean`. |
| `addClip` | `operations.ts:22-30` | Inserts media asset into a track with source start/end, speed, volume, and transform. |
| `removeClip` | `operations.ts:32-36` | Deletes clip, associated caption/text layer, and cleans up attached transitions. |
| `moveClip` | `operations.ts:37-44` | Repositions clip to a new start time and optionally a new track. |
| `trimClip` | `operations.ts:45-55` | Adjusts `startTime`/`duration` and `sourceStart`/`sourceEnd` from left or right edge. |
| `splitClip` | `operations.ts:56-63` | Splits clip at playhead time into two adjacent clips with independent content IDs. |
| `duplicateClip` | `operations.ts:64-67` | Clones a clip and its underlying text/caption layer at a target time. |
| `changeClipProperty` | `operations.ts:68-78` | Mutates clip transform, effects (brightness, contrast, saturation, blur), volume, speed, audioRole (`speech`, `background`, `sfx`), ducking, or procedural surface (`paper`, `grain`, etc.). |
| `addText` | `operations.ts:79-85` | Creates a new text layer clip with custom typography. |
| `addCaption` | `captionTemplates.ts:addTemplatedCaption` | Adds caption layer with word-level timing and template styling. |
| `changeText` | `operations.ts:93-101` | Updates text content, font family, accent, gradient, and line width without re-transcribing. |
| `mergeCaptions` | `operations.ts:102-109` | Combines multiple consecutive caption clips into one unified caption. |
| `addTransition` | `operations.ts:110-115` | Creates video transition (`fade`, `dissolve`, `slide`, `zoom`) between adjacent visual clips. |
| `changeTrack` | `operations.ts:120-122` | Sets track `hidden` or `muted` state. |
| `setAspectRatio` | `ai.ts:80` | Updates `project.settings.aspectRatio` (`16:9`, `9:16`, `1:1`, `4:5`, `4:3`). |

---

## 5. Investigation Target 3: Custom Editing Flow & `applyRequestedEdits`

### 5.1 The Dynamic Decomposition Trap
When a user submits a natural language instruction without choosing a preset:
1. `createEditingJob` in `sequentialEdit.ts:52-56`:
   - `preset` is `undefined`.
   - `preset?.operations` is `undefined`, so `stagesFor([])` returns `['analyzeFootage', 'validateEdit']`.
2. `sequentialEditClient.ts:62-68`:
   - For `analyzeFootage`, `job.presetId` is `undefined`.
   - `explicitOperations(job.instructions)` checks for hardcoded keyword patterns (e.g. `captions`, `zooms`). For free-form instructions like *"make this look like a podcast edit"*, it returns `undefined`.
   - It falls back to `await plan('analyzeFootage', project, job, signal)`.
   - The remote AI returns `requiredOperations: ['captions', 'zooms']`.
3. In `sequentialEdit.ts:172-175`:
   ```typescript
   if (stage.id === 'analyzeFootage') {
     const preset = PIPELINE_PRESETS.find(p => p.id === job.presetId),
           operations = preset?.operations || readRequestedOperations(output.operations);
     job.stages = stagesFor(operations).map(id => ...);
   }
   ```
   - The job is dynamically decomposed into `['applyCaptions', 'applyZooms', 'validateEdit']`!
   - `applyRequestedEdits` is completely bypassed.

### 5.2 The Spec-Approved Solution
- In `sequentialEdit.ts:48-51`:
  - When `presetId` is undefined, `createEditingJob` initializes stages with `stagesFor(['requestedEdits'])`, which produces:
    `['analyzeFootage', 'applyRequestedEdits', 'validateEdit']`.
- In `sequentialEditClient.ts:62-68`:
  - When `job.presetId` is undefined, `analyzeFootage` executes **locally**:
    - Gathers footage count, timeline duration, sampled frame count, and speech segment count.
    - Sets `operations: ['requestedEdits']` without making an external LLM request.
  - In `sequentialEdit.ts:172-175`, `operations` is `['requestedEdits']`, so `stagesFor(['requestedEdits'])` keeps `applyRequestedEdits` intact.

### 5.3 Atomic Execution in `applyRequestedEdits`
In `sequentialEditClient.ts:86-93`:
1. Server returns `output.decisions` (direct native operations) and `output.requests` (tool requests).
2. Sets `output.sourceDecisionCount = output.decisions?.length || 0`.
3. `prepare(output, toolProject, checkpoint, signal)` resolves tool requests (generates captions via Whisper, downloads stock B-roll/SFX, links assets).
4. `buildStageProject(project, output)` executes direct decisions first, then prepared tool decisions, resulting in one atomic revision bump.

---

## 6. Investigation Target 4: Speech Context, Transcript Timestamps & Frame Sampling

### 6.1 Speech Transcript Context
- **Location:** `app/lib/editor/speechContext.ts:1-10`
- Extracts all active captions sorted by `startTime`.
- For each caption, maps word timing tuples:
  `word.start = Math.max(c.startTime, c.startTime + (w.start - c.sourceStart) / c.speed)`
  `word.end = Math.min(c.startTime + c.duration, c.startTime + (w.end - c.sourceStart) / c.speed)`
- In `editorAi.ts:70`, passed to LLM as:
  `speechContext: [{ clipId, start, end, text, words: [[word, start, end], ...] }]`.
- Enables precise pacing analysis (e.g. detecting pauses >0.6s for `rippleCut`) and topic transition timestamps for subtle zooms and A-roll cuts.

### 6.2 Footage Frame Sampling
- **Client Side (`footageFramesClient.ts` & `footageSampling.ts`):**
  - `captureFootageEvidence` captures video frames via hidden `<video>` and `<canvas>` elements at key timestamps.
  - Frames are scaled down to <=480px, encoded to JPEG base64 (<48KB).
  - `selectFallbackFootage` uses 24x14 pixel downsampling and color difference analysis across 6 time strata to select the 6 most informative frames.
- **Server Side (`groqEditorFallback.ts:26-62`):**
  - Frames are formatted into contact sheets or individual panels.
  - Groq vision model `qwen/qwen3.8-27b` produces structured `VisualObservation` objects: `description`, `confidence`, `subjectRegion`, `clearRegions`, `occupiedRegions`.
  - Cached in `editorVisionCache` (scoped to user ID, project ID, and image digest).
  - Injected into prompt as `COMPOSITION_EVIDENCE` and `VISUAL_OBSERVATIONS`.

---

## 7. Investigation Target 5: Clarification Detection & Job History Preservation

### 7.1 Identified Failure Chain for Clarifications

```
User submits ambiguous instruction: "make captions look better"
               │
               ▼
[sequentialEditClient.ts: plan()]
  ❌ GAPS: Does NOT pass `conversationHistory` in request body.
               │
               ▼
[POST /api/editor/ai-edit/route.ts]
  ❌ GAPS: Does NOT extract `conversationHistory` from request body.
               │
               ▼
[editorAi.ts: planAiEdit()]
  ❌ GAPS: Line 85 checks `if (context.pipelineStage)` and returns early,
     completely bypassing `readEditingIntent()` on line 91!
     Does NOT return `questions` property on output.
               │
               ▼
[sequentialEditClient.ts: executeStage('applyRequestedEdits')]
  ❌ GAPS: Line 88 throws:
     `if (!output.decisions?.length && !output.requests?.length) throw Error(...)`
               │
               ▼
[sequentialEdit.ts: validateStageChanges()]
  ❌ GAPS: Line 113 throws:
     `if (custom && before === after) throw Error('Requested edits did not change the timeline.')`
               │
               ▼
[sequentialEdit.ts: validateCompletedJob()]
  ❌ GAPS: Line 140 throws:
     `if (!job.appliedOperations.length || project.revision <= job.initialRevision)
         throw Error('No requested edits were committed.')`
               │
               ▼
[sequentialEditClient.ts: persist()]
  ❌ GAPS: Line 29 overwrites history with:
     `summary: previous.status === 'completed' ? 'All requested stages completed.' : ...`
               │
               ▼
[AiEditingChat.tsx]
  ❌ GAPS: Line 33 unconditionally displays:
     `Editing completed. ... Review the preview, then export your MP4.`
```

### 7.2 Required Fixes Across the Chain
1. **Wire Contract (`route.ts` & `sequentialEditClient.ts`):**
   - Client extracts `{ instructions, summary }` from completed/clarified turns in `project.editingHistory`.
   - Sends top-level `conversationHistory` to `/api/editor/ai-edit`.
   - Route parses and passes `conversationHistory` to `planAiEdit`.
2. **Planner Clarification Return (`editorAi.ts`):**
   - Check `readEditingIntent(value)` even when `context.pipelineStage` is set.
   - If `intent?.questions.length > 0` and decisions are empty:
     Return `{ summary: intent.summary, questions: intent.questions, list: { version: 1, projectId: project.id, baseRevision: project.revision, decisions: [] }, toolRequests: [], catalog }`.
3. **Stage Output Definition (`sequentialEdit.ts`):**
   - Add `questions?: string[]` to `StageOutput`.
4. **Stage Client Toleration (`sequentialEditClient.ts`):**
   - In `applyRequestedEdits`: if `output.questions?.length > 0`, accept 0 decisions/requests without throwing.
5. **Validation Toleration (`sequentialEdit.ts`):**
   - In `validateStageChanges`: allow 0 timeline changes if `output.questions?.length > 0`.
   - In `validateCompletedJob`: if `job.stages.some(s => s.output?.questions?.length > 0)`, accept completion without requiring revision increment or applied operations.
6. **History Preservation (`sequentialEditClient.ts` `persist()`):**
   - Check if previous job had clarification questions; preserve `clarification.summary` in `editingHistory` instead of generic `"All requested stages completed."`.
7. **Chat UI Notification (`AiEditingChat.tsx`):**
   - Display the clarification question prompt when questions exist.

---

## 8. Investigation Target 6: Preset Flow Repair & Resilience (R2)

### 8.1 Preset Definitions & Current Stages
`PIPELINE_PRESETS` in `sequentialEdit.ts:21-25`:
- `engaging`: `['captions', 'motionGraphics', 'broll', 'zooms']`
- `clean`: `['captions']`
- `punchy`: `['captions', 'motionGraphics', 'zooms', 'soundEffects']`

### 8.2 Failure Conditions on Short (<4s) or Speech-Free Footage
- `planMotionGraphics`: Throws `'AI did not plan any requested motion graphics.'` if `decisions.length === 0`.
- `applyMotionGraphics`: Throws `'Motion graphics plan is missing.'` if `planMotionGraphics` output had 0 decisions.
- `findBroll`: Throws `'No relevant B-roll candidates were found.'` if 0 decisions and 0 requests.
- `applyBroll`: Throws `'No selected B-roll is available.'`.
- `validateStageChanges`:
  - `applyMotionGraphics`: Throws `'No visible animated motion graphic was created.'`.
  - `applyBroll`: Throws `'No valid muted B-roll was inserted.'`.
  - `applyZooms`: Throws `'No zoom keyframes were applied.'`.
  - `applySoundEffects`: Throws `'No audible, synchronized sound effect was inserted.'`.
- `validateCompletedJob`: Throws `'No requested edits were committed.'` if all stages skipped.

### 8.3 Zero-Decision Tolerance Rule Matrix
Supporting stages (`applyZooms`, `applyBroll`, `applyMotionGraphics`, `applySoundEffects`) must be permitted to complete with 0 additions when ANY of the following hold:
1. `projectDuration(project) < 4.0` seconds (insufficient duration for inserts/zooms).
2. `speechContext(project).length === 0` (no speech segments for emphasis moments).
3. The stage output summary documents an explicit skip rationale (e.g. contains words like *"preserved original framing"*, *"no suitable emphasis"*, *"skip"*).
When these conditions are met:
- `sequentialEditClient.ts` does not throw an error on empty output.
- `validateStageChanges` accepts 0 changes.
- `validateCompletedJob` succeeds as long as at least one meaningful stage (such as `applyCaptions` or `analyzeFootage`) succeeded.

---

## 9. Implementation File Matrix

The table below catalogs every file requiring modification, the exact locations, and the required changes:

| File | Lines | Purpose & Required Modification |
|---|---|---|
| `app/lib/server/editorProvider.ts` | 9, 16-36 | Add `'gemini'` to `EditorProviderChoice['provider']`. Implement `try/catch` around `generateGroqEditorJson`: on 429 (`GROQ_RATE_LIMIT`), timeouts, or 5xx (`GROQ_UNAVAILABLE`), fall back to `generateGeminiJson` from `geminiService.ts`. Retain `provider: 'gemini'` sticky choice for correction retries. |
| `app/lib/server/geminiService.ts` | 14-20, 61-209 | Add `"gemini-3.8-flash"` to `candidateModels` as preferred model for AI editor fallback. Support optional `model` override in `GeminiCompletionOptions`. |
| `app/lib/editor/sequentialEdit.ts` | 26-38 | Add `questions?: string[]` to `StageOutput` interface. |
| `app/lib/editor/sequentialEdit.ts` | 48-51, 52-56 | In `createEditingJob`, when `preset` is undefined, initialize stages with `stagesFor(['requestedEdits'])`. |
| `app/lib/editor/sequentialEdit.ts` | 110-128 | In `validateStageChanges`: (1) For `applyRequestedEdits`, allow 0 changes if `output.questions?.length > 0`. (2) For `applyZooms`, `applyBroll`, `applyMotionGraphics`, `applySoundEffects`, allow 0 changes if `projectDuration < 4.0`, speech segments == 0, or explicit skip rationale. |
| `app/lib/editor/sequentialEdit.ts` | 129-142 | In `validateCompletedJob`: (1) Do not throw `'No requested edits were committed.'` if `job.stages.some(s => s.output?.questions?.length > 0)`. (2) Allow job completion if supporting stages skipped under resilience criteria. |
| `app/lib/editor/sequentialEditClient.ts` | 28-30 | In `persist()`: Preserve clarification summary in `editingHistory` when previous job completed with clarification questions. |
| `app/lib/editor/sequentialEditClient.ts` | 35-45 | In `plan()`: Extract completed/clarified turns from `project.editingHistory` and send as `conversationHistory` in request body. |
| `app/lib/editor/sequentialEditClient.ts` | 62-68 | In `analyzeFootage`: If `job.presetId` is undefined, execute locally and return `operations: ['requestedEdits']` without calling remote LLM. |
| `app/lib/editor/sequentialEditClient.ts` | 75-98 | In supporting stages (`planMotionGraphics`, `applyMotionGraphics`, `findBroll`, `applyBroll`, `applyZooms`, `applySoundEffects`, `applyRequestedEdits`): Tolerate 0 decisions when resilience criteria or clarification questions apply. |
| `app/api/editor/ai-edit/route.ts` | 41-53, 63 | Parse top-level `conversationHistory` from request body and pass to `planAiEdit`. |
| `app/lib/server/editorAi.ts` | 23-30, 70 | Accept `conversationHistory` in `context`, include in prompt data. Update system prompt with refinement, temporal, and negative constraint guidelines. |
| `app/lib/server/editorAi.ts` | 84-97 | In `validate()`: Check `readEditingIntent(value)`. If questions exist, return `{ summary, questions, list: { decisions: [] }, toolRequests: [] }` even when `pipelineStage` is present. |
| `app/components/editor/workspace/AiEditingChat.tsx` | 33 | When completed job has clarification questions, display AI's question prompt rather than generic export message. |
| `scripts/test-custom-ai-editing.mjs` | New | Create comprehensive automated test suite verifying all 6 acceptance scenarios. |

---

## 10. Conclusion

The existing Kreovar codebase already possesses the full foundation: 28 native operations, audio and visual analysis mechanisms, Whisper transcription integration, frame sampling, and transport layers. The implementation plan addresses the exact glue gaps:
1. Routing custom edits through `applyRequestedEdits` without dynamic preset decomposition.
2. Hooking Gemini 3.8 Flash as an automatic fallback when Groq hits rate limits or errors.
3. Enabling clarification question flows from server planner down to the UI without premature assertion failures.
4. Softening supporting preset stage assertions on short or speechless videos.
5. Preserving conversational editing history so refinements update existing clips/captions rather than duplicating them.
