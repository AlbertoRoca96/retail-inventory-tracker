// apps/mobile/src/lib/exportPdf.native.ts

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

type BuildOptions = {
  /** If true, photos are fetched and embedded as data URIs inside the HTML before printing. */
  inlineImages?: boolean;
  /** Optional filename prefix; final file is "<prefix>-<iso>.pdf" */
  fileNamePrefix?: string;
};

/** Escape text for HTML */
const esc = (s: string) =>
  (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Convert a local/remote/data URL to a data URI string (jpeg by default). */
async function toDataUri(url?: string | null, mime = 'image/jpeg'): Promise<string | null> {
  if (!url) return null;

  // Already a data URI
  if (url.startsWith('data:')) return url;

  const FileSystem = await import('expo-file-system');

  try {
    let localPath = url;

    // If it's not a file/content URI, download to cache first.
    if (!/^file:|^content:/i.test(url)) {
      const name = `img-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const target = (FileSystem.cacheDirectory || FileSystem.documentDirectory!) + name;
      const { uri } = await FileSystem.downloadAsync(url, target);
      localPath = uri;
    }

    // Read bytes → base64 → data URI
    const base64 = await FileSystem.readAsStringAsync(localPath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:${mime};base64,${base64}`;
  } catch {
    // Swallow; image will just be omitted if something fails
    return null;
  }
}

/**
 * Build the PDF and return the **file URI**.
 * - Mirrors Excel layout & your previous HTML.
 * - If `inlineImages` is true, photos are embedded as data URIs for reliability.
 */
export async function createSubmissionPdf(
  data: SubmissionPdf,
  opts: BuildOptions = {}
): Promise<string> {
  const Print = await import('expo-print');
  const FileSystem = await import('expo-file-system');

  // Prepare up to two photos
  const [raw1, raw2] = (data.photo_urls || []).slice(0, 2);
  const inline = !!opts.inlineImages;

  const img1 = inline ? await toDataUri(raw1) : raw1 || '';
  const img2 = inline ? await toDataUri(raw2) : raw2 || '';

  // HTML layout (mirrors Excel)
  const html = `<!doctype html>
<html><head><meta charset="utf-8"/><style>
  @page { size: Letter portrait; margin: 36pt; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; margin: 0; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #777; padding: 6pt; font-size: 10pt; vertical-align: middle; }
  th.label { width: 38%; text-align: left; font-weight: 700; }
  td.value { width: 62%; }
  .title { font-weight: 700; }
  .photos h3 { margin: 10pt 0 6pt; font-size: 10pt; }
  .grid { display: table; width: 100%; table-layout: fixed; }
  .cell { display: table-cell; border: 1px solid #777; height: 250pt; vertical-align: middle; text-align: center; background: #fff; }
  img { max-width: 100%; max-height: 100%; object-fit: contain; }
</style></head>
<body>
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
</body></html>`;

  // 1) Render HTML → PDF file on device
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  // 2) Give it a nice name and move into app documents folder
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = opts.fileNamePrefix || 'submission';
  const fileName = `${prefix}-${iso}.pdf`;
  const dest = `${FileSystem.documentDirectory}${fileName}`;

  try {
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    // If copy fails, just return the original temporary file
    return uri;
  }
}

/**
 * Previous behavior: build the PDF then open the share sheet / print dialog.
 * Returns the file URI either way.
 */
export async function downloadSubmissionPdf(data: SubmissionPdf): Promise<string> {
  const uri = await createSubmissionPdf(data, { inlineImages: true, fileNamePrefix: 'submission' });
  const FileSystem = await import('expo-file-system');

  // Sanity: make sure the file exists before trying to share/print
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return uri;
  } catch {}

  let Sharing: typeof import('expo-sharing') | null = null;
  try {
    Sharing = await import('expo-sharing');
  } catch {
    Sharing = null;
  }

  await shareIfPossible(uri, Sharing);
  return uri;
}

async function shareIfPossible(
  fileUri: string,
  Sharing: typeof import('expo-sharing') | null
) {
  try {
    if (Sharing && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(fileUri, {
        UTI: 'com.adobe.pdf',
        mimeType: 'application/pdf',
      });
    } else {
      // Fallback: open native print dialog
      const Print = await import('expo-print');
      await Print.printAsync({ uri: fileUri });
    }
  } catch {
    // swallow; don't block the flow if user cancels or share fails
  }
  return fileUri;
}

// Keep a default export shape if other modules import it that way.
export default { createSubmissionPdf, downloadSubmissionPdf };
