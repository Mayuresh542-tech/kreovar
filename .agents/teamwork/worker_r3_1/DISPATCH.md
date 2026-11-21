## 2026-11-14T11:07:15Z
You are worker_r3_1.
Working directory: c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code
State folder: c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\worker_r3_1\

Read authoritative documents FIRST:
1. c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\ORIGINAL_REQUEST.md (§ R3)
2. c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\explorer_r3_1\handoff.md (comprehensive 762-line blueprint with line numbers, code snippets, and exact formulas)
3. c:\Users\Admin\OneDrive\Desktop\kreovar\main kreovar\kreovar main code\.agents\teamwork\orchestrator_gen2\PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your task is to implement all 3 areas of Requirement R3 based on the blueprint in explorer_r3_1/handoff.md:

### Area 1: Timeline & Caption Slicing Operations (`operations.ts`, `rippleCut.ts`)
1. **`changeText`**:
   - In `app/lib/editor/operations.ts`, preserve or proportionally re-map `words` and `studioData` when caption text changes. Ensure `words.map(w => w.word).join(" ").trim() === layer.text.trim()` to satisfy `aiValidation.ts`, preserving timestamps and styles rather than wiping them to `undefined`.
2. **`trimClip` & `splitClip`**:
   - In `operations.ts:splitClip`, slice caption `words[]` and text at split time `time` (`source = c.sourceStart + left * c.speed`). Left clip gets words up to split point; right clip gets words from split point forward with adjusted start times and matching sliced text.
   - In `operations.ts:trimClip`, slice caption `words[]` and text when trimming left or right edges so caption words stay inside the active clip bounds.
3. **`mergeCaptions`**:
   - In `operations.ts:mergeCaptions`, calculate `sourceEnd` using:
     `sourceEnd = first.sourceStart + (end - first.startTime) * first.speed`
   - Concatenate and preserve words from all merged captions across the merge rather than erasing them.
4. **`rippleCut.ts`**:
   - In `app/lib/editor/rippleCut.ts`, re-index `studioData.emphasizedWords` (number array of word indices) and `studioData.wordStyles` (dictionary keyed by word index) after removing silent gaps, matching the surviving words.
   - Preserve `anchorVisualTreatment(c)` when slicing clips in `rippleCut.ts`.

### Area 2: Export & Compositor Rendering (`offlineExport.ts`, `compositor.ts`, `studioCanvas.ts`, `canvasCaptions.ts`, `aiValidation.ts`)
1. **`offlineExport.ts` Audio duration, bleed clamping, gain automation**:
   - Pass timeline output duration (`slice.length / c.speed`) as the 3rd argument to `source.start(slice.when, slice.offset, slice.length / c.speed)` when `c.speed !== 1`.
   - Clamp decoding/playback buffer requests to `Math.min(c.sourceEnd, c.sourceStart + c.duration * c.speed)` to prevent audio bleed past clip duration.
   - Clamp gain automation at `c.startTime + c.duration` with `gain.gain.setValueAtTime(0, c.startTime + c.duration)`.
2. **`compositor.ts` Track order visual sorting**:
   - In `app/lib/editor/compositor.ts`, sort visual layers using `project.trackOrder` instead of hardcoded track-kind priority.
3. **`studioCanvas.ts` & `canvasCaptions.ts` Global Alpha and Filter composition**:
   - In `app/lib/captions/studioCanvas.ts` and `app/lib/captions/canvasCaptions.ts`, compose `ctx.globalAlpha` (`ctx.globalAlpha *= ...`) instead of overwriting parent opacity.
   - Compose `ctx.filter` or restore prior filter state instead of overwriting with `'none'`.
4. **`offlineExport.ts` Caption font loading & feeder mutex**:
   - In `app/lib/editor/offlineExport.ts`, call `loadCaptionFonts(project)` before rendering frames.
   - Guard `feeder.next()` with a per-feeder mutex/queue so concurrent calls during overlapping transitions do not crash.
5. **`aiValidation.ts` Locked track recovery**:
   - In `app/lib/editor/aiValidation.ts:aiProjectSnapshot`, skip calling `setVisualTreatment` on locked tracks (`if (!track || track.locked) continue;`) so locked tracks never crash recovery or export.

### Area 3: Billing, Rate-Limit & Provider Fixes (`broll-choice/route.ts`, `planUsage.ts`, `generate-image/route.ts`, `groqEditorTransport.ts`, `editorProvider.ts`)
1. **`broll-choice/route.ts` & `planUsage.ts` Credit consumption**:
   - In `app/api/editor/broll-choice/route.ts` and `app/lib/server/planUsage.ts`, prevent `withUsage(..., 'ai')` from refunding `ai_edits` on successful B-roll selection. Include `{ usageConsumed: true }` in the response or exempt successful `broll-choice` responses from the empty-decisions refund rule.
2. **`generate-image/route.ts` Rate-limit ordering**:
   - In `app/api/editor/generate-image/route.ts`, verify `process.env.IMAGE_GENERATION_ENABLED === "true"` and `await getGeminiApiKey()` BEFORE incrementing `state.count++`.
3. **`groqEditorTransport.ts` Try/finally token settlement**:
   - In `app/lib/server/groqEditorTransport.ts`, wrap the Groq API call in `try / finally` so `settleEditorTokens` always executes to release reserved tokens on network or timeout errors.
4. **`editorProvider.ts` Gemini token telemetry & vision frames**:
   - In `app/lib/server/editorProvider.ts`, capture and record actual Gemini token usage metadata (input, output, total) and resolved fallback model name, and attach candidate/footage frames on Gemini attempt 1.

### Verification Requirements:
Run and verify:
1. `npx tsc --noEmit` — 0 errors.
2. `npm run lint` — 0 errors.
3. `npm run test:chat-routing` — 28/28 tests passed.
4. `npm run test:e2e` — 6/6 tests passed.
5. Regression suites: `node --test scripts/test-creator-presets.mjs scripts/test-hinglish-and-fallback.mjs scripts/test-visual-masks-rgb.mjs`.
6. Dedicated suites: `node --test scripts/test-plan-usage.mjs` and `node --test scripts/test-ai-zooms-cuts.mjs`.

Write your complete results and verification commands in `handoff.md` in your state folder (`.agents/teamwork/worker_r3_1/handoff.md`). Message the orchestrator via send_message when finished.
