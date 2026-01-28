import ExcelJS from 'exceljs';

export type SubmissionExcel = {
  store_site: string;

  date: string;
  brand: string;
  store_location: string;
  location: string;
  conditions: string;
  price_per_unit: string;
  shelf_space: string;
  on_shelf: string;
  tags: string;
  notes: string;

  priority_level?: string;   // "1" | "2" | "3"

  photo_urls: string[];
};

async function toCanvasBase64(url: string): Promise<string> {
  let srcForImg = url;
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
  canvas.getContext('2d')!.drawImage(img, 0, 0);

  if (srcForImg.startsWith('blob:') && srcForImg !== url) URL.revokeObjectURL(srcForImg);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  // IMPORTANT: keep full data URI so ExcelJS can reliably interpret the format
  return dataUrl;
}

export async function downloadSubmissionExcel(row: SubmissionExcel, opts: { fileNamePrefix?: string } = {}) {
  if (typeof document === 'undefined') {
    throw new Error('Excel export is only available on the web app.');
  }

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

  ws.columns = [
    { key: 'label',  width: 44 },
    { key: 'value',  width: 44 },
    { key: 'gap',    width: 2  },
    { key: 'gap2',   width: 2  },
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

  // Title
  ws.mergeCells(`A${r}:B${r}`);
  const siteCell = ws.getCell(`A${r}`);
  siteCell.value = (row.store_site || '').toUpperCase();
  siteCell.font = { bold: true };
  siteCell.alignment = { vertical: 'middle', horizontal: 'left' };
  siteCell.border = border;
  ws.getCell(`C${r}`).border = border;
  ws.getCell(`D${r}`).border = border;
  r++;

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
  addRow('BRAND', row.brand);
  addRow('STORE LOCATION', row.store_location);
  addRow('LOCATIONS', row.location);
  addRow('CONDITIONS', row.conditions);
  addRow('PRICE PER UNIT', row.price_per_unit);
  addRow('SHELF SPACE', row.shelf_space);
  addRow('FACES ON SHELF', row.on_shelf);
  addRow('TAGS', row.tags);
  addRow('NOTES', row.notes);

  // NEW: Priority row, colored
  const priorityRow = r;
  addRow('PRIORITY LEVEL', row.priority_level ?? '');
  const p = Number(row.priority_level ?? '0');
  const color = p === 1 ? 'FFEF4444' /* red-500 */
              : p === 2 ? 'FFF59E0B' /* amber-500 */
              : p === 3 ? 'FF22C55E' /* green-500 */
              : undefined;
  if (color) {
    ws.getCell(`B${priorityRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  }

  // PHOTOS header
  ws.mergeCells(`A${r}:B${r}`);
  const hdr = ws.getCell(`A${r}`);
  hdr.value = 'PHOTOS';
  hdr.font = { bold: true };
  hdr.alignment = { vertical: 'middle', horizontal: 'left' };
  hdr.border = border;
  ws.getCell(`C${r}`).border = border;
  ws.getCell(`D${r}`).border = border;
  r++;

  // Photo grid: up to 6 photos, 2 columns x 3 rows
  const imageTopRow = r;
  const rowsForImages = 36; // more vertical space for 3 rows of images
  const imageBottomRow = imageTopRow + rowsForImages - 1;

  for (let rr = imageTopRow; rr <= imageBottomRow; rr++) {
    ws.getCell(`A${rr}`).border = border;
    ws.getCell(`B${rr}`).border = border;
    ws.getCell(`C${rr}`).border = border;
    ws.getCell(`D${rr}`).border = border;
    ws.getRow(rr).height = 18;
  }

  const urls = (row.photo_urls || []).filter(Boolean).slice(0, 6);
  const settled = await Promise.allSettled(urls.map(toCanvasBase64));
  const dataUris = settled.map((s) => (s.status === 'fulfilled' ? s.value : null));

  for (let i = 0; i < dataUris.length; i++) {
    const dataUri = dataUris[i];
    if (!dataUri) continue;
    const id = wb.addImage({ base64: dataUri, extension: 'jpeg' });
    const colIndex = i % 2; // 0 or 1
    const rowBlock = Math.floor(i / 2); // 0,1,2

    const topRowForImage = imageTopRow + rowBlock * 12; // 12-row block per image row
    const tlCol = colIndex === 0 ? 'A' : 'B';
    const brCol = colIndex === 0 ? 'A' : 'B';
    const tl = `${tlCol}${topRowForImage}`;
    const br = `${brCol}${topRowForImage + 11}`;
    ws.addImage(id, `${tl}:${br}`);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = opts.fileNamePrefix || 'submission';
  const fname = `${prefix}-${iso}.xlsx`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  a.click();
  URL.revokeObjectURL(a.href);
}
