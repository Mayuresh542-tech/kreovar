# Task Assignment: Milestone 3 — Intelligent Custom AI Editing & Clarification System

You are `worker_m3_1`, a `teamwork_worker`.
Working directory: c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\worker_m3_1\
Original Request: c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\ORIGINAL_REQUEST.md
PROJECT document: c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\orchestrator\PROJECT.md
Spec Miner Survey: c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\spec_miner_survey_1\analysis.md
Editor Explorer Survey: c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\explorer_editor_survey_1\analysis.md
E2E Test Suite: c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\scripts\test-custom-ai-editing.mjs

## File Ownership
You exclusively own and modify:
- `app/lib/editor/sequentialEdit.ts`
- `app/lib/editor/sequentialEditClient.ts`
- `app/api/editor/ai-edit/route.ts`
- `app/lib/server/editorAi.ts`
- `app/components/editor/workspace/AiEditingChat.tsx`

## MANDATORY INTEGRITY WARNING
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Objective
Implement R1: Intelligent Custom AI Editing System and Clarification Lifecycle (Features 1-17):

1. **Custom Stages & Local Analysis**:
   - In `app/lib/editor/sequentialEdit.ts`: `createEditingJob` must initialize `stagesFor(preset?.operations || ['requestedEdits'])` when `preset` is undefined, yielding `['analyzeFootage', 'applyRequestedEdits', 'validateEdit']`.
   - In `app/lib/editor/sequentialEditClient.ts`: for custom edits (where `job.presetId` is undefined), `analyzeFootage` must execute locally to measure footage duration and speech segment count, returning `{ summary: 'Analyzed footage locally', operations: ['requestedEdits'] }` without remote LLM call, preventing sub-stage decomposition in `sequentialEdit.ts:172-175`.
   - In `sequentialEditClient.ts`: `executeStage('applyRequestedEdits')` must tolerate 0 decisions when `output.questions?.length > 0`.

2. **Wire Contract & Conversation History**:
   - In `sequentialEditClient.ts`: in `plan()`, extract completed and clarified turns from `project.editingHistory` and send `conversationHistory` array in `POST /api/editor/ai-edit` request body.
   - In `app/api/editor/ai-edit/route.ts`: parse `conversationHistory` from `body` and pass it to `planAiEdit`.
   - In `sequentialEditClient.ts`: in `persist()`, preserve clarification question text in `summary` (e.g. `previous.questions?.[0] || ...`) instead of unconditionally overwriting with `'All requested stages completed.'`.

3. **Server Planning & Clarification Handling (`app/lib/server/editorAi.ts`)**:
   - When `context.pipelineStage === 'applyRequestedEdits'`: extract `intent = readEditingIntent(value)`. If `intent?.questions?.length`, return `{ summary: intent.summary, questions: intent.questions, list: { version: 1, projectId: project.id, baseRevision: project.revision, decisions: [] }, toolRequests: [] }` without asserting nonempty decisions.
   - Prompt construction: incorporate `conversationHistory`, transcript timestamps, clip properties, sampled frames, and explicit guidelines for:
     - Free-form instructions (using all 28 native operations and 7 media tools).
     - Temporal bounds ("first 10s untouched", "after 0:15", "second half").
     - Negative constraints ("don't change audio", "no SFX", "don't cut footage").
     - In-place modifications / refinements (`composeCaption`, `changeClipProperty`, `clearZooms`, `changeText`) without generating duplicate elements.
     - Single consolidated `rippleCut` for speech gap trimming (>0.6s).
     - Clarification question generation when user prompt is ambiguous or conflicting.

4. **UI Question Display (`app/components/editor/workspace/AiEditingChat.tsx`)**:
   - When a job completes with clarification questions (or `job.questions?.length > 0` or question in summary), display the clarification question prompt cleanly to the user instead of generic MP4 export text.

5. **Verification**:
   - Run `node --test scripts/test-custom-ai-editing.mjs` (must pass 32/32 tests).
   - Run `node --test scripts/test-sequential-edit.mjs` (must pass 14/14 tests).
   - Run `node --test scripts/test-e2e-error-and-recovery.mjs` (must pass 5/5 tests).
   - Run `node --test scripts/test-chat-tool-routing.mjs` (must pass 14/14 tests).
   - Run `npx tsc --noEmit` (0 errors).
   - Run `npm run build:cloudflare` (clean build).

Write your report to `c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\worker_m3_1\handoff.md`.
Send a message back when completed.
