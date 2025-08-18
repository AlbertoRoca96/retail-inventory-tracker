// apps/mobile/src/lib/exportPdf.web.ts
// Web-only PDF generator with defensive (Safari-friendly) patterns.

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

// Page constants
const PAGE_W = 612; // 8.5in * 72dpi
const PAGE_H = 792; // 11in * 72dpi
const M = 36;       // 0.5" margin

// --- small helpers (no destructuring) ---
function drawText(page: any, str: string, x: number, y: number, size: number, font: any, rgb: any) {
  page.drawText(str ?? "", { x, y, size, font, color: rgb(0, 0, 0) });
}
function drawRect(page: any, x: number, y: number, w: number, h: number, rgb: any) {
  page.drawRectangle({
    x, y, width: w, height: h, borderWidth: 1,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.46, 0.46, 0.46),
  });
}

async function bytesFromUrl(url?: string | null): Promise<ArrayBuffer | null> {
  if (!url) return null;

  // data: URL
  if (url.startsWith("data:")) {
    try {
      const base64 = url.split(",")[1] ?? "";
      const bin = (globalThis.atob as any)(base64);
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
  // Load pdf-lib lazily and avoid destructuring in case the import fails
  let pdfLib: any;
  try {
    pdfLib = await import("pdf-lib");
  } catch {
    throw new Error("Failed to load PDF engine (pdf-lib).");
  }
  const PDFDocument = pdfLib && pdfLib.PDFDocument;
  const StandardFonts = pdfLib && pdfLib.StandardFonts;
  const rgb = pdfLib && pdfLib.rgb;
  if (!PDFDocument || !StandardFonts || !rgb) {
    throw new Error("Failed to load PDF engine (pdf-lib).");
  }

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Title (STORE SITE)
  let y = PAGE_H - M;
  const TITLE_H = 22;
  drawRect(page, M, y - TITLE_H, PAGE_W - 2 * M, TITLE_H, rgb);
  drawText(page, (data.store_site || "").toUpperCase(), M + 6, y - 15, 12, bold, rgb);
  y -= TITLE_H;

  // Table rows (avoid array-destructuring in the loop)
  const rows: Array<[string, string]> = [
    ["DATE", data.date],
    ["BRAND", data.brand],
    ["STORE LOCATION", data.store_location],
    ["LOCATIONS", data.location],
    ["CONDITIONS", data.conditions],
    ["PRICE PER UNIT", data.price_per_unit],
    ["SHELF SPACE", data.shelf_space],
    ["ON SHELF", data.on_shelf],
    ["TAGS", data.tags],
    ["NOTES", data.notes],
  ];

  const ROW_H = 20;
  const LBL_W = Math.round((PAGE_W - 2 * M) * 0.38);
  const VAL_W = (PAGE_W - 2 * M) - LBL_W;

  for (let i = 0; i < rows.length; i++) {
    const pair = rows[i] || (["", ""] as [string, string]);
    const label = pair[0] ?? "";
    const value = pair[1] ?? "";
    drawRect(page, M, y - ROW_H, LBL_W, ROW_H, rgb);
    drawRect(page, M + LBL_W, y - ROW_H, VAL_W, ROW_H, rgb);
    drawText(page, String(label).toUpperCase(), M + 6, y - 14, 10, bold, rgb);
    drawText(page, String(value), M + LBL_W + 6, y - 14, 10, font, rgb);
    y -= ROW_H;
  }

  // Photos header
  const HDR_H = 20;
  drawRect(page, M, y - HDR_H, PAGE_W - 2 * M, HDR_H, rgb);
  drawText(page, "PHOTOS", M + 6, y - 14, 10, bold, rgb);
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
    drawRect(page, b.x, b.y, b.w, b.h, rgb);

    const bytes = await bytesFromUrl(b.url);
    if (!bytes) continue;

    let img: any = null;
    try { img = await pdfDoc.embedJpg(bytes); } catch {}
    if (!img) { try { img = await pdfDoc.embedPng(bytes); } catch {} }
    if (!img) continue;

    const scale = Math.min(b.w / img.width, b.h / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawImage(img, { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, width: w, height: h });
  }

  // Save + Download
  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const name = `submission-${new Date().toISOString().replace(/[:.]/g, "-")}.pdf`;

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Keep a default export shape for defensive dynamic import code paths
export default { downloadSubmissionPdf };
