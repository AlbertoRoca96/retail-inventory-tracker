// supabase/document-preview/functions/index.ts
// Supabase Edge Function: document-preview
//
// Purpose:
// Generate a lightweight HTML preview for chat attachments (XLSX/CSV)
// server-side, so the mobile client doesn't need to parse huge files.
//
// Deploy:
//   supabase functions deploy document-preview --no-verify-jwt
//
// POST /functions/v1/document-preview
// Authorization: Bearer <user_jwt>
//
// Body (preferred):
//   {
//     kind: 'submission_message' | 'direct_message',
//     id: string,
//     max_rows?: number,
//     max_cols?: number
//   }
//
// Body (fallback):
//   {
//     team_id: string,
//     bucket?: string,
//     path: string,
//     attachment_type?: 'excel' | 'csv' | 'image' | 'pdf' | 'word' | 'powerpoint' | 'file',
//     max_rows?: number,
//     max_cols?: number
//   }
//
// Notes:
// - Validates team membership (team_members)
// - Downloads from Storage using service role key
// - Parses XLSX using SheetJS in array mode (NO base64) to reduce memory

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5?target=es2020&no-check';
import JSZip from 'https://esm.sh/jszip@3.10.1?target=es2020';
import { XMLParser } from 'https://esm.sh/fast-xml-parser@4.4.1?target=es2020';
import * as ImageScript from 'https://deno.land/x/imagescript@1.2.15/mod.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY')!;

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function encodeStoragePath(path: string): string {
  return (path || '')
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

function escapeHtml(s: unknown): string {
  const str = s == null ? '' : String(s);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function buildHtmlTable(opts: {
  title: string;
  grid: unknown[][];
  maxRows: number;
  maxCols: number;
  imagesByCell?: Record<string, EmbeddedImage[]>;
  imagesMeta?: { included: number; omitted: number; omittedBytes: number };
}): string {
  const title = opts.title;
  const maxRows = clamp(opts.maxRows, 5, 500);
  const maxCols = clamp(opts.maxCols, 5, 60);

  const rows = (opts.grid || []).slice(0, maxRows);
  const colCount = Math.min(
    maxCols,
    rows.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0)
  );

  const imagesByCell = opts.imagesByCell || {};
  const imgMeta = opts.imagesMeta;

  const renderCell = (rowIndex: number, colIndex: number, value: unknown, tag: 'td' | 'th') => {
    const key = `${rowIndex}:${colIndex}`;
    const imgs = imagesByCell[key] || [];

    const textHtml = escapeHtml(value ?? '');
    const imagesHtml = imgs.length
      ? `<div class="cell-images">${imgs
          .map((img) => `<img class="cell-img" src="${img.dataUri}" alt="Embedded image" />`)
          .join('')}</div>`
      : '';

    return `<${tag}><div class="cell-text">${textHtml}</div>${imagesHtml}</${tag}>`;
  };

  const header = rows.length ? rows[0] : [];
  const thead = rows.length
    ? `<thead><tr>${Array.from({ length: colCount })
        .map((_, i) => renderCell(0, i, (header as any)?.[i] ?? '', 'th'))
        .join('')}</tr></thead>`
    : '';

  const bodyRows = rows.length ? rows.slice(1) : [];
  const tbody = `<tbody>${bodyRows
    .map((r, idx) => {
      const rowIndex = idx + 1; // account for header row
      const cells = Array.from({ length: colCount })
        .map((_, i) => renderCell(rowIndex, i, (r as any)?.[i] ?? '', 'td'))
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('')}</tbody>`;

  const imageNote = imgMeta
    ? `<p class="meta">Embedded images: ${imgMeta.included} included` +
      `${imgMeta.omitted ? `, ${imgMeta.omitted} omitted (${Math.round(imgMeta.omittedBytes / 1024)} KB over limit)` : ''}.` +
      `</p>`
    : '';

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
  .cell-text { white-space: pre-wrap; word-break: break-word; }
  .cell-images { margin-top: 6px; display: grid; gap: 6px; }
  .cell-img { max-width: 220px; max-height: 160px; width: auto; height: auto; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; }
</style>
</head>
<body>
  <h1 class="title">${escapeHtml(title)}</h1>
  <p class="meta">Preview limited to ${maxRows} rows × ${maxCols} columns.</p>
  ${imageNote}
  <div class="wrap">
    <table>
      ${thead}
      ${tbody}
    </table>
  </div>
</body>
</html>`;
}

function parseSupabaseStorageUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (!/supabase\.co$/i.test(parsed.hostname)) return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    const objectIndex = parts.indexOf('object');
    if (objectIndex === -1 || parts.length < objectIndex + 3) return null;
    const bucket = parts[objectIndex + 2];
    const key = parts.slice(objectIndex + 3).join('/');
    if (!bucket || !key) return null;
    return { bucket, key };
  } catch {
    return null;
  }
}

function looksLikeHttp(s: string) {
  return /^https?:/i.test((s || '').trim());
}

type AttachmentType = 'excel' | 'csv' | 'image' | 'pdf' | 'word' | 'powerpoint' | 'file';

function normalizeAttachmentType(input: unknown): AttachmentType {
  const t = String(input || '').toLowerCase().trim();

  if (t === 'csv') return 'csv';
  if (t === 'excel' || t === 'xlsx' || t === 'spreadsheet') return 'excel';

  if (t === 'image' || t === 'photo' || t === 'jpg' || t === 'jpeg' || t === 'png') return 'image';
  if (t === 'pdf') return 'pdf';

  if (t === 'word' || t === 'doc' || t === 'docx') return 'word';
  if (t === 'powerpoint' || t === 'ppt' || t === 'pptx') return 'powerpoint';

  return 'file';
}

async function requireTeamMembership(
  admin: ReturnType<typeof createClient>,
  teamId: string,
  userId: string
) {
  const { data: member, error } = await admin
    .from('team_members')
    .select('team_id,user_id')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!member) throw new Error('forbidden');
}

type AttachmentRef = {
  teamId: string;
  attachmentType: AttachmentType;
  bucket: string;
  path: string;
  title: string;
};

async function resolveAttachmentRef(
  admin: ReturnType<typeof createClient>,
  body: any
): Promise<AttachmentRef> {
  const kind = String(body?.kind || '').trim();
  const id = String(body?.id || '').trim();

  if (kind && id) {
    if (kind === 'submission_message') {
      const { data, error } = await admin
        .from('submission_messages')
        .select('id,team_id,attachment_path,attachment_type')
        .eq('id', id)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) throw new Error('message_not_found');

      const teamId = data.team_id as string;
      const attachmentType = normalizeAttachmentType(data.attachment_type);

      const rawPath = String(data.attachment_path || '').trim();
      if (!rawPath) throw new Error('missing_attachment');

      if (looksLikeHttp(rawPath)) {
        const parsed = parseSupabaseStorageUrl(rawPath);
        if (!parsed) throw new Error('attachment_url_not_supported');
        return {
          teamId,
          attachmentType,
          bucket: parsed.bucket,
          path: parsed.key,
          title: `Attachment (${attachmentType.toUpperCase()})`,
        };
      }

      return {
        teamId,
        attachmentType,
        bucket: attachmentType === 'csv' ? 'submission-csvs' : 'chat',
        path: rawPath,
        title: `Attachment (${attachmentType.toUpperCase()})`,
      };
    }

    if (kind === 'direct_message') {
      const { data, error } = await admin
        .from('direct_messages')
        .select('id,team_id,attachment_url,attachment_type')
        .eq('id', id)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) throw new Error('message_not_found');

      const teamId = data.team_id as string;
      const attachmentType = normalizeAttachmentType(data.attachment_type);

      const rawPath = String(data.attachment_url || '').trim();
      if (!rawPath) throw new Error('missing_attachment');

      if (looksLikeHttp(rawPath)) {
        const parsed = parseSupabaseStorageUrl(rawPath);
        if (!parsed) throw new Error('attachment_url_not_supported');
        return {
          teamId,
          attachmentType,
          bucket: parsed.bucket,
          path: parsed.key,
          title: `Attachment (${attachmentType.toUpperCase()})`,
        };
      }

      return {
        teamId,
        attachmentType,
        bucket: attachmentType === 'csv' ? 'submission-csvs' : 'chat',
        path: rawPath,
        title: `Attachment (${attachmentType.toUpperCase()})`,
      };
    }

    throw new Error('invalid_kind');
  }

  // Fallback: direct preview by team_id + path (+ optional bucket)
  const teamId = String(body?.team_id || '').trim();
  const path = String(body?.path || '').trim();
  const attachmentType = normalizeAttachmentType(body?.attachment_type ?? 'file');
  const bucket = String(
    body?.bucket || (attachmentType === 'csv' ? 'submission-csvs' : 'chat')
  ).trim();

  if (!teamId) throw new Error('team_id required');
  if (!path) throw new Error('path required');

  return {
    teamId,
    attachmentType,
    bucket,
    path,
    title: `Attachment (${attachmentType.toUpperCase()})`,
  };
}

async function downloadObjectBytes(bucket: string, path: string): Promise<Uint8Array> {
  const encoded = encodeStoragePath(path);
  const url = `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/authenticated/${bucket}/${encoded}`;

  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`download_failed ${res.status}: ${t || 'no body'}`);
  }

  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

function parseCsvToGrid(text: string, maxRows: number, maxCols: number): string[][] {
  // Very small CSV parser: good enough for our exports.
  // Full RFC quoting not needed unless we discover real-world files that demand it.
  const rows = text.split(/\r?\n/).filter(Boolean).slice(0, maxRows);
  return rows.map((line) => line.split(',').slice(0, maxCols));
}

type EmbeddedImage = {
  mime: string;
  dataUri: string;
  bytes: number;
};

type ExtractImagesResult = {
  imagesByCell: Record<string, EmbeddedImage[]>;
  included: number;
  omitted: number;
  omittedBytes: number;
};

function guessImageMimeFromPath(p: string): string {
  const lower = (p || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  return 'application/octet-stream';
}

function toBase64(bytes: Uint8Array): string {
  // Avoid stack explosions on big arrays by chunking.
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function maybeMakeThumbnail(
  bytes: Uint8Array,
  mime: string,
  opts: { maxDim: number; jpegQuality: number }
): Promise<{ bytes: Uint8Array; mime: string }> {
  const lower = (mime || '').toLowerCase();
  const supported =
    lower === 'image/png' ||
    lower === 'image/jpeg' ||
    lower === 'image/jpg' ||
    lower === 'image/webp' ||
    lower === 'image/gif' ||
    lower === 'image/bmp';

  if (!supported) return { bytes, mime };

  try {
    const img = await ImageScript.Image.decode(bytes);

    const maxDim = clamp(opts.maxDim, 64, 2048);
    const jpegQuality = clamp(opts.jpegQuality, 20, 95);

    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const targetW = Math.max(1, Math.round(img.width * scale));
    const targetH = Math.max(1, Math.round(img.height * scale));

    const resized = scale < 1 ? img.resize(targetW, targetH) : img;

    // Encode as JPEG for size. (Even if original was PNG)
    const out = await resized.encodeJPEG(jpegQuality);
    return { bytes: new Uint8Array(out), mime: 'image/jpeg' };
  } catch {
    // If decoding fails, fall back to original bytes.
    return { bytes, mime };
  }
}

function normalizeZipPath(p: string): string {
  return String(p || '').replace(/^\//, '');
}

function joinZipPath(baseDir: string, rel: string): string {
  // baseDir like "xl/drawings" (no trailing slash)
  const raw = `${baseDir}/${rel}`;
  const parts = raw.split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}

function xmlParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
  });
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

async function extractXlsxImagesByCell(
  xlsxBytes: Uint8Array,
  opts: { maxRows: number; maxCols: number; maxImages: number; maxTotalImageBytes: number }
): Promise<ExtractImagesResult> {
  const maxRows = clamp(opts.maxRows, 5, 500);
  const maxCols = clamp(opts.maxCols, 5, 60);
  const maxImages = clamp(opts.maxImages, 0, 50);
  const maxTotalImageBytes = clamp(opts.maxTotalImageBytes, 0, 8_000_000);

  const out: ExtractImagesResult = {
    imagesByCell: {},
    included: 0,
    omitted: 0,
    omittedBytes: 0,
  };

  if (maxImages === 0 || maxTotalImageBytes === 0) return out;

  const zip = await JSZip.loadAsync(xlsxBytes);
  const parser = xmlParser();

  // We only preview the first sheet for now.
  const sheetPath = 'xl/worksheets/sheet1.xml';
  const sheetEntry = zip.file(sheetPath);
  if (!sheetEntry) return out;

  const sheetXml = await sheetEntry.async('text');
  const sheetJson = parser.parse(sheetXml);

  // Find drawing relationship id: worksheet.drawing[@_r:id]
  const drawingNode = sheetJson?.worksheet?.drawing;
  const drawingRelId = drawingNode?.['@_r:id'] || drawingNode?.['@_id'];
  if (!drawingRelId) return out;

  // Resolve worksheet rels to drawing target.
  const sheetRelsPath = 'xl/worksheets/_rels/sheet1.xml.rels';
  const sheetRelsEntry = zip.file(sheetRelsPath);
  if (!sheetRelsEntry) return out;

  const sheetRelsXml = await sheetRelsEntry.async('text');
  const sheetRelsJson = parser.parse(sheetRelsXml);
  const rels = asArray(sheetRelsJson?.Relationships?.Relationship);
  const drawingRel = rels.find((r: any) => String(r?.['@_Id'] || '') === String(drawingRelId));
  const drawingTarget = String(drawingRel?.['@_Target'] || '');
  if (!drawingTarget) return out;

  // drawingTarget is relative to xl/worksheets/
  const drawingPath = normalizeZipPath(joinZipPath('xl/worksheets', drawingTarget));
  const drawingEntry = zip.file(drawingPath);
  if (!drawingEntry) return out;

  // Resolve drawing rels (embed id -> media target)
  const drawingFileName = drawingPath.split('/').pop() || 'drawing1.xml';
  const drawingDir = drawingPath.split('/').slice(0, -1).join('/');
  const drawingRelsPath = `${drawingDir}/_rels/${drawingFileName}.rels`;
  const drawingRelsEntry = zip.file(drawingRelsPath);
  if (!drawingRelsEntry) return out;

  const drawingRelsXml = await drawingRelsEntry.async('text');
  const drawingRelsJson = parser.parse(drawingRelsXml);
  const drawingRels = asArray(drawingRelsJson?.Relationships?.Relationship);
  const embedToTarget = new Map<string, string>();
  for (const r of drawingRels as any[]) {
    const id = String(r?.['@_Id'] || '');
    const target = String(r?.['@_Target'] || '');
    if (id && target) embedToTarget.set(id, target);
  }

  const drawingXml = await drawingEntry.async('text');
  const drawingJson = parser.parse(drawingXml);

  // xdr:wsDr -> twoCellAnchor/oneCellAnchor
  const wsDr = drawingJson?.wsDr;
  const anchors = [
    ...asArray(wsDr?.twoCellAnchor),
    ...asArray(wsDr?.oneCellAnchor),
  ];

  let totalIncludedBytes = 0;

  for (const anchor of anchors as any[]) {
    const from = anchor?.from;
    const col = Number(from?.col ?? from?.['xdr:col'] ?? 0);
    const row = Number(from?.row ?? from?.['xdr:row'] ?? 0);

    // Only render images that land within our preview grid.
    if (!Number.isFinite(col) || !Number.isFinite(row)) continue;
    if (row < 0 || col < 0) continue;
    if (row >= maxRows || col >= maxCols) continue;

    const pic = anchor?.pic;
    const blip = pic?.blipFill?.blip;
    const embedId = String(blip?.['@_embed'] || '');
    if (!embedId) continue;

    const mediaTargetRel = embedToTarget.get(embedId);
    if (!mediaTargetRel) continue;

    // mediaTargetRel is relative to xl/drawings/
    const mediaPath = normalizeZipPath(joinZipPath('xl/drawings', mediaTargetRel));
    const mediaEntry = zip.file(mediaPath);
    if (!mediaEntry) continue;

    const mediaBytes = new Uint8Array(await mediaEntry.async('uint8array'));

    const originalMime = guessImageMimeFromPath(mediaPath);

    // Make thumbnails so we can actually embed them in the HTML without blowing up.
    const thumb = await maybeMakeThumbnail(mediaBytes, originalMime, { maxDim: 900, jpegQuality: 70 });

    if (out.included >= maxImages || totalIncludedBytes + thumb.bytes.length > maxTotalImageBytes) {
      out.omitted += 1;
      out.omittedBytes += thumb.bytes.length;
      continue;
    }

    const b64 = toBase64(thumb.bytes);
    const dataUri = `data:${thumb.mime};base64,${b64}`;

    const key = `${row}:${col}`;
    out.imagesByCell[key] ||= [];
    out.imagesByCell[key].push({ mime, dataUri, bytes: mediaBytes.length });

    out.included += 1;
    totalIncludedBytes += mediaBytes.length;
  }

  return out;
}

async function createSignedObjectUrl(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
  expiresInSeconds: number
): Promise<string> {
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'create_signed_url_failed');
  }

  return data.signedUrl;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { ...corsHeaders, Allow: 'POST, OPTIONS' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer', '').trim();
    if (!jwt) return json({ error: 'missing_bearer_token' }, 401);

    const body = await req.json().catch(() => ({}));

    const maxRows = clamp(Number(body?.max_rows ?? 60), 5, 500);
    const maxCols = clamp(Number(body?.max_cols ?? 20), 5, 60);

    // user auth (real JWT)
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: me, error: meErr } = await userClient.auth.getUser();
    if (meErr || !me?.user) return json({ error: 'unauthorized' }, 401);

    // admin client (service role)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const ref = await resolveAttachmentRef(admin, body);
    await requireTeamMembership(admin, ref.teamId, me.user.id);

    // Always produce a signed URL so the client can preview/download even when
    // we can't (or don't want to) parse the file server-side.
    const signedUrl = await createSignedObjectUrl(admin, ref.bucket, ref.path, 60 * 60);

    // For non-tabular docs (images, pdf, docx, pptx, unknown), return a URL preview.
    if (ref.attachmentType !== 'excel' && ref.attachmentType !== 'csv') {
      const officeEmbedUrl =
        ref.attachmentType === 'word' || ref.attachmentType === 'powerpoint'
          ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(signedUrl)}`
          : null;

      return json({
        ok: true,
        mode: 'url',
        url: signedUrl,
        office_embed_url: officeEmbedUrl,
        title: ref.title,
        meta: {
          team_id: ref.teamId,
          bucket: ref.bucket,
          path: ref.path,
          attachment_type: ref.attachmentType,
        },
      });
    }

    // Download from Storage as bytes (tabular docs only)
    const bytes = await downloadObjectBytes(ref.bucket, ref.path);

    // Parse into a small grid
    let grid: unknown[][] = [[]];
    let title = ref.title;

    let images: ExtractImagesResult | null = null;

    if (ref.attachmentType === 'csv') {
      const text = new TextDecoder().decode(bytes);
      grid = parseCsvToGrid(text, maxRows, maxCols);
    } else {
      // XLSX
      // Important: `sheetRows` keeps parsing bounded and avoids blowing memory
      const wb = XLSX.read(bytes, { type: 'array', sheetRows: maxRows + 1 });
      const sheetName = wb.SheetNames?.[0];
      if (!sheetName) throw new Error('Spreadsheet has no sheets');

      title = `${ref.title} — ${sheetName}`;

      const sheet = wb.Sheets[sheetName];
      grid = (XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        blankrows: false,
        raw: false,
      }) as unknown[][]) || [[]];

      // Best-effort: extract embedded images from the XLSX zip and anchor them into cells.
      // Strict limits keep the HTML payload sane.
      images = await extractXlsxImagesByCell(bytes, {
        maxRows,
        maxCols,
        maxImages: 20,
        maxTotalImageBytes: 6_000_000,
      });
    }

    const html = buildHtmlTable({
      title,
      grid,
      maxRows,
      maxCols,
      imagesByCell: images?.imagesByCell,
      imagesMeta: images
        ? { included: images.included, omitted: images.omitted, omittedBytes: images.omittedBytes }
        : undefined,
    });

    return json({
      ok: true,
      mode: 'html',
      html,
      url: signedUrl,
      title,
      meta: {
        team_id: ref.teamId,
        bucket: ref.bucket,
        path: ref.path,
        attachment_type: ref.attachmentType,
        max_rows: maxRows,
        max_cols: maxCols,
        images_included: images?.included ?? 0,
        images_omitted: images?.omitted ?? 0,
        images_omitted_bytes: images?.omittedBytes ?? 0,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === 'forbidden' ? 403 : 500;
    return json({ error: msg }, status);
  }
});