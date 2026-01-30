// apps/mobile/src/lib/documentPreview.ts
// On-device previews for chat attachments.
//
// Goal: Slack-ish previews without relying on Office Online (which fails for signed URLs).
// Keep it small, deterministic, and resource-bounded.

import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';

import type { AttachmentMeta } from './attachmentViewer';
import { downloadToTemp } from './attachmentViewer';

export type DocumentPreviewResult = {
  html: string;
  title: string;
  localUri: string;
};

const MAX_BYTES_FOR_PREVIEW = 3_000_000; // 3MB (YAGNI: raise when we actually need it)
const MAX_ROWS = 60;
const MAX_COLS = 20;

function escapeHtml(s: unknown): string {
  const str = s == null ? '' : String(s);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildHtmlTable(grid: unknown[][], title: string) {
  const rows = grid.slice(0, MAX_ROWS);
  const colCount = Math.min(
    MAX_COLS,
    rows.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0)
  );

  const thead = rows.length
    ? `<thead><tr>${Array.from({ length: colCount })
        .map((_, i) => `<th>${escapeHtml(rows[0]?.[i] ?? '')}</th>`)
        .join('')}</tr></thead>`
    : '';

  const bodyRows = rows.length ? rows.slice(1) : [];
  const tbody = `<tbody>${bodyRows
    .map((r) => {
      const cells = Array.from({ length: colCount })
        .map((_, i) => `<td>${escapeHtml((r as any)?.[i] ?? '')}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('')}</tbody>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial; margin: 0; padding: 12px; background: #f8fafc; }
  .title { font-size: 16px; font-weight: 800; margin: 0 0 10px; color: #0f172a; }
  .meta { font-size: 12px; color: #64748b; margin: 0 0 12px; }
  .wrap { overflow: auto; border: 1px solid #e5e7eb; border-radius: 12px; background: #fff; }
  table { border-collapse: collapse; width: 100%; min-width: 600px; }
  th, td { border-bottom: 1px solid #e5e7eb; border-right: 1px solid #f1f5f9; padding: 8px; font-size: 12px; vertical-align: top; }
  th { position: sticky; top: 0; background: #f1f5f9; text-align: left; font-weight: 800; color: #0f172a; }
  tr:last-child td { border-bottom: none; }
  td:last-child, th:last-child { border-right: none; }
</style>
</head>
<body>
  <h1 class="title">${escapeHtml(title)}</h1>
  <p class="meta">Preview limited to ${MAX_ROWS} rows × ${MAX_COLS} columns.</p>
  <div class="wrap">
    <table>
      ${thead}
      ${tbody}
    </table>
  </div>
</body>
</html>`;
}

async function ensurePreviewableSize(localUri: string) {
  const info = await FileSystem.getInfoAsync(localUri, { size: true });
  const size = (info as any)?.size as number | undefined;
  if (typeof size === 'number' && size > MAX_BYTES_FOR_PREVIEW) {
    throw new Error(`File is too large to preview (${Math.round(size / 1024)}KB). Use Share/Download instead.`);
  }
}

export async function buildDocumentPreview(meta: AttachmentMeta): Promise<DocumentPreviewResult> {
  const localUri = await downloadToTemp(meta);
  await ensurePreviewableSize(localUri);

  if (meta.kind === 'csv') {
    const text = await FileSystem.readAsStringAsync(localUri);
    const lines = text.split(/\r?\n/).filter(Boolean);
    const grid: string[][] = lines.slice(0, MAX_ROWS).map((line) => {
      // Very small CSV parser: good enough for our exports.
      // If you throw monster quoted CSVs at it, that's on you.
      return line.split(',').slice(0, MAX_COLS);
    });
    return { html: buildHtmlTable(grid, meta.name), title: meta.name, localUri };
  }

  if (meta.kind === 'excel') {
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (!base64) throw new Error('Unable to read spreadsheet data');

    const wb = XLSX.read(base64, { type: 'base64' });
    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) throw new Error('Spreadsheet has no sheets');

    const sheet = wb.Sheets[sheetName];
    const grid = (XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: false,
      raw: false,
    }) as unknown[][]) || [[]];

    return {
      html: buildHtmlTable(grid, `${meta.name} — ${sheetName}`),
      title: meta.name,
      localUri,
    };
  }

  throw new Error(`No preview builder for kind=${meta.kind}`);
}
