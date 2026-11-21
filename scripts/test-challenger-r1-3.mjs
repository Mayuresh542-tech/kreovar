import assert from "node:assert/strict";
import { test, describe } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modRequire = createRequire(path.join(root, "package.json"));
const ts = modRequire("typescript");

function createModuleLoader(mocks = {}) {
  const defaultMocks = {
    "app/lib/server/planUsage.ts": {
      withUsage: (h) => h,
      reserveUsage: async () => ({ reservationId: "test-usage" }),
      finishUsage: async () => {}
    },
    "app/lib/supabase.ts": {
      supabase: { auth: { getSession: async () => ({ data: { session: null } }) } }
    },
    ...mocks
  };

  const cache = new Map();
  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) filename += ".ts";
    const key = path.relative(root, filename).replaceAll("\\", "/");
    if (Object.hasOwn(defaultMocks, key)) return defaultMocks[key];
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule);
    const source = ts
      .transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
      })
      .outputText.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(filename).href));
    const localRequire = (specifier) =>
      specifier.startsWith("@/")
        ? load(specifier.slice(2))
        : specifier.startsWith(".")
        ? load(path.relative(root, path.resolve(path.dirname(filename), specifier)))
        : modRequire(specifier);
    new vm.Script(`(function(require,module,exports){${source}\n})`, { filename }).runInThisContext()(
      localRequire,
      loadedModule,
      loadedModule.exports
    );
    return loadedModule.exports;
  }
  return load;
}

const load = createModuleLoader();
const model = load("app/lib/editor/model.ts");
const ops = load("app/lib/editor/operations.ts");
const storeMod = load("app/lib/editor/store.ts");
const pipeline = load("app/lib/editor/sequentialEdit.ts");
const reconciler = load("app/lib/editor/inPlaceReconciler.ts");

function deepFreeze(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze(obj[key]);
  }
  return obj;
}

function createBaseVideoProject() {
  let p = model.createProject("challenger-video-project");
  p = ops.addAsset(p, {
    id: "footage-asset",
    kind: "video",
    name: "Footage.mp4",
    duration: 15,
    width: 1080,
    height: 1920,
    mime: "video/mp4",
    size: 5000,
    url: "/test/footage.mp4"
  });
  p = ops.addClip(p, "footage-asset", "track-video", 0, { id: "clip-footage", duration: 15, sourceEnd: 15 });
  return p;
}

