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

/** Read EXIF Orientation (1..8) from a JPEG byte array. Returns 1 if not found. */
function getJpegOrientation(u8: Uint8Array): number {
  // Must be JPEG
  if (u8.length < 4 || u8[0] !== 0xff || u8[1] !== 0xd8) return 1;
  let offset = 2;
  const end = u8.length;

  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

  while (offset + 4 < end && u8[offset] === 0xff) {
    const marker = u8[offset + 1];
    const size = view.getUint16(offset + 2, false);
    if (size < 2) break;

    // APP1 (EXIF)
    if (marker === 0xe1 && offset + 4 + size <= end) {
      // "Exif\0\0"
      if (
        u8[offset + 4] === 0x45 &&
        u8[offset + 5] === 0x78 &&
        u8[offset + 6] === 0x69 &&
        u8[offset + 7] === 0x66 &&
        u8[offset + 8] === 0x00 &&
        u8[offset + 9] === 0x00
      ) {
        const tiff = offset + 10;
        const little = view.getUint16(tiff, false) === 0x4949; // 'II' -> little endian
        const magic = view.getUint16(tiff + 2, little);
        if (magic !== 0x002a) return 1;
        const ifdOffset = view.getUint32(tiff + 4, little);
        let dirStart = tiff + ifdOffset;
        if (dirStart + 2 > end) return 1;

        const entries = view.getUint16(dirStart, little);
        dirStart += 2;

        for (let i = 0; i < entries; i++) {
          const entry = dirStart + i * 12;
          if (entry + 12 > end) break;
          const tag = view.getUint16(entry, little);
          if (tag === 0x0112) {
            // Orientation tag
            const val = view.getUint16(entry + 8, little);
            return val || 1;
          }
        }
      }
    }

    offset += 2 + size;
  }
  return 1;
}

/** Draw an HTMLImageElement onto a canvas applying EXIF orientation. */
function drawOriented(
  img: HTMLImageElement,
  orientation: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  let w = img.naturalWidth;
  let h = img.naturalHeight;

  // Swap canvas dims for orientations that rotate 90/270
  if (orientation >= 5 && orientation <= 8) {
    canvas.width = h;
    canvas.height = w;
  } else {
    canvas.width = w;
    canvas.height = h;
  }

  // Apply transforms (EXIF 1..8)
  switch (orientation) {
    case 2: // mirror horizontal
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      break;
    case 3: // rotate 180
      ctx.translate(canvas.width, canvas.height);
      ctx.rotate(Math.PI);
      break;
    case 4: // mirror vertical
      ctx.translate(0, canvas.height);
      ctx.scale(1, -1);
      break;
    case 5: // mirror horizontal + rotate 90 CW
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(1, -1);
      break;
    case 6: // rotate 90 CW
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(0, -canvas.width);
      break;
    case 7: // mirror horizontal + rotate 270 CW
      ctx.rotate(1.5 * Math.PI);
      ctx.scale(1, -1);
      ctx.translate(-canvas.height, 0);
      break;
    case 8: // rotate 270 CW
      ctx.rotate(1.5 * Math.PI);
      ctx.translate(-canvas.height, 0);
      break;
    default:
      // 1 = no transform
      break;
  }

  // After transform, draw to fill canvas
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

/**
 * Fetch image and return raw base64 + extension.
 * - Handles http(s), blob:, and data: URLs.
 * - Normalizes JPEG EXIF orientation so Excel shows the image upright.
 * - Returns raw base64 (no data: prefix) as required by ExcelJS.
 */
async function fetchAsBase64(url: string): Promise<{ base64: string; ext: 'png' | 'jpeg' }> {
  // Data URL
  if (url.startsWith('data:')) {
    const m = url.match(/^data:(.*?);base64,(.*)$/);
    const meta = m?.[1] ?? '';
    const b64 = m?.[2] ?? '';
    const ext: 'png' | 'jpeg' = meta.includes('png') ? 'png' : 'jpeg';
    return { base64: b64, ext };
  }

  // blob: or http(s):
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
  const blob = await res.blob();
  const buf = await blob.arrayBuffer();
  const u8 = new Uint8Array(buf);

  // Determine type
  const ct = blob.type || res.headers.get('Content-Type') || '';
  let ext: 'png' | 'jpeg';
  if (ct.includes('png')) ext = 'png';
  else if (ct.includes('jpeg') || ct.includes('jpg')) ext = 'jpeg';
  else if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) ext = 'png';
  else ext = 'jpeg';

  // If JPEG, respect EXIF orientation by rasterizing through canvas.
  if (ext === 'jpeg') {
    const orientation = getJpegOrientation(u8);
    if (orientation !== 1) {
      const obj = URL.createObjectURL(new Blob([u8], { type: 'image/jpeg' }));
      const img = new Image();
      img.src = obj;
      await new Promise((res, rej) => {
        img.onload = () => res(undefined);
        img.onerror = rej;
      });
      const canvas = drawOriented(img, orientation);
      URL.revokeObjectURL(obj);
      // quality 0.92 looks great and keeps size reasonable
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      // Strip "data:...;base64,"
      const b64 = dataUrl.split(',')[1] || '';
      return { base64: b64, ext: 'jpeg' };
    }
  }

  // No orientation fix needed (PNG or JPEG with orientation=1): return raw bytes
  const base64 = btoa(String.fromCharCode(...u8));
  return { base64, ext };
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

  // Robust: even if one fails, embed the other
  const urls = (row.photo_urls || []).slice(0, 2);
  const settled = await Promise.allSettled(urls.map(fetchAsBase64));
  const base64s = settled
    .filter((s): s is PromiseFulfilledResult<{ base64: string; ext: 'png' | 'jpeg' }> => s.status === 'fulfilled')
    .map((s) => s.value);

  if (base64s[0]) {
    const id = wb.addImage({ base64: base64s[0].base64, extension: base64s[0].ext });
    ws.addImage(id, { tl: { col: 1, row: imageTopRow - 1 }, ext: { width: 360, height: 230 } });
  }
  if (base64s[1]) {
    const id = wb.addImage({ base64: base64s[1].base64, extension: base64s[1].ext });
    ws.addImage(id, { tl: { col: 3, row: imageTopRow - 1 }, ext: { width: 360, height: 230 } });
  }

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
