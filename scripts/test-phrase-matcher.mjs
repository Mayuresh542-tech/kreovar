import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

describe('Semantic Phrase Timestamp Anchoring (phraseMatcher.ts)', () => {
  const { matchPhraseToSpeech } = loadModule('app/lib/editor/phraseMatcher');

  const mockSegments = [
    {
      clipId: 'clip-1',
      start: 0.0,
      end: 5.0,
      text: 'Welcome back to the podcast everybody.',
      words: [
        { word: 'Welcome', start: 0.2, end: 0.8 },
        { word: 'back', start: 0.85, end: 1.2 },
        { word: 'to', start: 1.25, end: 1.4 },
        { word: 'the', start: 1.45, end: 1.6 },
        { word: 'podcast', start: 1.65, end: 2.2 },
        { word: 'everybody.', start: 2.3, end: 3.1 }
      ]
    },
    {
      clipId: 'clip-2',
      start: 5.0,
      end: 12.0,
      text: 'Today we discuss the secret to success in online business.',
      words: [
        { word: 'Today', start: 5.2, end: 5.6 },
        { word: 'we', start: 5.65, end: 5.8 },
        { word: 'discuss', start: 5.85, end: 6.4 },
        { word: 'the', start: 6.5, end: 6.7 },
        { word: 'secret', start: 6.75, end: 7.2 },
        { word: 'to', start: 7.25, end: 7.4 },
        { word: 'success', start: 7.45, end: 8.1 },
        { word: 'in', start: 8.15, end: 8.3 },
        { word: 'online', start: 8.35, end: 8.9 },
        { word: 'business.', start: 9.0, end: 9.8 }
      ]
    }
  ];

  test('matches multi-word phrase with exact word-level boundaries', () => {
    const match = matchPhraseToSpeech('the secret to success', mockSegments);
    assert.ok(match, 'Match should be found');
    assert.equal(match.clipId, 'clip-2');
    assert.equal(match.start, 6.5);
    assert.equal(match.end, 8.1);
    assert.equal(match.matchedText, 'the secret to success');
  });

  test('normalizes casing and trailing punctuation', () => {
    const match = matchPhraseToSpeech('WELCOME BACK!', mockSegments);
    assert.ok(match, 'Case and punctuation normalized match should be found');
    assert.equal(match.clipId, 'clip-1');
    assert.equal(match.start, 0.2);
    assert.equal(match.end, 1.2);
  });

  test('matches single keyword in transcript', () => {
    const match = matchPhraseToSpeech('business', mockSegments);
    assert.ok(match, 'Keyword match should be found');
    assert.equal(match.clipId, 'clip-2');
    assert.equal(match.start, 9.0);
    assert.equal(match.end, 9.8);
  });

  test('returns undefined for non-existent phrase', () => {
    const match = matchPhraseToSpeech('cryptocurrency trading', mockSegments);
    assert.equal(match, undefined);
  });

  test('handles empty segments or phrases gracefully', () => {
    assert.equal(matchPhraseToSpeech('', mockSegments), undefined);
    assert.equal(matchPhraseToSpeech('hello', []), undefined);
  });
});
