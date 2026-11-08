# Handoff Report: Specification Mining for Intelligent Custom AI Editing & Preset Flow Repair

## 1. Observation

Direct examination of the specification documents and codebase reveals the following concrete code points and contracts:

1. **Preset Stages vs Custom Initial Stages (`app/lib/editor/sequentialEdit.ts:48-56`)**:
   - `stagesFor` correctly handles `requestedEdits` when passed:
     ```typescript
     if(operations.includes('requestedEdits')){
       if(operations.length!==1) throw Error('Custom requestedEdits must run alone, not mixed with preset stages.');
       return ['analyzeFootage','applyRequestedEdits','validateEdit'];
     }
     ```
   - In `createEditingJob` (line 55):
     `stages:stagesFor(preset?.operations||[]).map(...)`
     When `preset` is undefined, `preset?.operations || []` evaluates to `[]`, and `stagesFor([])` yields `['analyzeFootage', 'validateEdit']`, omitting `applyRequestedEdits` upon initialization unless dynamically decomposed.

2. **Stage Validation Rejection on Zero Changes and Clarification (`app/lib/editor/sequentialEdit.ts:110-142`)**:
   - In `validateStageChanges` (line 113):
     ```typescript
     if(custom&&JSON.stringify([before.clips,before.tracks,before.trackOrder,before.settings,before.transitions,before.textLayers,before.captions])===JSON.stringify([after.clips,after.tracks,after.trackOrder,after.settings,after.transitions,after.textLayers,after.captions]))throw Error('Requested edits did not change the timeline.');
     ```
     This triggers unconditionally when zero edits are made, crashing clarification question turns where no timeline changes are supposed to occur.
   - In `validateStageChanges` (lines 118–121):
     ```typescript
     if(stage==='applyMotionGraphics'&&!visible.some(c=>(c.graphic||c.shape)&&c.keyframes?.length))throw Error('No visible animated motion graphic was created.');
     if(stage==='applyBroll'&&!visible.some(c=>c.assetId&&after.assets[c.assetId]&&['image','overlay'].includes(after.tracks[c.trackId].kind)&&c.volume===0))throw Error('No valid muted B-roll was inserted.');
     if(stage==='applyZooms'&&!visible.some(c=>c.zooms?.length&&JSON.stringify(c.zooms)!==JSON.stringify(before.clips[c.id]?.zooms)))throw Error('No zoom keyframes were applied.');
     if(stage==='applySoundEffects'&&!changed.some(c=>c.assetId&&after.assets[c.assetId]?.kind==='audio'&&c.audioRole==='sfx'&&c.volume>0&&c.volume<=.35&&!after.tracks[c.trackId].muted&&!after.tracks[c.trackId].hidden&&c.startTime+c.duration<=projectDuration(before)+.04))throw Error('No audible, synchronized sound effect was inserted.');
     ```
     These lines enforce mandatory additions for supporting stages regardless of footage length or speech segments, crashing `engaging` and `punchy` presets on videos <4.0s or footage without dialogue.
   - In `validateCompletedJob` (line 140):
     ```typescript
     if(!job.appliedOperations.length||project.revision<=job.initialRevision)throw Error('No requested edits were committed.');
     ```
     This crashes jobs that successfully completed clarification turns with zero operations, as well as presets where all supporting stages legitimately skipped.

3. **Client Execution and History Overwrite (`app/lib/editor/sequentialEditClient.ts:28-93`)**:
   - In `persist()` (line 29):
     `summary: previous.status==='completed'?'All requested stages completed.':previous.errors.at(-1)||'Previous edit stopped; committed changes remain.'`
     This overwrites clarification questions with the generic `"All requested stages completed."` string upon archiving to `editingHistory`.
   - In `plan()` (lines 38–41):
     `conversationHistory` is not extracted or transmitted in the `fetch('/api/editor/ai-edit')` POST body.
   - In `executeStage('analyzeFootage')` (lines 65–67):
     ```typescript
     const operations=PIPELINE_PRESETS.find(p=>p.id===job.presetId)?.operations||(footage.length?explicitOperations(job.instructions):undefined);
     const result=operations?{...}:await plan(stage,project,job,signal);
     ```
     Custom instructions call `plan(stage)`, wasting an LLM roundtrip and re-decomposing custom edits into rigid sub-stages instead of running locally and returning `operations: ['requestedEdits']`.
   - In `executeStage('applyRequestedEdits')` (line 88):
     ```typescript
     if(!output.decisions?.length&&!output.requests?.length)throw Error(output.summary||'AI did not return any actionable requested edits.');
     ```
     This throws on clarification outputs with zero decisions.
   - In `planMotionGraphics`, `findBroll`, and `applyBroll` (lines 75, 79, 83):
     Mandatory decision assertions throw when supporting stages return 0 decisions.

