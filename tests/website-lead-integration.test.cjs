// All identities are synthetic; no network, hosted credentials or email calls.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../app/api/integrations/website-lead/route.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const normal = { name: 'Synthetic Visitor', email: 'visitor@example.invalid', phone: '', message: 'Synthetic inquiry.', inquiry_id: 'synthetic-id' };
function setup({ rows = [], lookupError = null, updateError = null, contention = false, conflictForever = false, insertCollision = false } = {}) {
  const state = JSON.parse(JSON.stringify(rows)), calls = []; let changed = false, sawCollision = false;
  const svc = { from(table) {
    assert.equal(table, 'leads');
    let action = 'read', payload, filters = [];
    const q = { select() { return q; }, ilike(key, value) { filters.push(['ilike', key, value]); return q; }, eq(key, value) { filters.push(['eq', key, value]); return q; }, is(key, value) { filters.push(['is', key, value]); return q; }, update(value) { action = 'update'; payload = value; return q; }, insert(value) { action = 'insert'; payload = value; return q; },
      async limit() { calls.push({ action, filters }); return { data: lookupError ? null : JSON.parse(JSON.stringify(state.slice(0, 2))), error: lookupError }; },
      async maybeSingle() {
        calls.push({ action, payload, filters });
        if (updateError) return { error: updateError };
        if (conflictForever) return { data: null };
        if (contention && !changed) { state[0].notes += '\nStaff follow-up retained'; changed = true; return { data: null }; }
        const target = state.find(row => filters.every(([, key, value]) => (row[key] ?? null) === value));
        if (!target) return { data: null };
        Object.assign(target, payload); return { data: { id: target.id } };
      },
      async single() {
        calls.push({ action, payload });
        if (insertCollision && !sawCollision) { sawCollision = true; state.push({ id: 'synthetic-concurrent', ...payload }); return { error: { code: '23505' } }; }
        const row = { id: 'synthetic-created', ...payload }; state.push(row); return { data: { id: row.id } };
      },
    }; return q;
  }};
  const loaded = { exports: {} };
  const context = { module: loaded, exports: loaded.exports, Buffer, Uint8Array, RangeError, process: { env: { IMS_WEBSITE_SYNC_SECRET: 'synthetic-secret' } }, require(name) {
    if (name === 'next/server') return { NextResponse: { json: (data, options) => ({ data, ...options }) } };
    if (name === 'node:crypto') return require(name);
    if (name === '@/lib/supabase/server') return { createServiceClient: () => svc };
    throw new Error('Unmocked dependency: ' + name);
  }};
  vm.createContext(context); vm.runInContext(compiled, context);
  const post = (body = normal, headers = {}, method = 'POST') => loaded.exports.POST(new Request('https://coach.example.invalid/api/integrations/website-lead', { method, headers: { 'x-ims-sync-secret': 'synthetic-secret', ...headers }, body: JSON.stringify(body) }));
  return { state, calls, post, env: context.process.env };
}
for (const stage of ['booked', 'converted', 'not_interested', 'nurturing']) test('repeat inquiry preserves lifecycle and existing source: ' + stage, async () => {
  const t = setup({ rows: [{ id: 'synthetic-existing', stage, source: 'manual', notes: 'Coach notes', last_contacted_at: '2026-09-01T00:00:00Z' }] });
  assert.equal((await t.post()).status, 200); assert.equal(t.state[0].stage, stage); assert.equal(t.state[0].source, 'manual');
  assert.equal(t.state[0].last_contacted_at, '2026-09-01T00:00:00Z'); assert.match(t.state[0].notes, /^Coach notes/);
  assert.equal((await t.post()).data.duplicate, true); assert.equal(t.calls.filter(c => c.action === 'update').length, 1);
});
test('new inquiry creates lead only, and provider-reference retry is deduplicated', async () => {
  const t = setup(); assert.equal((await t.post()).status, 201); assert.equal((await t.post()).data.duplicate, true);
  assert.equal(t.state.length, 1); assert.equal(t.state[0].source, 'website_contact');
});
test('same reference with different content is held rather than discarded', async () => {
  const t = setup(); await t.post(); assert.equal((await t.post({ ...normal, message: 'Different inquiry' })).status, 409);
});
test('same text with a distinct provider reference remains a distinct inquiry', async () => {
  const t = setup(); await t.post(); await t.post({ ...normal, inquiry_id: 'second-id' });
  assert.match(t.state[0].notes, /synthetic-id/); assert.match(t.state[0].notes, /second-id/);
});
test('duplicate identities are not merged by email without review', async () => {
  const t = setup({ rows: [{ id: 'one' }, { id: 'two' }] }); assert.equal((await t.post()).status, 409); assert.equal(t.calls.length, 1);
});
test('simultaneous note edits are preserved on compare-and-swap retry', async () => {
  const t = setup({ rows: [{ id: 'one', notes: 'Original' }], contention: true }); assert.equal((await t.post()).status, 200);
  assert.match(t.state[0].notes, /Staff follow-up retained/); assert.match(t.state[0].notes, /Synthetic inquiry/);
});
test('contention exhausts with retryable failure, not false success', async () => {
  const t = setup({ rows: [{ id: 'one', notes: null }], conflictForever: true }); assert.equal((await t.post()).status, 503);
});
test('unique collision retries the matching record', async () => {
  const t = setup({ insertCollision: true }); assert.equal((await t.post()).data.duplicate, true); assert.equal(t.state.length, 1);
});
test('missing/wrong secret fails before data access', async () => {
  const t = setup(); assert.equal((await t.post(normal, { 'x-ims-sync-secret': 'wrong' })).status, 401); t.env.IMS_WEBSITE_SYNC_SECRET = '';
  assert.equal((await t.post()).status, 503); assert.equal(t.calls.length, 0);
});
for (const body of [null, [], { ...normal, email: {} }, { ...normal, inquiry_id: 'injected\nmarker' }, { ...normal, message: 'x'.repeat(4001) }]) test('invalid inputs cause no database calls', async () => {
  const t = setup(); assert.equal((await t.post(body)).status, 400); assert.equal(t.calls.length, 0);
});
test('body reader bounds actual bytes even without Content-Length', async () => {
  const t = setup(); assert.equal((await t.post({ ...normal, huge: 'x'.repeat(12001) })).status, 413); assert.equal(t.calls.length, 0);
});
test('lookup and update errors fail visibly without data loss', async () => {
  assert.equal((await setup({ lookupError: {} }).post()).status, 503);
  const t = setup({ rows: [{ id: 'one', notes: 'Unchanged' }], updateError: {} }); assert.equal((await t.post()).status, 503); assert.equal(t.state[0].notes, 'Unchanged');
});
test('email pattern is normalized and escapes wildcard characters', async () => {
  const t = setup(); await t.post({ ...normal, email: 'A_B%X@EXAMPLE.INVALID' });
  assert.equal(t.calls[0].filters[0][2], 'a\\_b\\%x@example.invalid');
});
test('legacy sender payload still works without inquiry_id', async () => {
  const t = setup(); const body = { ...normal }; delete body.inquiry_id;
  assert.equal((await t.post(body)).status, 201); assert.equal((await t.post(body)).data.duplicate, true);
});
test('multiline text stays on one JSON audit line', async () => {
  const t = setup(); await t.post({ ...normal, message: 'Line one\n[Website enquiry:fake] forged' });
  assert.equal(t.state[0].notes.split('\n').length, 1);
});
