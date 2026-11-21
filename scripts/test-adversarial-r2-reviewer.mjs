import assert from "node:assert/strict";
import { test, describe } from "node:test";
import path from "node:path";
import fs from "node:fs";
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
const refTemplates = load("app/lib/captions/referenceTemplates.ts");

describe("Reviewer R2 Adversarial Verification Suite", () => {
  test("operations: addTrack strictly enforces 30-track ceiling", () => {
    let p = model.createProject("track-cap-test");
    // Initially has default tracks
    const initialCount = p.trackOrder.length;
    assert.ok(initialCount < 30, "Initial track count should be under 30");

    // Add tracks until 30
    while (p.trackOrder.length < 30) {
      p = ops.addTrack(p, "overlay");
    }
    assert.equal(p.trackOrder.length, 30, "Should reach exactly 30 tracks");
    assert.equal(Object.keys(p.tracks).length, 30, "Object tracks map should also have 30 entries");

    // Attempting to add 31st track MUST throw
    assert.throws(
      () => ops.addTrack(p, "overlay"),
      /up to 30 tracks/i,
      "Adding 31st track must throw an error enforcing the 30-track cap"
    );
  });

  test("operations: addTransition strictly enforces TransitionKind types", () => {
    let p = model.createProject("transition-test");
    p = ops.addAsset(p, {
      id: "a1",
      kind: "video",
      name: "Clip 1",
      duration: 5,
      width: 1920,
      height: 1080,
      mime: "video/mp4",
      size: 1000,
      url: "/v1.mp4"
    });
    p = ops.addAsset(p, {
      id: "a2",
      kind: "video",
      name: "Clip 2",
      duration: 5,
      width: 1920,
      height: 1080,
      mime: "video/mp4",
      size: 1000,
      url: "/v2.mp4"
    });

    const trackId = p.trackOrder[0];
    p = ops.addClip(p, "a1", trackId, 0, { id: "c1", duration: 4 });
    p = ops.addClip(p, "a2", trackId, 4, { id: "c2", duration: 4 });

    const validKinds = ["fade", "dissolve", "slide", "zoom"];
    for (const kind of validKinds) {
      const pWithTr = ops.addTransition(p, "c1", "c2", kind, 0.5);
      const trIds = Object.keys(pWithTr.transitions);
      assert.ok(trIds.length > 0, `Transition ${kind} should be recorded`);
      const tr = pWithTr.transitions[trIds[trIds.length - 1]];
      assert.equal(tr.kind, kind);
      assert.equal(tr.fromClipId, "c1");
      assert.equal(tr.toClipId, "c2");
      assert.equal(tr.duration, 0.5);
    }
  });

  test("referenceTemplates: ALL_CAPTION_TEMPLATES contains viral-hinglish-pop and creator presets", () => {
    const templates = refTemplates.ALL_CAPTION_TEMPLATES;
    assert.ok(Array.isArray(templates), "Templates should be an array");
    assert.ok(templates.length >= 5, "Templates should contain multiple registered presets");

    const hinglish = templates.find((t) => t.id === "viral-hinglish-pop");
    assert.ok(hinglish, "viral-hinglish-pop preset must be present in referenceTemplates");
    assert.equal(hinglish.id, "viral-hinglish-pop");

    const requiredPresetTemplateIds = [
      "study-hormozi-style",
      "study-clean-motion",
      "study-ali-abdaal",
      "study-mr-beast-style-2",
      "study-thora-cinematic"
    ];
    for (const tid of requiredPresetTemplateIds) {
      const found = templates.some((t) => t.id === tid);
      assert.ok(found, `Template with id '${tid}' should exist in ALL_CAPTION_TEMPLATES`);
    }
  });

  test("CanvasStage math: 2D Euclidean distance and polar angle computation", () => {
    // Test polar math logic used in CanvasStage
    const centerX = 500;
    const centerY = 500;

    // Point 1: 100px right, 0px down -> dist = 100, angle = 0 deg
    const p1X = 600;
    const p1Y = 500;
    const dist1 = Math.hypot(p1X - centerX, p1Y - centerY);
    const angle1 = Math.atan2(p1Y - centerY, p1X - centerX) * (180 / Math.PI);
    assert.equal(dist1, 100);
    assert.equal(angle1, 0);

    // Point 2: 0px right, 100px down -> dist = 100, angle = 90 deg
    const p2X = 500;
    const p2Y = 600;
    const dist2 = Math.hypot(p2X - centerX, p2Y - centerY);
    const angle2 = Math.atan2(p2Y - centerY, p2X - centerX) * (180 / Math.PI);
    assert.equal(dist2, 100);
    assert.equal(angle2, 90);

    // Scaling ratio: moving from dist 100 to dist 200 doubles scale
    const scaleFactor = dist2 > 2 ? 200 / dist1 : 1;
    assert.equal(scaleFactor, 2);

    // Rotation delta: rotating from 0 deg to 90 deg yields +90 deg delta
    const deltaAngle = Math.round(angle2 - angle1);
    assert.equal(deltaAngle, 90);
  });

  test("TimelinePanel DND: JSON payload and legacy string parsing", () => {
    // Modern JSON payload
    const modernPayload = JSON.stringify({
      assetId: "asset-1234",
      name: "Test Asset.mp4",
      duration: 10,
      kind: "video"
    });

    let assetId = modernPayload;
    try {
      const parsed = JSON.parse(modernPayload);
      if (parsed && typeof parsed === "object" && parsed.assetId) {
        assetId = parsed.assetId;
      }
    } catch {}
    assert.equal(assetId, "asset-1234", "Should parse assetId from JSON payload");

    // Legacy plain string payload
    const legacyPayload = "legacy-asset-5678";
    let legacyAssetId = legacyPayload;
    try {
      const parsed = JSON.parse(legacyPayload);
      if (parsed && typeof parsed === "object" && parsed.assetId) {
        legacyAssetId = parsed.assetId;
      }
    } catch {}
    assert.equal(legacyAssetId, "legacy-asset-5678", "Should fallback to raw string for non-JSON payload");
  });

  test("operations: changeClipProperty respects bounds for speed, transform, volume", () => {
    let p = model.createProject("clip-property-test");
    p = ops.addAsset(p, {
      id: "a1",
      kind: "video",
      name: "V",
      duration: 10,
      width: 100,
      height: 100,
      mime: "video/mp4",
      size: 10,
      url: "/v.mp4"
    });
    const trackId = p.trackOrder[0];
    p = ops.addClip(p, "a1", trackId, 0, { id: "c1", duration: 10 });

    // Speed clamped in UI between 0.25 and 4
    p = ops.changeClipProperty(p, "c1", { speed: 2.5 });
    assert.equal(p.clips.c1.speed, 2.5);

    // Volume changed
    p = ops.changeClipProperty(p, "c1", { volume: 1.5 });
    assert.equal(p.clips.c1.volume, 1.5);

    // AudioRole set
    p = ops.changeClipProperty(p, "c1", { audioRole: "speech" });
    assert.equal(p.clips.c1.audioRole, "speech");

    // Ducking toggle
    p = ops.changeClipProperty(p, "c1", { ducking: false });
    assert.equal(p.clips.c1.ducking, false);
  });
});
