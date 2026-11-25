// apps/mobile/src/lib/exportPdf.native.ts

import { productExportRows, type ReportProduct } from './reportProducts';
import { MAX_REPORT_PHOTOS } from './reportPhotos';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as ImageManipulator from 'expo-image-manipulator';
import { alertStorageUnavailable, resolveWritableDirectory, ensureExportDirectory } from './storageAccess';
import { shareFileNative } from './shareFile.native';

export type SubmissionPdf = {
  store_site: string;
  store_number?: string | null;
  store_chain?: string | null;
  products?: ReportProduct[];
  date: string;
  brand: string;
  store_location: string;
  location: string;
  conditions: string;
  price_per_unit: string;
  shelf_space: string;
  on_shelf: string;
  tags: string;
  notes: string;
  photo_urls: string[];
  // NEW: priority level shown below NOTES with colored background
  priority_level?: string | null;
};

type BuildOptions = {
  /** If true, photos are fetched and embedded as data URIs inside the HTML before printing. */
  inlineImages?: boolean;
  /** Optional filename prefix; final file is "<prefix>.pdf" (no extra timestamp). */
  fileNamePrefix?: string;
};

/** Escape text for HTML */
const esc = (s: string) =>
  (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Convert ANY local/remote image into a JPEG data URI using
 * expo-image-manipulator. This normalizes HEIC/HEIF/PNG/WebP/etc to
 * JPEG so iOS PDF rendering doesn't choke.
 */
async function toDataUri(url?: string | null): Promise<string | null> {
  if (!url) return null;

  // Already a data URI
  if (url.startsWith('data:')) return url;

  let localPath = url;
  let downloadedTemp: string | null = null;

  try {
    // If it's not a file/content URI, download to cache first.
    if (!/^file:|^content:/i.test(url)) {
      const name = `img-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const targetDir = resolveWritableDirectory(FileSystem as any, 'cache-first');
      if (!targetDir) {
        alertStorageUnavailable();
        return null;
      }
      const { uri } = await FileSystem.downloadAsync(url, `${targetDir}${name}`);
      localPath = uri;
      downloadedTemp = uri;
    }

    // Use ImageManipulator to re-encode as JPEG at a reasonable size
    const manipulated = await ImageManipulator.manipulateAsync(
      localPath,
      [{ resize: { width: 1400 } }],
      { format: ImageManipulator.SaveFormat.JPEG, compress: 0.85, base64: true }
    );

    if (!manipulated.base64) return null;

    return `data:image/jpeg;base64,${manipulated.base64}`;
  } catch {
    // As a fallback, try the old direct-read path (works for JPEG/PNG)
    try {
      const base64 = await FileSystem.readAsStringAsync(localPath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return `data:image/jpeg;base64,${base64}`;
    } catch {
      return null;
    }
  } finally {
    if (downloadedTemp) {
      FileSystem.deleteAsync(downloadedTemp, { idempotent: true }).catch(() => {});
    }
  }
}

/** Map "1|2|3" to a soft fill color (value cell background). */
function priorityFill(p?: string | null): string {
  const v = String(p ?? '').trim();
  if (v === '1') return '#FEE2E2'; // red-200
  if (v === '2') return '#FEF3C7'; // amber-200
  if (v === '3') return '#DCFCE7'; // green-200
  return ''; // no background when unset/other
}

/**
 * Build the PDF and return the **final saved file URI** inside the app's
 * exports/pdf directory. We render HTML → PDF via Print, then copy the
 * resulting bytes into a predictable location that shows up under
 * Files → On My iPhone → RWS → exports → pdf.
 */
export async function createSubmissionPdf(
  data: SubmissionPdf,
  opts: BuildOptions = {}
): Promise<string> {
  const urls = (data.photo_urls || []).filter(Boolean);
  if (urls.length > MAX_REPORT_PHOTOS) throw new Error(`A report supports at most ${MAX_REPORT_PHOTOS} photos.`);
  const images: string[] = [];
  for (const url of urls) {
    const image = opts.inlineImages ? await toDataUri(url) : url;
    if (!image) throw new Error(`Unable to prepare photo ${images.length + 1}/${urls.length}.`);
    images.push(image);
  }
  // Each pair is indivisible during printing; retain the existing 250pt image cells.
  const photoRows = Array.from({ length: Math.max(1, Math.ceil(images.length / 2)) }, (_, row) =>
    `<div class="grid">${[0, 1].map((col) => {
      const image = images[row * 2 + col];
      return `<div class="cell">${image ? `<img src="${esc(image)}"/>` : ''}</div>`;
    }).join('')}</div>`
  ).join('');

  // Compute priority row bits up front (below NOTES)
  const pri = (data.priority_level ?? '').toString();
  const priBg = priorityFill(pri);
  const priRow =
    `<tr><th class="label">PRIORITY LEVEL</th>` +
    `<td class="value" style="background:${priBg};font-weight:700;">${esc(pri)}</td></tr>`;

  // HTML layout (mirrors Excel)
  const html = `<!doctype html>
<html><head><meta charset="utf-8"/><style>
  @page { size: Letter portrait; margin: 36pt; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; margin: 0; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #777; padding: 6pt; font-size: 10pt; vertical-align: middle; }
  th.label { width: 38%; text-align: left; font-weight: 700; }
  td.value { width: 62%; }
  .title { font-weight: 700; }
  .photos h3 { margin: 10pt 0 6pt; font-size: 10pt; }
  .grid { display: table; width: 100%; table-layout: fixed; break-inside: avoid; page-break-inside: avoid; }
  .photos h3 { break-after: avoid; page-break-after: avoid; }
  .cell { display: table-cell; border: 1px solid #777; height: 250pt; vertical-align: middle; text-align: center; background: #fff; }
  img { max-width: 100%; max-height: 238pt; object-fit: contain; }
</style></head>
<body>
  <table>
    <tr><th colspan="2" class="title">${esc((data.store_site || '').toUpperCase())}</th></tr>
    <tr><th class="label">DATE</th><td class="value">${esc(data.date)}</td></tr>
    <tr><th class="label">BRAND</th><td class="value">${esc(data.brand)}</td></tr>
    <tr><th class="label">STORE NUMBER</th><td class="value">${esc(data.store_number || '')}</td></tr>
    <tr><th class="label">STORE CHAIN</th><td class="value">${esc(data.store_chain || '')}</td></tr>
    ${productExportRows(data.products).map(([label, value]) => `<tr><th class="label">${esc(label)}</th><td class="value">${esc(value)}</td></tr>`).join('')}
    <tr><th class="label">STORE LOCATION</th><td class="value">${esc(data.store_location)}</td></tr>
    <tr><th class="label">LOCATIONS</th><td class="value">${esc(data.location)}</td></tr>
    <tr><th class="label">CONDITIONS</th><td class="value">${esc(data.conditions)}</td></tr>
    <tr><th class="label">PRICE PER UNIT</th><td class="value">${esc(data.price_per_unit)}</td></tr>
    <tr><th class="label">SHELF SPACE</th><td class="value">${esc(data.shelf_space)}</td></tr>
    <tr><th class="label">FACES ON SHELF</th><td class="value">${esc(data.on_shelf)}</td></tr>
    <tr><th class="label">TAGS</th><td class="value">${esc(data.tags)}</td></tr>
    <tr><th class="label">NOTES</th><td class="value">${esc(data.notes)}</td></tr>
    ${priRow}
  </table>
  <div class="photos">
    <h3>PHOTOS</h3>
    ${photoRows}
  </div>
</body></html>`;

  // 1) Render HTML → PDF to a temp file.
  // DO NOT request base64 here.
  // Base64 strings can get huge (especially with inline images) and can fail
  // unpredictably on-device when writing to disk.
  const { uri: tmpPdfUri } = await Print.printToFileAsync({ html });

  // 2) Give it a nice name and move into app documents/exports/pdf folder.
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = (opts.fileNamePrefix || '').trim();
  const fileBase = prefix || `submission-${iso}`;
  const fileName = `${fileBase}.pdf`;

  const exportDir =
    (await ensureExportDirectory(FileSystem as any, 'pdf', 'documents-first')) ??
    (await ensureExportDirectory(FileSystem as any, 'pdf', 'cache-first'));
  if (!exportDir) {
    alertStorageUnavailable();
    throw new Error('Unable to resolve a writable directory for PDF exports.');
  }

  const dest = `${exportDir}${fileName}`;

  try {
    // If the file already exists, nuke it so copy doesn't fail.
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});

    // Copy the generated temp PDF to the exports directory.
    await FileSystem.copyAsync({ from: tmpPdfUri, to: dest });

    // Cleanup best-effort.
    await FileSystem.deleteAsync(tmpPdfUri, { idempotent: true }).catch(() => {});

    return dest;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to write PDF file to exports directory. dest=${dest} err=${msg}`);
  }
}

/**
 * Build the PDF then open the share sheet / print dialog.
 * Returns the file URI either way.
 */
export async function downloadSubmissionPdf(
  data: SubmissionPdf,
  opts: { fileNamePrefix?: string } = {}
): Promise<string> {
  const uri = await createSubmissionPdf(data, {
    inlineImages: true,
    fileNamePrefix: opts.fileNamePrefix || 'submission',
  });

  // Sanity: make sure the file exists before trying to share
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      throw new Error('PDF file was not created successfully.');
    }
  } catch (err) {
    throw err instanceof Error ? err : new Error('Unable to verify PDF file.');
  }

  try {
    await shareFileNative(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Share submission PDF',
      uti: 'com.adobe.pdf',
      message: 'Submission PDF attached.',
    });
    return uri;
  } catch (err) {
    // If sharing fails or the user cancels, offer print as a backup but do
    // not hide the original error from callers.
    try {
      await Print.printAsync({ uri });
    } catch {
      // swallow; at this point the file still exists at `uri` or `dest`
    }
    throw err;
  }

  // NOTE: We only reach here if the caller ignores the thrown error.

}

// Keep a default export shape if other modules import it that way.
export default { createSubmissionPdf, downloadSubmissionPdf };
