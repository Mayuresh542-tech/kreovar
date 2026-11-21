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
    const source = ts
      .transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      })
      .outputText.replaceAll(
        "import.meta.url",
        JSON.stringify(pathToFileURL(filename).href)
      );
    const localRequire = (specifier) =>
      Object.hasOwn(mocks, specifier)
        ? mocks[specifier]
        : specifier.startsWith("@/")
        ? load(specifier.slice(2))
        : specifier.startsWith(".")
        ? load(path.relative(root, path.resolve(path.dirname(filename), specifier)))
        : require(specifier);
    vm.runInNewContext(source, {
      exports: loadedModule.exports,
      module: loadedModule,
      require: localRequire,
      console,
      process,
      URL,
      Buffer,
      Math,
      crypto,
      setTimeout,
      clearTimeout,
    });
    return loadedModule.exports;
  }
  return load;
}

const load = loader();
const { createProject } = load("app/lib/editor/model");
const { addAsset, addClip, addTrack, reframeProject } = load("app/lib/editor/operations");
const {
  calculateCenterCropTransform,
  calculateFitWithBlur,
  calculateCenterCrop,
  calculateSplitScreen,
} = load("app/lib/editor/reframing");
const {
  extractViralHooks,
  detectHookType,
  calculateSpeechMetrics,
  scoreKeywordVirality,
  generateViralTitle,
  normalizeTranscript,
} = load("app/lib/editor/viralHookExtractor");

function createSample16x9Project() {
  let p = createProject("test-reframe-project", "16:9 Landscape Video");
  p.settings.aspectRatio = "16:9";

  // Add 16:9 video asset (1920x1080, 120s)
  p = addAsset(p, {
    id: "asset-interview-16x9",
    name: "Interview_16x9.mp4",
    kind: "video",
    mime: "video/mp4",
    size: 25 * 1024 * 1024,
    duration: 120,
    width: 1920,
    height: 1080,
  });

  // Add primary video track & clip
  const videoTrackId = p.trackOrder.find((id) => p.tracks[id]?.kind === "video");
  p = addClip(p, "asset-interview-16x9", videoTrackId, 0, {
    duration: 120,
    sourceStart: 0,
    sourceEnd: 120,
  });

  return { project: p, clipId: Object.keys(p.clips)[0], trackId: videoTrackId };
}

// =========================================================================
// SECTION 1: 1-Click 16:9 to 9:16 Smart Reframing Tests
// =========================================================================

test("reframing math: calculateCenterCropTransform produces 1.77x punch-in centered at focusY: -0.14", () => {
  const transform = calculateCenterCropTransform(1.77, -0.14);
  assert.equal(transform.scale, 1.77);
  assert.equal(transform.focusY, -0.14);
  assert.equal(transform.y, -0.14);
  assert.equal(transform.x, 0);
  assert.equal(transform.rotation, 0);
  assert.equal(transform.opacity, 1);
});

test("reframeProject ('fit-with-blur'): scales to fit 9:16 width and generates blurred duplicated background wings", () => {
  const { project, clipId } = createSample16x9Project();

  const reframed = reframeProject(project, "fit-with-blur");

  // 1. Aspect ratio converted to 9:16
  assert.equal(reframed.settings.aspectRatio, "9:16");

  // 2. Foreground clip scaled to fit (scale: 1, x: 0, y: 0, blur: 0)
  const fgClip = reframed.clips[clipId];
  assert.ok(fgClip, "Foreground clip must exist");
  assert.equal(fgClip.transform.scale, 1);
  assert.equal(fgClip.transform.x, 0);
  assert.equal(fgClip.transform.y, 0);
  assert.equal(fgClip.effects.blur, 0);

  // 3. Background track created at index 0 of trackOrder
  assert.ok(reframed.tracks["track-reframe-bg"], "Background track must be present");
  assert.equal(reframed.trackOrder[0], "track-reframe-bg", "Background track must render at the bottom of the stack");

  // 4. Background wing clip properties
  const bgTrack = reframed.tracks["track-reframe-bg"];
  assert.equal(bgTrack.clipIds.length, 1);
  const bgClip = reframed.clips[bgTrack.clipIds[0]];
  assert.ok(bgClip, "Blurred background clip must exist");
  assert.equal(bgClip.volume, 0, "Background clip must be muted to avoid audio echo");
  assert.equal(bgClip.transform.scale, 3.16, "Background clip must be scaled 3.16x to fill vertical 9:16 frame");
  assert.equal(bgClip.effects.blur, 25, "Background clip must apply Gaussian blur (25px)");
  assert.equal(bgClip.effects.brightness, -10, "Background clip must be slightly dimmed");
});

