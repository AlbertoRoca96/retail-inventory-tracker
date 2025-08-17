// apps/mobile/src/lib/exportExcel.ts
import ExcelJS from 'exceljs';

/** Input data for export */
export type SubmissionExcel = {
  date: string;
  store_location: string;
  conditions: string;
  price_per_unit: string; // keep as string for display
  shelf_space: string;
  on_shelf: string;
  tags: string;
  notes: string;
  photo_urls: string[];   // public URLs (we embed up to 2) -- can also be blob: URLs
};

/** Utility: fetch an image URL (public Supabase or blob:) and return { base64, ext } for ExcelJS */
async function fetchAsBase64(url: string): Promise<{ base64: string; ext: 'png' | 'jpeg' }> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
  const blob = await res.blob();
  const ext: 'png' | 'jpeg' = blob.type.includes('png') ? 'png' : 'jpeg';
  const buf = await blob.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  // ExcelJS accepts data-URL format for base64 images
  return { base64: `data:${blob.type};base64,${base64}`, ext };
}

export async function downloadSubmissionExcel(row: SubmissionExcel) {
  const wb = new ExcelJS.Workbook();

  // Worksheet + page setup (tight margins, fit to one page width)
  const ws = wb.addWorksheet('submission', {
    properties: { defaultRowHeight: 18 },
    pageSetup: {
      fitToPage: true,
      fitToWidth: 1,
      orientation: 'portrait',
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  });

  // 4 columns so we can place photos side-by-side in B and D with a small gap at C
  ws.columns = [
    { key: 'label', width: 22 }, // A
    { key: 'value', width: 44 }, // B
    { key: 'gap', width: 2 },    // C (visual gap)
    { key: 'value2', width: 44 } // D (photo 2 column)
  ];

  const border = { top: { style: 'thin' as const }, bottom: { style: 'thin' as const }, left: { style: 'thin' as const }, right: { style: 'thin' as const } };
  const labelStyle = { font: { bold: true }, alignment: { vertical: 'middle' as const }, border };
  const valueStyle = { alignment: { vertical: 'middle' as const }, border };

  let r = 1;
  function addRow(label: string, value: string) {
    ws.getCell(`A${r}`).value = label.toUpperCase();
    Object.assign(ws.getCell(`A${r}`), labelStyle);
    ws.getCell(`B${r}`).value = value || '';
    Object.assign(ws.getCell(`B${r}`), valueStyle);

    // Carry borders across the "gap" and D to form a continuous table
    ws.getCell(`C${r}`).border = border;
    ws.getCell(`D${r}`).border = border;

    r++;
  }

  addRow('DATE', row.date);
  addRow('STORE LOCATION', row.store_location);
  addRow('CONDITIONS', row.conditions);
  addRow('PRICE PER UNIT', row.price_per_unit);
  addRow('SHELF SPACE', row.shelf_space);
  addRow('ON SHELF', row.on_shelf);
  addRow('TAGS', row.tags);
  addRow('NOTES', row.notes);

  // PHOTOS header row across A:D to match the PDF
  ws.mergeCells(`A${r}:D${r}`);
  const hdr = ws.getCell(`A${r}`);
  hdr.value = 'PHOTOS';
  hdr.font = { bold: true };
  hdr.alignment = { vertical: 'middle', horizontal: 'left' };
  hdr.border = border;
  r++;

  // Prepare a bordered area under PHOTOS (so it prints like a table)
  const imageTopRow = r;
  const rowsForImages = 18; // adjusts printable area height under the photos
  for (let rr = imageTopRow; rr < imageTopRow + rowsForImages; rr++) {
    ws.getCell(`A${rr}`).border = border;
    ws.getCell(`B${rr}`).border = border;
    ws.getCell(`C${rr}`).border = border;
    ws.getCell(`D${rr}`).border = border;
  }

  // Place two images side-by-side (B column and D column), scaled smaller
  const urls = (row.photo_urls || []).slice(0, 2);

  const settled = await Promise.allSettled(urls.map((u) => fetchAsBase64(u)));
  const base64s = settled
    .filter((res): res is PromiseFulfilledResult<{ base64: string; ext: 'png' | 'jpeg' }> => res.status === 'fulfilled')
    .map((res) => res.value);

  if (base64s[0]) {
    const id = wb.addImage({ base64: base64s[0].base64, extension: base64s[0].ext });
    // Columns are zero-based in the image anchor: 0=A, 1=B, 2=C, 3=D
    ws.addImage(id, {
      tl: { col: 1, row: imageTopRow - 1 }, // start at B{imageTopRow}
      ext: { width: 360, height: 230 },     // smaller so they sit side-by-side
    });
  }
  if (base64s[1]) {
    const id = wb.addImage({ base64: base64s[1].base64, extension: base64s[1].ext });
    ws.addImage(id, {
      tl: { col: 3, row: imageTopRow - 1 }, // D{imageTopRow}
      ext: { width: 360, height: 230 },
    });
  }

  // Slightly increase the rows covering the image area so the table looks neat
  for (let rr = imageTopRow; rr < imageTopRow + rowsForImages; rr++) {
    ws.getRow(rr).height = 18; // consistent lines
  }

  // Download in the browser
  const buffer = await wb.xlsx.writeBuffer(); // ExcelJS browser API
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const fname = `submission-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  a.click();
  URL.revokeObjectURL(a.href);
}
