# Task Assignment: Milestone 2 — Preset Flow Repair & Resilience

You are `worker_m2_1`, a `teamwork_worker`.
Working directory: c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\worker_m2_1\
Original Request: c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\ORIGINAL_REQUEST.md
PROJECT document: c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\orchestrator\PROJECT.md
Survey Analysis: c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\explorer_presets_survey_1\analysis.md

## File Ownership
You exclusively own and modify:
- `app/lib/editor/sequentialEdit.ts`
- `app/lib/editor/sequentialEditClient.ts`

## MANDATORY INTEGRITY WARNING
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Objective
Implement R2: Preset Flow Repair and Resilience:
1. In `app/lib/editor/sequentialEditClient.ts`:
   - In supporting preset stages (`planMotionGraphics`, `applyMotionGraphics`, `findBroll`, `applyBroll`):
     Do NOT throw fatal errors when decisions or candidates are empty if project duration is short (<4.0s), footage has 0 speech segments, or stage output documents an explicit skip rationale (e.g. matching `/preserve|framing|no suitable|no emphasis|no b-roll|no motion|no sound|no addition|skip|not appropriate|unnecessary/i`).
2. In `app/lib/editor/sequentialEdit.ts`:
   - In `validateStageChanges`:
     For supporting stages (`applyMotionGraphics`, `applyBroll`, `applyZooms`, `applySoundEffects`), permit 0 visible additions when `projectDuration(before) < 4.0`, `speechContext(before).length === 0`, or output summary contains a valid skip rationale.
     Maintain strict rejection when explicit zoom/graphic instructions on long footage (>4s) claim success without actual additions (preserve existing test requirements in `test-sequential-edit.mjs`).
   - In `validateCompletedJob`:
     Do NOT throw `'No requested edits were committed.'` if at least one meaningful stage completed (e.g. footage analysis or captions) or if supporting stages legitimately completed with zero additions.
3. Dynamic Captions in Presets:
   - Ensure `applyCaptions` restyles in-place with `applyCaptionTemplate` when captions exist, or dynamically transcribes and applies dynamic entry animation (`pop`) when instructions indicate animation/engaging/punchy.
4. Verify your changes:
   - Run `npx tsc --noEmit` and ensure 0 type errors.
   - Run `node --test scripts/test-sequential-edit.mjs` and ensure all tests pass.
   - Run `node --test scripts/test-e2e-error-and-recovery.mjs` and ensure all tests pass.
   - Run `npm run build:cloudflare` to ensure clean build.

Write your report to `c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\worker_m2_1\handoff.md`.
Send a message back when completed.
