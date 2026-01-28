// Edge Function: submission-xlsx
// Build an XLSX export for a single submission, including up to six photos.
//
// Deploy (from repo root):
//   supabase functions deploy submission-xlsx --no-verify-jwt
//
// POST /functions/v1/submission-xlsx
// Body: { submission_id: string, debug?: boolean }
//
// - Auth via Bearer JWT from the caller (EAS app / dashboard)
// - Uses service role for DB + Storage reads
// - Embeds photos via ExcelJS images, preferring storage paths over URLs
// - Supports up to 6 photos laid out in a 2 x 3 grid under the PHOTOS header

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import ExcelJS from "https://esm.sh/exceljs@4.4.0?target=es2020&no-check";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Buckets we search for photo paths (in order)
const PHOTO_BUCKETS = ["submissions", "photos"] as const;
const MAX_PHOTOS = 6;

// Keep image transform conservative. Key is format: "origin" so we don't
// accidentally get WebP/AVIF that Excel can't handle.
const PHOTO_TRANSFORM = {
  width: 1400,
  format: "origin" as const,
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function safeString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map((x) => (x == null ? "" : String(x))).join(", ");
  return String(v);
}

// Chunked base64 to avoid O(n^2) string concatenation issues
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32KB chunks
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function inferExcelExtFromPathOrType(path: string, contentType: string): "jpeg" | "png" {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpeg";

  const lower = (path || "").toLowerCase();
  if (lower.endsWith(".png")) return "png";
  return "jpeg";
}

async function fetchDirectUrl(url: string): Promise<{
  ok: boolean;
  bytes?: ArrayBuffer;
  contentType?: string;
  error?: string;
}> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      return { ok: false, error: `fetch(${url}) -> ${resp.status}` };
    }
    const bytes = await resp.arrayBuffer();
    if (!bytes || bytes.byteLength === 0) {
      return { ok: false, error: `fetch(${url}) -> 0 bytes` };
    }
    const contentType = resp.headers.get("content-type") ?? "";
    return { ok: true, bytes, contentType };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Download from storage with service role and optional transform.
 * This avoids signed-url CORS/expiry problems and is the most reliable path.
 */
async function downloadFromAnyBucket(
  admin: ReturnType<typeof createClient>,
  storagePath: string,
): Promise<{
  ok: boolean;
  bucketTried?: string[];
  bucketUsed?: string;
  bytes?: ArrayBuffer;
  contentType?: string;
  error?: string;
}> {
  const tried: string[] = [];

  for (const bucket of PHOTO_BUCKETS) {
    tried.push(bucket);
    try {
      const { data, error } = await admin.storage
        .from(bucket)
        .download(storagePath, { transform: PHOTO_TRANSFORM } as any);

      if (error || !data) continue;

      const blob = data as Blob;
      const bytes = await blob.arrayBuffer();
      if (!bytes || bytes.byteLength === 0) continue;

      return {
        ok: true,
        bucketTried: tried,
        bucketUsed: bucket,
        bytes,
        contentType: blob.type || "",
      };
    } catch {
      // try next bucket
    }
  }

  return {
    ok: false,
    bucketTried: tried,
    error: `download failed for path="${storagePath}" in buckets=[${PHOTO_BUCKETS.join(", ")} ]`,
  };
}

