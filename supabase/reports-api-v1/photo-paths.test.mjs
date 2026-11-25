import test from 'node:test';
import assert from 'node:assert/strict';
import { isReportPhotoPath, photoReferenceWarnings } from './functions/photo-paths.mjs';
const report = { id:'30000000-0000-4000-8000-000000000001', team_id:'20000000-0000-4000-8000-000000000001' };
const base = `teams/${report.team_id}/submissions/${report.id}/`;
test('canonical old slots and immutable UUID filenames remain supported', () => {
  assert(isReportPhotoPath(base+'photo1.jpg', report, 1));
  assert(isReportPhotoPath(base+'photo2-10000000-0000-4000-8000-000000000001.heic', report, 2));
});
test('foreign report/team, traversal, wrong slot and unexpected formats are never signed', () => {
  for (const path of [base+'../photo1.jpg', base+'photo2.jpg', base+'photo1.svg', base+'photo1.jpg/other', 'teams/foreign/submissions/foreign/photo1.jpg']) {
    assert.equal(isReportPhotoPath(path, report, 1), false);
  }
  assert.equal(isReportPhotoPath(base+'photo1.jpg', { ...report, team_id:'20000000-0000-4000-8000-000000000002' }, 1), false);
});
test('slots 7, 19 and 20 support canonical and immutable names but reject foreign references', () => {
  for (const slot of [7, 19, 20]) {
    assert(isReportPhotoPath(base + `photo${slot}.jpg`, report, slot));
    assert(isReportPhotoPath(base + `photo${slot}-10000000-0000-4000-8000-000000000001.webp`, report, slot));
    assert.equal(isReportPhotoPath(base + `photo${slot}.jpg`, { ...report, id:'30000000-0000-4000-8000-000000000002' }, slot), false);
    assert.equal(isReportPhotoPath(base + `photo${slot}.jpg`, { ...report, team_id:'20000000-0000-4000-8000-000000000002' }, slot), false);
    assert.deepEqual(photoReferenceWarnings({ ...report, [`photo${slot}_path`]:'foreign/private.jpg' }), [{slot, reason:'invalid_report_bound_path'}]);
  }
});
test('slots outside 1..20 and ambiguous numeric filenames are rejected', () => {
  for (const slot of [0, 21, 100]) assert.equal(isReportPhotoPath(base + `photo${slot}.jpg`, report, slot), false);
  for (const name of ['photo01.jpg', 'photo020.jpg', 'photo20.jpg/extra']) assert.equal(isReportPhotoPath(base + name, report, 20), false);
});
test('invalid stored references produce an explicit slot warning without exposing a foreign path', () => {
  assert.deepEqual(photoReferenceWarnings({ ...report, photo1_path:'foreign/secret.jpg', photo2_path:base+'photo2.png' }), [{slot:1,reason:'invalid_report_bound_path'}]);
});