test("reframeProject ('center-crop'): punches in 1.77x centered on upper-third eye-line (focusY: -0.14)", () => {
  const { project, clipId } = createSample16x9Project();

  const reframed = reframeProject(project, "center-crop");

  // 1. Aspect ratio converted to 9:16
  assert.equal(reframed.settings.aspectRatio, "9:16");

  // 2. Transform verification
  const clip = reframed.clips[clipId];
  assert.ok(clip);
  assert.equal(clip.transform.scale, 1.77, "Scale must be 1.77x punch-in");
  assert.equal(clip.transform.y, -0.14, "Y offset must be -0.14 for upper-third eye-line");
  assert.equal((clip.transform).focusY, -0.14, "focusY metadata must be preserved on transform");
  assert.equal(clip.transform.x, 0);
  assert.equal(clip.effects.blur, 0);

  // 3. No background track in center-crop mode
  assert.equal(reframed.tracks["track-reframe-bg"], undefined);
});

test("reframeProject ('split-screen'): positions A-roll in top half and contextual B-roll in bottom half", () => {
  const { project, clipId } = createSample16x9Project();

  const reframed = reframeProject(project, "split-screen");

  // 1. Aspect ratio converted to 9:16
  assert.equal(reframed.settings.aspectRatio, "9:16");

  // 2. A-roll clip positioned in top half (y: -0.25)
  const aRollClip = reframed.clips[clipId];
  assert.ok(aRollClip);
  assert.equal(aRollClip.transform.y, -0.25, "A-roll must be centered in upper half (y: -0.25)");
  assert.equal(aRollClip.transform.scale, 1.0);

  // 3. B-roll overlay track exists and has clip in bottom half (y: +0.25)
  const overlayTrack = reframed.tracks["track-overlay"] || Object.values(reframed.tracks).find(t => t.kind === "overlay");
  assert.ok(overlayTrack, "Overlay track must exist for split-screen");
  assert.ok(overlayTrack.clipIds.length > 0, "Overlay track must have bottom split footage");

  const bRollClip = reframed.clips[overlayTrack.clipIds[0]];
  assert.ok(bRollClip);
  assert.equal(bRollClip.transform.y, 0.25, "B-roll must be centered in lower half (y: +0.25)");
  assert.equal(bRollClip.volume, 0, "B-roll footage in bottom split must be muted");
  assert.ok(reframed.assets[bRollClip.assetId], "Contextual B-roll asset must exist in project assets");
});

test("reframeProject idempotency: toggling modes cleanly transitions without orphaned clips or tracks", () => {
  const { project } = createSample16x9Project();

  // fit-with-blur -> center-crop -> split-screen -> fit-with-blur
  const s1 = reframeProject(project, "fit-with-blur");
  assert.ok(s1.tracks["track-reframe-bg"]);
  const s1ClipCount = Object.keys(s1.clips).length;
  assert.equal(s1ClipCount, 2); // 1 fg + 1 bg

  const s2 = reframeProject(s1, "center-crop");
  assert.equal(s2.tracks["track-reframe-bg"], undefined);
  assert.equal(Object.keys(s2.clips).length, 1); // bg clip cleaned up

  const s3 = reframeProject(s2, "split-screen");
  assert.equal(s3.tracks["track-reframe-bg"], undefined);

  const s4 = reframeProject(s3, "fit-with-blur");
  assert.ok(s4.tracks["track-reframe-bg"]);
});

test("reframeProject validation: rejects invalid mode", () => {
  const { project } = createSample16x9Project();
  assert.throws(() => {
    reframeProject(project, "invalid-mode");
  }, /Unsupported reframing mode/);
});

