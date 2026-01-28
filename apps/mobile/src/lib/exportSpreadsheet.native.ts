// apps/mobile/src/lib/exportSpreadsheet.native.ts
//
// Native: Export a lightweight HTML-based .xls spreadsheet that Excel can open.
// We embed up to 6 photos in a 2x3 grid using <img> tags. This avoids heavy
// ExcelJS work on-device and keeps the UI responsive.

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';

export type SubmissionSpreadsheet = {
  store_site: string;
  date: string;
  brand: string;
  store_location: string;
  location: string;
  conditions: string;
  price_per_unit: number | string;
  shelf_space: string;
  on_shelf: number | string;
  tags: unknown;
  notes: string;
  priority_level: number | string;
  submitted_by?: string;
  photo_urls: string[]; // up to 6
};

type ExportOpts = {
  fileNamePrefix?: string;
};

const MIME_XLS = 'application/vnd.ms-excel';
const IOS_UTI_XLS = 'com.microsoft.excel.xls';

function sanitizeFileBase(input: string): string {
  const base = (input || '').trim() || 'submission';
  return base
    .replace(/[\\/?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

function normalizeText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function normalizeTags(tags: unknown): string {
  if (Array.isArray(tags)) return tags.map(normalizeText).filter(Boolean).join(', ');
  if (typeof tags === 'string') {
    const t = tags.trim();
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed.map(normalizeText).filter(Boolean).join(', ');
    } catch {
      // ignore
    }
    return t;
  }
  return normalizeText(tags);
}

async function ensureDir(path: string) {
  try {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  } catch {
    // ignore
  }
}

async function shareXls(fileUri: string) {
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(fileUri, {
      mimeType: MIME_XLS,
      dialogTitle: 'Share spreadsheet',
      UTI: Platform.OS === 'ios' ? IOS_UTI_XLS : undefined,
    });
    return;
  }

  await Share.share({ url: fileUri, title: 'Share spreadsheet' });
}

function buildHtml(row: SubmissionSpreadsheet): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const cells: Array<[string, string]> = [];
  cells.push(['EXPORT_VERSION', 'HTML_XLS_NATIVE_V2_6_PHOTOS']);
  cells.push(['DATE', normalizeText(row.date)]);
  cells.push(['BRAND', normalizeText(row.brand)]);
  cells.push(['STORE SITE', normalizeText(row.store_site)]);
  cells.push(['STORE LOCATION', normalizeText(row.store_location)]);
  cells.push(['LOCATIONS', normalizeText(row.location)]);
  cells.push(['CONDITIONS', normalizeText(row.conditions)]);
  cells.push(['PRICE PER UNIT', normalizeText(row.price_per_unit)]);
  cells.push(['SHELF SPACE', normalizeText(row.shelf_space)]);
  cells.push(['FACES ON SHELF', normalizeText(row.on_shelf)]);
  cells.push(['TAGS', normalizeTags(row.tags)]);
  cells.push(['NOTES', normalizeText(row.notes)]);
  cells.push(['PRIORITY LEVEL', normalizeText(row.priority_level)]);
  if (row.submitted_by) cells.push(['SUBMITTED BY', normalizeText(row.submitted_by)]);

  const rowsHtml = cells
    .map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`)
    .join('');

  const urls = (row.photo_urls || [])
    .filter((u) => typeof u === 'string' && u.trim())
    .slice(0, 6);

  const imgCell = (url?: string) =>
    url
      ? `<td style="border:1px solid #777;width:50%;height:180px;text-align:center;vertical-align:middle;"><img src="${esc(
          url
        )}" style="max-width:100%;max-height:100%;object-fit:contain;" /></td>`
      : `<td style="border:1px solid #777;width:50%;height:180px;"></td>`;

  const [u1, u2, u3, u4, u5, u6] = urls;

  const photosHtml = `
  <tr><td colspan="2"><b>PHOTOS</b></td></tr>
  <tr>
    ${imgCell(u1)}
    ${imgCell(u2)}
  </tr>
  <tr>
    ${imgCell(u3)}
    ${imgCell(u4)}
  </tr>
  <tr>
    ${imgCell(u5)}
    ${imgCell(u6)}
  </tr>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>Submission</title>
</head>
<body>
<table border="1" cellspacing="0" cellpadding="4">
${rowsHtml}
<tr><td></td><td></td></tr>
${photosHtml}
</table>
</body>
</html>`;
}

export async function buildSubmissionSpreadsheetFile(
  row: SubmissionSpreadsheet,
  opts: ExportOpts = {}
): Promise<string> {
  const html = buildHtml(row);

  const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!baseDir) throw new Error('No writable directory available for export.');

  const exportDir = baseDir + 'exports/';
  await ensureDir(exportDir);

  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = sanitizeFileBase(opts.fileNamePrefix || 'submission');
  const fileName = `${prefix}-${iso}.xls`; // HTML-based .xls
  const dest = exportDir + fileName;

  await FileSystem.writeAsStringAsync(dest, html, {} as any);
  return dest;
}

export async function downloadSubmissionSpreadsheet(
  row: SubmissionSpreadsheet,
  opts: ExportOpts = {}
): Promise<void> {
  const dest = await buildSubmissionSpreadsheetFile(row, opts);
  await shareXls(dest);
}

export default { downloadSubmissionSpreadsheet, buildSubmissionSpreadsheetFile };
