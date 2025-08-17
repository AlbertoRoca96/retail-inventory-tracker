import * as XLSX from 'xlsx';

type FlatRow = Record<string, string | number | boolean | null | undefined>;

export function exportSubmissionToXLSX(rows: FlatRow[], filename = 'submissions.xlsx') {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Submissions');
  // On web, this triggers a download; on native it writes to the FS (if available)
  XLSX.writeFile(wb, filename);
}
