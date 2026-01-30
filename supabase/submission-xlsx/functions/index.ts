// supabase/submission-xlsx/functions/index.ts
// Supabase Edge Function: submission-xlsx
//
// Build an XLSX export for a single submission, including up to six photos.
//
// Deploy:
//   supabase functions deploy submission-xlsx --no-verify-jwt
//
// POST /functions/v1/submission-xlsx
// Body: { submission_id: string, debug?: boolean }
//
// WORKER_LIMIT/546 survival notes:
// - Prefer Storage render thumbnails over raw downloads.
// - Keep thumbnails SMALL (220px) + JPEG-friendly.
// - Avoid String.fromCharCode/btoa (CPU+RAM spike).
// - Debug sheet is optional (it costs memory).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import ExcelJS from 'https://esm.sh/exceljs@4.4.0?target=es2020&no-check';
import { encodeBase64 } from 'jsr:@std/encoding/base64';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY =
  Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PHOTO_BUCKETS = ['submissions', 'photos'] as const;
type PhotoBucket = (typeof PHOTO_BUCKETS)[number];

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

function safeString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map((x) => (x == null ? '' : String(x))).join(', ');
  return String(v);
}

function bytesToBase64(bytes: Uint8Array): string {
  // IMPORTANT: avoid String.fromCharCode+btoa  it's a CPU/memory hog on Edge.
  return encodeBase64(bytes);
}

type ImageBits = { bytes: Uint8Array; extension: 'jpeg' | 'png' };

type AttemptResult =
  | { ok: true; bucket: PhotoBucket; usedPath: string; method: string; img: ImageBits }
  | { ok: false; tried: string[]; lastError?: string };

function inferExtFromContentTypeOrPath(
  contentType: string | null | undefined,
  path: string
): 'jpeg' | 'png' {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('png')) return 'png';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpeg';
  const lower = (path || '').toLowerCase();
  if (lower.endsWith('.png')) return 'png';
  return 'jpeg';
}

function looksLikeFilePath(p: string): boolean {
  return /\.(jpe?g|png)$/i.test(p.trim());
}

function buildCandidatePaths(slot: number, rawPath: string): string[] {
  const p = (rawPath || '').trim();
  if (!p) return [];
  const candidates: string[] = [p];

  const base = p.endsWith('/') ? p.slice(0, -1) : p;

  // If DB stored a folder prefix, try canonical filenames.
  if (!looksLikeFilePath(base)) {
    const stem = `${base}/photo${slot}`;
    candidates.push(`${stem}.jpg`, `${stem}.jpeg`, `${stem}.png`);
  }

  return candidates.filter((x, i) => candidates.indexOf(x) === i);
}

function encodeStoragePath(path: string): string {
  return (path || '')
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

function normalizeToObjectKey(stored: string, bucket: PhotoBucket): string {
  let s = (stored || '').trim();
  if (!s) return '';

  // drop query string
  s = s.split('?')[0];

  const base = SUPABASE_URL.replace(/\/+$/, '');
  const prefixes = [
    `${base}/storage/v1/object/public/${bucket}/`,
    `${base}/storage/v1/object/authenticated/${bucket}/`,
    `${base}/storage/v1/render/image/public/${bucket}/`,
    `${base}/storage/v1/render/image/authenticated/${bucket}/`,
  ];

  for (const p of prefixes) {
    if (s.startsWith(p)) {
      s = s.slice(p.length);
      break;
    }
  }

  // If someone stored fullPath like "photos/dir/file.jpg"
  if (s.startsWith(`${bucket}/`)) {
    s = s.slice(bucket.length + 1);
  }

  try {
    s = s
      .split('/')
      .map((seg) => decodeURIComponent(seg))
      .join('/');
  } catch {
    // ignore
  }

  return s;
}

async function fetchRenderThumb(
  bucket: PhotoBucket,
  path: string
): Promise<{ ok: true; img: ImageBits; method: string } | { ok: false; error: string }> {
  const encoded = encodeStoragePath(path);

  // Force JPEG output to keep bytes small and Excel-friendly.
  // origin can return PNG (huge) depending on input.
  const url =
    `${SUPABASE_URL.replace(/\/+$/, '')}` +
    `/storage/v1/render/image/authenticated/${bucket}/${encoded}` +
    // Square thumbs so each image is already centered within its box.
    // This makes the grid match the PDF contain + centered feel.
    `?width=260&height=260&quality=55&resize=contain&format=jpeg&background=ffffff`;

  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: `render ${res.status}: ${text || 'no body'}` };
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.toLowerCase().includes('webp')) {
    return { ok: false, error: `render returned webp (${ct})` };
  }

  // We requested JPEG, so if the CDN respects it, we should get image/jpeg.
  // If it doesn't, we still infer extension from headers/path below.

  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (!bytes.byteLength) {
    return { ok: false, error: 'render returned 0 bytes' };
  }

  const ext = inferExtFromContentTypeOrPath(ct, path);
  return { ok: true, img: { bytes, extension: ext }, method: `render(${ct || 'unknown'})` };
}

