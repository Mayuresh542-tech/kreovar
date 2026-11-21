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
  mocks = {
    "app/lib/supabase.ts": { supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } },
    ...mocks,
  };
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
      specifier.startsWith("@/")
        ? load(specifier.slice(2))
        : specifier.startsWith(".")
        ? load(path.relative(root, path.resolve(path.dirname(filename), specifier)))
        : require(specifier);
    new vm.Script(`(function(require,module,exports){${source}\n})`, { filename }).runInThisContext()(
      localRequire,
      loadedModule,
      loadedModule.exports
    );
    return loadedModule.exports;
  }
  return load;
}

const load = loader();
const model = load("app/lib/editor/model.ts");
const operations = load("app/lib/editor/operations.ts");

// 1. Audio ducking
const audioDucking = load("app/lib/editor/audioDucking.ts");
const audioMix = load("app/lib/editor/audioMix.ts");
const autoSfx = load("app/lib/editor/autoSfx.ts");

// 2. Motion & Ken Burns
const kenBurns = load("app/lib/editor/kenBurns.ts");
const mediaAnimation = load("app/lib/editor/mediaAnimation.ts");
const kineticStickers = load("app/lib/editor/kineticStickers.ts");

// 3. UX & Shortcuts
const shortcuts = load("app/lib/editor/shortcuts.ts");
const demoProject = load("app/lib/editor/demoProject.ts");

// 4. Repurposing & Viral
const reframing = load("app/lib/editor/reframing.ts");
const viralHookExtractor = load("app/lib/editor/viralHookExtractor.ts");

// Mock HTMLElement for Node environment
class FakeElement {
  constructor(selectors) {
    this.selectors = selectors;
  }
  closest(sel) {
    return this.selectors.some((s) => sel.includes(s)) ? this : null;
  }
}
globalThis.HTMLElement = FakeElement;

function createMockProject() {
  let p = model.createProject("proj-test", "Test Project");
  p.settings.audioDucking = true;

  const videoAsset = {
    id: "asset-video",
    name: "main_talk.mp4",
    kind: "video",
    mime: "video/mp4",
    size: 1000000,
    duration: 10,
    width: 1920,
    height: 1080,
  };
  const brollAsset = {
    id: "asset-broll",
    name: "tech_cutaway.mp4",
    kind: "video",
    mime: "video/mp4",
    size: 500000,
    duration: 4,
    width: 1920,
    height: 1080,
  };
  const musicAsset = {
    id: "asset-music",
    name: "background_music.mp3",
    kind: "audio",
    mime: "audio/mp3",
    size: 500000,
    duration: 10,
    width: 0,
    height: 0,
  };

  p = operations.addAsset(p, videoAsset);
  p = operations.addAsset(p, brollAsset);
  p = operations.addAsset(p, musicAsset);

  p = operations.addClip(p, "asset-video", "track-video", 0, {
    id: "clip-main-video",
    duration: 10,
    audioRole: "speech",
  });

  p = operations.addClip(p, "asset-broll", "track-overlay", 2, {
    id: "clip-broll",
    duration: 4,
    volume: 0,
  });

  p = operations.addClip(p, "asset-music", "track-audio", 0, {
    id: "clip-music",
    duration: 10,
    volume: 0.8,
    audioRole: "background",
    ducking: true,
  });

  return p;
}

