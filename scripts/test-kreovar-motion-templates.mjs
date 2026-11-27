import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const ts = require("typescript");
const cache = new Map();

function load(relative) {
  let filename = path.resolve(ROOT, relative);
  if (!path.extname(filename)) {
    if (fs.existsSync(filename + ".ts")) filename += ".ts";
    else if (fs.existsSync(filename + ".tsx")) filename += ".tsx";
    else if (fs.existsSync(filename + ".js")) filename += ".js";
  }
  if (cache.has(filename)) return cache.get(filename).exports;
  const m = { exports: {} };
  cache.set(filename, m);
  const js = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
    },
  }).outputText.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(filename).href));
  const local = (s) =>
    s.startsWith("@/")
      ? load(s.slice(2))
      : s.startsWith(".")
      ? load(path.resolve(path.dirname(filename), s))
      : require(s);
  new vm.Script(`(function(require,module,exports,process){${js}\n})`, { filename }).runInThisContext()(
    local,
    m,
    m.exports,
    process
  );
  return m.exports;
}

const { createProject } = load("app/lib/editor/model");
const {
  addMotionGraphic,
  changeMotionGraphic,
  removeMotionGraphic,
  drawGraphicPanel,
  GRAPHIC_KINDS,
} = load("app/lib/editor/motionGraphics");
const { KREOVAR_MOTION_TEMPLATES } = load("app/lib/editor/kreovarMotionTemplates");
const { applyEditDecisionList } = load("app/lib/editor/ai");
const { validateAiPlan } = load("app/lib/editor/aiValidation");
const { getMotionDirectorPromptSection } = load("app/lib/editor/skills/motionDirectorSkill");
const { assertStagePlan } = load("app/lib/editor/sequentialEdit");
const { reconcileMotionGraphicPlacements } = load("app/lib/editor/inPlaceReconciler");
const { compactEditorFallback } = load("app/lib/server/editorFallbackPrompt");
const { STAGE_CAPABILITIES } = load("app/lib/editor/editingCapabilities");

function mockCtx() {
  const ops = [];
  return {
    ops,
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    roundRect() {},
    rect() {},
    clip() {},
    fill() { ops.push("fill"); },
    stroke() { ops.push("stroke"); },
    fillRect() { ops.push("fillRect"); },
    fillText(t) { ops.push(`text:${t}`); },
    measureText(t) { return { width: String(t || "").length * 10 }; },
    translate() {},
    scale() {},
    set fillStyle(_) {},
    set strokeStyle(_) {},
    set lineWidth(_) {},
    set lineCap(_) {},
    set lineJoin(_) {},
    set font(_) {},
    set textAlign(_) {},
    set textBaseline(_) {},
    set globalAlpha(_) {},
    set shadowColor(_) {},
    set shadowBlur(_) {},
    set shadowOffsetY(_) {},
  };
}

test("KREOVAR_MOTION_TEMPLATES provides at least 18 curated editable templates", () => {
  assert.ok(
    KREOVAR_MOTION_TEMPLATES.length >= 18,
    `Expected >= 18 templates, got ${KREOVAR_MOTION_TEMPLATES.length}`
  );
  const ids = new Set(KREOVAR_MOTION_TEMPLATES.map((t) => t.id));
  assert.equal(ids.size, KREOVAR_MOTION_TEMPLATES.length, "Template IDs must be unique");

  let project = createProject("tpl-suite", "Motion Templates");
  for (let i = 0; i < KREOVAR_MOTION_TEMPLATES.length; i++) {
    const tpl = KREOVAR_MOTION_TEMPLATES[i];
    assert.ok(GRAPHIC_KINDS.includes(tpl.kind), `Unknown kind ${tpl.kind}`);
    const next = addMotionGraphic(project, tpl.kind, tpl.text, i * 2, 2.0, tpl.accent, tpl.motion, {
      theme: tpl.theme,
      subtitle: tpl.subtitle,
      icon: tpl.icon,
      value: tpl.value,
      prefix: tpl.prefix,
      suffix: tpl.suffix,
      items: tpl.items,
      bars: tpl.bars,
      comparison: tpl.comparison,
      targetX: tpl.targetX,
      targetY: tpl.targetY,
      allowNewTrack: true,
    });
    const addedId = Object.keys(next.clips).find((id) => !project.clips[id]);
    assert.ok(addedId, `Template ${tpl.id} must add a clip`);
    const clip = next.clips[addedId];
    assert.ok(clip.graphic, `Clip from ${tpl.id} must hold graphic metadata`);

    const ctx = mockCtx();
    const res = drawGraphicPanel(ctx, clip.graphic, 300, 120, 0.8, {
      title: tpl.text,
      frameWidth: 1080,
      frameHeight: 1920,
      duration: 2.0,
    });
    assert.ok(res.width > 0 && res.height > 0, `Template ${tpl.id} must draw non-empty geometry`);
    project = next;
  }
});