describe("Adversarial Stress Suite R1.3 — Item 1: In-Place Mutation Elimination & Store Clone Trigger", () => {
  test("1.1 Deeply frozen project with invalid caption template does not throw and caller snapshot is untouched", () => {
    let p = createBaseVideoProject();
    p = ops.addCaption(p, "Speech caption", 0, 5);
    const capId = Object.keys(p.captions)[0];
    p = {
      ...p,
      captions: {
        ...p.captions,
        [capId]: {
          ...p.captions[capId],
          templateId: "unknown-corrupt-template"
        }
      }
    };
    const job = pipeline.createEditingJob(p, "Add captions", []);
    job.appliedOperations = ["applyCaptions"];
    job.stages.forEach((s) => {
      s.status = "completed";
    });
    job.initialRevision = p.revision - 1;

    // Deep freeze all project branches recursively
    deepFreeze(p);

    // Caller snapshot before validation
    const originalClips = p.clips;
    const originalCaptions = p.captions;
    const originalTracks = p.tracks;

    let valResult;
    assert.doesNotThrow(() => {
      valResult = pipeline.validateCompletedJob(p, job);
    }, "validateCompletedJob must not throw when validating deeply frozen project");

    assert.ok(valResult.project, "Validated project must be returned when fallback occurs");
    assert.notStrictEqual(valResult.project, p, "Validated project must be a fresh clone");
    assert.notStrictEqual(valResult.project.captions, originalCaptions, "Captions dictionary must be cloned");

    // Verify caller references were never touched
    assert.strictEqual(p.clips, originalClips, "Original clips reference remains unchanged");
    assert.strictEqual(p.captions, originalCaptions, "Original captions reference remains unchanged");
    assert.strictEqual(p.tracks, originalTracks, "Original tracks reference remains unchanged");
    assert.strictEqual(
      p.captions[capId].templateId,
      "unknown-corrupt-template",
      "Original caption templateId was not mutated in place"
    );

    // Verify cloned project received the sanitized template
    assert.strictEqual(
      valResult.project.captions[capId].templateId,
      "study-hormozi-style",
      "Cloned project received fallback caption template"
    );
  });

  test("1.2 Deeply frozen project with explicit hallucination deletes text cleanly from clone without mutating input", () => {
    let p = createBaseVideoProject();
    p = ops.addText(p, "This is a hallucination summary text", 0, {}, false, 4);
    const textClip = Object.values(p.clips).find((c) => p.tracks[c.trackId]?.kind === "text");
    assert.ok(textClip, "Text clip was created");

    // Mark as explicit hallucination
    p = {
      ...p,
      clips: {
        ...p.clips,
        [textClip.id]: {
          ...p.clips[textClip.id],
          invalidHallucination: true
        }
      }
    };

    const job = pipeline.createEditingJob(p, "Validate edit", []);
    job.appliedOperations = ["applyCaptions"];
    job.stages.forEach((s) => {
      s.status = "completed";
    });
    job.initialRevision = p.revision - 1;

    deepFreeze(p);

    let valResult;
    assert.doesNotThrow(() => {
      valResult = pipeline.validateCompletedJob(p, job);
    }, "validateCompletedJob must not throw when deleting from frozen project");

    assert.ok(valResult.project, "Cloned project must be returned after hallucination removal");
    assert.strictEqual(p.clips[textClip.id] !== undefined, true, "Original frozen project retains clip untouched");
    assert.strictEqual(
      valResult.project.clips[textClip.id],
      undefined,
      "Cloned project has hallucinated clip removed"
    );
  });

  test("1.3 Valid project with no adjustments returns clean summary without redundant project clone", () => {
    let p = createBaseVideoProject();
    p = ops.addCaption(p, "Standard caption", 0, 5);
    const capId = Object.keys(p.captions)[0];
    p = {
      ...p,
      captions: {
        ...p.captions,
        [capId]: {
          ...p.captions[capId],
          templateId: "study-hormozi-style"
        }
      }
    };
    const job = pipeline.createEditingJob(p, "Add captions", []);
    job.appliedOperations = ["applyCaptions"];
    job.stages.forEach((s) => {
      s.status = "completed";
    });
    job.initialRevision = p.revision - 1;

    deepFreeze(p);

    const valResult = pipeline.validateCompletedJob(p, job);
    assert.strictEqual(
      valResult.project,
      undefined,
      "When no adjustments occur, validateCompletedJob does not return a redundant clone"
    );
    assert.match(valResult.summary, /All requested stages validated/);
  });

  test("1.4 Store persist dirty-check triggers store.execute when adjustments occur and updates revision", () => {
    let p = createBaseVideoProject();
    p = ops.addCaption(p, "Speech caption", 0, 4, "non-standard-caption-template");
    const store = new storeMod.EditorStore(p);
    const snapshot = store.getSnapshot();

    const job = pipeline.createEditingJob(snapshot, "Add captions", []);
    job.appliedOperations = ["applyCaptions"];
    job.stages.forEach((s) => {
      s.status = "completed";
    });
    job.initialRevision = snapshot.revision - 1;

    const valResult = pipeline.validateCompletedJob(snapshot, job);
    const validatedProject = valResult.project || snapshot;
    const current = store.getSnapshot();

    // Verify dirty check as written in sequentialEditClient.ts
    const changed =
      validatedProject.tracks !== current.tracks ||
      validatedProject.trackOrder !== current.trackOrder ||
      validatedProject.textLayers !== current.textLayers ||
      validatedProject.clips !== current.clips ||
      validatedProject.captions !== current.captions ||
      validatedProject.assets !== current.assets ||
      validatedProject.transitions !== current.transitions ||
      validatedProject.settings !== current.settings;

    assert.strictEqual(changed, true, "Cloned project triggers changed === true");

    // Execute store update using validatedProject
    store.execute(() => validatedProject);
    const postExecSnapshot = store.getSnapshot();
    assert.strictEqual(postExecSnapshot.revision, snapshot.revision + 1, "Revision incremented by store.execute");
    assert.strictEqual(store.canUndo, true, "Store recorded an undoable step in past");
  });

  test("1.5 Compound validation: simultaneous caption fallback and hallucination removal on frozen project", () => {
    let p = createBaseVideoProject();
    p = ops.addCaption(p, "Speech caption", 0, 5);
    const capId = Object.keys(p.captions)[0];
    p = {
      ...p,
      captions: {
        ...p.captions,
        [capId]: {
          ...p.captions[capId],
          templateId: "corrupt-cap-tpl"
        }
      }
    };

    p = ops.addText(p, "Unwanted AI hallucination", 0, {}, false, 4);
    const textClip = Object.values(p.clips).find((c) => p.tracks[c.trackId]?.kind === "text");
    assert.ok(textClip, "Text clip was created");

    p = {
      ...p,
      clips: {
        ...p.clips,
        [textClip.id]: {
          ...p.clips[textClip.id],
          invalidHallucination: true
        }
      }
    };

    const job = pipeline.createEditingJob(p, "Validate compound edit", []);
    job.appliedOperations = ["applyCaptions"];
    job.stages.forEach((s) => {
      s.status = "completed";
    });
    job.initialRevision = p.revision - 1;

    deepFreeze(p);

    let valResult;
    assert.doesNotThrow(() => {
      valResult = pipeline.validateCompletedJob(p, job);
    });

    assert.ok(valResult.project, "Cloned project returned");
    // Verify caller snapshot is 100% unchanged
    assert.strictEqual(p.captions[capId].templateId, "corrupt-cap-tpl");
    assert.ok(p.clips[textClip.id]);

    // Verify cloned project has both adjustments
    assert.strictEqual(valResult.project.captions[capId].templateId, "study-hormozi-style");
    assert.strictEqual(valResult.project.clips[textClip.id], undefined);
  });
});