4. **Pipeline Stage Validator in `editorAi.ts:85-92`**:
   - When `context.pipelineStage` is defined:
     ```typescript
     if(context.pipelineStage){
       const validated=validateAiPlan(value,project),toolProject=context.pipelineStage==='applyRequestedEdits'?applyEditDecisionList(project,validated.list):project,tools=validateAiTools((value as {toolRequests?:unknown}).toolRequests,toolProject,catalog);
       if(tools.some(r=>r.type==='image')&&process.env.IMAGE_GENERATION_ENABLED!=="true")throw Error('Image generation is unavailable. Do not request images or enable a provider.');
       assertStagePlan(context.pipelineStage,validated.list.decisions,tools,project);
       const requiredOperations=context.pipelineStage==='analyzeFootage'?readRequestedOperations((value as {requiredOperations?:unknown}).requiredOperations):undefined;
       return {...validated,toolRequests:tools,catalog,...(requiredOperations?{requiredOperations}:{})};
     }
     ```
     Notice `readEditingIntent(value)` is bypassed, ignoring `intent.questions` during pipeline stages.

5. **Provider Fallback in `editorProvider.ts:9-36`**:
   - Interface `EditorProviderChoice` only defines:
     `export interface EditorProviderChoice {provider:'radox'|'groq';fallbackReason?:string;visualContext?:EditorVisualContext}`
   - `generateEditPlanJson` calls `generateGroqEditorJson` directly and does NOT catch Groq 429 rate limits, timeouts, or 5xx outages to fall back to `gemini-3.8-flash` via `geminiService.ts`.

6. **Chat UI Question Display in `app/components/editor/workspace/AiEditingChat.tsx:33`**:
   - Hardcoded completion text:
     `{job.status==='completed'&&<p className="vx-ai-complete">Editing completed. {job.appliedOperations.length} stages changed the timeline. Review the preview, then export your MP4.</p>}`
     Displays generic MP4 export text even when the completed job returned clarification questions.

7. **API Route Parameter Binding in `app/api/editor/ai-edit/route.ts:41-64`**:
   - Does not parse or forward `conversationHistory` from `body` into `planAiEdit`.

---

## 2. Logic Chain

1. **Step 1 (Custom Edit Initialization)**: From Observation 1, because `createEditingJob` evaluates `preset?.operations || []`, custom edits (where `preset` is undefined) initialize with `stagesFor([]) = ['analyzeFootage', 'validateEdit']`. Therefore, `applyRequestedEdits` must be explicitly initialized via `stagesFor(preset?.operations || ['requestedEdits'])`.
2. **Step 2 (Local Custom Analysis)**: From Observation 3, when custom edits execute `analyzeFootage`, calling the LLM planner prompts the model to decompose the instruction into preset sub-operations. This triggers lines 172-175 in `sequentialEdit.ts` to replace `applyRequestedEdits` with preset stages. Local analysis returning `operations: ['requestedEdits']` with duration and speech segment count completely prevents this unwanted decomposition and saves an LLM roundtrip.
3. **Step 3 (Conversational History & Multi-Turn Refinements)**: From Observations 3 and 7, follow-up edits like *"make captions smaller and yellow"* require knowing previous turns. `sequentialEditClient.ts` must harvest completed/clarified turns from `project.editingHistory`, send `conversationHistory` over `POST /api/editor/ai-edit`, and include it in `editorAi.ts` prompt inputs.
4. **Step 4 (Clarification Preservation & Zero Crashes)**: From Observations 2, 3, and 4, clarification requests produce `intent.questions.length > 0` and 0 decisions. Currently, four layers crash on this: `editorAi.ts` (ignores intent), `sequentialEditClient.ts` (throws on 0 decisions), `validateStageChanges` (throws on 0 timeline changes), and `validateCompletedJob` (throws on 0 committed edits). Supporting clarification requires:
   - Returning `{ summary: intent.summary, questions: intent.questions, list: { decisions: [] }, toolRequests: [] }` from `editorAi.ts`.
   - Accepting 0 decisions when `output.questions?.length > 0` in `sequentialEditClient.ts`.
   - Allowing 0 changes in `validateStageChanges` and `validateCompletedJob` when questions are present.
   - Preserving the question text in `persist()` and showing it in `AiEditingChat.tsx`.
