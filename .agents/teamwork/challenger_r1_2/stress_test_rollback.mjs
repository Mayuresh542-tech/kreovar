import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import path from 'node:path';
import vm from 'node:vm';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');

function createVmLoader() {
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
    crypto: globalThis.crypto,
    setTimeout,
    clearTimeout,
    fetch: globalThis.fetch,
    document: { fonts: { ready: Promise.resolve() }, createElement: () => ({}) },
    navigator: {},
    process: { env: { ...process.env } }
  });

  function load(relative) {
    let file = path.resolve(root, relative);
    if (!path.extname(file)) file += '.ts';
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const raw = fs.readFileSync(file, 'utf8');
    const code = ts.transpileModule(raw, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true
      }
    }).outputText;

    new vm.Script('(function(require,module,exports){\n' + code + '\n})', { filename: file }).runInContext(context)(
      (s) => s.startsWith('@/') ? load(s.slice(2)) : s.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(file), s))) : require(s),
      { exports },
      exports
    );
    return exports;
  }
  return { load };
}

describe('Atomic Multi-Stage Rollback Stress', () => {
  const { load } = createVmLoader();
  const model = load('app/lib/editor/model');
  const ops = load('app/lib/editor/operations');
  const { EditorStore } = load('app/lib/editor/store');

  test('rollbackToRevision atomically restores preTurnRevision across multiple stages in a single step', () => {
    let p = model.createProject('rollback-test');
    p = ops.addAsset(p, { id: 'v1', kind: 'video', name: 'clip.mp4', duration: 20, width: 1080, height: 1920, mime: 'video/mp4', size: 1000 });
    p = ops.addAsset(p, { id: 'a1', kind: 'audio', name: 'sfx.mp3', duration: 5, mime: 'audio/mpeg', size: 500 });
    p = ops.addClip(p, 'v1', 'track-video', 0, { id: 'base-clip', duration: 20, sourceEnd: 20 });
    const store = new EditorStore(p);

    const preRevision = store.getSnapshot().revision;
    assert.equal(preRevision, 0);

    // Stage 1: Add Captions (revision 1)
    store.execute((s) => ops.addCaption(s, 'Caption 1', 0, 3));
    assert.equal(store.getSnapshot().revision, 1);
    assert.equal(Object.keys(store.getSnapshot().captions).length, 1);

    // Stage 2: Add SFX (revision 2)
    store.execute((s) => ops.addClip(s, 'a1', 'track-audio', 2, { id: 'sfx-clip', duration: 1, audioRole: 'sfx' }));
    assert.equal(store.getSnapshot().revision, 2);
    assert.ok(store.getSnapshot().clips['sfx-clip']);

    // Stage 3: Add Text (revision 3)
    store.execute((s) => ops.addText(s, 'Title text', 5));
    assert.equal(store.getSnapshot().revision, 3);
    assert.equal(Object.keys(store.getSnapshot().textLayers).length, 1);

    // Atomic Rollback to preRevision (0)
    const rolledBack = store.rollbackToRevision(preRevision);
    assert.equal(rolledBack, true, 'rollbackToRevision should succeed');

    const rolledProject = store.getSnapshot();
    // Verify clips, captions, text are restored to preRevision state
    assert.equal(Object.keys(rolledProject.captions).length, 0, 'Captions from stage 1 must be gone');
    assert.equal(Boolean(rolledProject.clips['sfx-clip']), false, 'SFX from stage 2 must be gone');
    assert.equal(Object.keys(rolledProject.textLayers).length, 0, 'Text layer from stage 3 must be gone');
    assert.ok(rolledProject.clips['base-clip'], 'Base clip must remain');

    // Verify history past was trimmed to target
    assert.equal(store.past.length, 0, 'Past history before preRevision is empty');
  });

  test('rollbackToRevision returns false if target revision does not exist in past', () => {
    let p = model.createProject('rollback-invalid');
    const store = new EditorStore(p);
    store.execute((s) => ops.addAsset(s, { id: 'a1', kind: 'audio', name: 'v.mp3', duration: 10, mime: 'audio/mpeg', size: 100 }));

    const result = store.rollbackToRevision(999);
    assert.equal(result, false, 'Invalid target revision should return false');
  });
});
