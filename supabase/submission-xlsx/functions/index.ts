// supabase/submission-xlsx/functions/index.ts
// Supabase Edge Function: submission-xlsx
//
// Generates a real XLSX spreadsheet for a submission, embedding up to 6 photos
// in a 2x3 grid (like the PDF layout).
//
// Key optimizations (so this survives Edge compute limits):
// - Use Supabase image render transforms (small thumbnails)
// - Embed images via raw Uint8Array buffers (NO base64)
// - Disable shared strings/styles where possible
// - Avoid expensive formatting loops

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import ExcelJS from 'https://esm.sh/exceljs@4.4.0?target=es2020&no-check';
// ExcelJS expects a Node-like Buffer for image embedding in many runtimes.
// Supabase Edge runs on Deno; use the std Node buffer polyfill.
import { Buffer } from 'https://deno.land/std@0.224.0/node/buffer.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY =
  Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

type ImageBits = { bytes: Uint8Array; extension: 'jpeg' | 'png' };

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

async function downloadStorageThumb(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  path: string
): Promise<ImageBits | null> {
  // IMPORTANT: use transform to downscale server-side.
  const { data, error } = await admin.storage.from(bucket).download(path, {
    transform: {
      width: 360,
      quality: 60,
      resize: 'contain',
      format: 'origin',
    },
  } as any);

  if (error || !data) return null;

  const blob = data as Blob;
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (!bytes.byteLength) return null;

  const ext = inferExtFromContentTypeOrPath(blob.type, path);
  return { bytes, extension: ext };
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

    // Debug sheet (keeps main sheet layout stable)
    const debugWs = wb.addWorksheet('debug');
    debugWs.columns = [
      { header: 'slot', width: 8 },
      { header: 'path', width: 80 },
      { header: 'status', width: 14 },
      { header: 'bytes', width: 12 },
      { header: 'contentType', width: 20 },
      { header: 'note', width: 50 },
    ];

    const ws = wb.addWorksheet('submission');
    ws.columns = [
      { header: 'Field', key: 'label', width: 22 },
      { header: 'Value', key: 'value', width: 48 },
    ];

    const addKV = (label: string, value: unknown) => {
      ws.addRow([label, safeString(value)]);
    };

    addKV('EXPORT_VERSION', 'XLSX_EDGE_V5_6_PHOTOS_BUFFER');
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
      const p = paths[i];
      if (!p) {
        debugWs.addRow([i + 1, '', 'missing_path', 0, '', 'no photo path on submission row']);
        continue;
      }

      const img = await downloadStorageThumb(admin, 'submissions', p);
      if (!img) {
        debugWs.addRow([i + 1, p, 'download_failed', 0, '', 'storage.download returned no data']);
        continue;
      }

      debugWs.addRow([i + 1, p, 'ok', img.bytes.byteLength, img.extension, '']);

      // IMPORTANT: wrap Uint8Array in a Node-like Buffer for ExcelJS
      const imageId = wb.addImage({ buffer: Buffer.from(img.bytes), extension: img.extension });

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