test("1. Audio Auto-Ducking Envelope & Distortion Free Attenuation", async (t) => {
  await t.test("envelope calculates smooth 200ms attack and 500ms release without distortion", () => {
    const speechWindows = [{ start: 2.0, end: 5.0 }];
    const config = { ...audioDucking.DEFAULT_DUCKING_CONFIG, attackSec: 0.2, releaseSec: 0.5, duckingDb: -16 };

    // Before attack (t = 1.0s): fully unducked (gain = 1.0)
    const gainBefore = audioDucking.calculateDuckingGain(1.0, speechWindows, config);
    assert.equal(gainBefore, 1.0);

    // During attack (t = 1.9s, between attackStart 1.8s and speech start 2.0s): intermediate ducking gain
    const gainAttack = audioDucking.calculateDuckingGain(1.9, speechWindows, config);
    const targetGain = audioDucking.dbToGain(-16);
    assert.ok(gainAttack < 1.0, "Gain must attenuate during attack");
    assert.ok(gainAttack > targetGain, "Gain must be between 1.0 and targetGain during attack");

    // Fully ducked (t = 3.0s): target ducking gain (~0.1585)
    const gainDucked = audioDucking.calculateDuckingGain(3.0, speechWindows, config);
    assert.ok(Math.abs(gainDucked - targetGain) < 0.001, "Gain must reach target ducking level");

    // During release (t = 5.25s): restoring toward 1.0
    const gainRelease = audioDucking.calculateDuckingGain(5.25, speechWindows, config);
    assert.ok(gainRelease > targetGain, "Gain must ramp up during release");
    assert.ok(gainRelease < 1.0, "Gain must not exceed 1.0 during release");

    // After release (t = 6.0s): fully restored
    const gainRestored = audioDucking.calculateDuckingGain(6.0, speechWindows, config);
    assert.equal(gainRestored, 1.0);
  });

  await t.test("envelope values remain strictly bounded in [0, 1] with zero NaN or Infinity", () => {
    const windows = [
      { start: 0.0, end: 1.5 },
      { start: 1.7, end: 3.0 }, // gap < 300ms hold merge
      { start: 5.0, end: 8.0 },
    ];
    const envelope = audioDucking.computeDuckingEnvelope(10.0, windows, 30);
    assert.ok(envelope.length > 0);
    for (let i = 0; i < envelope.length; i++) {
      const g = envelope[i];
      assert.ok(Number.isFinite(g), "Gain must be finite");
      assert.ok(g >= 0 && g <= 1.0, `Gain ${g} must be bounded [0, 1]`);
    }
  });

  await t.test("FFmpeg ducking filter string generation produces valid piecewise cosine expression", () => {
    const p = createMockProject();
    const musicClip = p.clips["clip-music"];
    const windows = [{ start: 1.0, end: 4.0 }];
    const filter = audioDucking.buildFfmpegDuckingFilter(musicClip, windows, { duckingDb: -16, attackSec: 0.2, releaseSec: 0.5 });
    assert.ok(filter, "Filter must be generated for intersecting music clip");
    assert.ok(filter.startsWith("volume=eval=frame:volume='if(between(t,"), "Filter must start with volume=eval=frame");
    assert.ok(filter.includes("0.1585"), "Filter must include target gain amplitude");
  });

  await t.test("client preview smartClipGain respects audioRole and project ducking settings", () => {
    const p = createMockProject();
    const musicClip = p.clips["clip-music"];
    const windows = [{ start: 2.0, end: 6.0 }];

    // During speech window (t = 3.5s): background music should be ducked
    const duckedGain = audioDucking.smartClipGain(p, musicClip, 3.5, windows);
    assert.ok(duckedGain < musicClip.volume, "Background music gain must be reduced during speech");

    // Outside speech window (t = 8.0s): background music should be full volume
    const unduckedGain = audioDucking.smartClipGain(p, musicClip, 8.0, windows);
    assert.ok(Math.abs(unduckedGain - musicClip.volume) < 0.001, "Background music gain must be full volume outside speech");
  });
});

