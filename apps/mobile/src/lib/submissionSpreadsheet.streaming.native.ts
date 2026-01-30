// apps/mobile/src/lib/submissionSpreadsheet.streaming.native.ts
//
// iOS-only: build an XLSX on-device using the native streaming module (libxlsxwriter).
// This avoids ExcelJS OOM/watchdog crashes.

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

import { shareFileNative } from './shareFile.native';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLSX_UTI = 'org.openxmlformats.spreadsheetml.sheet';

export type SubmissionSpreadsheetPayload = {
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

function sanitizeFileBase(input: string): string {
  const base = (input || '').trim() || 'submission';
  return base
    .replace(/[\\/?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

async function ensureDir(path: string) {
  try {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  } catch {
    // ignore
  }
}

function toStringSafe(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

async function downloadToTemp(url: string): Promise<string> {
  const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!baseDir) throw new Error('No writable directory.');

  const dest = `${baseDir}xlsx-photo-${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`;
  const out = await FileSystem.downloadAsync(url, dest);
  return out.uri;
}

async function resizeToJpegFile(inputUri: string): Promise<string> {
  // Keep these conservative: we care about stability, not print-quality.
  const result = await ImageManipulator.manipulateAsync(
    inputUri,
    [{ resize: { width: 260 } }],
    { compress: 0.55, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
}

async function toFilePath(uri: string): Promise<string> {
  // Native module expects a plain file path.
  const normalized = uri.replace(/^file:\/\//, '');
  return normalized;
}

export async function buildStreamingSubmissionSpreadsheetToPath(
  payload: SubmissionSpreadsheetPayload,
  fileNamePrefix = 'submission'
): Promise<string> {
  if (Platform.OS !== 'ios') {
    throw new Error('Streaming XLSX writer is only available on iOS (for now).');
  }

  const mod = await import('rws-xlsx-writer');
  const native = (mod as any).default;
  if (!native?.isAvailable) {
    throw new Error('Native XLSX writer not available.');
  }

  const available = await native.isAvailable();
  if (!available) throw new Error('Native XLSX writer not available.');

  const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!baseDir) throw new Error('No writable directory.');

  const exportDir = baseDir + 'exports/';
  await ensureDir(exportDir);

  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const safeBase = sanitizeFileBase(fileNamePrefix);
  const destUri = `${exportDir}${safeBase}-${iso}.xlsx`;

  // Prepare rows (keep it dead simple; native module does formatting)
  const rows = [
    { label: 'DATE', value: toStringSafe(payload.date) },
    { label: 'BRAND', value: toStringSafe(payload.brand) },
    { label: 'STORE LOCATION', value: toStringSafe(payload.store_location) },
    { label: 'LOCATIONS', value: toStringSafe(payload.location) },
    { label: 'CONDITIONS', value: toStringSafe(payload.conditions) },
    { label: 'PRICE PER UNIT', value: toStringSafe(payload.price_per_unit) },
    { label: 'SHELF SPACE', value: toStringSafe(payload.shelf_space) },
    { label: 'FACES ON SHELF', value: toStringSafe(payload.on_shelf) },
    { label: 'TAGS', value: toStringSafe(payload.tags) },
    { label: 'NOTES', value: toStringSafe(payload.notes) },
    { label: 'PRIORITY LEVEL', value: toStringSafe(payload.priority_level) },
    ...(payload.submitted_by ? [{ label: 'SUBMITTED BY', value: toStringSafe(payload.submitted_by) }] : []),
  ];

  // Download + resize photos to local JPEG files.
  const imagePaths: string[] = [];
  const toCleanUp: string[] = [];

  const urls = (payload.photo_urls || []).filter(Boolean).slice(0, 6);
  for (const url of urls) {
    const tmp = await downloadToTemp(url);
    toCleanUp.push(tmp);
    const resized = await resizeToJpegFile(tmp);
    // resizeToJpegFile may return a new uri; best-effort cleanup tmp still.
    if (resized !== tmp) toCleanUp.push(resized);

    const p = await toFilePath(resized);
    imagePaths.push(p);
  }

  const destPath = await toFilePath(destUri);

  try {
    await native.writeSubmissionXlsx({
      destPath,
      title: (payload.store_site || payload.store_location || 'SUBMISSION').toUpperCase(),
      rows,
      imagePaths,
    });

    return destUri;
  } finally {
    // Best-effort temp cleanup
    await Promise.all(
      toCleanUp.map((u) => FileSystem.deleteAsync(u, { idempotent: true }).catch(() => null))
    );
  }
}

export async function shareStreamingSubmissionSpreadsheet(
  payload: SubmissionSpreadsheetPayload,
  fileNamePrefix = 'submission'
) {
  const dest = await buildStreamingSubmissionSpreadsheetToPath(payload, fileNamePrefix);
  await shareFileNative(dest, {
    mimeType: XLSX_MIME,
    dialogTitle: 'Share spreadsheet',
    uti: XLSX_UTI,
    message: 'Submission spreadsheet attached.',
  });
}

export default {
  buildStreamingSubmissionSpreadsheetToPath,
  shareStreamingSubmissionSpreadsheet,
};
