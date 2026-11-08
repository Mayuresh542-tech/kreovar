# Analysis: Preset Pipelines, Edge-Case Resilience, Dynamic Captions & Testing Infrastructure

**Author:** explorer_presets_survey_1  
**Date:** 2026-11-07  
**Scope:** `PIPELINE_PRESETS`, Stage Lifecycles, Edge-Case Failure Points, Dynamic Captions, Test Framework & Verification

---

## 1. Executive Summary

This investigation surveys Kreovar's preset editing pipeline, stage execution mechanics, zero-decision failure modes on short/speechless footage, dynamic caption behavior, and testing infrastructure in support of the *Intelligent Custom Editing and Preset Repair Design* (`docs/superpowers/specs/2026-11-07-intelligent-custom-editing-and-preset-repair-design.md`).

Key findings include:
1. **Preset Architecture:** Defined in `app/lib/editor/sequentialEdit.ts:21-25` (`engaging`, `clean`, `punchy`). Preset operations are mapped to pipeline stages via `stagesFor()` (`sequentialEdit.ts:48-51`) and triggered via `AiEditingChat.tsx:21,40`.
2. **Failure Mechanisms on Short Footage (<4s) & Missing Speech:** Rigid assertions throw fatal errors at multiple checkpoints when a supporting stage (`applyZooms`, `applyBroll`, `applyMotionGraphics`, `applySoundEffects`) legitimately makes zero additions:
   - `app/lib/editor/sequentialEditClient.ts:75`: `planMotionGraphics` throws `'AI did not plan any requested motion graphics.'`
   - `app/lib/editor/sequentialEditClient.ts:76`: `applyMotionGraphics` throws `'Motion graphics plan is missing.'`
   - `app/lib/editor/sequentialEditClient.ts:79`: `findBroll` throws `'No relevant B-roll candidates were found.'`
   - `app/lib/editor/sequentialEditClient.ts:83`: `applyBroll` throws `'No selected B-roll is available.'`
   - `app/lib/editor/sequentialEdit.ts:118`: `validateStageChanges('applyMotionGraphics')` throws `'No visible animated motion graphic was created.'`
   - `app/lib/editor/sequentialEdit.ts:119`: `validateStageChanges('applyBroll')` throws `'No valid muted B-roll was inserted.'`
   - `app/lib/editor/sequentialEdit.ts:120`: `validateStageChanges('applyZooms')` throws `'No zoom keyframes were applied.'`
   - `app/lib/editor/sequentialEdit.ts:121`: `validateStageChanges('applySoundEffects')` throws `'No audible, synchronized sound effect was inserted.'`
   - `app/lib/editor/sequentialEdit.ts:140`: `validateCompletedJob` throws `'No requested edits were committed.'` if `job.appliedOperations` is empty or revision didn't advance.
3. **Dynamic Caption Behavior:** Presets define default caption templates (`clean-sub` for `clean`, `signature-poppins` for `engaging` and `punchy`). In `sequentialEditClient.ts:69-74`, existing captions are restyled in-place via `applyCaptionTemplate` without retranscription; uncaptioned footage triggers Whisper transcription via `prepareAiTool` with `request.templateId`. If instructions match `/animat|engaging|punchy/i`, `setCaptionMotion(..., 'pop')` dynamically applies entry animation.
4. **Clarification Handling Defect:** When a custom edit returns clarification questions with 0 decisions, `editorAi.ts:85-91` fails to extract `questions` in pipeline mode (`context.pipelineStage`), `sequentialEditClient.ts:88` throws an error, `validateStageChanges:113` throws, `validateCompletedJob:140` throws, `persist:29` overwrites clarification with `"All requested stages completed."`, and `AiEditingChat.tsx:33` displays generic success text.
5. **Testing Infrastructure:** `scripts/test-custom-ai-editing.mjs` does **not** yet exist. Testing in the repo relies on Node's native test runner (`node --test`), `node:assert/strict`, and in-memory TypeScript module transpilation (`typescript.transpileModule` in `node:vm`) as demonstrated in `scripts/test-sequential-edit.mjs` and `scripts/test-chat-tool-routing.mjs`. Baseline verification confirms `npx tsc --noEmit` passes with 0 errors and `npm run build:cloudflare` builds successfully.

---

## 2. Preset Pipeline Architecture & Configuration

