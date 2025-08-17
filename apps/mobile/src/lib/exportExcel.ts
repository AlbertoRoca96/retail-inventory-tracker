// apps/mobile/src/lib/exportExcel.ts
import * as XLSX from 'xlsx';

export type SubmissionExcel = {
  date: string;
  store_location: string;
  conditions: string;
  price_per_unit: string;
  shelf_space: string;
  on_shelf: string;
  tags: string;
  notes: string;
  photo_urls: string[]; // public URLs
};

export function downloadSubmissionExcel(row: SubmissionExcel) {
  const rows = [
    { Field: 'DATE', Value: row.date },
    { Field: 'STORE LOCATION', Value: row.store_location },
    { Field: 'CONDITIONS', Value: row.conditions },
    { Field: 'PRICE PER UNIT', Value: row.price_per_unit },
    { Field: 'SHELF SPACE', Value: row.shelf_space },
    { Field: 'ON SHELF', Value: row.on_shelf },
    { Field: 'TAGS', Value: row.tags },
    { Field: 'NOTES', Value: row.notes },
    { Field: 'PHOTOS', Value: row.photo_urls.join(' | ') }
  ];

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Submission');

  // File name includes date-time
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const fname = `submission-${ts}.xlsx`;

  // Triggers a browser download
  XLSX.writeFile(wb, fname);
}
