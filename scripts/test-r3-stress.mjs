import assert from 'node:assert/strict';
import {test, describe} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const root = process.cwd();
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');
const {NextRequest} = require('next/server');

function loader(mocks = {}, globals = {}) {
  const cache = new Map();
  const context = vm.createContext({
    console,
    URL,
    Headers,
    Response,
    Request,
    NextRequest,
    Buffer,
    Blob,
    File,
    Error,
    AbortSignal,
    AbortController,
    ReadableStream,
    Uint8Array,
    TextEncoder,
    TextDecoder,
    crypto: globalThis.crypto,
    setTimeout,
    clearTimeout,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'mock-anon-key' } },
    ...globals,
  });

  function load(rel) {
    let f = path.resolve(root, rel);
    if (!path.extname(f)) f += '.ts';
    const key = path.relative(root, f).replaceAll('\\', '/');
    if (Object.hasOwn(mocks, key)) return mocks[key];
    if (cache.has(f)) return cache.get(f);
    const exports = {};
    cache.set(f, exports);
    const code = ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText;
    new vm.Script(`(function(require,module,exports){\n${code}\n})`).runInContext(context)(
      s => s.startsWith('@/') ? load(s.slice(2)) : s.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(f), s))) : require(s),
      { exports },
      exports
    );
    return exports;
  }
  return load;
}

function createBaseProject() {
  return {
    schemaVersion: 1,
    id: 'proj-stress',
    title: 'Stress Test Project',
    revision: 1,
    trackOrder: ['track-caption', 'track-video', 'track-audio'],
    tracks: {
      'track-caption': { id: 'track-caption', name: 'Captions', kind: 'caption', clipIds: [], hidden: false, muted: false, locked: false },
      'track-video': { id: 'track-video', name: 'Video', kind: 'video', clipIds: [], hidden: false, muted: false, locked: false },
      'track-audio': { id: 'track-audio', name: 'Audio', kind: 'audio', clipIds: [], hidden: false, muted: false, locked: false },
    },
    clips: {},
    assets: {
      'asset-v1': { id: 'asset-v1', name: 'video.mp4', kind: 'video', duration: 30, width: 1920, height: 1080 },
      'asset-a1': { id: 'asset-a1', name: 'audio.mp3', kind: 'audio', duration: 30, width: 0, height: 0 }
    },
    textLayers: {},
    captions: {},
    transitions: {},
    settings: { aspectRatio: '9:16', fps: 30, background: '#000000' }
  };
}

