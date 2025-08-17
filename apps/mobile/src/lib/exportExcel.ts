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

/** --- EXIF orientation (JPEG) parser: returns 1..8 (1 = normal) --- */
function getJpegOrientation(buf: ArrayBuffer): number {
  const view = new DataView(buf);
  if (view.getUint16(0, false) !== 0xffd8) return 1; // not a JPEG
  let offset = 2;
  const length = view.byteLength;
  while (offset < length) {
    const marker = view.getUint16(offset, false);
    offset += 2;
    if ((marker & 0xff00) !== 0xff00) break;
    if (marker === 0xffe1) {
      const exifLength = view.getUint16(offset, false);
      offset += 2;
      if (view.getUint32(offset, false) !== 0x45786966) return 1; // 'Exif'
      const tiff = offset + 6;
      const little = view.getUint16(tiff, false) === 0x4949; // 'II'
      const ifdOffset = view.getUint32(tiff + 4, little);
      let dir = tiff + ifdOffset;
      const entries = view.getUint16(dir, little);
      dir += 2;
      for (let i = 0; i < entries; i++) {
        const entry = dir + i * 12;
        const tag = view.getUint16(entry, little);
        if (tag === 0x0112) {
          const val = view.getUint16(entry + 8, little);
          return val || 1;
        }
      }
      return 1;
    } else {
      offset += view.getUint16(offset, false);
    }
  }
  return 1;
}

/** load an HTMLImageElement from a Blob */
function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

/** Draw an image to canvas with a given EXIF orientation */
function drawOriented(img: HTMLImageElement, orientation: number, ext: 'png' | 'jpeg'): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  let w = img.naturalWidth;
  let h = img.naturalHeight;

  // set canvas size & transform
  switch (orientation) {
    case 2: // mirror X
      canvas.width = w; canvas.height = h;
      ctx.translate(w, 0); ctx.scale(-1, 1);
      break;
    case 3: // 180°
      canvas.width = w; canvas.height = h;
      ctx.translate(w, h); ctx.rotate(Math.PI);
      break;
    case 4: // mirror Y
      canvas.width = w; canvas.height = h;
      ctx.translate(0, h); ctx.scale(1, -1);
      break;
    case 5: // transpose
      canvas.width = h; canvas.height = w;
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(1, -1);
      break;
    case 6: // 90° CW
      canvas.width = h; canvas.height = w;
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(0, -h);
      break;
    case 7: // transverse
      canvas.width = h; canvas.height = w;
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(w, -h);
      ctx.scale(-1, 1);
      break;
    case 8: // 90° CCW
      canvas.width = h; canvas.height = w;
      ctx.rotate(-0.5 * Math.PI);
      ctx.translate(-w, 0);
      break;
    default: // 1 = normal
      canvas.width = w; canvas.height = h;
  }

  ctx.drawImage(img, 0, 0);
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  // return RAW base64 (strip data URL header)
  return canvas.toDataURL(mime, 0.92).split(',')[1];
}

/** Robust fetch: supports http(s), blob:, data:, fixes EXIF orientation for JPEGs. */
async function fetchAsBase64(url: string): Promise<{ base64: string; ext: 'png' | 'jpeg' }> {
  // data: URL — already base64
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

  // detect extension
  const ct = blob.type || res.headers.get('Content-Type') || '';
  let ext: 'png' | 'jpeg';
  if (ct.includes('png')) ext = 'png';
  else if (ct.includes('jpeg') || ct.includes('jpg')) ext = 'jpeg';
  else if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) ext = 'png';
  else ext = 'jpeg';

  // If JPEG and orientation != 1, normalize pixels via canvas
  if (ext === 'jpeg') {
    const orientation = getJpegOrientation(buf);
    if (orientation !== 1) {
      const img = await loadImageFromBlob(new Blob([u8], { type: 'image/jpeg' }));
      const fixed = drawOriented(img, orientation, 'jpeg');
      return { base64: fixed, ext: 'jpeg' };
    }
  }

  // No fix needed — return raw bytes base64
  return { base64: btoa(String.fromCharCode(...u8)), ext };
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

  // 4 columns so photos can sit in B and D with a thin gap at C
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

  // PHOTOS header spanning A:D
  ws.mergeCells(`A${r}:D${r}`);
  const hdr = ws.getCell(`A${r}`);
  hdr.value = 'PHOTOS';
  hdr.font = { bold: true };
  hdr.alignment = { vertical: 'middle', horizontal: 'left' };
  hdr.border = border;
  r++;

  // Bordered area under the photos (for a table look)
  const imageTopRow = r;
  const rowsForImages = 18;
  for (let rr = imageTopRow; rr < imageTopRow + rowsForImages; rr++) {
    ws.getCell(`A${rr}`).border = border;
    ws.getCell(`B${rr}`).border = border;
    ws.getCell(`C${rr}`).border = border;
    ws.getCell(`D${rr}`).border = border;
    ws.getRow(rr).height = 18;
  }

  // Get up to 2 photos; if one fails we still embed the other
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

  // Browser download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const fname = `submission-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  a.click();
  URL.revokeObjectURL(a.href);
}
