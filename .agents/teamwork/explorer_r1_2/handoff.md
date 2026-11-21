# Handoff Report: R1.2, R1.3, R1.4 Investigation

## 1. Observation

### 1.1 Baseline Test Executions
Running the target test suites directly reproduced the reported failures:

1. **`npm run test:chat-routing`** (`node --test scripts/test-chat-tool-routing.mjs scripts/test-sequential-edit.mjs`):
   - Result: 21 passing, 7 failing out of 28 tests.
   - Failures directly relevant to R1.2, R1.3, R1.4:
     - `scripts/test-chat-tool-routing.mjs:14`: `actual chat client prepares captions against post-trim/cut timing and completes the saved job`
       - Status: `failed` instead of `completed`.
       - Observed requests: `['applyRequestedEdits']` instead of expected `['analyzeFootage', 'applyRequestedEdits']`.
     - `scripts/test-chat-tool-routing.mjs:15`: `a prepared-tool checkpoint resumes without repeating the model call, transcription or timeline cut`
       - Status: `failed` instead of `completed`.
     - `scripts/test-chat-tool-routing.mjs:16`: `text-only and empty projects can use metadata editing without original video`
       - Failure: `assert.ok(Object.values(f.store.getSnapshot().textLayers).some(t=>t.text==='Hello'))` evaluated to `false`.
       - Text layer 'Hello' was added by AI `addText` but deleted during `validateEdit`.
     - `scripts/test-chat-tool-routing.mjs:25`: `ordinary audio-only caption requests use provider analysis and custom tool preparation`
       - Status: `failed` instead of `completed`.
     - `scripts/test-sequential-edit.mjs:47`: `mandatory failure stops; resume after reload does not repeat committed captions or operation keys`
       - Failure: `actual: [ 'applyRequestedEdits' ], expected: [ 'applyZooms' ]`.
     - `scripts/test-sequential-edit.mjs:57`: `zero-operation stages cannot falsely report completion`
       - Failure: `assert(result.errors.at(-1).includes('No zoom'))` evaluated to `false` because stage remained `applyRequestedEdits` instead of expanding to `applyZooms`.
     - *(Note: `scripts/test-sequential-edit.mjs:71` tests legacy unmounted `Workspace.tsx` Inspector component, addressed under R1.5).*

2. **`npm run test:e2e`** (`node --test scripts/test-e2e-ai-and-compositor.mjs scripts/test-e2e-error-and-recovery.mjs`):
   - Result: 3 passing, 3 failing out of 6 tests.
   - Failures:
     - `scripts/test-e2e-error-and-recovery.mjs:100`: `Error & Recovery: Failed AI stage saves committed stages and retry does not duplicate mutations`
       - Failure: `actual: [ 'applyRequestedEdits' ], expected: [ 'applyZooms' ]`.
     - `scripts/test-e2e-error-and-recovery.mjs:214`: `Error & Recovery: Empty AI responses and zero-operation stages throw and never report false success`
       - Failure: `assert.ok(result.errors.some(e => e.includes('No zoom keyframes were applied')))` evaluated to `false` because `applyRequestedEdits` executed instead of `applyZooms`.
     - `scripts/test-e2e-error-and-recovery.mjs:242`: `Error & Recovery: User cancel aborts operation cleanly without corrupted state`
       - Failure: `actual: 'failed', expected: 'cancelled'`. Abort signal on `applyCaptions` was never triggered because the pipeline never expanded from `analyzeFootage` into `applyCaptions`.

### 1.2 Codebase Source Code Observations

1. **`app/lib/editor/sequentialEdit.ts` Lines 252–270 (Text Clip Deletion & In-Place State Mutation)**:
   ```typescript
   const isTextTrack = c.trackId && project.tracks[c.trackId]?.kind === 'text';
   if (isTextTrack && c.contentId && project.textLayers[c.contentId] && !project.captions[c.contentId]) {
    const isStandardLowerThird = c.graphic && GRAPHIC_KINDS.includes(c.graphic.kind);
    if (!isStandardLowerThird) {
     delete project.clips[c.id];
     if (project.tracks[c.trackId]) {
      project.tracks[c.trackId].clipIds = project.tracks[c.trackId].clipIds.filter(id => id !== c.id);
     }
     delete project.textLayers[c.contentId];
     if (!job.degradationNotices) job.degradationNotices = [];
     job.degradationNotices.push({
      stage: 'applyCaptions',
      status: 'skipped',
      reason: 'Blocked arbitrary floating text on text track; only standard lower-third presets and transcript captions are permitted.',
      suggestedAction: 'Spoken dialogue captions are displayed with engaging typography.',
      timestamp: Date.now()
     });
    }
   }
   ```
   - Direct observation: Any clip on a text track lacking `c.graphic` is unconditionally deleted via `delete project.clips[c.id]` and `delete project.textLayers[c.contentId]`. Standard `addText` operations (`operations.ts:79` and `ai.ts:77`) create text layers without `c.graphic` (which is only created by motion graphics presets via `addGraphic`). Manual titles and valid AI text decisions are wiped out.
   - Furthermore, `delete project.clips[c.id]` directly mutates the passed `project` object in place.