5. **Step 5 (Preset Resilience on Short & Silent Footage)**: From Observations 2 and 3, `engaging` and `punchy` presets fail on footage <4.0s or 0 speech segments because `validateStageChanges` demands mandatory zooms, motion graphics, and B-roll. By introducing resilience rules (duration < 4.0s, speech segments === 0, or documented skip summary in stage output), supporting stages can complete with 0 decisions without failing the overall job.
6. **Step 6 (Model Fallback Ladder)**: From Observation 5, Groq Qwen 3.7 27B is prone to HTTP 429 rate limits or transient outages. Wrapping `generateGroqEditorJson` with fallback handling for 429, timeouts, and 5xx errors to call `gemini-3.8-flash` via `geminiService.ts` ensures uninterrupted editing availability while maintaining JSON schema fidelity and logging telemetry.

---

## 3. Caveats

1. **Test Fixtures Execution**: `scripts/test-custom-ai-editing.mjs` is specified in R1–R4 and Section 5 of the design spec but does not yet exist in the repository; the implementation team must author this test script with synthetic mock project fixtures and speech transcripts.
2. **Remotion Engine & UI Styles**: The UI layout in `AiEditingChat.tsx` and the underlying Remotion rendering engine are explicit non-goals and must not be altered.
3. **Image Generation Gate**: External tool `image` remains gated behind `process.env.IMAGE_GENERATION_ENABLED === "true"`.

---

## 4. Conclusion

The specification and architecture for the **Intelligent Custom AI Editing System and Preset Flow Repair** are completely discovered and mapped out:
- **Routing**: Custom edits route through `analyzeFootage` (local) -> `applyRequestedEdits` (atomic plan with all 28 operations and 7 tools) -> `validateEdit`.
- **Wire & History**: `conversationHistory` flows across the wire from `project.editingHistory` to `/api/editor/ai-edit` and into `editorAi.ts`.
- **Clarification**: Ambiguous instructions emit `questions`, which pass cleanly through pipeline execution, stage validation, completed job validation, and chat presentation without pipeline failure.
- **Preset Resilience**: Supporting stages (`applyZooms`, `applyBroll`, `applyMotionGraphics`, `applySoundEffects`) tolerate zero additions on footage <4s, silent dialogue, or explicit skip rationale.
- **Provider Fallback**: Groq Qwen 3.7 27B functions as the primary provider with automatic failover to Gemini 3.8 Flash on 429 rate limits, timeouts, and 5xx errors.

---

## 5. Verification Method

To verify the mined specification and subsequent implementation:
1. **Automated Test Suite**:
   Execute the test script:
   ```bash
   node scripts/test-custom-ai-editing.mjs
   ```
   Must pass all 6 core test scenarios:
   - Natural language podcast edit instruction (captions + zooms + ducking)
   - Section-bounded instruction ("keep first 10 seconds untouched")
   - Negative constraint compliance ("don't touch audio")
   - Conversational refinement modifying existing elements without duplicate clips/captions
   - Clarification return without job failure
   - Preset resilience on short (<4s) footage
2. **Sequential Edit Test Suite**:
   ```bash
   node --test scripts/test-sequential-edit.mjs
   ```
3. **Typecheck**:
   ```bash
   npx tsc --noEmit
   ```
   Must pass with zero TypeScript type errors.
4. **Cloudflare Build**:
   ```bash
   npm run build:cloudflare
   ```
   Must compile and bundle successfully.
