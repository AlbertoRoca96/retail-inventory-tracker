// supabase/submission-xlsx/functions/index.ts
// Supabase Edge Function: submission-xlsx
//
// Generates a real XLSX spreadsheet for a submission, embedding up to 6 photos
// in a 2x3 grid (like the PDF layout).
//
// Key optimizations (so this survives Edge compute limits):
// - Use Supabase image render transforms (small thumbnails)
// - Embed images via base64 data URLs (bundler-compatible)
// - Disable shared strings/styles where possible
// - Avoid expensive formatting loops

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import ExcelJS from 'https://esm.sh/exceljs@4.4.0?target=es2020&no-check';

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
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function safeString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map((x) => (x == null ? '' : String(x))).join(', ');
  return String(v);
}

function bytesToBase64(bytes: Uint8Array): string {
  // Deno has btoa; chunk to avoid call stack / max string limits.
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

type ImageBits = { bytes: Uint8Array; extension: 'jpeg' | 'png' };

type AttemptResult =
  | { ok: true; bucket: PhotoBucket; usedPath: string; method: string; img: ImageBits }
  | { ok: false; tried: string[]; lastError?: string };

function looksLikeFilePath(p: string): boolean {
  // super basic: if it ends in .jpg/.jpeg/.png treat as file.
  return /\.(jpe?g|png)$/i.test(p.trim());
}

function buildCandidatePaths(slot: number, rawPath: string): string[] {
  const p = (rawPath || '').trim();
  if (!p) return [];

  // If it's already a file path, trust it first.
  const candidates: string[] = [p];

  const base = p.endsWith('/') ? p.slice(0, -1) : p;

  // If the stored value looks like a folder prefix, try the canonical names.
  // This covers cases where DB mistakenly stores:
  //   teams/<team>/submissions/<submissionId>
  // instead of:
  //   teams/<team>/submissions/<submissionId>/photo1.jpg
  if (!looksLikeFilePath(base)) {
    const fileStem = `${base}/photo${slot}`;
    candidates.push(`${fileStem}.jpg`, `${fileStem}.jpeg`, `${fileStem}.png`);
  }

  // De-dupe while preserving order
  return candidates.filter((x, i) => candidates.indexOf(x) === i);
}

function encodeStoragePath(path: string): string {
  // Encode each segment but preserve slashes.
  return (path || '')
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

async function fetchRenderThumb(
  bucket: PhotoBucket,
  path: string
): Promise<{ ok: true; img: ImageBits; method: string } | { ok: false; error: string }> {
  // Use the Storage render endpoint directly. This avoids `transform` support
  // differences in supabase-js across runtimes.
  const encoded = encodeStoragePath(path);
  const url = `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/render/image/authenticated/${bucket}/${encoded}?width=360&quality=60&resize=contain`;

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
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (!bytes.byteLength) {
    return { ok: false, error: 'render returned 0 bytes' };
  }

  const ext = inferExtFromContentTypeOrPath(ct, path);
  return { ok: true, img: { bytes, extension: ext }, method: 'render' };
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
  // Try render first (small thumbnail), then fallback to raw object download.
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
    for (const path of candidates) {
      tried.push(`${bucket}:${path}`);
      const res = await downloadStorageThumb(admin, bucket, path);
      if (res.ok) {
        return { ok: true, bucket, usedPath: path, method: res.method, img: res.img };
      }
      lastError = res.error;
    }
  }

  return { ok: false, tried, lastError };
}

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
    const submissionId: string = String(body?.submission_id || '').trim();
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

    const { data: member, error: memberErr } = await admin
      .from('team_members')
      .select('team_id,user_id')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .maybeSingle();

    if (memberErr) return json({ error: memberErr.message }, 400);
    if (!member) return json({ error: 'forbidden' }, 403);

    // build XLSX
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Retail Inventory Tracker';
    wb.created = new Date();

    const ws = wb.addWorksheet('submission');

    // Debug sheet (second tab  so the main export opens first)
    const debugWs = wb.addWorksheet('debug');
    debugWs.columns = [
      { header: 'slot', width: 8 },
      { header: 'stored_path', width: 80 },
      { header: 'bucket', width: 14 },
      { header: 'used_path', width: 80 },
      { header: 'method', width: 12 },
      { header: 'status', width: 16 },
      { header: 'bytes', width: 12 },
      { header: 'ext', width: 8 },
      { header: 'note', width: 60 },
    ];
    ws.columns = [
      { header: 'Field', key: 'label', width: 22 },
      { header: 'Value', key: 'value', width: 48 },
    ];

    const addKV = (label: string, value: unknown) => {
      ws.addRow([label, safeString(value)]);
    };

    addKV('EXPORT_VERSION', 'XLSX_EDGE_V9_6_PHOTOS_RENDER_FALLBACKS');
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

    const paths: (string | null)[] = [
      submission.photo1_path ?? null,
      submission.photo2_path ?? null,
      submission.photo3_path ?? null,
      submission.photo4_path ?? null,
      submission.photo5_path ?? null,
      submission.photo6_path ?? null,
    ];

    // Image grid placement:
    // IMPORTANT: ExcelJS `tl.row/col` are 0-based.
    // We want images to start below the PHOTOS header, so use the current
    // rowCount (1-based) and convert to 0-based by subtracting 1.
    const imageTopRow0 = ws.rowCount + 1; // one blank row below current content, already 0-based

    // Reserve some row heights so images are visible in Excel without manual resizing.
    // 3 blocks * 14 rows = 42 rows.
    for (let rr = 0; rr < 42; rr++) {
      ws.getRow(imageTopRow0 + 1 + rr).height = 24;
    }

    // Download + embed, in order.
    for (let i = 0; i < 6; i++) {
      const stored = paths[i];
      if (!stored) {
        debugWs.addRow([i + 1, '', '', '', '', 'missing_path', 0, '', 'no photo path on submission row']);
        continue;
      }

      const candidates = buildCandidatePaths(i + 1, stored);
      const attempt = await tryDownloadThumb(admin, candidates);

      if (!attempt.ok) {
        debugWs.addRow([
          i + 1,
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
      debugWs.addRow([
        i + 1,
        stored,
        bucket,
        usedPath,
        method,
        'ok',
        img.bytes.byteLength,
        img.extension,
        '',
      ]);

      // ExcelJS supports base64 data URLs.
      const mime = img.extension === 'png' ? 'image/png' : 'image/jpeg';
      const base64 = bytesToBase64(img.bytes);
      const imageId = wb.addImage({
        base64: `data:${mime};base64,${base64}`,
        extension: img.extension,
      });

      const colIndex = i % 2; // 0/1
      const rowBlock = Math.floor(i / 2); // 0/1/2
      const topRow0 = imageTopRow0 + rowBlock * 14;

      ws.addImage(imageId, {
        tl: { col: colIndex, row: topRow0 },
        ext: { width: 320, height: 320 },
      });
    }

    // Crucial: minimize overhead
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
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
