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
const audioDucking = load("app/lib/editor/audioDucking.ts");
const audioMix = load("app/lib/editor/audioMix.ts");
const autoSfx = load("app/lib/editor/autoSfx.ts");
const motionGraphics = load("app/lib/editor/motionGraphics.ts");
const sequentialEdit = load("app/lib/editor/sequentialEdit.ts");
const autoEdit = load("app/lib/editor/autoEdit.ts");
const editorAudio = load("app/lib/server/render/editorAudio.ts");

function createTestProject() {
  let p = model.createProject("audio-test-proj", "Audio Test Video");
  p.settings.fps = 30;
  // Add first video clip (speech dialogue) 0 to 6s
  p = operations.addAsset(p, {
    id: "asset-speech",
    name: "dialogue.mp4",
    kind: "video",
    mime: "video/mp4",
    size: 5000000,
    duration: 10,
    width: 1920,
    height: 1080,
  });
  p = operations.addClip(p, "asset-speech", "track-video", 0, {
    id: "clip-speech-1",
    duration: 6,
    volume: 1.0,
    audioRole: "speech",
  });

  // Add second video clip 6s to 12s with a cut / transition point at 6.0s
  p = operations.addClip(p, "asset-speech", "track-video", 6, {
    id: "clip-speech-2",
    duration: 6,
    volume: 1.0,
    audioRole: "speech",
  });
  p = operations.addTransition(p, "clip-speech-1", "clip-speech-2", "dissolve", 0.5);

  // Add caption for word-grounded timing (active speech 2.0s to 5.0s with emphasis beat)
  p = operations.addCaption(
    p,
    "This is an important lesson you must remember.",
    2.0,
    3.0,
    {},
    [
      { word: "This", start: 0.0, end: 0.3 },
      { word: "is", start: 0.3, end: 0.5 },
      { word: "an", start: 0.5, end: 0.7 },
      { word: "important", start: 0.7, end: 1.4 },
      { word: "lesson", start: 1.4, end: 2.0 },
      { word: "you", start: 2.0, end: 2.3 },
      { word: "must", start: 2.3, end: 2.6 },
      { word: "remember.", start: 2.6, end: 3.0 },
    ]
  );

  // Add motion graphic callout at 7.0s
  p = motionGraphics.addMotionGraphic(p, "stat", "10x Growth", 7.0, 2.0);

  // Add background music
  p = operations.addAsset(p, {
    id: "asset-music",
    name: "background-track.mp3",
    kind: "audio",
    mime: "audio/mp3",
    size: 2000000,
    duration: 12,
    width: 0,
    height: 0,
  });
  p = operations.addClip(p, "asset-music", "track-audio", 0, {
    id: "clip-music-1",
    duration: 12,
    volume: 0.5,
    audioRole: "background",
  });

  return p;
}

test("dbToGain and gainToDb convert accurately between dB and linear amplitudes", () => {
  const g14 = audioDucking.dbToGain(-14);
  const g16 = audioDucking.dbToGain(-16);
  const g18 = audioDucking.dbToGain(-18);

  // -14dB ~ 0.1995, -16dB ~ 0.1585, -18dB ~ 0.1259
  assert.ok(Math.abs(g14 - 0.199526) < 1e-4, `Expected ~0.1995, got ${g14}`);
  assert.ok(Math.abs(g16 - 0.158489) < 1e-4, `Expected ~0.1585, got ${g16}`);
  assert.ok(Math.abs(g18 - 0.125892) < 1e-4, `Expected ~0.1259, got ${g18}`);

  assert.ok(Math.abs(audioDucking.gainToDb(g16) - -16) < 1e-4);
  assert.equal(audioDucking.gainToDb(0), -180);
});

