import assert from "node:assert/strict";
import { describe, test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const ts = require("typescript");

function loader(mocks = {}) {
  const cache = new Map();
  function load(relative) {
    let file = path.resolve(root, relative);
    if (!path.extname(file)) {
      if (fs.existsSync(file + ".ts")) file += ".ts";
      else if (fs.existsSync(file + ".tsx")) file += ".tsx";
    }
    const key = path.relative(root, file).replaceAll("\\", "/");
    if (key in mocks) return mocks[key];
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} };
    cache.set(file, mod);
    const code = ts.transpileModule(
      fs.readFileSync(file, "utf8").replaceAll("import.meta.url", JSON.stringify("file:///mock-module.js")),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      }
    ).outputText;
    new vm.Script("(function(require,module,exports){" + code + "\n})", { filename: file }).runInThisContext()(
      (s) =>
        s.startsWith("@/")
          ? load(s.slice(2))
          : s.startsWith(".")
          ? load(path.relative(root, path.resolve(path.dirname(file), s)))
          : require(s),
      mod,
      mod.exports
    );
    return mod.exports;
  }
  return load;
}

function makeCanvasMock() {
  const calls = [];
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    filter: "none",
    fillStyle: "#000000",
    strokeStyle: "#000000",
    shadowColor: "transparent",
    shadowBlur: 0,
    shadowOffsetY: 0,
    canvas: { width: 1280, height: 720 },
    save() { calls.push(["save"]); },
    restore() { calls.push(["restore"]); },
    translate(x, y) { calls.push(["translate", x, y]); },
    rotate(a) { calls.push(["rotate", a]); },
    scale(x, y) { calls.push(["scale", x, y]); },
    setTransform(...args) { calls.push(["setTransform", ...args]); },
    beginPath() { calls.push(["beginPath"]); },
    closePath() { calls.push(["closePath"]); },
    moveTo(x, y) { calls.push(["moveTo", x, y]); },
    lineTo(x, y) { calls.push(["lineTo", x, y]); },
    arc(x, y, r, s, e) { calls.push(["arc", x, y, r, s, e]); },
    ellipse(x, y, rx, ry, rot, s, e) { calls.push(["ellipse", x, y, rx, ry, rot, s, e]); },
    bezierCurveTo(...args) { calls.push(["bezierCurveTo", ...args]); },
    quadraticCurveTo(...args) { calls.push(["quadraticCurveTo", ...args]); },
    rect(x, y, w, h) { calls.push(["rect", x, y, w, h]); },
    roundRect(x, y, w, h, r) { calls.push(["roundRect", x, y, w, h, r]); },
    clip() { calls.push(["clip"]); },
    fill() { calls.push(["fill"]); },
    clearRect(x, y, w, h) { calls.push(["clearRect", x, y, w, h]); },
    drawImage(_img, ...args) { calls.push(["drawImage", ...args]); },
  };
  return { ctx, calls };
}