test("2. Ken Burns Dynamic Motion & Kinetic Stickers Integration", async (t) => {
  await t.test("Ken Burns transforms apply uniform scaling without NaN or aspect ratio distortion", () => {
    const presets = ["ken-burns-push", "ken-burns-pull", "ken-burns-pan-left", "ken-burns-pan-right"];
    for (const preset of presets) {
      for (const progress of [0, 0.25, 0.5, 0.75, 1.0]) {
        const frame = kenBurns.calculateKenBurnsFrame(preset, progress);
        assert.ok(Number.isFinite(frame.scale), `Scale must be finite for ${preset} at ${progress}`);
        assert.ok(Number.isFinite(frame.x), `X must be finite for ${preset} at ${progress}`);
        assert.ok(Number.isFinite(frame.y), `Y must be finite for ${preset} at ${progress}`);
        assert.ok(frame.scale >= 1.0, `Scale ${frame.scale} must be >= 1.0 to avoid black borders`);
      }
    }
  });

  await t.test("Ken Burns push moves 1.00x -> 1.08x and pull moves 1.08x -> 1.00x", () => {
    const pushStart = kenBurns.calculateKenBurnsFrame("ken-burns-push", 0);
    const pushEnd = kenBurns.calculateKenBurnsFrame("ken-burns-push", 1.0);
    assert.equal(pushStart.scale, 1.0);
    assert.ok(Math.abs(pushEnd.scale - 1.08) < 0.001);

    const pullStart = kenBurns.calculateKenBurnsFrame("ken-burns-pull", 0);
    const pullEnd = kenBurns.calculateKenBurnsFrame("ken-burns-pull", 1.0);
    assert.ok(Math.abs(pullStart.scale - 1.08) < 0.001);
    assert.equal(pullEnd.scale, 1.0);
  });

  await t.test("autoApplyKenBurnsToBroll distributes rhythmic presets to overlay clips", () => {
    const p = createMockProject();
    const { project: updated, modifiedClipIds } = kenBurns.autoApplyKenBurnsToBroll(p);
    assert.equal(modifiedClipIds.length, 1);
    const brollClip = updated.clips["clip-broll"];
    assert.ok(brollClip.mediaAnimation?.kenBurns, "B-roll clip must have Ken Burns assigned");
    assert.equal(brollClip.mediaAnimation.kenBurns, "ken-burns-push");
  });

  await t.test("kinetic sticker dictionary has valid SVGs and emojis for all 10 core categories", () => {
    const categories = ["money", "fire", "rocket", "warning", "growth", "skull", "heart", "star", "target", "idea"];
    for (const cat of categories) {
      const def = kineticStickers.KINETIC_STICKERS_DICTIONARY[cat];
      assert.ok(def, `Dictionary entry for ${cat} must exist`);
      assert.ok(def.emoji.length > 0, `Emoji for ${cat} must not be empty`);
      assert.ok(def.svg.includes("<svg"), `SVG for ${cat} must contain <svg`);
      assert.ok(def.keywords.length >= 3, `Keywords for ${cat} must have >= 3 words`);
    }
  });

  await t.test("detectKeywordMoments detects punch words and enforces interval cooldown", () => {
    const timedWords = [
      { word: "This", start: 0.1, end: 0.4 },
      { word: "is", start: 0.5, end: 0.7 },
      { word: "insane", start: 0.8, end: 1.2 }, // fire keyword
      { word: "hype", start: 1.4, end: 1.8 },   // fire keyword, but within 1.4s cooldown
      { word: "revenue", start: 3.0, end: 3.5 }, // money keyword, after cooldown
    ];
    const moments = kineticStickers.detectKeywordMoments(timedWords, { minInterval: 1.4 });
    assert.equal(moments.length, 2, "Must detect exactly 2 punch moments due to cooldown");
    assert.equal(moments[0].sticker.id, "fire");
    assert.equal(moments[1].sticker.id, "money");
  });

  await t.test("detectAndApplyKineticStickers creates timeline graphic clips seamlessly", () => {
    let p = createMockProject();
    // Add captions with words to mock project so detectAndApplyKineticStickers detects them
    p.captions["cap-1"] = {
      id: "cap-1",
      text: "Launch profit",
      style: { ...model.defaultStyle },
      words: [
        { word: "Launch", start: 1.0, end: 1.4 },
        { word: "profit", start: 4.0, end: 4.5 },
      ],
    };
    p.clips["clip-cap-1"] = {
      id: "clip-cap-1",
      trackId: "track-caption",
      contentId: "cap-1",
      name: "Captions",
      startTime: 0,
      duration: 10,
      sourceStart: 0,
      sourceEnd: 10,
      transform: { ...model.defaultTransform },
      volume: 0,
      speed: 1,
      fadeIn: 0,
      fadeOut: 0,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
    };
    p.tracks["track-caption"].clipIds.push("clip-cap-1");

    const { project: updated, placedCount, moments } = kineticStickers.detectAndApplyKineticStickers(p);
    assert.equal(placedCount, 2);
    assert.equal(moments.length, 2);
    // Verify graphic clips exist
    const stickerClips = Object.values(updated.clips).filter((c) => c.name.startsWith("Sticker:"));
    assert.equal(stickerClips.length, 2);
  });
});

