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

function loader(mocks = {}) {
  const cache = new Map();
  const context = vm.createContext({
    console,
    URL,
    URLSearchParams,
    Headers,
    Request,
    Response,
    Buffer,
    Error,
    structuredClone,
    TextEncoder,
    AbortSignal,
    AbortController,
    Uint8Array,
    Float32Array,
    crypto: globalThis.crypto,
    setTimeout,
    clearTimeout,
    fetch: globalThis.fetch,
    document: { fonts: { ready: Promise.resolve() }, createElement: () => ({}) },
    navigator: {},
    process: { env: { ...process.env } }
  });

  const baseMocks = {
    'app/lib/supabase.ts': {
      supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) } }
    },
    ...mocks
  };

  function load(filePath) {
    const rel = path.relative(root, filePath).replace(/\\/g, '/');
    if (baseMocks[rel]) return baseMocks[rel];
    if (cache.has(rel)) return cache.get(rel);

    const code = fs.readFileSync(filePath, 'utf8');
    const transpiled = ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true
      }
    }).outputText;

    const moduleObj = { exports: {} };
    cache.set(rel, moduleObj.exports);

    const fn = vm.runInContext(
      `(function(require, module, exports, __dirname, __filename) { ${transpiled}\n})`,
      context
    );

    function customRequire(id) {
      if (id.startsWith('@/')) {
        const target = path.join(root, id.replace(/^@\//, ''));
        return resolveFile(target);
      }
      if (id.startsWith('.')) {
        const target = path.resolve(path.dirname(filePath), id);
        return resolveFile(target);
      }
      return require(id);
    }

    function resolveFile(target) {
      const candidates = [
        target,
        target + '.ts',
        target + '.tsx',
        target + '.js',
        path.join(target, 'index.ts'),
        path.join(target, 'index.js')
      ];
      for (const c of candidates) {
        if (fs.existsSync(c) && !fs.statSync(c).isDirectory()) {
          return load(c);
        }
      }
      throw new Error(`Cannot resolve ${target} from ${filePath}`);
    }

    fn(customRequire, moduleObj, moduleObj.exports, path.dirname(filePath), filePath);
    cache.set(rel, moduleObj.exports);
    return moduleObj.exports;
  }

  return { load };
}

