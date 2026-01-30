// apps/mobile/src/lib/submissionSpreadsheet.native.ts
// Native: call the Supabase Edge Function `submission-xlsx` to get a real XLSX
// (with images embedded), save to disk, then share or return the file path.

import { Alert, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

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


function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function isRetryableStatus(status: number): boolean {
  // 502/503/504 = upstream/timeout; 546 = supabase edge WORKER_LIMIT.
  return status === 502 || status === 503 || status === 504 || status === 546;
}

async function fetchSubmissionXlsx(submissionId: string): Promise<Uint8Array> {
  const { data, error } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) throw new Error('You must be signed in.');

  const baseUrl = (resolvedSupabaseUrl || '').replace(/\/+$/, '');
  if (!baseUrl) throw new Error('Supabase URL missing.');

  const endpoint = `${baseUrl}/functions/v1/submission-xlsx`;

  const body = JSON.stringify({ submission_id: submissionId });

  const maxAttempts = 4;
  const timeoutMs = 45_000;

  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body,
        },
        timeoutMs
      );

      if (!res.ok) {
        const text = await res.text().catch(() => '');

        // Retry on transient edge/upstream failures.
        if (isRetryableStatus(res.status) && attempt < maxAttempts) {
          const backoff = 600 * Math.pow(2, attempt - 1);
          console.warn('[submission-xlsx] retrying', { attempt, status: res.status, backoff });
          await sleep(backoff);
          continue;
        }

        throw new Error(`submission-xlsx failed (${res.status}): ${text || 'Unknown error'}`);
      }

      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    } catch (err) {
      lastErr = err;

      // Retry on fetch timeouts/network errors as well.
      if (attempt < maxAttempts) {
        const backoff = 600 * Math.pow(2, attempt - 1);
        console.warn('[submission-xlsx] request failed, retrying', { attempt, backoff, err });
        await sleep(backoff);
        continue;
      }

      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('submission-xlsx failed');
}

export async function downloadSubmissionSpreadsheetToPath(
  submissionId: string,
  fileBase: string
): Promise<string> {
  const bytes = await fetchSubmissionXlsx(submissionId);

  const base64 = bytesToBase64(bytes);
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const safeBase = sanitizeFileBase(fileBase);
  const fileName = `${safeBase}-${iso}.xlsx`;

  const cache = FileSystem.cacheDirectory ?? null;
  const doc = FileSystem.documentDirectory ?? null;
  const baseDir = cache || doc;

  // If Expo FileSystem directories are unavailable (your TestFlight iOS case),
  // fall back to native temp writer.
  if (!baseDir && Platform.OS === 'ios') {
    const mod = await import('rws-xlsx-writer');
    const native = (mod as any).default;
    const ok = await native?.isAvailable?.();
    if (!ok) {
      throw new Error(
        `No writable directory and native writer unavailable (documentDirectory=${String(doc)}, cacheDirectory=${String(cache)})`
      );
    }

    const producedPath: string = await native.writeBase64ToTempFile({ base64, fileName });
    return producedPath.startsWith('file://') ? producedPath : `file://${producedPath}`;
  }

  if (!baseDir) {
    throw new Error(
      `No writable directory (platform=native, documentDirectory=${String(doc)}, cacheDirectory=${String(cache)})`
    );
  }

  const exportDir = baseDir + 'exports/';
  await ensureDir(exportDir);

  const dest = `${exportDir}${fileName}`;

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