test("Motion graphics templates are editable and detachable", () => {
  let project = createProject("edit-tpl", "Editable Graphics");
  const tpl = KREOVAR_MOTION_TEMPLATES[0];
  project = addMotionGraphic(project, tpl.kind, tpl.text, 0, 3, tpl.accent, tpl.motion, {
    theme: tpl.theme,
    subtitle: tpl.subtitle,
    value: tpl.value,
    allowNewTrack: true,
  });
  const clipId = Object.keys(project.clips)[0];
  const updated = changeMotionGraphic(project, clipId, {
    text: "Updated Growth",
    subtitle: "Q4 Verified",
    value: 999,
    theme: "dark-slate",
    accent: "#10b981",
  });
  assert.equal(updated.textLayers[updated.clips[clipId].contentId].text, "Updated Growth");
  assert.equal(updated.clips[clipId].graphic.subtitle, "Q4 Verified");
  assert.equal(updated.clips[clipId].graphic.value, 999);
  assert.equal(updated.clips[clipId].graphic.theme, "dark-slate");

  const detached = removeMotionGraphic(updated, clipId);
  assert.equal(detached.clips[clipId].graphic, undefined);
});

test("AI Editor supports custom motion graphics via kind:'custom' + customSpec", () => {
  const project = createProject("ai-custom", "Custom Motion Graphics");
  const rawPlan = {
    summary: "Added custom multi-element launch trajectory motion graphic.",
    intent: { goal: "Custom motion graphic", preserve: [], questions: [] },
    decisions: [
      {
        op: "addGraphic",
        kind: "custom",
        text: "Rocket Launch",
        startTime: 1.0,
        duration: 4.0,
        theme: "clean-light",
        accent: "#0284c7",
        motion: "pop",
        customSpec: {
          widthRatio: 0.70,
          heightRatio: 0.30,
          cornerRadius: 0.14,
          showCard: true,
          elements: [
            { type: "pill", x: -0.22, y: -0.25, w: 0.32, h: 0.16, delay: 0.04, entrance: "pop" },
            { type: "text", x: -0.22, y: -0.25, text: "LAUNCH METRIC", color: "#ffffff", fontSize: 0.018, delay: 0.06, entrance: "fade" },
            { type: "ring", x: 0.32, y: 0.05, r: 0.18, progress: 0.85, delay: 0.12, entrance: "draw" },
            { type: "counter", x: -0.15, y: 0.08, value: 420, prefix: "+", suffix: "%", delay: 0.16, entrance: "count-up" },
            {
              type: "sparkline",
              x: 0,
              y: 0.25,
              points: [{ x: -0.35, y: 0.15 }, { x: 0, y: 0 }, { x: 0.35, y: -0.15 }],
              delay: 0.22,
              entrance: "draw",
            },
          ],
        },
      },
    ],
    toolRequests: [],
  };

  const validated = validateAiPlan(rawPlan, project);
  assert.equal(validated.list.decisions.length, 1);
  const applied = applyEditDecisionList(project, validated.list);
  const clip = Object.values(applied.clips)[0];
  assert.equal(clip.graphic.kind, "custom");
  assert.equal(clip.graphic.customSpec.elements.length, 5);

  const ctx = mockCtx();
  const res = drawGraphicPanel(ctx, clip.graphic, 300, 140, 0.9, {
    title: "Rocket Launch",
    frameWidth: 1080,
    frameHeight: 1920,
    duration: 4.0,
  });
  assert.ok(res.width > 0 && res.height > 0);
});