2. **`app/lib/editor/sequentialEditClient.ts` Lines 34–45 (Mutation Identity Bypass in `persist`)**:
   ```typescript
   const persist = async (project: EditorProject, job: EditingJob) => {
     ...
     const current = store.getSnapshot();
     ...
     const next = { ...project, editingHistory, editingJob: structuredClone(job) };
     const changed = project.tracks !== current.tracks || project.trackOrder !== current.trackOrder || project.textLayers !== current.textLayers || project.clips !== current.clips || project.captions !== current.captions || project.assets !== current.assets || project.transitions !== current.transitions || project.settings !== current.settings;
     if (changed) store.execute(() => next); else store.checkpoint(() => next);
   };
   ```
   - Direct observation: When `validateCompletedJob(project, job)` runs during `validateEdit`, it receives `store.getSnapshot()`. Because it mutates `project` directly in place without cloning `project.clips`, `project.tracks`, or `project.textLayers`, the expression `project.clips !== current.clips` evaluates to `false` (both references point to the same mutated object).
   - `persist()` then executes `store.checkpoint()` instead of `store.execute()`, failing to record undo history.

3. **`app/lib/editor/sequentialEdit.ts` Lines 82–85 & Lines 389–404 (Stage Expansion Block)**:
   - Line 83 in `stagesFor`:
     ```typescript
     if (operations.includes('requestedEdits')) {
       if (operations.length !== 1) throw Error('Custom requestedEdits must run alone, not mixed with preset stages.');
       return ['analyzeFootage', 'applyRequestedEdits', 'validateEdit'];
     }
     ```
   - Line 89 in `createEditingJob`:
     ```typescript
     stages: stagesFor(preset?.operations || ['requestedEdits']).map(...)
     ```
     When `preset` is undefined (all custom AI edits), initial stages are initialized to `['analyzeFootage', 'applyRequestedEdits', 'validateEdit']`.
   - Line 390 in `runEditingJob`:
     ```typescript
     if (stage.id === 'analyzeFootage') {
       if (!job.stages.some(s => s.id === 'applyRequestedEdits')) {
         ...
         job.stages = stagesFor(operations)...
       }
     }
     ```
     Because `applyRequestedEdits` is present in `job.stages` from initialization, `!job.stages.some(s => s.id === 'applyRequestedEdits')` evaluates to `false`. Stage expansion is **never executed**. Even when `output.operations` returns `['captions', 'zooms']`, the job remains frozen at `['analyzeFootage', 'applyRequestedEdits', 'validateEdit']`.

4. **`app/lib/editor/sequentialEditClient.ts` Lines 77–79 (Bypassing `plan()` in `analyzeFootage`)**:
   ```typescript
   const isCustomRequested = job.stages.some(s => s.id === 'applyRequestedEdits');
   const operations = isCustomRequested ? ['requestedEdits' as const] : (PIPELINE_PRESETS.find(p => p.id === job.presetId)?.operations || (footage.length ? explicitOperations(job.instructions) : undefined));
   const result = operations ? { summary: `...`, operations } : await plan(stage, project, job, signal);
   ```
   - Because `isCustomRequested` is `true`, `operations` is hardcoded to `['requestedEdits']`, bypassing `plan(stage, project, job, signal)`. This prevents the client from sending an HTTP request for `analyzeFootage` to the server/mock provider, failing tests that assert `requests` includes `analyzeFootage`.

