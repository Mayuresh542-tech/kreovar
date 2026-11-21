import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json")), ts = require("typescript");

function loader(mocks = {}) {
  const cache = new Map();
  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) filename += ".ts";
    const key = path.relative(root, filename).replaceAll("\\", "/");
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} }; cache.set(filename, loadedModule);
    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(filename).href));
    const localRequire = specifier => Object.hasOwn(mocks, specifier) ? mocks[specifier] : specifier.startsWith("@/") ? load(specifier.slice(2)) : specifier.startsWith(".") ? load(path.relative(root, path.resolve(path.dirname(filename), specifier))) : require(specifier);
    vm.runInNewContext(source, { exports: loadedModule.exports, module: loadedModule, require: localRequire, console, process, URL, Buffer, Math, crypto, setTimeout, clearTimeout });
    return loadedModule.exports;
  }
  return load;
}

const load = loader();
const { clamp, createProject } = load("app/lib/editor/model");
const { addAsset, addClip, changeClipProperty, moveClip, trimClip } = load("app/lib/editor/operations");

test("clamp: guards against NaN and returns min when input is not finite", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);
  assert.equal(clamp(NaN, 0, 10), 0, "clamp(NaN) should return min");
  assert.equal(clamp(Infinity, 0, 10), 0, "clamp(Infinity) should return min");
});

test("changeClipProperty: sanitizes NaN and non-finite transform & effects values", () => {
  let p = createProject("test-project", "Test");
  const trackId = p.trackOrder[0];
  const asset = {
    id: "a1",
    name: "clip.mp4",
    kind: "video",
    mime: "video/mp4",
    size: 1000,
    duration: 10,
    width: 1920,
    height: 1080
  };
  p = addAsset(p, asset);
  p = addClip(p, "a1", trackId, 0);
  const clipId = p.tracks[trackId].clipIds[0];

  // Try to pass NaN into transform
  const updated = changeClipProperty(p, clipId, {
    transform: {
      x: NaN,
      y: NaN,
      scale: NaN,
      rotation: NaN,
      opacity: NaN,
    },
    effects: {
      brightness: NaN,
      contrast: NaN,
      saturation: NaN,
      blur: NaN,
    }
  });

  const c = updated.clips[clipId];
  assert.ok(Number.isFinite(c.transform.x), "transform.x must be finite");
  assert.ok(Number.isFinite(c.transform.y), "transform.y must be finite");
  assert.ok(Number.isFinite(c.transform.scale), "transform.scale must be finite");
  assert.ok(Number.isFinite(c.transform.rotation), "transform.rotation must be finite");
  assert.ok(Number.isFinite(c.transform.opacity), "transform.opacity must be finite");

  assert.ok(Number.isFinite(c.effects.brightness), "effects.brightness must be finite");
  assert.ok(Number.isFinite(c.effects.contrast), "effects.contrast must be finite");
  assert.ok(Number.isFinite(c.effects.saturation), "effects.saturation must be finite");
  assert.ok(Number.isFinite(c.effects.blur), "effects.blur must be finite");
});

test("moveClip and trimClip: ignore NaN timestamps gracefully without corrupting state", () => {
  let p = createProject("test-project-2", "Test");
  const trackId = p.trackOrder[0];
  const asset = {
    id: "a2",
    name: "clip2.mp4",
    kind: "video",
    mime: "video/mp4",
    size: 1000,
    duration: 10,
    width: 1920,
    height: 1080
  };
  p = addAsset(p, asset);
  p = addClip(p, "a2", trackId, 2);
  const clipId = p.tracks[trackId].clipIds[0];

  const moved = moveClip(p, clipId, NaN);
  assert.ok(Number.isFinite(moved.clips[clipId].startTime), "startTime must remain finite after moveClip with NaN");

  const trimmed = trimClip(p, clipId, "left", NaN);
  assert.ok(Number.isFinite(trimmed.clips[clipId].startTime), "startTime must remain finite after trimClip with NaN");
});

test("offlineExport: audio playback buffer slice duration check", () => {
  const offlineExportCode = fs.readFileSync(path.join(root, "app/lib/editor/offlineExport.ts"), "utf8");
  assert.ok(
    !offlineExportCode.includes("c.speed !== 1 ? slice.length / c.speed : slice.length"),
    "offlineExport must not divide slice.length by c.speed for AudioBufferSourceNode.start duration"
  );
  assert.ok(
    offlineExportCode.includes("source.start(slice.when,slice.offset,slice.length)") ||
    offlineExportCode.includes("source.start(slice.when, slice.offset, slice.length)"),
    "offlineExport should pass slice.length directly to source.start"
  );
});

test("groqEditorTransport: retains reservation on unconfirmed failure (settles with null, not 0)", () => {
  const groqTransportCode = fs.readFileSync(path.join(root, "app/lib/server/groqEditorTransport.ts"), "utf8");
  assert.ok(
    !groqTransportCode.includes("settleEditorTokens(options.userId,options.editingBudget,lease,0)"),
    "groqEditorTransport must not settle with 0 on unconfirmed finally block"
  );
  assert.ok(
    groqTransportCode.includes("settleEditorTokens(options.userId,options.editingBudget,lease,null)"),
    "groqEditorTransport must settle with null on unconfirmed finally block"
  );
});
