// apps/mobile/src/lib/exportExcel.ts
import ExcelJS from 'exceljs';

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

// Convert a URL to base64 for ExcelJS images
async function urlToBase64(url: string): Promise<{ base64: string; ext: 'png' | 'jpeg' }> {
  const res = await fetch(url);
  const blob = await res.blob();
  // ExcelJS supports png/jpeg
  const ext: 'png' | 'jpeg' = blob.type.includes('png') ? 'png' : 'jpeg';
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
  const base64 = dataUrl.split(',')[1] ?? '';
  return { base64, ext };
}

export async function downloadSubmissionExcel(row: SubmissionExcel) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('submission');

  // Columns
  ws.columns = [{ header: 'Field', width: 20 }, { header: 'Value', width: 60 }];

  // Rows
  const rows = [
    { Field: 'DATE', Value: row.date },
    { Field: 'STORE LOCATION', Value: row.store_location },
    { Field: 'CONDITIONS', Value: row.conditions },
    { Field: 'PRICE PER UNIT', Value: row.price_per_unit },
    { Field: 'SHELF SPACE', Value: row.shelf_space },
    { Field: 'ON SHELF', Value: row.on_shelf },
    { Field: 'TAGS', Value: row.tags },
    { Field: 'NOTES', Value: row.notes },
  ];
  rows.forEach((r) => ws.addRow([r.Field, r.Value]));

  // Leave a blank row, then write "PHOTOS"
  const startRow = ws.lastRow ? ws.lastRow.number + 2 : 12;
  ws.getCell(`A${startRow}`).value = 'PHOTOS';
  ws.getCell(`A${startRow}`).font = { bold: true };

  // Embed up to 2 images
  const targets = row.photo_urls.slice(0, 2);
  let topRow = startRow + 1;

  for (let i = 0; i < targets.length; i++) {
    try {
      const { base64, ext } = await urlToBase64(targets[i]);
      const id = wb.addImage({ base64, extension: ext }); // ExcelJS API
      // Place each image in a 10x16-ish cell region; adjust as you prefer
      const from = `B${topRow}`;
      const to = `E${topRow + 15}`;
      ws.addImage(id, `${from}:${to}`);
      topRow += 17;
    } catch {
      // If an image fetch fails, just skip it
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const fname = `submission-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