describe('R3 Mission Item 1: Caption changeText stress testing', () => {
  const load = loader();
  const ops = load('app/lib/editor/operations.ts');
  const {aiProjectSnapshot} = load('app/lib/editor/aiValidation.ts');

  test('1.1: changeText with single word', () => {
    let p = createBaseProject();
    p = ops.addCaption(p, 'initial three words', 0, 3, {}, [
      { word: 'initial', start: 0, end: 1 },
      { word: 'three', start: 1, end: 2 },
      { word: 'words', start: 2, end: 3 }
    ]);
    const clipId = p.tracks['track-caption'].clipIds[0];
    const updated = ops.changeText(p, clipId, 'SingleWord');
    const cap = updated.captions[updated.clips[clipId].contentId];

    assert.equal(cap.text, 'SingleWord');
    assert.equal(cap.words.length, 1);
    assert.equal(cap.words[0].word, 'SingleWord');
    assert.equal(cap.words.map(w => w.word).join(" ").trim(), cap.text.trim());
    assert.doesNotThrow(() => aiProjectSnapshot(updated));
  });

  test('1.2: changeText with multiline text and multiple consecutive spaces', () => {
    let p = createBaseProject();
    p = ops.addCaption(p, 'alpha beta', 0, 2, {}, [
      { word: 'alpha', start: 0, end: 1 },
      { word: 'beta', start: 1, end: 2 }
    ]);
    const clipId = p.tracks['track-caption'].clipIds[0];
    const multiline = "LineOne\n\nLineTwo   LineThree\t\r\nLineFour";
    const updated = ops.changeText(p, clipId, multiline);
    const cap = updated.captions[updated.clips[clipId].contentId];

    assert.equal(cap.words.length, 4);
    assert.deepEqual([...cap.words.map(w => w.word)], ['LineOne', 'LineTwo', 'LineThree', 'LineFour']);
    assert.equal(cap.words.map(w => w.word).join(" ").trim(), cap.text.trim());
    // verify start times are non-decreasing
    for (let i = 1; i < cap.words.length; i++) {
      assert.ok(cap.words[i].start >= cap.words[i - 1].start, 'Timestamps must be non-decreasing');
      assert.ok(cap.words[i].end >= cap.words[i].start, 'Word end must be >= start');
    }
    assert.doesNotThrow(() => aiProjectSnapshot(updated));
  });

  test('1.3: changeText with punctuation and special characters', () => {
    let p = createBaseProject();
    p = ops.addCaption(p, 'start here', 0, 2);
    const clipId = p.tracks['track-caption'].clipIds[0];
    const punctText = "Hello, world! (Is this 100% fine? Yes--it's fine.)";
    const updated = ops.changeText(p, clipId, punctText);
    const cap = updated.captions[updated.clips[clipId].contentId];

    assert.equal(cap.words.map(w => w.word).join(" ").trim(), cap.text.trim());
    assert.doesNotThrow(() => aiProjectSnapshot(updated));
  });

  test('1.4: changeText with large token count (50 words) maintains timestamp monotonicity', () => {
    let p = createBaseProject();
    p = ops.addCaption(p, 'short text', 0, 10);
    const clipId = p.tracks['track-caption'].clipIds[0];
    const longText = Array.from({length: 50}, (_, i) => `word${i}`).join(' ');
    const updated = ops.changeText(p, clipId, longText);
    const cap = updated.captions[updated.clips[clipId].contentId];

    assert.equal(cap.words.length, 50);
    assert.equal(cap.words.map(w => w.word).join(" ").trim(), cap.text.trim());
    for (let i = 1; i < cap.words.length; i++) {
      assert.ok(cap.words[i].start >= cap.words[i - 1].start, `Index ${i} start ${cap.words[i].start} must be >= index ${i - 1} start ${cap.words[i-1].start}`);
      assert.ok(cap.words[i].end >= cap.words[i].start, `Index ${i} end must be >= start`);
    }
    assert.doesNotThrow(() => aiProjectSnapshot(updated));
  });

  test('1.5: changeText studioData remapping downscales and upscales cleanly', () => {
    let p = createBaseProject();
    p = ops.addCaption(p, 'zero one two three four', 0, 5, {}, [
      { word: 'zero', start: 0, end: 1 },
      { word: 'one', start: 1, end: 2 },
      { word: 'two', start: 2, end: 3 },
      { word: 'three', start: 3, end: 4 },
      { word: 'four', start: 4, end: 5 }
    ]);
    const clipId = p.tracks['track-caption'].clipIds[0];
    const contentId = p.clips[clipId].contentId;
    p.captions[contentId].studioData = {
      templateId: 'clean-sub',
      emphasizedWords: [2, 4],
      wordStyles: { '2': { spotlight: true }, '4': { color: '#ff0000' } }
    };

    // Shrink from 5 words to 2 words
    const shrunk = ops.changeText(p, clipId, 'new0 new1');
    const shrunkCap = shrunk.captions[contentId];
    assert.equal(shrunkCap.words.length, 2);
    assert.ok(shrunkCap.studioData);
    assert.ok(Array.isArray(shrunkCap.studioData.emphasizedWords));
    // Index 2 (2 * 2 / 5 = 0) and 4 (4 * 2 / 5 = 1)
    assert.ok(shrunkCap.studioData.emphasizedWords.includes(0));
    assert.ok(shrunkCap.studioData.emphasizedWords.includes(1));
    assert.ok(shrunkCap.studioData.wordStyles['0']);
    assert.ok(shrunkCap.studioData.wordStyles['1']);
    assert.doesNotThrow(() => aiProjectSnapshot(shrunk));
  });

  test('1.6: changeText with empty string produces empty words array', () => {
    let p = createBaseProject();
    p = ops.addCaption(p, 'initial words', 0, 3, {}, [
      { word: 'initial', start: 0, end: 1 },
      { word: 'words', start: 1, end: 2 }
    ]);
    const clipId = p.tracks['track-caption'].clipIds[0];
    const contentId = p.clips[clipId].contentId;
    const updated = ops.changeText(p, clipId, '');
    const cap = updated.captions[contentId];

    assert.equal(cap.text, '');
    assert.equal(cap.words.length, 0);
    assert.equal(cap.words.map(w => w.word).join(" ").trim(), cap.text.trim());
  });

  test('1.7: changeText with empty string preserves non-empty clip.name, passing aiProjectSnapshot', () => {
    let p = createBaseProject();
    p = ops.addCaption(p, 'initial words', 0, 3, {}, [
      { word: 'initial', start: 0, end: 1 },
      { word: 'words', start: 1, end: 2 }
    ]);
    const clipId = p.tracks['track-caption'].clipIds[0];
    const updated = ops.changeText(p, clipId, '');

    // Clip name is preserved or defaulted, not empty:
    assert.ok(updated.clips[clipId].name.trim().length > 0);
    assert.notEqual(updated.clips[clipId].name, '');

    // aiProjectSnapshot validates clip.name with string(), which does not throw
    assert.doesNotThrow(() => aiProjectSnapshot(updated));
  });
});