5. **`app/lib/editor/inPlaceReconciler.ts` Lines 233 & 319–330 (Reconciler Decision Ordering)**:
   - Line 233: Pauses >0.6s push `{ op: 'rippleCut', ranges: consolidated }` into `reconciledDecisions`.
   - Line 320: Semantic phrase quotes push `{ op: 'addZoom', ... }` into `reconciledDecisions` **after** line 233.
   - Raw input decisions may also contain `rippleCut` ahead of other decisions.
   - There is no final sorting/partitioning to ensure all `rippleCut` decisions are sorted and sequenced at the very end of `reconciledDecisions`.

6. **`scripts/test-chat-tool-routing.mjs` Line 13 (Mock Omission)**:
   ```javascript
   'app/lib/editor/editorCaptionStudio.ts': { loadEditorStudioFonts: async () => {} }
   ```
   - `aiValidation.ts:4` imports `{ readStudioStyle, readStudioData }` from `./editorCaptionStudio`.
   - The test mock in `test-chat-tool-routing.mjs` provided only `loadEditorStudioFonts`, causing `readStudioStyle` to be `undefined` and throwing `TypeError: (0 , editorCaptionStudio_1.readStudioStyle) is not a function` during `aiProjectSnapshot()`.

---

## 2. Logic Chain

### 2.1 Eliminating In-Place State Mutation & Unwarranted Text Deletion (R1.2)
1. **Target**: `app/lib/editor/sequentialEdit.ts` (in `validateCompletedJob`, lines 237–272).
2. **Reasoning**:
   - Before applying any validation modifications (caption preset fallback or text layer removal), `project.clips`, `project.tracks`, `project.textLayers`, and `project.captions` must be cloned into new object references if they have not already been cloned.
   - Clips on `track.kind === 'text'` must NOT be deleted merely because `c.graphic` is missing.
   - AI `addText` operations (created via `addText` op in `job.stages`), manual user titles, text-only projects without video, and clips with standard text placements (especially `placementId === 'lower-third'`) must be preserved.
   - A text clip should only be deleted if it is an unapproved, unanchored floating text layer explicitly flagged as an invalid hallucination (e.g. `(c as any).invalidHallucination`, `(c as any).isHallucination`, or containing explicit hallucination markers while not part of planned `addText` or lower-third placement).
   - Track modifications (`clipIds`) must create a new track object `{ ...track, clipIds: ... }` rather than mutating the array in-place.
3. **Target**: `app/lib/editor/sequentialEditClient.ts` (in `executeStage` -> `case 'validateEdit':`, lines 241–256) and `app/lib/editor/sequentialEdit.ts` (in `runEditingJob`, lines 360–364 & `StageOutput`).
   - `validateEdit` in `sequentialEditClient.ts` should clone `project.clips`, `project.tracks`, `project.textLayers`, and `project.captions` before passing them to `validateCompletedJob`, and return `{ ...result, project: validatedProject }`.
   - In `runEditingJob`, line 362 should check if `output.project` is returned, setting `next = output.project` when present.
   - When `next` is persisted, `project.clips !== current.clips` evaluates to `true`, correctly triggering `store.execute(() => next)`.

