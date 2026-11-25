export const PHOTO_SLOT_COUNT = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE = /^photo([1-9]|1[0-9]|20)(?:-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?\.(?:jpg|jpeg|png|heic|heif|webp)$/i;

// Service-role signing must never follow a report's arbitrary foreign object path.
export function isReportPhotoPath(path, report, slot) {
  if (typeof path !== 'string' || !UUID.test(report.id) || !UUID.test(report.team_id)) return false;
  const prefix = `teams/${report.team_id}/submissions/${report.id}/`;
  if (!path.startsWith(prefix)) return false;
  const match = FILE.exec(path.slice(prefix.length));
  return !!match && Number(match[1]) === slot;
}

export function photoReferenceWarnings(report) {
  return Array.from({ length: PHOTO_SLOT_COUNT }, (_, i) => i + 1)
    .filter(slot => report[`photo${slot}_path`] && !isReportPhotoPath(report[`photo${slot}_path`], report, slot))
    .map(slot => ({ slot, reason: 'invalid_report_bound_path' }));
}