describe("Adversarial Stress Suite R1.3 — Item 2: Text Decision Retention & Precision Hallucination Filtering", () => {
  test("2.1 validateCompletedJob preserves diverse manual text styles and callouts lacking c.graphic", () => {
    let p = createBaseVideoProject();
    // 1. Manual title clip
    p = ops.addText(p, "EPISODE 42: THE DEEP DIVE", 0, {}, false, 4);
    // 2. Manual lower-third text
    p = ops.addText(p, "Chief Technology Officer", 2, {}, false, 3);
    const textClips = Object.values(p.clips).filter((c) => p.tracks[c.trackId]?.kind === "text");
    assert.strictEqual(textClips.length, 2, "Two text clips created");

    // Assign placementId on second clip
    p = {
      ...p,
      clips: {
        ...p.clips,
        [textClips[1].id]: {
          ...p.clips[textClips[1].id],
          placementId: "lower-third"
        }
      }
    };

    // Neither has c.graphic
    assert.strictEqual(p.clips[textClips[0].id].graphic, undefined);
    assert.strictEqual(p.clips[textClips[1].id].graphic, undefined);

    const job = pipeline.createEditingJob(p, "Add captions", []);
    job.appliedOperations = ["applyCaptions"];
    job.stages.forEach((s) => {
      s.status = "completed";
    });
    job.initialRevision = p.revision - 1;

    const valResult = pipeline.validateCompletedJob(p, job);
    const finalProj = valResult.project || p;

    assert.ok(finalProj.clips[textClips[0].id], "Manual title without graphic must be preserved");
    assert.ok(finalProj.clips[textClips[1].id], "Manual lower-third text must be preserved");
  });

  test("2.2 validateCompletedJob preserves text in text-only projects even without graphic or standard placement", () => {
    // Project with NO video footage (text-only motion graphics project)
    let p = model.createProject("text-only-project");
    p = ops.addText(p, "STANDBY FOR BROADCAST", 0, {}, false, 10);
    const titleClip = Object.values(p.clips).find((c) => p.tracks[c.trackId]?.kind === "text");
    assert.ok(titleClip, "Text clip was created");

    const job = pipeline.createEditingJob(p, "Add text animation", []);
    job.appliedOperations = ["applyRequestedEdits"];
    job.stages.forEach((s) => {
      s.status = "completed";
    });
    job.initialRevision = p.revision - 1;

    const valResult = pipeline.validateCompletedJob(p, job);
    const finalProj = valResult.project || p;

    assert.ok(finalProj.clips[titleClip.id], "Text-only project clips must be preserved");
  });

  test("2.3 reconcileEditingDecisions preserves title, callout, header and only drops invalidHallucination: true", () => {
    const p = createBaseVideoProject();
    const decisions = [
      { op: "addText", text: "Main Title", placementId: "title", trackId: "track-text", startTime: 0, duration: 4 },
      { op: "addText", text: "Speaker Bio", placementId: "lower-third", trackId: "track-text", startTime: 2, duration: 3 },
      { op: "addText", text: "Key Takeaway", placementId: "callout", trackId: "track-text", startTime: 5, duration: 2 },
      { op: "addText", text: "Custom Subheading", placementId: "custom", trackId: "track-text", startTime: 7, duration: 2 },
      {
        op: "addText",
        text: "Hallucinated Unwanted Text",
        placementId: "floating",
        trackId: "track-text",
        startTime: 9,
        duration: 2,
        invalidHallucination: true
      }
    ];

    const result = reconciler.reconcileEditingDecisions(p, decisions);
    const retainedTextOps = result.decisions.filter((d) => d.op === "addText");

    assert.strictEqual(retainedTextOps.length, 4, "4 legitimate text decisions retained, 1 hallucination dropped");
    assert.deepStrictEqual(
      retainedTextOps.map((d) => d.placementId),
      ["title", "lower-third", "callout", "custom"],
      "Title, lower-third, callout, and custom placements all retained"
    );
  });

  test("2.4 Lower-third text with hallucination keyword in text body is preserved under guardrail", () => {
    let p = createBaseVideoProject();
    p = ops.addText(p, "Topic: Understanding AI Hallucination", 0, {}, false, 4);
    const textClip = Object.values(p.clips).find((c) => p.tracks[c.trackId]?.kind === "text");
    assert.ok(textClip, "Text clip was created");

    // Standard lower-third placement
    p = {
      ...p,
      clips: {
        ...p.clips,
        [textClip.id]: {
          ...p.clips[textClip.id],
          placementId: "lower-third"
        }
      }
    };

    const job = pipeline.createEditingJob(p, "Add captions", []);
    job.appliedOperations = ["applyCaptions"];
    job.stages.forEach((s) => {
      s.status = "completed";
    });
    job.initialRevision = p.revision - 1;

    deepFreeze(p);

    const valResult = pipeline.validateCompletedJob(p, job);
    const finalProj = valResult.project || p;

    // Standard lower-third is preserved even when text mentions hallucination
    assert.ok(finalProj.clips[textClip.id], "Standard lower third discussing hallucination must NOT be removed");
  });
});

