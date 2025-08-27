// apps/mobile/src/lib/exportPdf.web.ts
// Web-only PDF generator that:
//  - rasterizes images via <canvas> (like the Excel export) so EXIF orientation is normalized,
//  - uses a Safari-friendly download fallback when programmatic <a> clicks are ignored.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export type SubmissionPdf = {
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
  photo_urls: string[]; // up to 2
  // NEW: priority level shown below NOTES with colored background
  priority_level?: string | null;
};

// Page constants
const PAGE_W = 612; // 8.5in * 72dpi
const PAGE_H = 792; // 11in * 72dpi
const M = 36;       // 0.5" margin

function drawText(page: any, str: string, x: number, y: number, size: number, font: any) {
  page.drawText(str ?? '', { x, y, size, font, color: rgb(0, 0, 0) });
}
function drawRect(page: any, x: number, y: number, w: number, h: number) {
  page.drawRectangle({
    x, y, width: w, height: h, borderWidth: 1,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.46, 0.46, 0.46),
  });
}

// ---- Image helpers (mirror Excel's behavior) ----
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const len = bin.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Fetch any URL → Blob → decode with browser (respecting EXIF when possible) → draw to canvas → JPEG bytes. */
async function rasterizeToJPEGBytes(url?: string | null): Promise<Uint8Array | null> {
  if (!url) return null;

  // Always get a Blob first so we can feed an object URL to <img> or createImageBitmap safely.
  let blob: Blob;
  try {
    // fetch() also works for blob: and data: URLs in modern browsers.
    const res = await fetch(url);
    if (!res.ok) return null;
    blob = await res.blob();
  } catch {
    return null;
  }

  // Try createImageBitmap with EXIF orientation hint (supported in most evergreen browsers).
  let bitmap: ImageBitmap | null = null;
  try {
    // @ts-expect-error - imageOrientation is not in older TS lib dom typings everywhere.
    bitmap = (await createImageBitmap(blob, { imageOrientation: 'from-image' })) as ImageBitmap;
  } catch {
    bitmap = null;
  }

  let canvas = document.createElement('canvas');
  let ctx = canvas.getContext('2d');
  if (!ctx) return null;

  if (bitmap) {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    ctx.drawImage(bitmap, 0, 0);
    // bitmap.close(); // optional
  } else {
    // Fallback: HTMLImageElement path (browsers generally decode respecting EXIF when rendering)
    const src = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = src;
      });
      canvas.width = img.naturalWidth || (img.width as number);
      canvas.height = img.naturalHeight || (img.height as number);
      ctx.drawImage(img, 0, 0);
    } catch {
      URL.revokeObjectURL(src);
      return null;
    }
    URL.revokeObjectURL(src);
  }

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const b64 = dataUrl.split(',')[1] || '';
  return b64 ? base64ToBytes(b64) : null;
}

// A safer, multi-strategy downloader for mobile Safari.
function downloadBlobWithFallback(blob: Blob, name: string) {
  try {
    // Primary: invisible <a download> click.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    // Keep it in DOM briefly — some Safari builds require it to exist.
    document.body.appendChild(a);
    a.click();
    // If the click is ignored, fallback below will still run on next tick.
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1500);
  } catch {
    // no-op, fall through to the window.open fallback below
  }

  // Fallback: open in a new tab (often works on iOS Safari when programmatic clicks are blocked).
  // If the primary path succeeded, this will just open an already-revoked URL (no effect).
  try {
    const altUrl = URL.createObjectURL(blob);
    const w = window.open(altUrl, '_blank');
    // If window.open is blocked, there isn't a better pure-web fallback here.
    setTimeout(() => URL.revokeObjectURL(altUrl), 3000);
  } catch {
    // swallow
  }
}

/** Map "1|2|3" to a soft fill color (value cell background). */
function priorityFillRgb(p?: string | null) {
  const v = String(p ?? '').trim();
  if (v === '1') return rgb(1, 0.89, 0.89); // red-200-ish
  if (v === '2') return rgb(1, 0.95, 0.78); // amber-200-ish
  if (v === '3') return rgb(0.86, 0.99, 0.91); // green-200-ish
  return null;
}