describe("1. Security Hardening", () => {
  test("ASS subtitle generator escapes override tags and prevents Dialogue injection", () => {
    const load = loader();
    const { sanitizeAssText, generateAssSubtitles } = load("app/lib/server/render/ffmpegRenderer.ts");
    const malicious = "{\\pos(0,0)\\1c&H0000FF&}\r\nDialogue: 0,0:00:00.00,0:00:09.00,Main,,0,0,0,,INJECTED\u2028LINE";
    const escaped = sanitizeAssText(malicious);
    assert.ok(!/[\r\n\u2028\u2029]/.test(escaped), "Newlines must be stripped from ASS text");
    assert.ok(!escaped.includes("{\\pos") && !escaped.includes("{\\1c"), "ASS override braces must be escaped");
    assert.ok(escaped.includes("\\{"), "Braces should be escaped");

    const ass = generateAssSubtitles({
      id: "proj",
      name: "Test",
      fps: 30,
      resolution: { width: 1080, height: 1920 },
      aspectRatio: "9:16",
      tracks: [
        {
          id: "cap-1",
          type: "captions",
          name: "Captions",
          items: [
            {
              id: "c1",
              type: "caption",
              trackId: "cap-1",
              startTime: 0,
              endTime: 2,
              source: malicious,
              metadata: {
                captionSegment: {
                  id: "seg-1",
                  text: malicious,
                  startTime: 0,
                  endTime: 2,
                  words: [{ word: malicious, startTime: 0, endTime: 1 }],
                },
              },
            },
          ],
        },
      ],
      settings: {},
    });
    const dialogueLines = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
    assert.ok(dialogueLines.length >= 1, "Expected Dialogue line(s) for valid caption item");
    assert.ok(dialogueLines.every((l) => !l.includes("{\\pos(0,0)}") && !l.endsWith(",INJECTED")), "Injected ASS sequence must remain escaped and cannot spawn Dialogue injection");
  });

  test("allowedDownloadUrl blocks traversal, non-https, bad ports, and userinfo", () => {
    const load = loader();
    const { allowedDownloadUrl } = load("app/lib/server/brollDownload.ts");
    assert.equal(allowedDownloadUrl("https://images.pexels.com/photos/12345/pexels-photo-12345.jpeg").hostname, "images.pexels.com");
    for (const bad of [
      "http://images.pexels.com/a.mp4",
      "https://images.pexels.com:8443/a.mp4",
      "https://user:pass@images.pexels.com/a.mp4",
      "https://images.pexels.com/../../secret",
      "https://images.pexels.com/%2e%2e/secret",
      "https://images.pexels.com/a%2fb",
      "https://images.pexels.com/a%5cb",
      "https://evil.example.com/a.mp4",
    ]) {
      assert.throws(() => allowedDownloadUrl(bad), bad);
    }
  });

  test("assetPolicy metadata & filenames strip prototype pollution, control chars, and traversal", () => {
    const load = loader();
    const { assetMetadata, assetFilename } = load("app/lib/server/assetPolicy.ts");
    const dirty = JSON.parse('{"__proto__":{"polluted":true},"constructor":"bad","extra":"nope","duration":12.5,"prompt":"Clean\\u0007Bad","topic":"Motion graphics"}');
    const clean = assetMetadata(dirty);
    assert.equal(Object.hasOwn(clean, "__proto__"), false);
    assert.equal(Object.hasOwn(clean, "constructor"), false);
    assert.equal(Object.hasOwn(clean, "extra"), false);
    assert.equal(clean.prompt, undefined, "Control characters in prompt must be rejected");
    assert.equal(clean.duration, 12.5);
    assert.equal(clean.topic, "Motion graphics");
    assert.deepEqual(assetMetadata(["not", "an", "object"]), {});

    assert.equal(assetFilename("CON", "video/mp4"), "Kreovar-CON.mp4");
    const safeTrav = assetFilename("../../etc/passwd.exe", "video/webm");
    assert.ok(!safeTrav.includes("/") && !safeTrav.includes("\\") && safeTrav.endsWith(".webm"));
    assert.throws(() => assetFilename("test", "application/x-msdownload"));
  });

  test("visualMasks / visualTreatment / aiValidation reject prototype pollution and enforce strict ranges", () => {
    const load = loader();
    const { readVisualMask } = load("app/lib/editor/visualMasks.ts");
    const { readVisualTreatment } = load("app/lib/editor/visualTreatment.ts");
    const { readValidatedEditDecisionList } = load("app/lib/editor/aiValidation.ts");

    assert.throws(() => readVisualMask(JSON.parse('{"kind":"circle","__proto__":{"x":1}}')));
    assert.throws(() => readVisualMask(JSON.parse('{"kind":"circle","constructor":1}')));
    assert.throws(() => readVisualMask({ kind: "circle", radius: 0.2 }));
    assert.throws(() => readVisualMask({ kind: "circle", feather: 101 }));
    assert.throws(() => readVisualMask({ kind: "circle", opacity: -0.1 }));
    assert.throws(() => readVisualMask({ kind: "circle", scale: 0 }));
    assert.throws(() => readVisualMask({ kind: "circle", x: 1.5 }));
    assert.throws(() => readVisualTreatment(JSON.parse('{"__proto__":{"a":1}}')));
    assert.throws(() =>
      readValidatedEditDecisionList(
        JSON.parse('{"decisions":[{"op":"animate","clipId":"c1","preset":"pop","__proto__":{"evil":1}}],"toolRequests":[]}')
      )
    );
  });

  test("API routes harden subtitle URL parsing, MIME upload allowlist, and asset download headers", () => {
    const renderRoute = fs.readFileSync(path.join(root, "app/api/render/route.ts"), "utf8");
    const uploadRoute = fs.readFileSync(path.join(root, "app/api/media/upload/route.ts"), "utf8");
    const assetFileRoute = fs.readFileSync(path.join(root, "app/api/assets/[id]/file/route.ts"), "utf8");

    assert.match(renderRoute, /track\.type === "text" \|\| track\.type === "captions"/);
    assert.ok(!uploadRoute.includes('file.type || "video/mp4"'), "Must not fall back empty MIME to video/mp4");
    assert.ok(assetFileRoute.includes("assetFilename("), "Download route must sanitize filename with assetFilename");
  });
});

