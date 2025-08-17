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

// Excel column width (chars) -> ~pixels (Calibri 11 ≈ 7px/char + padding)
const colWidthToPx = (w: number | undefined) => Math.max(0, Math.floor((w ?? 10) * 7 + 5));

export async function downloadSubmissionExcel(row: SubmissionExcel) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('submission');

  // === EXACTLY TWO EQUAL-WIDTH COLUMNS ===
  const COL_WIDTH = 46;         // same width for A and B to mirror the PDF
  ws.getColumn(1).width = COL_WIDTH; // A: labels (also left photo)
  ws.getColumn(2).width = COL_WIDTH; // B: values (also right photo)

  const thin = {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    left: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
    right: { style: 'thin', color: { argb: 'FF000000' } },
  } as const;

  // Two-column grid
  const rows: Array<[string, string]> = [
    ['DATE', row.date],
    ['STORE LOCATIONS', row.store_location],
    ['LOCATIONS', ''], // placeholder to match the PDF row (kept blank for now)
    ['CONDITIONS', row.conditions],
    ['PRICE PER UNIT', row.price_per_unit],
    ['SHELF SPACE', row.shelf_space],
    ['ON SHELF', row.on_shelf],
    ['TAGS', row.tags],
    ['NOTES', row.notes],
    ['PHOTOS', ''],
  ];
  ws.addRows(rows);

  // Borders + wrapping
  for (let r = 1; r <= rows.length; r++) {
    const a = ws.getCell(r, 1);
    const b = ws.getCell(r, 2);
    a.alignment = { vertical: 'middle' };            // keep labels plain like the PDF
    b.alignment = { vertical: 'middle', wrapText: true };
    a.border = thin;
    b.border = thin;
  }

  // Right-align numeric-looking entries (PRICE PER UNIT row 5, TAGS row 8)
  if (isNumericLike(rows[5 - 1][1])) ws.getCell(5, 2).alignment = { vertical: 'middle', horizontal: 'right' };
  if (isNumericLike(rows[8 - 1][1])) ws.getCell(8, 2).alignment = { vertical: 'middle', horizontal: 'right' };

  // Slightly taller NOTES for readability
  ws.getRow(9).height = 36;

  // === PHOTOS sized to *column widths* and placed under "PHOTOS" ===
  const photosHeaderRow = rows.length;   // 1-based
  const anchorRowZero = photosHeaderRow; // zero-based for image anchor

  const leftImgWidthPx = colWidthToPx(ws.getColumn(1).width) - 6;  // small padding inside borders
  const rightImgWidthPx = colWidthToPx(ws.getColumn(2).width) - 6;
  const imageHeightPx = 300; // tune if you want a bit taller/shorter

  const addImageAt = async (url: string, zeroCol: number, widthPx: number) => {
    const buffer = await fetchImageBuffer(url);
    const id = wb.addImage({ buffer, extension: guessExt(url) });
    ws.addImage(id, {
      tl: { col: zeroCol, row: anchorRowZero }, // A=0, B=1
      ext: { width: widthPx, height: imageHeightPx },
    });
  };

  if (row.photo_urls[0]) await addImageAt(row.photo_urls[0], 0, leftImgWidthPx);   // left photo in A
  if (row.photo_urls[1]) await addImageAt(row.photo_urls[1], 1, rightImgWidthPx);  // right photo in B

  // Download
  const fname = `submission-${new Date().toISOString().replace(/[:]/g, '-')}.xlsx`;
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  a.click();
  URL.revokeObjectURL(url);
}