test("Legacy GraphicControls panel removed & all 19 iart-ai/motion-skills packs installed + bundled", () => {
  assert.equal(
    fs.existsSync(path.join(ROOT, "app/components/editor/workspace/GraphicControls.tsx")),
    false,
    "Legacy GraphicControls.tsx must be removed"
  );
  const expectedSkills = [
    "ad-creative-video", "talking-head-b-roll", "animated-infographic", "chart-animation",
    "presentation-video", "promo-video", "product-demo-video", "diagram-animation",
    "explainer-video", "isometric-animation", "whiteboard-animation", "wrapped-video",
    "brand-motion-guidelines", "generative-illustration", "javascript-animation", "soundtrack",
    "kinetic-typography", "lower-thirds", "manim", "map-animation", "animation-principles",
    "motion-art-direction", "talking-head", "text-message-animation", "caption-animation",
    "short-form-video", "glassmorphism", "gsap-web", "svg-animation", "particle-system",
    "shader-glsl", "threejs-animation", "audiogram", "youtube-intro-outro",
  ];
  for (const skill of expectedSkills) {
    assert.ok(
      fs.existsSync(path.join(ROOT, ".agents/skills", skill, "SKILL.md")),
      `Installed skill ${skill} must exist in .agents/skills`
    );
  }
  const installedCount = fs.readdirSync(path.join(ROOT, ".agents/skills"), { withFileTypes: true }).filter((d) => d.isDirectory()).length;
  assert.ok(installedCount >= 55, `Expected all 19 packs (>= 55 skills), got ${installedCount}`);

  const compactPrompt = getMotionDirectorPromptSection(true);
  const fullPrompt = getMotionDirectorPromptSection(false);
  for (const token of ["customSpec", "24 Templates", "split-title", "marker-highlight", "audio-waveform", "subscribe-cta", "article-citation", "timer-badge", "changeGraphic", "removeGraphic", "clearRegions"]) {
    assert.ok(compactPrompt.includes(token), `Compact prompt missing ${token}`);
  }
  for (const token of ["Text Message", "Explainer", "Podcast / Audiogram", "manim"]) {
    assert.ok(fullPrompt.toLowerCase().includes(token.toLowerCase()), `Full playbook missing ${token}`);
  }
});

test("AI changeGraphic & removeGraphic mutate existing graphics in-place and delete cleanly", () => {
  let project = createProject("ai-graphic-edit", "9:16");
  const firstPlan = validateAiPlan(
    {
      summary: "Add offer graphic",
      decisions: [
        {
          op: "addGraphic",
          kind: "offer-tag",
          text: "40% OFF TODAY",
          subtitle: "$99",
          value: 59,
          prefix: "$",
          startTime: 1.5,
          duration: 3.0,
          theme: "clean-light",
          accent: "#e11d48",
          motion: "pop",
        },
      ],
      toolRequests: [],
    },
    project
  );
  project = applyEditDecisionList(project, firstPlan.list);
  const clipIds = Object.keys(project.clips);
  assert.equal(clipIds.length, 1);
  const graphicClipId = clipIds[0];

  const editPlan = validateAiPlan(
    {
      summary: "Update price and move to upper left dark slate",
      decisions: [
        {
          op: "changeGraphic",
          clipId: graphicClipId,
          text: "50% LAUNCH DEAL",
          value: 49,
          theme: "dark-slate",
          accent: "#10b981",
          x: -0.18,
          y: -0.35,
          scale: 0.9,
          startTime: 2.0,
          duration: 4.0,
          motion: "slide-up",
        },
      ],
      toolRequests: [],
    },
    project
  );
  project = applyEditDecisionList(project, editPlan.list);
  assert.equal(Object.keys(project.clips).length, 1, "changeGraphic must edit in-place without duplicating clips");
  const updated = project.clips[graphicClipId];
  assert.equal(updated.graphic.value, 49);
  assert.equal(updated.graphic.theme, "dark-slate");
  assert.equal(updated.graphic.accent, "#10b981");
  assert.equal(project.textLayers[updated.contentId].text, "50% LAUNCH DEAL");
  assert.equal(updated.startTime, 2.0);
  assert.equal(updated.duration, 4.0);
  assert.equal(updated.transform.x, -0.18);
  assert.equal(updated.transform.y, -0.35);

  const removePlan = validateAiPlan(
    {
      summary: "Remove the offer graphic",
      decisions: [{ op: "removeGraphic", clipId: graphicClipId }],
      toolRequests: [],
    },
    project
  );
  project = applyEditDecisionList(project, removePlan.list);
  assert.equal(Object.keys(project.clips).length, 0, "removeGraphic must delete graphic clip cleanly");
});

