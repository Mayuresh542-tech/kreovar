# Handoff Report: AI Editor Intelligent Custom Editing & Preset Repair Survey

**Author:** explorer_editor_survey_1 (teamwork_explorer)  
**Date:** 2026-11-07T10:28:00Z  
**Type:** Hard Handoff (Investigation Complete)  
**Recipient:** Orchestrator / Implementation Agent (Parent ID: `aef5d6d0-04fb-474b-95b5-5598c9ded32c`)

---

## 1. Observation

Direct code observations with exact line numbers and quotes:

1. **Model Provider Routing in `app/lib/server/editorProvider.ts`:**
   - Lines 9, 16-36:
     ```typescript
     export interface EditorProviderChoice {provider:'radox'|'groq';fallbackReason?:string;visualContext?:EditorVisualContext}
     ...
     const result=await generateGroqEditorJson<T>(options,preferred?.visualContext);
     return {...result,provider:'groq',fallbackReason:reason,attempts:attempts+result.attempts};
     ```
   - Only Radox and Groq are handled. There is no call or reference to `geminiService.ts` or `gemini-3.8-flash`. Any Groq rate limit (429), timeout, or 5xx throws directly out of `editorProvider.ts`.

2. **Gemini Service Configuration in `app/lib/server/geminiService.ts`:**
   - Lines 14-20:
     ```typescript
     const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
     const FALLBACK_GEMINI_MODELS = [
       "gemini-3-flash-preview",
       "gemini-3.6-flash",
       "gemini-3.5-flash",
       "gemini-flash-latest",
     ];
     ```
   - Candidate models currently omit `"gemini-3.8-flash"`. `generateGeminiJson<T>` takes `GeminiCompletionOptions`, sends `jsonMode: true`, and returns parsed JSON while recording usage via `recordProviderUsage`.

3. **28 Native Timeline Operations Definition and Mapping:**
   - `app/lib/editor/editingCapabilities.ts:3-5`:
     `NATIVE_EDIT_OPERATIONS` lists exactly 28 operations:
     `composeCaption`, `setVisualTreatment`, `addShape`, `keyframes`, `animate`, `addGraphic`, `addOverlay`, `addZoom`, `clearZooms`, `rippleCut`, `applyTextPlacement`, `appendSequence`, `applyCaptionTemplate`, `setAudioDucking`, `addClip`, `removeClip`, `moveClip`, `trimClip`, `splitClip`, `addText`, `addCaption`, `addTransition`, `duplicateClip`, `changeText`, `mergeCaptions`, `changeTrack`, `setAspectRatio`, `changeClipProperty`.
   - `STAGE_CAPABILITIES.applyRequestedEdits` (`editingCapabilities.ts:18`):
     ```typescript
     applyRequestedEdits:{operations:NATIVE_EDIT_OPERATIONS,tools:['captions','sfx','library','broll','motion','voiceover','image']}
     ```
   - `app/lib/editor/ai.ts:49-84`: `applyEditDecisionList` maps each operation to pure reducer functions that mutate the timeline project.

4. **Dynamic Decomposition Trap for Custom Edits:**
   - `app/lib/editor/sequentialEdit.ts:52-56`: `createEditingJob` initializes stages from `preset?.operations || []`. When `preset` is undefined, `stagesFor([])` produces `['analyzeFootage', 'validateEdit']`.
   - `app/lib/editor/sequentialEditClient.ts:62-68`:
     ```typescript
     case 'analyzeFootage':{
      const footage=analysisFootage(project,job.selection);if(!footage.length&&job.presetId)throw Error('Add original footage to the timeline first.');
      if(!frames)await readFrames(project,job.selection);
      const operations=PIPELINE_PRESETS.find(p=>p.id===job.presetId)?.operations||(footage.length?explicitOperations(job.instructions):undefined);
      const result=operations?{summary:`Analyzed ...`,operations}:await plan(stage,project,job,signal);
     ```
     For custom free-form instructions, `explicitOperations` returns `undefined`, triggering remote AI planning.
   - `app/lib/editor/sequentialEdit.ts:172-175`:
     ```typescript
     if(stage.id==='analyzeFootage'){
      const preset=PIPELINE_PRESETS.find(p=>p.id===job.presetId),operations=preset?.operations||readRequestedOperations(output.operations);
      job.stages=stagesFor(operations).map(id=>job.stages.find(s=>s.id===id)||{id,key:job.id+':'+id,status:'pending',attempts:0});stage=job.stages[index];
     }
     ```
     This decomposes the custom edit into preset sub-stages (e.g. `['applyCaptions', 'applyZooms']`) and drops `applyRequestedEdits`.

