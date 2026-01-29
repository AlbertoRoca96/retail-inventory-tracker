// apps/mobile/src/lib/exportSpreadsheet.native.ts
//
// Native: Build a real XLSX spreadsheet with embedded images using ExcelJS,
// mirroring the PDF layout (6 photos: 2 main + 4 underneath, 2x3 grid).
// This runs on-device so we avoid Supabase Edge CPU limits.
//
// Performance notes:
// - Resize/compress images using expo-image-manipulator (native) to avoid huge
//   JS-side base64 conversions and memory spikes.
// - Encode the final ArrayBuffer with base64-arraybuffer (faster than Buffer).
// - Disable styles/sharedStrings for ExcelJS to reduce work.

import ExcelJS from 'exceljs';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { encode as base64ArraybufferEncode } from 'base64-arraybuffer';

import { shareFileNative } from './shareFile.native';

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
  await shareFileNative(fileUri, {
    mimeType: MIME_XLSX,
    dialogTitle: 'Share spreadsheet',
    uti: IOS_UTI_XLSX,
    message: 'Submission spreadsheet attached.',
  });
}

function supabaseThumb(url: string): string {
  const trimmed = (url || '').trim();
  if (!trimmed) return trimmed;

  // Only touch HTTP(S)
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;

  // Only touch supabase-like URLs (safe heuristic)
  if (!/supabase\./i.test(trimmed) && !/storage\.googleapis\.com\//i.test(trimmed)) {
    return trimmed;
  }

  const hasQuery = trimmed.includes('?');
  const sep = hasQuery ? '&' : '?';
  // Even if ignored, it's harmless. If supported, it reduces bytes massively.
  const params = 'width=400&quality=60&resize=contain&format=origin';
  return `${trimmed}${sep}${params}`;
}

/**
 * Resize + compress via expo-image-manipulator and return a JPEG data URI.
 * This keeps images small and avoids huge memory spikes.
 */
async function fetchImageAsDataUriResized(
  url: string,
  width = 360,
  quality = 0.6
): Promise<string | null> {
  try {
    const started = Date.now();
    debugLog('fetch/resize image', url);

    const result = await ImageManipulator.manipulateAsync(
      url,
      [{ resize: { width } }],
      {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      }
    );

    if (!result?.base64) {
      debugLog('manipulateAsync returned no base64', url);
      return null;
    }

    debugLog('image resized', {
      url,
      outWidth: result.width,
      outHeight: result.height,
      base64Len: result.base64.length,
      ms: Date.now() - started,
    });

    return `data:image/jpeg;base64,${result.base64}`;
  } catch (e) {
    debugLog('fetch/resize error', url, e);
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
    p === 1
      ? 'FFEF4444' // red
      : p === 2
        ? 'FFF59E0B' // amber
        : p === 3
          ? 'FF22C55E' // green
          : undefined;
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

  const urls = (row.photo_urls || [])
    .filter((u) => typeof u === 'string' && u.trim())
    .map((u) => supabaseThumb(u as string))
    .slice(0, 6);

  debugLog('photos to embed', urls.length, urls);

  // Fetch + resize sequentially (keeps memory down)
  const dataUris: (string | null)[] = [];
  for (const url of urls) {
    const dataUri = await fetchImageAsDataUriResized(url, 360, 0.6);
    dataUris.push(dataUri);
  }

  debugLog('photos fetched/dataUri', dataUris.map((b, idx) => ({ idx, ok: !!b })));

  for (let i = 0; i < dataUris.length; i++) {
    const dataUri = dataUris[i];
    if (!dataUri) continue;

    const imageId = wb.addImage({ base64: dataUri, extension: 'jpeg' });
    const colIndex = i % 2; // 0 or 1
    const rowBlock = Math.floor(i / 2); // 0,1,2
    const tlRow = imageTopRow + rowBlock * 12;
    const brRow = tlRow + 11;
    const colLetter = colIndex === 0 ? 'A' : 'B';

    ws.addImage(imageId, `${colLetter}${tlRow}:${colLetter}${brRow}`);
  }

  // Yield so React Native has a chance to render UI updates (spinner) before heavy work.
  await new Promise((resolve) => setTimeout(resolve, 50));

  debugLog('writing workbook buffer...');
  const tWriteStart = Date.now();

  const buffer = (await wb.xlsx.writeBuffer({
    useStyles: false,
    useSharedStrings: false,
  } as any)) as ArrayBuffer;

  debugLog('workbook buffer ms', Date.now() - tWriteStart);

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

  const b64 = base64ArraybufferEncode(buffer);
  await FileSystem.writeAsStringAsync(dest, b64, {
    encoding: (FileSystem as any).EncodingType.Base64,
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
