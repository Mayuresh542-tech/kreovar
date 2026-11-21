# Handoff Report — Requirement R3 Empirical Stress-Testing

**Agent**: `challenger_r3_1`  
**Milestone**: Requirement R3 Review (Export Audio Sync, Compositor Rendering, Billing/Token Leaks & AI Vision)  
**Status**: Task Complete (Hard Handoff)  
**Verdict**: **`REQUEST_CHANGES`**  
**Date**: 2026-11-14T11:45:00Z  

---

## 1. Observation

Direct empirical investigation, static analysis, and execution of a 22-test adversarial harness (`scripts/test-r3-stress.mjs`) against Requirement R3 implementations revealed the following:

### Area 1: Timeline & Caption Slicing Operations
1. **`app/lib/editor/operations.ts:260` (`changeText`)**:
   - In `operations.ts:260`, `changeText` updates the clip name:
     ```ts
     return {
       ...put(p, { ...c, name: normalizedText.slice(0, 50) }),
       ...
     ```
   - When `changeText(p, clipId, "")` or `changeText(p, clipId, "   ")` is executed, `newTokens` is `[]`, `normalizedText` is `""`, and `c.name` is set to `""`.
   - When `aiProjectSnapshot` is subsequently invoked on the project (which happens during autosave, offline export, and AI edit validation):
     ```ts
     // app/lib/editor/aiValidation.ts:81
     name: string(c.name)
     ```
     and `string(value)` in `aiValidation.ts:23`:
     ```ts
     function string(value: unknown, max = 200): string {
       if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("Invalid or missing text.");
       return value;
     }
     ```
     throws verbatim:
     ```
     Error: Invalid or missing text.
     ```
   - Reproduction test: `scripts/test-r3-stress.mjs:199` (test 1.7) passes and confirms this failure mode.

2. **`app/lib/editor/rippleCut.ts:72` (`rippleCut`)**:
   - When a ripple cut divides a caption clip into surviving segments:
     ```ts
     // app/lib/editor/rippleCut.ts:39-46
     const originalWords = caption.words || [];
     const surviving = originalWords
       .map((w, origIdx) => ({ w, origIdx }))
       .filter(({ w }) => w.end > sourceStart && w.start < sourceEnd);
     const words = surviving.map(({ w }) => ({
       ...w,
       start: Math.max(sourceStart, w.start),
       end: Math.min(sourceEnd, w.end)
     }));
     ```
     and at line 72:
     ```ts
     captions[contentId] = {
       ...caption,
       id: contentId,
       ...(words.length ? { words, text: words.map(w => w.word).join(' ') } : {}),
       ...(studioData ? { studioData } : {})
     };
     ```
   - If a surviving segment falls on a region where no words were spoken (`words.length === 0`), `...(words.length ? ... : {})` evaluates to `{}`.
   - Consequently, `captions[contentId]` inherits `caption.text` and `caption.words` from `...caption` (the uncut caption from the other segment).
   - Direct verification (`scripts/test-r3-stress.mjs:602`, test 5.3): For a 10s caption with words at `[0..1s, 1..2s]`, a cut at `[4..6s]` produces two clips: Clip 1 (`sourceStart=0, sourceEnd=4`) and Clip 2 (`sourceStart=6, sourceEnd=10`). Clip 2 contains:
     ```js
     {
       text: 'hello world',
       words: [ { word: 'hello', start: 0, end: 1 }, { word: 'world', start: 1, end: 2 } ]
     }
     ```
     Duplicate caption text and out-of-bounds word timestamps are retained on the silent clip.

3. **Verified Correct Operations**:
   - `splitClip` (`operations.ts:107-171`): Correctly splits words crossing the split boundary (`[w.start, source]` on left, `[source, w.end]` on right), strictly separates words before/after boundary, correctly remaps `studioData.emphasizedWords` and `wordStyles`, and handles playback speeds !== 1.
   - `trimClip` (`operations.ts:65-106`): Slices words within `[sourceStart, sourceEnd]`, clamps word boundaries, and cleanly re-indexes `studioData`.
   - `mergeCaptions` (`operations.ts:275-339`): `sourceEnd` formula `first.sourceStart + (end - first.startTime) * first.speed` is exact. Words from subsequent clips are properly translated into `first`'s source clock.
   - `rippleCut.ts:78`: Correctly anchors visual treatment entrance and exit source timestamps via `anchorVisualTreatment(c)` before slicing.

### Area 2: Export & Compositor Rendering
1. **Audio Duration Scaling (`offlineExport.ts:291`)**:
   - Third argument to `source.start(slice.when, slice.offset, c.speed !== 1 ? slice.length / c.speed : slice.length)` passes timeline output duration, correctly scaling playback duration when `c.speed !== 1`.
2. **Audio Bleed Clamping (`offlineExport.ts:286-293`)**:
   - Decoding end is clamped to `effectiveSourceEnd = Math.min(c.sourceEnd, c.sourceStart + c.duration * c.speed)`.
   - Gain automation is explicitly clamped to 0 at `c.startTime + c.duration`.
