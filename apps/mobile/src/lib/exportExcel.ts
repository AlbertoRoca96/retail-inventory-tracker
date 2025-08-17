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
  photo_urls: string[]; // we’ll embed up to 2
};

// -- utils --------------------------------------------------------------

function u8FromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

/**
 * Load an image (http/https/blob/data), apply EXIF orientation using
 * blueimp-load-image, and return { base64 (raw), w, h } of the oriented bitmap.
 * We always re-encode to JPEG (orientation removed by design).
 *
 * Docs: https://www.npmjs.com/package/blueimp-load-image
 */
async function toUprightBase64(
  url: string
): Promise<{ base64: string; w: number; h: number }> {
  // Dynamic import (web-only); also load EXIF plugins
  const loadImageMod: any = await import('blueimp-load-image');
  await import('blueimp-load-image/js/load-image-meta');
  await import('blueimp-load-image/js/load-image-exif');
  await import('blueimp-load-image/js/load-image-exif-map');
  const loadImage = loadImageMod.default || loadImageMod;

  let blob: Blob;

  if (url.startsWith('data:')) {
    const m = url.match(/^data:(.*?);base64,(.*)$/);
    const mime = (m?.[1] || 'image/jpeg').toLowerCase();
    const b64 = m?.[2] || '';
    blob = new Blob([u8FromBase64(b64)], { type: mime });
  } else {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
    blob = await res.blob();
  }

  // blueimp will read EXIF and draw an oriented canvas for us.
  const canvas: HTMLCanvasElement = await new Promise((resolve, reject) => {
    loadImage(
      blob,
      (img: HTMLCanvasElement | HTMLImageElement | Event) => {
        if ((img as any)?.type === 'error') return reject(new Error('Image decode error'));
        // If it returns <canvas>, orientation has been applied.
        if (img instanceof HTMLCanvasElement) return resolve(img);
        // Fallback: draw <img> onto a canvas (rare path)
        const c = document.createElement('canvas');
        c.width = (img as HTMLImageElement).naturalWidth;
        c.height = (img as HTMLImageElement).naturalHeight;
        c.getContext('2d')!.drawImage(img as HTMLImageElement, 0, 0);
        resolve(c);
      },
      {
        // key options:
        orientation: true, // apply EXIF orientation
        meta: true,        // parse metadata
        canvas: true       // return a canvas
      }
    );
  });

  // Re-encode as JPEG; this strips EXIF (so Excel won’t rotate again).
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const base64 = dataUrl.split(',')[1] || '';
  return { base64, w: canvas.width, h: canvas.height };
}

// -- main ---------------------------------------------------------------

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

  ws.columns = [
    { key: 'label', width: 22 }, // A
    { key: 'value', width: 44 }, // B
    { key: 'gap', width: 2  },   // C
    { key: 'value2', width: 44 } // D
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

  // Bordered area beneath PHOTOS
  const imageTopRow = r;
  const rowsForImages = 18;
  for (let rr = imageTopRow; rr < imageTopRow + rowsForImages; rr++) {
    ws.getCell(`A${rr}`).border = border;
    ws.getCell(`B${rr}`).border = border;
    ws.getCell(`C${rr}`).border = border;
    ws.getCell(`D${rr}`).border = border;
  }

  // Max render size in pixels for each photo
  const MAX_W = 360;
  const MAX_H = 230;

  // Load up to two photos, upright; don’t fail if one errors
  const urls = (row.photo_urls || []).slice(0, 2);
  const settled = await Promise.allSettled(urls.map(toUprightBase64));
  const imgs = settled
    .filter((s): s is PromiseFulfilledResult<{ base64: string; w: number; h: number }> => s.status === 'fulfilled')
    .map((s) => s.value);

  const place = (i: 0 | 1) => {
    const img = imgs[i];
    if (!img) return;
    const scale = Math.min(MAX_W / img.w, MAX_H / img.h, 1); // contain, never upscale
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

  // Download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const fname = `submission-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  a.click();
  URL.revokeObjectURL(a.href);
}
