import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const ts = require("typescript");

function loader(mocks = {}) {
  const cache = new Map();
  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) filename += ".ts";
    const key = path.relative(root, filename).replaceAll("\\", "/");
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule);
    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(filename).href));
    const localRequire = (specifier) =>
      Object.hasOwn(mocks, specifier)
        ? mocks[specifier]
        : specifier.startsWith("@/")
        ? load(specifier.slice(2))
        : specifier.startsWith(".")
        ? load(path.relative(root, path.resolve(path.dirname(filename), specifier)))
        : require(specifier);
    new vm.Script(`(function(require,module,exports,process){${source}\n})`, { filename }).runInThisContext()(
      localRequire,
      loadedModule,
      loadedModule.exports,
      process
    );
    return loadedModule.exports;
  }
  return load;
}

const load = loader();
const model = load("app/lib/editor/model.ts");
const ops = load("app/lib/editor/operations.ts");
const refTemplates = load("app/lib/captions/referenceTemplates.ts");

test("R2 Stress Test 1: 30-Track Limit Enforcement", () => {
  let p = model.createProject("Test 30 Tracks");
  const initialCount = p.trackOrder.length;
  for (let i = initialCount; i < 30; i++) {
    p = ops.addTrack(p, "overlay");
  }
  assert.equal(p.trackOrder.length, 30);
  assert.equal(Object.keys(p.tracks).length, 30);

  // 31st track MUST throw
  assert.throws(() => {
    ops.addTrack(p, "overlay");
  }, /30 tracks/i);
});

test("R2 Stress Test 2: Copy & Paste Clips (Cmd+C / Cmd+V operation)", () => {
  let p = model.createProject("Test Copy Paste");
  const videoTrackId = p.trackOrder.find((id) => p.tracks[id].kind === "video");
  assert.ok(videoTrackId);

  const asset = {
    id: "asset_test_1",
    kind: "video",
    name: "Clip 1",
    duration: 10,
    width: 1920,
    height: 1080,
    url: "https://example.com/video.mp4",
    thumbnail: "",
    size: 1000,
    mime: "video/mp4",
  };
  p = ops.addAsset(p, asset);
  p = ops.addClip(p, asset.id, videoTrackId, 0, { id: "clip_original", duration: 5 });
  assert.ok(p.clips["clip_original"]);

  // Simulate copy selection
  const copiedProject = p;
  const copiedIds = ["clip_original"];

  // Paste at playhead time 15
  const pastedProject = ops.pasteClips(p, copiedProject, copiedIds, 15);
  const newClipIds = Object.keys(pastedProject.clips).filter((id) => id !== "clip_original");
  assert.equal(newClipIds.length, 1);
  const pastedClip = pastedProject.clips[newClipIds[0]];
  assert.equal(pastedClip.startTime, 15);
  assert.equal(pastedClip.duration, 5);
  assert.equal(pastedClip.assetId, asset.id);
});

test("R2 Stress Test 3: Transitions strictly restricted to TransitionKind", () => {
  let p = model.createProject("Test Transitions");
  const videoTrackId = p.trackOrder.find((id) => p.tracks[id].kind === "video");
  const asset = {
    id: "asset_test_2",
    kind: "video",
    name: "Clip 2",
    duration: 10,
    width: 1920,
    height: 1080,
    url: "https://example.com/video2.mp4",
    thumbnail: "",
    size: 1000,
    mime: "video/mp4",
  };
  p = ops.addAsset(p, asset);
  p = ops.addClip(p, asset.id, videoTrackId, 0, { id: "c1", duration: 5 });
  p = ops.addClip(p, asset.id, videoTrackId, 5, { id: "c2", duration: 5 });

  const { TRANSITION_KINDS } = load("app/lib/editor/transitions.ts");
  assert.ok(TRANSITION_KINDS.length >= 30);
  for (const kind of TRANSITION_KINDS) {
    const nextP = ops.addTransition(p, "c1", "c2", kind, 0.5);
    const trans = Object.values(nextP.transitions)[0];
    assert.equal(trans.kind, kind);
    assert.equal(trans.fromClipId, "c1");
    assert.equal(trans.toClipId, "c2");
  }
});

test("R2 Stress Test 4: Project Duration <= 0 loop guard", () => {
  const emptyProject = model.createProject("Empty");
  const dur = model.projectDuration(emptyProject);
  assert.equal(dur, 0);
});

test("R2 Stress Test 5: Caption Studio Templates Count and Hinglish Revert integrity", () => {
  assert.ok(refTemplates.ALL_CAPTION_TEMPLATES.length >= 20);
  const hinglishTemplate = refTemplates.ALL_CAPTION_TEMPLATES.find((t) => t.id === "viral-hinglish-pop");
  assert.ok(hinglishTemplate);
  assert.equal(hinglishTemplate.name, "Viral Hinglish Pop");

  const hormozi = refTemplates.ALL_CAPTION_TEMPLATES.find((t) => t.id === "study-hormozi-style");
  assert.ok(hormozi);
});