describe("Adversarial Stress Suite R1.3 — Item 3: Multi-Stage Pipeline Expansion on Mixed Operations", () => {
  test("3.1 readRequestedOperations accepts complex combinations of intermediate stages + requestedEdits", () => {
    const combinations = [
      ["captions", "requestedEdits"],
      ["captions", "zooms", "requestedEdits"],
      ["broll", "zooms", "requestedEdits"],
      ["captions", "motionGraphics", "broll", "zooms", "soundEffects", "effects", "requestedEdits"]
    ];

    for (const combo of combinations) {
      assert.doesNotThrow(() => {
        const parsed = pipeline.readRequestedOperations(combo);
        assert.deepStrictEqual(parsed, combo);
      }, `Must not throw for combination: ${combo.join(", ")}`);
    }
  });

  test("3.2 stagesFor strictly places intermediate stages before applyRequestedEdits and validateEdit last", () => {
    const fullOps = ["captions", "motionGraphics", "broll", "zooms", "soundEffects", "effects", "requestedEdits"];
    const stages = pipeline.stagesFor(fullOps);

    assert.strictEqual(stages[0], "analyzeFootage", "analyzeFootage is always first");
    assert.strictEqual(stages[stages.length - 1], "validateEdit", "validateEdit is always last");
    assert.strictEqual(stages[stages.length - 2], "applyRequestedEdits", "applyRequestedEdits is right before validateEdit");

    // Intermediate order check
    const intermediateOrder = [
      "applyCaptions",
      "planMotionGraphics",
      "applyMotionGraphics",
      "findBroll",
      "applyBroll",
      "applyZooms",
      "applySoundEffects",
      "applyEffects"
    ];

    let lastIdx = -1;
    for (const stageName of intermediateOrder) {
      const idx = stages.indexOf(stageName);
      assert.ok(idx > lastIdx, `${stageName} must appear in expected sequential pipeline order`);
      lastIdx = idx;
    }
  });

  test("3.3 readRequestedOperations rejects invalid operations, empty arrays, or duplicates", () => {
    assert.throws(() => pipeline.readRequestedOperations([]), /AI could not identify supported editing operations/);
    assert.throws(() => pipeline.readRequestedOperations(["unknownStage"]), /AI could not identify supported editing operations/);
    assert.throws(() => pipeline.readRequestedOperations(["captions", "captions"]), /AI could not identify supported editing operations/);
    assert.throws(() => pipeline.readRequestedOperations("not-an-array"), /AI could not identify supported editing operations/);
  });

  test("3.4 runEditingJob dynamically expands stages when analyzeFootage returns mixed operations", async () => {
    const p = createBaseVideoProject();
    const executedStages = [];
    let currentProject = p;
    const currentJob = pipeline.createEditingJob(p, "add captions, subtle zooms and custom trim", []);

    // Initial stages for job with requestedEdits alone:
    assert.deepStrictEqual(
      currentJob.stages.map((s) => s.id),
      ["analyzeFootage", "applyRequestedEdits", "validateEdit"]
    );

    const runtime = {
      getProject: () => currentProject,
      interacting: () => false,
      persist: async (next, job) => {
        job.timelineRevision = currentProject.revision + 1;
        currentProject = { ...next, revision: job.timelineRevision, editingJob: structuredClone(job) };
      },
      execute: async (stage, proj, job) => {
        executedStages.push(stage);
        if (stage === "analyzeFootage") {
          return {
            summary: "Analyzed video footage",
            operations: ["captions", "zooms", "requestedEdits"]
          };
        }
        if (stage === "applyCaptions") {
          return {
            summary: "Added captions",
            decisions: [
              {
                op: "addCaption",
                text: "Real spoken words",
                startTime: 1,
                duration: 2,
                templateId: "study-hormozi-style",
                words: [
                  { word: "Real", start: 0, end: 0.7 },
                  { word: "spoken", start: 0.7, end: 1.2 },
                  { word: "words", start: 1.2, end: 2 }
                ]
              }
            ]
          };
        }
        if (stage === "applyZooms") {
          return {
            summary: "Added subtle zoom",
            decisions: [
              { op: "addZoom", clipId: "clip-footage", startTime: 1, endTime: 2, fromScale: 1, toScale: 1.1, returnToStart: true, easing: "smooth" }
            ]
          };
        }
        if (stage === "applyRequestedEdits") {
          return {
            summary: "Custom edits applied",
            decisions: [
              { op: "setAudioDucking", enabled: true }
            ]
          };
        }
        if (stage === "validateEdit") {
          return pipeline.validateCompletedJob(proj, job);
        }
        throw new Error(`Unexpected stage: ${stage}`);
      }
    };

    const abortController = new AbortController();
    const result = await pipeline.runEditingJob(runtime, currentJob, abortController.signal);

    // Verify dynamic expansion occurred
    assert.deepStrictEqual(
      executedStages,
      ["analyzeFootage", "applyCaptions", "applyZooms", "applyRequestedEdits", "validateEdit"],
      "All dynamically expanded stages executed in strict pipeline order"
    );

    assert.strictEqual(result.status, "completed");
    assert.deepStrictEqual(
      result.stages.map((s) => s.id),
      ["analyzeFootage", "applyCaptions", "applyZooms", "applyRequestedEdits", "validateEdit"]
    );
  });
});