async function downloadObjectDirect(
  admin: ReturnType<typeof createClient>,
  bucket: PhotoBucket,
  path: string
): Promise<{ ok: true; img: ImageBits; method: string } | { ok: false; error: string }> {
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) {
    return { ok: false, error: `download: ${error?.message || 'no data'}` };
  }

  const blob = data as Blob;
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (!bytes.byteLength) {
    return { ok: false, error: 'download returned 0 bytes' };
  }

  const ext = inferExtFromContentTypeOrPath(blob.type, path);
  return { ok: true, img: { bytes, extension: ext }, method: 'download' };
}

async function downloadStorageThumb(
  admin: ReturnType<typeof createClient>,
  bucket: PhotoBucket,
  path: string
): Promise<{ ok: true; img: ImageBits; method: string } | { ok: false; error: string }> {
  const render = await fetchRenderThumb(bucket, path);
  if (render.ok) return render;
  const direct = await downloadObjectDirect(admin, bucket, path);
  if (direct.ok) return direct;
  return { ok: false, error: `${render.error} | ${direct.error}` };
}

async function tryDownloadThumb(
  admin: ReturnType<typeof createClient>,
  candidates: string[]
): Promise<AttemptResult> {
  const tried: string[] = [];
  let lastError = '';

  for (const bucket of PHOTO_BUCKETS) {
    for (const rawPath of candidates) {
      const path = normalizeToObjectKey(rawPath, bucket);
      if (!path) continue;
      tried.push(`${bucket}:${path}`);
      const res = await downloadStorageThumb(admin, bucket, path);
      if (res.ok) return { ok: true, bucket, usedPath: path, method: res.method, img: res.img };
      lastError = res.error;
    }
  }

  return { ok: false, tried, lastError };
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
    const submissionId = String(body?.submission_id || '').trim();
    const debug = Boolean(body?.debug);

    if (!submissionId) return json({ error: 'submission_id required' }, 400);

    // user auth
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: me, error: meErr } = await userClient.auth.getUser();
    if (meErr || !me?.user) return json({ error: 'unauthorized' }, 401);
    const userId = me.user.id as string;

    // admin client
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: submission, error: subErr } = await admin
      .from('submissions')
      .select('*')
      .eq('id', submissionId)
      .maybeSingle();

    if (subErr) return json({ error: subErr.message }, 400);
    if (!submission) return json({ error: 'submission_not_found' }, 404);

    const teamId: string | null = submission.team_id ?? null;
    if (!teamId) return json({ error: 'submission_missing_team_id' }, 400);

    // membership check (schema: team_members(team_id,user_id))
    const { data: member, error: memberErr } = await admin
      .from('team_members')
      .select('team_id,user_id')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .maybeSingle();

    if (memberErr) return json({ error: memberErr.message }, 400);
    if (!member) return json({ error: 'forbidden' }, 403);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Retail Inventory Tracker';
    wb.created = new Date();

    const ws = wb.addWorksheet('submission');
    // Make the sheet symmetric so the 2x3 photo grid looks like the PDF.
    // (If columns have different widths, images will look off-center.)
    ws.columns = [
      { header: 'Field', key: 'label', width: 44 },
      { header: 'Value', key: 'value', width: 44 },
    ];

    const addKV = (label: string, value: unknown) => ws.addRow([label, safeString(value)]);

    addKV('EXPORT_VERSION', 'XLSX_EDGE_V11_SMALL_THUMBS_DEBUG_OPTIONAL');
    addKV('DATE', submission.date ?? '');
    addKV('BRAND', submission.brand ?? '');
    addKV('STORE SITE', submission.store_site ?? '');
    addKV('STORE LOCATION', submission.store_location ?? '');
    addKV('LOCATIONS', submission.location ?? '');
    addKV('CONDITIONS', submission.conditions ?? '');
    addKV('PRICE PER UNIT', submission.price_per_unit ?? '');
    addKV('SHELF SPACE', submission.shelf_space ?? '');
    addKV('FACES ON SHELF', submission.on_shelf ?? '');
    addKV('TAGS', submission.tags ?? []);
    addKV('NOTES', submission.notes ?? '');
    addKV('PRIORITY LEVEL', submission.priority_level ?? '');
    addKV('SUBMISSION ID', submission.id ?? '');
    addKV('TEAM ID', submission.team_id ?? '');
    addKV('CREATED BY', submission.created_by ?? '');

    ws.addRow(['', '']);
    const hdr = ws.addRow(['PHOTOS', '']);
    hdr.font = { bold: true };

    const debugRows: any[] = [];

    const paths: (string | null)[] = [
      submission.photo1_path ?? null,
      submission.photo2_path ?? null,
      submission.photo3_path ?? null,
      submission.photo4_path ?? null,
      submission.photo5_path ?? null,
      submission.photo6_path ?? null,
    ];

    const imageTopRow0 = ws.rowCount + 1;

    // Reserve a smaller visual area (36 rows = 3 blocks * 12 rows)
    for (let rr = 0; rr < 36; rr++) {
      ws.getRow(imageTopRow0 + 1 + rr).height = 20;
    }

    const expectedSlots = paths.map((p, idx) => (p ? idx + 1 : null)).filter(Boolean) as number[];
    const embeddedSlots: number[] = [];

    for (let i = 0; i < 6; i++) {
      const slot = i + 1;
      const stored = paths[i];

      if (!stored) {
        debugRows.push([slot, '', '', '', '', 'missing_path', 0, '', 'no photo path on submission row']);
        continue;
      }

      const candidates = buildCandidatePaths(slot, stored);
      const attempt = await tryDownloadThumb(admin, candidates);

      if (!attempt.ok) {
        debugRows.push([
          slot,
          stored,
          '',
          '',
          '',
          'download_failed',
          0,
          '',
          `tried: ${attempt.tried.join(' | ')} | lastError: ${attempt.lastError || 'n/a'}`,
        ]);
        continue;
      }

      const { img, usedPath, bucket, method } = attempt;
      debugRows.push([slot, stored, bucket, usedPath, method, 'ok', img.bytes.byteLength, img.extension, '']);

      const mime = img.extension === 'png' ? 'image/png' : 'image/jpeg';
      const base64 = bytesToBase64(img.bytes);

      const imageId = wb.addImage({
        base64: `data:${mime};base64,${base64}`,
        extension: img.extension,
      });

      const colIndex = i % 2;
      const rowBlock = Math.floor(i / 2);
      const topRow0 = imageTopRow0 + rowBlock * 12;

      ws.addImage(imageId, {
        tl: { col: colIndex, row: topRow0 },
        ext: { width: 260, height: 260 },
      });

      embeddedSlots.push(slot);
    }

    // STRICT: if submission row has photo paths, we must embed them all.
    // Otherwise we create a tiny XLSX with missing photos, which is worse than failing.
    if (expectedSlots.length > 0 && embeddedSlots.length !== expectedSlots.length) {
      const missing = expectedSlots.filter((s) => !embeddedSlots.includes(s));
      return json(
        {
          error: 'missing_photos',
          message: `Expected ${expectedSlots.length} photos but embedded ${embeddedSlots.length}.`,
          expectedSlots,
          embeddedSlots,
          missingSlots: missing,
        },
        502
      );
    }

    if (debug) {
      const debugWs = wb.addWorksheet('debug');
      debugWs.columns = [
        { header: 'slot', width: 8 },
        { header: 'stored_path', width: 80 },
        { header: 'bucket', width: 14 },
        { header: 'used_path', width: 80 },
        { header: 'method', width: 18 },
        { header: 'status', width: 16 },
        { header: 'bytes', width: 12 },
        { header: 'ext', width: 8 },
        { header: 'note', width: 60 },
      ];
      for (const row of debugRows) debugWs.addRow(row);
    }

    const xlsxBuffer = (await wb.xlsx.writeBuffer({
      useStyles: false,
      useSharedStrings: false,
    } as any)) as ArrayBuffer;

    const bytes = new Uint8Array(xlsxBuffer);

    const baseNameRaw: string =
      submission.store_location || submission.store_site || submission.brand || 'submission';
    const fileBase = baseNameRaw.replace(/[^a-zA-Z0-9_-]+/g, '-') || 'submission';
    const fileName = `${fileBase}-${submission.id ?? 'unknown'}.xlsx`;

    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
