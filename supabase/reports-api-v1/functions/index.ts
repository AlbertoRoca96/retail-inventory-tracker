import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PHOTO_SLOT_COUNT, isReportPhotoPath, photoReferenceWarnings } from './photo-paths.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PHOTO_TTL_SECONDS = 3600;
const MAX_LIMIT = 200;
import { RequestError, parseTimestamp, credentialScope, encodeCursor, decodeCursor, afterCursor } from './pagination.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function readApiKey(request: Request): string | null {
  const direct = request.headers.get('x-api-key')?.trim();
  if (direct) return direct;
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

function trimOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type SignedPhoto = {
  slot: number;
  path: string;
  url: string;
  expires_at: string;
};

async function signedPhotos(report: Record<string, unknown>): Promise<SignedPhoto[]> {
  const photoEntries = Array.from({ length: PHOTO_SLOT_COUNT }, (_, index) => {
    const slot = index + 1;
    const path = trimOrNull(report[`photo${slot}_path`]);
    return path && isReportPhotoPath(path, report, slot) ? { slot, path } : null;
  }).filter((entry): entry is { slot: number; path: string } => !!entry);

  if (!photoEntries.length) return [];

  const { data, error } = await admin.storage
    .from('submissions')
    .createSignedUrls(
      photoEntries.map((entry) => entry.path),
      PHOTO_TTL_SECONDS
    );
  if (error) throw error;

  const expiresAt = new Date(Date.now() + PHOTO_TTL_SECONDS * 1000).toISOString();
  return photoEntries.flatMap((entry, index) => {
    const url = data?.[index]?.signedUrl;
    return url
      ? [{ slot: entry.slot, path: entry.path, url, expires_at: expiresAt }]
      : [];
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  try {
    const rawKey = readApiKey(request);
    if (!rawKey) return json({ error: 'Missing API key.' }, 401);

    const keyHash = await sha256Hex(rawKey);
    const { data: credential, error: credentialError } = await admin
      .from('integration_api_keys')
      .select('id,name,scope_user_id,scope_team_ids,expires_at')
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .maybeSingle();

    if (credentialError) throw credentialError;
    if (
      !credential ||
      (credential.expires_at && new Date(credential.expires_at) <= new Date())
    ) {
      return json({ error: 'Invalid or expired API key.' }, 401);
    }

    const scope = credentialScope(credential);
    const url = new URL(request.url);
    const submittedSince = parseTimestamp(
      url.searchParams.get('submitted_since') ?? url.searchParams.get('since'),
      'submitted_since'
    );
    const changedSince = parseTimestamp(
      url.searchParams.get('changed_since'),
      'changed_since'
    );
    if (!submittedSince && !changedSince) {
      return json({
        error: 'Provide submitted_since (or since) or changed_since as an ISO-8601 timestamp.',
      }, 400);
    }

    const requestedLimit = Number(url.searchParams.get('limit') || '100');
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(MAX_LIMIT, Math.trunc(requestedLimit)))
      : 100;

    const sortColumn = changedSince ? 'updated_at' : 'created_at';
    const binding = JSON.stringify({ key: credential.id, scope, submittedSince, changedSince });
    const cursorToken = url.searchParams.get('cursor');
    const cursor = cursorToken ? await decodeCursor(cursorToken, binding, SERVICE_ROLE_KEY) : null;

    let query = admin
      .from('submissions')
      .select([
        'id', 'team_id', 'created_at', 'updated_at', 'created_by', 'date', 'status',
        'store_site', 'store_number', 'store_chain', 'store_location',
        'location', 'brand', 'conditions', 'price_per_unit', 'shelf_space',
        'on_shelf', 'tags', 'notes', 'priority_level',
        ...Array.from({ length: PHOTO_SLOT_COUNT }, (_, i) => `photo${i + 1}_path`),
      ].join(','))
      .eq('status', 'submitted')
      .order(sortColumn, { ascending: true })
      .order('id', { ascending: true })
      .limit(limit + 1);

    // Scope is credential-only: request parameters cannot broaden it.
    if (scope.author) query = query.eq('created_by', scope.author);
    else query = query.in('team_id', scope.teams!);
    if (cursor) query = query.or(afterCursor(sortColumn, cursor));
    if (submittedSince) query = query.gte('created_at', submittedSince);
    if (changedSince) query = query.gte('updated_at', changedSince);

    const { data: rawReports, error: reportError } = await query;
    if (reportError) throw reportError;

    const hasMore = (rawReports?.length || 0) > limit;
    const reports = (rawReports || []).slice(0, limit);
    const reportIds = reports.map((report) => report.id);

    const productsByReport = new Map<string, Record<string, unknown>[]>();
    if (reportIds.length) {
      const { data: products, error: productError } = await admin
        .from('submission_products')
        .select('id,submission_id,product,quantity,expiry_date,sort_order')
        .in('submission_id', reportIds)
        .order('sort_order', { ascending: true });
      if (productError) throw productError;
      for (const product of products || []) {
        const current = productsByReport.get(product.submission_id) || [];
        current.push(product);
        productsByReport.set(product.submission_id, current);
      }
    }

    const submitters = new Map<string, { id: string; display_name: string | null; email: string | null }>();
    for (const authorId of new Set(reports.map((report) => report.created_by).filter(Boolean))) {
      const { data, error } = await admin.auth.admin.getUserById(authorId);
      // Deleted users retain their actual report author ID, never the key owner's identity.
      if (error && error.status !== 404) throw error;
      submitters.set(authorId, {
        id: authorId,
        display_name: trimOrNull(data?.user?.user_metadata?.display_name),
        email: data?.user?.email || null,
      });
    }

    const output = await Promise.all(reports.map(async (report) => {
      const priceAmount = numberOrNull(report.price_per_unit);
      return {
        id: report.id,
        submitted_at: report.created_at,
        last_changed_at: report.updated_at,
        submitted_by: submitters.get(report.created_by) ?? { id: null, display_name: null, email: null },
        store: {
          name: trimOrNull(report.store_site),
          number: trimOrNull(report.store_number),
          chain: trimOrNull(report.store_chain),
          address: trimOrNull(report.store_location),
        },
        report_date: report.date,
        brand: trimOrNull(report.brand),
        location_in_store: trimOrNull(report.location),
        conditions: trimOrNull(report.conditions),
        price: {
          amount: priceAmount,
          currency: 'USD',
          stored_in_cents: false,
          amount_cents: priceAmount === null ? null : Math.round(priceAmount * 100),
        },
        shelf_space: trimOrNull(report.shelf_space),
        faces: numberOrNull(report.on_shelf),
        tags: Array.isArray(report.tags) ? report.tags : [],
        notes: trimOrNull(report.notes),
        priority: numberOrNull(report.priority_level),
        products: (productsByReport.get(report.id) || []).map((product) => ({
          id: product.id,
          product: product.product,
          quantity: numberOrNull(product.quantity),
          expiry_date: product.expiry_date,
        })),
        photos: await signedPhotos(report),
        photo_reference_warnings: photoReferenceWarnings(report),
      };
    }));

    await admin
      .from('integration_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', credential.id);

    const lastReport = output.at(-1);
    const lastRaw = reports.at(-1);
    const nextCursor = hasMore && lastRaw ? await encodeCursor({
      id: lastRaw.id, timestamp: lastRaw[sortColumn],
    }, binding, SERVICE_ROLE_KEY) : null;
    return json({
      api_version: '1.0',
      generated_at: new Date().toISOString(),
      integration: credential.name,
      filters: {
        submitted_since: submittedSince,
        changed_since: changedSince,
        submitter_id: credential.scope_user_id,
        team_ids: scope.teams,
      },
      count: output.length,
      has_more: hasMore,
      next_cursor: nextCursor,
      next_since: lastReport
        ? (changedSince ? lastReport.last_changed_at : lastReport.submitted_at)
        : null,
      reports: output,
    });
  } catch (error) {
    console.error('reports-api-v1 failed', error);
    const badRequest = error instanceof RequestError;
    return json({ error: badRequest ? error.message : 'Unexpected error.' }, badRequest ? 400 : 500);
  }
});