export async function downloadSubmissionPdf(data: SubmissionPdf) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Title (STORE SITE)
  let y = PAGE_H - M;
  const TITLE_H = 22;
  drawRect(page, M, y - TITLE_H, PAGE_W - 2 * M, TITLE_H);
  drawText(page, (data.store_site || '').toUpperCase(), M + 6, y - 15, 12, bold);
  y -= TITLE_H;

  // Table rows (everything up to NOTES, as before)
  const rows: Array<[string, string]> = [
    ['DATE', data.date],
    ['BRAND', data.brand],
    ['STORE LOCATION', data.store_location],
    ['LOCATIONS', data.location],
    ['CONDITIONS', data.conditions],
    ['PRICE PER UNIT', data.price_per_unit],
    ['SHELF SPACE', data.shelf_space],
    ['ON SHELF', data.on_shelf],
    ['TAGS', data.tags],
    ['NOTES', data.notes],
  ];

  const ROW_H = 20;
  const LBL_W = Math.round((PAGE_W - 2 * M) * 0.38);
  const VAL_W = (PAGE_W - 2 * M) - LBL_W;

  for (let i = 0; i < rows.length; i++) {
    const label = rows[i][0] ?? '';
    const value = rows[i][1] ?? '';
    drawRect(page, M, y - ROW_H, LBL_W, ROW_H);
    drawRect(page, M + LBL_W, y - ROW_H, VAL_W, ROW_H);
    drawText(page, String(label).toUpperCase(), M + 6, y - 14, 10, bold);
    drawText(page, String(value), M + LBL_W + 6, y - 14, 10, font);
    y -= ROW_H;
  }

  // NEW: Priority row just below NOTES
  const pri = (data.priority_level ?? '').toString();
  // label cell (bordered)
  drawRect(page, M, y - ROW_H, LBL_W, ROW_H);
  drawText(page, 'PRIORITY LEVEL', M + 6, y - 14, 10, bold);
  // value cell with optional fill
  const fill = priorityFillRgb(pri);
  if (fill) {
    page.drawRectangle({
      x: M + LBL_W, y: y - ROW_H, width: VAL_W, height: ROW_H,
      color: fill, borderWidth: 1, borderColor: rgb(0.46, 0.46, 0.46),
    });
  } else {
    drawRect(page, M + LBL_W, y - ROW_H, VAL_W, ROW_H);
  }
  // value text (bold)
  page.drawText(pri, { x: M + LBL_W + 6, y: y - 14, size: 10, font: bold, color: rgb(0, 0, 0) });
  y -= ROW_H;

  // Photos header
  const HDR_H = 20;
  drawRect(page, M, y - HDR_H, PAGE_W - 2 * M, HDR_H);
  drawText(page, 'PHOTOS', M + 6, y - 14, 10, bold);
  y -= HDR_H;

  // Two photo boxes
  const GAP = 12;
  const BOX_W = Math.floor((PAGE_W - 2 * M - GAP) / 2);
  const BOX_H = 250;

  const urls = (data.photo_urls || []).slice(0, 2);
  const boxes = [
    { x: M, y: y - BOX_H, w: BOX_W, h: BOX_H, url: urls[0] },
    { x: M + BOX_W + GAP, y: y - BOX_H, w: BOX_W, h: BOX_H, url: urls[1] },
  ];

  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    drawRect(page, b.x, b.y, b.w, b.h);

    // Rasterize to oriented JPEG bytes before embedding (matches Excel export).
    const jpegBytes = await rasterizeToJPEGBytes(b.url);
    if (!jpegBytes) continue;

    const img = await pdfDoc.embedJpg(jpegBytes);
    const scale = Math.min(b.w / img.width, b.h / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawImage(img, { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, width: w, height: h });
  }

  // Save + Download (with Safari-friendly fallback)
  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const name = `submission-${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
  downloadBlobWithFallback(blob, name);
}

export default { downloadSubmissionPdf };