test("3. NLE Keyboard Shortcuts Suite & Preloaded Demo Project", async (t) => {
  await t.test("shortcut resolution triggers expected actions on standard editing keys", () => {
    assert.equal(shortcuts.resolveShortcutAction({ key: " " }), "toggle-play");
    assert.equal(shortcuts.resolveShortcutAction({ key: "j" }), "shuttle-backward");
    assert.equal(shortcuts.resolveShortcutAction({ key: "k" }), "shuttle-pause");
    assert.equal(shortcuts.resolveShortcutAction({ key: "l" }), "shuttle-forward");
    assert.equal(shortcuts.resolveShortcutAction({ key: "s" }), "split-clip");
    assert.equal(shortcuts.resolveShortcutAction({ key: "Delete" }), "delete-clip");
    assert.equal(shortcuts.resolveShortcutAction({ key: "Delete", shiftKey: true }), "ripple-delete-clip");
    assert.equal(shortcuts.resolveShortcutAction({ key: "z", ctrlKey: true }), "undo");
    assert.equal(shortcuts.resolveShortcutAction({ key: "z", ctrlKey: true, shiftKey: true }), "redo");
    assert.equal(shortcuts.resolveShortcutAction({ key: "y", ctrlKey: true }), "redo");
    assert.equal(shortcuts.resolveShortcutAction({ key: "m" }), "toggle-mute");
    assert.equal(shortcuts.resolveShortcutAction({ key: "?" }), "toggle-shortcuts-modal");
  });

  await t.test("shortcuts are completely suppressed during text input or AI chat prompt", () => {
    const mockInput = new FakeElement(["input"]);
    assert.equal(shortcuts.resolveShortcutAction({ key: " ", target: mockInput }), null);
    assert.equal(shortcuts.resolveShortcutAction({ key: "s", target: mockInput }), null);
    assert.equal(shortcuts.resolveShortcutAction({ key: "j", target: mockInput }), null);

    const mockChatPrompt = new FakeElement([".ai-chat-prompt"]);
    assert.equal(shortcuts.resolveShortcutAction({ key: " ", target: mockChatPrompt }), null);
    assert.equal(shortcuts.resolveShortcutAction({ key: "Delete", target: mockChatPrompt }), null);

    const mockDialog = new FakeElement(["dialog"]);
    assert.equal(shortcuts.resolveShortcutAction({ key: "Escape", target: mockDialog }), "escape");
  });

  await t.test("splitTopmostUnmutedClipAtPlayhead respects track priority and splits cleanly", () => {
    const p = createMockProject();
    // At t = 3.0s, both track-video (main-video) and track-overlay (broll) are present
    // Overlay has higher visual priority (priority 1 vs video priority 2)
    const { nextProject, splitClipId, wasTopmostFallback } = shortcuts.splitTopmostUnmutedClipAtPlayhead(p, 3.0, []);
    assert.equal(splitClipId, "clip-broll", "Must split higher priority overlay clip first");
    assert.equal(wasTopmostFallback, true);
    // Check that split produced 2 clips on track-overlay
    assert.equal(nextProject.tracks["track-overlay"].clipIds.length, 2);
  });

  await t.test("deleteOrRippleDeleteClips removes clip and closes gap when ripple: true", () => {
    let p = createMockProject();
    // Add a second clip downstream on video track
    const asset = p.assets["asset-video"];
    p = operations.addClip(p, "asset-video", "track-video", 12, {
      id: "clip-video-2",
      duration: 5,
    });

    // Ripple delete first clip (duration 10s)
    const afterRipple = shortcuts.deleteOrRippleDeleteClips(p, ["clip-main-video"], { ripple: true });
    assert.equal(afterRipple.clips["clip-main-video"], undefined, "Deleted clip must be removed");
    const shiftedClip = afterRipple.clips["clip-video-2"];
    assert.ok(shiftedClip, "Downstream clip must survive");
    assert.equal(shiftedClip.startTime, 2, "Downstream clip must shift left by 10s (12 -> 2)");
  });

  await t.test("preloaded demo project is valid 15-second 9:16 vertical video", () => {
    const demo = demoProject.createDemoProject();
    assert.ok(demoProject.isDemoProject(demo.id));
    assert.equal(demo.settings.aspectRatio, "9:16");
    assert.ok(demo.tracks["track-video"]);
    assert.ok(demo.tracks["track-overlay"]);
    assert.ok(demo.tracks["track-caption"]);
    assert.ok(demo.tracks["track-audio"]);
    // Has timed word captions
    const captions = Object.values(demo.captions);
    assert.ok(captions.length > 0);
    assert.ok(captions[0].words && captions[0].words.length > 0);
  });
});

