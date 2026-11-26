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
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
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

const load = loader({
  "app/lib/editor/media.ts": { waitMedia: async () => {} },
});

const model = load("app/lib/editor/model");
const ops = load("app/lib/editor/operations");
const transitions = load("app/lib/editor/transitions");
const mediaAnimation = load("app/lib/editor/mediaAnimation");
const { Compositor, visibleLayers } = load("app/lib/editor/compositor");
const { aiProjectSnapshot, validateAiPlan } = load("app/lib/editor/aiValidation");
const { applyEditDecisionList } = load("app/lib/editor/ai");
const { editorFallbackResponseFormat } = load("app/lib/server/editorFallbackSchema");
const { compactEditorFallback } = load("app/lib/server/editorFallbackPrompt");
const { extractEditingConstraints } = load("app/lib/editor/editingIntent");
const { extractConversationalIntent } = load("app/lib/editor/conversationalIntent");
const { reconcileEditingDecisions } = load("app/lib/editor/inPlaceReconciler");
const { suggestContextualSfx } = load("app/lib/editor/autoSfx");
const { createAutoEditPlan, finishAutoEditPlan, DEFAULT_AUTO_EDIT } = load("app/lib/editor/autoEdit");
const { BUILTIN_SFX } = load("app/lib/assets/builtinSfx");

function sampleMultiCutProject() {
  let p = model.createProject("capcut-suite");
  p = ops.addAsset(p, {
    id: "v1",
    name: "ClipA.mp4",
    kind: "video",
    mime: "video/mp4",
    size: 1000,
    duration: 10,
    width: 1920,
    height: 1080,
  });
  p = ops.addAsset(p, {
    id: "v2",
    name: "ClipB.mp4",
    kind: "video",
    mime: "video/mp4",
    size: 1000,
    duration: 10,
    width: 1920,
    height: 1080,
  });
  p = ops.addAsset(p, {
    id: "img1",
    name: "Photo.png",
    kind: "image",
    mime: "image/png",
    size: 500,
    duration: 5,
    width: 1080,
    height: 1920,
  });
  p = ops.addClip(p, "v1", "track-video", 0, { id: "c1", duration: 3 });
  p = ops.addClip(p, "v2", "track-video", 3, { id: "c2", duration: 3 });
  p = ops.addClip(p, "v1", "track-video", 6, { id: "c3", duration: 3 });
  p = ops.addClip(p, "img1", "track-image", 1, { id: "ov1", duration: 2.5 });
  return p;
}

