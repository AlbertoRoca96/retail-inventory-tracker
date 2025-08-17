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
  photo_urls: string[]; // embed up to 2
};

// ---- helpers -------------------------------------------------------------

/** Load any image URL (http/https/blob/data), rasterize via canvas (EXIF dropped),
 *  and return { base64 (raw), width, height } for ExcelJS. */
async function toCanvasBase64(
  url: string
): Promise<{ base64: string; w: number; h: number }> {
  let srcForImg = url;

  // For http(s) we fetch → blob → objectURL to avoid CORS-tainted canvas.
  if (/^https?:/i.test(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
    const blob = await res.blob();
    srcForImg = URL.createObjectURL(blob);
  }

  // Create and load <img> (browsers render EXIF orientation for display)
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = srcForImg;
  });

  // Draw exactly as displayed into a canvas to strip EXIF for good.
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  // Clean up any object URL we created.
  if (srcForImg.startsWith('blob:') && srcForImg !== url) {
    URL.revokeObjectURL(srcForImg);
  }

  // Re-encode to JPEG; ExcelJS expects raw base64 (no prefix).
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const b64 = dataUrl.split(',')[1] || '';
  return { base64: b64, w: canvas.width, h: canvas.height };
}

// ---- main ---------------------------------------------------------------

export async function downloadSubmissionExcel(row: SubmissionExcel) {
  const wb = new ExcelJS.Workbook();

  const ws = wb.addWorksheet('submission', {
    properties: { defaultRowHeight: 18 },
    pageSetup: {
      fitToPage: true,
      fitToWidth: 1,
      orientation: 'portrait',
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  });

  // Keep your original layout
  ws.columns = [
    { key: 'label', width: 22 }, // A
    { key: 'value', width: 44 }, // B
    { key: 'gap',   width: 2  }, // C
    { key: 'value2',width: 44 }, // D
  ];

  const border = { top: { style: 'thin' as const }, bottom: { style: 'thin' as const }, left: { style: 'thin' as const }, right: { style: 'thin' as const } };
  const labelStyle = { font: { bold: true }, alignment: { vertical: 'middle' as const }, border };
  const valueStyle = { alignment: { vertical: 'middle' as const }, border };

  let r = 1;
  const addRow = (label: string, value: string) => {
    ws.getCell(`A${r}`).value = label.toUpperCase();
    Object.assign(ws.getCell(`A${r}`), labelStyle);
    ws.getCell(`B${r}`).value = value || '';
    Object.assign(ws.getCell(`B${r}`), valueStyle);
    ws.getCell(`C${r}`).border = border;
    ws.getCell(`D${r}`).border = border;
    r++;
  };

  addRow('DATE', row.date);
  addRow('STORE LOCATION', row.store_location);
  addRow('CONDITIONS', row.conditions);
  addRow('PRICE PER UNIT', row.price_per_unit);
  addRow('SHELF SPACE', row.shelf_space);
  addRow('ON SHELF', row.on_shelf);
  addRow('TAGS', row.tags);
  addRow('NOTES', row.notes);

  // PHOTOS header
  ws.mergeCells(`A${r}:D${r}`);
  const hdr = ws.getCell(`A${r}`);
  hdr.value = 'PHOTOS';
  hdr.font = { bold: true };
  hdr.alignment = { vertical: 'middle', horizontal: 'left' };
  hdr.border = border;
  r++;

  // Bordered area below PHOTOS
  const imageTopRow = r;
  const rowsForImages = 18;
  for (let rr = imageTopRow; rr < imageTopRow + rowsForImages; rr++) {
    ws.getCell(`A${rr}`).border = border;
    ws.getCell(`B${rr}`).border = border;
    ws.getCell(`C${rr}`).border = border;
    ws.getCell(`D${rr}`).border = border;
  }

  // Scale to fit these boxes
  const MAX_W = 360;
  const MAX_H = 230;

  // Load up to 2 photos; be resilient if one fails
  const urls = (row.photo_urls || []).slice(0, 2);
  const settled = await Promise.allSettled(urls.map(toCanvasBase64));
  const imgs = settled
    .filter((s): s is PromiseFulfilledResult<{ base64: string; w: number; h: number }> => s.status === 'fulfilled')
    .map((s) => s.value);

  const place = (i: 0 | 1) => {
    const img = imgs[i];
    if (!img) return;
    const scale = Math.min(MAX_W / img.w, MAX_H / img.h, 1);
    const w = Math.round(img.w * scale);
    const h = Math.round(img.h * scale);
    const id = wb.addImage({ base64: img.base64, extension: 'jpeg' });
    ws.addImage(id, {
      tl: { col: i === 0 ? 1 : 3, row: imageTopRow - 1 }, // B or D
      ext: { width: w, height: h },
    });
  };

  place(0);
  place(1);

  for (let rr = imageTopRow; rr < imageTopRow + rowsForImages; rr++) {
    ws.getRow(rr).height = 18;
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const fname = `submission-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  a.click();
  URL.revokeObjectURL(a.href);
}
