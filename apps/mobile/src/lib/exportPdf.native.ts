// apps/mobile/src/lib/exportPdf.native.ts
import * as Print from 'expo-print';

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
  const [img1, img2] = (data.photo_urls || []).slice(0, 2);
  const esc = (s: string) =>
    (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"/><style>
  @page { size: Letter portrait; margin: 36pt; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; }
  .wrapper { width: 100%; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #777; padding: 6pt; font-size: 10pt; vertical-align: middle; }
  th.label { width: 38%; text-align: left; font-weight: 700; }
  td.value { width: 62%; }
  .title { font-weight: 700; }
  .photos h3 { margin: 10pt 0 6pt; font-size: 10pt; }
  .grid { display: table; width: 100%; table-layout: fixed; }
  .cell { display: table-cell; border: 1px solid #777; height: 250pt; vertical-align: middle; text-align: center; }
  img { max-width: 100%; max-height: 100%; }
</style></head>
<body>
  <div class="wrapper">
    <table>
      <tr><th colspan="2" class="title">${esc((data.store_site || '').toUpperCase())}</th></tr>
      <tr><th class="label">DATE</th><td class="value">${esc(data.date)}</td></tr>
      <tr><th class="label">BRAND</th><td class="value">${esc(data.brand)}</td></tr>
      <tr><th class="label">STORE LOCATION</th><td class="value">${esc(data.store_location)}</td></tr>
      <tr><th class="label">LOCATIONS</th><td class="value">${esc(data.location)}</td></tr>
      <tr><th class="label">CONDITIONS</th><td class="value">${esc(data.conditions)}</td></tr>
      <tr><th class="label">PRICE PER UNIT</th><td class="value">${esc(data.price_per_unit)}</td></tr>
      <tr><th class="label">SHELF SPACE</th><td class="value">${esc(data.shelf_space)}</td></tr>
      <tr><th class="label">ON SHELF</th><td class="value">${esc(data.on_shelf)}</td></tr>
      <tr><th class="label">TAGS</th><td class="value">${esc(data.tags)}</td></tr>
      <tr><th class="label">NOTES</th><td class="value">${esc(data.notes)}</td></tr>
    </table>
    <div class="photos">
      <h3>PHOTOS</h3>
      <div class="grid">
        <div class="cell">${img1 ? `<img src="${img1}"/>` : ''}</div>
        <div class="cell">${img2 ? `<img src="${img2}"/>` : ''}</div>
      </div>
    </div>
  </div>
</body></html>`;

  await Print.printAsync({ html });
}