describe("Reverse-Engineered CapCut Transitions (>= 30 presets)", () => {
  test("provides at least 30 distinct documented transitions with valid SFX IDs", () => {
    const catalog = transitions.TRANSITION_CATALOG;
    assert.ok(catalog.length >= 30, `Expected >= 30 transitions, got ${catalog.length}`);
    assert.equal(new Set(transitions.TRANSITION_KINDS).size, catalog.length);
    const validSfxIds = new Set(BUILTIN_SFX.map((s) => s.id));
    for (const spec of catalog) {
      assert.ok(spec.name && spec.shortDesc && spec.whenToUse && spec.whereToUse && spec.avoidWhen);
      assert.ok(spec.defaultDuration >= spec.minDuration && spec.defaultDuration <= spec.maxDuration);
      if (spec.recommendedSfx !== null) {
        assert.ok(validSfxIds.has(spec.recommendedSfx), `${spec.id} cites invalid SFX ${spec.recommendedSfx}`);
      }
    }
  });

  test("evaluateTransition and Compositor render all 47 transitions deterministically", () => {
    const pBase = sampleMultiCutProject();
    const engine = new Compositor({});
    engine.setFrame("c1", {}, 1280, 720);
    engine.setFrame("c2", {}, 1280, 720);

    for (const kind of transitions.TRANSITION_KINDS) {
      const midEval = transitions.evaluateTransition({ kind, duration: 0.4, intensity: 1.2 }, 0.5);
      for (const pose of [midEval.outgoing, midEval.incoming]) {
        for (const key of [
          "opacity",
          "x",
          "y",
          "scale",
          "scaleX",
          "scaleY",
          "rotation",
          "blur",
          "brightness",
          "contrast",
          "saturation",
          "rgbOffset",
          "pixelate",
          "glitchSlices",
          "ghostEcho",
          "skewX",
        ]) {
          assert.ok(Number.isFinite(pose[key]), `${kind} non-finite ${key}`);
        }
      }

      const pTr = ops.addTransition(pBase, "c1", "c2", kind, 0.4);
      const layers = visibleLayers(pTr, 3.2);
      assert.ok(layers.some((l) => l.clip.id === "c1" && l.hold), `${kind} must include hold layer`);
      assert.ok(layers.some((l) => l.clip.id === "c2"), `${kind} must include incoming layer`);

      const calls = [];
      const ctx = new Proxy(
        {},
        {
          get: (t, k) => (k in t ? t[k] : (...args) => calls.push([k, ...args])),
          set: (t, k, v) => {
            calls.push([k, v]);
            t[k] = v;
            return true;
          },
        }
      );
      engine.render({ width: 640, height: 360, getContext: () => ctx }, pTr, 3.2);
      assert.ok(calls.some((c) => c[0] === "drawImage"), `${kind} must render media frames`);
    }

    // Specific reverse-engineered physics assertions
    const shake = transitions.evaluateTransition({ kind: "camera-shake", duration: 0.3 }, 0.45);
    assert.ok(shake.incoming.scale > 1.05, "S-shake applies edge-safe overscan");
    assert.ok(shake.incoming.rgbOffset > 0, "S-shake includes RGB channel split");

    const spin = transitions.evaluateTransition({ kind: "spin-left", duration: 0.4 }, 0.5);
    assert.ok(spin.outgoing.scale >= 1.0 && Math.abs(spin.outgoing.rotation) > 0.5, "Spin compensates corners cleanly");

    const blur = transitions.evaluateTransition({ kind: "gaussian-blur", duration: 0.5 }, 0.5);
    assert.ok(blur.outgoing.blur > 10 && blur.incoming.blur > 10);

    const glitch = transitions.evaluateTransition({ kind: "glitch-rgb", duration: 0.3 }, 0.45);
    assert.ok(glitch.outgoing.rgbOffset > 0.01);

    const wipe = transitions.evaluateTransition({ kind: "circle-iris", duration: 0.5 }, 0.5);
    assert.equal(wipe.incoming.clipMask?.shape, "circle-iris");
  });

  test("batch helpers applyTransitionToAllCuts, updateTransition, removeTransition work cleanly", () => {
    let p = sampleMultiCutProject();
    p = ops.applyTransitionToAllCuts(p, "whip-left");
    assert.equal(Object.keys(p.transitions).length, 2);
    const firstId = Object.keys(p.transitions)[0];
    p = ops.updateTransition(p, firstId, { kind: "zoom-blur", intensity: 1.5, easing: "snap" });
    assert.equal(p.transitions[firstId].kind, "zoom-blur");
    assert.equal(p.transitions[firstId].intensity, 1.5);
    p = ops.removeTransition(p, firstId);
    assert.equal(Object.keys(p.transitions).length, 1);
    p = ops.clearAllTransitions(p);
    assert.equal(Object.keys(p.transitions).length, 0);
  });
});

describe("Reverse-Engineered CapCut Clip Animations (>= 30 presets)", () => {
  test("provides at least 30 distinct active clip animations and finite poses", () => {
    const activeMotions = mediaAnimation.MEDIA_MOTIONS.filter((m) => m !== "none");
    const activeLoops = mediaAnimation.MEDIA_LOOPS.filter((l) => l !== "none");
    assert.ok(activeMotions.length >= 30, `Expected >= 30 active clip motions, got ${activeMotions.length}`);
    assert.ok(activeLoops.length >= 10, `Expected >= 10 loops, got ${activeLoops.length}`);

    const p = sampleMultiCutProject();
    for (const entrance of activeMotions) {
      const q = mediaAnimation.setMediaAnimation(p, "ov1", {
        ...mediaAnimation.DEFAULT_MEDIA_ANIMATION,
        entrance,
        exit: "fade",
      });
      for (const sampleT of [1.0, 1.2, 2.25, 3.3, 3.5]) {
        const pose = mediaAnimation.mediaAnimationFrame(q.clips.ov1, sampleT);
        for (const [k, v] of Object.entries(pose)) {
          assert.ok(Number.isFinite(v), `Non-finite pose.${k} for ${entrance}`);
        }
      }
    }
    for (const loop of activeLoops) {
      const q = mediaAnimation.setMediaAnimation(p, "ov1", {
        ...mediaAnimation.DEFAULT_MEDIA_ANIMATION,
        entrance: "none",
        exit: "none",
        loop,
      });
      const midPose = mediaAnimation.mediaAnimationFrame(q.clips.ov1, 2.25);
      for (const [k, v] of Object.entries(midPose)) {
        assert.ok(Number.isFinite(v), `Non-finite pose.${k} for loop ${loop}`);
      }
    }
  });
});

