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

// Excel column width → approx pixels (Calibri 11 ≈ 7 px per “character” + padding)
const colWidthToPx = (w: number | undefined) => Math.max(0, Math.floor((w ?? 10) * 7 + 5));

export async function downloadSubmissionExcel(row: SubmissionExcel) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('submission');

  // --- EXACTLY TWO COLUMNS (A=label, B=value/photos) ---
  ws.getColumn(1).width = 22; // A (labels)
  ws.getColumn(2).width = 64; // B (values + right photo)

  const thin = {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    left: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
    right: { style: 'thin', color: { argb: 'FF000000' } },
  } as const;

  // Rows: two columns only
  const rows: Array<[string, string]> = [
    ['DATE', row.date],
    ['STORE LOCATIONS', row.store_location],
    ['LOCATIONS', ''], // reserved row to match your PDF layout
    ['CONDITIONS', row.conditions],
    ['PRICE PER UNIT', row.price_per_unit],
    ['SHELF SPACE', row.shelf_space],
    ['ON SHELF', row.on_shelf],
    ['TAGS', row.tags],
    ['NOTES', row.notes],
    ['PHOTOS', ''],
  ];
  ws.addRows(rows);

  // Style cells (grid + wrapping)
  for (let r = 1; r <= rows.length; r++) {
    const a = ws.getCell(r, 1);
    const b = ws.getCell(r, 2);
    a.alignment = { vertical: 'middle' }; // labels plain (not bold) to match your PDF
    b.alignment = { vertical: 'middle', wrapText: true };
    a.border = thin;
    b.border = thin;
  }

  // Right-align numeric-looking values for PRICE PER UNIT (row 5) and TAGS (row 8)
  if (isNumericLike(rows[5 - 1][1])) ws.getCell(5, 2).alignment = { vertical: 'middle', horizontal: 'right' };
  if (isNumericLike(rows[8 - 1][1])) ws.getCell(8, 2).alignment = { vertical: 'middle', horizontal: 'right' };

  // Make NOTES a bit taller for readability
  ws.getRow(9).height = 36;

  // --- PHOTOS: two images side-by-side under the "PHOTOS" row ---
  // Left photo should fit column A width; right photo should fit column B width.
  const photosHeaderRow = rows.length;          // "PHOTOS" row index (1-based)
  const anchorRowZero = photosHeaderRow;        // zero-based row to anchor images just below the row
  const leftImgWidthPx = colWidthToPx(ws.getColumn(1).width) - 6; // small padding so borders show
  const rightImgWidthPx = colWidthToPx(ws.getColumn(2).width) - 6;
  const imageHeightPx = 300;                    // height similar to your PDF screenshots

  const addImageAt = async (url: string, zeroCol: number, widthPx: number) => {
    const buffer = await fetchImageBuffer(url);
    const imgId = wb.addImage({ buffer, extension: guessExt(url) });
    ws.addImage(imgId, {
      tl: { col: zeroCol, row: anchorRowZero }, // A=0, B=1
      ext: { width: widthPx, height: imageHeightPx },
    });
  };

  if (row.photo_urls[0]) await addImageAt(row.photo_urls[0], 0, leftImgWidthPx);   // left image in column A
  if (row.photo_urls[1]) await addImageAt(row.photo_urls[1], 1, rightImgWidthPx);  // right image in column B

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