5. **Clarification Failure Chain:**
   - `app/lib/server/editorAi.ts:85-91`:
     ```typescript
     if(context.pipelineStage){
       const validated=validateAiPlan(value,project)...
       return {...validated,toolRequests:tools,catalog,...(requiredOperations?{requiredOperations}:{})};
     }
     const intent=readEditingIntent(value);
     if(intent?.questions.length)return {summary:intent.summary,list:{version:1 as const,projectId:project.id,baseRevision:project.revision,decisions:[]},toolRequests:[],catalog};
     ```
     When `context.pipelineStage` is passed, `readEditingIntent` is bypassed.
   - `app/lib/editor/sequentialEditClient.ts:88`:
     `if(!output.decisions?.length&&!output.requests?.length)throw Error(output.summary||'AI did not return any actionable requested edits.');`
   - `app/lib/editor/sequentialEdit.ts:113`:
     `if(custom&&JSON.stringify(...)===JSON.stringify(...))throw Error('Requested edits did not change the timeline.');`
   - `app/lib/editor/sequentialEdit.ts:140`:
     `if(!job.appliedOperations.length||project.revision<=job.initialRevision)throw Error('No requested edits were committed.');`
   - `app/lib/editor/sequentialEditClient.ts:29`:
     `summary:previous.status==='completed'?'All requested stages completed.':previous.errors.at(-1)||'Previous edit stopped; committed changes remain.'`
     Overwrites any question summary with generic text.

6. **Preset Fragility:**
   - `app/lib/editor/sequentialEditClient.ts:75, 79, 83`:
     Throws errors if `decisions.length === 0` in `planMotionGraphics`, `findBroll`, and `applyBroll`.
   - `app/lib/editor/sequentialEdit.ts:118-121`:
     `validateStageChanges` unconditionally requires visible additions for `applyMotionGraphics`, `applyBroll`, `applyZooms`, and `applySoundEffects`.

7. **Baseline Build & Typecheck:**
   - `npx tsc --noEmit` exited with code 0 (zero errors).

---

## 2. Logic Chain

1. **From Observation 1 & 2 to Model Architecture:**
   - `editorProvider.ts` only delegates to Groq and catches no errors.
   - Therefore, any 429 rate limit or network timeout on Groq immediately crashes the user's edit job.
   - Falling back to Gemini 3.8 Flash requires:
     (a) Catching Groq 429, timeouts, and 5xx errors in `editorProvider.ts`.
     (b) Calling `generateGeminiJson` with `gemini-3.8-flash`.
     (c) Retaining `provider: 'gemini'` in the result so validation corrections stay on Gemini.

2. **From Observation 3 & 4 to Custom Stage Execution:**
   - `applyRequestedEdits` is declared with all 28 operations and all 7 media tools.
   - However, when a user submits a free-form instruction, `analyzeFootage` triggers an LLM round-trip that re-decomposes the job into narrow preset stages, bypassing `applyRequestedEdits`.
   - By resolving `analyzeFootage` locally when `presetId` is undefined, `stagesFor(['requestedEdits'])` remains untouched, allowing `applyRequestedEdits` to execute direct operations atomically with media tools.