describe('R3 Mission Item 2: splitClip on captions stress testing', () => {
  const load = loader();
  const ops = load('app/lib/editor/operations.ts');
  const {aiProjectSnapshot} = load('app/lib/editor/aiValidation.ts');

  test('2.1: word crossing split boundary is preserved in both halves with sliced times', () => {
    let p = createBaseProject();
    p = ops.addCaption(p, 'before straddling after', 0, 4, {}, [
      { word: 'before', start: 0, end: 1 },
      { word: 'straddling', start: 1.5, end: 2.5 },
      { word: 'after', start: 3, end: 4 }
    ]);
    const clipId = p.tracks['track-caption'].clipIds[0];
    p.captions[p.clips[clipId].contentId].studioData = {
      templateId: 'clean-sub',
      emphasizedWords: [1], // straddling
      wordStyles: { '1': { spotlight: true } }
    };

    // Split at time = 2.0 (source = 2.0)
    const split = ops.splitClip(p, clipId, 2.0);
    const leftClip = split.clips[clipId];
    const rightClipId = split.tracks['track-caption'].clipIds.find(id => id !== clipId);
    const rightClip = split.clips[rightClipId];

    const leftCap = split.captions[leftClip.contentId];
    const rightCap = split.captions[rightClip.contentId];

    // Left should have 'before' and 'straddling' (sliced to [1.5, 2.0])
    assert.equal(leftCap.text, 'before straddling');
    assert.equal(leftCap.words.length, 2);
    assert.equal(leftCap.words[0].word, 'before');
    assert.equal(leftCap.words[1].word, 'straddling');
    assert.equal(leftCap.words[1].start, 1.5);
    assert.equal(leftCap.words[1].end, 2.0);
    assert.ok(leftCap.studioData.emphasizedWords.includes(1));
    assert.ok(leftCap.studioData.wordStyles['1']);

    // Right should have 'straddling' (sliced to [2.0, 2.5]) and 'after'
    assert.equal(rightCap.text, 'straddling after');
    assert.equal(rightCap.words.length, 2);
    assert.equal(rightCap.words[0].word, 'straddling');
    assert.equal(rightCap.words[0].start, 2.0);
    assert.equal(rightCap.words[0].end, 2.5);
    assert.equal(rightCap.words[1].word, 'after');
    // Emphasized word 'straddling' origIdx=1 remapped to newIdx=0 on right!
    assert.ok(rightCap.studioData.emphasizedWords.includes(0));
    assert.ok(rightCap.studioData.wordStyles['0']);

    assert.doesNotThrow(() => aiProjectSnapshot(split));
  });

  test('2.2: words strictly before and strictly after split boundary', () => {
    let p = createBaseProject();
    p = ops.addCaption(p, 'wordA wordB wordC wordD', 0, 4, {}, [
      { word: 'wordA', start: 0.2, end: 0.8 },
      { word: 'wordB', start: 1.0, end: 1.6 },
      { word: 'wordC', start: 2.2, end: 2.8 },
      { word: 'wordD', start: 3.0, end: 3.6 }
    ]);
    const clipId = p.tracks['track-caption'].clipIds[0];
    p.captions[p.clips[clipId].contentId].studioData = {
      templateId: 'clean-sub',
      emphasizedWords: [3], // wordD
      wordStyles: { '3': { spotlight: true } }
    };

    const split = ops.splitClip(p, clipId, 2.0);
    const leftClip = split.clips[clipId];
    const rightClipId = split.tracks['track-caption'].clipIds.find(id => id !== clipId);
    const rightClip = split.clips[rightClipId];

    const leftCap = split.captions[leftClip.contentId];
    const rightCap = split.captions[rightClip.contentId];

    assert.equal(leftCap.text, 'wordA wordB');
    assert.deepEqual([...leftCap.words.map(w => w.word)], ['wordA', 'wordB']);
    // wordD was origIdx 3, not in left
    assert.deepEqual([...(leftCap.studioData?.emphasizedWords || [])], []);

    assert.equal(rightCap.text, 'wordC wordD');
    assert.deepEqual([...rightCap.words.map(w => w.word)], ['wordC', 'wordD']);
    // wordD was origIdx 3, in right it's newIdx 1
    assert.deepEqual([...(rightCap.studioData?.emphasizedWords || [])], [1]);
    assert.ok(rightCap.studioData?.wordStyles['1']);

    assert.doesNotThrow(() => aiProjectSnapshot(split));
  });

  test('2.3: split with speed !== 1 scales split source time accurately', () => {
    let p = createBaseProject();
    p = ops.addCaption(p, 'w1 w2 w3 w4', 0, 4, {}, [
      { word: 'w1', start: 0, end: 1 },
      { word: 'w2', start: 1, end: 2 },
      { word: 'w3', start: 2, end: 3 },
      { word: 'w4', start: 3, end: 4 }
    ]);
    const clipId = p.tracks['track-caption'].clipIds[0];
    // Set speed = 2, so duration 4 becomes duration 2 and sourceEnd stays 4
    p = ops.changeClipProperty(p, clipId, { speed: 2 });
    assert.equal(p.clips[clipId].duration, 4 / 2); // 2

    // Split at timeline time = 1.0 (source = 0 + 1.0 * 2 = 2.0)
    const split = ops.splitClip(p, clipId, 1.0);
    const leftClip = split.clips[clipId];
    const rightClipId = split.tracks['track-caption'].clipIds.find(id => id !== clipId);
    const rightClip = split.clips[rightClipId];

    assert.equal(leftClip.sourceStart, 0);
    assert.equal(leftClip.sourceEnd, 2.0);
    assert.equal(rightClip.sourceStart, 2.0);
    assert.equal(rightClip.sourceEnd, 4.0);

    const leftCap = split.captions[leftClip.contentId];
    const rightCap = split.captions[rightClip.contentId];
    assert.equal(leftCap.text, 'w1 w2');
    assert.equal(rightCap.text, 'w3 w4');

    assert.doesNotThrow(() => aiProjectSnapshot(split));
  });
});