### 2.1 Preset Registry (`app/lib/editor/sequentialEdit.ts`)

`PIPELINE_PRESETS` is exported at lines 20–25:

```typescript
export interface PipelinePreset {
  id: string;
  name: string;
  instruction: string;
  operations: EditOperation[];
  captionTemplate: string;
}

export const PIPELINE_PRESETS: PipelinePreset[] = [
  {
    id: 'engaging',
    name: 'Engaging talking head',
    instruction: 'Add animated captions, motion graphics, relevant B-roll and subtle zoom effects.',
    operations: ['captions', 'motionGraphics', 'broll', 'zooms'],
    captionTemplate: 'signature-poppins'
  },
  {
    id: 'clean',
    name: 'Clean captions',
    instruction: 'Add readable animated captions. Preserve the original footage, dialogue and framing.',
    operations: ['captions'],
    captionTemplate: 'clean-sub'
  },
  {
    id: 'punchy',
    name: 'Caption emphasis',
    instruction: 'Add animated captions, sparse motion graphic callouts, subtle zooms and restrained sound effects.',
    operations: ['captions', 'motionGraphics', 'zooms', 'soundEffects'],
    captionTemplate: 'signature-poppins'
  }
];
```

### 2.2 Stage Routing (`stagesFor`)

`stagesFor(operations)` in `sequentialEdit.ts:48-51` maps operation sets to sequential stages:

```typescript
export function stagesFor(operations: EditOperation[]): EditStage[] {
  if (operations.includes('requestedEdits')) {
    if (operations.length !== 1) throw Error('Custom requestedEdits must run alone, not mixed with preset stages.');
    return ['analyzeFootage', 'applyRequestedEdits', 'validateEdit'];
  }
  return [
    'analyzeFootage',
    ...(operations.includes('captions') ? ['applyCaptions' as const] : []),
    ...(operations.includes('motionGraphics') ? ['planMotionGraphics' as const, 'applyMotionGraphics' as const] : []),
    ...(operations.includes('broll') ? ['findBroll' as const, 'applyBroll' as const] : []),
    ...(operations.includes('zooms') ? ['applyZooms' as const] : []),
    ...(operations.includes('soundEffects') ? ['applySoundEffects' as const] : []),
    ...(operations.includes('effects') ? ['applyEffects' as const] : []),
    'validateEdit'
  ];
}
```

#### Mapping by Preset:

| Preset ID | Operations | Resulting Stages Sequence |
| :--- | :--- | :--- |
| `clean` | `['captions']` | `analyzeFootage` → `applyCaptions` → `validateEdit` |
| `engaging` | `['captions', 'motionGraphics', 'broll', 'zooms']` | `analyzeFootage` → `applyCaptions` → `planMotionGraphics` → `applyMotionGraphics` → `findBroll` → `applyBroll` → `applyZooms` → `validateEdit` |
| `punchy` | `['captions', 'motionGraphics', 'zooms', 'soundEffects']` | `analyzeFootage` → `applyCaptions` → `planMotionGraphics` → `applyMotionGraphics` → `applyZooms` → `applySoundEffects` → `validateEdit` |
| *Custom* (currently) | `[]` initially, then LLM | `analyzeFootage` → LLM round-trip → re-decomposition into preset stages or `applyRequestedEdits` (needs fix per spec Section 4.1) |

### 2.3 User Initiation in UI (`AiEditingChat.tsx`)

In `app/components/editor/workspace/AiEditingChat.tsx`:
- Line 40 renders the preset buttons: `{PIPELINE_PRESETS.map(p => <button ... onClick={() => { setPreset(p.id); setInput(p.instruction); }}>{p.name}</button>)}`.
- Line 21 initializes execution: `const config = PIPELINE_PRESETS.find(p => p.id === preset && p.instruction === input.trim()); const next = createEditingJob(store.getSnapshot(), input, selection, config); void run(next);`.

---

## 3. Preset Stages Lifecycle & Execution Mechanics

Stage execution is divided across client coordination (`sequentialEditClient.ts`) and timeline application/validation (`sequentialEdit.ts`):

