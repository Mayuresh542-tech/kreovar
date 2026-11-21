import assert from "node:assert/strict";
import { test, describe } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const ts = require("typescript");

function loader(mocks = {}) {
  const baseMocks = {
    "app/lib/supabase.ts": {
      supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
    },
    "app/lib/server/planUsage.ts": {
      withUsage: (h) => h,
      reserveUsage: async () => ({ reservationId: "test-usage" }),
      finishUsage: async () => {},
      PlanLimitError: class extends Error {},
      usageError: () => new Response("{}", { status: 503 }),
    },
    "app/lib/server/speechDuration.ts": { speechDuration: async () => 1 },
    ...mocks,
  };

  const cache = new Map();
  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) filename += ".ts";
    const key = path.relative(root, filename).replaceAll("\\", "/");
    if (Object.hasOwn(baseMocks, key)) return baseMocks[key];
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule);
    const source = ts
      .transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          esModuleInterop: true,
          target: ts.ScriptTarget.ES2022,
        },
      })
      .outputText.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(filename).href));
    const localRequire = (specifier) =>
      specifier.startsWith("@/")
        ? load(specifier.slice(2))
        : specifier.startsWith(".")
        ? load(path.relative(root, path.resolve(path.dirname(filename), specifier)))
        : require(specifier);
    new vm.Script(`(function(require,module,exports){\n${source}\n})`, { filename }).runInThisContext()(
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
const captionTemplates = load("app/lib/editor/captionTemplates.ts");
const refTemplates = load("app/lib/captions/referenceTemplates.ts");
const storeMod = load("app/lib/editor/store.ts");

function deepFreeze(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  Object.freeze(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const val = obj[key];
    if (val !== null && typeof val === "object" && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

describe("R2 Empirical Challenge: Inspector State Mutations & Immutability", () => {
  function createPopulatedProject() {
    let p = model.createProject("r2-challenge-project", "R2 Challenge Video");
    // Add assets
    const videoAsset = {
      id: "asset-v1",
      kind: "video",
      name: "Speaker Main Video",
      duration: 10,
      width: 1920,
      height: 1080,
      url: "https://example.com/video1.mp4",
      size: 1000,
      mime: "video/mp4",
    };
    const videoAsset2 = {
      id: "asset-v2",
      kind: "video",
      name: "Replacement Video",
      duration: 15,
      width: 1920,
      height: 1080,
      url: "https://example.com/video2.mp4",
      size: 1500,
      mime: "video/mp4",
    };
    const audioAsset = {
      id: "asset-a1",
      kind: "audio",
      name: "Background Music",
      duration: 20,
      url: "https://example.com/audio1.mp3",
      size: 500,
      mime: "audio/mp3",
    };
    p = operations.addAsset(p, videoAsset);
    p = operations.addAsset(p, videoAsset2);
    p = operations.addAsset(p, audioAsset);

    // Add clips
    p = operations.addClip(p, "asset-v1", "track-video", 0, { duration: 5 });
    p = operations.addClip(p, "asset-v1", "track-video", 5, { duration: 5 });
    p = operations.addClip(p, "asset-a1", "track-audio", 0, { duration: 8 });
    p = operations.addText(p, "Title Text Layer", 0, { size: 40 }, false, 4);
    p = operations.addCaption(
      p,
      "Welcome to this video guide",
      0,
      3,
      {},
      [
        { word: "Welcome", start: 0, end: 0.6 },
        { word: "to", start: 0.6, end: 1.0 },
        { word: "this", start: 1.0, end: 1.4 },
        { word: "video", start: 1.4, end: 2.0 },
        { word: "guide", start: 2.0, end: 3.0 },
      ]
    );

    return p;
  }

  test("changeClipProperty updates project cleanly without mutating historical snapshots in-place", () => {
    const p = createPopulatedProject();
    const clipId = Object.keys(p.clips)[0];
    const store = new storeMod.EditorStore(p);

    // Deep freeze original snapshot
    const snap0 = store.getSnapshot();
    deepFreeze(snap0);

    // Execute transform mutation
    store.execute((proj) =>
      operations.changeClipProperty(proj, clipId, {
        transform: { ...proj.clips[clipId].transform, scale: 1.5, opacity: 0.8, x: 10, y: -5 },
      })
    );

    const snap1 = store.getSnapshot();
    assert.notEqual(snap1, snap0, "Snapshot reference must be distinct");
    assert.equal(snap1.clips[clipId].transform.scale, 1.5);
    assert.equal(snap1.clips[clipId].transform.opacity, 0.8);
    assert.equal(snap0.clips[clipId].transform.scale, 1, "Historical snapshot must not be mutated");

    // Deep freeze snap1 and execute timing/effects mutation
    deepFreeze(snap1);
    store.execute((proj) =>
      operations.changeClipProperty(proj, clipId, {
        speed: 2,
        fadeIn: 0.5,
        fadeOut: 0.5,
        effects: { brightness: 15, contrast: 10, saturation: -5, blur: 2 },
        audioRole: "speech",
        ducking: true,
      })
    );

    const snap2 = store.getSnapshot();
    assert.notEqual(snap2, snap1);
    assert.equal(snap2.clips[clipId].speed, 2);
    const expectedDuration = (snap1.clips[clipId].sourceEnd - snap1.clips[clipId].sourceStart) / 2;
    assert.equal(snap2.clips[clipId].duration, expectedDuration, "Duration must be recalculated based on speed");
    assert.equal(snap2.clips[clipId].audioRole, "speech");
    assert.equal(snap2.clips[clipId].ducking, true);
    assert.equal(snap1.clips[clipId].speed, 1, "Historical snap1 speed must remain 1");

    // Test undo restores previous clean state
    store.undo();
    assert.equal(store.getSnapshot().clips[clipId].speed, 1);
    store.undo();
    assert.equal(store.getSnapshot().clips[clipId].transform.scale, 1);
  });

  test("moveClip and trimClip update project cleanly without mutating historical snapshots in-place", () => {
    const p = createPopulatedProject();
    const clipId = Object.keys(p.clips)[0];
    const store = new storeMod.EditorStore(p);

    const snap0 = store.getSnapshot();
    deepFreeze(snap0);

    // moveClip
    store.execute((proj) => operations.moveClip(proj, clipId, 2.5));
    const snap1 = store.getSnapshot();
    assert.notEqual(snap1, snap0);
    assert.equal(snap1.clips[clipId].startTime, 2.5);
    assert.equal(snap0.clips[clipId].startTime, 0, "Historical start time must remain 0");

    deepFreeze(snap1);
    // trimClip right
    store.execute((proj) => operations.trimClip(proj, clipId, "right", 6.0));
    const snap2 = store.getSnapshot();
    assert.notEqual(snap2, snap1);
    assert.equal(snap2.clips[clipId].duration, 3.5);
    assert.equal(snap1.clips[clipId].duration, 5, "Historical duration must remain 5");

    deepFreeze(snap2);
    // trimClip left
    store.execute((proj) => operations.trimClip(proj, clipId, "left", 3.0));
    const snap3 = store.getSnapshot();
    assert.notEqual(snap3, snap2);
    assert.equal(snap3.clips[clipId].startTime, 3.0);
    assert.equal(snap3.clips[clipId].duration, 3.0);
    assert.equal(snap2.clips[clipId].startTime, 2.5, "Historical start time must remain 2.5");

    store.undo();
    assert.equal(store.getSnapshot().clips[clipId].startTime, 2.5);
    store.undo();
    assert.equal(store.getSnapshot().clips[clipId].duration, 5);
  });

  test("replaceClipAsset updates project cleanly without mutating historical snapshots in-place", () => {
    const p = createPopulatedProject();
    const clipId = Object.keys(p.clips)[0];
    const store = new storeMod.EditorStore(p);

    const snap0 = store.getSnapshot();
    deepFreeze(snap0);

    store.execute((proj) => operations.replaceClipAsset(proj, clipId, "asset-v2", 1.0));
    const snap1 = store.getSnapshot();
    assert.notEqual(snap1, snap0);
    assert.equal(snap1.clips[clipId].assetId, "asset-v2");
    assert.equal(snap1.clips[clipId].sourceStart, 1.0);
    assert.equal(snap0.clips[clipId].assetId, "asset-v1", "Historical assetId must remain asset-v1");
    assert.equal(snap0.clips[clipId].sourceStart, 0, "Historical sourceStart must remain 0");

    // Replace with too short asset must throw without corrupting state
    const tooShortAsset = {
      id: "asset-short",
      kind: "video",
      name: "Short Clip",
      duration: 1.0,
      url: "https://example.com/short.mp4",
      size: 100,
      mime: "video/mp4",
    };
    store.execute((proj) => operations.addAsset(proj, tooShortAsset));
    assert.throws(
      () => store.execute((proj) => operations.replaceClipAsset(proj, clipId, "asset-short", 0)),
      /Replacement is too short/
    );
  });

  test("changeText and applyCaptionTemplate update project cleanly without mutating historical snapshots in-place", () => {
    const p = createPopulatedProject();
    const textClip = Object.values(p.clips).find((c) => p.tracks[c.trackId].kind === "text");
    const captionClip = Object.values(p.clips).find((c) => p.tracks[c.trackId].kind === "caption");
    const store = new storeMod.EditorStore(p);

    const snap0 = store.getSnapshot();
    deepFreeze(snap0);

    // changeText on text layer
    store.execute((proj) =>
      operations.changeText(proj, textClip.id, "Updated Header Title", {
        size: 50,
        font: "Montserrat",
        align: "center",
      })
    );
    const snap1 = store.getSnapshot();
    assert.notEqual(snap1, snap0);
    assert.equal(snap1.textLayers[textClip.contentId].text, "Updated Header Title");
    assert.equal(snap1.textLayers[textClip.contentId].style.font, "Montserrat");
    assert.equal(snap0.textLayers[textClip.contentId].text, "Title Text Layer", "Historical text preserved");

    deepFreeze(snap1);
    // applyCaptionTemplate on caption clip
    const template = refTemplates.ALL_CAPTION_TEMPLATES.find((t) => t.id === "study-hormozi-style");
    assert.ok(template, "study-hormozi-style template must exist");

    store.execute((proj) => captionTemplates.applyCaptionTemplate(proj, [captionClip.id], template));
    const snap2 = store.getSnapshot();
    assert.notEqual(snap2, snap1);
    assert.equal(snap2.captions[captionClip.contentId].templateId, "study-hormozi-style");
    assert.equal(snap1.captions[captionClip.contentId].templateId, undefined, "Historical caption has no templateId");

    // Undo restores cleanly
    store.undo();
    assert.equal(store.getSnapshot().captions[captionClip.contentId].templateId, undefined);
    store.undo();
    assert.equal(store.getSnapshot().textLayers[textClip.contentId].text, "Title Text Layer");
  });
});

describe("R2 Empirical Challenge: B-Roll & Overlay Insertion", () => {
  test("B-roll choice payload correctly inserts clips onto overlay track via addClip", () => {
    let p = model.createProject("broll-test-project");
    const store = new storeMod.EditorStore(p);

    const brollPayload = {
      id: "broll-pexels-9988",
      title: "Drone Beach Waves",
      duration: 12.5,
      width: 1920,
      height: 1080,
      videoUrl: "https://images.pexels.com/videos/9988/broll.mp4",
      thumbnail: "https://images.pexels.com/videos/9988/thumb.jpg",
    };

    // Simulate AssetDrawer handleAddBrollToTimeline logic
    const insertBroll = (proj, v, playheadTime) => {
      const assetId = "asset-" + v.id;
      const clipId = "clip-" + v.id;
      let overlayTrack = proj.trackOrder.map((id) => proj.tracks[id]).find((t) => t.kind === "overlay" && !t.locked);
      let next = proj;
      if (!overlayTrack) {
        next = operations.addTrack(next, "overlay");
        overlayTrack = next.tracks[next.trackOrder[next.trackOrder.length - 1]];
      }
      const asset = {
        id: assetId,
        kind: "video",
        name: v.title,
        duration: v.duration,
        width: v.width,
        height: v.height,
        url: v.videoUrl,
        thumbnail: v.thumbnail,
        size: 0,
        mime: "video/mp4",
      };
      next = operations.addAsset(next, asset);
      return operations.addClip(next, assetId, overlayTrack.id, playheadTime, {
        id: clipId,
        name: v.title,
        duration: Math.min(v.duration, 4),
      });
    };

    store.execute((proj) => insertBroll(proj, brollPayload, 2.0));
    const snap1 = store.getSnapshot();
    const clip = snap1.clips["clip-" + brollPayload.id];

    assert.ok(clip, "Clip must be added to project clips");
    assert.equal(clip.name, "Drone Beach Waves");
    assert.equal(clip.startTime, 2.0, "Start time must match playhead time");
    assert.equal(clip.duration, 4, "Duration must be clamped to max 4 seconds");
    assert.equal(snap1.tracks[clip.trackId].kind, "overlay", "Must be on an overlay track");
    assert.ok(snap1.assets[clip.assetId], "Asset must be registered in project.assets");
    assert.equal(snap1.assets[clip.assetId].kind, "video");

    // Test when overlay track is missing
    let pNoOverlay = model.createProject("no-overlay");
    delete pNoOverlay.tracks["track-overlay"];
    pNoOverlay.trackOrder = pNoOverlay.trackOrder.filter((id) => id !== "track-overlay");
    assert.equal(Object.values(pNoOverlay.tracks).some((t) => t.kind === "overlay"), false);

    const storeNoOverlay = new storeMod.EditorStore(pNoOverlay);
    storeNoOverlay.execute((proj) => insertBroll(proj, brollPayload, 0));
    const snapNoOverlay = storeNoOverlay.getSnapshot();
    const createdOverlayTrack = Object.values(snapNoOverlay.tracks).find((t) => t.kind === "overlay");
    assert.ok(createdOverlayTrack, "New overlay track must be created automatically if absent");
    assert.ok(createdOverlayTrack.clipIds.includes("clip-" + brollPayload.id));

    // Test when overlay track is locked
    let pLockedOverlay = snap1;
    pLockedOverlay = operations.changeTrack(pLockedOverlay, clip.trackId, { locked: true });
    const storeLocked = new storeMod.EditorStore(pLockedOverlay);
    const brollPayload2 = {
      id: "broll-pexels-2",
      title: "City Traffic",
      duration: 3.2,
      width: 1920,
      height: 1080,
      videoUrl: "https://example.com/traffic.mp4",
      thumbnail: "https://example.com/traffic.jpg",
    };
    storeLocked.execute((proj) => insertBroll(proj, brollPayload2, 1.0));
    const snapLocked = storeLocked.getSnapshot();
    const clip2 = snapLocked.clips["clip-" + brollPayload2.id];
    assert.ok(clip2, "Clip must be created on a newly provisioned unlocked overlay track");
    assert.notEqual(clip2.trackId, clip.trackId, "Must not be placed on the locked track");
    assert.equal(snapLocked.tracks[clip2.trackId].locked, false);
    assert.equal(clip2.duration, 3.2, "Duration < 4s is preserved without clipping");
  });

  test("addTrack enforces 30-track maximum cap matching aiValidation", () => {
    let p = model.createProject("track-cap-test");
    // Initial project has 6 tracks
    assert.equal(p.trackOrder.length, 6);
    for (let i = 6; i < 30; i++) {
      p = operations.addTrack(p, "overlay");
    }
    assert.equal(p.trackOrder.length, 30);
    assert.throws(() => operations.addTrack(p, "overlay"), /30 tracks/i);
  });
});

describe("R2 Empirical Challenge: Transitions Mapping & Adjacent Clip Validation", () => {
  test("Transitions strictly map to TransitionKind: fade, dissolve, slide, zoom", () => {
    const rawAssetDrawer = fs.readFileSync(path.resolve(root, "app/components/editor/AssetDrawer.tsx"), "utf8");
    const transitionMatches = [...rawAssetDrawer.matchAll(/kind:\s*"([a-zA-Z0-9_-]+)"\s+as\s+TransitionKind/g)].map(
      (m) => m[1]
    );

    assert.deepStrictEqual(
      new Set(transitionMatches),
      new Set(["dissolve", "fade", "slide", "zoom"]),
      "AssetDrawer transition buttons must strictly match TransitionKind"
    );
  });

  test("addTransition succeeds between adjacent visual clips for all 4 TransitionKind types", () => {
    let p = model.createProject("transitions-test");
    const asset = {
      id: "asset-tr",
      kind: "video",
      name: "Video Clip",
      duration: 10,
      url: "https://example.com/v.mp4",
      size: 100,
      mime: "video/mp4",
    };
    p = operations.addAsset(p, asset);
    p = operations.addClip(p, "asset-tr", "track-video", 0, { duration: 4 });
    p = operations.addClip(p, "asset-tr", "track-video", 4, { duration: 4 });
    p = operations.addClip(p, "asset-tr", "track-video", 8, { duration: 4 });
    const clipIds = Object.keys(p.clips);

    const kinds = ["fade", "dissolve", "slide", "zoom"];
    for (const kind of kinds) {
      const next = operations.addTransition(p, clipIds[0], clipIds[1], kind, 0.5);
      const trId = `transition-${clipIds[0]}-${clipIds[1]}`;
      assert.ok(next.transitions[trId], `Transition ${kind} must be recorded`);
      assert.equal(next.transitions[trId].kind, kind);
      assert.equal(next.transitions[trId].duration, 0.5);
    }
  });

  test("addTransition throws on non-adjacent, mismatched track, or non-visual clips", () => {
    let p = model.createProject("transitions-err-test");
    const asset = {
      id: "asset-tr",
      kind: "video",
      name: "Video Clip",
      duration: 10,
      url: "https://example.com/v.mp4",
      size: 100,
      mime: "video/mp4",
    };
    p = operations.addAsset(p, asset);
    p = operations.addClip(p, "asset-tr", "track-video", 0, { duration: 3 });
    p = operations.addClip(p, "asset-tr", "track-video", 4, { duration: 3 }); // 1 sec gap!
    p = operations.addClip(p, "asset-tr", "track-overlay", 0, { duration: 3 }); // Different track
    p = operations.addText(p, "Title 1", 0, {}, false, 3);
    p = operations.addText(p, "Title 2", 3, {}, false, 3);

    const videoClips = p.tracks["track-video"].clipIds;
    const overlayClips = p.tracks["track-overlay"].clipIds;
    const textClips = p.tracks["track-text"].clipIds;

    // Gap between clips
    assert.throws(
      () => operations.addTransition(p, videoClips[0], videoClips[1], "fade", 0.5),
      /Transitions need two adjacent visual clips on the same track/
    );

    // Mismatched tracks
    assert.throws(
      () => operations.addTransition(p, videoClips[0], overlayClips[0], "dissolve", 0.5),
      /Transitions need two adjacent visual clips on the same track/
    );

    // Non-visual track (text)
    assert.throws(
      () => operations.addTransition(p, textClips[0], textClips[1], "zoom", 0.5),
      /Transitions need two adjacent visual clips on the same track/
    );
  });

  test("cleanTransitions automatically discards transitions when clips are moved or trimmed apart", () => {
    let p = model.createProject("transitions-clean-test");
    const asset = {
      id: "asset-tr",
      kind: "video",
      name: "Video Clip",
      duration: 10,
      url: "https://example.com/v.mp4",
      size: 100,
      mime: "video/mp4",
    };
    p = operations.addAsset(p, asset);
    p = operations.addClip(p, "asset-tr", "track-video", 0, { duration: 4 });
    p = operations.addClip(p, "asset-tr", "track-video", 4, { duration: 4 });
    const [c1, c2] = p.tracks["track-video"].clipIds;
    p = operations.addTransition(p, c1, c2, "fade", 0.5);
    assert.equal(Object.keys(p.transitions).length, 1);

    // Move c2 so clips are no longer adjacent
    p = operations.moveClip(p, c2, 6);
    assert.equal(Object.keys(p.transitions).length, 0, "Transition must be automatically cleaned up");
  });
});

describe("R2 Empirical Challenge: Hinglish Revert Toggle Behavior", () => {
  test("viral-hinglish-pop is a registered caption preset with proper style definitions", () => {
    const template = refTemplates.ALL_CAPTION_TEMPLATES.find((t) => t.id === "viral-hinglish-pop");
    assert.ok(template, "viral-hinglish-pop preset must exist in ALL_CAPTION_TEMPLATES");
    assert.ok(template.name.toLowerCase().includes("hinglish") || template.name.toLowerCase().includes("hindi"));
    assert.ok(template.style.fontFamily, "Font family must be defined");
    assert.ok(template.style.highlightColor, "Highlight color must be defined");
  });

  test("Bidirectional Hinglish toggle restores prior active template accurately across multiple cycles", () => {
    let p = model.createProject("hinglish-test");
    p = operations.addCaption(p, "Testing Hinglish bidirection revert toggle", 0, 4);
    const captionId = Object.keys(p.clips)[0];

    // State machine mirroring AssetDrawer.tsx lines 100-103 & 492-502
    let isHinglishMode = false;
    let activeCaptionTemplate = "study-hormozi-style";
    let previousCaptionTemplateRef = "study-hormozi-style";

    const applyPreset = (templateId) => {
      activeCaptionTemplate = templateId;
      const t = refTemplates.ALL_CAPTION_TEMPLATES.find((x) => x.id === templateId);
      assert.ok(t, `Template ${templateId} must exist`);
      p = captionTemplates.applyCaptionTemplate(p, [captionId], t);
    };

    const toggleHinglish = () => {
      const next = !isHinglishMode;
      isHinglishMode = next;
      if (next) {
        previousCaptionTemplateRef = activeCaptionTemplate;
        applyPreset("viral-hinglish-pop");
      } else {
        applyPreset(previousCaptionTemplateRef || "study-hormozi-style");
      }
    };

    // Cycle 1: Enable Hinglish from default hormozi
    applyPreset("study-hormozi-style");
    assert.equal(activeCaptionTemplate, "study-hormozi-style");
    assert.equal(p.captions[p.clips[captionId].contentId].templateId, "study-hormozi-style");

    toggleHinglish();
    assert.equal(isHinglishMode, true);
    assert.equal(activeCaptionTemplate, "viral-hinglish-pop");
    assert.equal(previousCaptionTemplateRef, "study-hormozi-style");
    assert.equal(p.captions[p.clips[captionId].contentId].templateId, "viral-hinglish-pop");

    toggleHinglish();
    assert.equal(isHinglishMode, false);
    assert.equal(activeCaptionTemplate, "study-hormozi-style", "Must restore study-hormozi-style");
    assert.equal(p.captions[p.clips[captionId].contentId].templateId, "study-hormozi-style");

    // Cycle 2: User explicitly chooses mrbeast, then enables and disables Hinglish
    applyPreset("study-mr-beast-style-2");
    assert.equal(activeCaptionTemplate, "study-mr-beast-style-2");

    toggleHinglish();
    assert.equal(isHinglishMode, true);
    assert.equal(activeCaptionTemplate, "viral-hinglish-pop");
    assert.equal(previousCaptionTemplateRef, "study-mr-beast-style-2");

    toggleHinglish();
    assert.equal(isHinglishMode, false);
    assert.equal(activeCaptionTemplate, "study-mr-beast-style-2", "Must restore study-mr-beast-style-2");

    // Stress test 10 consecutive toggle cycles
    for (let i = 0; i < 10; i++) {
      toggleHinglish();
      assert.equal(isHinglishMode, true);
      assert.equal(activeCaptionTemplate, "viral-hinglish-pop");
      toggleHinglish();
      assert.equal(isHinglishMode, false);
      assert.equal(activeCaptionTemplate, "study-mr-beast-style-2");
    }
  });
});

describe("R2 Empirical Challenge: Mobile Trim Handles & Unhide Bar", () => {
  test("MobileTimeline.tsx renders trim handles on captionsAndText, overlays, and audioClips", () => {
    const rawMobileTimeline = fs.readFileSync(
      path.resolve(root, "app/components/editor/mobile/MobileTimeline.tsx"),
      "utf8"
    );

    // Verify track 1 (captionsAndText) has trim handles
    assert.ok(
      rawMobileTimeline.includes("trackGroups.captionsAndText.map"),
      "Must render trackGroups.captionsAndText"
    );
    const captionsBlock = rawMobileTimeline.slice(
      rawMobileTimeline.indexOf("trackGroups.captionsAndText.map"),
      rawMobileTimeline.indexOf("trackGroups.overlays.map")
    );
    assert.ok(captionsBlock.includes('handleTrimClip(e, clip, "left")'), "Left trim handle in captionsAndText");
    assert.ok(captionsBlock.includes('handleTrimClip(e, clip, "right")'), "Right trim handle in captionsAndText");

    // Verify track 2 (overlays) has trim handles
    const overlaysBlock = rawMobileTimeline.slice(
      rawMobileTimeline.indexOf("trackGroups.overlays.map"),
      rawMobileTimeline.indexOf("trackGroups.mainVideo.map")
    );
    assert.ok(overlaysBlock.includes('handleTrimClip(e, clip, "left")'), "Left trim handle in overlays");
    assert.ok(overlaysBlock.includes('handleTrimClip(e, clip, "right")'), "Right trim handle in overlays");

    // Verify track 4 (audioClips) has trim handles
    const audioBlock = rawMobileTimeline.slice(rawMobileTimeline.indexOf("trackGroups.audioClips.map"));
    assert.ok(audioBlock.includes('handleTrimClip(e, clip, "left")'), "Left trim handle in audioClips");
    assert.ok(audioBlock.includes('handleTrimClip(e, clip, "right")'), "Right trim handle in audioClips");
  });

  test("trimClip functions cleanly for non-video clips (caption, text, overlay, audio)", () => {
    let p = model.createProject("mobile-trim-test");
    const audioAsset = {
      id: "asset-aud",
      kind: "audio",
      name: "Sfx",
      duration: 10,
      url: "https://example.com/s.mp3",
      size: 50,
      mime: "audio/mp3",
    };
    const imgAsset = {
      id: "asset-img",
      kind: "image",
      name: "Overlay Sticker",
      duration: 5,
      url: "https://example.com/s.png",
      size: 50,
      mime: "image/png",
    };
    p = operations.addAsset(p, audioAsset);
    p = operations.addAsset(p, imgAsset);

    p = operations.addClip(p, "asset-img", "track-overlay", 1, { duration: 4 });
    p = operations.addClip(p, "asset-aud", "track-audio", 2, { duration: 6 });
    p = operations.addText(p, "Overlay Text", 0, {}, false, 4);
    p = operations.addCaption(p, "Spoken Caption", 1, 3);

    const overlayClipId = p.tracks["track-overlay"].clipIds[0];
    const audioClipId = p.tracks["track-audio"].clipIds[0];
    const textClipId = p.tracks["track-text"].clipIds[0];
    const captionClipId = p.tracks["track-caption"].clipIds[0];

    // Trim overlay left
    p = operations.trimClip(p, overlayClipId, "left", 2.0);
    assert.equal(p.clips[overlayClipId].startTime, 2.0);
    assert.equal(p.clips[overlayClipId].duration, 3.0);

    // Trim audio right
    p = operations.trimClip(p, audioClipId, "right", 6.0);
    assert.equal(p.clips[audioClipId].duration, 4.0);

    // Trim text right
    p = operations.trimClip(p, textClipId, "right", 3.0);
    assert.equal(p.clips[textClipId].duration, 3.0);

    // Trim caption left
    p = operations.trimClip(p, captionClipId, "left", 1.5);
    assert.equal(p.clips[captionClipId].startTime, 1.5);
    assert.equal(p.clips[captionClipId].duration, 2.5);

    // Locked track rejects trim
    p = operations.changeTrack(p, "track-audio", { locked: true });
    assert.throws(() => operations.trimClip(p, audioClipId, "left", 3.0), /unlock/i);
  });

  test("Hidden Tracks Unhide Bar appears when tracks are hidden and unhides tracks cleanly", () => {
    let p = model.createProject("mobile-unhide-test");

    // Initially 0 hidden tracks
    let hiddenTracks = p.trackOrder.map((id) => p.tracks[id]).filter((t) => t?.hidden);
    assert.equal(hiddenTracks.length, 0);

    // Hide 2 tracks
    p = operations.changeTrack(p, "track-overlay", { hidden: true });
    p = operations.changeTrack(p, "track-audio", { hidden: true });

    hiddenTracks = p.trackOrder.map((id) => p.tracks[id]).filter((t) => t?.hidden);
    assert.equal(hiddenTracks.length, 2);
    assert.deepStrictEqual(
      hiddenTracks.map((t) => t.id),
      ["track-overlay", "track-audio"]
    );

    // Test Unhide Single Track (Unhide track-overlay)
    p = operations.changeTrack(p, "track-overlay", { hidden: false });
    hiddenTracks = p.trackOrder.map((id) => p.tracks[id]).filter((t) => t?.hidden);
    assert.equal(hiddenTracks.length, 1);
    assert.equal(hiddenTracks[0].id, "track-audio");

    // Hide another track and test Unhide All reducer (as in MobileTimeline.tsx line 308)
    p = operations.changeTrack(p, "track-text", { hidden: true });
    hiddenTracks = p.trackOrder.map((id) => p.tracks[id]).filter((t) => t?.hidden);
    assert.equal(hiddenTracks.length, 2);

    // Execute MobileTimeline Unhide All reducer:
    p = hiddenTracks.reduce((next, t) => operations.changeTrack(next, t.id, { hidden: false }), p);

    hiddenTracks = p.trackOrder.map((id) => p.tracks[id]).filter((t) => t?.hidden);
    assert.equal(hiddenTracks.length, 0, "All tracks must be unhidden and hiddenTracks must be empty");
    assert.equal(p.tracks["track-overlay"].hidden, false);
    assert.equal(p.tracks["track-audio"].hidden, false);
    assert.equal(p.tracks["track-text"].hidden, false);
  });
});


describe("R2 Empirical Challenge: Hostile Edge Cases & Stress Scenarios", () => {
  test("30 consecutive alternating state mutations preserve history immutability across full undo stack", () => {
    let p = model.createProject("deep-history-stress");
    const asset = {
      id: "asset-hostile",
      kind: "video",
      name: "Hostile Test Video",
      duration: 60,
      width: 1920,
      height: 1080,
      url: "https://example.com/h.mp4",
      size: 1000,
      mime: "video/mp4",
    };
    p = operations.addAsset(p, asset);
    p = operations.addClip(p, "asset-hostile", "track-video", 0, { duration: 10 });
    p = operations.addCaption(p, "Initial caption phrase", 0, 5);
    const clipId = p.tracks["track-video"].clipIds[0];
    const captionId = p.tracks["track-caption"].clipIds[0];

    const store = new storeMod.EditorStore(p);
    const initialSnapshotJson = JSON.stringify(store.getSnapshot());

    // 30 consecutive mutations
    for (let i = 0; i < 30; i++) {
      const snap = store.getSnapshot();
      deepFreeze(snap); // Deep freeze before mutation

      store.execute((proj) => {
        const mode = i % 5;
        if (mode === 0) {
          return operations.changeClipProperty(proj, clipId, {
            transform: { ...proj.clips[clipId].transform, scale: 1 + (i % 5) * 0.1 },
            volume: Math.min(2, 0.5 + (i % 3) * 0.25),
          });
        } else if (mode === 1) {
          return operations.moveClip(proj, clipId, i * 0.1);
        } else if (mode === 2) {
          return operations.trimClip(proj, clipId, "right", proj.clips[clipId].startTime + 5 + (i % 4));
        } else if (mode === 3) {
          return operations.changeText(proj, captionId, `Updated caption variation ${i}`, {
            size: 30 + (i % 10),
          });
        } else {
          const t = refTemplates.ALL_CAPTION_TEMPLATES[i % refTemplates.ALL_CAPTION_TEMPLATES.length];
          return captionTemplates.applyCaptionTemplate(proj, [captionId], t);
        }
      });
    }

    // Verify snapshot advanced
    assert.equal(store.getSnapshot().revision, 30);

    // Rollback all 30 steps one by one
    for (let i = 0; i < 30; i++) {
      assert.ok(store.canUndo, `Must be able to undo step ${i + 1}`);
      store.undo();
    }

    assert.equal(store.canUndo, false, "Undo stack must be exhausted");
    // Verify restored state matches initial state
    const restored = store.getSnapshot();
    assert.equal(restored.clips[clipId].startTime, 0);
    assert.equal(restored.clips[clipId].transform.scale, 1);
    assert.equal(restored.captions[p.clips[captionId].contentId].text, "Initial caption phrase");
  });

  test("Inserting 10 B-roll clips in sequence assigns unique IDs, clamps duration, and preserves order", () => {
    let p = model.createProject("broll-batch-test");
    const store = new storeMod.EditorStore(p);

    for (let i = 0; i < 10; i++) {
      const v = {
        id: `batch-${i}`,
        title: `B-Roll Footage ${i}`,
        duration: 2 + i, // 2s to 11s
        width: 1920,
        height: 1080,
        videoUrl: `https://example.com/broll-${i}.mp4`,
        thumbnail: `https://example.com/thumb-${i}.jpg`,
      };

      store.execute((proj) => {
        let overlayTrack = proj.trackOrder.map((id) => proj.tracks[id]).find((t) => t.kind === "overlay" && !t.locked);
        let next = proj;
        if (!overlayTrack) {
          next = operations.addTrack(next, "overlay");
          overlayTrack = next.tracks[next.trackOrder[next.trackOrder.length - 1]];
        }
        const asset = {
          id: `asset-batch-${i}`,
          kind: "video",
          name: v.title,
          duration: v.duration,
          width: v.width,
          height: v.height,
          url: v.videoUrl,
          thumbnail: v.thumbnail,
          size: 0,
          mime: "video/mp4",
        };
        next = operations.addAsset(next, asset);
        return operations.addClip(next, `asset-batch-${i}`, overlayTrack.id, i * 4, {
          id: `clip-batch-${i}`,
          name: v.title,
          duration: Math.min(v.duration, 4),
        });
      });
    }

    const snap = store.getSnapshot();
    const overlayTrack = Object.values(snap.tracks).find((t) => t.kind === "overlay");
    assert.ok(overlayTrack);
    assert.equal(overlayTrack.clipIds.length, 10);

    for (let i = 0; i < 10; i++) {
      const clip = snap.clips[`clip-batch-${i}`];
      assert.ok(clip);
      assert.equal(clip.duration, Math.min(2 + i, 4));
      assert.equal(clip.startTime, i * 4);
    }
  });

  test("B-roll insertion at track cap throws cleanly if all overlay tracks are locked", () => {
    let p = model.createProject("cap-stress");
    // Expand to 30 tracks
    while (p.trackOrder.length < 30) {
      p = operations.addTrack(p, "overlay");
    }
    assert.equal(p.trackOrder.length, 30);

    // Lock all overlay tracks
    for (const track of Object.values(p.tracks)) {
      if (track.kind === "overlay") {
        p = operations.changeTrack(p, track.id, { locked: true });
      }
    }

    // Try to insert B-roll: since all overlay tracks are locked, it tries to addTrack, which must throw
    const tryInsert = () => {
      let overlayTrack = p.trackOrder.map((id) => p.tracks[id]).find((t) => t.kind === "overlay" && !t.locked);
      if (!overlayTrack) {
        p = operations.addTrack(p, "overlay");
      }
    };

    assert.throws(tryInsert, /30 tracks/i);
  });

  test("Transition boundary check: exactly adjacent passes, 1 frame beyond fails", () => {
    let p = model.createProject("tr-boundary");
    const asset = {
      id: "asset-bound",
      kind: "video",
      name: "Boundary Video",
      duration: 10,
      url: "https://example.com/b.mp4",
      size: 100,
      mime: "video/mp4",
    };
    p = operations.addAsset(p, asset);
    p = operations.addClip(p, "asset-bound", "track-video", 0, { duration: 4 });
    p = operations.addClip(p, "asset-bound", "track-video", 4.0, { duration: 4 }); // exact boundary
    const [c1, c2] = p.tracks["track-video"].clipIds;

    // Adjacent -> passes
    assert.doesNotThrow(() => operations.addTransition(p, c1, c2, "fade", 0.5));

    // Move c2 by 1.1 frames (exceeding 1/fps = 1/30 ≈ 0.0333s)
    p = operations.moveClip(p, c2, 4 + 1.1 / 30);
    assert.throws(() => operations.addTransition(p, c1, c2, "fade", 0.5), /adjacent/);
  });
});
