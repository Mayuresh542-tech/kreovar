import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');

function loadModule(relativePath) {
  let fullPath = path.resolve(root, relativePath);
  if (!fs.existsSync(fullPath) && fs.existsSync(fullPath + '.ts')) {
    fullPath += '.ts';
  }
  const source = fs.readFileSync(fullPath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;

  const mod = { exports: {} };
  const req = (id) => {
    if (id.startsWith('./') || id.startsWith('../')) {
      const dir = path.dirname(fullPath);
      return loadModule(path.relative(root, path.resolve(dir, id)));
    }
    return require(id);
  };

  const fn = new Function('require', 'module', 'exports', compiled);
  fn(req, mod, mod.exports);
  return mod.exports;
}

const speedCurves = loadModule('app/lib/editor/speedCurves.ts');
const shortcuts = loadModule('app/lib/editor/shortcuts.ts');

test('Speed Curves: Presets conform to CapCut specification Section 4.1', () => {
  const hero = speedCurves.getSpeedCurvePreset('Hero');
  assert.equal(hero.name, 'Hero');
  assert.deepEqual(hero.p0, { x: 0.0, y: 1.0 });
  assert.deepEqual(hero.p1, { x: 0.2, y: 5.0 });
  assert.deepEqual(hero.p2, { x: 0.5, y: 0.2 });
  assert.deepEqual(hero.p3, { x: 1.0, y: 1.0 });

  const bullet = speedCurves.getSpeedCurvePreset('Bullet');
  assert.equal(bullet.name, 'Bullet');
  assert.deepEqual(bullet.p0, { x: 0.0, y: 1.0 });
  assert.deepEqual(bullet.p1, { x: 0.4, y: 0.1 });
  assert.deepEqual(bullet.p2, { x: 0.6, y: 0.1 });
  assert.deepEqual(bullet.p3, { x: 1.0, y: 1.0 });

  const montage = speedCurves.getSpeedCurvePreset('Montage');
  assert.equal(montage.name, 'Montage');
  assert.deepEqual(montage.p0, { x: 0.0, y: 0.5 });
  assert.deepEqual(montage.p1, { x: 0.3, y: 3.5 });
  assert.deepEqual(montage.p2, { x: 0.7, y: 0.3 });
  assert.deepEqual(montage.p3, { x: 1.0, y: 2.0 });

  const jumpCut = speedCurves.getSpeedCurvePreset('Jump Cut');
  assert.equal(jumpCut.name, 'Jump Cut');
  assert.deepEqual(jumpCut.p0, { x: 0.0, y: 2.0 });
  assert.deepEqual(jumpCut.p1, { x: 0.4, y: 0.2 });
  assert.deepEqual(jumpCut.p2, { x: 0.6, y: 5.0 });
  assert.deepEqual(jumpCut.p3, { x: 1.0, y: 0.5 });

  const flashIn = speedCurves.getSpeedCurvePreset('Flash In');
  assert.equal(flashIn.name, 'Flash In');
  assert.deepEqual(flashIn.p0, { x: 0.0, y: 5.0 });
  assert.deepEqual(flashIn.p1, { x: 0.1, y: 3.0 });
  assert.deepEqual(flashIn.p2, { x: 0.4, y: 1.0 });
  assert.deepEqual(flashIn.p3, { x: 1.0, y: 1.0 });

  const flashOut = speedCurves.getSpeedCurvePreset('Flash Out');
  assert.equal(flashOut.name, 'Flash Out');
  assert.deepEqual(flashOut.p0, { x: 0.0, y: 1.0 });
  assert.deepEqual(flashOut.p1, { x: 0.6, y: 1.0 });
  assert.deepEqual(flashOut.p2, { x: 0.9, y: 3.0 });
  assert.deepEqual(flashOut.p3, { x: 1.0, y: 5.0 });
});

test('Speed Curves: Velocity evaluation & boundary values', () => {
  const hero = speedCurves.getSpeedCurvePreset('hero');
  const vStart = speedCurves.evaluateVelocityAtNormalizedTime(0, hero);
  assert.ok(Math.abs(vStart - 1.0) < 1e-3, `Start velocity expected 1.0, got ${vStart}`);

  const vEnd = speedCurves.evaluateVelocityAtNormalizedTime(1, hero);
  assert.ok(Math.abs(vEnd - 1.0) < 1e-3, `End velocity expected 1.0, got ${vEnd}`);

  const flashIn = speedCurves.getSpeedCurvePreset('flash_in');
  const vFlashInStart = speedCurves.evaluateVelocityAtNormalizedTime(0, flashIn);
  assert.ok(Math.abs(vFlashInStart - 5.0) < 1e-3, `Flash in start expected 5.0, got ${vFlashInStart}`);
});

test("Simpson's 3/8 Rule: Numerical integral and mapping to source media time", () => {
  const standard = speedCurves.getSpeedCurvePreset('standard');
  const integralConstant = speedCurves.integrateSimpson38(
    (t) => speedCurves.evaluateVelocityAtTime(t, 4, standard),
    0,
    4,
    48
  );
  assert.ok(Math.abs(integralConstant - 4.0) < 1e-3, `Expected 4.0, got ${integralConstant}`);

  const srcTime = speedCurves.mapTimelineTimeToSourceTime({
    timelineTime: 2.0,
    clipStartTime: 0.0,
    sourceStartTime: 10.0,
    duration: 4.0,
    curve: standard,
  });
  assert.ok(Math.abs(srcTime - 12.0) < 1e-3, `Expected 12.0s, got ${srcTime}`);

  const bullet = speedCurves.getSpeedCurvePreset('bullet');
  const avgSpeedBullet = speedCurves.calculateAverageSpeed(bullet);
  assert.ok(avgSpeedBullet < 1.0, `Expected bullet avg speed < 1.0, got ${avgSpeedBullet}`);
});

test('Audio: Decibel conversions & equal-power crossfades', () => {
  assert.ok(Math.abs(speedCurves.linearGainToDecibels(1.0) - 0) < 1e-3);
  assert.equal(speedCurves.formatGainAsDecibels(1.0), '0.0 dB');

  const minus6Gain = speedCurves.decibelsToLinearGain(-6.0206);
  assert.ok(Math.abs(minus6Gain - 0.5) < 1e-3);
  assert.equal(speedCurves.formatDecibels(-6.0), '-6.0 dB');

  const db15 = speedCurves.linearGainToDecibels(1.5);
  assert.ok(Math.abs(db15 - 3.52) < 0.1);
  assert.equal(speedCurves.formatGainAsDecibels(1.5), '+3.5 dB');

  for (let p = 0; p <= 1.0; p += 0.1) {
    const { gainA, gainB } = speedCurves.equalPowerCrossfade(p);
    const power = gainA * gainA + gainB * gainB;
    assert.ok(Math.abs(power - 1.0) < 1e-5, `Power at ${p} expected 1.0, got ${power}`);
  }
});

test('Shortcuts: CapCut parity (Ctrl+B/S for split, Q/[ for trim start, W/] for trim end, N for snapping)', () => {
  const splitCtrlB = shortcuts.resolveShortcutAction({ key: 'b', ctrlKey: true });
  assert.equal(splitCtrlB, 'split-clip');

  const splitCmdB = shortcuts.resolveShortcutAction({ key: 'b', metaKey: true });
  assert.equal(splitCmdB, 'split-clip');

  const splitS = shortcuts.resolveShortcutAction({ key: 's' });
  assert.equal(splitS, 'split-clip');

  assert.equal(shortcuts.resolveShortcutAction({ key: 'q' }), 'trim-start-to-playhead');
  assert.equal(shortcuts.resolveShortcutAction({ key: '[' }), 'trim-start-to-playhead');

  assert.equal(shortcuts.resolveShortcutAction({ key: 'w' }), 'trim-end-to-playhead');
  assert.equal(shortcuts.resolveShortcutAction({ key: ']' }), 'trim-end-to-playhead');

  assert.equal(shortcuts.resolveShortcutAction({ key: 'n' }), 'toggle-snapping');
});
