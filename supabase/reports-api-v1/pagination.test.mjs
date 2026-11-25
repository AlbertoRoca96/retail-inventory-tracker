import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { credentialScope, parseTimestamp, encodeCursor, decodeCursor, afterCursor } from './functions/pagination.mjs';

const author = '11111111-1111-4111-8111-111111111111';
const team = '22222222-2222-4222-8222-222222222222';
const secondTeam = '33333333-3333-4333-8333-333333333333';
const position = { id: author, timestamp: '2026-11-03T12:00:00.123456+00:00' };
const secret = 'local-test-only-not-a-credential';
const binding = JSON.stringify({ key: author, scope: { author }, submittedSince: '2026-01-01T00:00:00Z', changedSince: null });

test('legacy author credentials are preserved; team whitelist is explicit and stable', () => {
  assert.deepEqual(credentialScope({ scope_user_id: author, scope_team_ids: null }), { author, teams: null });
  assert.deepEqual(credentialScope({ scope_user_id: null, scope_team_ids: [secondTeam, team] }), { author: null, teams: [team, secondTeam] });
});
test('all ambiguous, missing, empty, duplicate or malformed scopes fail closed', () => {
  for (const credential of [
    {}, { scope_user_id: null, scope_team_ids: null },
    { scope_user_id: author, scope_team_ids: [team] },
    { scope_user_id: null, scope_team_ids: [] },
    { scope_user_id: null, scope_team_ids: [team, team] },
    { scope_user_id: null, scope_team_ids: ['x),id.gt.0'] },
  ]) assert.throws(() => credentialScope(credential));
});
test('cursor roundtrip retains exact microseconds and UUID tie breaker', async () => {
  const token = await encodeCursor(position, binding, secret);
  assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const decoded = await decodeCursor(token, binding, secret);
  assert.deepEqual(decoded, position);
  assert.equal(afterCursor('updated_at', decoded), `updated_at.gt.${position.timestamp},and(updated_at.eq.${position.timestamp},id.gt.${author})`);
});
test('cursor is bound to credential/scope/filters and signing key', async () => {
  const token = await encodeCursor(position, binding, secret);
  for (const changed of [binding + 'changed-team', binding + 'changed-since', binding + 'changed-key']) {
    await assert.rejects(decodeCursor(token, changed, secret));
  }
  await assert.rejects(decodeCursor(token, binding, 'wrong-secret'));
});
test('tampered, oversized and malformed opaque cursors are rejected', async () => {
  const token = await encodeCursor(position, binding, secret);
  for (const bad of ['', 'not-a-cursor', token + '.extra', 'x'.repeat(4097), '!' + token.slice(1)]) {
    await assert.rejects(decodeCursor(bad, binding, secret));
  }
});
test('even signed cursor content cannot inject a PostgREST expression', async () => {
  for (const malicious of [
    { ...position, id: `${author}),status.neq.submitted` },
    { ...position, timestamp: '2026-11-03T12:00:00Z),team_id.not.is.null' },
  ]) {
    await assert.rejects(decodeCursor(await encodeCursor(malicious, binding, secret), binding, secret));
    assert.throws(() => afterCursor('created_at', malicious));
  }
  assert.throws(() => afterCursor('id', position));
});
test('timestamp input requires a timezone and preserves inclusive boundary precision', () => {
  assert.equal(parseTimestamp(position.timestamp, 'since'), position.timestamp);
  assert.equal(parseTimestamp(null, 'since'), null);
  for (const value of ['', 'yesterday', '2026-11-03', '2026-11-03T12:00:00', '2026-11-03T99:00:00Z']) {
    assert.throws(() => parseTimestamp(value, 'since'));
  }
});
test('API wiring retains inclusive filters and scopes before pagination', () => {
  const source = readFileSync(new URL('./functions/index.ts', import.meta.url), 'utf8');
  assert.ok(source.includes("query.gte('created_at', submittedSince)"));
  assert.ok(source.includes("query.gte('updated_at', changedSince)"));
  assert.ok(source.includes("query.in('team_id', scope.teams!)"));
  assert.ok(source.includes(".order('id', { ascending: true })"));
  assert.ok(source.includes('submitted_by: submitters.get(report.created_by)'));
});