### 2.2 Multi-Stage Pipeline Expansion (R1.3)
1. **Target**: `app/lib/editor/sequentialEdit.ts` (`stagesFor` at lines 82–85 and `runEditingJob` at lines 389–404).
2. **Reasoning**:
   - `stagesFor(operations)` must support mixing intermediate stages (`captions`, `motionGraphics`, `broll`, `zooms`, `soundEffects`, `effects`) with `requestedEdits`, ordering `applyRequestedEdits` right before `validateEdit`:
     ```typescript
     export function stagesFor(operations: EditOperation[]): EditStage[] {
       const intermediate: EditStage[] = [
         ...(operations.includes('captions') ? ['applyCaptions' as const] : []),
         ...(operations.includes('motionGraphics') ? ['planMotionGraphics' as const, 'applyMotionGraphics' as const] : []),
         ...(operations.includes('broll') ? ['findBroll' as const, 'applyBroll' as const] : []),
         ...(operations.includes('zooms') ? ['applyZooms' as const] : []),
         ...(operations.includes('soundEffects') ? ['applySoundEffects' as const] : []),
         ...(operations.includes('effects') ? ['applyEffects' as const] : [])
       ];
       const requested = operations.includes('requestedEdits') ? ['applyRequestedEdits' as const] : [];
       return ['analyzeFootage', ...intermediate, ...requested, 'validateEdit'];
     }
     ```
   - In `runEditingJob` under `stage.id === 'analyzeFootage'`:
     Remove the guard `if (!job.stages.some(s => s.id === 'applyRequestedEdits'))`.
     Instead, whenever `output.operations` contains operations (or if preset/configured ops exist), expand `job.stages` dynamically to `stagesFor(operations)`:
     ```typescript
     if (stage.id === 'analyzeFootage') {
       const configuredOps = [...new Set(job.stages.map(s => {
         if (s.id === 'applyCaptions') return 'captions' as const;
         if (s.id === 'planMotionGraphics' || s.id === 'applyMotionGraphics') return 'motionGraphics' as const;
         if (s.id === 'findBroll' || s.id === 'applyBroll') return 'broll' as const;
         if (s.id === 'applyZooms') return 'zooms' as const;
         if (s.id === 'applySoundEffects') return 'soundEffects' as const;
         if (s.id === 'applyEffects') return 'effects' as const;
         return null;
       }).filter((op): op is ('captions' | 'motionGraphics' | 'broll' | 'zooms' | 'soundEffects' | 'effects') => op !== null))];
       const preset = PIPELINE_PRESETS.find(p => p.id === job.presetId);
       let operations: EditOperation[] | undefined;
       if (job.presetId && configuredOps.length > 0) {
         operations = configuredOps;
       } else if (preset?.operations) {
         operations = preset.operations;
       } else if (output.operations && output.operations.length > 0) {
         operations = readRequestedOperations(output.operations);
       }
       if (operations && operations.length > 0) {
         job.stages = stagesFor(operations).map(id => job.stages.find(s => s.id === id) || { id, key: job.id + ':' + id, status: 'pending', attempts: 0 });
         stage = job.stages[index];
       }
     }
     ```
3. **Target**: `app/lib/editor/sequentialEditClient.ts` (lines 77–79).
   - In `case 'analyzeFootage':`:
     Do not automatically force `operations = ['requestedEdits']` simply because `job.stages` initially includes `applyRequestedEdits`. Only use local operations if it matches a preset or if `explicitOperations(job.instructions)` cleanly identifies unambiguous operations. Otherwise, call `await plan(stage, project, job, signal)` so the provider/model can analyze footage and return the planned operations (satisfying tests 14 and 25).
     ```typescript
     const operations = PIPELINE_PRESETS.find(p => p.id === job.presetId)?.operations || (footage.length ? explicitOperations(job.instructions) : undefined);
     const result = operations ? { summary: `Analyzed ...`, operations } : await plan(stage, project, job, signal);
     ```

### 2.3 Reconciler Invariant (R1.4)
1. **Target**: `app/lib/editor/inPlaceReconciler.ts` (before returning in `reconcileEditingDecisions`, lines 337–341).
2. **Reasoning**:
   - Direct quote from requirement: *"Ensure `rippleCut` decisions are sorted and appended at the very end of the reconciled `decisions` array (after `phraseQuotes`/`addZoom`, captions, and B-roll decisions)."*
   - Partition `reconciledDecisions` into `nonRippleCuts` and `rippleCuts`.
   - Sort the ranges inside each `rippleCut` decision in ascending chronological order (`range.start`).
   - Sort the `rippleCut` decisions by their earliest range start time.
   - Recombine with `reconciledDecisions = [...nonRippleCuts, ...rippleCuts]`.
   - Implementation:
     ```typescript
     // Guarantee Reconciler Invariant:
     // rippleCut decisions are sorted and appended at the very end of the reconciled decisions array
     // (after phraseQuotes/addZoom, captions, and B-roll decisions).
     const nonRippleCuts = reconciledDecisions.filter(d => d.op !== 'rippleCut');
     const rippleCuts = reconciledDecisions.filter(d => d.op === 'rippleCut') as Array<Extract<EditDecision, { op: 'rippleCut' }>>;
     rippleCuts.forEach(rc => {
       if (Array.isArray(rc.ranges)) {
         rc.ranges.sort((a, b) => a.start - b.start);
       }
     });
     rippleCuts.sort((a, b) => {
       const aStart = a.ranges?.[0]?.start ?? 0;
       const bStart = b.ranges?.[0]?.start ?? 0;
       return aStart - bStart;
     });
     reconciledDecisions = [...nonRippleCuts, ...rippleCuts];
     ```