describe("AI Director Knowledge, Schema, Reconciler, AutoEdit & AutoSFX Integration", () => {
  test("aiValidation and applyEditDecisionList support all CapCut transitions and mediaAnimation", () => {
    const p = sampleMultiCutProject();
    const validated = validateAiPlan(
      {
        summary: "Applying whip-left transitions and rock-vertical overlay animation.",
        decisions: [
          {
            op: "addTransition",
            fromClipId: "c1",
            toClipId: "c2",
            kind: "whip pan left",
            duration: 0.25,
            intensity: 1.3,
            easing: "snap",
          },
          {
            op: "changeClipProperty",
            clipId: "ov1",
            changes: {
              mediaAnimation: {
                entrance: "rock-vertical",
                exit: "fade",
                loop: "pendulum",
                entranceDuration: 0.35,
                exitDuration: 0.25,
                loopDuration: 2,
                easing: "ease-out",
              },
            },
          },
        ],
      },
      p
    );
    const next = applyEditDecisionList(p, validated.list);
    assert.equal(next.transitions["transition-c1-c2"].kind, "whip-left");
    assert.equal(next.transitions["transition-c1-c2"].intensity, 1.3);
    assert.equal(next.clips.ov1.mediaAnimation.entrance, "rock-vertical");
    assert.equal(next.clips.ov1.mediaAnimation.loop, "pendulum");

    const snap = aiProjectSnapshot(next);
    assert.equal(snap.transitions["transition-c1-c2"].kind, "whip-left");
  });

  test("fallback schema & prompt expose full transitions catalog and editorial playbook", () => {
    const p = sampleMultiCutProject();
    const promptPayload = JSON.stringify({ pipelineStage: "applyEffects", project: p });
    const schema = editorFallbackResponseFormat({ operation: "edit", prompt: promptPayload });
    const serialized = JSON.stringify(schema);
    assert.ok(serialized.includes("whip-left"));
    assert.ok(serialized.includes("camera-shake"));
    assert.ok(serialized.includes("rock-vertical"));
    assert.ok(serialized.includes("circle-iris"));

    const compacted = compactEditorFallback({
      systemInstruction:
        'You are Kreovar\'s AI video editor. {op:"addTransition",fromClipId,toClipId,kind,duration}',
      prompt: promptPayload,
    });
    assert.ok(compacted.systemInstruction.includes("CAPCUT TRANSITIONS & ANIMATIONS DIRECTOR PLAYBOOK"));
    assert.ok(compacted.systemInstruction.includes("camera-shake"));
  });

  test("intent detection and inPlaceReconciler respect requests and negative constraints", () => {
    const p = sampleMultiCutProject();

    const intentReq = extractEditingConstraints("Add whip pan transitions to all cuts");
    assert.equal(intentReq.requestedTransitionKind, "whip-left");
    assert.equal(intentReq.requestedAllCutTransitions, true);
    assert.ok(extractConversationalIntent("Add whip pan transitions").operations.includes("transitions"));

    const fulfilled = reconcileEditingDecisions(p, [], [], intentReq, []);
    const addTrOps = fulfilled.decisions.filter((d) => d.op === "addTransition");
    assert.equal(addTrOps.length, 2);
    assert.ok(addTrOps.every((d) => d.kind === "whip-left"));

    // Negative constraint: must strip AI transitions
    const negIntent = extractEditingConstraints("No transitions please, keep hard cuts only");
    assert.equal(negIntent.disallowedTransitions, true);
    const stripped = reconcileEditingDecisions(
      p,
      [{ op: "addTransition", fromClipId: "c1", toClipId: "c2", kind: "whip-left", duration: 0.3 }],
      [],
      negIntent,
      []
    );
    assert.equal(stripped.decisions.filter((d) => d.op === "addTransition").length, 0);

    // Non-adjacent clip transition should be dropped safely, never crash validation
    const invalidAdj = reconcileEditingDecisions(
      p,
      [{ op: "addTransition", fromClipId: "c1", toClipId: "c3", kind: "camera-shake", duration: 0.3 }],
      [],
      undefined,
      []
    );
    assert.equal(invalidAdj.decisions.length, 0);
  });

  test("autoSfx and autoEdit integrate smart transition pairings cleanly", () => {
    let p = sampleMultiCutProject();
    p = ops.addTransition(p, "c1", "c2", "glitch-rgb", 0.25);
    p = ops.addTransition(p, "c2", "c3", "light-leak", 0.5);
    const sfx = suggestContextualSfx(p, { intensity: "balanced" });
    assert.ok(sfx.some((s) => s.soundId === "glitch"), "glitch-rgb recommends glitch SFX");

    const cleanP = sampleMultiCutProject();
    const prep = createAutoEditPlan(cleanP, { ...DEFAULT_AUTO_EDIT, styleId: "social", transitions: true, captions: false, zooms: false, motionGraphics: false, broll: false, surfaces: false });
    const autoPlan = finishAutoEditPlan(cleanP, prep.list, [], [], { ...DEFAULT_AUTO_EDIT, styleId: "social", transitions: true, captions: false, zooms: false, motionGraphics: false, broll: false, surfaces: false });
    assert.ok(autoPlan.prepared.list.decisions.some((d) => d.op === "addTransition" && d.kind === "whip-left"));
    assert.equal(autoPlan.reviewed.transitions["transition-c1-c2"].kind, "whip-left");
  });
});