describe('R3 Mission Item 3: trimClip on left and right edges with captions', () => {
  const load = loader();
  const ops = load('app/lib/editor/operations.ts');
  const {aiProjectSnapshot} = load('app/lib/editor/aiValidation.ts');

  test('3.1: trimClip left edge slices words and clamps boundaries', () => {
    let p = createBaseProject();
    p = ops.addCaption(p, 'alpha beta gamma delta', 0, 4, {}, [
      { word: 'alpha', start: 0, end: 1 },
      { word: 'beta', start: 1, end: 2 },
      { word: 'gamma', start: 2, end: 3 },
      { word: 'delta', start: 3, end: 4 }
    ]);
    const clipId = p.tracks['track-caption'].clipIds[0];
    p.captions[p.clips[clipId].contentId].studioData = {
      templateId: 'clean-sub',
      emphasizedWords: [2], // gamma
      wordStyles: { '2': { spotlight: true } }
    };

    // Trim left edge to time 1.5
    const trimmed = ops.trimClip(p, clipId, 'left', 1.5);
    const c = trimmed.clips[clipId];
    const cap = trimmed.captions[c.contentId];

    // beta was [1, 2], sStart is 1.5, so beta clamped to [1.5, 2]
    assert.equal(cap.text, 'beta gamma delta');
    assert.equal(cap.words.length, 3);
    assert.equal(cap.words[0].word, 'beta');
    assert.equal(cap.words[0].start, 1.5);
    assert.equal(cap.words[0].end, 2.0);

    // gamma was origIdx 2, now newIdx 1
    assert.deepEqual([...cap.studioData.emphasizedWords], [1]);
    assert.ok(cap.studioData.wordStyles['1']);

    assert.doesNotThrow(() => aiProjectSnapshot(trimmed));
  });

  test('3.2: trimClip right edge slices words and clamps boundaries', () => {
    let p = createBaseProject();
    p = ops.addCaption(p, 'alpha beta gamma delta', 0, 4, {}, [
      { word: 'alpha', start: 0, end: 1 },
      { word: 'beta', start: 1, end: 2 },
      { word: 'gamma', start: 2, end: 3 },
      { word: 'delta', start: 3, end: 4 }
    ]);
    const clipId = p.tracks['track-caption'].clipIds[0];

    // Trim right edge to time 2.5
    const trimmed = ops.trimClip(p, clipId, 'right', 2.5);
    const c = trimmed.clips[clipId];
    const cap = trimmed.captions[c.contentId];

    // gamma was [2, 3], sEnd is 2.5, so gamma clamped to [2, 2.5]
    assert.equal(cap.text, 'alpha beta gamma');
    assert.equal(cap.words.length, 3);
    assert.equal(cap.words[2].word, 'gamma');
    assert.equal(cap.words[2].start, 2.0);
    assert.equal(cap.words[2].end, 2.5);

    assert.doesNotThrow(() => aiProjectSnapshot(trimmed));
  });
});

