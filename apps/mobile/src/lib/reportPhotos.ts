/** Keep fixed photo slots backward-compatible across native/web and legacy reports. */
export const MAX_REPORT_PHOTOS = 20;
export const REPORT_PHOTO_SLOTS = Array.from({ length: MAX_REPORT_PHOTOS }, (_, index) => index + 1);

export function reportPhotoFields(uploads: ({ path: string; publicUrl?: string | null } | null)[]) {
  if (uploads.length > MAX_REPORT_PHOTOS) throw new Error(`A report supports at most ${MAX_REPORT_PHOTOS} photos.`);
  return Object.fromEntries(REPORT_PHOTO_SLOTS.flatMap((slot) => [
    [`photo${slot}_path`, uploads[slot - 1]?.path ?? null],
    [`photo${slot}_url`, null], // Resolve delivery URLs from durable paths, not stored signed links.
  ]));
}
