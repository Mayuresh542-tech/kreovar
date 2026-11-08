# Handoff Report: Preset Pipelines Survey & Test Infrastructure

**Agent:** explorer_presets_survey_1  
**Working Directory:** `c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\explorer_presets_survey_1\`  
**Date:** 2026-11-07  
**Type:** Hard Handoff (Investigation Complete)

---

## 1. Observation

### 1.1 Preset Definitions & Stage Routing
- **File:** `app/lib/editor/sequentialEdit.ts:21-25`
  `PIPELINE_PRESETS` is defined with three presets:
  ```typescript
  export const PIPELINE_PRESETS: PipelinePreset[] = [
    { id: 'engaging', name: 'Engaging talking head', instruction: 'Add animated captions, motion graphics, relevant B-roll and subtle zoom effects.', operations: ['captions', 'motionGraphics', 'broll', 'zooms'], captionTemplate: 'signature-poppins' },
    { id: 'clean', name: 'Clean captions', instruction: 'Add readable animated captions. Preserve the original footage, dialogue and framing.', operations: ['captions'], captionTemplate: 'clean-sub' },
    { id: 'punchy', name: 'Caption emphasis', instruction: 'Add animated captions, sparse motion graphic callouts, subtle zooms and restrained sound effects.', operations: ['captions', 'motionGraphics', 'zooms', 'soundEffects'], captionTemplate: 'signature-poppins' }
  ];
  ```
- **File:** `app/lib/editor/sequentialEdit.ts:48-51`
  `stagesFor(operations)` maps preset operations to stage sequences:
  - `clean`: `['analyzeFootage', 'applyCaptions', 'validateEdit']`
  - `engaging`: `['analyzeFootage', 'applyCaptions', 'planMotionGraphics', 'applyMotionGraphics', 'findBroll', 'applyBroll', 'applyZooms', 'validateEdit']`
  - `punchy`: `['analyzeFootage', 'applyCaptions', 'planMotionGraphics', 'applyMotionGraphics', 'applyZooms', 'applySoundEffects', 'validateEdit']`
- **File:** `app/components/editor/workspace/AiEditingChat.tsx:21, 40`
  Buttons map preset click to `preset.id` and `preset.instruction`, passed to `createEditingJob`.

### 1.2 Zero-Decision and Edge-Case Failure Points
- **File:** `app/lib/editor/sequentialEditClient.ts:75`
  `case 'planMotionGraphics': { const output = saved || await plan(stage, project, job, signal); if (!output.decisions?.length) throw Error('AI did not plan any requested motion graphics.'); return output; }`
- **File:** `app/lib/editor/sequentialEditClient.ts:76`
  `case 'applyMotionGraphics': { const output = job.stages.find(s => s.id === 'planMotionGraphics')?.output; if (!output?.decisions?.length) throw Error('Motion graphics plan is missing.'); return { ...output, summary: 'Apply planned motion graphics' }; }`
- **File:** `app/lib/editor/sequentialEditClient.ts:79`
  `case 'findBroll': { ... if (!output.decisions?.length && !output.requests?.length) throw Error('No relevant B-roll candidates were found.'); return prepare(output, project, checkpoint, signal); }`
- **File:** `app/lib/editor/sequentialEditClient.ts:83`
  `case 'applyBroll': { const output = job.stages.find(s => s.id === 'findBroll')?.output; if (!output?.decisions?.length) throw Error('No selected B-roll is available.'); ... }`
- **File:** `app/lib/editor/sequentialEditClient.ts:88`
  `case 'applyRequestedEdits': { ... if (!output.decisions?.length && !output.requests?.length) throw Error(output.summary || 'AI did not return any actionable requested edits.'); ... }`
- **File:** `app/lib/editor/sequentialEdit.ts:113`
  `if (custom && JSON.stringify([before.clips, before.tracks, before.trackOrder, before.settings, before.transitions, before.textLayers, before.captions]) === JSON.stringify([after.clips, after.tracks, after.trackOrder, after.settings, after.transitions, after.textLayers, after.captions])) throw Error('Requested edits did not change the timeline.');`
- **File:** `app/lib/editor/sequentialEdit.ts:118-121`
  - Line 118: `if (stage === 'applyMotionGraphics' && !visible.some(c => (c.graphic || c.shape) && c.keyframes?.length)) throw Error('No visible animated motion graphic was created.');`
  - Line 119: `if (stage === 'applyBroll' && !visible.some(c => c.assetId && after.assets[c.assetId] && ['image', 'overlay'].includes(after.tracks[c.trackId].kind) && c.volume === 0)) throw Error('No valid muted B-roll was inserted.');`
  - Line 120: `if (stage === 'applyZooms' && !visible.some(c => c.zooms?.length && JSON.stringify(c.zooms) !== JSON.stringify(before.clips[c.id]?.zooms))) throw Error('No zoom keyframes were applied.');`
  - Line 121: `if (stage === 'applySoundEffects' && !changed.some(c => c.assetId && after.assets[c.assetId]?.kind === 'audio' && c.audioRole === 'sfx' && c.volume > 0 && c.volume <= .35 && !after.tracks[c.trackId].muted && !after.tracks[c.trackId].hidden && c.startTime + c.duration <= projectDuration(before) + .04)) throw Error('No audible, synchronized sound effect was inserted.');`
- **File:** `app/lib/editor/sequentialEdit.ts:140`
  `if (!job.appliedOperations.length || project.revision <= job.initialRevision) throw Error('No requested edits were committed.');`
- **File:** `app/lib/editor/sequentialEditClient.ts:29`
  `summary: previous.status === 'completed' ? 'All requested stages completed.' : previous.errors.at(-1) || 'Previous edit stopped; committed changes remain.'`

### 1.3 Dynamic Captions in Presets
- **File:** `app/lib/editor/sequentialEditClient.ts:69-74`
  Inspects `existing` captions on footage:
  - If existing: emits `applyCaptionTemplate` with `job.captionTemplate` (in-place restyle, no retranscription).
  - If uncaptioned: generates `captions` tool request with `request.templateId`.
  - Sets `animateCaptions: /animat|engaging|punchy/i.test(job.instructions)`.
- **File:** `app/lib/editor/sequentialEdit.ts:105`
  `if (output.animateCaptions) { const ids = Object.values(next.clips).filter(c => c.contentId && next.captions[c.contentId] && (!project.clips[c.id] || validated.list.decisions.some(d => d.op === 'applyCaptionTemplate' && d.clipIds.includes(c.id)))).map(c => c.id); if (ids.length) next = setCaptionMotion(next, ids, 'pop'); }`

### 1.4 Testing Infrastructure
- **File:** `scripts/test-custom-ai-editing.mjs`
  Does not exist on disk (`find_by_name` returned 0 results).
- **Commands Executed:**
  - `npx tsc --noEmit`: Exited with code 0 (clean, 0 type errors).
  - `npm run build:cloudflare`: Exited with code 0 (all 5 build stages completed successfully).
  - `node --test scripts/test-sequential-edit.mjs`: 14 tests passed (644ms).
  - `node --test scripts/test-chat-tool-routing.mjs`: 14 tests passed (2969ms).
  - `node --test scripts/test-e2e-ai-and-compositor.mjs`: 1 test passed (623ms).
  - `node --test scripts/test-e2e-error-and-recovery.mjs`: 5 tests passed (548ms).

---

## 2. Logic Chain

1. **Preset Fragility Root Cause:**
   - Observations 1.1 and 1.2 show that when `PIPELINE_PRESETS[0]` (`engaging`) or `PIPELINE_PRESETS[2]` (`punchy`) runs, up to 4 supporting stages (`planMotionGraphics`/`applyMotionGraphics`, `findBroll`/`applyBroll`, `applyZooms`, `applySoundEffects`) are executed sequentially.
   - On short clips (<4s), inserting a 2-4s B-roll clip or adding multiple zooms is editorially incorrect. On speech-free clips, there are no spoken emphasis points for callouts, zooms, or SFX accents.
   - When the AI returns `decisions: []` and an explanation (e.g. *"Preserved original framing; no suitable emphasis points for zooms."*), `sequentialEditClient.ts` lines 75, 76, 79, and 83 throw fatal errors before commit.
   - Even if client checks pass, `validateStageChanges` lines 118–121 unconditionally throw errors when zero elements were added.
   - If a preset finishes without advancing revision, `validateCompletedJob` line 140 fails the entire job with `'No requested edits were committed.'`.
   - *Inference:* Supporting stages (`applyZooms`, `applyBroll`, `applyMotionGraphics`, `applySoundEffects`) must tolerate 0-decision completions when:
     a) `projectDuration(before) < 4.0`, OR
     b) `speechContext(before).length === 0`, OR
     c) The output summary documents an explicit skip rationale (e.g. matching `/preserve|framing|no suitable|no emphasis|no b-roll|no motion|no sound|no addition|skip|not appropriate|unnecessary/i`).
     And `validateCompletedJob` must not throw if at least one meaningful stage (such as analysis or captions) completed.

2. **Clarification Handling Root Cause:**
   - Observations 1.2 show that `editorAi.ts:85-91` only checks `readEditingIntent` when `context.pipelineStage` is false. In sequential edit (`pipelineStage: 'applyRequestedEdits'`), `readEditingIntent` is skipped.
   - Even if questions were returned, `sequentialEditClient.ts:88` throws on zero decisions/requests, `validateStageChanges:113` throws on unchanged timeline, and `validateCompletedJob:140` throws.
   - In `persist()` line 29, the summary in `editingHistory` is unconditionally overwritten with `"All requested stages completed."`, erasing the questions from the conversation ledger.
   - *Inference:* Pipeline stage `applyRequestedEdits` must extract `intent.questions`. When questions are returned without decisions, `applyRequestedEdits`, `validateStageChanges`, and `validateCompletedJob` must treat this as a completed clarification turn without error, preserve question text in `editingHistory`, and display it in `AiEditingChat.tsx`.

3. **Custom Edit Dynamic Routing:**
   - In `sequentialEdit.ts:55`, `createEditingJob` initializes stages with `stagesFor([])` -> `['analyzeFootage', 'validateEdit']`.
   - `sequentialEditClient.ts:65-66` calls `plan('analyzeFootage', ...)` over the network to obtain operations. In `sequentialEdit.ts:173`, the job stages are dynamically re-decomposed, which can split custom instructions across preset stages and break atomic timeline changes.
   - *Inference:* When `presetId` is undefined (free-form edit), `createEditingJob` must initialize `stagesFor(['requestedEdits'])` (`['analyzeFootage', 'applyRequestedEdits', 'validateEdit']`). In `sequentialEditClient.ts`, `analyzeFootage` must execute locally to collect metadata and return `operations: ['requestedEdits']` without wasting an LLM round-trip.

4. **Testing Infrastructure:**
   - Observation 1.4 confirms `scripts/test-custom-ai-editing.mjs` is required to verify the 6 acceptance test cases.
   - The established pattern across `test-sequential-edit.mjs` and `test-chat-tool-routing.mjs` (in-memory TypeScript transpile + `node:test` + mocked server responses) can be directly replicated for the new test suite.

---

## 3. Caveats

1. **Preserving Strict Non-Preset Assertions:**
   In `test-sequential-edit.mjs` line 57 and `test-e2e-error-and-recovery.mjs` line 214, explicit user instructions to "Add zooms" on long footage (>4s) with fake completion claims (`'I have successfully added zooms'` with 0 decisions) must continue to throw `'No zoom keyframes were applied'`. The zero-decision tolerance must strictly require either short duration (<4s), missing speech, or an explicit skip rationale.
2. **Local Transcription Mocking:**
   In testing environments without GPU Whisper or external audio transcription, `prepareAiTool` for `captions` must use synthetic speech mocks or existing caption clips.
3. **No Unapproved Writes:**
   All findings are strictly read-only; no application source code files outside of `.agents/teamwork/explorer_presets_survey_1/` were created or modified.

---

## 4. Conclusion

The preset architecture is sound and well-structured, but requires specific repairs to its validation thresholds and client execution handlers:
1. Allow supporting stages (`applyZooms`, `applyBroll`, `applyMotionGraphics`, `applySoundEffects`) to complete with 0 decisions under short footage (<4.0s), missing speech, or explicit skip rationales in `validateStageChanges` and `sequentialEditClient.ts`.
2. Allow `validateCompletedJob` to complete cleanly when supporting stages legitimately skip or when clarification questions are returned.
3. Enable clarification extraction in `editorAi.ts` for `applyRequestedEdits`, preserve question text in `editingHistory`, and display questions in `AiEditingChat.tsx`.
4. Route custom edits directly to `['analyzeFootage', 'applyRequestedEdits', 'validateEdit']` with local analysis.
5. Add Gemini 3.8 Flash fallback in `editorProvider.ts` on Groq 429/timeout/5xx errors.
6. Create `scripts/test-custom-ai-editing.mjs` covering all 6 acceptance criteria using the repository's native `node --test` + in-memory TypeScript transpile pattern.

---

## 5. Verification Method

To verify these findings independently:

1. **Verify Baseline Typecheck & Build:**
   ```powershell
   npx tsc --noEmit
   npm run build:cloudflare
   ```
   Both commands should exit with code 0.

2. **Verify Existing Sequential Edit & Routing Test Suites:**
   ```powershell
   node --test scripts/test-sequential-edit.mjs
   node --test scripts/test-chat-tool-routing.mjs
   node --test scripts/test-e2e-ai-and-compositor.mjs
   node --test scripts/test-e2e-error-and-recovery.mjs
   ```
   All tests should pass.

3. **Verify Edge-Case Failure Points:**
   Inspect lines:
   - `app/lib/editor/sequentialEditClient.ts:75, 76, 79, 83, 88`
   - `app/lib/editor/sequentialEdit.ts:113, 118, 119, 120, 121, 140`
   - `app/lib/server/editorAi.ts:85-91`
   - `app/lib/server/editorProvider.ts:16-36`

4. **Verify Implementation Against New Test Suite:**
   Once `scripts/test-custom-ai-editing.mjs` is authored, run:
   ```powershell
   node --test scripts/test-custom-ai-editing.mjs
   ```
   All 6 required test cases should pass.