```
       [Client: sequentialEditClient.ts]               [Core: sequentialEdit.ts]
                      │                                           │
  1. executeStage(stage, project, job)                            │
     - If analyzeFootage: read footage/frames                     │
     - If applyCaptions: check existing or transcribe             │
     - If planMotionGraphics: LLM call                            │
     - If applyMotionGraphics: pass-through                       │
     - If findBroll: LLM candidate selection                      │
     - If applyBroll: mute & set track                            │
     - If applyZooms: LLM call                                    │
     - If applySoundEffects: LLM & tool prep                      │
     - If applyRequestedEdits: LLM plan & tool prep               │
                      │                                           │
                      ▼                                           │
  2. runEditingJob: runtime.execute(stage)                        │
                      │                                           │
                      ▼                                           │
  3. buildStageProject (if decisions > 0) ───────────────────────►│ 4. validateAiPlan
                      │                                           │    applyEditDecisionList
                      │                                           │    setCaptionMotion (if animated)
                      ▼                                           │
  5. validateStageChanges ───────────────────────────────────────►│ 6. Verify visibility,
                      │                                           │    bounds, track lock,
                      │                                           │    & stage-specific edits
                      ▼                                           │
  7. Commit checkpoint to EditorStore                             │
```

---

## 4. Root Cause Analysis: Failures on Short Footage, Missing Speech, and Zero-Decision Edits

### 4.1 Fatal Checkpoints for Supporting Stages

When an AI editing model evaluates footage and determines that no additions are appropriate—for example, when video duration is short (<4s), when dialogue has no emphasis words, or when existing framing should be preserved—it returns `decisions: []` and/or `toolRequests: []`.

Under the current codebase, this causes immediate, catastrophic failures at four distinct levels:

#### Level 1: Client Pre-Execution Guardrails (`sequentialEditClient.ts`)
1. **`planMotionGraphics` (Line 75):**
   ```typescript
   case 'planMotionGraphics': {
     const output = saved || await plan(stage, project, job, signal);
     if (!output.decisions?.length) throw Error('AI did not plan any requested motion graphics.');
     return output;
   }
   ```
   *Impact:* An empty decision list throws an uncaught error and marks `planMotionGraphics` as `failed`.
2. **`applyMotionGraphics` (Line 76):**
   ```typescript
   case 'applyMotionGraphics': {
     const output = job.stages.find(s => s.id === 'planMotionGraphics')?.output;
     if (!output?.decisions?.length) throw Error('Motion graphics plan is missing.');
     return { ...output, summary: 'Apply planned motion graphics' };
   }
   ```
3. **`findBroll` (Line 79):**
   ```typescript
   case 'findBroll': {
     const output = saved || await plan(stage, project, job, signal);
     await checkpoint(output);
     if (!output.decisions?.length && !output.requests?.length) throw Error('No relevant B-roll candidates were found.');
     return prepare(output, project, checkpoint, signal);
   }
   ```
4. **`applyBroll` (Line 83):**
   ```typescript
   case 'applyBroll': {
     const output = job.stages.find(s => s.id === 'findBroll')?.output;
     if (!output?.decisions?.length) throw Error('No selected B-roll is available.');
     return { ...output, summary: 'Insert selected B-roll with original dialogue preserved', decisions: output.decisions.map(...) };
   }
   ```

#### Level 2: Stage Change Validation (`sequentialEdit.ts:110-128`)
Even if client checks pass or are bypassed, `validateStageChanges` enforces mandatory changes per stage:
- **`applyMotionGraphics` (Line 118):**
  `if (stage === 'applyMotionGraphics' && !visible.some(c => (c.graphic || c.shape) && c.keyframes?.length)) throw Error('No visible animated motion graphic was created.');`
- **`applyBroll` (Line 119):**
  `if (stage === 'applyBroll' && !visible.some(c => c.assetId && after.assets[c.assetId] && ['image', 'overlay'].includes(after.tracks[c.trackId].kind) && c.volume === 0)) throw Error('No valid muted B-roll was inserted.');`
- **`applyZooms` (Line 120):**
  `if (stage === 'applyZooms' && !visible.some(c => c.zooms?.length && JSON.stringify(c.zooms) !== JSON.stringify(before.clips[c.id]?.zooms))) throw Error('No zoom keyframes were applied.');`
- **`applySoundEffects` (Line 121):**
  `if (stage === 'applySoundEffects' && !changed.some(c => c.assetId && after.assets[c.assetId]?.kind === 'audio' && c.audioRole === 'sfx' && c.volume > 0 && c.volume <= .35 && !after.tracks[c.trackId].muted && !after.tracks[c.trackId].hidden && c.startTime + c.duration <= projectDuration(before) + .04)) throw Error('No audible, synchronized sound effect was inserted.');`

