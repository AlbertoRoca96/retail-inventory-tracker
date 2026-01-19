// apps/mobile/src/lib/exportSpreadsheet.native.ts
//
// Native: Generate a real, fully-editable .xlsx workbook with embedded photos.
// Industry-grade behavior:
// - Always outputs XLSX (not HTML, not CSV).
// - Downloads remote photo URLs.
// - Autoconverts ANY image/video into JPEG for ExcelJS embedding (HEIC/HEIF/PNG/JPEG/WebP/Live Photo MOV).
// - Shares with correct XLSX MIME type / iOS UTI.

import ExcelJS from 'exceljs';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';
import { Buffer } from 'buffer';
import * as ImageManipulator from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';

if (!(globalThis as any).Buffer) (globalThis as any).Buffer = Buffer;

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// iOS UTI that helps the share sheet + Excel understand this is XLSX.
const IOS_UTI_XLSX = 'org.openxmlformats.spreadsheetml.sheet';

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
  photo_urls: string[];
};

type ExportOpts = {
  fileNamePrefix?: string;
  // Hardening knobs:
  maxPhotoWidthPx?: number; // default 1400
  jpegQuality?: number; // default 0.85
};

function sanitizeFileBase(input: string): string {
  const base = (input || '').trim() || 'submission';
  return base
    .replace(/[\/\\?%*:|"<>]/g, '-')
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
  // Handles:
  // - ["Wow"] (array)
  // - '["Wow"]' (stringified array)
  // - "Wow" (string)
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

function isRemoteUri(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

function looksLikeVideo(uri: string): boolean {
  return /(\.mov|\.mp4|\.m4v|\.3gp|\.avi|\.webm)(\?|#|$)/i.test(uri);
}

async function ensureDir(path: string) {
  try {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  } catch {
    // ignore
  }
}

async function downloadToLocalIfNeeded(uriOrUrl: string): Promise<{ uri: string; cleanup: () => Promise<void> }> {
  if (!isRemoteUri(uriOrUrl)) return { uri: uriOrUrl, cleanup: async () => {} };

  const base = (FileSystem.cacheDirectory || FileSystem.documentDirectory || '') + 'xlsx_tmp/';
  await ensureDir(base);

  const extMatch = uriOrUrl.split('?')[0].match(/\.([a-z0-9]+)$/i);
  const ext = (extMatch?.[1] || 'bin').toLowerCase();
  const dest = `${base}${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
  const res = await FileSystem.downloadAsync(uriOrUrl, dest);
  return {
    uri: res.uri,
    cleanup: async () => {
      try {
        await FileSystem.deleteAsync(res.uri, { idempotent: true });
      } catch {
        // ignore
      }
    },
  };
}

/**
 * Autoconverter:
 * - remote -> local download
 * - video -> thumbnail
 * - any image/video -> JPEG re-encode (Excel-compatible)
 */
async function toJpegDataUri(
  uriOrUrl: string,
  opts: Required<Pick<ExportOpts, 'maxPhotoWidthPx' | 'jpegQuality'>>
): Promise<{ dataUri: string } | null> {
  let downloaded: { uri: string; cleanup: () => Promise<void> } | null = null;
  let thumbUri: string | null = null;
  let outUri: string | null = null;

  try {
    downloaded = await downloadToLocalIfNeeded(uriOrUrl);
    let inputUri = downloaded.uri;

    // Live Photos / videos: extract a still image.
    if (looksLikeVideo(inputUri) || looksLikeVideo(uriOrUrl)) {
      const thumb = await VideoThumbnails.getThumbnailAsync(inputUri, { time: 0 });
      thumbUri = thumb.uri;
      inputUri = thumbUri;
    }

    // Force everything to JPEG to guarantee ExcelJS embedding compatibility.
    const manipulated = await ImageManipulator.manipulateAsync(
      inputUri,
      [{ resize: { width: opts.maxPhotoWidthPx } }],
      { format: ImageManipulator.SaveFormat.JPEG, compress: opts.jpegQuality, base64: true }
    );

    outUri = manipulated.uri;
    if (!manipulated.base64) return null;

    return { dataUri: `data:image/jpeg;base64,${manipulated.base64}` };
  } catch {
    return null;
  } finally {
    // Best-effort cleanup.
    const cleanups: Promise<any>[] = [];
    if (downloaded) cleanups.push(downloaded.cleanup());
    if (thumbUri) cleanups.push(FileSystem.deleteAsync(thumbUri, { idempotent: true }).catch(() => {}));
    if (outUri) cleanups.push(FileSystem.deleteAsync(outUri, { idempotent: true }).catch(() => {}));
    await Promise.allSettled(cleanups);
  }
}

async function shareXlsx(fileUri: string) {
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(fileUri, {
      mimeType: MIME_XLSX,
      dialogTitle: 'Share spreadsheet',
      UTI: Platform.OS === 'ios' ? IOS_UTI_XLSX : undefined,
    });
    return;
  }

  // Fallback: less reliable, but better than nothing.
  await Share.share({ url: fileUri, title: 'Share spreadsheet' });
}

export async function downloadSubmissionSpreadsheet(
  row: SubmissionSpreadsheet,
  opts: ExportOpts = {}
): Promise<void> {
  const maxPhotoWidthPx = Math.max(256, Math.min(opts.maxPhotoWidthPx ?? 1400, 2400));
  const jpegQuality = Math.max(0.3, Math.min(opts.jpegQuality ?? 0.85, 0.95));

  // QUICK SAFETY: if something is catastrophically wrong with ExcelJS on native,
  // bail early with a simple text file so buttons don't freeze the UI. Remove
  // this guard once things are stable.
  if (!ExcelJS || !(ExcelJS as any).Workbook) {
    throw new Error('ExcelJS not available on native runtime');
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Retail Inventory Tracker';
  wb.created = new Date();

  const ws = wb.addWorksheet('submission');
  ws.columns = [
    { key: 'label', width: 22 },
    { key: 'value', width: 48 },
  ];

  const addKV = (label: string, value: string) => {
    ws.addRow([label, value]);
  };

  // Marker row: proves which exporter generated the file.
  addKV('EXPORT_VERSION', 'XLSX_NATIVE_V2');

  addKV('DATE', normalizeText(row.date));
  addKV('BRAND', normalizeText(row.brand));
  addKV('STORE SITE', normalizeText(row.store_site));
  addKV('STORE LOCATION', normalizeText(row.store_location));
  addKV('LOCATIONS', normalizeText(row.location));
  addKV('CONDITIONS', normalizeText(row.conditions));
  addKV('PRICE PER UNIT', normalizeText(row.price_per_unit));
  addKV('SHELF SPACE', normalizeText(row.shelf_space));
  addKV('ON SHELF', normalizeText(row.on_shelf));
  addKV('TAGS', normalizeTags(row.tags));
  addKV('NOTES', normalizeText(row.notes));
  addKV('PRIORITY LEVEL', normalizeText(row.priority_level));
  if (row.submitted_by) addKV('SUBMITTED BY', normalizeText(row.submitted_by));

  // Photos section
  ws.addRow(['', '']);
  const hdr = ws.addRow(['PHOTOS', '']);
  hdr.font = { bold: true };

  const urls = (row.photo_urls || [])
    .filter((u) => typeof u === 'string' && u.trim())
    .slice(0, 2);

  // Keep URLs in-sheet (debug + traceability).
  addKV('PHOTO 1 URL', urls[0] || '');
  addKV('PHOTO 2 URL', urls[1] || '');

  // Reserve visible space.
  const imageTopRow = (ws.lastRow?.number || 1) + 2;
  const imageHeightRows = 18;
  for (let i = 0; i < imageHeightRows; i++) {
    const r = ws.getRow(imageTopRow + i);
    r.height = 18;
    if (i === 0) {
      r.getCell(1).value = 'Photo 1';
      r.getCell(2).value = 'Photo 2';
    }
  }

  let settled: PromiseSettledResult<{ dataUri: string } | null>[] = [];
  try {
    settled = await Promise.allSettled(
      urls.map((u) => toJpegDataUri(u, { maxPhotoWidthPx, jpegQuality }))
    );
  } catch (err) {
    // If anything goes wrong with image conversion, continue without images
    settled = [];
  }

  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    if (s.status !== 'fulfilled' || !s.value) continue;

    const imageId = wb.addImage({
      base64: s.value.dataUri,
      extension: 'jpeg',
    });

    // Place side-by-side: col 0 = A, col 1 = B. ExcelJS uses 0-based col/row anchors.
    ws.addImage(imageId, {
      tl: { col: i, row: imageTopRow - 1 },
      ext: { width: 320, height: 320 },
    });
  }

  // Write XLSX to disk.
  const out = await wb.xlsx.writeBuffer();
  const base64 = Buffer.from(out as ArrayBuffer).toString('base64');

  const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!baseDir) throw new Error('No writable directory available for export.');

  const exportDir = baseDir + 'exports/';
  await ensureDir(exportDir);

  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = sanitizeFileBase(opts.fileNamePrefix || 'submission');
  const fileName = `${prefix}-${iso}.xlsx`;
  const dest = exportDir + fileName;

  await FileSystem.writeAsStringAsync(dest, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  await shareXlsx(dest);
}

export default { downloadSubmissionSpreadsheet };
