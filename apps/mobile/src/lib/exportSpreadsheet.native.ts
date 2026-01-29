// apps/mobile/src/lib/exportSpreadsheet.native.ts
//
// Native: Build a real XLSX spreadsheet with embedded images using ExcelJS,
// mirroring the PDF layout (6 photos: 2 main + 4 underneath, 2x3 grid).
// This runs on-device so we avoid Supabase Edge CPU limits.

import ExcelJS from 'exceljs';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';
import { Buffer } from 'buffer';

const DEBUG_XLSX = true;

function debugLog(...args: any[]) {
  if (!DEBUG_XLSX) return;
  // eslint-disable-next-line no-console
  console.log('[xlsx.native]', ...args);
}

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
  photo_urls: string[]; // up to 6 absolute URLs
};

type ExportOpts = {
  fileNamePrefix?: string;
};

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const IOS_UTI_XLSX = 'org.openxmlformats.spreadsheetml.sheet';

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
    // ignore if it already exists
  }
}

async function shareXlsx(fileUri: string) {
  debugLog('shareXlsx ->', fileUri);
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(fileUri, {
      mimeType: MIME_XLSX,
      dialogTitle: 'Share spreadsheet',
      UTI: Platform.OS === 'ios' ? IOS_UTI_XLSX : undefined,
    });
    return;
  }

  await Share.share({ url: fileUri, title: 'Share spreadsheet' });
}

async function fetchImageAsDataUri(url: string): Promise<string | null> {
  try {
    debugLog('fetch image', url);
    const started = Date.now();

    const res = await fetch(url);
    const status = res.status;
    const ct = (res.headers.get('content-type') || '').toLowerCase();

    if (!res.ok) {
      debugLog('fetch image failed', url, status);
      return null;
    }

    // ExcelJS is picky: use a full data URI so it can interpret the bytes correctly.
    const mime = ct.includes('png') ? 'image/png' : 'image/jpeg';

    const arrayBuf = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    debugLog('image bytes', url, 'status', status, 'content-type', ct, 'bytes', bytes.byteLength, 'ms', Date.now() - started);
    if (!bytes.byteLength) return null;

    const b64 = Buffer.from(bytes).toString('base64');
    debugLog('image base64 length', url, b64.length);
    return `data:${mime};base64,${b64}`;
  } catch (e) {
    debugLog('fetch image error', url, e);
    return null;
  }
}

