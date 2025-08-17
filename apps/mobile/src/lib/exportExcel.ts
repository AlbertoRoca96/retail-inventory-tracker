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

/**
 * Load any image URL (http/https/blob/data), draw to a canvas (dropping EXIF),
 * and return raw base64 (no data: prefix). We use JPEG to keep size down.
 */
async function toCanvasBase64(url: string): Promise<string> {
  let srcForImg = url;

  // For http(s) fetch → blob → objectURL to avoid CORS-tainted canvas
  if (/^https?:/i.test(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
    const blob = await res.blob();
    srcForImg = URL.createObjectURL(blob);
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = srcForImg;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || (img.width as number);
  canvas.height = img.naturalHeight || (img.height as number);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  if (srcForImg.startsWith('blob:') && srcForImg !== url) {
    URL.revokeObjectURL(srcForImg);
  }

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  return dataUrl.split(',')[1] || '';
}

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

  // Keep the original layout
  ws.columns = [
    { key: 'label', width: 22 }, // A
    { key: 'value', width: 44 }, // B
    { key: 'gap',   width: 2  }, // C (visual gap)
    { key: 'value2',width: 44 }, // D
  ];

  const border = {
    top: { style: 'thin' as const },
    bottom: { style: 'thin' as const },
    left: { style: 'thin' as const },
    right: { style: 'thin' as const },
  };
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

  // PHOTOS header row across A:D
  ws.mergeCells(`A${r}:D${r}`);
  const hdr = ws.getCell(`A${r}`);
  hdr.value = 'PHOTOS';
  hdr.font = { bold: true };
  hdr.alignment = { vertical: 'middle', horizontal: 'left' };
  hdr.border = border;
  r++;

  // Bordered area under PHOTOS
  const imageTopRow = r;
  const rowsForImages = 18; // same height as before
  const imageBottomRow = imageTopRow + rowsForImages - 1;

  for (let rr = imageTopRow; rr <= imageBottomRow; rr++) {
    ws.getCell(`A${rr}`).border = border;
    ws.getCell(`B${rr}`).border = border;
    ws.getCell(`C${rr}`).border = border;
    ws.getCell(`D${rr}`).border = border;
    ws.getRow(rr).height = 18; // consistent lines (portrait layout)
  }

  // Load up to 2 photos (don’t fail the whole export if one image errors)
  const urls = (row.photo_urls || []).slice(0, 2);
  const settled = await Promise.allSettled(urls.map(toCanvasBase64));
  const base64s = settled
    .filter((s): s is PromiseFulfilledResult<string> => s.status === 'fulfilled')
    .map((s) => s.value);

  // Anchor each image to a CELL RANGE so Excel stretches it to the box.
  // Left photo fills column B rows [imageTopRow .. imageBottomRow]
  if (base64s[0]) {
    const id = wb.addImage({ base64: base64s[0], extension: 'jpeg' });
    ws.addImage(id, `B${imageTopRow}:B${imageBottomRow}`); // fits the left box exactly
  }
  // Right photo fills column D rows [imageTopRow .. imageBottomRow]
  if (base64s[1]) {
    const id = wb.addImage({ base64: base64s[1], extension: 'jpeg' });
    ws.addImage(id, `D${imageTopRow}:D${imageBottomRow}`); // fits the right box exactly
  }

  // Download in the browser
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const fname = `submission-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  a.click();
  URL.revokeObjectURL(a.href);
}