#### Level 3: Whole-Job Completion Check (`sequentialEdit.ts:129-142`)
In `validateCompletedJob`:
```typescript
if (!job.appliedOperations.length || project.revision <= job.initialRevision) {
  throw Error('No requested edits were committed.');
}
```
In `runEditingJob` (line 178):
```typescript
const changes = !!output.decisions?.length && !['analyzeFootage', 'planMotionGraphics', 'findBroll'].includes(stage.id);
...
if (changes) job.appliedOperations = [...new Set([...job.appliedOperations, stage.key])];
```
*Impact:* If supporting stages legitimately produced 0 additions and only `analyzeFootage` ran (e.g., footage without speech where captions were also skipped), `job.appliedOperations` remains `[]` and `project.revision === job.initialRevision`. The entire job is aborted with `'No requested edits were committed.'`.

### 4.2 Why Failures Specifically Strike Short (<4s) Footage and Missing Speech

1. **Short Footage (<4s):**
   - Zooms require at least 0.4s and at most one per 6s (`assertStagePlan:84`). On a 2-3s clip, an automatic zoom is editorially jarring. A responsible AI plans 0 zooms, but line 120 aborts the job.
   - B-roll clips default to 2–4 seconds (`editorAi.ts:33`). Inserting a 3s B-roll clip over 3s footage completely obscures the primary subject. A responsible AI plans 0 B-roll clips, but line 119 aborts the job.
2. **Missing Speech:**
   - Motion graphics callouts and zooms depend on `speechContext` words (`speechContext.ts`). If footage is non-vocal (music, b-roll, background footage), `speechContext(project)` is empty (`[]`). The AI finds no emphasis words to accentuate, returning 0 decisions. Lines 118, 120, and 121 immediately fail.

### 4.3 Resilience Criteria (Design Doc Section 4.4)

The approved design doc establishes the exact tolerance criteria for supporting preset stages (`applyZooms`, `applyBroll`, `applyMotionGraphics`, `applySoundEffects`):
A supporting stage may complete with 0 decisions IF:
1. `projectDuration(before) < 4.0` seconds, OR
2. `speechContext(before).length === 0` (no spoken emphasis moments), OR
3. Output summary documents an explicit skip rationale (e.g. matching `/preserve|framing|no suitable|no emphasis|no b-roll|no motion|no sound|no addition|skip|not appropriate|unnecessary/i`).

And in `validateCompletedJob`:
The job must succeed cleanly without throwing `'No requested edits were committed.'` if at least one meaningful stage succeeded (e.g. captions or initial analysis) and all completed stages passed validation.

---

## 5. Dynamic Caption Generation in Presets

### 5.1 Configuration & Mechanism

1. **Preset Typography Templates:**
   - `engaging` uses `signature-poppins`
   - `clean` uses `clean-sub`
   - `punchy` uses `signature-poppins`
2. **Execution Flow (`sequentialEditClient.ts:69-74`):**
   ```typescript
   case 'applyCaptions': {
     const footage = analysisFootage(project, job.selection);
     const existing = Object.values(project.clips).filter(c =>
       c.contentId && project.captions[c.contentId] &&
       footage.some(v => c.startTime >= v.startTime - .01 && c.startTime + c.duration <= v.startTime + v.duration + .01)
     );
     if (existing.some(c => project.tracks[c.trackId].locked || project.tracks[c.trackId].hidden)) {
       throw Error('Unlock and show caption tracks before applying captions.');
     }
     const requests = footage.filter(c =>
       !existing.some(cap => cap.startTime < c.startTime + c.duration && cap.startTime + cap.duration > c.startTime)
     ).map(c => ({ type: 'captions' as const, clipId: c.id, templateId: job.captionTemplate }));

     return prepare(
       saved || {
         summary: 'Apply timed speech captions with ' + job.captionTemplate,
         animateCaptions: /animat|engaging|punchy/i.test(job.instructions),
         decisions: existing.length ? [{ op: 'applyCaptionTemplate', clipIds: existing.map(c => c.id), templateId: job.captionTemplate }] : [],
         requests
       },
       project,
       checkpoint,
       signal
     );
   }
   ```
