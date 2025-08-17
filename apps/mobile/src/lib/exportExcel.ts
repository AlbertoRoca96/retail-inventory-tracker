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

/** Read EXIF orientation (0x0112) from a JPEG, if present. Returns 1..8 or null. */
function getExifOrientation(u8: Uint8Array): number | null {
  // must be JPEG
  if (!(u8[0] === 0xff && u8[1] === 0xd8)) return null;
  let off = 2;
  const len = u8.length;

  while (off + 4 < len) {
    if (u8[off] !== 0xff) return null;
    const marker = u8[off + 1];
    const size = (u8[off + 2] << 8) + u8[off + 3];
    if (marker === 0xe1 && off + 4 + size <= len) {
      // APP1
      const start = off + 4;
      // "Exif\0\0"
      if (
        u8[start] === 0x45 &&
        u8[start + 1] === 0x78 &&
        u8[start + 2] === 0x69 &&
        u8[start + 3] === 0x66 &&
        u8[start + 4] === 0x00 &&
        u8[start + 5] === 0x00
      ) {
        const tiff = start + 6;
        const little = u8[tiff] === 0x49 && u8[tiff + 1] === 0x49; // 'II'
        const getShort = (o: number) =>
          little ? u8[o] + (u8[o + 1] << 8) : (u8[o] << 8) + u8[o + 1];
        const getLong = (o: number) =>
          little
            ? u8[o] + (u8[o + 1] << 8) + (u8[o + 2] << 16) + (u8[o + 3] << 24)
            : (u8[o] << 24) + (u8[o + 1] << 16) + (u8[o + 2] << 8) + u8[o + 3];

        const ifd0 = tiff + getLong(tiff + 4);
        const entries = getShort(ifd0);
        for (let i = 0; i < entries; i++) {
          const entry = ifd0 + 2 + i * 12;
          const tag = getShort(entry);
          if (tag === 0x0112) {
            // type should be SHORT, count 1; value stored at entry+8 (2 bytes)
            const val = getShort(entry + 8);
            return val || 1;
          }
        }
      }
      return null;
    }
    off += 2 + size;
  }
  return null;
}

/** Re-encode a JPEG Blob honoring EXIF orientation; returns raw base64 (no data: prefix). */
async function reencodeJpegWithOrientation(blob: Blob, orientation: number): Promise<string> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    // try to avoid CORS-taint for remote public images
    img.crossOrigin = 'anonymous';
    const loaded = new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = rej;
    });
    img.src = url;
    await loaded;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const w = img.naturalWidth;
    const h = img.naturalHeight;

    // canvas size & transform per EXIF
    switch (orientation) {
      case 2: // mirror horizontal
        canvas.width = w; canvas.height = h;
        ctx.translate(w, 0); ctx.scale(-1, 1);
        break;
      case 3: // rotate 180
        canvas.width = w; canvas.height = h;
        ctx.translate(w, h); ctx.rotate(Math.PI);
        break;
      case 4: // mirror vertical
        canvas.width = w; canvas.height = h;
        ctx.translate(0, h); ctx.scale(1, -1);
        break;
      case 5: // mirror horizontal and rotate 90 CW
        canvas.width = h; canvas.height = w;
        ctx.rotate(0.5 * Math.PI); ctx.scale(1, -1);
        break;
      case 6: // rotate 90 CW
        canvas.width = h; canvas.height = w;
        ctx.rotate(0.5 * Math.PI); ctx.translate(0, -h);
        break;
      case 7: // mirror horizontal and rotate 270
        canvas.width = h; canvas.height = w;
        ctx.rotate(1.5 * Math.PI); ctx.scale(1, -1); ctx.translate(-w, 0);
        break;
      case 8: // rotate 270 CW
        canvas.width = h; canvas.height = w;
        ctx.rotate(1.5 * Math.PI); ctx.translate(-w, 0);
        break;
      default: // 1 or unknown – no transform
        canvas.width = w; canvas.height = h;
    }

    ctx.drawImage(img, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    return dataUrl.split(',')[1]; // raw base64
  } catch {
    // If canvas is CORS-tainted or anything fails, fall back to original bytes
    const buf = await blob.arrayBuffer();
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Robust fetch that works with http(s), blob:, and data: URLs.
 * Returns { base64 (raw), ext } where ext is 'png' | 'jpeg'.
 */
async function fetchAsBase64(url: string): Promise<{ base64: string; ext: 'png' | 'jpeg' }> {
  // data URL: already base64
  if (url.startsWith('data:')) {
    const m = url.match(/^data:(.*?);base64,(.*)$/);
    const meta = m?.[1] ?? '';
    const b64 = m?.[2] ?? '';
    const ext: 'png' | 'jpeg' = meta.includes('png') ? 'png' : 'jpeg';
    return { base64: b64, ext };
  }

  // fetch blob for blob: or http(s):
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
  const blob = await res.blob();
  const buf = await blob.arrayBuffer();
  const u8 = new Uint8Array(buf);

  // detect extension (content-type may be missing/ambiguous for blob:)
  const ct = blob.type || res.headers.get('Content-Type') || '';
  let ext: 'png' | 'jpeg';
  if (ct.includes('png')) ext = 'png';
  else if (ct.includes('jpeg') || ct.includes('jpg')) ext = 'jpeg';
  else if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) ext = 'png';
  else ext = 'jpeg';

  if (ext === 'jpeg') {
    // try to respect EXIF orientation
    const ori = getExifOrientation(u8);
    if (ori && ori !== 1) {
      const oriented = await reencodeJpegWithOrientation(blob, ori);
      return { base64: oriented, ext: 'jpeg' };
    }
  }

  // default: use original bytes
  return { base64: btoa(String.fromCharCode(...u8)), ext };
}

export async function downloadSubmissionExcel(row: SubmissionExcel) {
  const wb = new ExcelJS.Workbook();

  // Worksheet + page setup (unchanged)
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

  const border = {
    top: { style: 'thin' as const }, bottom: { style: 'thin' as const },
    left: { style: 'thin' as const }, right: { style: 'thin' as const }
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

  // PHOTOS header
  ws.mergeCells(`A${r}:D${r}`);
  const hdr = ws.getCell(`A${r}`);
  hdr.value = 'PHOTOS';
  hdr.font = { bold: true };
  hdr.alignment = { vertical: 'middle', horizontal: 'left' };
  hdr.border = border;
  r++;

  // bordered image area
  const imageTopRow = r;
  const rowsForImages = 18;
  for (let rr = imageTopRow; rr < imageTopRow + rowsForImages; rr++) {
    ws.getCell(`A${rr}`).border = border;
    ws.getCell(`B${rr}`).border = border;
    ws.getCell(`C${rr}`).border = border;
    ws.getCell(`D${rr}`).border = border;
  }

  // Fetch up to two images; don't fail the batch if one fails
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
