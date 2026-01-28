// apps/mobile/src/lib/exportSpreadsheet.native.ts
//
// Native: Build a real XLSX spreadsheet with embedded images using ExcelJS,
// mirroring the PDF layout (6 photos: 2 main + 4 underneath, 2x3 grid).
// This runs entirely on-device so we don't hit Supabase Edge CPU limits.

import ExcelJS from 'exceljs';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';
import { Buffer } from 'buffer';

export type SubmissionSpreadsheet = {
  store_site: string;
  date: string;
  brand: string;
  store_location: string;
  location: string;
  conditions: string;
  price_per_unit: number | string;
  shelf_space: string;
  on_shelf: number | string;
  tags: unknown;
  notes: string;
  priority_level: number | string;
  submitted_by?: string;
  photo_urls: string[]; // up to 6
};

type ExportOpts = {
  fileNamePrefix?: string;
};

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const IOS_UTI_XLSX = 'org.openxmlformats.spreadsheetml.sheet';

function sanitizeFileBase(input: string): string {
  const base = (input || '').trim() || 'submission';
  return base
    .replace(/[\\/?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

function normalizeText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function normalizeTags(tags: unknown): string {
  if (Array.isArray(tags)) return tags.map(normalizeText).filter(Boolean).join(', ');
  if (typeof tags === 'string') {
    const t = tags.trim();
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed.map(normalizeText).filter(Boolean).join(', ');
    } catch {
      // ignore
    }
    return t;
  }
  return normalizeText(tags);
}

async function ensureDir(path: string) {
  try {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  } catch {
    // ignore if it already exists
  }
}

async function shareXlsx(fileUri: string) {
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(fileUri, {
      mimeType: MIME_XLSX,
      dialogTitle: 'Share spreadsheet',
      UTI: Platform.OS === 'ios' ? IOS_UTI_XLSX : undefined,
    });
    return;
  }

  await Share.share({ url: fileUri, title: 'Share spreadsheet' });
}

async function toBase64Image(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const reader = new FileReader();
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onerror = () => reject(new Error('blob->base64 failed'));
      reader.onloadend = () => {
        const result = reader.result as string | null;
        if (!result) return reject(new Error('empty base64 result'));
        const [, b64] = result.split(',');
        resolve(b64 || '');
      };
      reader.readAsDataURL(blob);
    });
    return base64 || null;
  } catch {
    return null;
  }
}

export async function buildSubmissionSpreadsheetFile(
  row: SubmissionSpreadsheet,
  opts: ExportOpts = {}
): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('submission', {
    properties: { defaultRowHeight: 18 },
  });

  ws.columns = [
    { key: 'label', width: 44 },
    { key: 'value', width: 44 },
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

  ws.mergeCells(`A${r}:B${r}`);
  const siteCell = ws.getCell(`A${r}`);
  siteCell.value = (row.store_site || '').toUpperCase();
  siteCell.font = { bold: true };
  siteCell.alignment = { vertical: 'middle', horizontal: 'left' };
  siteCell.border = border;
  r++;

  const addRow = (label: string, value: unknown) => {
    ws.getCell(`A${r}`).value = label.toUpperCase();
    Object.assign(ws.getCell(`A${r}`), labelStyle);
    ws.getCell(`B${r}`).value = normalizeText(value);
    Object.assign(ws.getCell(`B${r}`), valueStyle);
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
  addRow('TAGS', normalizeTags(row.tags));
  addRow('NOTES', row.notes);

  const priRow = r;
  addRow('PRIORITY LEVEL', row.priority_level);
  const p = Number(row.priority_level ?? '0');
  const priColor =
    p === 1 ? 'FFEF4444' :
    p === 2 ? 'FFF59E0B' :
    p === 3 ? 'FF22C55E' :
    undefined;
  if (priColor) {
    ws.getCell(`B${priRow}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: priColor },
    };
  }

  if (row.submitted_by) {
    addRow('SUBMITTED BY', row.submitted_by);
  }

  ws.addRow(['', '']);
  r++;

  ws.mergeCells(`A${r}:B${r}`);
  const hdr = ws.getCell(`A${r}`);
  hdr.value = 'PHOTOS';
  hdr.font = { bold: true };
  hdr.alignment = { vertical: 'middle', horizontal: 'left' };
  hdr.border = border;
  r++;

  const imageTopRow = r;
  const rowsForImages = 36;
  const imageBottomRow = imageTopRow + rowsForImages - 1;
  for (let rr = imageTopRow; rr <= imageBottomRow; rr++) {
    ws.getCell(`A${rr}`).border = border;
    ws.getCell(`B${rr}`).border = border;
    ws.getRow(rr).height = 18;
  }

  const urls = (row.photo_urls || []).filter((u) => typeof u === 'string' && u.trim()).slice(0, 6);

  const base64s: (string | null)[] = [];
  for (const url of urls) {
    const b64 = await toBase64Image(url);
    base64s.push(b64);
  }

  for (let i = 0; i < base64s.length; i++) {
    const b64 = base64s[i];
    if (!b64) continue;
    const id = wb.addImage({ base64: b64, extension: 'jpeg' });
    const colIndex = i % 2;
    const rowBlock = Math.floor(i / 2);
    const tlRow = imageTopRow + rowBlock * 12;
    const brRow = tlRow + 11;
    const colLetter = colIndex === 0 ? 'A' : 'B';
    ws.addImage(id, `${colLetter}${tlRow}:${colLetter}${brRow}`);
  }

  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const bytes = new Uint8Array(buffer);

  const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!baseDir) throw new Error('No writable directory available for export.');

  const exportDir = baseDir + 'exports/';
  await ensureDir(exportDir);

  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = sanitizeFileBase(opts.fileNamePrefix || 'submission');
  const fileName = `${prefix}-${iso}.xlsx`;
  const dest = exportDir + fileName;

  await FileSystem.writeAsStringAsync(dest, Buffer.from(bytes).toString('base64'), {
    encoding: FileSystem.EncodingType.Base64,
  } as any);

  return dest;
}

export async function downloadSubmissionSpreadsheet(
  row: SubmissionSpreadsheet,
  opts: ExportOpts = {}
): Promise<void> {
  const dest = await buildSubmissionSpreadsheetFile(row, opts);
  await shareXlsx(dest);
}

export default { downloadSubmissionSpreadsheet, buildSubmissionSpreadsheetFile };
