import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, mocks = {}) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { exports, require: name => { if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`); return mocks[name]; }, URLSearchParams, AbortSignal, Date });
  return exports;
}
const helper = load('app/lib/server/adminUserUsage.ts');
test('invalid and unsafe pagination values cannot produce NaN offsets', () => {
  for (const value of [null, 'NaN', 'Infinity', '-1', '0', '1.5']) assert.equal(helper.positivePage(value), 1);
  assert.equal(helper.positivePage('2'), 2);
  assert.equal(helper.positivePage('999999999'), 1000000);
});
test('global user search includes accounts beyond the first Auth page', async () => {
  const pages = [];
  const first = Array.from({ length: 1000 }, (_, i) => ({ id: String(i), email: `user${i}@example.test`, created_at: '2026-01-01' }));
  const db = { auth: { admin: { listUsers: async ({ page }) => { pages.push(page); return { data: { users: page === 1 ? first : [{ id: 'later', email: 'later@example.test', created_at: '2026-02-01' }] } }; } } }, rpc: async (name, args) => { assert.equal(args.p_user_id, 'later'); return { data: { used: { exports: 2 } } }; } };
  const result = await helper.readUserUsage(db, 1, 'later@example.test');
  assert.deepEqual(pages, [1, 2]); assert.equal(result.users.length, 1); assert.equal(result.users[0].usage.used.exports, 2);
});
test('empty accounts remain visible and only the requested page loads counters', async () => {
  let calls = 0;
  const db = { auth: { admin: { listUsers: async () => ({ data: { users: Array.from({ length: 30 }, (_, i) => ({ id: String(i).padStart(2, '0'), created_at: '2026-01-01' })) } }) } }, rpc: async () => { calls++; return { data: { used: {}, plan: 'free' } }; } };
  const result = await helper.readUserUsage(db, 2, '');
  assert.equal(result.pagination.total, 30); assert.equal(result.users.length, 5); assert.equal(calls, 5);
});
test('usage failures are unavailable, never fabricated zero consumption', async () => {
  const db = { auth: { admin: { listUsers: async () => ({ data: { users: [{ id: 'user', created_at: '2026-01-01' }] } }) } }, rpc: async () => ({ error: { message: 'private database detail' } }) };
  const result = await helper.readUserUsage(db, 100, '');
  assert.equal(result.pagination.page, 1); assert.equal(result.users[0].usage, null); assert.ok(result.users[0].error); assert.ok(!JSON.stringify(result).includes('private database detail'));
});
test('admin API refuses anonymous and non-admin callers before reading user data', async () => {
  for (const status of [401, 403]) {
    const route = load('app/api/admin/user-usage/route.ts', {
      'next/server': {}, '@/app/lib/server/adminAuth': { requireAdmin: async () => ({ error: { status } }), getAdminClient: () => { throw new Error('Privileged DB must not be reached'); } },
      '@/app/lib/server/adminUserUsage': helper, '@/app/lib/server/safeResponse': { withSafeResponse: handler => handler },
    });
    assert.equal((await route.GET({})).status, status);
  }
});
