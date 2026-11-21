import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json")),
  ts = require("typescript");

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
    const source = ts
      .transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      })
      .outputText.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(filename).href));
    const localRequire = (specifier) =>
      Object.hasOwn(mocks, specifier)
        ? mocks[specifier]
        : specifier.startsWith("@/")
        ? load(specifier.slice(2))
        : specifier.startsWith(".")
        ? load(path.relative(root, path.resolve(path.dirname(filename), specifier)))
        : require(specifier);
    const fn = vm.runInThisContext(
      `(function(exports, require, module, __filename, __dirname){ ${source} \n})`,
      { filename }
    );
    fn(loadedModule.exports, localRequire, loadedModule, filename, path.dirname(filename));
    return loadedModule.exports;
  }
  return { load };
}

const { load } = loader();
const model = load("app/lib/editor/model.ts");
const operations = load("app/lib/editor/operations.ts");

const { createProject } = model;
const {
  changeClipProperty,
  resetClipTransform,
  changeCaptionProperty,
  changeCaptionHighlightColor,
  addText,
  addCaption,
  addAsset,
  addClip,
} = operations;

test("Inspector Speed panel: supports 0.1x to 10x speed with boundary clamps", () => {
  let project = createProject("test-speed");
  const asset = {
    id: "video-1",
    name: "Clip 1",
    kind: "video",
    mime: "video/mp4",
    size: 1000,
    duration: 10,
    width: 1920,
    height: 1080,
  };
  project = addAsset(project, asset);
  project = addClip(project, "video-1", "track-video", 0, { duration: 10, speed: 1 });
  const clipId = Object.keys(project.clips)[0];
  assert.ok(clipId);

  // 1) Test 0.1x speed (slow motion)
  project = changeClipProperty(project, clipId, { speed: 0.1 });
  assert.equal(project.clips[clipId].speed, 0.1);
  assert.equal(project.clips[clipId].duration, 100); // 10s source / 0.1 = 100s

  // 2) Test 10x speed (hyper lapse)
  project = changeClipProperty(project, clipId, { speed: 10 });
  assert.equal(project.clips[clipId].speed, 10);
  assert.equal(project.clips[clipId].duration, 1); // 10s source / 10 = 1s

  // 3) Boundary clamping: below 0.1 should clamp to 0.1
  project = changeClipProperty(project, clipId, { speed: 0.02 });
  assert.equal(project.clips[clipId].speed, 0.1);

  // 4) Boundary clamping: above 10 should clamp to 10
  project = changeClipProperty(project, clipId, { speed: 25 });
  assert.equal(project.clips[clipId].speed, 10);

  // 5) Preset chips: 0.5x, 1x, 1.5x, 2x
  for (const preset of [0.5, 1, 1.5, 2]) {
    project = changeClipProperty(project, clipId, { speed: preset });
    assert.equal(project.clips[clipId].speed, preset);
    assert.equal(project.clips[clipId].duration, 10 / preset);
  }

  // 6) Pitch preservation toggle
  project = changeClipProperty(project, clipId, { preservePitch: false });
  assert.equal(project.clips[clipId].preservePitch, false);
  project = changeClipProperty(project, clipId, { preservePitch: true });
  assert.equal(project.clips[clipId].preservePitch, true);
});

test("Inspector Audio panel: volume 0% to 200%, decibel formula, fade in/out, and mute toggle", () => {
  let project = createProject("test-audio");
  const asset = {
    id: "audio-1",
    name: "Voiceover",
    kind: "audio",
    mime: "audio/mp3",
    size: 500,
    duration: 8,
    width: 0,
    height: 0,
  };
  project = addAsset(project, asset);
  project = addClip(project, "audio-1", "track-audio", 0, { duration: 8, volume: 1 });
  const clipId = Object.keys(project.clips)[0];

  // 1) Volume 100% (linear 1.0) -> exactly 0.0 dB
  assert.equal(project.clips[clipId].volume, 1);
  const db100 = 20 * Math.log10(project.clips[clipId].volume);
  assert.equal(db100.toFixed(1), "0.0");

  // 2) Volume 200% (linear 2.0) -> +6.0 dB
  project = changeClipProperty(project, clipId, { volume: 2 });
  assert.equal(project.clips[clipId].volume, 2);
  const db200 = 20 * Math.log10(project.clips[clipId].volume);
  assert.equal(db200.toFixed(1), "6.0");

  // 3) Volume 50% (linear 0.5) -> -6.0 dB
  project = changeClipProperty(project, clipId, { volume: 0.5 });
  assert.equal(project.clips[clipId].volume, 0.5);
  const db50 = 20 * Math.log10(project.clips[clipId].volume);
  assert.equal(db50.toFixed(1), "-6.0");

  // 4) Volume clamping: max 200% (2.0), min 0% (0.0)
  project = changeClipProperty(project, clipId, { volume: 3.5 });
  assert.equal(project.clips[clipId].volume, 2);
  project = changeClipProperty(project, clipId, { volume: -0.5 });
  assert.equal(project.clips[clipId].volume, 0);

  // 5) Mute toggle: when volume is 0 -> dB is -Infinity
  assert.equal(project.clips[clipId].volume, 0);
  const dbMute =
    project.clips[clipId].volume > 0
      ? 20 * Math.log10(project.clips[clipId].volume)
      : -Infinity;
  assert.equal(dbMute, -Infinity);

  // Unmute restores volume
  project = changeClipProperty(project, clipId, { volume: 1 });
  assert.equal(project.clips[clipId].volume, 1);

  // 6) Fade-in and Fade-out sliders
  project = changeClipProperty(project, clipId, { fadeIn: 1.5, fadeOut: 2.0 });
  assert.equal(project.clips[clipId].fadeIn, 1.5);
  assert.equal(project.clips[clipId].fadeOut, 2.0);

  // Fade clamped to clip duration (8s)
  project = changeClipProperty(project, clipId, { fadeIn: 15 });
  assert.equal(project.clips[clipId].fadeIn, 8);
});

