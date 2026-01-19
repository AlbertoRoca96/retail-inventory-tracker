// apps/mobile/src/lib/shareCsv.native.ts
// NOTE: Despite the name, this now shares a REAL Excel spreadsheet (.xlsx)
// with embedded photos, not a CSV. Existing call sites that use this for
// "Share CSV" will transparently get the XLSX export instead.

import type { SubmissionSpreadsheet } from './exportSpreadsheet.native';
import { downloadSubmissionSpreadsheet } from './exportSpreadsheet.native';

export async function shareCsvNative(
  submission: SubmissionSpreadsheet,
  fileNamePrefix = 'submission'
) {
  await downloadSubmissionSpreadsheet(submission, {
    fileNamePrefix,
  });
}

export const shareSpreadsheetNative = shareCsvNative;

export default { shareCsvNative, shareSpreadsheetNative };
