// Exercises the real handler with an in-memory Supabase double; no network or writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const authorA = '10000000-0000-4000-8000-000000000001';
const authorB = '10000000-0000-4000-8000-000000000002';
const teamA = '20000000-0000-4000-8000-000000000001';
const teamB = '20000000-0000-4000-8000-000000000002';
const timestamp = '2026-11-03T12:00:00.123456+00:00';
const makeReport = (n, created_by, team_id) => ({
  id: `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  created_by, team_id, created_at: timestamp, updated_at: timestamp,
  status: 'submitted', tags: [],
});
let credential;
const allReports = [makeReport(1, authorA, teamA), makeReport(2, authorB, teamA), makeReport(3, authorB, teamB)];
let handler;
let expressions = [];
class Query {
  constructor(table) { this.table = table; this.filters = []; this.orders = []; this.cap = Infinity; }
  select(columns) {
    this.columns = columns?.split(',');
    return this;
  }
  eq(column, value) { this.filters.push((row) => row[column] === value); return this; }
  in(column, values) { this.filters.push((row) => values.includes(row[column])); return this; }
  gte(column, value) { this.filters.push((row) => Date.parse(row[column]) >= Date.parse(value)); return this; }
  order(column) { this.orders.push(column); return this; }
  limit(value) { this.cap = value; return this; }
  maybeSingle() { return Promise.resolve({ data: credential, error: null }); }
  update() { this.write = true; return this; }
  or(expression) {
    expressions.push(expression);
    const match = expression.match(/^(created_at|updated_at)\.gt\.([^,]+),and\(\1\.eq\.[^,]+,id\.gt\.([0-9a-f-]+)\)$/);
    assert.ok(match, 'cursor predicate is canonical and contains no injected expression');
    const [, column, timestamp, id] = match;
    this.filters.push((row) => row[column] > timestamp || (row[column] === timestamp && row.id > id));
    return this;
  }
  then(resolve, reject) {
    let data = this.table === 'submissions' ? allReports : [];
    data = data.filter((row) => this.filters.every((filter) => filter(row)));
    data = [...data].sort((a, b) => {
      for (const column of this.orders) {
        if (a[column] < b[column]) return -1;
        if (a[column] > b[column]) return 1;
      }
      return 0;
    }).slice(0, this.cap);
    if (this.columns) data = data.map(row => Object.fromEntries(this.columns.map(column => [column, row[column]])));
    return Promise.resolve({ data, error: null }).then(resolve, reject);
  }
}
globalThis.__mockClient = {
  from: (table) => new Query(table),
  storage: { from: (bucket) => {
    assert.equal(bucket, 'submissions');
    return { createSignedUrls: async (paths) => ({ data: paths.map(path => ({ signedUrl: `https://local.invalid/signed/${path}` })), error: null }) };
  } },
  auth: { admin: { getUserById: async (id) => ({ data: { user: { id, email: `${id}@example.invalid`, user_metadata: { display_name: id === authorA ? 'Author A' : 'Author B' } } }, error: null }) } },
};
globalThis.Deno = { env: { get: () => 'local-only-test' }, serve: (callback) => { handler = callback; } };
let source = readFileSync(new URL('./functions/index.ts', import.meta.url), 'utf8');
source = source.replace("import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';", 'const createClient = () => globalThis.__mockClient;');
source = source.replace("'./pagination.mjs'", JSON.stringify(new URL('./functions/pagination.mjs', import.meta.url).href));
source = source.replace("'./photo-paths.mjs'", JSON.stringify(new URL('./functions/photo-paths.mjs', import.meta.url).href));
await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
const get = async (suffix) => {
  const response = await handler(new Request(`https://local.invalid/?since=2026-01-01T00:00:00Z&${suffix}`, { headers: { 'x-api-key': 'local-test' } }));
  return { status: response.status, body: await response.json() };
};
const key = (scope_user_id, scope_team_ids) => ({ id: authorA, name: 'Local fixture', scope_user_id, scope_team_ids, expires_at: null });

