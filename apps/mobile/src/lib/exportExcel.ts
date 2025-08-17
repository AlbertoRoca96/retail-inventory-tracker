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

// Robust fetch that works with http(s), blob:, and data: URLs.
// IMPORTANT: return raw base64 (no "data:image/...;base64," prefix)
async function fetchAsBase64(url: string): Promise<{ base64: string; ext: 'png' | 'jpeg' }> {
  // data: URL (already base64)
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

  // sniff extension if content-type is missing/ambiguous
  const ct = blob.type || res.headers.get('Content-Type') || '';
  let ext: 'png' | 'jpeg';
  if (ct.includes('png')) ext = 'png';
  else if (ct.includes('jpeg') || ct.includes('jpg')) ext = 'jpeg';
  else if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) ext = 'png'; // PNG signature
  else ext = 'jpeg'; // default

  // to base64 (raw)
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

  ws.mergeCells(`A${r}:D${r}`);
  const hdr = ws.getCell(`A${r}`);
  hdr.value = 'PHOTOS';
  hdr.font = { bold: true };
  hdr.alignment = { vertical: 'middle', horizontal: 'left' };
  hdr.border = border;
  r++;

  const imageTopRow = r;
  const rowsForImages = 18;
  for (let rr = imageTopRow; rr < imageTopRow + rowsForImages; rr++) {
    ws.getCell(`A${rr}`).border = border;
    ws.getCell(`B${rr}`).border = border;
    ws.getCell(`C${rr}`).border = border;
    ws.getCell(`D${rr}`).border = border;
  }

  // Be resilient if one image fails
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