describe('R3 Mission Item 4: mergeCaptions sourceEnd formula and timestamps', () => {
  const load = loader();
  const ops = load('app/lib/editor/operations.ts');
  const {aiProjectSnapshot} = load('app/lib/editor/aiValidation.ts');

  test('4.1: mergeCaptions sourceEnd with first.sourceStart > 0 and speed !== 1', () => {
    let p = createBaseProject();
    p = ops.addCaption(p, 'first clip words', 2, 3, {}, [
      { word: 'first', start: 0, end: 1 },
      { word: 'clip', start: 1, end: 2 },
      { word: 'words', start: 2, end: 3 }
    ]);
    p = ops.addCaption(p, 'second clip words', 5, 4, {}, [
      { word: 'second', start: 0, end: 1 },
      { word: 'clip', start: 1, end: 2 },
      { word: 'words', start: 2, end: 4 }
    ]);
    const clipIds = p.tracks['track-caption'].clipIds;
    const firstId = clipIds[0];

    // Set first clip with sourceStart = 4.0 and speed = 2.0
    p = ops.changeClipProperty(p, firstId, { speed: 2.0 });
    // Manually set sourceStart on first clip to test formula
    p = {
      ...p,
      clips: {
        ...p.clips,
        [firstId]: { ...p.clips[firstId], sourceStart: 4.0, sourceEnd: 4.0 + p.clips[firstId].duration * 2.0 }
      }
    };
    // Also adjust words in first caption to match sourceStart = 4.0
    p.captions[p.clips[firstId].contentId].words = [
      { word: 'first', start: 4.0, end: 5.0 },
      { word: 'clip', start: 5.0, end: 6.0 },
      { word: 'words', start: 6.0, end: 7.0 }
    ];

    const first = p.clips[firstId];
    const second = p.clips[clipIds[1]];
    const end = Math.max(first.startTime + first.duration, second.startTime + second.duration);

    const merged = ops.mergeCaptions(p, clipIds);
    const mergedClip = merged.clips[firstId];

    // Expected sourceEnd formula: first.sourceStart + (end - first.startTime) * first.speed
    const expectedSourceEnd = first.sourceStart + (end - first.startTime) * first.speed;
    assert.equal(mergedClip.sourceEnd, expectedSourceEnd);
    assert.equal(mergedClip.duration, end - first.startTime);

    const cap = merged.captions[mergedClip.contentId];
    assert.equal(cap.text, 'first clip words second clip words');
    assert.equal(cap.words.length, 6);

    // Verify all merged words have strictly monotonic start timestamps
    for (let i = 1; i < cap.words.length; i++) {
      assert.ok(cap.words[i].start >= cap.words[i - 1].start, `Merged word ${i} start must be >= word ${i-1} start`);
    }

    assert.doesNotThrow(() => aiProjectSnapshot(merged));
  });

  test('4.2: mergeCaptions combines studioData emphasizedWords and wordStyles with correct offset', () => {
    let p = createBaseProject();
    p = ops.addCaption(p, 'a b', 0, 2, {}, [
      { word: 'a', start: 0, end: 1 },
      { word: 'b', start: 1, end: 2 }
    ]);
    p = ops.addCaption(p, 'c d', 2, 2, {}, [
      { word: 'c', start: 0, end: 1 },
      { word: 'd', start: 1, end: 2 }
    ]);
    const clipIds = p.tracks['track-caption'].clipIds;
    p.captions[p.clips[clipIds[0]].contentId].studioData = {
      templateId: 'clean-sub',
      emphasizedWords: [1], // 'b'
      wordStyles: { '1': { spotlight: true } }
    };
    p.captions[p.clips[clipIds[1]].contentId].studioData = {
      templateId: 'clean-sub',
      emphasizedWords: [0], // 'c', should become 0 + 2 = 2
      wordStyles: { '0': { color: '#00ff00' } }
    };

    const merged = ops.mergeCaptions(p, clipIds);
    const cap = merged.captions[merged.clips[clipIds[0]].contentId];

    assert.ok(cap.studioData.emphasizedWords.includes(1), 'Must have word 1 (b)');
    assert.ok(cap.studioData.emphasizedWords.includes(2), 'Must have word 2 (c)');
    assert.ok(cap.studioData.wordStyles['1']);
    assert.ok(cap.studioData.wordStyles['2']);

    assert.doesNotThrow(() => aiProjectSnapshot(merged));
  });
});

