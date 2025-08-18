// apps/mobile/src/lib/exportPdf.ts
import { Platform } from 'react-native';
import * as Print from 'expo-print';

export type SubmissionPdf = {
  date: string;
  brand: string;
  store_site: string;
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

// Reuse the same orientation-safe approach you used for Excel: rasterize on a canvas.
async function toDataUrl(url: string): Promise<string> {
  let src = url;
  if (/^https?:/i.test(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
    const blob = await res.blob();
    src = URL.createObjectURL(blob);
  }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = src;
  });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || (img.width as number);
  c.height = img.naturalHeight || (img.height as number);
  c.getContext('2d')!.drawImage(img, 0, 0);
  if (src.startsWith('blob:') && src !== url) URL.revokeObjectURL(src);
  return c.toDataURL('image/jpeg', 0.92);
}

export async function downloadSubmissionPdf(row: SubmissionPdf) {
  const photos = row.photo_urls.slice(0, 2);
  const settled = await Promise.allSettled(photos.map(toDataUrl));
  const img0 = settled[0]?.status === 'fulfilled' ? settled[0].value : '';
  const img1 = settled[1]?.status === 'fulfilled' ? settled[1].value : '';

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  @page { size: A4; margin: 36pt; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
  .sheet { width: 720px; margin: 0 auto; } /* centered */
  table { width: 100%; border-collapse: collapse; }
  td { border: 1px solid #222; padding: 6pt; vertical-align: middle; }
  .label { font-weight: 700; text-transform: uppercase; width: 42%; }
  .value { width: 58%; }
  .photos-hdr td { font-weight: 700; }
  .photo-grid { width: 100%; table-layout: fixed; }
  .photo-grid td { height: 260pt; } /* close to your Excel box */
  .photo-grid img { width: 100%; height: 100%; object-fit: contain; display: block; }
</style>
</head>
<body>
  <div class="sheet">
    <table>
      <tr><td class="label">DATE</td><td class="value">${escapeHtml(row.date)}</td></tr>
      <tr><td class="label">BRAND</td><td class="value">${escapeHtml(row.brand)}</td></tr>
      <tr><td class="label">STORE SITE</td><td class="value">${escapeHtml(row.store_site)}</td></tr>
      <tr><td class="label">STORE LOCATION</td><td class="value">${escapeHtml(row.store_location)}</td></tr>
      <tr><td class="label">LOCATIONS</td><td class="value">${escapeHtml(row.location)}</td></tr>
      <tr><td class="label">CONDITIONS</td><td class="value">${escapeHtml(row.conditions)}</td></tr>
      <tr><td class="label">PRICE PER UNIT</td><td class="value">${escapeHtml(row.price_per_unit)}</td></tr>
      <tr><td class="label">SHELF SPACE</td><td class="value">${escapeHtml(row.shelf_space)}</td></tr>
      <tr><td class="label">ON SHELF</td><td class="value">${escapeHtml(row.on_shelf)}</td></tr>
      <tr><td class="label">TAGS</td><td class="value">${escapeHtml(row.tags)}</td></tr>
      <tr><td class="label">NOTES</td><td class="value">${escapeHtml(row.notes)}</td></tr>
      <tr class="photos-hdr"><td colspan="2">PHOTOS</td></tr>
      <tr>
        <td colspan="2" style="padding:0">
          <table class="photo-grid">
            <tr>
              <td>${img0 ? `<img src="${img0}" />` : ''}</td>
              <td>${img1 ? `<img src="${img1}" />` : ''}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;

  // print to a PDF file (works on web and native)
  const { uri } = await Print.printToFileAsync({ html });
  const fname = `submission-${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;

  if (Platform.OS === 'web') {
    // On web, the URI is a blob URL; download it directly.
    const a = document.createElement('a');
    a.href = uri;
    a.download = fname;
    a.click();
  } else {
    // On native, open the print dialog so the user can save/share the PDF
    await Print.printAsync({ html });
  }
}

function escapeHtml(s: string) {
  return (s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}
