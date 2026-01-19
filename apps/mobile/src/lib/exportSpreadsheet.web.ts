// apps/mobile/src/lib/exportSpreadsheet.web.ts
// Web-only spreadsheet export that wraps the existing ExcelJS-based exporter
// to produce a real XLSX file with embedded images.

import { downloadSubmissionExcel, SubmissionExcel } from './exportExcel';

export async function downloadSubmissionSpreadsheet(
  row: SubmissionExcel,
  opts: { fileNamePrefix?: string } = {}
) {
  return downloadSubmissionExcel(row, opts);
}

export type { SubmissionExcel } from './exportExcel';

export default { downloadSubmissionSpreadsheet };