### 2.4 Test Suite Alignment (`scripts/test-chat-tool-routing.mjs`)
1. **Target**: `scripts/test-chat-tool-routing.mjs` (line 13).
2. **Reasoning**:
   - The test mock for `'app/lib/editor/editorCaptionStudio.ts'` replaces the entire module with only `{ loadEditorStudioFonts: async () => {} }`.
   - Spreading `...base('app/lib/editor/editorCaptionStudio.ts')` preserves `readStudioStyle` and `readStudioData`, allowing `aiValidation.ts` to run without throwing an unhandled `TypeError`.

---

## 3. Specific Code Changes Required

### 3.1 `app/lib/editor/sequentialEdit.ts`

#### Edit 1: Stage expansion in `stagesFor()` (lines 82–85)
```diff
-export function stagesFor(operations:EditOperation[]):EditStage[]{
- if(operations.includes('requestedEdits')){if(operations.length!==1)throw Error('Custom requestedEdits must run alone, not mixed with preset stages.');return ['analyzeFootage','applyRequestedEdits','validateEdit'];}
- return ['analyzeFootage',...(operations.includes('captions')?['applyCaptions' as const]:[]),...(operations.includes('motionGraphics')?['planMotionGraphics' as const,'applyMotionGraphics' as const]:[]),...(operations.includes('broll')?['findBroll' as const,'applyBroll' as const]:[]),...(operations.includes('zooms')?['applyZooms' as const]:[]),...(operations.includes('soundEffects')?['applySoundEffects' as const]:[]),...(operations.includes('effects')?['applyEffects' as const]:[]),'validateEdit'];
-}
+export function stagesFor(operations:EditOperation[]):EditStage[]{
+ const intermediate: EditStage[] = [
+  ...(operations.includes('captions')?['applyCaptions' as const]:[]),
+  ...(operations.includes('motionGraphics')?['planMotionGraphics' as const,'applyMotionGraphics' as const]:[]),
+  ...(operations.includes('broll')?['findBroll' as const,'applyBroll' as const]:[]),
+  ...(operations.includes('zooms')?['applyZooms' as const]:[]),
+  ...(operations.includes('soundEffects')?['applySoundEffects' as const]:[]),
+  ...(operations.includes('effects')?['applyEffects' as const]:[])
+ ];
+ const requested = operations.includes('requestedEdits')?['applyRequestedEdits' as const]:[];
+ return ['analyzeFootage', ...intermediate, ...requested, 'validateEdit'];
+}
```

#### Edit 2: Preserving text clips and cloning state in `validateCompletedJob()` (lines 237–272)
```diff
  // Strict Caption Template Enforcement & Zero-Hallucinated Text Linting
+ let projectCloned = false;
+ const ensureCloned = () => {
+  if (!projectCloned) {
+   project.clips = { ...project.clips };
+   project.tracks = { ...project.tracks };
+   project.textLayers = { ...project.textLayers };
+   project.captions = { ...project.captions };
+   projectCloned = true;
+  }
+ };
  for (const c of Object.values(project.clips)) {
   const isCaption = (c.trackId && project.tracks[c.trackId]?.kind === 'caption') || (c.contentId && project.captions[c.contentId]);
   if (isCaption && c.contentId && project.captions[c.contentId]) {
    const cap = project.captions[c.contentId];
    const currentTpl = (cap as { templateId?: string }).templateId;
    if (!currentTpl || !isKnownCaptionPreset(currentTpl)) {
+    ensureCloned();
     const fallback: CaptionPresetId = 'study-hormozi-style';
-    (cap as { templateId?: string }).templateId = fallback;
     const ref = referenceCaptionTemplate(fallback) || DEFAULT_CAPTION_TEMPLATES[0];
-    if (ref) {
-     cap.studioStyle = { ...ref.style };
-    }
+    project.captions[c.contentId] = {
+     ...cap,
+     templateId: fallback,
+     studioStyle: ref ? { ...ref.style } : cap.studioStyle
+    };
    }
   }
   const isTextTrack = c.trackId && project.tracks[c.trackId]?.kind === 'text';
   if (isTextTrack && c.contentId && project.textLayers[c.contentId] && !project.captions[c.contentId]) {
-   const isStandardLowerThird = c.graphic && GRAPHIC_KINDS.includes(c.graphic.kind);
-   if (!isStandardLowerThird) {
+   const isStandardLowerThird = (c.graphic && GRAPHIC_KINDS.includes(c.graphic.kind)) || (c as { placementId?: string }).placementId === 'lower-third';
+   const isAiAddText = job.stages.some(s => s.output?.decisions?.some(d => d.op === 'addText'));
+   const isTextOnlyProject = !Object.values(project.clips).some(clip => clip.assetId && project.assets[clip.assetId]?.kind === 'video');
+   const isExplicitHallucination = Boolean((c as { invalidHallucination?: boolean; isHallucination?: boolean }).invalidHallucination || (c as { isHallucination?: boolean }).isHallucination || (project.textLayers[c.contentId] as { invalidHallucination?: boolean })?.invalidHallucination || /hallucinat/i.test(project.textLayers[c.contentId]?.text || ''));
+
+   const shouldRemove = isExplicitHallucination && !isStandardLowerThird && !isAiAddText && !isTextOnlyProject;
+   if (shouldRemove) {
+    ensureCloned();
     delete project.clips[c.id];
     if (project.tracks[c.trackId]) {
-     project.tracks[c.trackId].clipIds = project.tracks[c.trackId].clipIds.filter(id => id !== c.id);
+     project.tracks[c.trackId] = {
+      ...project.tracks[c.trackId],
+      clipIds: project.tracks[c.trackId].clipIds.filter(id => id !== c.id)
+     };
     }
     delete project.textLayers[c.contentId];
     if (!job.degradationNotices) job.degradationNotices = [];
     job.degradationNotices.push({
      stage: 'applyCaptions',
      status: 'skipped',
      reason: 'Blocked arbitrary floating text on text track; only standard lower-third presets and transcript captions are permitted.',
      suggestedAction: 'Spoken dialogue captions are displayed with engaging typography.',
      timestamp: Date.now()
     });
    }
   }
  }
```

