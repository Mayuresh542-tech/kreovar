import assert from "node:assert/strict";
import { test, describe } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
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

function createTestVideoProject() {
  let p = model.createProject("test-video-project");
  p = ops.addAsset(p, {
    id: "source-video",
    kind: "video",
    name: "Footage.mp4",
    duration: 12,
    width: 720,
    height: 1280,
    mime: "video/mp4",
    size: 100,
    url: "/test/footage.mp4"
  });
  p = ops.addClip(p, "source-video", "track-video", 0, { id: "main-clip", duration: 12, sourceEnd: 12 });
  return p;
}

describe("R1 Stress Test 1: In-Place State Mutation Elimination", () => {
  test("1.1 validateCompletedJob does not mutate input project and handles frozen projects cleanly", () => {
    let p = createTestVideoProject();
    p = ops.addCaption(p, "Speech caption", 0, 4, "non-existent-template");
    const job = pipeline.createEditingJob(p, "Add captions", []);
    job.appliedOperations = ["applyCaptions"];
    job.stages.forEach((s) => {
      s.status = "completed";
    });
    job.initialRevision = p.revision - 1;

    Object.freeze(p);

    const valResult = pipeline.validateCompletedJob(p, job);
    assert.ok(valResult.project, "Validated project must be returned when adjustments are made");
    assert.notStrictEqual(valResult.project, p, "Validated project must be a fresh cloned container");
  });

  test("1.2 validateCompletedJob returns cloned project and causes persist changed check to evaluate true", () => {
    let p = createTestVideoProject();
    p = ops.addCaption(p, "Speech caption", 0, 4, "non-existent-template");
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

    const changed =
      validatedProject.tracks !== current.tracks ||
      validatedProject.trackOrder !== current.trackOrder ||
      validatedProject.textLayers !== current.textLayers ||
      validatedProject.clips !== current.clips ||
      validatedProject.captions !== current.captions ||
      validatedProject.assets !== current.assets ||
      validatedProject.transitions !== current.transitions ||
      validatedProject.settings !== current.settings;

    assert.strictEqual(
      changed,
      true,
      "Cloned validatedProject triggers store.execute via changed === true"
    );
  });
});

describe("R1 Stress Test 2: Text Clip Retention & Decision Reconciler", () => {
  test("2.1 validateCompletedJob retains non-hallucinated manual titles on text track without c.graphic", () => {
    let p = createTestVideoProject();
    p = ops.addText(p, "Episode 1: The Beginning", 0, {}, false, 3);
    const titleClip = Object.values(p.clips).find((c) => p.tracks[c.trackId]?.kind === "text");
    assert.ok(titleClip, "Text clip was created");

    const job = pipeline.createEditingJob(p, "Add captions", []);
    job.appliedOperations = ["applyCaptions"];
    job.stages.forEach((s) => {
      s.status = "completed";
    });
    job.initialRevision = p.revision - 1;

    pipeline.validateCompletedJob(p, job);
    assert.ok(p.clips[titleClip.id], "Manual title clip must be retained on text track");
  });

  test("2.2 reconcileEditingDecisions retains valid title and lower-third addText decisions", () => {
    const p = createTestVideoProject();
    const titleDecision = {
      op: "addText",
      text: "Top 10 AI Secrets",
      trackId: "track-text",
      startTime: 0,
      duration: 3,
      placementId: "title"
    };
    const lowerThirdDecision = {
      op: "addText",
      text: "Dr. Jane Smith",
      trackId: "track-text",
      startTime: 0,
      duration: 3,
      placementId: "lower-third"
    };

    const result = reconciler.reconcileEditingDecisions(p, [titleDecision, lowerThirdDecision]);
    const retainedOps = result.decisions.filter((d) => d.op === "addText");

    assert.strictEqual(retainedOps.length, 2, "Both title and lower-third are retained");
    assert.strictEqual(retainedOps[0].placementId, "title");
    assert.strictEqual(retainedOps[1].placementId, "lower-third");
  });
});

describe("R1 Stress Test 3: Multi-Stage Pipeline Expansion", () => {
  test("3.1 readRequestedOperations allows intermediate ops to coexist with requestedEdits", () => {
    const opsList = pipeline.readRequestedOperations(["captions", "zooms", "requestedEdits"]);
    assert.deepStrictEqual(opsList, ["captions", "zooms", "requestedEdits"]);
    const stages = pipeline.stagesFor(opsList);
    assert.deepStrictEqual(stages, [
      "analyzeFootage",
      "applyCaptions",
      "applyZooms",
      "applyRequestedEdits",
      "validateEdit"
    ]);
  });
});

describe("R1 Stress Test 4: Atomic Rollback Across Multi-Stage Jobs", () => {
  test("4.1 store.rollbackToRevision succeeds across checkpoints and preserves pre-turn user edits", () => {
    const p = createTestVideoProject();
    const store = new storeMod.EditorStore(p);

    store.execute((proj) => ({ ...proj, settings: { ...proj.settings, title: "User Manual Title" } }));
    const preTurnRevision = store.getSnapshot().revision;
    assert.strictEqual(store.getSnapshot().settings.title, "User Manual Title");

    store.checkpoint((proj) => ({
      ...proj,
      editingJob: { id: "job-1", currentStage: "analyzeFootage" }
    }));

    store.execute((proj) => ({
      ...proj,
      clips: { ...proj.clips, ai_caption: { id: "ai_caption", trackId: "track-captions" } }
    }));

    store.execute((proj) => ({
      ...proj,
      clips: { ...proj.clips, ai_broll: { id: "ai_broll", trackId: "track-overlay" } }
    }));

    const rolledBack = store.rollbackToRevision ? store.rollbackToRevision(preTurnRevision) : false;
    assert.strictEqual(
      rolledBack,
      true,
      "rollbackToRevision(preTurnRevision) must return true even with checkpoints"
    );

    assert.strictEqual(
      store.getSnapshot().settings.title,
      "User Manual Title",
      "Pre-turn user edit must remain intact"
    );
    assert.strictEqual(store.getSnapshot().clips["ai_caption"], undefined, "AI caption must be undone");
    assert.strictEqual(store.getSnapshot().clips["ai_broll"], undefined, "AI broll must be undone");
  });
});