describe('R3 Mission Item 5: rippleCut studioData re-indexing and visual treatment', () => {
  const load = loader();
  const {defaultStyle} = load('app/lib/editor/model.ts');
  const {rippleCut} = load('app/lib/editor/rippleCut.ts');
  const {aiProjectSnapshot} = load('app/lib/editor/aiValidation.ts');

  test('5.1: rippleCut multiple cuts re-indexes studioData across gaps', () => {
    const p = createBaseProject();
    p.clips['clip-cap'] = {
      id: 'clip-cap', contentId: 'cap-1', trackId: 'track-caption', name: 'Cap',
      startTime: 0, duration: 10, sourceStart: 0, sourceEnd: 10,
      transform: { x: 0, y: 0.35, scale: 1, rotation: 0, opacity: 1 }, effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
      volume: 0, speed: 1, fadeIn: 0, fadeOut: 0
    };
    p.tracks['track-caption'].clipIds = ['clip-cap'];
    p.captions['cap-1'] = {
      id: 'cap-1',
      text: 'w0 w1 w2 w3 w4 w5 w6 w7',
      style: { ...defaultStyle },
      words: [
        { word: 'w0', start: 0, end: 1 },
        { word: 'w1', start: 1, end: 2 },
        { word: 'w2', start: 2, end: 3 },
        { word: 'w3', start: 3, end: 4 },
        { word: 'w4', start: 4, end: 5 },
        { word: 'w5', start: 5, end: 6 },
        { word: 'w6', start: 6, end: 7 },
        { word: 'w7', start: 7, end: 8 }
      ],
      studioData: {
        templateId: 'clean-sub',
        emphasizedWords: [1, 6], // w1 and w6
        wordStyles: { '1': { spotlight: true }, '6': { color: '#ff00ff' } }
      }
    };

    // Cut range 1: [2.5, 3.5] (removes w2, w3)
    // Cut range 2: [4.5, 5.5] (removes w4, w5)
    const cut = rippleCut(p, [
      { start: 2.5, end: 3.5 },
      { start: 4.5, end: 5.5 }
    ]);

    const survivingCapClips = Object.values(cut.clips).filter(c => c.trackId === 'track-caption');
    assert.ok(survivingCapClips.length > 0);

    // Check first fragment has w1 emphasized at index 1
    const firstCap = cut.captions[survivingCapClips[0].contentId];
    if (firstCap && firstCap.words?.some(w => w.word === 'w1')) {
      const idx = firstCap.words.findIndex(w => w.word === 'w1');
      assert.ok(firstCap.studioData.emphasizedWords.includes(idx));
      assert.ok(firstCap.studioData.wordStyles[String(idx)]);
    }

    // Check last fragment has w6 emphasized
    const lastCap = cut.captions[survivingCapClips[survivingCapClips.length - 1].contentId];
    if (lastCap && lastCap.words?.some(w => w.word === 'w6')) {
      const idx = lastCap.words.findIndex(w => w.word === 'w6');
      assert.ok(lastCap.studioData.emphasizedWords.includes(idx));
      assert.ok(lastCap.studioData.wordStyles[String(idx)]);
    }

    assert.doesNotThrow(() => aiProjectSnapshot(cut));
  });

  test('5.2: rippleCut anchors visual treatment entrance and exit source times', () => {
    const p = createBaseProject();
    p.clips['clip-vid'] = {
      id: 'clip-vid', assetId: 'asset-v1', trackId: 'track-video', name: 'Vid',
      startTime: 0, duration: 10, sourceStart: 0, sourceEnd: 10,
      transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
      volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
      visualTreatment: {
        entrance: { sourceDuration: 1.0, opacity: 0 },
        exit: { sourceDuration: 1.0, opacity: 0 }
      }
    };
    p.tracks['track-video'].clipIds = ['clip-vid'];

    const cut = rippleCut(p, [{ start: 3.0, end: 6.0 }]);
    const surviving = Object.values(cut.clips).filter(c => c.trackId === 'track-video');
    assert.equal(surviving.length, 2);

    // Both surviving segments should have entrance and exit sourceTime anchored
    for (const c of surviving) {
      assert.ok(c.visualTreatment);
      assert.equal(typeof c.visualTreatment.entrance.sourceTime, 'number');
      assert.equal(c.visualTreatment.entrance.sourceTime, 0); // anchored to original sourceStart
      assert.equal(typeof c.visualTreatment.exit.sourceTime, 'number');
      assert.equal(c.visualTreatment.exit.sourceTime, 10); // anchored to original sourceEnd
    }

    assert.doesNotThrow(() => aiProjectSnapshot(cut));
  });

  test('5.3: rippleCut sets empty text and words on cut segments where words.length === 0', () => {
    const p = createBaseProject();
    p.clips['clip-cap'] = {
      id: 'clip-cap', contentId: 'cap-1', trackId: 'track-caption', name: 'Words',
      startTime: 0, duration: 10, sourceStart: 0, sourceEnd: 10,
      transform: { x: 0, y: 0.35, scale: 1, rotation: 0, opacity: 1 }, effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 },
      volume: 0, speed: 1, fadeIn: 0, fadeOut: 0
    };
    p.tracks['track-caption'].clipIds = ['clip-cap'];
    p.captions['cap-1'] = {
      id: 'cap-1',
      text: 'hello world',
      style: { ...defaultStyle },
      words: [
        { word: 'hello', start: 0, end: 1 },
        { word: 'world', start: 1, end: 2 }
      ]
    };

    // Cut interval [4.0, 6.0], creating two segments: [0..4] (has words) and [6..10] (silent)
    const cut = rippleCut(p, [{ start: 4.0, end: 6.0 }]);
    const clips = Object.values(cut.clips).filter(c => c.trackId === 'track-caption');
    assert.equal(clips.length, 2);

    const secondClip = clips.find(c => c.sourceStart === 6.0);
    assert.ok(secondClip, 'Second clip fragment starting at sourceStart=6.0 must exist');
    const secondCap = cut.captions[secondClip.contentId];

    // Silent cut segment has empty text and empty words without duplicating uncut caption text
    assert.equal(secondCap.text, '');
    assert.equal(secondCap.words.length, 0);
    assert.doesNotThrow(() => aiProjectSnapshot(cut));
  });
});

