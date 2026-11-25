import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');
const cache = new Map();

function load(relative) {
  let filename = path.resolve(root, relative);
  if (!path.extname(filename)) filename += '.ts';
  if (cache.has(filename)) return cache.get(filename).exports;
  const m = { exports: {} };
  cache.set(filename, m);
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(filename).href));
  const local = (s) =>
    s.startsWith('@/') ? load(s.slice(2)) : s.startsWith('.') ? load(path.resolve(path.dirname(filename), s)) : require(s);
  new vm.Script(`(function(require,module,exports){${js}\n})`, { filename }).runInThisContext()(
    local,
    m,
    m.exports
  );
  return m.exports;
}

cache.set(path.resolve(root, 'app/lib/editor/media.ts'), {
  exports: { waitMedia: async () => {} },
});

const model = load('app/lib/editor/model');
const op = load('app/lib/editor/operations');
const graphic = load('app/lib/editor/motionGraphics');
const { Compositor } = load('app/lib/editor/compositor');
const { validateAiPlan, aiProjectSnapshot } = load('app/lib/editor/aiValidation');
const { applyEditDecisionList } = load('app/lib/editor/ai');
const bridge = load('app/lib/editor/bridge');
const { reconcileEditingDecisions } = load('app/lib/editor/inPlaceReconciler');
const skill = load('app/lib/editor/skills/motionDirectorSkill');

function makeProject(aspectRatio = '9:16') {
  let p = model.createProject('mg-test');
  p = { ...p, settings: { ...p.settings, aspectRatio } };
  p = op.addAsset(p, {
    id: 'raw',
    name: 'Speaker.mp4',
    kind: 'video',
    mime: 'video/mp4',
    size: 1,
    duration: 20,
    width: 1080,
    height: 1920,
  });
  return op.addClip(p, 'raw', 'track-video', 0, { id: 'v' });
}

function makeMockCtx() {
  const calls = [];
  const ctx = {
    font: '',
    letterSpacing: '0px',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'round',
    lineJoin: 'round',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetY: 0,
    globalAlpha: 1,
    textAlign: 'left',
    textBaseline: 'middle',
    direction: 'ltr',
    filter: 'none',
    setTransform() {},
    fillRect(...v) { calls.push(['fillRect', ...v]); },
    save() {},
    restore() {},
    translate(...v) { calls.push(['translate', ...v]); },
    rotate() {},
    scale(...v) { calls.push(['scale', ...v]); },
    beginPath() {},
    closePath() {},
    roundRect(...v) { calls.push(['roundRect', ...v]); },
    arc(...v) { calls.push(['arc', ...v]); },
    fill() { calls.push(['fill']); },
    stroke() { calls.push(['stroke']); },
    moveTo(...v) { calls.push(['moveTo', ...v]); },
    lineTo(...v) { calls.push(['lineTo', ...v]); },
    measureText(t) { return { width: String(t).length * 14 }; },
    fillText(t, x, y) { calls.push(['fillText', t, x, y]); },
    strokeText() {},
  };
  return { ctx, calls };
}

