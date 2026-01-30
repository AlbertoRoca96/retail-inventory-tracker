// apps/mobile/src/lib/submissionSpreadsheet.streaming.native.ts
//
// iOS-only: build an XLSX on-device using the native streaming module (libxlsxwriter).
// This avoids ExcelJS OOM/watchdog crashes.

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
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

function normalizeDir(dir: string): string {
  return dir.endsWith('/') ? dir : `${dir}/`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 3
): Promise<T> {
  let lastErr: unknown = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts) {
        const backoff = 400 * Math.pow(2, i - 1);
        console.warn('[streaming-xlsx] retry', { label, attempt: i, backoff, err });
        await sleep(backoff);
        continue;
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${label} failed`);
}

function tmpDir(): string {
  // Avoid relying on documentDirectory/cacheDirectory (sometimes null in TestFlight)
  const t = (FileSystem as any).temporaryDirectory as string | undefined;
  return normalizeDir(t || 'file:///tmp/');
}

async function downloadToTemp(url: string): Promise<string> {
  const name = `xlsx-img-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`;
  const dest = `${tmpDir()}${name}`;
  const { uri } = await FileSystem.downloadAsync(url, dest);
  return uri;
}

async function fetchAndResizeToJpegFile(url: string): Promise<string> {
  // Strict + reliable path:
  // 1) download signed URL to temp file
  // 2) resize+re-encode as JPEG (ImageManipulator writes to its own cache)
  const downloaded = await withRetries(`download:${url}`, () => downloadToTemp(url), 3);

  try {
    const result = await withRetries(
      `resize:${url}`,
      () =>
        ImageManipulator.manipulateAsync(
          downloaded,
          [{ resize: { width: 260 } }],
          { compress: 0.55, format: ImageManipulator.SaveFormat.JPEG }
        ),
      2
    );

    if (!result?.uri) throw new Error('ImageManipulator returned no uri');
    return result.uri;
  } finally {
    // Cleanup best-effort
    FileSystem.deleteAsync(downloaded, { idempotent: true }).catch(() => {});
  }
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

  // Let native module choose an output path in NSTemporaryDirectory.
  // We still keep the filename prefix to be nice.
  // (We pass it as the title prefix only; actual file naming is native-side.)
  const safeBase = sanitizeFileBase(fileNamePrefix);
  void safeBase;

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

  // Fetch + resize photos to local JPEG files.
  // NOTE: These files live in internal cache; iOS can clean them up later.
  const imagePaths: string[] = [];

  const urls = (payload.photo_urls || []).filter(Boolean).slice(0, 6);
  const expected = urls.length;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const resizedUri = await fetchAndResizeToJpegFile(url);
    const p = await toFilePath(resizedUri);
    if (!p) {
      throw new Error(`Failed to prepare image ${i + 1}/${expected}`);
    }
    imagePaths.push(p);
  }

  if (imagePaths.length !== expected) {
    throw new Error(`Spreadsheet export requires all photos (${expected}), got ${imagePaths.length}`);
  }

  // destPath empty => native creates temp file and returns the absolute path.
  const producedPath: string = await native.writeSubmissionXlsx({
    destPath: '',
    title: (payload.store_site || payload.store_location || 'SUBMISSION').toUpperCase(),
    rows,
    imagePaths,
  });

  // native returns a plain path; share expects file://
  const uri = producedPath.startsWith('file://') ? producedPath : `file://${producedPath}`;
  return uri;
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