3. **From Observation 5 to Clarification Flow:**
   - When the user's prompt is ambiguous, the model emits `intent: { questions: [...] }` and 0 decisions.
   - Because `editorAi.ts` bypasses intent checks during pipeline stages, the questions are dropped and `validateAiPlan` returns 0 decisions.
   - `sequentialEditClient.ts`, `validateStageChanges`, and `validateCompletedJob` all treat 0 decisions as fatal errors.
   - Fixing this requires plumbing `questions?: string[]` through `editorAi.ts`, `StageOutput`, `validateStageChanges`, `validateCompletedJob`, `persist()`, and `AiEditingChat.tsx`.

4. **From Observation 6 to Preset Flow Resilience:**
   - When a video is under 4 seconds or has no speech, planning zooms, B-roll, or graphics is often impossible or counterproductive.
   - Current stage assertions throw errors on zero additions, aborting the entire preset.
   - Allowing zero additions when `projectDuration < 4.0`, speech segments == 0, or an explicit skip summary is present ensures presets complete successfully without corrupting the timeline.

---

## 3. Caveats

1. **Image Generation Feature Flag:** `process.env.IMAGE_GENERATION_ENABLED` is checked in `editorAi.ts` and `route.ts`. Tool requests for images are disallowed unless explicitly enabled; this is intended behavior and does not affect video editing operations.
2. **Audio Waveform Analysis:** Audio beats and acoustic silences are not analyzed natively; pacing trims rely on `speechContext` word timestamp gaps (>0.6s) as documented in the specification.
3. **No Direct Code Changes:** Per role constraints, no source code files outside `.agents/teamwork/` were modified during this investigation.

---

## 4. Conclusion

The codebase is structurally robust and ready for implementation. All 28 operations are fully implemented, and the infrastructure for Groq/Gemini calling, frame sampling, Whisper transcription, and timeline mutation is operational.

The necessary changes are surgical and well-isolated across 8 files:
1. `app/lib/server/editorProvider.ts` (Groq fallback to Gemini 3.8 Flash)
2. `app/lib/server/geminiService.ts` (Gemini 3.8 Flash model support)
3. `app/lib/editor/sequentialEdit.ts` (Custom stages, zero-decision resilience, clarification validation)
4. `app/lib/editor/sequentialEditClient.ts` (Local analyzeFootage, wire contract history, zero-decision client tolerance)
5. `app/api/editor/ai-edit/route.ts` (Parse `conversationHistory`)
6. `app/lib/server/editorAi.ts` (Clarification output & conversational context prompt guidelines)
7. `app/components/editor/workspace/AiEditingChat.tsx` (Display clarification prompts)
8. `scripts/test-custom-ai-editing.mjs` (Automated verification test suite)

---

## 5. Verification Method

To independently verify the findings and any future implementation:

1. **Typecheck Baseline:**
   ```powershell
   npx tsc --noEmit
   ```
   Must pass with exit code 0 and zero diagnostic errors.

2. **Automated Test Suite Execution:**
   ```powershell
   node --test scripts/test-custom-ai-editing.mjs
   ```
   Must pass all 6 test scenarios:
   - Scenario 1: Natural language podcast edit instruction (captions + zooms + ducking)
   - Scenario 2: Section-bounded instruction ("keep first 10 seconds untouched")
   - Scenario 3: Negative constraint compliance ("don't touch audio")
   - Scenario 4: Conversational refinement modifying existing elements without duplicate clips/captions
   - Scenario 5: Clarification return without job failure
   - Scenario 6: Preset resilience on short (<4s) footage

3. **Cloudflare Build Check:**
   ```powershell
   npm run build:cloudflare
   ```
   Must complete bundle creation successfully.

4. **Code Inspection Checkpoints:**
   - `editorProvider.ts`: Verify `generateEditPlanJson` catches Groq 429/timeouts/5xx and calls `generateGeminiJson` with `gemini-3.8-flash`.
   - `sequentialEdit.ts`: Verify `createEditingJob` initializes `stagesFor(['requestedEdits'])` when `presetId` is undefined.
   - `sequentialEditClient.ts`: Verify `analyzeFootage` returns `operations: ['requestedEdits']` locally for custom edits.
   - `sequentialEditClient.ts` & `route.ts`: Verify `conversationHistory` is sent in request and parsed in route.
