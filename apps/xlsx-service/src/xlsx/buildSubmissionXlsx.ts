import ExcelJS from 'exceljs';
import sharp from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';

type SubmissionPhotoFields = Partial<Record<`photo${number}_path`, string | null>> &
  Partial<Record<`photo${number}_url`, string | null>>;

export type SubmissionRow = SubmissionPhotoFields & {
  id: string;
  team_id: string;
  date: string;
  store_location: string;
  store_site: string | null;
  brand: string | null;
  location: string | null;
  conditions: string | null;
  price_per_unit: string | number | null;
  shelf_space: string | null;
  on_shelf: string | null;
  tags: string[] | null;
  notes: string | null;
  priority_level: number;
  submitted_by?: string | null;
};

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_REPORT_PHOTOS = 20;
const PHOTO_COLUMNS = 2;
const PHOTO_ROWS_PER_IMAGE_BLOCK = 12;

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
  return normalizeText(tags);
}

async function toJpegSmall(input: Buffer, width = 260, quality = 55): Promise<Buffer> {
  // Convert *anything* to small-ish JPEG, which ExcelJS handles well.
  // This is the main memory-safety trick.
  return sharp(input)
    .rotate() // respect EXIF
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

async function downloadStorageObject(
  supabaseAdmin: SupabaseClient,
  bucket: string,
  path: string
): Promise<Buffer | null> {
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
  if (error || !data) return null;

  // data is a Blob (undici)
  const buf = Buffer.from(await data.arrayBuffer());
  if (!buf.length) return null;
  return buf;
}

export type BuildXlsxResult = {
  mime: string;
  fileName: string;
  bytes: Buffer;
};

export async function buildSubmissionXlsx({
  supabaseAdmin,
  submission,
  bucket = 'submissions',
}: {
  supabaseAdmin: SupabaseClient;
  submission: SubmissionRow;
  bucket?: string;
}): Promise<BuildXlsxResult> {
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
  siteCell.value = (submission.store_site || submission.store_location || 'Submission').toUpperCase();
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

  addRow('DATE', submission.date);
  addRow('BRAND', submission.brand);
  addRow('STORE LOCATION', submission.store_location);
  addRow('LOCATIONS', submission.location);
  addRow('CONDITIONS', submission.conditions);
  addRow('PRICE PER UNIT', submission.price_per_unit);
  addRow('SHELF SPACE', submission.shelf_space);
  addRow('FACES ON SHELF', submission.on_shelf);
  addRow('TAGS', normalizeTags(submission.tags));
  addRow('NOTES', submission.notes);

  const priRow = r;
  addRow('PRIORITY LEVEL', submission.priority_level);
  const p = Number(submission.priority_level ?? 0);
  const priColor =
    p === 1
      ? 'FFEF4444'
      : p === 2
        ? 'FFF59E0B'
        : p === 3
          ? 'FF22C55E'
          : undefined;
  if (priColor) {
    ws.getCell(`B${priRow}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: priColor },
    };
  }

  if (submission.submitted_by) {
    addRow('SUBMITTED BY', submission.submitted_by);
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
  const photoRows = Math.ceil(MAX_REPORT_PHOTOS / PHOTO_COLUMNS);
  const rowsForImages = photoRows * PHOTO_ROWS_PER_IMAGE_BLOCK;
  const imageBottomRow = imageTopRow + rowsForImages - 1;
  for (let rr = imageTopRow; rr <= imageBottomRow; rr++) {
    ws.getCell(`A${rr}`).border = border;
    ws.getCell(`B${rr}`).border = border;
    ws.getRow(rr).height = 18;
  }

  const photoPaths = Array.from({ length: MAX_REPORT_PHOTOS }, (_, index) => {
    const slot = index + 1;
    return submission[`photo${slot}_path`];
  }).filter((path): path is string => !!path);

  // Download, shrink, embed.
  for (let i = 0; i < Math.min(photoPaths.length, MAX_REPORT_PHOTOS); i++) {
    const path = photoPaths[i];
    const raw = await downloadStorageObject(supabaseAdmin, bucket, path);
    if (!raw) continue;

    let jpeg: Buffer;
    try {
      jpeg = await toJpegSmall(raw, 260, 55);
    } catch {
      // Worst-case fallback: try raw bytes.
      jpeg = raw;
    }

    const imageId = wb.addImage({ buffer: jpeg, extension: 'jpeg' });

    const colIndex = i % PHOTO_COLUMNS;
    const rowBlock = Math.floor(i / PHOTO_COLUMNS);
    const tlRow = imageTopRow + rowBlock * PHOTO_ROWS_PER_IMAGE_BLOCK;
    const brRow = tlRow + PHOTO_ROWS_PER_IMAGE_BLOCK - 1;
    const colLetter = colIndex === 0 ? 'A' : 'B';

    ws.addImage(imageId, `${colLetter}${tlRow}:${colLetter}${brRow}`);
  }

  const buf = (await wb.xlsx.writeBuffer({ useStyles: false, useSharedStrings: false } as any)) as ArrayBuffer;
  const bytes = Buffer.from(buf);

  const fileName = `submission-${submission.id}.xlsx`;

  return {
    mime: XLSX_MIME,
    fileName,
    bytes,
  };
}