test('all new rich motion graphic templates validate, commit, snapshot, and render via Compositor', () => {
  const richCases = [
    {
      op: 'addGraphic',
      kind: 'stat-counter',
      text: 'Revenue Growth',
      subtitle: 'Last 90 days',
      value: 10,
      suffix: 'x',
      icon: 'chart',
      theme: 'clean-light',
      accent: '#10b981',
      startTime: 1,
      duration: 2.5,
      motion: 'pop',
    },
    {
      op: 'addGraphic',
      kind: 'progress-ring',
      text: 'Faster Workflow',
      subtitle: 'Measured benchmark',
      value: 85,
      suffix: '%',
      theme: 'frosted-glass',
      accent: '#7c3aed',
      startTime: 4,
      duration: 2.5,
      motion: 'slide-up',
    },
    {
      op: 'addGraphic',
      kind: 'bar-chart',
      text: 'Retention Lift',
      bars: [
        { label: 'Raw', value: 28, displayValue: '28%' },
        { label: 'Edited', value: 74, displayValue: '74%' },
      ],
      theme: 'clean-light',
      accent: '#2563eb',
      startTime: 7,
      duration: 2.5,
      motion: 'slide-up',
    },
    {
      op: 'addGraphic',
      kind: 'comparison',
      text: 'Workflow Shift',
      comparison: { leftTitle: 'Old Way', leftValue: '4 hrs', rightTitle: 'Kreovar', rightValue: '4 mins' },
      theme: 'clean-light',
      accent: '#7c3aed',
      startTime: 10,
      duration: 2.5,
      motion: 'pop',
    },
    {
      op: 'addGraphic',
      kind: 'checklist',
      text: 'Key Rules',
      items: ['Hook in 2s', 'Cut silences', 'Add visual proof'],
      theme: 'editorial-paper',
      accent: '#059669',
      startTime: 13,
      duration: 2.5,
      motion: 'slide-up',
    },
    {
      op: 'addGraphic',
      kind: 'step-flow',
      text: 'Launch Process',
      items: ['Script', 'Edit', 'Publish'],
      theme: 'clean-light',
      accent: '#2563eb',
      startTime: 16,
      duration: 2.5,
      motion: 'slide-left',
    },
    {
      op: 'addGraphic',
      kind: 'notification',
      text: 'Export Ready',
      subtitle: '1080p MP4 rendered',
      icon: 'check',
      theme: 'frosted-glass',
      accent: '#10b981',
      startTime: 1,
      duration: 2.0,
      motion: 'pop',
      y: -0.25,
    },
    {
      op: 'addGraphic',
      kind: 'pointer-callout',
      text: 'Zero setup cost',
      subtitle: 'Runs on edge',
      icon: 'bolt',
      targetX: 0.12,
      targetY: 0.25,
      theme: 'clean-light',
      accent: '#7c3aed',
      startTime: 4,
      duration: 2.0,
      motion: 'pop',
    },
    {
      op: 'addGraphic',
      kind: 'quote-card',
      text: 'Clarity beats complexity.',
      subtitle: 'Editorial Rule',
      theme: 'editorial-paper',
      accent: '#d97706',
      startTime: 7,
      duration: 2.0,
      motion: 'fade' in model ? 'slide-up' : 'slide-up',
    },
    {
      op: 'addGraphic',
      kind: 'kinetic-badge',
      text: '10X FASTER',
      icon: 'rocket',
      theme: 'clean-light',
      accent: '#6366f1',
      startTime: 10,
      duration: 2.0,
      motion: 'pop',
    },
  ];

  const base = makeProject('9:16');
  const plan = validateAiPlan({ summary: 'Rich motion graphics showcase', decisions: richCases }, base);
  const result = applyEditDecisionList(base, plan.list);

  const graphicClips = Object.values(result.clips).filter((c) => Boolean(c.graphic));
  assert.equal(graphicClips.length, richCases.length, 'All 10 graphics placed without track collision error');

  // Verify snapshot sanitization & legacy bridge roundtrip
  const snap = aiProjectSnapshot(JSON.parse(JSON.stringify(result)));
  assert.equal(Object.values(snap.clips).filter((c) => Boolean(c.graphic)).length, richCases.length);
  assert.deepEqual(bridge.fromLegacy(bridge.toLegacy(result)).clips, result.clips);

  // Verify Compositor renders every rich template cleanly with roundRect + fillText + selection bounds
  const compositor = new Compositor({});
  for (const gc of graphicClips) {
    const { ctx, calls } = makeMockCtx();
    const canvas = { width: 1080, height: 1920, getContext: () => ctx };
    const bounds = compositor.render(canvas, result, gc.startTime + gc.duration * 0.5);
    assert.ok(bounds.some((b) => b.id === gc.id && b.width > 100 && b.height > 50), `Bounds produced for ${gc.graphic.kind}`);
    assert.ok(calls.some((c) => c[0] === 'roundRect'), `Card backdrop drawn for ${gc.graphic.kind}`);
    assert.ok(calls.some((c) => c[0] === 'fillText'), `Typography drawn for ${gc.graphic.kind}`);
  }
});

test('changeMotionGraphic updates kind, theme, icon, value, and title cleanly', () => {
  let p = makeProject();
  p = graphic.addMotionGraphic(p, 'stat-counter', 'Active Users', 2, 3, '#7c3aed', 'pop', {
    value: 500,
    suffix: '+',
    theme: 'clean-light',
  });
  const clip = Object.values(p.clips).find((c) => c.graphic);
  assert.ok(clip);
  const updated = graphic.changeMotionGraphic(p, clip.id, {
    kind: 'progress-ring',
    theme: 'dark-slate',
    icon: 'rocket',
    value: 92,
    suffix: '%',
    subtitle: 'Conversion rate',
    text: 'Signups',
  });
  const after = updated.clips[clip.id];
  assert.equal(after.graphic.kind, 'progress-ring');
  assert.equal(after.graphic.theme, 'dark-slate');
  assert.equal(after.graphic.icon, 'rocket');
  assert.equal(after.graphic.value, 92);
  assert.equal(after.graphic.subtitle, 'Conversion rate');
  assert.equal(updated.textLayers[after.contentId].text, 'Signups');
});

