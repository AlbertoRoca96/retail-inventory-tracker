// apps/mobile/src/lib/exportPdf.web.ts
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
  photo_urls: string[];
};

export async function downloadSubmissionPdf(data: SubmissionPdf) {
  // 🚧 Robust dynamic import: avoid destructuring until the module is verified.
  let PDFLib: any;
  try {
    PDFLib = await import('pdf-lib');
  } catch (e) {
    throw new Error('Failed to load PDF engine (pdf-lib).');
  }
  const PDFDocument = PDFLib?.PDFDocument ?? PDFLib?.default?.PDFDocument;
  const StandardFonts = PDFLib?.StandardFonts ?? PDFLib?.default?.StandardFonts;
  const rgb = PDFLib?.rgb ?? PDFLib?.default?.rgb;
  if (!PDFDocument || !StandardFonts || !rgb) {
    throw new Error('PDF engine loaded but exports are missing.');
  }

  const PAGE_W = 612, PAGE_H = 792; // Letter 8.5x11 @72dpi
  const M = 36;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const drawText = (txt: string, x: number, y: number, size = 10, f = font) =>
    page.drawText(txt ?? '', { x, y, size, font: f, color: rgb(0, 0, 0) });

  const drawRect = (x: number, y: number, w: number, h: number) =>
    page.drawRectangle({
      x, y, width: w, height: h, borderWidth: 1,
      color: rgb(1, 1, 1), borderColor: rgb(0.46, 0.46, 0.46)
    });

  // Title
  let cursorY = PAGE_H - M;
  const TITLE_H = 22;
  drawRect(M, cursorY - TITLE_H, PAGE_W - 2 * M, TITLE_H);
  drawText((data.store_site || '').toUpperCase(), M + 6, cursorY - 15, 12, bold);
  cursorY -= TITLE_H;

  // Rows
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

  for (const pair of rows) {
    const label = pair?.[0] ?? '';
    const value = pair?.[1] ?? '';
    drawRect(M, cursorY - ROW_H, LBL_W, ROW_H);
    drawRect(M + LBL_W, cursorY - ROW_H, VAL_W, ROW_H);
    drawText(String(label).toUpperCase(), M + 6, cursorY - 14, 10, bold);
    drawText(String(value), M + LBL_W + 6, cursorY - 14, 10, font);
    cursorY -= ROW_H;
  }

  // Photos
  const HDR_H = 20;
  drawRect(M, cursorY - HDR_H, PAGE_W - 2 * M, HDR_H);
  drawText('PHOTOS', M + 6, cursorY - 14, 10, bold);
  cursorY -= HDR_H;

  const GAP = 12;
  const BOX_W = Math.floor((PAGE_W - 2 * M - GAP) / 2);
  const BOX_H = 250;
  const urls = Array.isArray(data.photo_urls) ? data.photo_urls.slice(0, 2) : [];
  const boxes = [
    { x: M, y: cursorY - BOX_H, w: BOX_W, h: BOX_H, url: urls[0] },
    { x: M + BOX_W + GAP, y: cursorY - BOX_H, w: BOX_W, h: BOX_H, url: urls[1] },
  ];

  const fetchBytes = async (url?: string) => {
    if (!url) return null;
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      return await r.arrayBuffer();
    } catch {
      return null;
    }
  };

  for (const b of boxes) {
    drawRect(b.x, b.y, b.w, b.h);
    const bytes = await fetchBytes(b.url);
    if (!bytes) continue;

    let img: any = null;
    try { img = await pdfDoc.embedJpg(bytes); } catch {}
    if (!img) {
      try { img = await pdfDoc.embedPng(bytes); } catch {}
    }
    if (!img) continue;

    const scale = Math.min(b.w / img.width, b.h / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawImage(img, { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, width: w, height: h });
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const name = `submission-${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;

  // ✅ User-gesture friendly download; works on iOS Safari when invoked from a tap.
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 2000);
}