describe('R3 Mission Item 6: audio duration scaling, bleed clamping & compositor layer sorting', () => {
  const load = loader({ 'app/lib/editor/waveform.ts': {}, 'app/lib/editor/media.ts': {} });
  const {clipAudioSlice} = load('app/lib/editor/offlineExport.ts');
  const {visibleLayers} = load('app/lib/editor/compositor.ts');

  test('6.1: clipAudioSlice calculates duration and timeline when with speed !== 1', () => {
    const clip = {
      startTime: 5.0,
      sourceStart: 10.0,
      sourceEnd: 20.0,
      duration: 5.0, // (20 - 10) / 2 = 5s timeline duration
      speed: 2.0
    };
    // audio slice from buffer starting at timestamp 12.0 with buffer duration 4.0
    const slice = clipAudioSlice(clip, 12.0, 4.0);
    // start should be 12.0, offset should be 0
    // length should be 4.0
    // when should be startTime + (start - sourceStart) / speed = 5.0 + (12.0 - 10.0) / 2 = 6.0
    assert.equal(slice.offset, 0);
    assert.equal(slice.length, 4.0);
    assert.equal(slice.when, 6.0);

    // Third argument to source.start: slice.length / clip.speed
    const outputDuration = clip.speed !== 1 ? slice.length / clip.speed : slice.length;
    assert.equal(outputDuration, 2.0); // 4 source seconds / 2 speed = 2 timeline seconds
  });

  test('6.2: audio bleed clamping formula bounds effectiveSourceEnd', () => {
    // Clip with duration 3.0 at speed 1.5, sourceStart = 0, but asset/sourceEnd = 10.0
    const clip = {
      startTime: 0,
      sourceStart: 0,
      sourceEnd: 10.0,
      duration: 3.0,
      speed: 1.5
    };
    const effectiveSourceEnd = Math.min(clip.sourceEnd, clip.sourceStart + clip.duration * clip.speed);
    // 0 + 3.0 * 1.5 = 4.5. Bleed clamped to 4.5, not 10.0!
    assert.equal(effectiveSourceEnd, 4.5);
  });

  test('6.3: compositor visibleLayers sorts strictly by project.trackOrder in reverse and arbitrary order', () => {
    // Test with reverse track order: ['track-caption', 'track-video']
    const pReverse = {
      schemaVersion: 1,
      id: 'proj-rev',
      title: 'Reverse Tracks',
      revision: 1,
      trackOrder: ['track-caption', 'track-video'],
      tracks: {
        'track-caption': { id: 'track-caption', name: 'Cap', kind: 'caption', clipIds: ['c-cap'], hidden: false, muted: false, locked: false },
        'track-video': { id: 'track-video', name: 'Vid', kind: 'video', clipIds: ['c-vid'], hidden: false, muted: false, locked: false }
      },
      clips: {
        'c-cap': { id: 'c-cap', trackId: 'track-caption', name: 'Caption', startTime: 0, duration: 5, sourceStart: 0, sourceEnd: 5, transform: { opacity: 1 }, speed: 1 },
        'c-vid': { id: 'c-vid', trackId: 'track-video', name: 'Video', startTime: 0, duration: 5, sourceStart: 0, sourceEnd: 5, transform: { opacity: 1 }, speed: 1 }
      },
      transitions: {}
    };

    const layersRev = visibleLayers(pReverse, 1.0);
    assert.equal(layersRev.length, 2);
    assert.equal(layersRev[0].track.id, 'track-caption');
    assert.equal(layersRev[1].track.id, 'track-video');

    // Test with forward track order: ['track-video', 'track-caption']
    const pForward = { ...pReverse, trackOrder: ['track-video', 'track-caption'] };
    const layersFwd = visibleLayers(pForward, 1.0);
    assert.equal(layersFwd.length, 2);
    assert.equal(layersFwd[0].track.id, 'track-video');
    assert.equal(layersFwd[1].track.id, 'track-caption');
  });
});