describe("Adversarial Stress Suite R1.3 — Item 4: Atomic Rollback Across Checkpoints & History Integrity", () => {
  test("4.1 rollbackToRevision restores pre-turn state across 4 intermediate checkpoints and multiple executes", () => {
    const p = createBaseVideoProject();
    const store = new storeMod.EditorStore(p);

    // 1. User performs manual edits before AI turn
    store.execute((proj) => ({ ...proj, settings: { ...proj.settings, title: "Pre-Turn Manual Title" } }));
    store.execute((proj) => ({ ...proj, settings: { ...proj.settings, author: "Original Creator" } }));
    const preTurnRevision = store.getSnapshot().revision;
    assert.strictEqual(store.getSnapshot().settings.title, "Pre-Turn Manual Title");
    assert.strictEqual(store.getSnapshot().settings.author, "Original Creator");
    const preTurnPastLength = store.past.length;

    // 2. Multi-stage AI turn with interleaved checkpoints
    // Stage 1 planning checkpoint
    store.checkpoint((proj) => ({ ...proj, editingJob: { id: "job-101", currentStage: "analyzeFootage" } }));
    // Stage 1 execute captions
    store.execute((proj) => ({
      ...proj,
      clips: { ...proj.clips, ai_caption: { id: "ai_caption", trackId: "track-captions" } }
    }));

    // Stage 2 planning checkpoint
    store.checkpoint((proj) => ({ ...proj, editingJob: { id: "job-101", currentStage: "applyZooms" } }));
    // Stage 2 execute zooms
    store.execute((proj) => ({
      ...proj,
      clips: { ...proj.clips, ai_zoom: { id: "ai_zoom", trackId: "track-video" } }
    }));

    // Stage 3 planning checkpoint
    store.checkpoint((proj) => ({ ...proj, editingJob: { id: "job-101", currentStage: "findBroll" } }));
    // Stage 3 execute broll
    store.execute((proj) => ({
      ...proj,
      clips: { ...proj.clips, ai_broll: { id: "ai_broll", trackId: "track-overlay" } }
    }));

    // Final stage checkpoint
    store.checkpoint((proj) => ({ ...proj, editingJob: { id: "job-101", currentStage: "validateEdit" } }));

    const postTurnRevision = store.getSnapshot().revision;
    assert.ok(postTurnRevision > preTurnRevision + 4, "Revision advanced across multiple stages and checkpoints");
    assert.ok(store.getSnapshot().clips["ai_caption"]);
    assert.ok(store.getSnapshot().clips["ai_zoom"]);
    assert.ok(store.getSnapshot().clips["ai_broll"]);

    // 3. Rollback atomically to preTurnRevision
    const rollbackSuccess = store.rollbackToRevision(preTurnRevision);
    assert.strictEqual(rollbackSuccess, true, "rollbackToRevision must return true");

    const rolledBackSnapshot = store.getSnapshot();
    // Timeline state restored
    assert.strictEqual(rolledBackSnapshot.clips["ai_caption"], undefined, "AI caption clip rolled back");
    assert.strictEqual(rolledBackSnapshot.clips["ai_zoom"], undefined, "AI zoom clip rolled back");
    assert.strictEqual(rolledBackSnapshot.clips["ai_broll"], undefined, "AI broll clip rolled back");

    // Pre-turn user edits preserved
    assert.strictEqual(rolledBackSnapshot.settings.title, "Pre-Turn Manual Title");
    assert.strictEqual(rolledBackSnapshot.settings.author, "Original Creator");

    // User undo history is NOT drained
    assert.strictEqual(store.past.length, preTurnPastLength, "User undo history preserved exactly");

    // User can still undo their own manual edits one by one
    store.undo();
    assert.strictEqual(store.getSnapshot().settings.author, undefined, "Undo reverts manual edit 2");
    assert.strictEqual(store.getSnapshot().settings.title, "Pre-Turn Manual Title", "Manual edit 1 still present");

    store.undo();
    assert.strictEqual(store.getSnapshot().settings.title, undefined, "Undo reverts manual edit 1");
  });

  test("4.2 rollbackToRevision handles two consecutive AI jobs with selective rollback", () => {
    const p = createBaseVideoProject();
    const store = new storeMod.EditorStore(p);

    store.execute((proj) => ({ ...proj, settings: { ...proj.settings, title: "Base Project" } }));
    const baseRevision = store.getSnapshot().revision;

    // AI Job 1
    store.checkpoint((proj) => ({ ...proj, editingJob: { id: "job-1", currentStage: "applyCaptions" } }));
    store.execute((proj) => ({ ...proj, clips: { ...proj.clips, job1_clip: { id: "job1_clip" } } }));
    const job1EndRevision = store.getSnapshot().revision;

    // AI Job 2
    store.checkpoint((proj) => ({ ...proj, editingJob: { id: "job-2", currentStage: "applyZooms" } }));
    store.execute((proj) => ({ ...proj, clips: { ...proj.clips, job2_clip: { id: "job2_clip" } } }));

    assert.ok(store.getSnapshot().clips["job1_clip"]);
    assert.ok(store.getSnapshot().clips["job2_clip"]);

    // Rollback Job 2 only (to job1EndRevision)
    const rbJob2 = store.rollbackToRevision(job1EndRevision);
    assert.strictEqual(rbJob2, true);
    assert.ok(store.getSnapshot().clips["job1_clip"], "Job 1 clip remains intact");
    assert.strictEqual(store.getSnapshot().clips["job2_clip"], undefined, "Job 2 clip rolled back");

    // Now Rollback Job 1 (to baseRevision)
    const rbJob1 = store.rollbackToRevision(baseRevision);
    assert.strictEqual(rbJob1, true);
    assert.strictEqual(store.getSnapshot().clips["job1_clip"], undefined, "Job 1 clip rolled back");
    assert.strictEqual(store.getSnapshot().settings.title, "Base Project", "Base project restored");
  });

  test("4.3 rollbackToRevision edge cases: targetRevision === currentRevision, empty past, only checkpoints", () => {
    const p = createBaseVideoProject();
    const store = new storeMod.EditorStore(p);

    // Target === current
    assert.strictEqual(store.rollbackToRevision(p.revision), true, "Target === current returns true");

    // Empty past with non-matching target
    assert.strictEqual(store.rollbackToRevision(999), false, "Non-matching target with empty past returns false");

    // Only checkpoints happened (e.g. cancelled during planning before any execute)
    store.checkpoint((proj) => ({ ...proj, settings: { ...proj.settings, title: "Checkpointed" } }));
    store.checkpoint((proj) => ({ ...proj, settings: { ...proj.settings, title: "Checkpointed 2" } }));

    // Target is initial revision 0
    assert.strictEqual(store.rollbackToRevision(0), false, "When past is empty, rollback returns false");
  });

  test("4.4 rollbackToRevision preserves history integrity across subsequent branching manual edits", () => {
    const p = createBaseVideoProject();
    const store = new storeMod.EditorStore(p);

    // 10 manual user edits
    for (let i = 1; i <= 10; i++) {
      store.execute((proj) => ({ ...proj, settings: { ...proj.settings, [`key_${i}`]: i } }));
    }
    const preTurnRevision = store.getSnapshot().revision;
    assert.strictEqual(preTurnRevision, 10);
    assert.strictEqual(store.past.length, 10);

    // AI job commits 3 stages with checkpoints
    for (let s = 1; s <= 3; s++) {
      store.checkpoint((proj) => ({ ...proj, editingJob: { id: "job-ai", currentStage: `stage-${s}` } }));
      store.execute((proj) => ({ ...proj, clips: { ...proj.clips, [`ai_clip_${s}`]: { id: `ai_clip_${s}` } } }));
    }

    assert.strictEqual(store.getSnapshot().clips["ai_clip_1"] !== undefined, true);
    assert.strictEqual(store.getSnapshot().clips["ai_clip_2"] !== undefined, true);
    assert.strictEqual(store.getSnapshot().clips["ai_clip_3"] !== undefined, true);

    // Rollback to preTurnRevision
    const rb = store.rollbackToRevision(preTurnRevision);
    assert.strictEqual(rb, true);

    // AI edits removed
    assert.strictEqual(store.getSnapshot().clips["ai_clip_1"], undefined);
    assert.strictEqual(store.getSnapshot().clips["ai_clip_2"], undefined);
    assert.strictEqual(store.getSnapshot().clips["ai_clip_3"], undefined);

    // User edits 1-10 present
    for (let i = 1; i <= 10; i++) {
      assert.strictEqual(store.getSnapshot().settings[`key_${i}`], i);
    }
    assert.strictEqual(store.past.length, 10);

    // Perform new manual edit after rollback
    store.execute((proj) => ({ ...proj, settings: { ...proj.settings, branching_edit: true } }));
    assert.strictEqual(store.getSnapshot().settings.branching_edit, true);
    assert.strictEqual(store.past.length, 11);

    // Manual undo returns to preTurn state
    store.undo();
    assert.strictEqual(store.getSnapshot().settings.branching_edit, undefined);
    assert.strictEqual(store.getSnapshot().settings.key_10, 10);
  });
});