test('author API still returns only author reports, preserving response fields', async () => {
  credential = key(authorA, null);
  const { status, body } = await get('limit=10&team_id=' + teamB);
  assert.equal(status, 200);
  assert.deepEqual(body.reports.map((r) => r.id), [allReports[0].id]);
  for (const field of ['api_version','generated_at','integration','filters','count','has_more','next_since','reports','next_cursor']) assert.ok(field in body);
  assert.equal(body.filters.submitter_id, authorA);
});
test('team API paginates equal timestamps without gaps, uses actual authors, ignores requested scope', async () => {
  credential = key(null, [teamA]);
  const first = await get('limit=1&team_ids=' + teamB);
  assert.equal(first.status, 200);
  assert.equal(first.body.has_more, true);
  assert.equal(first.body.reports[0].submitted_by.display_name, 'Author A');
  const second = await get('limit=1&cursor=' + encodeURIComponent(first.body.next_cursor));
  assert.equal(second.status, 200);
  assert.equal(second.body.reports[0].id, allReports[1].id);
  assert.equal(second.body.reports[0].submitted_by.id, authorB);
  assert.equal(second.body.reports[0].submitted_by.display_name, 'Author B');
  assert.equal(second.body.next_cursor, null);
  assert.equal(second.body.has_more, false);
  assert.equal(expressions.length, 1);
});
test('API selects and signs all twenty slots in order, preserving original six', async () => {
  credential = key(authorA, null);
  const report = allReports[0];
  for (let slot = 1; slot <= 21; slot++) report[`photo${slot}_path`] = `teams/${teamA}/submissions/${report.id}/photo${slot}.jpg`;
  try {
    const { status, body } = await get('limit=10');
    assert.equal(status, 200);
    assert.deepEqual(body.reports[0].photos.map(p => p.slot), Array.from({ length: 20 }, (_, i) => i + 1));
    assert.deepEqual(body.reports[0].photo_reference_warnings, []);
    for (const slot of [7, 19, 20]) report[`photo${slot}_path`] = `teams/${teamB}/submissions/${report.id}/photo${slot}.jpg`;
    const invalid = await get('limit=10');
    assert.deepEqual(invalid.body.reports[0].photos.map(p => p.slot), Array.from({ length: 20 }, (_, i) => i + 1).filter(slot => ![7, 19, 20].includes(slot)));
    assert.deepEqual(invalid.body.reports[0].photo_reference_warnings, [7, 19, 20].map(slot => ({ slot, reason:'invalid_report_bound_path' })));
  } finally {
    for (let slot = 1; slot <= 21; slot++) delete report[`photo${slot}_path`];
  }
});
test('API rejects cursor reuse after whitelist changes', async () => {
  credential = key(null, [teamA]);
  const first = await get('limit=1');
  credential = key(null, [teamB]);
  const next = await get('cursor=' + encodeURIComponent(first.body.next_cursor));
  assert.equal(next.status, 400);
});
test('submitted_since remains inclusive at the exact microsecond boundary', async () => {
  credential = key(null, [teamA]);
  const { status, body } = await get('submitted_since=' + encodeURIComponent(timestamp));
  assert.equal(status, 200);
  assert.equal(body.count, 2);
});
test('legacy NULL submitter does not fail an otherwise authorized team page', async () => {
  credential = key(null, [teamA]);
  const legacy = makeReport(4, null, teamA);
  legacy.photo1_path = 'foreign/private-photo.jpg';
  allReports.push(legacy);
  try {
    const { status, body } = await get('limit=100');
    assert.equal(status, 200);
    const row = body.reports.find(r => r.id === legacy.id);
    assert.deepEqual(row.submitted_by, { id:null, display_name:null, email:null });
    assert.deepEqual(row.photos, []);
    assert.deepEqual(row.photo_reference_warnings, [{slot:1,reason:'invalid_report_bound_path'}]);
  } finally { allReports.pop(); }
});
