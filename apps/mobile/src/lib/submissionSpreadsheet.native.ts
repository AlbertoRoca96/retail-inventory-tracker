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

// Note: we keep the old signature (submissionId, fileBase) for compatibility,
// but we ignore submissionId because everything is built from the payload.
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
