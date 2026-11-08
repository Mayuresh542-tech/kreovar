import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');

function loadModule(relative) {
  const file = path.resolve(root, relative + (path.extname(relative) ? '' : '.ts'));
  const raw = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(raw, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const exports = {};
  new vm.Script('(function(require,module,exports){\n' + code + '\n})', { filename: file }).runInThisContext()(
    require,
    { exports },
    exports
  );
  return exports;
}

describe('Structured Intent & Constraint Parsing (editingIntent.ts)', () => {
  const { readEditingIntent, extractEditingConstraints } = loadModule('app/lib/editor/editingIntent');

  test('extractEditingConstraints identifies negative audio constraints', () => {
    const c1 = extractEditingConstraints('Add captions and zooms, but no music and no sfx');
    assert.equal(c1.disallowedAudio, true);
    assert.equal(c1.disallowedSfx, true);
    assert.equal(c1.disallowedCuts, false);

    const c2 = extractEditingConstraints("Don't add music or audio changes");
    assert.equal(c2.disallowedAudio, true);
  });

  test('extractEditingConstraints identifies Hinglish negative constraints', () => {
    const c = extractEditingConstraints('Captions laga do but audio mat change karna aur cut mat karna');
    assert.equal(c.disallowedAudio, true);
    assert.equal(c.disallowedCuts, true);
  });

  test('extractEditingConstraints extracts protected temporal bounds', () => {
    const c = extractEditingConstraints('Keep first 10 seconds untouched, then add pop captions');
    assert.equal(c.protectedIntervals.length, 1);
    assert.equal(c.protectedIntervals[0].start, 0);
    assert.equal(c.protectedIntervals[0].end, 10);
  });

  test('extractEditingConstraints extracts quoted semantic phrases', () => {
    const c = extractEditingConstraints("When I say 'the secret to success', punch in for emphasis");
    assert.equal(c.phraseQuotes.length, 1);
    assert.equal(c.phraseQuotes[0], 'the secret to success');
  });

  test('extractEditingConstraints detects selective zoom removal requests', () => {
    const c = extractEditingConstraints('Remove the zooms but keep captions and b-roll');
    assert.equal(c.removeZooms, true);
  });

  test('readEditingIntent preserves existing contract and attaches constraints', () => {
    const parsed = readEditingIntent({
      intent: {
        goal: 'High energy reel',
        preserve: ['original dialogue', 'no music'],
        questions: []
      }
    }, 'Add captions but no music');

    assert.ok(parsed);
    assert.ok(parsed.summary.includes('High energy reel'));
    assert.ok(parsed.constraints);
    assert.equal(parsed.constraints.disallowedAudio, true);
  });
});