// =========================================================================
// SECTION 2: Viral Hook & Retention Extractor Tests
// =========================================================================

test("viralHookExtractor: detects question opening hooks with high confidence", () => {
  const words = [
    { word: "Why", start: 0.0, end: 0.3 },
    { word: "does", start: 0.31, end: 0.5 },
    { word: "every", start: 0.51, end: 0.8 },
    { word: "creator", start: 0.81, end: 1.2 },
    { word: "make", start: 1.21, end: 1.5 },
    { word: "this", start: 1.51, end: 1.7 },
    { word: "fatal", start: 1.71, end: 2.1 },
    { word: "mistake", start: 2.11, end: 2.6 },
    { word: "when", start: 2.61, end: 2.9 },
    { word: "launching", start: 2.91, end: 3.4 },
    { word: "their", start: 3.41, end: 3.6 },
    { word: "business?", start: 3.61, end: 4.1 },
  ];

  const result = detectHookType(words);
  assert.equal(result.hookType, "question");
  assert.ok(result.score >= 0.85, `Expected hook score >= 0.85, got ${result.score}`);
});

test("viralHookExtractor: detects controversial statements & pattern interrupts", () => {
  const words = [
    { word: "Stop", start: 0.0, end: 0.3 },
    { word: "doing", start: 0.31, end: 0.6 },
    { word: "this", start: 0.61, end: 0.8 },
    { word: "immediately.", start: 0.81, end: 1.4 },
    { word: "Everything", start: 1.5, end: 1.9 },
    { word: "you", start: 1.91, end: 2.1 },
    { word: "were", start: 2.11, end: 2.3 },
    { word: "taught", start: 2.31, end: 2.7 },
    { word: "about", start: 2.71, end: 3.0 },
    { word: "AI", start: 3.01, end: 3.3 },
    { word: "is", start: 3.31, end: 3.5 },
    { word: "a", start: 3.51, end: 3.6 },
    { word: "complete", start: 3.61, end: 4.0 },
    { word: "lie.", start: 4.01, end: 4.5 },
  ];

  const result = detectHookType(words);
  assert.equal(result.hookType, "controversial");
  assert.ok(result.score >= 0.90, `Expected controversial score >= 0.90, got ${result.score}`);
});

test("viralHookExtractor: detects emotional & curiosity hooks", () => {
  const words = [
    { word: "This", start: 0.0, end: 0.2 },
    { word: "was", start: 0.21, end: 0.4 },
    { word: "the", start: 0.41, end: 0.5 },
    { word: "most", start: 0.51, end: 0.8 },
    { word: "insane", start: 0.81, end: 1.3 },
    { word: "mind-blowing", start: 1.31, end: 2.0 },
    { word: "discovery", start: 2.01, end: 2.6 },
    { word: "that", start: 2.61, end: 2.8 },
    { word: "saved", start: 2.81, end: 3.2 },
    { word: "my", start: 3.21, end: 3.4 },
    { word: "entire", start: 3.41, end: 3.8 },
    { word: "company.", start: 3.81, end: 4.3 },
  ];

  const result = detectHookType(words);
  assert.equal(result.hookType, "emotional");
  assert.ok(result.score >= 0.85);
});

test("viralHookExtractor: speech metrics reward optimal 150-180 WPM and penalize sluggish delivery", () => {
  // 85 words in 30 seconds = 170 WPM (Sweet spot)
  const optimalWords = Array.from({ length: 85 }, (_, i) => ({
    word: `word${i}`,
    start: Number((i * 0.35).toFixed(3)),
    end: Number(((i + 1) * 0.35).toFixed(3)),
  }));
  const optimalMetrics = calculateSpeechMetrics(optimalWords, 30);
  assert.equal(optimalMetrics.wpm, 170);
  assert.ok(optimalMetrics.densityScore >= 0.90, `Optimal density should be >= 0.90, got ${optimalMetrics.densityScore}`);

  // 35 words in 30 seconds = 70 WPM (Sluggish)
  const slowWords = Array.from({ length: 35 }, (_, i) => ({
    word: `word${i}`,
    start: Number((i * 0.85).toFixed(3)),
    end: Number(((i + 1) * 0.85).toFixed(3)),
  }));
  const slowMetrics = calculateSpeechMetrics(slowWords, 30);
  assert.equal(slowMetrics.wpm, 70);
  assert.ok(slowMetrics.densityScore < 0.60, `Slow density should be < 0.60, got ${slowMetrics.densityScore}`);
});