3. **In-Place Restyling vs. Retranscription:**
   - If captions already exist on the footage (`existing.length > 0`), the pipeline executes `applyCaptionTemplate` natively without re-calling Whisper or retranscribing audio.
   - If footage is uncaptioned, `requests` creates a tool request for `/api/transcribe`.
4. **Motion Accentuation:**
   - If instructions contain `animat`, `engaging`, or `punchy`, `animateCaptions: true` is flagged.
   - In `buildStageProject` (`sequentialEdit.ts:105`), newly added or styled captions are animated:
     ```typescript
     if (output.animateCaptions) {
       const ids = Object.values(next.clips).filter(c =>
         c.contentId && next.captions[c.contentId] &&
         (!project.clips[c.id] || validated.list.decisions.some(d => d.op === 'applyCaptionTemplate' && d.clipIds.includes(c.id)))
       ).map(c => c.id);
       if (ids.length) next = setCaptionMotion(next, ids, 'pop');
     }
     ```

---

## 6. Clarification Handling & History Preservation Gap

Section 4.3 of the design doc specifies that ambiguous or conflicting natural language instructions must return clarification questions (`intent.questions`) without crashing the job.

Our code inspection revealed **6 sequential failure points** preventing this from working:

1. **`editorAi.ts:85-91` ignores `intent.questions` in pipeline mode:**
   ```typescript
   if (context.pipelineStage) {
     const validated = validateAiPlan(value, project), ...;
     assertStagePlan(context.pipelineStage, validated.list.decisions, tools, project);
     return { ...validated, toolRequests: tools, catalog, ... };
   }
   // Intent extraction is ONLY called when context.pipelineStage is UNDEFINED:
   const intent = readEditingIntent(value);
   if (intent?.questions.length) return { summary: intent.summary, list: { version: 1, projectId: project.id, baseRevision: project.revision, decisions: [] }, toolRequests: [], catalog };
   ```
   *Fix:* When `context.pipelineStage === 'applyRequestedEdits'`, inspect `readEditingIntent(value)`. If `intent?.questions?.length > 0` and decisions are empty, return `{ summary: intent.summary, questions: intent.questions, list: { version: 1, projectId: project.id, baseRevision: project.revision, decisions: [] }, toolRequests: [] }`.
2. **`sequentialEditClient.ts:88` throws on empty decisions/requests:**
   `if (!output.decisions?.length && !output.requests?.length) throw Error(output.summary || 'AI did not return any actionable requested edits.');`
   *Fix:* Allow empty decisions if `output.questions?.length > 0`.
3. **`validateStageChanges` (`sequentialEdit.ts:113`) throws on unchanged project:**
   `if (custom && JSON.stringify(...) === JSON.stringify(...)) throw Error('Requested edits did not change the timeline.');`
   *Fix:* Do not throw if `output.questions?.length > 0`.
4. **`validateCompletedJob` (`sequentialEdit.ts:140`) throws on empty applied operations:**
   `if (!job.appliedOperations.length || project.revision <= job.initialRevision) throw Error('No requested edits were committed.');`
   *Fix:* If `job.stages.some(s => s.output?.questions?.length > 0)`, accept the clarification turn and return `{ summary: questionsSummary }`.
5. **`runSequentialEdit` `persist()` (`sequentialEditClient.ts:29`) overwrites question summary:**
   `summary: previous.status === 'completed' ? 'All requested stages completed.' : previous.errors.at(-1) || 'Previous edit stopped; committed changes remain.'`
   *Fix:* Check if `previous.stages.some(s => s.output?.questions?.length > 0)` and preserve `previous.stages.find(s => s.output?.questions?.length > 0)?.output?.summary` as the summary in `editingHistory`.
6. **`AiEditingChat.tsx:33` displays generic completion text:**
   `{job.status === 'completed' && <p className="vx-ai-complete">Editing completed. {job.appliedOperations.length} stages changed the timeline. Review the preview, then export your MP4.</p>}`
   *Fix:* If any stage output contains `questions`, display the clarification questions instead of the export prompt.

---

## 7. Testing Infrastructure Survey

### 7.1 Existing Test Architecture

Tests in this codebase do **not** use Jest, Vitest, or Babel. Instead, they use:
- **Test Runner:** Node.js native test runner (`node --test`) with `node:assert/strict`.
- **In-Memory Transpilation:** `typescript.transpileModule` via `node:vm` context.
- **Mock Isolation:** A custom `loader(mocks)` factory that intercepts TypeScript module imports, maps `@/` paths to the project root, and provides mocked Supabase sessions, usage counters, and external HTTP fetches.