Deno.serve(async (req) => {
  // Preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { ...corsHeaders, Allow: "POST, OPTIONS" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer", "").trim();

    const body = await req.json().catch(() => ({}));
    const submission_id: string = String(body?.submission_id || "").trim();
    const debug: boolean = Boolean(body?.debug);

    if (!jwt) return json({ error: "missing_bearer_token" }, 401);
    if (!submission_id) return json({ error: "submission_id required" }, 400);

    // Authenticate caller as a real user
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: me, error: meErr } = await userClient.auth.getUser();
    if (meErr || !me?.user) return json({ error: "unauthorized" }, 401);
    const userId = me.user.id as string;

    // Service-role client for DB + Storage
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Load submission
    const { data: submission, error: subErr } = await admin
      .from("submissions")
      .select("*")
      .eq("id", submission_id)
      .maybeSingle();

    if (subErr) return json({ error: subErr.message }, 400);
    if (!submission) return json({ error: "submission_not_found" }, 404);

    const team_id: string | null = submission.team_id ?? null;
    if (!team_id) return json({ error: "submission_missing_team_id" }, 400);

    // Access control: require that user is a member of the team
    const { data: member, error: memberErr } = await admin
      .from("team_members")
      .select("team_id,user_id")
      .eq("team_id", team_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (memberErr) return json({ error: memberErr.message }, 400);
    if (!member) return json({ error: "forbidden" }, 403);

    // --- Build workbook ---
    const wb = new ExcelJS.Workbook();
    wb.creator = "Retail Inventory Tracker";
    wb.created = new Date();

    const ws = wb.addWorksheet("submission");
    ws.columns = [
      { header: "Field", key: "label", width: 22 },
      { header: "Value", key: "value", width: 48 },
    ];

    const addKV = (label: string, value: unknown) => {
      ws.addRow([label, safeString(value)]);
    };

    addKV("EXPORT_VERSION", "XLSX_EDGE_V4_6_PHOTOS");
    addKV("DATE", submission.date ?? "");
    addKV("BRAND", submission.brand ?? "");
    addKV("STORE SITE", submission.store_site ?? "");
    addKV("STORE LOCATION", submission.store_location ?? "");
    addKV("LOCATIONS", submission.location ?? "");
    addKV("CONDITIONS", submission.conditions ?? "");
    addKV("PRICE PER UNIT", submission.price_per_unit ?? "");
    addKV("SHELF SPACE", submission.shelf_space ?? "");
    addKV("FACES ON SHELF", submission.on_shelf ?? "");
    addKV("TAGS", submission.tags ?? []);
    addKV("NOTES", submission.notes ?? "");
    addKV("PRIORITY LEVEL", submission.priority_level ?? "");
    addKV("SUBMISSION ID", submission.id ?? "");
    addKV("TEAM ID", submission.team_id ?? "");
    addKV("CREATED BY", submission.created_by ?? "");

    ws.addRow(["", ""]);
    const hdr = ws.addRow(["PHOTOS", ""]);
    hdr.font = { bold: true };

    // Prefer storage paths over direct URLs (URLs can expire / be stale)
    const photoPaths: (string | null)[] = [
      submission.photo1_path ?? null,
      submission.photo2_path ?? null,
      submission.photo3_path ?? null,
      submission.photo4_path ?? null,
      submission.photo5_path ?? null,
      submission.photo6_path ?? null,
    ];

    const photoUrls: (string | null)[] = [
      submission.photo1_url ?? null,
      submission.photo2_url ?? null,
      submission.photo3_url ?? null,
      submission.photo4_url ?? null,
      submission.photo5_url ?? null,
      submission.photo6_url ?? null,
    ];

    const imageTopRow = (ws.lastRow?.number ?? ws.rowCount) + 2;

    // Give enough vertical space for a 2 x 3 grid (two columns, three rows)
    const rowsForImages = 36; // 36 * 18pt = 648pt of vertical space
    for (let i = 0; i < rowsForImages; i++) {
      ws.getRow(imageTopRow + i).height = 18;
    }

    const debugInfo: Record<string, unknown> = {
      submission_id,
      team_id,
      photo: [],
    };

    for (let i = 0; i < MAX_PHOTOS; i++) {
      const storagePath = photoPaths[i];
      const directUrl = photoUrls[i];

      let bytes: ArrayBuffer | undefined;
      let contentType = "";
      let source = "";
      let errMsg = "";

      // Try storage first
      if (storagePath) {
        const dl = await downloadFromAnyBucket(admin, storagePath);
        if (dl.ok && dl.bytes) {
          bytes = dl.bytes;
          contentType = dl.contentType ?? "";
          source = `storage:${dl.bucketUsed}:${storagePath}`;
        } else {
          errMsg = dl.error || "download_failed";
        }

        if (debug) {
          (debugInfo.photo as any[]).push({
            slot: i + 1,
            storagePath,
            tried: dl.bucketTried,
            used: dl.bucketUsed,
            ok: dl.ok,
            bytes: dl.bytes?.byteLength ?? 0,
            contentType: dl.contentType ?? "",
            error: dl.error ?? "",
          });
        }
      }

      // Fallback to direct URL if storage failed or missing
      if (!bytes && directUrl && directUrl.trim()) {
        const fr = await fetchDirectUrl(directUrl.trim());
        if (fr.ok && fr.bytes) {
          bytes = fr.bytes;
          contentType = fr.contentType ?? "";
          source = `url:${directUrl.trim()}`;
          errMsg = "";
        } else {
          errMsg = errMsg || fr.error || "fetch_url_failed";
        }

        if (debug) {
          (debugInfo.photo as any[]).push({
            slot: i + 1,
            directUrl: directUrl.trim(),
            ok: fr.ok,
            bytes: fr.bytes?.byteLength ?? 0,
            contentType: fr.contentType ?? "",
            error: fr.error ?? "",
          });
        }
      }

      if (!bytes || bytes.byteLength === 0) {
        // Put an explicit marker into the sheet so empty cells aren't "false positives"
        ws.addRow([`PHOTO_${i + 1}_ERROR`, errMsg || "missing_photo_bytes"]);
        if (debug) ws.addRow([`PHOTO_${i + 1}_SOURCE", source || "none"]);
        continue;
      }

      const excelExt = inferExcelExtFromPathOrType(storagePath || "", contentType);
      const base64 = arrayBufferToBase64(bytes);
      const imageId = wb.addImage({ base64, extension: excelExt });

      // Lay out as 2 columns x 3 rows under the PHOTOS header
      const colIndex = i % 2; // 0 or 1
      const rowBlock = Math.floor(i / 2); // 0,1,2

      const topRowForImage = imageTopRow - 1 + rowBlock * 12; // 12-row blocks per image row

      ws.addImage(imageId, {
        tl: { col: colIndex, row: topRowForImage },
        ext: { width: 320, height: 320 },
      });

      if (debug) {
        ws.addRow([`PHOTO_${i + 1}_OK`, `${bytes.byteLength} bytes`]);
        ws.addRow([`PHOTO_${i + 1}_CT`, contentType || "(none)"]);
        ws.addRow([`PHOTO_${i + 1}_SRC`, source || "(none)"]);
      }
    }

    const xlsxBuffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;

    const baseNameRaw: string =
      submission.store_location || submission.store_site || submission.brand || "submission";
    const fileBase =
      baseNameRaw.replace(/[^a-zA-Z0-9_-]+/g, "-") || "submission";
    const fileName = `${fileBase}-${submission.id ?? "unknown"}.xlsx`;

    return new Response(xlsxBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
        ...(debug ? { "X-Debug": "1" } : {}),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
