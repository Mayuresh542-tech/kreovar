import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(root + '/package.json');
const ts = require('typescript');

function loadModule(file, mocks = {}) {
  mocks = {
    "app/lib/supabase.ts": { supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } },
    ...mocks
  };
  const fullPath = path.join(root, file);
  const code = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText.replaceAll("import.meta.url", JSON.stringify(path.join(root, file)));

  const cache = new Map();
  const context = vm.createContext({
    URL, URLSearchParams, Error, Date, Number, JSON, process, AbortSignal, console, Buffer, FormData, File, Response,
    Math, Array, Object, Map, Set, Promise, Float32Array, Uint8Array,
    document: { fonts: { ready: Promise.resolve() } },
    ...mocks
  });

  function resolveReq(s) {
    if (mocks[s]) return mocks[s];
    if (s === '@/app/lib/supabase' || s === '../supabase' || s === '../../supabase') return mocks["app/lib/supabase.ts"];
    if (s.startsWith('@/')) {
      const target = s.slice(2);
      const targetTs = target.endsWith('.ts') ? target : target + '.ts';
      if (fs.existsSync(path.join(root, targetTs))) return loadModule(targetTs, mocks);
    }
    if (s.startsWith('.')) {
      const target = path.relative(root, path.resolve(path.dirname(fullPath), s)).replaceAll('\\', '/');
      const targetTs = target.endsWith('.ts') ? target : target + '.ts';
      if (fs.existsSync(path.join(root, targetTs))) return loadModule(targetTs, mocks);
    }
    return require(s);
  }

  const moduleObj = { exports: {} };
  new vm.Script('(function(require,module,exports){' + transpiled + '\n})').runInContext(context)(
    resolveReq,
    moduleObj,
    moduleObj.exports
  );
  return moduleObj.exports;
}

test('limits: exports MAX_VIDEO_SECONDS (300) and EXTENDED_MAX_VIDEO_SECONDS (300)', () => {
  const limits = loadModule('app/lib/editor/limits.ts');
  assert.equal(limits.MAX_VIDEO_SECONDS, 300);
  assert.equal(limits.EXTENDED_MAX_VIDEO_SECONDS, 300);
});

test('limits: assertVideoDuration defaults to 300s (5 minutes) and accepts custom ceiling', () => {
  const { assertVideoDuration, EXTENDED_MAX_VIDEO_SECONDS } = loadModule('app/lib/editor/limits.ts');
  // Default 300s (5 minutes)
  assert.doesNotThrow(() => assertVideoDuration(240));
  assert.doesNotThrow(() => assertVideoDuration(300));
  assert.throws(() => assertVideoDuration(300.1), /300 seconds/);

  // Extended 300s
  assert.doesNotThrow(() => assertVideoDuration(120, EXTENDED_MAX_VIDEO_SECONDS));
  assert.doesNotThrow(() => assertVideoDuration(300, EXTENDED_MAX_VIDEO_SECONDS));
  assert.throws(() => assertVideoDuration(300.1, EXTENDED_MAX_VIDEO_SECONDS), /300 seconds/);

  // Rejects invalid numbers regardless of ceiling
  for (const invalid of [0, -5, NaN, Infinity, -Infinity]) {
    assert.throws(() => assertVideoDuration(invalid, EXTENDED_MAX_VIDEO_SECONDS));
  }
});

test('offlineExport: frameSchedule defaults to 300s (5 minutes) and accepts extended max', () => {
  const { frameSchedule } = loadModule('app/lib/editor/offlineExport.ts', {
    mediabunny: {
      ALL_FORMATS: [],
      Quality: class {},
      canEncodeVideo: async () => true,
      canEncodeAudio: async () => true,
    }
  });
  // Default 300s (5 minutes)
  const schedule240 = frameSchedule(240, 30);
  assert.equal(schedule240.length, 7200);
  const schedule300 = frameSchedule(300, 30);
  assert.equal(schedule300.length, 9000);
  assert.throws(() => frameSchedule(301, 30));

  // Extended up to 300s
  const schedule180 = frameSchedule(180, 30, 300);
  assert.equal(schedule180.length, 5400);
  assert.throws(() => frameSchedule(301, 30, 300));
});

test('offlineExport: source code removes the 250 MB memory ceiling and allows up to 1.5 GB output', () => {
  const code = fs.readFileSync(path.join(root, 'app/lib/editor/offlineExport.ts'), 'utf8');
  assert.equal(code.includes('250*1024*1024') || code.includes('250 * 1024 * 1024'), false, 'Should not contain 250MB limit');
  assert.equal(code.includes('1536*1024*1024') || code.includes('1536 * 1024 * 1024'), true, 'Should allow up to 1.5GB output buffer');
});

test('compositor: provides clearFrames method to discard processed frames during export', () => {
  const { Compositor } = loadModule('app/lib/editor/compositor.ts');
  const comp = new Compositor({ resolve: async () => 'test' });
  assert.equal(typeof comp.clearFrames, 'function');
  comp.setFrame('clip-1', {}, 1920, 1080);
  comp.clearFrames();
  assert.doesNotThrow(() => comp.clearFrames());
});

