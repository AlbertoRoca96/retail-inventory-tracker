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
  photo_urls: string[];
};

/** ---- EXIF helpers (JPEG only) ---- */
function getJpegOrientation(u8: Uint8Array): number {
  if (u8.length < 4 || u8[0] !== 0xff || u8[1] !== 0xd8) return 1; // not JPEG
  let off = 2;
  const end = u8.length;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

  while (off + 4 < end && u8[off] === 0xff) {
    const marker = u8[off + 1];
    const size = dv.getUint16(off + 2, false);
    if (size < 2) break;

    // APP1 with "Exif\0\0"
    if (marker === 0xe1 && off + 4 + size <= end) {
      if (
        u8[off + 4] === 0x45 && u8[off + 5] === 0x78 &&
        u8[off + 6] === 0x69 && u8[off + 7] === 0x66 &&
        u8[off + 8] === 0x00 && u8[off + 9] === 0x00
      ) {
        const tiff = off + 10;
        const little = dv.getUint16(tiff, false) === 0x4949;
        if (dv.getUint16(tiff + 2, little) !== 0x002a) return 1;
        let dir = tiff + dv.getUint32(tiff + 4, little);
        if (dir + 2 > end) return 1;
        const n = dv.getUint16(dir, little); dir += 2;
        for (let i = 0; i < n; i++) {
          const e = dir + i * 12;
          if (e + 12 > end) break;
          if (dv.getUint16(e, little) === 0x0112) {
            const val = dv.getUint16(e + 8, little);
            return val || 1;
          }
        }
      }
    }
    off += 2 + size;
  }
  return 1;
}

function drawOriented(img: HTMLImageElement, orientation: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  // swap for 90/270 rotations
  if (orientation >= 5 && orientation <= 8) { c.width = h; c.height = w; }
  else { c.width = w; c.height = h; }

  switch (orientation) {
    case 2: ctx.translate(c.width, 0); ctx.scale(-1, 1); break;            // mirror H
    case 3: ctx.translate(c.width, c.height); ctx.rotate(Math.PI); break;  // 180
    case 4: ctx.translate(0, c.height); ctx.scale(1, -1); break;           // mirror V
    case 5: ctx.rotate(0.5 * Math.PI); ctx.scale(1, -1); break;            // mirror H + 90
    case 6: ctx.rotate(0.5 * Math.PI); ctx.translate(0, -c.width); break;  // 90 CW
    case 7: ctx.rotate(1.5 * Math.PI); ctx.scale(1, -1); ctx.translate(-c.height, 0); break; // mirror H + 270
    case 8: ctx.rotate(1.5 * Math.PI); ctx.translate(-c.height, 0); break; // 270
    default: break; // 1 = no transform
  }
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

/** base64 → bytes */
function u8FromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

/**
 * Load any image (http/https/blob/data), normalize orientation if JPEG,
 * and return raw base64 + ext + final pixel dimensions.
 */
async function loadImageNormalized(url: string): Promise<{ base64: string; ext: 'png' | 'jpeg'; w: number; h: number }> {
  let u8: Uint8Array;
  let ext: 'png' | 'jpeg';

  if (url.startsWith('data:')) {
    const m = url.match(/^data:(.*?);base64,(.*)$/);
    const meta = m?.[1] ?? '';
    const b64 = m?.[2] ?? '';
    u8 = u8FromBase64(b64);
    ext = meta.includes('png') ? 'png' : 'jpeg';
  } else {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
    const blob = await res.blob();
    const buf = await blob.arrayBuffer();
    u8 = new Uint8Array(buf);
    const ct = blob.type || res.headers.get('Content-Type') || '';
    if (ct.includes('png') || (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47)) ext = 'png';
    else ext = 'jpeg';
  }

  // Create an object URL to read intrinsic size safely
  const obj = URL.createObjectURL(new Blob([u8], { type: ext === 'png' ? 'image/png' : 'image/jpeg' }));
  const img = new Image();
  img.src = obj;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
  });

  let canvas: HTMLCanvasElement;
  if (ext === 'jpeg') {
    const o = getJpegOrientation(u8);
    canvas = o === 1 ? (() => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d')!.drawImage(img, 0, 0); return c; })()
                     : drawOriented(img, o);
  } else {
    canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
  }
  URL.revokeObjectURL(obj);

  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  const dataUrl = canvas.toDataURL(mime, 0.92);
  const base64 = dataUrl.split(',')[1] || '';
  return { base64, ext, w: canvas.width, h: canvas.height };
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

  ws.columns = [
    { key: 'label', width: 22 }, // A
    { key: 'value', width: 44 }, // B
    { key: 'gap', width: 2 },    // C
    { key: 'value2', width: 44 } // D
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

  // Fit box for each photo (in pixels used by ExcelJS)
  const MAX_W = 360;
  const MAX_H = 230;

  // Load (and orient) up to two photos; don't fail if one errors
  const urls = (row.photo_urls || []).slice(0, 2);
  const settled = await Promise.allSettled(urls.map(loadImageNormalized));
  const imgs = settled.filter((s): s is PromiseFulfilledResult<{ base64: string; ext: 'png' | 'jpeg'; w: number; h: number }> => s.status === 'fulfilled').map(s => s.value);

  function place(index: 0 | 1) {
    const info = imgs[index];
    if (!info) return;
    const scale = Math.min(MAX_W / info.w, MAX_H / info.h, 1); // never upscale
    const w = Math.round(info.w * scale);
    const h = Math.round(info.h * scale);
    const id = wb.addImage({ base64: info.base64, extension: info.ext });
    ws.addImage(id, {
      tl: { col: index === 0 ? 1 : 3, row: imageTopRow - 1 }, // B or D
      ext: { width: w, height: h },
    });
  }

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
