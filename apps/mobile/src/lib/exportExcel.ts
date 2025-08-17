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

  // Layout: make room for two photos side by side (B and D), with a spacer C
  ws.getColumn(1).width = 18; // A: "Field"
  ws.getColumn(2).width = 48; // B: value / first photo
  ws.getColumn(3).width = 4;  // C: spacer
  ws.getColumn(4).width = 48; // D: second photo

  // Header + fields
  const rows = [
    ['Field', 'Value'],
    ['DATE', row.date],
    ['STORE LOCATION', row.store_location],
    ['CONDITIONS', row.conditions],
    ['PRICE PER UNIT', row.price_per_unit],
    ['SHELF SPACE', row.shelf_space],
    ['ON SHELF', row.on_shelf],
    ['TAGS', row.tags],
    ['NOTES', row.notes],
    ['PHOTOS', ''],
  ];
  ws.addRows(rows);

  const photosRowIndex = rows.length; // 1-based row index where "PHOTOS" is
  const startRowForImages = photosRowIndex; // place images just below the header cell
  const imageHeight = 220;
  const imageWidth = 300;

  // Add up to two images side-by-side
  const addImageAt = async (url: string, colIdxZeroBased: number, rowIdxZeroBased: number) => {
    const buffer = await fetchImageBuffer(url);
    const imgId = wb.addImage({ buffer, extension: guessExt(url) });
    ws.addImage(imgId, {
      tl: { col: colIdxZeroBased, row: rowIdxZeroBased },
      ext: { width: imageWidth, height: imageHeight },
    });
  };

  // B column (= 1 zero-based), D column (= 3 zero-based)
  if (row.photo_urls[0]) {
    await addImageAt(row.photo_urls[0], 1, startRowForImages); // B
  }
  if (row.photo_urls[1]) {
    await addImageAt(row.photo_urls[1], 3, startRowForImages); // D
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