// Helper: build synthetic PCM sine tone or silence
function createSyntheticPcm(sampleRate, segments) {
  const totalDuration = segments.reduce((acc, s) => acc + s.duration, 0);
  const totalSamples = Math.round(totalDuration * sampleRate);
  const buffer = new Float32Array(totalSamples);

  let currentSample = 0;
  for (const seg of segments) {
    const numSamples = Math.round(seg.duration * sampleRate);
    const amp = seg.type === 'tone' ? (seg.amplitude ?? 0.5) : 0;
    const freq = 440; // 440 Hz

    for (let i = 0; i < numSamples; i++) {
      if (currentSample + i < totalSamples) {
        if (seg.type === 'tone') {
          buffer[currentSample + i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
        } else {
          buffer[currentSample + i] = 0;
        }
      }
    }
    currentSample += numSamples;
  }
  return buffer;
}

describe('Kreovar Silence Trimming, Acoustic Detection & Ripple Removal Engine', () => {
  const { load } = loader();
  const silenceDetector = load(path.join(root, 'app/lib/editor/audioSilenceDetector.ts'));
  const rippleCutModule = load(path.join(root, 'app/lib/editor/rippleCut.ts'));
  const aiValidation = load(path.join(root, 'app/lib/editor/aiValidation.ts'));
  const editingIntent = load(path.join(root, 'app/lib/editor/editingIntent.ts'));
  const reconciler = load(path.join(root, 'app/lib/editor/inPlaceReconciler.ts'));
  const model = load(path.join(root, 'app/lib/editor/model.ts'));

  test('1. Mode A: Acoustic PCM/RMS Waveform Analysis & Breath Padding', () => {
    const sampleRate = 16000;
    // Timeline:
    // 0.0s - 1.0s: Spoken tone (~ -9 dBFS)
    // 1.0s - 1.6s: Silence (0.6s gap, > minSilenceDuration 0.40s)
    // 1.6s - 2.8s: Spoken tone
    // 2.8s - 3.8s: Silence (1.0s gap)
    // 3.8s - 4.8s: Spoken tone
    const pcm = createSyntheticPcm(sampleRate, [
      { duration: 1.0, type: 'tone', amplitude: 0.5 },
      { duration: 0.6, type: 'silence' },
      { duration: 1.2, type: 'tone', amplitude: 0.5 },
      { duration: 1.0, type: 'silence' },
      { duration: 1.0, type: 'tone', amplitude: 0.5 },
    ]);

    // Test RMS dBFS calculation
    const toneSlice = pcm.subarray(0, 16000);
    const silenceSlice = pcm.subarray(16000, 25600);
    const toneDb = silenceDetector.computeRmsDbfs(toneSlice);
    const silenceDb = silenceDetector.computeRmsDbfs(silenceSlice);

    assert.ok(toneDb > -15, `Tone dBFS should be loud (~ -9 dBFS), got ${toneDb}`);
    assert.equal(silenceDb, -100, `Silence dBFS should be -100, got ${silenceDb}`);

    // Test detectSilencesAcoustic
    // default: paddingBefore = 0.060s, paddingAfter = 0.080s
    const cuts = silenceDetector.detectSilencesAcoustic(pcm, sampleRate, {
      thresholdDb: -38,
      minSilenceDuration: 0.40,
      paddingBefore: 0.060,
      paddingAfter: 0.080,
      minKeptGap: 0.15
    });

    assert.equal(cuts.length, 2, 'Should detect exactly 2 silence intervals');

    // First cut: raw silence [1.0s, 1.6s]
    // With paddingAfter (0.08s) on tail and paddingBefore (0.06s) on attack:
    // cutStart ~= 1.08s, cutEnd ~= 1.54s
    const cut1 = cuts[0];
    assert.ok(Math.abs(cut1.start - 1.08) < 0.05, `Cut 1 start should be ~1.08s, got ${cut1.start}`);
    assert.ok(Math.abs(cut1.end - 1.54) < 0.05, `Cut 1 end should be ~1.54s, got ${cut1.end}`);
    assert.ok(cut1.duration > 0.40, `Cut 1 duration should be > 0.40s, got ${cut1.duration}`);

    // Second cut: raw silence [2.8s, 3.8s]
    // cutStart ~= 2.88s, cutEnd ~= 3.74s
    const cut2 = cuts[1];
    assert.ok(Math.abs(cut2.start - 2.88) < 0.05, `Cut 2 start should be ~2.88s, got ${cut2.start}`);
    assert.ok(Math.abs(cut2.end - 3.74) < 0.05, `Cut 2 end should be ~3.74s, got ${cut2.end}`);

    // Test merging adjacent kept intervals when post-padding gap is < 0.15s
    const shortPcm = createSyntheticPcm(sampleRate, [
      { duration: 1.0, type: 'tone' },
      { duration: 0.20, type: 'silence' },
      { duration: 1.0, type: 'tone' },
    ]);
    const shortCuts = silenceDetector.detectSilencesAcoustic(shortPcm, sampleRate, { minSilenceDuration: 0.15, minKeptGap: 0.15 });
    assert.equal(shortCuts.length, 0, 'Should merge kept intervals if remaining gap after padding is < 0.15s');
  });

  test('2. Mode B: Transcript & Filler-Word Gap Analysis', () => {
    const words = [
      { word: 'Welcome', start: 0.5, end: 1.1 },
      { word: 'to', start: 1.15, end: 1.3 },
      { word: 'Kreovar', start: 1.35, end: 1.9 },
      // 1.1s silence gap (1.9s -> 3.0s)
      { word: 'umm', start: 3.0, end: 3.3 }, // filler token
      // 0.9s silence gap (3.3s -> 4.2s)
      { word: 'Today', start: 4.2, end: 4.7 },
      { word: 'we', start: 4.75, end: 4.9 },
      { word: 'build', start: 4.95, end: 5.4 },
      // 1.6s silence gap (5.4s -> 7.0s)
      { word: 'amazing', start: 7.0, end: 7.6 },
      { word: 'video', start: 7.65, end: 8.0 }
    ];
    const totalDuration = 10.0;

    // Without filler word removal:
    const gapsWithoutFiller = silenceDetector.detectSilencesTranscript(words, totalDuration, {
      minSilenceDuration: 0.40,
      paddingBefore: 0.06,
      paddingAfter: 0.08,
      minKeptGap: 0.15,
      removeFillerWords: false
    });

    assert.equal(gapsWithoutFiller.length, 5, 'Should detect lead-in, 3 word gaps, and lead-out');
    assert.equal(gapsWithoutFiller[0].start, 0);
    assert.equal(gapsWithoutFiller[0].end, 0.44);

    // With filler word removal enabled:
    const gapsWithFiller = silenceDetector.detectSilencesTranscript(words, totalDuration, {
      minSilenceDuration: 0.40,
      paddingBefore: 0.06,
      paddingAfter: 0.08,
      minKeptGap: 0.15,
      removeFillerWords: true
    });

    assert.ok(gapsWithFiller.some(g => g.start <= 1.98 && g.end >= 4.14), 'Should merge across filler word umm');
  });

  test('3. Dual-Mode Silence Detection Entry Point & Summary', () => {
    const words = [
      { word: 'First', start: 0.2, end: 1.0 },
      { word: 'Second', start: 2.5, end: 3.5 }
    ];
    const result = silenceDetector.detectSilences({ words, duration: 5.0 }, { minSilenceDuration: 0.40 });
    assert.ok(result.cutCount >= 2, 'Should detect cuts before or between words');
    assert.ok(result.totalSilenceDuration > 0);
    assert.ok(result.projectedDuration < 5.0);
    assert.ok(result.summary.includes('pause(s) totaling'));
  });

  test('4. Multi-Track Synchronized Ripple Cutting: Video, Audio, Captions, Overlays', () => {
    const p = model.createProject('p-multi', 'Multi-Track Ripple Cut Test');
    p.tracks['track-video'] = { id: 'track-video', kind: 'video', name: 'Main Video', clipIds: ['v1', 'v2'], hidden: false, muted: false, locked: false };
    p.tracks['track-audio'] = { id: 'track-audio', kind: 'audio', name: 'Voice & SFX', clipIds: ['a1'], hidden: false, muted: false, locked: false };
    p.tracks['track-caption'] = { id: 'track-caption', kind: 'caption', name: 'Captions', clipIds: ['c1'], hidden: false, muted: false, locked: false };
    p.tracks['track-overlay'] = { id: 'track-overlay', kind: 'overlay', name: 'B-Roll', clipIds: ['o1'], hidden: false, muted: false, locked: false };

    p.assets['asset-video'] = { id: 'asset-video', name: 'cam.mp4', kind: 'video', mime: 'video/mp4', size: 1000, duration: 20, width: 1080, height: 1920 };
    p.assets['asset-audio'] = { id: 'asset-audio', name: 'mic.wav', kind: 'audio', mime: 'audio/wav', size: 500, duration: 20, width: 0, height: 0 };
    p.assets['asset-broll'] = { id: 'asset-broll', name: 'broll.mp4', kind: 'video', mime: 'video/mp4', size: 500, duration: 10, width: 1080, height: 1920 };

    p.clips['v1'] = {
      id: 'v1', assetId: 'asset-video', trackId: 'track-video', name: 'A-Roll Clip',
      startTime: 0, duration: 10, sourceStart: 0, sourceEnd: 10,
      transform: model.defaultTransform, volume: 1, speed: 1, fadeIn: 0.1, fadeOut: 0.1,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }
    };
    p.clips['v2'] = {
      id: 'v2', assetId: 'asset-video', trackId: 'track-video', name: 'A-Roll Clip 2',
      startTime: 12, duration: 5, sourceStart: 10, sourceEnd: 15,
      transform: model.defaultTransform, volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }
    };
    p.clips['a1'] = {
      id: 'a1', assetId: 'asset-audio', trackId: 'track-audio', name: 'Mic Audio',
      startTime: 0, duration: 15, sourceStart: 0, sourceEnd: 15,
      transform: model.defaultTransform, volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }
    };
    p.clips['c1'] = {
      id: 'c1', contentId: 'cap1', trackId: 'track-caption', name: 'Spoken Line',
      startTime: 0, duration: 6, sourceStart: 0, sourceEnd: 6,
      transform: model.defaultTransform, volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }
    };
    p.captions['cap1'] = {
      id: 'cap1', text: 'Hello wonderful world of editing',
      style: { font: 'Inter', size: 36, weight: 700, align: 'center', color: '#ffffff', background: '#000000', stroke: '#000000', strokeWidth: 0, shadow: 0, letterSpacing: 0, lineHeight: 1.2 },
      words: [
        { word: 'Hello', start: 0.2, end: 1.0 },
        { word: 'wonderful', start: 1.1, end: 2.0 },
        // Silence between 2.0s and 4.0s
        { word: 'world', start: 4.1, end: 4.8 },
        { word: 'of', start: 4.85, end: 5.1 },
        { word: 'editing', start: 5.15, end: 5.8 }
      ],
      studioData: {
        emphasizedWords: [1, 4], // 'wonderful' and 'editing'
        wordStyles: { '1': { color: '#facc15' }, '4': { color: '#38bdf8' } }
      }
    };
    p.clips['o1'] = {
      id: 'o1', assetId: 'asset-broll', trackId: 'track-overlay', name: 'Stock Overlay',
      startTime: 3, duration: 4, sourceStart: 0, sourceEnd: 4,
      transform: model.defaultTransform, volume: 0, speed: 1, fadeIn: 0, fadeOut: 0,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }
    };

    // Perform multi-track ripple cut removing [2.2s, 3.8s] (1.6s cut)
    const cuts = [{ start: 2.2, end: 3.8 }];
    const result = rippleCutModule.rippleCut(p, cuts, { alternateCadence: true, applyMicroFades: true });

    // 1. Downstream video clip v2 should shift left by 1.6s: 12.0s -> 10.4s
    const shiftedV2 = result.clips['v2'];
    assert.ok(shiftedV2, 'v2 must survive');
    assert.equal(Math.round(shiftedV2.startTime * 10) / 10, 10.4, 'v2 must shift left by 1.6s');

    // 2. Video clip v1 should be sliced into 2 segments
    const videoClips = result.tracks['track-video'].clipIds.map(id => result.clips[id]).filter(c => c.assetId === 'asset-video');
    assert.equal(videoClips.length, 3, 'v1 sliced into 2 + v2 = 3 total');

    // 3. Audio clip a1 should be sliced into 2 synchronized segments:
    const audioClips = result.tracks['track-audio'].clipIds.map(id => result.clips[id]);
    assert.equal(audioClips.length, 2, 'Audio clip a1 must be sliced into 2 segments');
    assert.equal(Math.round(audioClips[0].duration * 10) / 10, 2.2);
    assert.equal(Math.round(audioClips[1].startTime * 10) / 10, 2.2);

    // 4. B-roll overlay o1:
    const overlayClips = result.tracks['track-overlay'].clipIds.map(id => result.clips[id]);
    assert.equal(overlayClips.length, 1, 'B-roll overlay must survive');
    assert.equal(Math.round(overlayClips[0].startTime * 10) / 10, 2.2);
    assert.equal(Math.round(overlayClips[0].duration * 10) / 10, 3.2);

    // 5. Word-level caption re-indexing & studioData preservation:
    const capClips = result.tracks['track-caption'].clipIds.map(id => result.clips[id]);
    assert.equal(capClips.length, 2, 'Caption clip must be sliced into 2 segments around silence gap');

    const capSlice1 = result.captions[capClips[0].contentId];
    assert.equal(capSlice1.words.length, 2, 'First caption slice has 2 words (Hello wonderful)');
    assert.equal(capSlice1.text, 'Hello wonderful');
    assert.deepEqual(capSlice1.studioData.emphasizedWords, [1], 'Index 1 (wonderful) emphasized');
    assert.equal(capSlice1.studioData.wordStyles['1'].color, '#facc15');

    const capSlice2 = result.captions[capClips[1].contentId];
    assert.equal(capSlice2.words.length, 3, 'Second caption slice has 3 words (world of editing)');
    assert.equal(capSlice2.text, 'world of editing');
    assert.deepEqual(capSlice2.studioData.emphasizedWords, [2], 'Re-indexed emphasized word to 2');
    assert.equal(capSlice2.studioData.wordStyles['2'].color, '#38bdf8');
  });

  test('5. Audio Micro-Fades & Punch-In Jump Cut Pacing', () => {
    const p = model.createProject('p-fades', 'Micro-Fades & Pacing Test');
    p.tracks['track-video'] = { id: 'track-video', kind: 'video', name: 'Main Video', clipIds: ['v1'], hidden: false, muted: false, locked: false };
    p.assets['asset-video'] = { id: 'asset-video', name: 'cam.mp4', kind: 'video', mime: 'video/mp4', size: 1000, duration: 20, width: 1080, height: 1920 };
    p.clips['v1'] = {
      id: 'v1', assetId: 'asset-video', trackId: 'track-video', name: 'A-Roll',
      startTime: 0, duration: 10, sourceStart: 0, sourceEnd: 10,
      transform: model.defaultTransform, volume: 1, speed: 1, fadeIn: 0.15, fadeOut: 0.25,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }
    };

    const cut = rippleCutModule.rippleCut(p, [{ start: 3.0, end: 5.0 }], {
      alternateCadence: true,
      applyMicroFades: true,
      microFadeDuration: 0.020,
      punchInScale: 1.16,
      punchInAnchorY: 0.36
    });

    const slices = cut.tracks['track-video'].clipIds.map(id => cut.clips[id]);
    assert.equal(slices.length, 2, 'Should slice into 2 segments');

    const slice1 = slices[0];
    const slice2 = slices[1];

    // Slice 1: starts at clip beginning -> preserves original fadeIn (0.15s)
    assert.equal(slice1.fadeIn, 0.15, 'Slice 1 should keep original fadeIn');
    // Slice 1 ends at internal cut boundary -> receives 20ms linear micro-fade
    assert.equal(slice1.fadeOut, 0.020, 'Slice 1 cut boundary should receive 20ms micro-fade');

    // Slice 2 starts at internal cut boundary -> receives 20ms linear micro-fade
    assert.equal(slice2.fadeIn, 0.020, 'Slice 2 cut boundary should receive 20ms micro-fade');
    // Slice 2 ends at original clip end -> preserves original fadeOut (0.25s)
    assert.equal(slice2.fadeOut, 0.25, 'Slice 2 should keep original fadeOut');

    // Punch-in jump cut cadence check:
    assert.equal(slice1.zooms, undefined, 'Slice 1 should not have cadence zoom');
    assert.ok(slice2.zooms && slice2.zooms.length === 1, 'Slice 2 should have cadence zoom');
    assert.equal(slice2.zooms[0].fromScale, 1.16);
    assert.equal(slice2.zooms[0].toScale, 1.16);
    assert.equal(slice2.zooms[0].focusY, -0.14);
    assert.equal(slice2.zooms[0].style, 'punch-in');
  });

  test('6. 300 Range Limit: MAX_RIPPLE_CUT_RANGES', () => {
    assert.equal(rippleCutModule.MAX_RIPPLE_CUT_RANGES, 300);

    const p = model.createProject('p-150', '150 Cuts Test');
    p.tracks['track-video'] = { id: 'track-video', kind: 'video', name: 'Video', clipIds: ['v1'], hidden: false, muted: false, locked: false };
    p.assets['asset-video'] = { id: 'asset-video', name: 'cam.mp4', kind: 'video', mime: 'video/mp4', size: 1000, duration: 60, width: 1080, height: 1920 };
    p.clips['v1'] = {
      id: 'v1', assetId: 'asset-video', trackId: 'track-video', name: 'A-Roll',
      startTime: 0, duration: 60, sourceStart: 0, sourceEnd: 60,
      transform: model.defaultTransform, volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }
    };

    // Generate 100 valid cut ranges within 60s
    const cuts100 = [];
    for (let i = 0; i < 100; i++) {
      cuts100.push({ start: i * 0.55 + 0.1, end: i * 0.55 + 0.25 });
    }

    const norm100 = rippleCutModule.normalizedCuts(p, cuts100);
    assert.equal(norm100.length, 100);

    // Generate 150 valid cut ranges within 60s
    const cuts150 = [];
    for (let i = 0; i < 150; i++) {
      cuts150.push({ start: i * 0.38 + 0.05, end: i * 0.38 + 0.15 });
    }
    const norm150 = rippleCutModule.normalizedCuts(p, cuts150);
    assert.equal(norm150.length, 150);

    // Validate that aiValidation accepts 150 cut ranges
    const planValidation = aiValidation.validateAiPlan({
      summary: 'Applied 150 ripple cuts',
      decisions: [{ op: 'rippleCut', ranges: cuts150 }]
    }, p);
    assert.equal(planValidation.list.decisions[0].ranges.length, 150);

    // 5-minute (300s) project with 300 cut ranges
    let p5 = model.createProject('test-300s');
    p5.assets['asset-5m'] = { id: 'asset-5m', name: 'cam5m.mp4', kind: 'video', mime: 'video/mp4', size: 1000, duration: 300, width: 1080, height: 1920 };
    p5.tracks['track-video'].clipIds.push('v5m');
    p5.clips['v5m'] = {
      id: 'v5m', assetId: 'asset-5m', trackId: 'track-video', name: 'A-Roll 5m',
      startTime: 0, duration: 300, sourceStart: 0, sourceEnd: 300,
      transform: model.defaultTransform, volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }
    };
    const cuts300 = Array.from({ length: 300 }, (_, i) => ({ start: i * 0.9 + 0.1, end: i * 0.9 + 0.3 }));
    const plan300 = aiValidation.validateAiPlan({
      summary: 'Applied 300 ripple cuts on 5m video',
      decisions: [{ op: 'rippleCut', ranges: cuts300 }]
    }, p5);
    assert.equal(plan300.list.decisions[0].ranges.length, 300);

    // Should throw when exceeding 300 ranges
    const cuts301 = [...cuts300, { start: 298.0, end: 298.1 }];
    assert.throws(
      () => rippleCutModule.normalizedCuts(p5, cuts301),
      /Choose between 1 and 300 cut ranges/
    );
  });

  test('7. Multilingual Intent Recognition for Silence Trimming (English, Hindi, Hinglish)', () => {
    const testPhrases = [
      'Remove silences',
      'Cut dead air',
      'Trim pauses',
      'Beech ke pauses hata do',
      'Silence cut kar do',
      'Jahan main chup hoon woh part trim karo',
      'Dead space remove karo',
      'Chup rehne wale parts hata do',
      'Pauses ko cut kar dena',
      'Khali jagah hata do aur pacing tighten karo'
    ];

    for (const phrase of testPhrases) {
      const constraints = editingIntent.extractEditingConstraints(phrase);
      assert.equal(
        constraints.requestedSilenceCut,
        true,
        `Phrase "${phrase}" must be recognized as silence trimming intent`
      );
    }
  });

  test('8. Non-Blocking Degradation Notice when no silences >0.4s exist', () => {
    const p = model.createProject('p-nosilence', 'No Silence Test');
    p.tracks['track-video'] = { id: 'track-video', kind: 'video', name: 'Video', clipIds: ['v1'], hidden: false, muted: false, locked: false };
    p.assets['asset-video'] = { id: 'asset-video', name: 'cam.mp4', kind: 'video', mime: 'video/mp4', size: 1000, duration: 5, width: 1080, height: 1920 };
    p.clips['v1'] = {
      id: 'v1', assetId: 'asset-video', trackId: 'track-video', name: 'A-Roll',
      startTime: 0, duration: 5, sourceStart: 0, sourceEnd: 5,
      transform: model.defaultTransform, volume: 1, speed: 1, fadeIn: 0, fadeOut: 0,
      effects: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }
    };

    // Continuous speech with only 0.1s gaps (no gap > 0.40s)
    const speech = [
      { start: 0.1, end: 1.0, words: [{ word: 'One', start: 0.1, end: 0.5 }, { word: 'Two', start: 0.6, end: 1.0 }] },
      { start: 1.1, end: 2.0, words: [{ word: 'Three', start: 1.1, end: 1.5 }, { word: 'Four', start: 1.6, end: 2.0 }] }
    ];

    const constraints = editingIntent.extractEditingConstraints('Remove silences and dead air');
    const result = reconciler.reconcileEditingDecisions(p, [], [], constraints, speech);

    // Should NOT emit rippleCut since no qualifying gaps > 0.40s exist
    const cutOp = result.decisions.find(d => d.op === 'rippleCut');
    assert.equal(cutOp, undefined, 'Must not emit rippleCut when no qualifying silence exists');

    // Must log non-blocking notice in summaryNotes
    const notice = result.summaryNotes.find(n => n.includes('No silent gaps > 0.4s detected'));
    assert.ok(notice, 'Must include non-blocking degradation notice in summary notes');
    assert.equal(notice, 'No silent gaps > 0.4s detected; kept original clip timing intact.');
  });
});