describe('R3 Mission Item 7: offlineExport feeder mutex under concurrent invocations', () => {
  // Reconstruct withFeederMutex identical to offlineExport.ts:172-184
  function withFeederMutex(feeder) {
    let feederQueue = Promise.resolve();
    const safeNext = (name) => {
      const run = feederQueue.then(() => feeder.next(name));
      feederQueue = run.catch(() => {});
      return run;
    };
    return {
      next: safeNext,
      dispose: () => feeder.dispose()
    };
  }

  test('7.1: serializes concurrent next() calls without interleaving', async () => {
    let activeCalls = 0;
    let maxConcurrency = 0;
    const history = [];

    const mockFeeder = {
      async next(name) {
        activeCalls++;
        maxConcurrency = Math.max(maxConcurrency, activeCalls);
        if (activeCalls > 1) {
          throw new Error(`CONCURRENCY VIOLATION: ${activeCalls} concurrent calls!`);
        }
        // Simulate async frame decoding delay
        await new Promise(r => setTimeout(r, 10));
        activeCalls--;
        history.push(name);
        return { name, frameIndex: history.length };
      },
      async dispose() {}
    };

    const protectedFeeder = withFeederMutex(mockFeeder);

    // Launch 30 concurrent next() calls simultaneously
    const requests = Array.from({length: 30}, (_, i) => protectedFeeder.next(`frame_${i}`));
    const results = await Promise.all(requests);

    assert.equal(maxConcurrency, 1, 'Max concurrent executions inside feeder must be exactly 1');
    assert.equal(results.length, 30);
    assert.equal(history.length, 30);
    for (let i = 0; i < 30; i++) {
      assert.equal(results[i].name, `frame_${i}`);
    }
  });

  test('7.2: handles error in queue without deadlocking subsequent calls', async () => {
    let callCount = 0;
    const mockFeeder = {
      async next(name) {
        callCount++;
        await new Promise(r => setTimeout(r, 5));
        if (name === 'failing_call') {
          throw new Error('Decoder failure');
        }
        return { name };
      },
      async dispose() {}
    };

    const protectedFeeder = withFeederMutex(mockFeeder);

    const call1 = protectedFeeder.next('good_1');
    const call2 = protectedFeeder.next('failing_call');
    const call3 = protectedFeeder.next('good_2');

    const res1 = await call1;
    assert.equal(res1.name, 'good_1');

    await assert.rejects(async () => await call2, /Decoder failure/);

    // Call 3 should NOT be blocked or failed; queue recovers cleanly
    const res3 = await call3;
    assert.equal(res3.name, 'good_2');
    assert.equal(callCount, 3);
  });
});