#### Edit 3: Supporting `project` on `StageOutput` and applying in `runEditingJob()` (lines 40, 362)
In `StageOutput` interface:
```typescript
export interface StageOutput {
  project?: EditorProject;
  ...
}
```
In `runEditingJob`:
```diff
-   let changes=!!output.decisions?.length&&!['analyzeFootage','planMotionGraphics','findBroll'].includes(stage.id);
-   let next=changes?buildStageProject(base,output):base;
+   let changes=(!!output.decisions?.length&&!['analyzeFootage','planMotionGraphics','findBroll'].includes(stage.id)) || (stage.id === 'validateEdit' && !!output.project);
+   let next=output.project ? output.project : (changes ? buildStageProject(base,output) : base);
```

#### Edit 4: Stage expansion in `analyzeFootage` (lines 389–404)
```diff
    if(stage.id==='analyzeFootage'){
-    if(!job.stages.some(s=>s.id==='applyRequestedEdits')){
      const configuredOps = [...new Set(job.stages.map(s => {
        if (s.id === 'applyCaptions') return 'captions' as const;
        if (s.id === 'planMotionGraphics' || s.id === 'applyMotionGraphics') return 'motionGraphics' as const;
        if (s.id === 'findBroll' || s.id === 'applyBroll') return 'broll' as const;
        if (s.id === 'applyZooms') return 'zooms' as const;
        if (s.id === 'applySoundEffects') return 'soundEffects' as const;
        if (s.id === 'applyEffects') return 'effects' as const;
        return null;
      }).filter((op): op is ('captions' | 'motionGraphics' | 'broll' | 'zooms' | 'soundEffects' | 'effects') => op !== null))];
      const preset=PIPELINE_PRESETS.find(p=>p.id===job.presetId);
-     const operations=(job.presetId && configuredOps.length > 0) ? configuredOps : (preset?.operations||readRequestedOperations(output.operations));
+     let operations: EditOperation[] | undefined;
+     if (job.presetId && configuredOps.length > 0) {
+      operations = configuredOps;
+     } else if (preset?.operations) {
+      operations = preset.operations;
+     } else if (output.operations && output.operations.length > 0) {
+      operations = readRequestedOperations(output.operations);
+     }
+     if (operations && operations.length > 0) {
        job.stages=stagesFor(operations).map(id=>job.stages.find(s=>s.id===id)||{id,key:job.id+':'+id,status:'pending',attempts:0});stage=job.stages[index];
+     }
-    }
    }
```

---

### 3.2 `app/lib/editor/sequentialEditClient.ts`