test("viralHookExtractor: keyword virality scores high on wealth, AI, and growth vocabulary", () => {
  const viralWords = [
    { word: "If", start: 0, end: 0.2 },
    { word: "you", start: 0.2, end: 0.4 },
    { word: "want", start: 0.4, end: 0.6 },
    { word: "passive", start: 0.6, end: 1.0 },
    { word: "income", start: 1.0, end: 1.4 },
    { word: "and", start: 1.4, end: 1.6 },
    { word: "viral", start: 1.6, end: 2.0 },
    { word: "growth", start: 2.0, end: 2.4 },
    { word: "using", start: 2.4, end: 2.7 },
    { word: "this", start: 2.7, end: 2.9 },
    { word: "secret", start: 2.9, end: 3.3 },
    { word: "AI", start: 3.3, end: 3.6 },
    { word: "formula", start: 3.6, end: 4.0 },
  ];
  const score = scoreKeywordVirality(viralWords);
  assert.ok(score >= 0.80, `Expected keyword score >= 0.80, got ${score}`);

  const neutralWords = [
    { word: "The", start: 0, end: 0.2 },
    { word: "weather", start: 0.2, end: 0.5 },
    { word: "was", start: 0.5, end: 0.7 },
    { word: "very", start: 0.7, end: 1.0 },
    { word: "quiet", start: 1.0, end: 1.3 },
    { word: "today", start: 1.3, end: 1.6 },
  ];
  const neutralScore = scoreKeywordVirality(neutralWords);
  assert.equal(neutralScore, 0);
});

test("viralHookExtractor: generates engaging viral titles", () => {
  const qTitle = generateViralTitle("question", "Why does nobody talk about this?", [
    { word: "crypto", start: 0, end: 1 },
  ]);
  assert.ok(qTitle.includes("?"), "Question title should include question mark");

  const cTitle = generateViralTitle("controversial", "Stop doing this with your money.", [
    { word: "money", start: 0, end: 1 },
  ]);
  assert.ok(cTitle.length >= 10);
});

test("viralHookExtractor: extracts ranked 30-60s viral hooks and suppresses overlapping duplicates", () => {
  // Build a synthetic 180s (3-minute) podcast transcript
  const transcript = [];
  let currentTime = 0;

  // Segment 1 (0s - 40s): Casual chit-chat (Neutral)
  const introWords = "Welcome back to the podcast everybody. Today we are joined by a great guest and we are drinking coffee and chatting about general life.".split(" ");
  for (const w of introWords) {
    transcript.push({ word: w, start: currentTime, end: currentTime + 0.35 });
    currentTime += 0.38;
  }
  currentTime = 40.0;

  // Segment 2 (40s - 90s): HIGH VIRAL HOOK (Question + Money + AI, ~38s speech)
  const viralHookWords = "Did you know that 99% of creators are wasting their time and money on the wrong AI tools? Here is the secret formula to generate passive income and explode your viral views on TikTok and YouTube. When I first tested this algorithm, my revenue doubled in thirty days without spending a single dollar on ads. The biggest breakthrough came when we automated our content pipeline, allowing us to publish ten high-retention videos every single day with maximum engagement.".split(" ");
  for (const w of viralHookWords) {
    transcript.push({ word: w, start: currentTime, end: currentTime + 0.32 });
    currentTime += 0.34;
  }
  currentTime = 100.0;

  // Segment 3 (100s - 150s): CONTROVERSIAL HOOK (Pattern Interrupt + Mistakes, ~36s speech)
  const controversialWords = "Stop making this fatal mistake before it ruins your career. The harsh truth nobody tells you about building wealth is that traditional advice is a complete lie. If you want real freedom and million dollar profit, you have to break these three rules immediately. First, stop trading your hours for wages. Second, leverage automation to scale your distribution globally. Third, focus obsessively on high-leverage digital assets.".split(" ");
  for (const w of controversialWords) {
    transcript.push({ word: w, start: currentTime, end: currentTime + 0.30 });
    currentTime += 0.33;
  }

  const hooks = extractViralHooks(transcript, {
    minDuration: 30,
    maxDuration: 60,
    topK: 3,
  });

  assert.ok(hooks.length >= 2, `Expected at least 2 viral hooks, got ${hooks.length}`);
  
  // Top hook should have high confidence (> 0.70)
  const topHook = hooks[0];
  assert.ok(topHook.confidence >= 0.70, `Top hook confidence should be >= 0.70, got ${topHook.confidence}`);
  assert.ok(topHook.duration >= 25 && topHook.duration <= 62, `Duration should be around 30-60s, got ${topHook.duration}`);
  assert.ok(["question", "controversial", "emotional"].includes(topHook.hookType));
  assert.ok(topHook.title.length > 5);

  // Verify non-overlapping intervals
  for (let i = 0; i < hooks.length; i++) {
    for (let j = i + 1; j < hooks.length; j++) {
      const overlapStart = Math.max(hooks[i].start, hooks[j].start);
      const overlapEnd = Math.min(hooks[i].end, hooks[j].end);
      const overlapDur = Math.max(0, overlapEnd - overlapStart);
      const minDur = Math.min(hooks[i].duration, hooks[j].duration);
      const overlapRatio = overlapDur / minDur;
      assert.ok(overlapRatio < 0.50, `Hooks ${i} and ${j} overlap too much (${(overlapRatio * 100).toFixed(1)}%)`);
    }
  }
});