test("4. 1-Click 16:9 to 9:16 Smart Reframing & Viral Hook Extraction", async (t) => {
  await t.test("fit-with-blur scales foreground to fit 9:16 width and generates blurred background wings", () => {
    const p = createMockProject();
    p.settings.aspectRatio = "16:9";

    const reframed = reframing.reframeProject(p, "fit-with-blur", { blurAmount: 25 });
    assert.equal(reframed.settings.aspectRatio, "9:16");
    assert.ok(reframed.tracks[reframing.REFRAME_BACKGROUND_TRACK_ID], "Background track must be created");
    assert.equal(reframed.trackOrder[0], reframing.REFRAME_BACKGROUND_TRACK_ID, "Background track must be first in trackOrder (behind video)");

    // Background clip is muted and blurred
    const bgTrack = reframed.tracks[reframing.REFRAME_BACKGROUND_TRACK_ID];
    const bgClip = reframed.clips[bgTrack.clipIds[0]];
    assert.equal(bgClip.volume, 0, "Background wing clip must be muted");
    assert.equal(bgClip.effects.blur, 25, "Background wing clip must have blur applied");
    assert.ok(bgClip.transform.scale >= 3.0, "Background clip must scale >= 3.0x to fill vertical frame");
  });

  await t.test("center-crop punches in 1.77x centered at upper-third eye-line (focusY: -0.14)", () => {
    const p = createMockProject();
    p.settings.aspectRatio = "16:9";

    const reframed = reframing.reframeProject(p, "center-crop");
    assert.equal(reframed.settings.aspectRatio, "9:16");
    const videoClip = reframed.clips["clip-main-video"];
    assert.equal(videoClip.transform.scale, 1.77, "Scale must punch in 1.77x");
    assert.equal(videoClip.transform.y, -0.14, "Y offset must be at eye-line -0.14");
    assert.equal(reframed.tracks[reframing.REFRAME_BACKGROUND_TRACK_ID], undefined, "Background wings must be cleaned up");
  });

  await t.test("split-screen positions A-roll top half and B-roll bottom half", () => {
    const p = createMockProject();
    p.settings.aspectRatio = "16:9";

    const reframed = reframing.reframeProject(p, "split-screen");
    assert.equal(reframed.settings.aspectRatio, "9:16");
    const videoClip = reframed.clips["clip-main-video"];
    const brollClip = reframed.clips["clip-broll"];
    assert.equal(videoClip.transform.y, -0.25, "A-roll must be placed in top half (y: -0.25)");
    assert.equal(brollClip.transform.y, 0.25, "B-roll must be placed in bottom half (y: +0.25)");
    assert.equal(brollClip.volume, 0, "B-roll in split-screen must be muted");
  });

  await t.test("reframeProject mode transitions are idempotent and clean up prior tracks", () => {
    const p = createMockProject();
    const fit = reframing.reframeProject(p, "fit-with-blur");
    assert.ok(fit.tracks[reframing.REFRAME_BACKGROUND_TRACK_ID]);

    const crop = reframing.reframeProject(fit, "center-crop");
    assert.equal(crop.tracks[reframing.REFRAME_BACKGROUND_TRACK_ID], undefined, "Background track must be cleanly removed");

    const split = reframing.reframeProject(crop, "split-screen");
    assert.equal(split.tracks[reframing.REFRAME_BACKGROUND_TRACK_ID], undefined);
    assert.equal(split.settings.aspectRatio, "9:16");
  });

  await t.test("viralHookExtractor classifies hook types, speech pacing, and extracts ranked intervals", () => {
    const transcript = [
      { text: "Why do 99% of creators fail to make money online in their first year?", start: 0, end: 5 },
      { text: "Here is the exact framework to scale your revenue to ten thousand dollars a month using simple AI automation.", start: 5, end: 12 },
      { text: "First, you need to understand that the biggest mistake people make is focusing on views instead of retention.", start: 12, end: 20 },
      { text: "When you analyze the watch time graph, notice this sudden drop right at thirty seconds.", start: 20, end: 28 },
      { text: "If you want to fix this, never start your video with a generic greeting or channel introduction.", start: 28, end: 36 },
      { text: "Jump straight into the promise and deliver undeniable proof within the first five seconds.", start: 36, end: 44 },
    ];

    const hooks = viralHookExtractor.extractViralHooks(transcript, { minDuration: 30, maxDuration: 60, topK: 2 });
    assert.ok(hooks.length > 0, "Must extract at least 1 viral hook segment");
    assert.ok(hooks[0].confidence > 0.60, `Hook confidence ${hooks[0].confidence} should be > 0.60`);
    assert.equal(hooks[0].hookType, "question", "Opening question must be classified as question hook");
    assert.ok(hooks[0].duration >= 25 && hooks[0].duration <= 60, "Hook duration must be in target window");
    assert.ok(hooks[0].title.length > 5, "Title must be generated");
  });
});
