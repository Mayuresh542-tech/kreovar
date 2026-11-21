# Task Assignment: Worker R1.1 - Implement R1 Requirements

## Working Directory
`c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code`

## State Folder
`c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\worker_r1_1\`

## Reference Artifacts
- `c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\ORIGINAL_REQUEST.md`
- `c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\orchestrator\PROJECT.md`
- Explorer 1 Report: `c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\explorer_r1_1\handoff.md`
- Explorer 2 Report: `c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\explorer_r1_2\handoff.md`
- Explorer 3 Report: `c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\explorer_r1_3\handoff.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Detailed Requirements to Implement
1. **R1.1: TypeScript Signature Alignment (`app/lib/editor/hinglishNormalizer.ts`, `app/captions/page.tsx`, `app/api/transcribe/route.ts`):**
   - Introduce `BaseTimedWord` interface with `{ word?: string; text?: string; start: number; end: number; }` and update `normalizeHinglishWords<T extends BaseTimedWord>(words: T[]): T[]` preserving generic array type.
   - In `app/captions/page.tsx`, fallback to `[]` instead of `undefined` in lines 40 & 80.
   - Ensure `npx tsc --noEmit` passes with 0 errors.
2. **R1.2: Eliminate In-Place State Mutation & Text Deletion (`app/lib/editor/sequentialEdit.ts`, `app/lib/editor/sequentialEditClient.ts`):**
   - In `validateCompletedJob`, clone `clips`, `tracks`, `textLayers`, `captions` before mutations so `project.clips !== current.clips` evaluates `true` in `persist()` and triggers `store.execute()`.
   - In `sequentialEditClient.ts` `validateEdit`, clone and return `{ ...result, project: validatedProject }`. In `sequentialEdit.ts:362`, apply `output.project`.
   - Preserve text clips on text tracks without `c.graphic`, including manual titles, AI `addText`, and lower-thirds; only remove if explicitly flagged as an invalid hallucination.
3. **R1.3: Multi-Stage Pipeline Expansion (`app/lib/editor/sequentialEdit.ts`, `app/lib/editor/sequentialEditClient.ts`):**
   - Update `stagesFor()` to order intermediate stages (`applyCaptions`, `findBroll`, `applyBroll`, `applyZooms`, `applySoundEffects`, `applyMotionGraphics`, etc.) before `applyRequestedEdits`, right before `validateEdit`.
   - In `runEditingJob()`, expand `job.stages` in `analyzeFootage` when operations are returned by the stage.
   - In `sequentialEditClient.ts` `analyzeFootage`, allow calling `plan()` when operations are not predefined by preset.
   - Guard `output?.tokenBudget` on line 357.
4. **R1.4: Reconciler Invariant (`app/lib/editor/inPlaceReconciler.ts`):**
   - Partition, sort ranges chronologically, and append all `rippleCut` decisions at the very end of `reconciledDecisions`.
5. **R1.5: Atomic Multi-Stage Undo, Lock Race & Test DOM Alignment:**
   - In `app/lib/editor/store.ts`, implement `rollbackToRevision(targetRevision: number): boolean`.
   - In `app/components/editor/useConversationalAiChat.ts`, update `undoTurn` to use `rollbackToRevision(target.preRevision)` for atomic rollback.
   - In `app/components/editor/useConversationalAiChat.ts`, track `currentExecutionPromiseRef` in `stopExecution()` and await it before clearing `isExecuting`.
   - In `app/components/editor/useConversationalAiChat.ts` `catch` block, compute `changes`, `postRevision`, and `didModifyTimeline` when `afterProject.revision > preRevision` so Undo and View Changes remain visible.
   - In `app/components/editor/workspace/EditorContext.tsx` and `Workspace.tsx`, pass `isExecuting` and guard `run(edit)` against manual edits during execution.
   - In `scripts/test-sequential-edit.mjs:71`, align assertions with `EditorLayout.tsx` and `AssetDrawer.tsx`.
   - In `scripts/test-chat-tool-routing.mjs:13`, spread `...base('app/lib/editor/editorCaptionStudio.ts')` in the mock.
6. **R1.6: ESLint Cleanup:**
   - Fix 5 ESLint errors in `scripts/test-account-deletion.mjs`, `scripts/test-caption-video.mjs`, and `scripts/test-seo.mjs` (replace `module` with `mod`, fix `this` alias in fixture).

## Verification Requirements
Worker must run and report output for:
- `npx tsc --noEmit` (must be 0 errors)
- `npm run lint` (must be 0 errors)
- `npm run test:chat-routing` (must be 28/28 passing)
- `npm run test:e2e` (must be 6/6 passing)
