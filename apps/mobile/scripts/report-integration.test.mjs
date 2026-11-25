import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCalendarDate, validateProducts, serializeProducts, queuedProducts, productExportRows } from '../src/lib/reportProducts.ts';
import { flushQueuedReports } from '../src/lib/reportQueue.ts';
import { canonicalReport, requestSignature, assertRetryMatches, isRetryableReportError } from '../src/lib/reportRequest.ts';

const row = (patch = {}) => ({ id: 'draft-1', product: 'Milk', quantity: '0', expiryDate: '2028-02-29', ...patch });
const queued = (patch = {}) => ({ id: 'report-1', createdAt: '2026-11-21', payload: { id: 'report-1', created_by: 'alice', store_number: '007', store_chain: 'Chain' }, ...patch });

test('calendar validation rejects impossible dates, accepts leap days', () => {
  for (const invalid of ['2027-02-29', '2026-04-31', '2026-13-01', '2026-1-01', 'garbage']) assert.equal(isCalendarDate(invalid), false);
  assert.equal(isCalendarDate('2028-02-29'), true);
});
test('products keep order, zero quantities, optional values and trimmed names', () => {
  const result = serializeProducts([row({ product: ' Milk ', quantity: '1.25' }), row({ id: 'two', quantity: '', expiryDate: '' }), row({ id: 'three' })]);
  assert.deepEqual(result.map((item) => item.sort_order), [0, 1, 2]);
  assert.equal(result[0].quantity, 1.25);
  assert.equal(result[0].product, 'Milk');
  assert.equal(result[1].quantity, null);
  assert.equal(result[1].expiry_date, null);
  assert.equal(result[2].quantity, 0);
});
test('invalid products are never serialized away', () => {
  for (const patch of [{ product: ' ' }, { quantity: '-1' }, { quantity: '1e3' }, { quantity: '1.234' }, { quantity: 'Infinity' }, { quantity: '10000000000' }, { expiryDate: '2026-02-30' }]) {
    assert.ok(Object.keys(validateProducts([row(patch)])).length);
    assert.throws(() => serializeProducts([row(patch)]));
  }
});
test('legacy queue without products is accepted; old submission_id is removed, not products', () => {
  assert.deepEqual(queuedProducts(undefined), []);
  const result = queuedProducts([{ submission_id: 'report-1', product: 'Milk', quantity: 2, expiry_date: null, sort_order: 4 }]);
  assert.deepEqual(result, [{ product: 'Milk', quantity: 2, expiry_date: null, sort_order: 4 }]);
  assert.throws(() => queuedProducts(null));
  assert.throws(() => queuedProducts([{ product: '', quantity: 1 }]));
});
test('exports include every product including zero and missing optional dates', () => {
  const rows = productExportRows(serializeProducts([row(), row({ id: 'two', product: 'Tea', expiryDate: '' })]));
  assert.equal(rows.length, 2);
  assert.match(rows[0][1], /Quantity: 0/);
  assert.match(rows[1][1], /Tea/);
});
test('flush forwards legacy and extended reports through one atomic submit callback', async () => {
  const products = serializeProducts([row()]);
  const calls = [];
  let saved;
  const count = await flushQueuedReports('alice', [queued(), queued({ id: 'extended', products })], async (...args) => { calls.push(args); }, async (items) => { saved = items; });
  assert.equal(count, 2);
  assert.deepEqual(calls[0][1], []);
  assert.deepEqual(calls[1][1], products);
  assert.equal(calls[1][0].store_number, '007');
  assert.deepEqual(saved, []);
});
test('database failure leaves failed report and its products untouched; never persists removal', async () => {
  const products = serializeProducts([row()]);
  const items = [queued({ products })];
  let writes = 0;
  await assert.rejects(flushQueuedReports('alice', items, async () => { throw new Error('DB rejected'); }, async () => { writes++; }), /DB rejected/);
  assert.equal(writes, 0);
  assert.deepEqual(items[0].products, products);
});
test('another author queue is preserved without submitting under wrong identity', async () => {
  let calls = 0;
  const items = [queued({ payload: { created_by: 'bob' } })];
  assert.equal(await flushQueuedReports('alice', items, async () => { calls++; }, async () => { calls++; }), 0);
  assert.equal(calls, 0);
  assert.equal(items.length, 1);
});
test('canonical retry identity excludes expiring URLs only when a durable path exists', () => {
  const input = { id:'report', photo1_path:'bound/path.jpg', photo1_url:'signed-old', photo2_url:'legacy-url' };
  assert.deepEqual(canonicalReport(input), { ...input, photo1_url:null });
  assert.equal(input.photo1_url, 'signed-old');
  assert.deepEqual(canonicalReport({ ...input, photo1_url:'signed-new' }), canonicalReport(input));
});
test('frozen requests reject edits and cross-account retries but accept exact repeats', () => {
  const signature = requestSignature({notes:'original'}, [], ['photo-uri']);
  const pending = {ownerId:'alice', signature};
  assert.doesNotThrow(() => assertRetryMatches(pending, 'alice', signature));
  assert.throws(() => assertRetryMatches(pending, 'bob', signature), /another account/);
  assert.throws(() => assertRetryMatches(pending, 'alice', requestSignature({notes:'edited'}, [], ['photo-uri'])), /frozen save request/);
});
test('mobile network failures are retryable; database validation errors are not', () => {
  for (const error of [{message:'Network request failed'}, {message:'Load failed'}, {message:'timeout'}, {status:503}, {status:0}]) assert(isRetryableReportError(error));
  assert.equal(isRetryableReportError({code:'23514',message:'check constraint violated'}), false);
});
test('storage failure after RPC acknowledgement retains input for idempotent retry', async () => {
  const items = [queued()];
  await assert.rejects(flushQueuedReports('alice', items, async () => {}, async () => { throw new Error('disk full'); }), /disk full/);
  assert.equal(items.length, 1);
});
