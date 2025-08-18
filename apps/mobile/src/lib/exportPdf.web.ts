// apps/mobile/src/lib/exportPdf.web.ts
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
};

// Small helpers
const PAGE_W = 612; // 8.5in * 72dpi
const PAGE_H = 792; // 11in * 72dpi
const M = 36;       // 0.5" margin

function text(page: any, str: string, x: number, y: number, size = 10, font: any) {
  page.drawText(str ?? '', { x, y, size, font, color: rgb(0, 0, 0) });
}
function rect(page: any, x: number, y: number, w: number, h: number) {
  page.drawRectangle({
    x, y, width: w, height: h, borderWidth: 1,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.46, 0.46, 0.46),
  });
}

async function bytesFromUrl(url?: string | null): Promise<ArrayBuffer | null> {
  if (!url) return null;

  // data: URL
  if (url.startsWith('data:')) {
    try {
      const base64 = url.split(',')[1] ?? '';
      const bin = atob(base64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return arr.buffer;
    } catch {
      return null;
    }
  }

  // blob:, http(s):
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export async function downloadSubmissionPdf(data: SubmissionPdf) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Title (STORE SITE)
  let y = PAGE_H - M;
  const TITLE_H = 22;
  rect(page, M, y - TITLE_H, PAGE_W - 2 * M, TITLE_H);
  text(page, (data.store_site || '').toUpperCase(), M + 6, y - 15, 12, bold);
  y -= TITLE_H;

  // Table rows
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

  for (const [label, value] of rows) {
    rect(page, M, y - ROW_H, LBL_W, ROW_H);
    rect(page, M + LBL_W, y - ROW_H, VAL_W, ROW_H);
    text(page, label.toUpperCase(), M + 6, y - 14, 10, bold);
    text(page, value || '', M + LBL_W + 6, y - 14, 10, font);
    y -= ROW_H;
  }

  // Photos header
  const HDR_H = 20;
  rect(page, M, y - HDR_H, PAGE_W - 2 * M, HDR_H);
  text(page, 'PHOTOS', M + 6, y - 14, 10, bold);
  y -= HDR_H;

  // Two photo boxes
  const GAP = 12;
  const BOX_W = Math.floor((PAGE_W - 2 * M - GAP) / 2);
  const BOX_H = 250;

  const boxes = [
    { x: M, y: y - BOX_H, w: BOX_W, h: BOX_H, url: (data.photo_urls || [])[0] },
    { x: M + BOX_W + GAP, y: y - BOX_H, w: BOX_W, h: BOX_H, url: (data.photo_urls || [])[1] },
  ];

  for (const b of boxes) {
    rect(page, b.x, b.y, b.w, b.h);
    const bytes = await bytesFromUrl(b.url);
    if (!bytes) continue;

    let img: any = null;
    try { img = await pdfDoc.embedJpg(bytes); } catch {}
    if (!img) { try { img = await pdfDoc.embedPng(bytes); } catch {} }
    if (!img) continue;

    const scale = Math.min(b.w / img.width, b.h / img.height);
    const w = img.width * scale, h = img.height * scale;
    page.drawImage(img, { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, width: w, height: h });
  }

  // Save + Download (must be triggered by a user gesture on some mobile browsers)
  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const name = `submission-${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Also provide a default object for defensive dynamic import code paths.
export default { downloadSubmissionPdf };