test("ducking envelope calculates smooth 200ms attack and 500ms release with -16dB attenuation", () => {
  const intervals = [{ start: 2.0, end: 5.0 }];
  const cfg = {
    duckingDb: -16,
    attackSec: 0.2, // 200ms
    releaseSec: 0.5, // 500ms
    curve: "smooth",
  };
  const duckGain = audioDucking.dbToGain(-16); // ~0.1585

  // Idle before attack (< 1.8s) -> gain = 1.0
  assert.equal(audioDucking.calculateDuckingGain(1.0, intervals, cfg), 1.0);
  assert.equal(audioDucking.calculateDuckingGain(1.79, intervals, cfg), 1.0);
  assert.equal(audioDucking.calculateDuckingGain(1.8, intervals, cfg), 1.0);

  // Smooth attack ramp down: 1.8s to 2.0s
  const midAttack = audioDucking.calculateDuckingGain(1.9, intervals, cfg);
  assert.ok(midAttack > duckGain && midAttack < 1.0, `Mid-attack gain ${midAttack} must be between duckGain and 1.0`);
  // For cosine S-curve at 50% progress, gain is exactly duckGain + 0.5 * (1 - duckGain)
  const expectedMidAttack = duckGain + 0.5 * (1.0 - duckGain);
  assert.ok(Math.abs(midAttack - expectedMidAttack) < 1e-4);

  // Fully ducked plateau: 2.0s to 5.0s -> gain = duckGain
  assert.ok(Math.abs(audioDucking.calculateDuckingGain(2.0, intervals, cfg) - duckGain) < 1e-5);
  assert.ok(Math.abs(audioDucking.calculateDuckingGain(3.5, intervals, cfg) - duckGain) < 1e-5);
  assert.ok(Math.abs(audioDucking.calculateDuckingGain(5.0, intervals, cfg) - duckGain) < 1e-5);

  // Smooth release ramp back up: 5.0s to 5.5s
  const midRelease = audioDucking.calculateDuckingGain(5.25, intervals, cfg);
  assert.ok(midRelease > duckGain && midRelease < 1.0, `Mid-release gain ${midRelease} must be between duckGain and 1.0`);
  assert.ok(Math.abs(midRelease - expectedMidAttack) < 1e-4);

  // Idle after release (> 5.5s) -> gain = 1.0
  assert.equal(audioDucking.calculateDuckingGain(5.5, intervals, cfg), 1.0);
  assert.equal(audioDucking.calculateDuckingGain(6.0, intervals, cfg), 1.0);
});

test("ducking envelope supports linear and exponential curves", () => {
  const intervals = [{ start: 2.0, end: 4.0 }];
  const duckGain = audioDucking.dbToGain(-16);

  // Linear curve
  const linearMid = audioDucking.calculateDuckingGain(1.9, intervals, {
    duckingDb: -16,
    attackSec: 0.2,
    releaseSec: 0.5,
    curve: "linear",
  });
  const expectedLinear = 1.0 - (1.0 - duckGain) * 0.5;
  assert.ok(Math.abs(linearMid - expectedLinear) < 1e-5);

  // Exponential curve
  const expMid = audioDucking.calculateDuckingGain(1.9, intervals, {
    duckingDb: -16,
    attackSec: 0.2,
    releaseSec: 0.5,
    curve: "exponential",
  });
  assert.ok(expMid > duckGain && expMid < 1.0);
});

test("speech pause hold merges closely spaced speech windows to prevent fluttering", () => {
  // Two speech segments: 2.0s to 3.0s and 3.2s to 4.5s (gap = 0.2s <= holdGapSec 0.3s)
  const separate = [
    { start: 2.0, end: 3.0 },
    { start: 3.2, end: 4.5 },
  ];
  const merged = audioDucking.mergeSpeechIntervals(separate, 0.3);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].start, 2.0);
  assert.equal(merged[0].end, 4.5);

  // During the 0.2s pause at 3.1s, the music remains ducked at duckGain
  const gainAtPause = audioDucking.calculateDuckingGain(3.1, merged);
  const duckGain = audioDucking.dbToGain(-16);
  assert.ok(Math.abs(gainAtPause - duckGain) < 1e-5, "Music must remain ducked during brief conversational pauses");
});