3. **Compositor Stacking (`compositor.ts:100-105`)**:
   - `visibleLayers` sorts visual layers using `project.trackOrder`, allowing custom track hierarchies and reverse track orders to composite in the exact order specified.
4. **Feeder Mutex (`offlineExport.ts:172-184`)**:
   - `withFeederMutex` was tested under 30 concurrent invocations simultaneously (`scripts/test-r3-stress.mjs:7.1`), demonstrating `maxConcurrency = 1` and sequential FIFO ordering without race conditions.
   - Queue handles decoder rejections cleanly (`test-r3-stress.mjs:7.2`) without deadlocking subsequent frames.

---

## 2. Logic Chain

1. **Clip Name Invariant & Validation Crash**:
   - *Observation 1.1*: `operations.ts:260` executes `name: normalizedText.slice(0, 50)`.
   - *Observation 1.1*: `aiValidation.ts:81` validates all clips using `name: string(c.name)`, which checks `!value.trim()` and throws `Invalid or missing text.`.
   - *Inference*: Clearing caption or text layer content via `changeText(p, id, "")` sets `c.name = ""`. Any subsequent call to `aiProjectSnapshot(p)` (which runs during autosave, AI edits, and export) throws and fails.
   - *Conclusion*: `c.name` must be protected with a fallback (e.g. `normalizedText.slice(0, 50).trim() || c.name || "Caption"`).

2. **RippleCut Silent Segment Caption Duplication**:
   - *Observation 1.2*: `rippleCut.ts:72` uses conditional spread `...(words.length ? { words, text: words.map(w => w.word).join(' ') } : {})`.
   - *Observation 1.2*: When `words.length === 0`, nothing is spread, and `captions[contentId]` retains `...caption` verbatim.
   - *Inference*: For any cut fragment that falls into a silence or pause where `caption.words` has 0 surviving entries, the clip retains the full text and words of the original caption, duplicating subtitles onto silent timeline intervals.
   - *Conclusion*: When `caption.words` exists, `words` and `text` must always be updated (`words, text: words.map(w => w.word).join(' ')`), even when `words.length === 0`.

---

## 3. Caveats

- **No Caveats**: All findings were empirically tested and reproduced using concrete unit tests in `scripts/test-r3-stress.mjs`. All 7 mission items specified in the orchestrator dispatch were systematically examined and verified.

---

## 4. Conclusion

**Verdict: `REQUEST_CHANGES`**

While the majority of Requirement R3 is robustly implemented (audio time-stretching duration scaling, bleed clamping, feeder concurrency mutex, track-order layer sorting, Hinglish word translation, and B-roll billing accounting), two critical edge-case bugs must be addressed before approval:

1. **Fix `operations.ts:260` (`changeText`)**:
   - Change:
     ```ts
     ...put(p, { ...c, name: normalizedText.slice(0, 50) }),
     ```
     to:
     ```ts
     ...put(p, { ...c, name: normalizedText.slice(0, 50).trim() || c.name || (key === 'captions' ? 'Caption' : 'Text') }),
     ```
   - Prevents `aiProjectSnapshot` from throwing `Invalid or missing text.` when text is cleared.

2. **Fix `rippleCut.ts:72` (`rippleCut`)**:
   - Change:
     ```ts
     captions[contentId] = {
       ...caption,
       id: contentId,
       ...(words.length ? { words, text: words.map(w => w.word).join(' ') } : {}),
       ...(studioData ? { studioData } : {})
     };
     ```
     to:
     ```ts
     captions[contentId] = {
       ...caption,
       id: contentId,
       ...(caption.words ? { words, text: words.map(w => w.word).join(' ') } : {}),
       ...(studioData ? { studioData } : {})
     };
     ```
   - Ensures that when a caption clip with word timings is cut into a silent segment, `words` is cleared to `[]` and `text` to `""`, preventing duplicate ghost captions.

---

## 5. Verification Method

To independently verify all findings and baseline suites:

1. **Run R3 Stress-Testing Suite (including empirical bug reproductions)**:
   ```powershell
   node --test scripts/test-r3-stress.mjs
   ```
   *Result*: 22/22 tests pass, including test 1.7 (verifying `changeText` empty name crash) and test 5.3 (verifying `rippleCut` ghost caption duplication).

2. **Run Worker R3 Verification Suite**:
   ```powershell
   node --test scripts/test-r3-verification.mjs
   ```
   *Result*: 9/9 tests pass.

3. **Run TypeScript Check**:
   ```powershell
   npx tsc --noEmit
   ```
   *Result*: Exit code 0, 0 type errors.

4. **Run ESLint**:
   ```powershell
   npm run lint
   ```
   *Result*: Exit code 0, 0 lint errors (332 warnings, 0 errors).

5. **Run Chat Routing & E2E Suites**:
   ```powershell
   npm run test:chat-routing
   npm run test:e2e
   ```
   *Result*: 28/28 chat routing tests pass; 6/6 E2E tests pass.
