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

// Tiny helper to fetch an image as ArrayBuffer for ExcelJS (browser)
async function fetchImageBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url}`);
  return await res.arrayBuffer();
}

function guessExt(url: string): 'png' | 'jpeg' {
  const u = url.toLowerCase();
  return u.endsWith('.png') ? 'png' : 'jpeg';
}

export async function downloadSubmissionExcel(row: SubmissionExcel) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('submission');

  // --- Layout: 3-column grid like the PDF ---
  // A = label, B = main value, C = numeric/right column (e.g., price)
  ws.getColumn(1).width = 20; // A
  ws.getColumn(2).width = 44; // B
  ws.getColumn(3).width = 16; // C

  // Helper: thin black border for all table cells
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    left: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
    right: { style: 'thin', color: { argb: 'FF000000' } },
  } as const;

  // Build rows (no "Field/Value" header row; matches the PDF-style grid)
  // Most rows merge B:C; PRICE PER UNIT keeps value in C aligned right.
  const rows: Array<[string, string, string?]> = [
    ['DATE', row.date, ''],
    ['STORE LOCATION', row.store_location, ''],
    ['CONDITIONS', row.conditions, ''],
    ['PRICE PER UNIT', '', row.price_per_unit],
    ['SHELF SPACE', row.shelf_space, ''],
    ['ON SHELF', row.on_shelf, ''],
    ['TAGS', row.tags, ''],
    ['NOTES', row.notes, ''],
    ['PHOTOS', '', ''],
  ];

  ws.addRows(rows);

  // Style the grid
  const lastRow = rows.length;
  for (let r = 1; r <= lastRow; r++) {
    // Labels bold, vertically centered
    const a = ws.getCell(r, 1);
    a.font = { bold: true };
    a.alignment = { vertical: 'middle' };
    a.border = thinBorder;

    // Values column (B)
    const b = ws.getCell(r, 2);
    b.alignment = { vertical: 'middle', wrapText: true };
    b.border = thinBorder;

    // Right column (C)
    const c = ws.getCell(r, 3);
    c.alignment = { vertical: 'middle' };
    c.border = thinBorder;

    // Merge B:C for all rows except explicit right-column ones
    // Keep PRICE PER UNIT (row 4) unmerged so its value sits in C like the PDF.
    if (![4, 9].includes(r)) {
      ws.mergeCells(r, 2, r, 3); // B:r .. C:r
      // After merge, keep left/top alignment and border on the merged cell
      ws.getCell(r, 2).alignment = { vertical: 'middle', wrapText: true };
      ws.getCell(r, 2).border = thinBorder;
    }
  }

  // Special formatting
  // - PRICE PER UNIT right-aligned in column C
  ws.getCell(4, 3).alignment = { vertical: 'middle', horizontal: 'right' };

  // - NOTES row: give a bit more height so wrapped text looks nice
  ws.getRow(8).height = 36;

  // --- Photos below the "PHOTOS" row, placed side-by-side in B and C ---
  const photoRowIndex = 9; // "PHOTOS" row index (1-based)
  const startImageRow = photoRowIndex; // anchor at the PHOTOS row
  const imageHeight = 220;
  const imageWidth = 285; // sized to the B/C columns

  const addImageAt = async (url: string, colZeroBased: number, rowZeroBased: number) => {
    const buffer = await fetchImageBuffer(url);
    const imgId = wb.addImage({ buffer, extension: guessExt(url) });
    ws.addImage(imgId, {
      tl: { col: colZeroBased, row: rowZeroBased },
      ext: { width: imageWidth, height: imageHeight },
    });
  };

  // Put first photo in column B (index 1 zero-based) and second in column C (index 2)
  if (row.photo_urls[0]) {
    await addImageAt(row.photo_urls[0], 1, startImageRow); // B
  }
  if (row.photo_urls[1]) {
    await addImageAt(row.photo_urls[1], 2, startImageRow); // C
  }

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