### 7.2 Current Verification Commands

We executed the project's build and verification commands:
- **Typecheck:** `npx tsc --noEmit`
  - Result: **0 errors** (Command exited with code 0).
- **Cloudflare Build:** `npm run build:cloudflare` (runs `node scripts/build-cloudflare.mjs`)
  - Result: **Success** (Client bundle, SSR environment, RSC environment, and Worker prebuilt bundle all built in ~15s, exited with code 0).
- **Existing Sequential Edit Tests:** `node --test scripts/test-sequential-edit.mjs`
  - Result: **14/14 tests pass** (644ms).
- **Chat Routing Tests:** `node --test scripts/test-chat-tool-routing.mjs`
  - Result: **14/14 tests pass** (2969ms).
- **E2E Compositor Tests:** `node --test scripts/test-e2e-ai-and-compositor.mjs`
  - Result: **1/1 test passes** (623ms).
- **Error & Recovery Tests:** `node --test scripts/test-e2e-error-and-recovery.mjs`
  - Result: **5/5 tests pass** (548ms).

### 7.3 Status of `scripts/test-custom-ai-editing.mjs`

- **Current Status:** The file does **not** yet exist on disk.
- **Requirement:** Must be authored by the implementation team to satisfy Acceptance Criteria in `ORIGINAL_REQUEST.md` and Section 5 of the design document.

### 7.4 Blueprint for `scripts/test-custom-ai-editing.mjs`

Based on `test-chat-tool-routing.mjs` and `test-sequential-edit.mjs`, the new test script should be structured as follows:

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// 1. Module loader with TypeScript in-memory transpiler & mocks
// 2. Fixture helpers:
//    - Speech context helper with exact timestamps: [ [ "Welcome", 0, 0.8 ], [ "to", 0.8, 1.2 ], [ "our", 1.2, 1.5 ], [ "podcast", 1.5, 2.4 ], ... ]
//    - Video project helper: 20s talking head video, captions, audio tracks
//    - Short project helper: 3s video clip
// 3. Test Cases (all 6 required):
//    Test 1: Natural language podcast edit instruction (captions + zooms + ducking)
//            Verifies composeCaption/applyCaptionTemplate, addZoom on transitions, setAudioDucking
//    Test 2: Section-bounded instruction ("keep first 10 seconds untouched")
//            Verifies no operations have startTime < 10.0
//    Test 3: Negative constraint compliance ("don't touch audio")
//            Verifies no changeTrack muted/volume, no SFX, no audio changes
//    Test 4: Conversational refinement modifying existing elements without duplicate clips/captions
//            Verifies composeCaption / changeClipProperty modifies existing ID without adding new clips
//    Test 5: Clarification return without job failure
//            Verifies intent.questions > 0 succeeds with completed status and question preserved in editingHistory
//    Test 6: Preset resilience on short (<4s) footage
//            Verifies PIPELINE_PRESETS[0] ('engaging') succeeds on 3s clip without stage abortion
```

---

## 8. Summary of Findings & Next Steps

1. **`PIPELINE_PRESETS`** (`engaging`, `clean`, `punchy`) are well-structured, but their execution stages are constrained by legacy zero-addition assertions that crash short or non-vocal projects.
2. **Preset Repair** requires updating `validateStageChanges` and `sequentialEditClient.ts` to allow 0-decision completions on short footage (<4.0s), missing speech, or documented skip rationales, and updating `validateCompletedJob` so legitimate skips do not fail the overall job.
3. **Custom Natural Language Editing** requires updating `createEditingJob` to initialize `requestedEdits` stages directly for custom edits, running `analyzeFootage` locally without wasting an LLM call, extracting clarification questions in `editorAi.ts`, and passing `conversationHistory` through the API route.
4. **Model Architecture** requires configuring Groq `qwen/qwen3.8-27b` as primary and integrating Gemini 3.8 Flash (`gemini-3.8-flash` via `geminiService.ts`) as automatic fallback in `editorProvider.ts` on 429/timeouts/5xx errors.
5. All detailed findings, line numbers, and architectural evidence are compiled into `handoff.md` for seamless continuation by the implementation and testing agents.
