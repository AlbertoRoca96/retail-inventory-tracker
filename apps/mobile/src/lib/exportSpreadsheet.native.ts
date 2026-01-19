// apps/mobile/src/lib/exportSpreadsheet.native.ts
//
// Native: Generate a real, fully-editable .xlsx workbook.
// **SAFE SIMPLE VERSION**: no embedded images, only text + photo URLs.
// This avoids any native image-manipulation weirdness so buttons never freeze.

import ExcelJS from 'exceljs';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';
import { Buffer } from 'buffer';

if (!(globalThis as any).Buffer) (globalThis as any).Buffer = Buffer;

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const IOS_UTI_XLSX = 'org.openxmlformats.spreadsheetml.sheet';

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
  photo_urls: string[];
};

type ExportOpts = {
  fileNamePrefix?: string;
};

function sanitizeFileBase(input: string): string {
  const base = (input || '').trim() || 'submission';
  return base
    .replace(/[\/\\?%*:|"<>]/g, '-')
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
    // ignore
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

export async function downloadSubmissionSpreadsheet(
  row: SubmissionSpreadsheet,
  opts: ExportOpts = {}
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Retail Inventory Tracker';
  wb.created = new Date();

  const ws = wb.addWorksheet('submission');
  ws.columns = [
    { key: 'label', width: 22 },
    { key: 'value', width: 48 },
  ];

  const addKV = (label: string, value: string) => {
    ws.addRow([label, value]);
  };

  // Marker row so we know which exporter generated this.
  addKV('EXPORT_VERSION', 'XLSX_NATIVE_SIMPLE_V1');

  addKV('DATE', normalizeText(row.date));
  addKV('BRAND', normalizeText(row.brand));
  addKV('STORE SITE', normalizeText(row.store_site));
  addKV('STORE LOCATION', normalizeText(row.store_location));
  addKV('LOCATIONS', normalizeText(row.location));
  addKV('CONDITIONS', normalizeText(row.conditions));
  addKV('PRICE PER UNIT', normalizeText(row.price_per_unit));
  addKV('SHELF SPACE', normalizeText(row.shelf_space));
  addKV('ON SHELF', normalizeText(row.on_shelf));
  addKV('TAGS', normalizeTags(row.tags));
  addKV('NOTES', normalizeText(row.notes));
  addKV('PRIORITY LEVEL', normalizeText(row.priority_level));
  if (row.submitted_by) addKV('SUBMITTED BY', normalizeText(row.submitted_by));

  // Photos section (URLs only, no embedding to avoid native/image issues)
  ws.addRow(['', '']);
  const hdr = ws.addRow(['PHOTOS', '']);
  hdr.font = { bold: true };

  const urls = (row.photo_urls || [])
    .filter((u) => typeof u === 'string' && u.trim())
    .slice(0, 4);

  addKV('PHOTO 1 URL', urls[0] || '');
  addKV('PHOTO 2 URL', urls[1] || '');
  if (urls[2]) addKV('PHOTO 3 URL', urls[2]);
  if (urls[3]) addKV('PHOTO 4 URL', urls[3]);

  // Write XLSX to disk.
  const out = await wb.xlsx.writeBuffer();
  const base64 = Buffer.from(out as ArrayBuffer).toString('base64');

  const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!baseDir) throw new Error('No writable directory available for export.');

  const exportDir = baseDir + 'exports/';
  await ensureDir(exportDir);

  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = sanitizeFileBase(opts.fileNamePrefix || 'submission');
  const fileName = `${prefix}-${iso}.xlsx`;
  const dest = exportDir + fileName;

  await FileSystem.writeAsStringAsync(dest, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  await shareXlsx(dest);
}

export default { downloadSubmissionSpreadsheet };