describe("2. 11-Type Masking System, Feather, Opacity & Keyframes", () => {
  test("All 11 CapCut mask types (>= 6 required) validate, generate geometry, and evaluate feather/opacity/invert", () => {
    const load = loader();
    const { VISUAL_MASK_KINDS, readVisualMask, evaluateMaskAt, drawMaskedMedia, maskRevealPolygon } = load("app/lib/editor/visualMasks.ts");
    const { drawVisualMedia } = load("app/lib/editor/visualTreatment.ts");

    assert.ok(VISUAL_MASK_KINDS.length >= 11, `Expected >= 11 mask kinds, got ${VISUAL_MASK_KINDS.length}`);
    for (const kind of [
      "split",
      "filmstrip",
      "circle",
      "rectangle",
      "rounded-rect",
      "heart",
      "star",
      "diamond",
      "polygon",
      "stepped",
      "torn-paper",
    ]) {
      assert.ok(VISUAL_MASK_KINDS.includes(kind), `Missing mask kind ${kind}`);
      const sample =
        kind === "polygon"
          ? { kind, points: [{ x: 0.5, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }], progress: 0.8, feather: 18, opacity: 0.85, invert: true, rotation: 15, x: 0.1, y: -0.05, scale: 0.9 }
          : kind === "rounded-rect" || kind === "rectangle"
          ? { kind, radius: 0.12, width: 0.7, height: 0.6, progress: 0.9, feather: 12, opacity: 0.9 }
          : kind === "stepped"
          ? { kind, steps: 6, progress: 0.75, direction: "left", feather: 10 }
          : kind === "torn-paper"
          ? { kind, seed: 42, roughness: 0.08, progress: 0.7, feather: 8 }
          : { kind, progress: 0.8, feather: 20, opacity: 0.8, invert: false, x: 0.05, y: 0.05, scale: 0.85, rotation: 30 };

      const parsed = readVisualMask(sample);
      const state = evaluateMaskAt(parsed, 1.5);
      assert.ok(Number.isFinite(state.progress) && state.progress >= 0 && state.progress <= 1);
      assert.ok(Number.isFinite(state.feather) && state.opacity >= 0 && state.opacity <= 1);

      const { ctx, calls } = makeCanvasMock();
      drawVisualMedia(ctx, {}, 1280, 720, 1280, 720, { mask: parsed }, 1.5);
      assert.ok(calls.some((c) => c[0] === "drawImage" || c[0] === "clip"), `Mask ${kind} should composite or clip`);
    }

    // Polygon reveal helper sanity
    const heartPoly = maskRevealPolygon({ kind: "circle" }, 0.5);
    assert.ok(Array.isArray(heartPoly));

    // Fast path test: unfeathered, opaque, non-inverted uses ctx.clip() without scratch canvas overhead
    const fast = makeCanvasMock();
    drawMaskedMedia(fast.ctx, { kind: "circle", progress: 0.5 }, 1280, 720, 0, (targetCtx) => {
      targetCtx.drawImage({}, 0, 0, 1280, 720);
    });
    assert.ok(fast.calls.some((c) => c[0] === "clip"), "Unfeathered opaque mask should use fast clip()");
    assert.ok(fast.calls.some((c) => c[0] === "drawImage"));
  });

  test("Multi-property mask keyframes interpolate progress, feather, opacity, position, scale, and rotation", () => {
    const load = loader();
    const { readVisualMask, evaluateMaskAt } = load("app/lib/editor/visualMasks.ts");
    const { createProject } = load("app/lib/editor/model.ts");
    const { addAsset, addClip, splitClip, trimClip } = load("app/lib/editor/operations.ts");
    const { setVisualTreatment } = load("app/lib/editor/visualTreatment.ts");

    const mask = readVisualMask({
      kind: "heart",
      invert: true,
      keyframes: [
        { sourceTime: 0, progress: 0.2, x: -0.2, y: 0, scale: 0.5, rotation: 0, feather: 0, opacity: 0.4, easing: "linear" },
        { sourceTime: 2, progress: 1.0, x: 0.2, y: 0.4, scale: 1.5, rotation: 90, feather: 40, opacity: 1.0, easing: "linear" },
      ],
    });

    const before = evaluateMaskAt(mask, -1);
    assert.equal(before.progress, 0.2);
    assert.equal(before.feather, 0);

    const mid = evaluateMaskAt(mask, 1);
    assert.ok(Math.abs(mid.progress - 0.6) < 1e-6);
    assert.ok(Math.abs(mid.x - 0) < 1e-6);
    assert.ok(Math.abs(mid.y - 0.2) < 1e-6);
    assert.ok(Math.abs(mid.scale - 1.0) < 1e-6);
    assert.ok(Math.abs(mid.rotation - 45) < 1e-6);
    assert.ok(Math.abs(mid.feather - 20) < 1e-6);
    assert.ok(Math.abs(mid.opacity - 0.7) < 1e-6);

    const after = evaluateMaskAt(mask, 5);
    assert.equal(after.progress, 1.0);
    assert.equal(after.feather, 40);

    // Source-clock keyframes survive split + trim
    let proj = createProject("p1");
    proj = addAsset(proj, { id: "v1", kind: "video", name: "v1", src: "blob:v1", duration: 10, width: 1280, height: 720 });
    proj = addClip(proj, "v1", "track-video", 0, 6);
    const clipId = Object.keys(proj.clips)[0];
    proj = setVisualTreatment(proj, clipId, { mask });
    proj = splitClip(proj, clipId, 3);
    const clips = Object.values(proj.clips).sort((a, b) => a.startTime - b.startTime);
    assert.equal(clips.length, 2);
    assert.equal(clips[0].visualTreatment.mask.invert, true);
    assert.equal(clips[1].visualTreatment.mask.keyframes[0].feather, 0);
    proj = trimClip(proj, clips[0].id, "right", 2.5);
    assert.equal(proj.clips[clips[0].id].visualTreatment.mask.kind, "heart");
  });

  test("AI prompts and UI wire all mask kinds, feather, opacity, invert, and keyframe controls", () => {
    const aiPrompt = fs.readFileSync(path.join(root, "app/lib/server/editorAi.ts"), "utf8");
    const fallbackPrompt = fs.readFileSync(path.join(root, "app/lib/server/editorFallbackPrompt.ts"), "utf8");
    const directorPrompt = fs.readFileSync(path.join(root, "app/lib/editor/skills/motionDirectorSkill.ts"), "utf8");
    const maskUi = fs.readFileSync(path.join(root, "app/components/editor/workspace/MaskControls.tsx"), "utf8");
    const drawer = fs.readFileSync(path.join(root, "app/components/editor/AssetDrawer.tsx"), "utf8");
    const inspector = fs.readFileSync(path.join(root, "app/components/editor/workspace/Inspector.tsx"), "utf8");

    for (const token of ['"filmstrip"', '"heart"', '"star"', '"diamond"', "feather", "opacity", "invert"]) {
      assert.ok(aiPrompt.includes(token), `editorAi.ts missing ${token}`);
      assert.ok(fallbackPrompt.includes(token), `editorFallbackPrompt.ts missing ${token}`);
    }
    assert.ok(!aiPrompt.includes("SFX generation, masking, 3D"), "editorAi.ts should no longer claim masking is unsupported");
    assert.ok(directorPrompt.includes("SHAPE MASKS & FEATHERED COMPOSITING"), "motionDirectorSkill missing masking section");
    assert.ok(maskUi.includes("MaskKeyframeStrip") && maskUi.includes("Mask Feather") || maskUi.includes("Mask feather"));
    assert.ok(drawer.includes("<MaskControls"), "AssetDrawer must render MaskControls");
    assert.ok(inspector.includes("<MaskControls"), "Inspector must render MaskControls");
  });
});

