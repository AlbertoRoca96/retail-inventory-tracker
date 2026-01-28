// apps/mobile/src/lib/submissionSpreadsheet.native.ts
// Native helpers for building the submission spreadsheet locally (HTML .xls)
// and either sharing it or returning the local file path so it can be
// attached to chat. This avoids relying on the submission-xlsx edge function
// and keeps behavior consistent with the web HTML/Excel export.

import { Alert } from 'react-native';
import { shareFileNative } from './shareFile.native';
import {
  buildSubmissionSpreadsheetFile,
  SubmissionSpreadsheet,
} from './exportSpreadsheet.native';

function sanitizeFileBase(input: string): string {
  const base = (input || '').trim() || 'submission';
  return base
    .replace(/[\\/?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

export async function shareSubmissionSpreadsheetFromEdge(
  // kept signature for backwards compatibility, but we only need fileBase
  _submissionId: string,
  fileBase: string,
  payload?: SubmissionSpreadsheet
) {
  try {
    if (!payload) {
      throw new Error('Spreadsheet payload missing');
    }

    const dest = await buildSubmissionSpreadsheetFile(payload, {
      fileNamePrefix: sanitizeFileBase(fileBase),
    });

    await shareFileNative(dest, {
      mimeType: 'application/vnd.ms-excel',
      dialogTitle: 'Share spreadsheet',
      uti: 'com.microsoft.excel.xls',
      message: 'Submission spreadsheet attached.',
    });
  } catch (err: any) {
    Alert.alert('Spreadsheet failed', err?.message ?? 'Unable to generate spreadsheet.');
    throw err;
  }
}

export async function downloadSubmissionSpreadsheetToPath(
  // kept signature for backwards compatibility
  _submissionId: string,
  fileBase: string,
  payload: SubmissionSpreadsheet
): Promise<string> {
  const dest = await buildSubmissionSpreadsheetFile(payload, {
    fileNamePrefix: sanitizeFileBase(fileBase),
  });
  return dest;
}

export default { shareSubmissionSpreadsheetFromEdge, downloadSubmissionSpreadsheetToPath };