test("computeDuckingEnvelope samples values accurately across timeline duration", () => {
  const intervals = [{ start: 1.0, end: 3.0 }];
  const env = audioDucking.computeDuckingEnvelope(4.0, intervals, 10);
  assert.equal(env.length, 40);
  assert.ok(env.every((val) => val >= 0.12 && val <= 1.0));
  assert.equal(env[0], 1.0); // t = 0
  assert.ok(env[20] < 0.2); // t = 2.0 (ducked)
});

test("buildFfmpegDuckingFilter generates valid FFmpeg volume filter expression", () => {
  const clip = { startTime: 0, duration: 10 };
  const intervals = [{ start: 2.0, end: 4.0 }];
  const filter = audioDucking.buildFfmpegDuckingFilter(clip, intervals, {
    duckingDb: -16,
    attackSec: 0.2,
    releaseSec: 0.5,
  });

  assert.ok(filter, "Filter must be generated");
  assert.ok(filter.startsWith("volume=eval=frame:volume='if(between(t,"));
  assert.ok(filter.includes("0.1585")); // target ducking gain
  assert.ok(filter.includes("cos(PI*")); // smooth cosine envelope
  assert.ok(filter.endsWith(")'"));
});

test("client preview smartClipGain respects audioDucking setting and role", () => {
  const p = createTestProject();
  const music = p.clips["clip-music-1"];
  const speech = p.clips["clip-speech-1"];

  // When audioDucking is disabled, gain is simply volume * fade = 0.5 * 1.0 = 0.5
  p.settings.audioDucking = false;
  assert.equal(audioDucking.smartClipGain(p, music, 3.0), 0.5);

  // When audioDucking is enabled:
  p.settings.audioDucking = true;
  const duckedGain = audioDucking.smartClipGain(p, music, 3.0);
  const expectedGain = 0.5 * audioDucking.dbToGain(-16);
  assert.ok(Math.abs(duckedGain - expectedGain) < 1e-4, `Expected ~${expectedGain}, got ${duckedGain}`);

  // Outside speech (at 0.5s), gain remains 0.5
  assert.equal(audioDucking.smartClipGain(p, music, 0.5), 0.5);

  // Speech clip itself must never be ducked!
  assert.equal(audioDucking.smartClipGain(p, speech, 3.0), 1.0);

  // Clip with ducking: false must bypass ducking
  const musicNoDuck = { ...music, ducking: false };
  assert.equal(audioDucking.smartClipGain(p, musicNoDuck, 3.0), 0.5);
});

test("server export audioClipFilter includes ducking filter when enabled", () => {
  const p = createTestProject();
  p.settings.audioDucking = true;
  const music = p.clips["clip-music-1"];
  const speech = p.clips["clip-speech-1"];

  // Music clip filter includes ducking filter
  const musicFilter = editorAudio.audioClipFilter(music, 1, "music_mix", p);
  assert.ok(musicFilter.includes("volume=eval=frame:volume="), "Music filter must contain ducking volume filter");
  assert.ok(musicFilter.includes("adelay="));
  assert.ok(musicFilter.endsWith("[music_mix]"));

  // Speech clip filter does NOT include ducking filter
  const speechFilter = editorAudio.audioClipFilter(speech, 2, "speech_mix", p);
  assert.ok(!speechFilter.includes("volume=eval=frame:volume="), "Speech filter must not duck itself");

  // Backward compatibility: calling without project preserves original filter chain
  const legacyFilter = editorAudio.audioClipFilter(music, 1, "legacy_mix");
  assert.ok(!legacyFilter.includes("volume=eval=frame:volume="));
});

