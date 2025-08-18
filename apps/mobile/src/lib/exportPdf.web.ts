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
  photo_urls: string[]; // up to 2
};

export async function downloadSubmissionPdf(data: SubmissionPdf) {
  const [img1, img2] = (data.photo_urls || []).slice(0, 2);

  const esc = (s: string) =>
    (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Submission</title>
  <style>
    @page { size: Letter portrait; margin: 0.5in; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; }
    .wrapper { width: 7.5in; margin: 0 auto; }
    table { width: 100%; border-collapse: collapse; }
    td, th { border: 1px solid #777; padding: 6px; font-size: 12px; vertical-align: middle; }
    th.label { width: 38%; text-align: left; font-weight: 700; }
    td.value { width: 62%; }
    .title { font-weight: 700; }
    .photos h3 { margin: 10px 0 6px; font-size: 12px; }
    .photo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .photo-box { border: 1px solid #777; height: 3.4in; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .photo-box img { max-width: 100%; max-height: 100%; display: block; }
  </style>
</head>
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
      <div class="photo-grid">
        <div class="photo-box">${img1 ? `<img src="${img1}"/>` : ''}</div>
        <div class="photo-box">${img2 ? `<img src="${img2}"/>` : ''}</div>
      </div>
    </div>
  </div>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => window.print(), 50);
    });
  </script>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
