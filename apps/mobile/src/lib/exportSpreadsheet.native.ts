// apps/mobile/src/lib/exportSpreadsheet.native.ts
// Native spreadsheet export that produces a **real XLSX file** with embedded
// images, mirroring the web Excel export so the result is fully editable in
// Excel/Numbers and not a PDF or HTML hack.

import ExcelJS from 'exceljs';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';
import { alertStorageUnavailable, ensureExportDirectory } from './storageAccess';
import { shareFileNative } from './shareFile.native';

// Ensure Buffer exists on globalThis for ExcelJS and our base64 conversions
if (!(globalThis as any).Buffer) {
  (globalThis as any).Buffer = Buffer;
}

export type SubmissionSpreadsheet = {
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
  priority_level?: string | null; // "1" | "2" | "3"
  photo_urls: string[]; // up to 2
};

// ----- Image helpers (borrowed from web Excel export, adapted for native) -----

async function toCanvasBase64(url: string): Promise<string> {
  // On native, ExcelJS only needs base64 JPEG; we can fetch the remote URL
  // and feed the bytes into a data URL-compatible string.
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
  const blob = await res.blob();
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = globalThis.btoa ? globalThis.btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  return base64;
}

export async function downloadSubmissionSpreadsheet(
  row: SubmissionSpreadsheet,
  opts: { fileNamePrefix?: string } = {}
) {
  const debug = __DEV__;

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
  addRow('ON SHELF', row.on_shelf);
  addRow('TAGS', row.tags);
  addRow('NOTES', row.notes);

  // Priority row, colored
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

  // Photo grid
  const imageTopRow = r;
  const rowsForImages = 18;
  const imageBottomRow = imageTopRow + rowsForImages - 1;

  for (let rr = imageTopRow; rr <= imageBottomRow; rr++) {
    ws.getCell(`A${rr}`).border = border;
    ws.getCell(`B${rr}`).border = border;
    ws.getCell(`C${rr}`).border = border;
    ws.getCell(`D${rr}`).border = border;
    ws.getRow(rr).height = 18;
  }

  // Embed up to 2 images exactly as in the web Excel export
  const urls = (row.photo_urls || []).slice(0, 2);
  try {
    const settled = await Promise.allSettled(urls.map(toCanvasBase64));
    const base64s = settled
      .filter((s): s is PromiseFulfilledResult<string> => s.status === 'fulfilled')
      .map((s) => s.value);

    if (base64s[0]) {
      const id = wb.addImage({ base64: base64s[0], extension: 'jpeg' });
      ws.addImage(id, `A${imageTopRow}:A${imageBottomRow}`);
    }
    if (base64s[1]) {
      const id = wb.addImage({ base64: base64s[1], extension: 'jpeg' });
      ws.addImage(id, `B${imageTopRow}:B${imageBottomRow}`);
    }
  } catch (err) {
    if (debug) {
      console.warn('[exportSpreadsheet.native] image embedding failed', err);
    }
  }

  const buffer = await wb.xlsx.writeBuffer();

  const exportDir =
    (await ensureExportDirectory(FileSystem as any, 'xlsx', 'documents-first')) ??
    (await ensureExportDirectory(FileSystem as any, 'xlsx', 'cache-first'));

  if (!exportDir) {
    alertStorageUnavailable();
    throw new Error('Unable to resolve a writable directory for spreadsheet exports.');
  }

  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = opts.fileNamePrefix || 'submission';
  const fileName = `${prefix}-${iso}.xlsx`;
  const dest = `${exportDir}${fileName}`;

  // Write the XLSX bytes to disk
  const base64 = Buffer.from(buffer as ArrayBufferLike).toString('base64');
  await FileSystem.writeAsStringAsync(dest, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (debug) {
    const info = await FileSystem.getInfoAsync(dest);
    console.log('[exportSpreadsheet.native] wrote spreadsheet', dest, info);
  }

  await shareFileNative(dest, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: 'Share submission spreadsheet',
    message: 'Submission data attached as an Excel spreadsheet.',
  });

  return dest;
}

export default { downloadSubmissionSpreadsheet };