describe("3. Editor Engine Caching & 60fps UI Optimization", () => {
  test("projectDuration, speechWindows, speechContext, and visibleLayers cache and stay consistent", () => {
    const load = loader({
      "app/lib/supabase.ts": { supabase: {} },
      "app/lib/editor/cloudMedia.ts": {},
    });
    const { createProject, projectDuration } = load("app/lib/editor/model.ts");
    const { addAsset, addClip } = load("app/lib/editor/operations.ts");
    const { speechWindows } = load("app/lib/editor/audioMix.ts");
    const { speechContext } = load("app/lib/editor/speechContext.ts");
    const { visibleLayers } = load("app/lib/editor/compositor.ts");

    let proj = createProject("perf");
    proj = addAsset(proj, { id: "v1", kind: "video", name: "v1", src: "blob:v1", duration: 20, width: 1920, height: 1080 });
    proj = addClip(proj, "v1", "track-video", 0, { duration: 12 });
    assert.equal(projectDuration(proj), 12);

    // Same snapshot returns memoized speechWindows & speechContext array references
    const w1 = speechWindows(proj);
    const w2 = speechWindows(proj);
    assert.equal(w1, w2, "speechWindows should memoize on identical project snapshot");

    const sc1 = speechContext(proj);
    const sc2 = speechContext(proj);
    assert.equal(sc1, sc2, "speechContext should memoize on identical project snapshot");

    // In-place fixture mutation updates duration and visibleLayers cleanly without serving stale cache
    const cid = Object.keys(proj.clips)[0];
    proj.clips[cid].duration = 15;
    assert.equal(projectDuration(proj), 15);
    assert.equal(visibleLayers(proj, 14).length, 1);

    // Performance smoke benchmark: 2,000 visibleLayers + projectDuration calls in tight loop
    const start = performance.now();
    for (let i = 0; i < 2000; i++) {
      visibleLayers(proj, (i % 140) * 0.1);
      projectDuration(proj);
    }
    const elapsedMs = performance.now() - start;
    assert.ok(elapsedMs < 500, `Expected 2,000 engine lookups under 500ms, took ${elapsedMs.toFixed(1)}ms`);
  });

  test("Editor root containers do not subscribe to 60fps usePlayback updates", () => {
    const layout = fs.readFileSync(path.join(root, "app/components/editor/EditorLayout.tsx"), "utf8");
    const timeline = fs.readFileSync(path.join(root, "app/components/editor/TimelinePanel.tsx"), "utf8");
    const stage = fs.readFileSync(path.join(root, "app/components/editor/CanvasStage.tsx"), "utf8");
    const scrubber = fs.readFileSync(path.join(root, "app/components/editor/Scrubber.tsx"), "utf8");

    assert.ok(!layout.includes("usePlayback("), "EditorLayout must not subscribe directly to 60fps playback state");
    const tlMatches = timeline.match(/usePlayback\(/g) || [];
    assert.equal(tlMatches.length, 2, "Only TimelinePlayheadTime and TimelinePlayheadScrubber leaves may use usePlayback");
    assert.ok(timeline.includes("TimelinePlayheadScrubber") && timeline.includes("TimelinePlayheadTime"));

    const stageMatches = stage.match(/usePlayback\(/g) || [];
    assert.equal(stageMatches.length, 3, "Only StageExpandedSeekBar, StagePlayPauseButton, StageTimecode leaves may use usePlayback");
    assert.ok(!scrubber.includes("duration-75"), "Scrubber should not lag 75ms behind 60fps transforms");
  });
});