export async function buildSubmissionSpreadsheetFile(
  row: SubmissionSpreadsheet,
  opts: ExportOpts = {}
): Promise<string> {
  const started = Date.now();
  debugLog('buildSubmissionSpreadsheetFile start', {
    store_site: row.store_site,
    date: row.date,
    brand: row.brand,
    photoCount: row.photo_urls?.length ?? 0,
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('submission', {
    properties: { defaultRowHeight: 18 },
  });

  ws.columns = [
    { key: 'label', width: 44 },
    { key: 'value', width: 44 },
  ];

  const border = {
    top: { style: 'thin' as const },
    bottom: { style: 'thin' as const },
    left: { style: 'thin' as const },
    right: { style: 'thin' as const },
  };
  const labelStyle = { font: { bold: true }, alignment: { vertical: 'middle' as const }, border };
  const valueStyle = { alignment: { vertical: 'middle' as const }, border };

  let r = 1;

  // Header row: store site / location
  ws.mergeCells(`A${r}:B${r}`);
  const siteCell = ws.getCell(`A${r}`);
  siteCell.value = (row.store_site || row.store_location || 'Submission').toUpperCase();
  siteCell.font = { bold: true };
  siteCell.alignment = { vertical: 'middle', horizontal: 'left' };
  siteCell.border = border;
  r++;

  const addRow = (label: string, value: unknown) => {
    ws.getCell(`A${r}`).value = label.toUpperCase();
    Object.assign(ws.getCell(`A${r}`), labelStyle);
    ws.getCell(`B${r}`).value = normalizeText(value);
    Object.assign(ws.getCell(`B${r}`), valueStyle);
    r++;
  };

  addRow('DATE', row.date);
  addRow('BRAND', row.brand);
  addRow('STORE LOCATION', row.store_location);
  addRow('LOCATIONS', row.location);
  addRow('CONDITIONS', row.conditions);
  addRow('PRICE PER UNIT', row.price_per_unit);
  addRow('SHELF SPACE', row.shelf_space);
  addRow('FACES ON SHELF', row.on_shelf);
  addRow('TAGS', normalizeTags(row.tags));
  addRow('NOTES', row.notes);

  const priRow = r;
  addRow('PRIORITY LEVEL', row.priority_level);
  const p = Number(row.priority_level ?? '0');
  const priColor =
    p === 1 ? 'FFEF4444' : // red
    p === 2 ? 'FFF59E0B' : // amber
    p === 3 ? 'FF22C55E' : // green
    undefined;
  if (priColor) {
    ws.getCell(`B${priRow}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: priColor },
    };
  }

  if (row.submitted_by) {
    addRow('SUBMITTED BY', row.submitted_by);
  }

  ws.addRow(['', '']);
  r++;

  // PHOTOS header
  ws.mergeCells(`A${r}:B${r}`);
  const hdr = ws.getCell(`A${r}`);
  hdr.value = 'PHOTOS';
  hdr.font = { bold: true };
  hdr.alignment = { vertical: 'middle', horizontal: 'left' };
  hdr.border = border;
  r++;

  // Reserve a 2x3 grid (6 slots)
  const imageTopRow = r;
  const rowsForImages = 36; // 3 blocks * 12 rows
  const imageBottomRow = imageTopRow + rowsForImages - 1;
  for (let rr = imageTopRow; rr <= imageBottomRow; rr++) {
    ws.getCell(`A${rr}`).border = border;
    ws.getCell(`B${rr}`).border = border;
    ws.getRow(rr).height = 18;
  }

  const supabaseThumb = (url: string): string => {
    const trimmed = url.trim();
    // Heuristic: if this is a Supabase storage or signed URL, append/merge
    // a lightweight transform to get a smaller thumbnail. We keep width small
    // and lower quality to reduce bytes massively while still being readable
    // in Excel.
    if (!/^https?:\/\//i.test(trimmed)) return trimmed;

    // Only touch supabase-like URLs
    if (!/supabase\./i.test(trimmed) && !/storage\.googleapis\.com\//i.test(trimmed)) {
      return trimmed;
    }

    const hasQuery = trimmed.includes('?');
    const sep = hasQuery ? '&' : '?';
    // Supabase Image Transform (or CDN) style params. Even if unused, safe.
    const params = 'width=400&quality=60&resize=contain';
    return `${trimmed}${sep}${params}`;
  };

  const urls = (row.photo_urls || [])
    .filter((u) => typeof u === 'string' && u.trim())
    .map((u) => supabaseThumb(u as string))
    .slice(0, 6);

  debugLog('photos to embed', urls.length, urls);

  // Fetch images sequentially to avoid memory spikes; convert to base64 JPEG
  const dataUris: (string | null)[] = [];
  for (const url of urls) {
    const dataUri = await fetchImageAsDataUri(url);
    dataUris.push(dataUri);
  }

  debugLog('photos fetched/dataUri', dataUris.map((b, idx) => ({ idx, ok: !!b })));

  for (let i = 0; i < dataUris.length; i++) {
    const dataUri = dataUris[i];
    if (!dataUri) continue;

    const isPng = dataUri.startsWith('data:image/png');
    const imageId = wb.addImage({ base64: dataUri, extension: isPng ? 'png' : 'jpeg' });
    const colIndex = i % 2; // 0 or 1
    const rowBlock = Math.floor(i / 2); // 0,1,2
    const tlRow = imageTopRow + rowBlock * 12;
    const brRow = tlRow + 11;
    const colLetter = colIndex === 0 ? 'A' : 'B';

    ws.addImage(imageId, `${colLetter}${tlRow}:${colLetter}${brRow}`);
  }

  debugLog('writing workbook buffer...');
  const tWriteStart = Date.now();
  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const bytes = new Uint8Array(buffer);
  debugLog('workbook buffer size', bytes.byteLength, 'bytes, ms', Date.now() - tWriteStart);

  const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!baseDir) throw new Error('No writable directory available for export.');

  const exportDir = baseDir + 'exports/';
  await ensureDir(exportDir);

  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = sanitizeFileBase(opts.fileNamePrefix || 'submission');
  const fileName = `${prefix}-${iso}.xlsx`;
  const dest = exportDir + fileName;

  debugLog('writing file to', dest);
  const tFsStart = Date.now();
  await FileSystem.writeAsStringAsync(dest, Buffer.from(bytes).toString('base64'), {
    encoding: FileSystem.EncodingType.Base64,
  } as any);
  debugLog('file written', dest, 'ms', Date.now() - tFsStart, 'totalMs', Date.now() - started);

  return dest;
}

export async function downloadSubmissionSpreadsheet(
  row: SubmissionSpreadsheet,
  opts: ExportOpts = {}
): Promise<void> {
  const dest = await buildSubmissionSpreadsheetFile(row, opts);
  await shareXlsx(dest);
}

export default { downloadSubmissionSpreadsheet, buildSubmissionSpreadsheetFile };