test("Inspector Transform panel: X/Y inputs, Scale (10% to 500%), Rotation (-180° to 180°), and Reset Transform", () => {
  let project = createProject("test-transform");
  project = addText(project, "Header Title", 0, {}, false, 5);
  const clipId = Object.keys(project.clips)[0];
  const initial = project.clips[clipId];

  // 1) X and Y position inputs
  project = changeClipProperty(project, clipId, {
    transform: { ...initial.transform, x: 0.25, y: -0.15 },
  });
  assert.equal(project.clips[clipId].transform.x, 0.25);
  assert.equal(project.clips[clipId].transform.y, -0.15);

  // 2) Scale (10% to 500% -> 0.1 to 5.0)
  project = changeClipProperty(project, clipId, {
    transform: { ...project.clips[clipId].transform, scale: 2.5 },
  });
  assert.equal(project.clips[clipId].transform.scale, 2.5);

  // 3) Rotation (-180° to +180°)
  project = changeClipProperty(project, clipId, {
    transform: { ...project.clips[clipId].transform, rotation: -45 },
  });
  assert.equal(project.clips[clipId].transform.rotation, -45);

  project = changeClipProperty(project, clipId, {
    transform: { ...project.clips[clipId].transform, rotation: 120 },
  });
  assert.equal(project.clips[clipId].transform.rotation, 120);

  // 4) Reset Transform button
  project = resetClipTransform(project, clipId);
  assert.equal(project.clips[clipId].transform.x, 0);
  assert.equal(project.clips[clipId].transform.y, 0);
  assert.equal(project.clips[clipId].transform.scale, 1);
  assert.equal(project.clips[clipId].transform.rotation, 0);
  assert.equal(project.clips[clipId].transform.opacity, 1);
});

test("Inspector Text & Caption styling panel: Font picker, size, color, background, alignment, and active word highlight color", () => {
  let project = createProject("test-captions");
  const words = [
    { word: "Turn", start: 0, end: 0.5 },
    { word: "ideas", start: 0.5, end: 1.0 },
    { word: "into", start: 1.0, end: 1.5 },
    { word: "reality", start: 1.5, end: 2.0 },
  ];
  project = addCaption(
    project,
    "Turn ideas into reality",
    0,
    3,
    { font: "Inter", size: 64 },
    words
  );
  const clipId = Object.keys(project.clips)[0];
  const clip = project.clips[clipId];
  const contentId = clip.contentId;
  assert.ok(contentId);
  assert.ok(project.captions[contentId]);

  // 1) Active word highlight color update via changeCaptionProperty
  project = changeCaptionProperty(project, clipId, { highlightColor: "#00F0FF" });
  assert.equal(project.captions[contentId].highlightColor, "#00F0FF");

  // 2) Active word highlight color update via changeCaptionHighlightColor
  project = changeCaptionHighlightColor(project, clipId, "#FAFF00");
  assert.equal(project.captions[contentId].highlightColor, "#FAFF00");

  // 3) Highlight color persists when studioStyle is present
  project.captions[contentId].studioStyle = {
    fontFamily: "Inter",
    fontSize: 64,
    textColor: "#ffffff",
    highlightColor: "#FAFF00",
    highlightingMode: "current-word",
    animation: "pop",
    studio: { entrance: "pop", hold: "none" },
  };
  project = changeCaptionHighlightColor(project, clipId, "#00F298");
  assert.equal(project.captions[contentId].highlightColor, "#00F298");
  assert.equal(project.captions[contentId].studioStyle.highlightColor, "#00F298");

  // 4) Reset caption transform preserves caption Y offset (0.35)
  project = changeClipProperty(project, clipId, {
    transform: { x: 0.2, y: -0.1, scale: 2.0, rotation: 15, opacity: 0.8 },
  });
  project = resetClipTransform(project, clipId);
  assert.equal(project.clips[clipId].transform.x, 0);
  assert.equal(project.clips[clipId].transform.y, 0.35); // Caption default Y
  assert.equal(project.clips[clipId].transform.scale, 1);
  assert.equal(project.clips[clipId].transform.rotation, 0);
});
