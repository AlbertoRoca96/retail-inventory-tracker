// apps/mobile/src/lib/submissionSpreadsheet.native.ts
// Native helpers for fetching the submission XLSX from Supabase Edge Function
// `submission-xlsx`, saving it locally, and either sharing it or returning the
// path so it can be attached to chat.

import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';
import { shareFileNative } from './shareFile.native';
import { supabase, resolvedSupabaseUrl } from './supabase';

const EDGE_FUNCTION_NAME = 'submission-xlsx';

function sanitizeFileBase(input: string): string {
  const base = (input || '').trim() || 'submission';
  return base
    .replace(/[\\/?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

async function fetchSubmissionXlsxFromEdge(submissionId: string, fileBase: string) {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !sessionData.session?.access_token) {
    throw new Error('Not authenticated; please log in again.');
  }
  const token = sessionData.session.access_token;

  if (!resolvedSupabaseUrl) {
    throw new Error('Supabase URL not configured.');
  }

  const url = `${resolvedSupabaseUrl}/functions/v1/${EDGE_FUNCTION_NAME}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ submission_id: submissionId }),
  });

  if (!res.ok) {
    let msg = `Edge function failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = String(body.error);
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  const arrayBuffer = await res.arrayBuffer();
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error('Received empty XLSX from server.');
  }

  const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!baseDir) throw new Error('No writable directory available on device.');

  const exportDir = baseDir + 'exports/';
  await FileSystem.makeDirectoryAsync(exportDir, { intermediates: true }).catch(() => {});

  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${sanitizeFileBase(fileBase)}-${iso}.xlsx`;
  const dest = exportDir + fileName;

  const bytes = new Uint8Array(arrayBuffer);
  const b64 = Buffer.from(bytes).toString('base64');
  await FileSystem.writeAsStringAsync(dest, b64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return dest;
}

export async function shareSubmissionSpreadsheetFromEdge(
  submissionId: string,
  fileBase: string
) {
  try {
    const path = await fetchSubmissionXlsxFromEdge(submissionId, fileBase);
    await shareFileNative(path, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Share spreadsheet',
      uti: 'org.openxmlformats.spreadsheetml.sheet',
      message: 'Submission spreadsheet attached.',
    });
  } catch (err: any) {
    Alert.alert('Spreadsheet failed', err?.message ?? 'Unable to generate spreadsheet.');
    throw err;
  }
}

export async function downloadSubmissionSpreadsheetToPath(
  submissionId: string,
  fileBase: string
): Promise<string> {
  return fetchSubmissionXlsxFromEdge(submissionId, fileBase);
}

export default { shareSubmissionSpreadsheetFromEdge, downloadSubmissionSpreadsheetToPath };
