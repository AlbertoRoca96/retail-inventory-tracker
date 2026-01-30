// apps/mobile/src/lib/submissionSpreadsheet.native.ts
// Native: call the Supabase Edge Function `submission-xlsx` to get a real XLSX
// (with images embedded), save to disk, then share or return the file path.

import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';

import Constants from 'expo-constants';

import { supabase, resolvedSupabaseUrl } from './supabase';
import { shareFileNative } from './shareFile.native';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLSX_UTI = 'org.openxmlformats.spreadsheetml.sheet';

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

function bytesToBase64(bytes: Uint8Array): string {
  // Prefer Buffer if available (fast + reliable)
  const B = (globalThis as any).Buffer;
  if (B && typeof B.from === 'function') {
    return B.from(bytes).toString('base64');
  }

  // Fallback: btoa if available
  const btoaFn = (globalThis as any).btoa as ((s: string) => string) | undefined;
  if (!btoaFn) {
    throw new Error('Base64 encoder not available (Buffer/btoa missing).');
  }

  // Chunked to avoid call stack limits
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoaFn(binary);
}

const sanitize = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return undefined;
  return trimmed;
};

const isValidHttpUrl = (value?: string | null) => {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
};

const getConfigExtra = () => {
  const expoConfig = Constants.expoConfig;
  const manifest2 = (Constants as unknown as { manifest2?: { extra?: Record<string, unknown> } }).manifest2;
  const legacyManifest = (Constants as unknown as { manifest?: { extra?: Record<string, unknown> } }).manifest;
  return expoConfig?.extra ?? manifest2?.extra ?? legacyManifest?.extra ?? {};
};

const extra = getConfigExtra();
const envXlsxServiceUrl = sanitize(process.env.EXPO_PUBLIC_XLSX_SERVICE_URL ?? process.env.XLSX_SERVICE_URL);
const extraXlsxServiceUrl = sanitize(extra.xlsxServiceUrl as string | undefined);

const resolvedXlsxServiceUrl =
  (isValidHttpUrl(envXlsxServiceUrl) ? envXlsxServiceUrl : undefined) ??
  (isValidHttpUrl(extraXlsxServiceUrl) ? extraXlsxServiceUrl : undefined) ??
  undefined;

async function fetchSubmissionXlsx(submissionId: string): Promise<Uint8Array> {
  const { data, error } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) throw new Error('You must be signed in.');

  // Prefer the dedicated XLSX service when configured.
  // This avoids Supabase Edge CPU limits and avoids iOS ExcelJS crashes.
  const endpoint = (() => {
    if (resolvedXlsxServiceUrl) {
      const base = resolvedXlsxServiceUrl.replace(/\/+$/, '');
      return `${base}/submission-xlsx`;
    }

    const baseUrl = (resolvedSupabaseUrl || '').replace(/\/+$/, '');
    if (!baseUrl) throw new Error('Supabase URL missing.');
    return `${baseUrl}/functions/v1/submission-xlsx`;
  })();

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ submission_id: submissionId }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const target = resolvedXlsxServiceUrl ? 'xlsx-service' : 'submission-xlsx';
    throw new Error(`${target} failed (${res.status}): ${text || 'Unknown error'}`);
  }

  // IMPORTANT: Some production RN builds don’t support Response.blob().
  // arrayBuffer() is the most reliable way to get binary bytes.
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export async function downloadSubmissionSpreadsheetToPath(
  submissionId: string,
  fileBase: string
): Promise<string> {
  const bytes = await fetchSubmissionXlsx(submissionId);

  const cache = FileSystem.cacheDirectory ?? null;
  const doc = FileSystem.documentDirectory ?? null;
  const baseDir = cache || doc;
  if (!baseDir) {
    throw new Error(
      `No writable directory (platform=native, documentDirectory=${String(doc)}, cacheDirectory=${String(cache)})`
    );
  }

  const exportDir = baseDir + 'exports/';
  await ensureDir(exportDir);

  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const safeBase = sanitizeFileBase(fileBase);
  const dest = `${exportDir}${safeBase}-${iso}.xlsx`;

  const base64 = bytesToBase64(bytes);
  await FileSystem.writeAsStringAsync(dest, base64, {
    encoding: FileSystem.EncodingType.Base64,
  } as any);

  return dest;
}

// Keep the old 3-arg signature for compatibility with callers.
export async function shareSubmissionSpreadsheetFromEdge(
  submissionId: string,
  fileBase: string
) {
  try {
    const dest = await downloadSubmissionSpreadsheetToPath(submissionId, fileBase);

    await shareFileNative(dest, {
      mimeType: XLSX_MIME,
      dialogTitle: 'Share spreadsheet',
      uti: XLSX_UTI,
      message: 'Submission spreadsheet attached.',
    });
  } catch (err: any) {
    Alert.alert('Spreadsheet failed', err?.message ?? 'Unable to generate spreadsheet.');
    throw err;
  }
}

export default { shareSubmissionSpreadsheetFromEdge, downloadSubmissionSpreadsheetToPath };