#### Edit 1: Re-enabling provider `plan()` during `analyzeFootage` (lines 77–79)
```diff
    case 'analyzeFootage':{
     const footage=analysisFootage(project,job.selection);if(!footage.length&&job.presetId)throw Error('Add original footage to the timeline first.');
     if(!frames)await readFrames(project,job.selection);
-    const isCustomRequested=job.stages.some(s=>s.id==='applyRequestedEdits');
-    const operations=isCustomRequested?['requestedEdits' as const]:(PIPELINE_PRESETS.find(p=>p.id===job.presetId)?.operations||(footage.length?explicitOperations(job.instructions):undefined));
+    const operations=PIPELINE_PRESETS.find(p=>p.id===job.presetId)?.operations||(footage.length?explicitOperations(job.instructions):undefined);
     const result=operations?{summary:`Analyzed ${footage.length} source clip(s), ${projectDuration(project).toFixed(2)} seconds, ${frames?.length||0} sampled frames and ${speechContext(project).length} available speech segments. Planned ${operations.join(', ')}.`,operations}:await plan(stage,project,job,signal);
     return {...result,analysis:{duration:projectDuration(project),footageIds:footage.map(c=>c.id),speechSegments:speechContext(project).length,sampledFrames:frames?.length||0,assetIds:Object.keys(project.assets)}};
    }
```

#### Edit 2: Non-destructive validation cloning in `validateEdit` (lines 241–255)
```diff
    case 'validateEdit':{
-    const result=validateCompletedJob(project,job);
+    const validatedProject: EditorProject = {
+     ...project,
+     clips: { ...project.clips },
+     tracks: { ...project.tracks },
+     textLayers: { ...project.textLayers },
+     captions: { ...project.captions }
+    };
+    const result=validateCompletedJob(validatedProject,job);
     // Exercise the same compositor used by preview and offline MP4 export at edited timestamps.
-    await loadEditorStudioFonts(project);await document.fonts.ready;
+    await loadEditorStudioFonts(validatedProject);await document.fonts.ready;
     let decodeError:Error|undefined;
-    const compositor=new Compositor(repository,error=>{decodeError=error;}),canvas=document.createElement('canvas');canvas.width=360;canvas.height=640;
+    const compositor=new Compositor(repository,error=>{decodeError=error;}),canvas=document.createElement('canvas');canvas.width=360;canvas.height=640;
     try{
-     const times=[...new Set(job.stages.flatMap(s=>(s.output?.evidence||[]).flatMap(e=>{const c=project.clips[e.clipId];return c?[c.startTime+Math.min(c.duration/2,.6)]:[];})))];
+     const times=[...new Set(job.stages.flatMap(s=>(s.output?.evidence||[]).flatMap(e=>{const c=validatedProject.clips[e.clipId];return c?[c.startTime+Math.min(c.duration/2,.6)]:[];})))];
      for(const time of times){
-      const deadline=Date.now()+20000;while(!compositor.sync(project,time,false)){signal.throwIfAborted();if(decodeError)throw decodeError;if(Date.now()>deadline)throw Error('Edited media could not be decoded for preview. Retry or relink the asset.');await new Promise(resolve=>setTimeout(resolve,40));}
-      compositor.render(canvas,project,time);
+      const deadline=Date.now()+20000;while(!compositor.sync(validatedProject,time,false)){signal.throwIfAborted();if(decodeError)throw decodeError;if(Date.now()>deadline)throw Error('Edited media could not be decoded for preview. Retry or relink the asset.');await new Promise(resolve=>setTimeout(resolve,40));}
+      compositor.render(canvas,validatedProject,time);
      }
     }finally{compositor.dispose();}
-    return result;
+    return { ...result, project: validatedProject };
    }
```

---

### 3.3 `app/lib/editor/inPlaceReconciler.ts`

#### Edit 1: Reconciler Invariant (lines 337–342)
```diff
+  // Guarantee Reconciler Invariant:
+  // Ensure rippleCut decisions are sorted and appended at the very end of the reconciled decisions array
+  // (after phraseQuotes/addZoom, captions, and B-roll decisions).
+  const nonRippleCuts = reconciledDecisions.filter(d => d.op !== 'rippleCut');
+  const rippleCuts = reconciledDecisions.filter(d => d.op === 'rippleCut') as Array<Extract<EditDecision, { op: 'rippleCut' }>>;
+  rippleCuts.forEach(rc => {
+    if (Array.isArray(rc.ranges)) {
+      rc.ranges.sort((a, b) => a.start - b.start);
+    }
+  });
+  rippleCuts.sort((a, b) => {
+    const aStart = a.ranges?.[0]?.start ?? 0;
+    const bStart = b.ranges?.[0]?.start ?? 0;
+    return aStart - bStart;
+  });
+  reconciledDecisions = [...nonRippleCuts, ...rippleCuts];
+
   return {
     decisions: reconciledDecisions,
     toolRequests: reconciledTools,
     summaryNotes
   };
```