test('kinetic stickers reconcile into vector kinetic-badge graphics instead of emoji boxes', () => {
  const p = makeProject();
  const res = reconcileEditingDecisions(
    p,
    [],
    [],
    { requestedKineticStickers: true },
    [{ text: 'This rocket launch doubled revenue fast', start: 0, end: 4, words: [
      { word: 'This', start: 0.2, end: 0.4 },
      { word: 'rocket', start: 0.5, end: 0.9 },
      { word: 'launch', start: 1.0, end: 1.3 },
      { word: 'doubled', start: 2.2, end: 2.6 },
      { word: 'revenue', start: 2.7, end: 3.2 },
    ] }]
  );
  const badges = res.decisions.filter((d) => d.op === 'addGraphic');
  assert.ok(badges.length >= 1);
  assert.equal(badges[0].kind, 'kinetic-badge');
  assert.equal(badges[0].theme, 'clean-light');
  assert.ok(badges[0].icon);
});

test('Motion Director skill playbook exports compact prompt rules & markdown file exists', () => {
  const compact = skill.getMotionDirectorPromptSection(true);
  assert.ok(compact.includes('stat-counter'));
  assert.ok(compact.includes('bar-chart'));
  assert.ok(compact.includes('comparison'));
  assert.ok(fs.existsSync(path.resolve(root, 'app/lib/editor/skills/motion-director.md')));
});

test('talking-head safe placement keeps rich graphics off center face and off captions across 9:16 and 16:9', () => {
  const { reconcileMotionGraphicPlacements } = load('app/lib/editor/inPlaceReconciler');

  // 1) 9:16 vertical podcast where AI tries to put a comparison card and stat-counter right on the face (x=0, y=-0.20)
  const pVertical = op.addCaption(makeProject('9:16'), 'Speaking here', 0.5, 4);
  const badVerticalDecisions = [
    {
      op: 'addGraphic',
      kind: 'comparison',
      text: 'Old vs New',
      comparison: { leftTitle: 'Old', leftValue: 'Slow', rightTitle: 'New', rightValue: 'Fast' },
      startTime: 1,
      duration: 2.5,
      x: 0,
      y: -0.20,
    },
    {
      op: 'addGraphic',
      kind: 'stat-counter',
      text: 'Growth',
      value: 10,
      suffix: 'x',
      startTime: 5,
      duration: 2.5,
      x: 0,
      y: -0.15,
    },
    {
      op: 'addGraphic',
      kind: 'checklist',
      text: 'Rules',
      items: ['One', 'Two'],
      startTime: 9,
      duration: 2.5,
      x: 0,
      y: 0.35, // collides with bottom captions
    },
  ];
  const fixedVertical = reconcileMotionGraphicPlacements(pVertical, badVerticalDecisions, [], [
    { subjectRegion: 'upper-center', occupiedRegions: ['upper-center', 'center'], clearRegions: ['lower-center'] },
  ]);
  assert.equal(fixedVertical[0].y, 0.17, 'Wide 9:16 comparison moved from face (-0.20) to clear torso band (0.17)');
  assert.equal(fixedVertical[1].y, 0.17, 'Compact 9:16 stat moved off occupied upper-center face to clear lower-center torso band (0.17)');
  assert.ok(fixedVertical[2].y <= 0.24, '9:16 graphic colliding with bottom captions moved safely above caption band');

  // When upper-center is clear (head is in center), compact 9:16 stat goes cleanly to top header strip (-0.38)
  const fixedTopClear = reconcileMotionGraphicPlacements(pVertical, [badVerticalDecisions[1]], [], [
    { subjectRegion: 'center', occupiedRegions: ['center'], clearRegions: ['upper-center'] },
  ]);
  assert.equal(fixedTopClear[0].y, -0.38, 'Compact 9:16 stat goes to clear top strip above head (-0.38)');

  // 2) 16:9 horizontal podcast where speaker sits on the left -> graphic must move to clear right side
  const pHorizontal = makeProject('16:9');
  const badHorizontalDecisions = [
    {
      op: 'addGraphic',
      kind: 'bar-chart',
      text: 'Metrics',
      bars: [{ label: 'A', value: 40 }, { label: 'B', value: 85 }],
      startTime: 1,
      duration: 3,
      x: -0.25, // collides with left-side speaker!
      y: -0.05,
    },
    {
      op: 'addGraphic',
      kind: 'quote-card',
      text: 'Key idea',
      startTime: 6,
      duration: 3,
      x: 0, // collides with center face box!
      y: -0.15,
    },
  ];
  const fixedHorizontal = reconcileMotionGraphicPlacements(pHorizontal, badHorizontalDecisions, [], [
    { subjectRegion: 'middle-left', occupiedRegions: ['upper-left', 'middle-left', 'center'], clearRegions: ['middle-right', 'upper-right'] },
  ]);
  assert.ok(fixedHorizontal[0].x >= 0.25, '16:9 graphic moved from occupied left side to clear right column');
  assert.ok(Math.abs(fixedHorizontal[1].x) >= 0.25, '16:9 graphic moved off centered face to side column');
});