test("reconcileMotionGraphicPlacements respects face/caption safe zones and vision clearRegions", () => {
  const baseVertical = createProject("safe-zones-9-16", "Safe zones 9:16");
  const vertical = { ...baseVertical, settings: { ...baseVertical.settings, aspectRatio: "9:16" } };
  const reconciledVertical = reconcileMotionGraphicPlacements(
    vertical,
    [
      { op: "addGraphic", kind: "offer-tag", text: "SAVE 40%", startTime: 1, duration: 2.5 },
      { op: "addGraphic", kind: "custom", text: "Chat Flow", startTime: 5, duration: 3.5, x: 0, y: 0 },
    ],
    []
  );
  assert.ok(reconciledVertical[0].y < -0.25, `Compact vertical badge belongs above face, got y=${reconciledVertical[0].y}`);
  assert.ok(
    reconciledVertical[1].y >= 0.14 || reconciledVertical[1].y <= -0.33,
    `Face-colliding center custom graphic must relocate safely, got y=${reconciledVertical[1].y}`
  );

  const landscape = createProject("safe-zones-16-9", "16:9");
  const reconciledVision = reconcileMotionGraphicPlacements(
    landscape,
    [{ op: "addGraphic", kind: "line-chart", text: "Growth", startTime: 1, duration: 3, x: 0, y: 0 }],
    [],
    [{ subjectRegion: "center", occupiedRegions: ["center", "middle-left"], clearRegions: ["middle-right"] }]
  );
  assert.ok(reconciledVision[0].x > 0.15, `Should place in clear middle-right region, got x=${reconciledVision[0].x}`);
});

test("STAGE_CAPABILITIES and fallback prompt expose full motion editing operations", () => {
  assert.ok(STAGE_CAPABILITIES.planMotionGraphics.operations.includes("changeGraphic"));
  assert.ok(STAGE_CAPABILITIES.planMotionGraphics.operations.includes("removeGraphic"));
  assert.ok(STAGE_CAPABILITIES.applyRequestedEdits.operations.includes("changeGraphic"));
  assert.ok(STAGE_CAPABILITIES.applyRequestedEdits.operations.includes("removeGraphic"));

  assertStagePlan(
    "planMotionGraphics",
    [
      { op: "addGraphic", kind: "social-follow", text: "@kreovar", startTime: 1, duration: 2.5 },
      { op: "changeGraphic", clipId: "c1", theme: "dark-slate" },
      { op: "removeGraphic", clipId: "c2" },
    ],
    [],
    createProject("stage-check", "9:16")
  );

  const editorAiSource = fs.readFileSync(path.join(ROOT, "app/lib/server/editorAi.ts"), "utf8");
  const sysStart = editorAiSource.indexOf("You are Kreovar's AI video editor.");
  assert.ok(sysStart >= 0, "editorAi.ts systemInstruction must exist");
  const fallback = compactEditorFallback({
    systemInstruction: editorAiSource.slice(sysStart),
    prompt: JSON.stringify({ pipelineStage: "planMotionGraphics" }),
  });
  assert.ok(fallback.systemInstruction.includes('{op:"addGraphic"'), "Fallback must retain addGraphic schema");
  assert.ok(fallback.systemInstruction.includes('{op:"changeGraphic"'), "Fallback must retain changeGraphic schema");
  assert.ok(fallback.systemInstruction.includes('{op:"removeGraphic"'), "Fallback must retain removeGraphic schema");
  assert.ok(fallback.systemInstruction.includes("MOTION SKILLS"), "Fallback must include bundled 19-pack motion skills");
});
