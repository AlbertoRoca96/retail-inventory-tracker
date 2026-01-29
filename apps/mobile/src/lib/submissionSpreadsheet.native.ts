// apps/mobile/src/lib/submissionSpreadsheet.native.ts
// Native helpers for building the submission XLSX locally with ExcelJS
// (6 embedded photos, 2x3 grid) and either sharing it or returning the
// file path so it can be attached to chat.

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

// We keep the original signature (submissionId, fileBase, payload) so callers
// don't need to change, but submissionId is not used here. Everything is
// derived from the payload and built locally.
export async function shareSubmissionSpreadsheetFromEdge(
  _submissionId: string,
  fileBase: string,
  payload?: SubmissionSpreadsheet
) {
  try {
    if (!payload) throw new Error('Spreadsheet payload missing');

    const dest = await buildSubmissionSpreadsheetFile(payload, {
      fileNamePrefix: sanitizeFileBase(fileBase),
    });

    await shareFileNative(dest, {
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
