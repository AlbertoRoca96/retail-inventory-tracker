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

// Fetch an image as ArrayBuffer for ExcelJS (browser)
async function fetchImageBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url}`);
  return await res.arrayBuffer();
}

function guessExt(url: string): 'png' | 'jpeg' {
  const u = url.toLowerCase();
  return u.endsWith('.png') ? 'png' : 'jpeg';
}

function isNumericLike(s: string): boolean {
  if (!s) return false;
  const n = Number(s);
  return Number.isFinite(n);
}

export async function downloadSubmissionExcel(row: SubmissionExcel) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('submission');

  // --- Layout to mirror the PDF ---
  // A = label (narrower), B = spacer / left image column, C = value / right image column
  ws.getColumn(1).width = 22; // A
  ws.getColumn(2).width = 44; // B
  ws.getColumn(3).width = 44; // C

  // Thin borders on every cell in the table
  const thin = {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    left: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
    right: { style: 'thin', color: { argb: 'FF000000' } },
  } as const;

  // Build rows: put ALL values into column C; keep column B intentionally empty (spacer),
  // so the sheet looks exactly like the PDF screenshot.
  const rows: Array<[string, string, string]> = [
    ['DATE', '', row.date],
    ['STORE LOCATIONS', '', row.store_location],
    // "LOCATIONS" row exists in the PDF; we include it (blank if not provided in the current schema)
    ['LOCATIONS', '', ''],
    ['CONDITIONS', '', row.conditions],
    ['PRICE PER UNIT', '', row.price_per_unit],
    ['SHELF SPACE', '', row.shelf_space],
    ['ON SHELF', '', row.on_shelf],
    ['TAGS', '', row.tags],
    ['NOTES', '', row.notes],
    ['PHOTOS', '', ''],
  ];
  ws.addRows(rows);

  // Style rows
  for (let r = 1; r <= rows.length; r++) {
    // Label cell
    const a = ws.getCell(r, 1);
    a.alignment = { vertical: 'middle' }; // (labels not bold to match the PDF feel)
    a.border = thin;

    // Spacer cell (B) — draw borders so the grid shows, but keep empty
    const b = ws.getCell(r, 2);
    b.alignment = { vertical: 'middle' };
    b.border = thin;

    // Value cell (C)
    const c = ws.getCell(r, 3);
    c.alignment = { vertical: 'middle', wrapText: true }; // wrap for long notes/conditions
    c.border = thin;
  }

  // Right-align numeric-looking fields in column C like the PDF
  if (isNumericLike(rows[4 - 1][2])) ws.getCell(4, 3).alignment = { vertical: 'middle', horizontal: 'right' }; // PRICE PER UNIT
  if (isNumericLike(rows[8 - 1][2])) ws.getCell(8, 3).alignment = { vertical: 'middle', horizontal: 'right' }; // TAGS

  // Make NOTES a bit taller for readability
  ws.getRow(9).height = 36;

  // --- Photos side-by-side under PHOTOS (columns B and C) ---
  // ExcelJS image position uses zero-based col/row via `tl` (top-left) and pixel size via `ext`.
  // We'll anchor both images at the PHOTOS row so they sit directly below it.
  const photosHeaderRow = rows.length; // "PHOTOS" row index (1-based)
  const anchorRowZero = photosHeaderRow; // zero-based row anchor
  const imageHeight = 280; // adjust to taste
  const imageWidth = 360;  // fits each B/C column nicely

  const addImageAt = async (url: string, zeroCol: number, zeroRow: number) => {
    const buffer = await fetchImageBuffer(url);
    const imgId = wb.addImage({ buffer, extension: guessExt(url) });
    ws.addImage(imgId, {
      tl: { col: zeroCol, row: zeroRow },
      ext: { width: imageWidth, height: imageHeight },
    });
  };

  // Left photo in column B (index 1 zero-based); right photo in column C (index 2)
  if (row.photo_urls[0]) await addImageAt(row.photo_urls[0], 1, anchorRowZero);
  if (row.photo_urls[1]) await addImageAt(row.photo_urls[1], 2, anchorRowZero);

  // Export to browser
  const fname = `submission-${new Date().toISOString().replace(/[:]/g, '-')}.xlsx`;
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  a.click();
  URL.revokeObjectURL(url);
}