test("suggestContextualSfx identifies cuts, transitions, graphics and climaxes with restrained volume (0.08–0.18)", () => {
  const p = createTestProject();
  const suggestions = autoSfx.suggestContextualSfx(p);
  assert.ok(suggestions.length >= 3, `Expected at least 3 suggestions, got ${suggestions.length}`);

  // Check types of suggestions
  const types = suggestions.map((s) => s.type);
  assert.ok(types.includes("whoosh"), "Must include whoosh for transition/cut");
  assert.ok(types.includes("pop"), "Must include pop for graphic appearance");
  assert.ok(types.includes("riser"), "Must include riser before speech climax");

  // Every single SFX volume MUST be strictly between 0.08 and 0.18
  for (const sfx of suggestions) {
    assert.ok(
      sfx.volume >= 0.08 && sfx.volume <= 0.18,
      `SFX ${sfx.name} volume ${sfx.volume} violates restrained volume bounds [0.08, 0.18]`
    );
  }

  // Risers must crescendo right into the climax cue
  const riser = suggestions.find((s) => s.type === "riser");
  if (riser) {
    assert.ok(riser.startTime + riser.duration >= riser.cueTimestamp - 0.2);
  }
});

test("createAutoSfxDecisions generates valid EditDecisions and MediaAssets", () => {
  const p = createTestProject();
  const { decisions, assets, suggestions } = autoSfx.createAutoSfxDecisions(p);

  assert.ok(decisions.length > 0);
  assert.ok(assets.length > 0);
  assert.equal(decisions.length, suggestions.length);

  for (const d of decisions) {
    assert.equal(d.op, "addClip");
    assert.equal(d.audioRole, "sfx");
    assert.ok(d.volume >= 0.08 && d.volume <= 0.18);
  }
});

test("applyContextualSfx inserts audible restrained SFX clips on audio track", () => {
  const p = createTestProject();
  const { project: next, placed, suggestions } = autoSfx.applyContextualSfx(p);

  assert.ok(placed.length > 0);
  assert.equal(placed.length, suggestions.length);

  for (const clip of placed) {
    assert.equal(clip.audioRole, "sfx");
    assert.ok(clip.volume >= 0.08 && clip.volume <= 0.18);
    const asset = next.assets[clip.assetId];
    assert.ok(asset, `Asset ${clip.assetId} must exist in project`);
    assert.equal(asset.kind, "audio");
  }
});

test("sequentialEdit explicitOperations recognises duck music under speech and add subtle sound effects automatically", () => {
  const duckOnly = sequentialEdit.explicitOperations("duck music under speech");
  assert.deepEqual(duckOnly, ["effects"]);

  const sfxOnly = sequentialEdit.explicitOperations("add subtle sound effects automatically");
  assert.deepEqual(sfxOnly, ["soundEffects"]);

  const both = sequentialEdit.explicitOperations("duck music under speech and add subtle sound effects automatically");
  assert.ok(both?.includes("effects") && both?.includes("soundEffects"));

  // Negative constraints or ambiguous free-form requests defer to AI analysis (return undefined)
  assert.equal(sequentialEdit.explicitOperations("Do not add captions. Make this engaging."), undefined);
  assert.equal(sequentialEdit.explicitOperations("Only add captions without zooms"), undefined);
});

test("autoEdit supports soundEffects and audioDucking options", () => {
  let p = createTestProject();
  const finish = autoEdit.finishAutoEditPlan;
  const options = {
    ...autoEdit.DEFAULT_AUTO_EDIT,
    soundEffects: true,
    audioDucking: true,
  };

  const plan = finish(p, { version: 1, projectId: p.id, baseRevision: p.revision, decisions: [] }, [], [], options);
  assert.equal(plan.reviewed.settings.audioDucking, true);

  // Contextual SFX clips are inserted
  const sfxClips = Object.values(plan.reviewed.clips).filter((c) => c.audioRole === "sfx");
  assert.ok(sfxClips.length > 0, "Must contain placed SFX clips");
  for (const clip of sfxClips) {
    assert.ok(clip.volume >= 0.08 && clip.volume <= 0.18);
  }
});
