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
  photo_urls: string[]; // public URLs (or blob: URIs fallback)
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

/**
 * Roughly convert Excel column width "characters" to pixels.
 * Excel’s UI width is ~7–8 px per character depending on font/zoom; 7px/char is a common estimate.
 * We use a small padding so images don’t overrun borders. :contentReference[oaicite:0]{index=0}
 */
function colCharsToPixels(chars: number | undefined, pad = 6) {
  const ch = typeof chars === 'number' && chars > 0 ? chars : 10;
  return Math.max(1, Math.floor(ch * 7) - pad);
}

export async function downloadSubmissionExcel(row: SubmissionExcel) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('submission');

  // === Two-column layout (A=label, B=value) ===
  // Keep A moderately narrow for labels, make B wide for values and photos.
  ws.getColumn(1).width = 24; // A (labels)
  ws.getColumn(2).width = 62; // B (values + photos)

  // Thin borders on every visible cell
  const thin = {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    left: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
    right: { style: 'thin', color: { argb: 'FF000000' } },
  } as const;

  // Build rows: strictly two columns
  const rows: Array<[string, string]> = [
    ['DATE', row.date],
    ['STORE LOCATIONS', row.store_location],
    ['LOCATIONS', ''], // present in your PDF; left blank in current form schema
    ['CONDITIONS', row.conditions],
    ['PRICE PER UNIT', row.price_per_unit],
    ['SHELF SPACE', row.shelf_space],
    ['ON SHELF', row.on_shelf],
    ['TAGS', row.tags],
    ['NOTES', row.notes],
    ['PHOTOS', ''],
  ];
  ws.addRows(rows);

  // Style grid
  for (let r = 1; r <= rows.length; r++) {
    const a = ws.getCell(r, 1);
    const b = ws.getCell(r, 2);

    a.border = thin;
    b.border = thin;

    a.alignment = { vertical: 'middle' };              // labels
    b.alignment = { vertical: 'middle', wrapText: true }; // values
  }

  // Right-align numeric-looking PRICE and TAGS values
  if (isNumericLike(rows[4 - 1][1])) ws.getCell(4, 2).alignment = { vertical: 'middle', horizontal: 'right' };
  if (isNumericLike(rows[8 - 1][1])) ws.getCell(8, 2).alignment = { vertical: 'middle', horizontal: 'right' };

  // Give NOTES a little breathing room
  ws.getRow(9).height = 36;

  // === Photos (side-by-side), sized to column widths ===
  // ExcelJS positions images with pixel sizes via { tl, ext }. :contentReference[oaicite:1]{index=1}
  const photosHeaderRow = rows.length;      // "PHOTOS" row (1-based)
  const anchorRowZero = photosHeaderRow;    // zero-based for the top-left anchor

  // Compute pixel widths from the actual column widths so images exactly fit each column.
  const colApx = colCharsToPixels(ws.getColumn(1).width as number); // first (label) column
  const colBpx = colCharsToPixels(ws.getColumn(2).width as number); // second (value) column

  // We’ll keep a consistent aspect ratio; make them “long” like your PDF.
  // Height ~ 0.78 of width gives a nice landscape card look.
  const imgAWidth = colApx;
  const imgBWidth = colBpx;
  const imgAHeight = Math.round(imgAWidth * 0.78);
  const imgBHeight = Math.round(imgBWidth * 0.78);

  const addImageAt = async (url: string, zeroCol: number, width: number, height: number) => {
    const buffer = await fetchImageBuffer(url);
    const imgId = wb.addImage({ buffer, extension: guessExt(url) });
    ws.addImage(imgId, {
      tl: { col: zeroCol, row: anchorRowZero },
      ext: { width, height },
    });
  };

  // Place left photo in column A, right photo in column B — we only have two columns now.
  if (row.photo_urls[0]) await addImageAt(row.photo_urls[0], 0, imgAWidth, imgAHeight);
  if (row.photo_urls[1]) await addImageAt(row.photo_urls[1], 1, imgBWidth, imgBHeight);

  // Export to browser (web)
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