test("viralHookExtractor: accepts an EditorProject with captions directly", () => {
  let p = createProject("editor-viral-test", "Viral Test Video");
  p.settings.aspectRatio = "16:9";

  const trackId = p.trackOrder.find((id) => p.tracks[id]?.kind === "video");
  p = addAsset(p, {
    id: "asset-raw-interview",
    name: "Podcast.mp4",
    kind: "video",
    mime: "video/mp4",
    size: 50 * 1024 * 1024,
    duration: 90,
    width: 1920,
    height: 1080,
  });

  p = addClip(p, "asset-raw-interview", trackId, 0, { duration: 90 });

  // Add captions with timed words
  const captionWords = "Why does every single person fail at building passive income? The truth nobody tells you is that you need a simple viral strategy with AI.".split(" ").map((word, i) => ({
    word,
    start: Number((i * 0.35).toFixed(2)),
    end: Number(((i + 1) * 0.35).toFixed(2)),
  }));

  const captionId = "caption-test-1";
  const captionClipId = "clip-caption-1";
  const captionTrackId = p.trackOrder.find((id) => p.tracks[id]?.kind === "caption");

  p.captions[captionId] = {
    id: captionId,
    text: captionWords.map((w) => w.word).join(" "),
    words: captionWords,
    style: {
      font: "Inter",
      size: 56,
      weight: 700,
      align: "center",
      color: "#ffffff",
      background: "transparent",
      stroke: "#000000",
      strokeWidth: 3,
      shadow: 8,
      letterSpacing: 0,
      lineHeight: 1.2,
    },
  };

  p.clips[captionClipId] = {
    id: captionClipId,
    contentId: captionId,
    trackId: captionTrackId,
    name: "Caption Clip",
    startTime: 0,
    duration: 35,
    sourceStart: 0,
    sourceEnd: 35,
    transform: { x: 0, y: 0.35, scale: 1, rotation: 0, opacity: 1 },
    volume: 0,
    speed: 1,
    fadeIn: 0,
    fadeOut: 0,
    effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
  };
  p.tracks[captionTrackId].clipIds.push(captionClipId);

  const hooks = extractViralHooks(p, { minDuration: 10, maxDuration: 40 });
  assert.ok(hooks.length >= 1, "Should extract viral hook from EditorProject captions");
  assert.ok(hooks[0].confidence > 0.6);
  assert.ok(["question", "controversial"].includes(hooks[0].hookType));
});