---

### 3.4 `scripts/test-chat-tool-routing.mjs`

#### Edit 1: Preserving `editorCaptionStudio` exports in test mock (line 13)
```diff
   let linkFail=failLink;
+  const captionStudio = base('app/lib/editor/editorCaptionStudio.ts');
   const load=loader({
     'app/lib/supabase.ts':{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'TEST'}}})}}},
     'app/lib/editor/footageFramesClient.ts':{captureFootageEvidence:async()=>({footageFrames:[],fallbackFootageFrames:[]})},
     'app/lib/assets/client.ts':{linkAsset:async()=>{links++;if(linkFail){linkFail=false;throw Error('Temporary link failure');}}},
     'app/lib/editor/recovery.ts':{saveCheckpoint:async()=>{}},
-    'app/lib/editor/editorCaptionStudio.ts':{loadEditorStudioFonts:async()=>{}},
+    'app/lib/editor/editorCaptionStudio.ts':{...captionStudio,loadEditorStudioFonts:async()=>{}},
     'app/lib/editor/compositor.ts':{Compositor:class{sync(){return true;}render(){}dispose(){}}},
```

---

## 4. Caveats

1. **R1.5 Legacy Inspector Assertion**: In `scripts/test-sequential-edit.mjs:71`, the test fails because it checks `assert(source.includes('!aiMode&&<Inspector/>'))` on `Workspace.tsx`. This test assertion belongs to R1.5 (Test DOM Alignment with `AssetDrawer.tsx`) and is not an issue in `sequentialEdit.ts` or `inPlaceReconciler.ts`.
2. **Read-Only Investigation Compliance**: No source code files in `app/` or `scripts/` have been directly modified during this Explorer phase. All proof of concept implementations and reproductions were verified inside `.agents/teamwork/explorer_r1_2/` via isolated probe scripts (`test_all_probe.mjs`, `test_seq_probe.mjs`, `test_e2e_probe.mjs`, `test_reconciler_probe.mjs`).

---

## 5. Conclusion

1. **R1.2**: Resolved by preventing text clip deletion unless explicitly flagged as a hallucination, and cloning `clips`, `tracks`, `textLayers`, and `captions` before validation mutations so `project.clips !== current.clips` evaluates to `true` in `persist()`, properly calling `store.execute()`.
2. **R1.3**: Resolved by allowing intermediate stages to precede `applyRequestedEdits` in `stagesFor()`, eliminating the blocking `applyRequestedEdits` check in `analyzeFootage`, and enabling AI provider planning in `sequentialEditClient.ts` during `analyzeFootage`.
3. **R1.4**: Resolved by sorting all `rippleCut` ranges chronologically and sequencing all `rippleCut` decisions at the very end of `reconciledDecisions` in `inPlaceReconciler.ts`.
4. Applying these 4 localized changes will make `test-chat-tool-routing.mjs` pass 100% (14/14) and `test-e2e-error-and-recovery.mjs` pass 100% (5/5).

---

## 6. Verification Method

To verify these changes independently after implementation:

1. **Run Chat Routing Tests**:
   ```bash
   node --test scripts/test-chat-tool-routing.mjs
   ```
   *Expected outcome*: 14/14 tests pass. Specifically verifies tests 14, 15, 16, and 25.

2. **Run E2E Error & Recovery Tests**:
   ```bash
   node --test scripts/test-e2e-error-and-recovery.mjs
   ```
   *Expected outcome*: 5/5 tests pass. Specifically verifies retry without duplicate mutations, zero-operation rejection, and user cancel.

3. **Run Reconciler Invariant Tests**:
   ```bash
   node --test scripts/test-in-place-reconciler.mjs
   ```
   *Expected outcome*: All tests pass; verify `rippleCut` decisions remain last after `addZoom` and `broll`.

4. **Run TypeScript Check**:
   ```bash
   npx tsc --noEmit
   ```
   *Expected outcome*: 0 errors in affected files.
