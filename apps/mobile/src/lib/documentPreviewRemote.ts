// apps/mobile/src/lib/documentPreviewRemote.ts
// Call the Supabase Edge Function `document-preview` to render a preview for chat attachments
// server-side.
//
// - XLSX/CSV: returns lightweight HTML
// - Images/PDF/Office docs: returns a signed URL (and optional Office Online embed URL)

import { supabase, resolvedSupabaseUrl } from './supabase';

export type DocumentPreviewRequest = {
  kind: 'submission_message' | 'direct_message';
  id: string;
  max_rows?: number;
  max_cols?: number;
};

export type DocumentPreviewResponse =
  | {
      ok: true;
      mode: 'html';
      html: string;
      title: string;
      url?: string;
      meta?: Record<string, unknown>;
    }
  | {
      ok: true;
      mode: 'url';
      url: string;
      office_embed_url?: string | null;
      title: string;
      meta?: Record<string, unknown>;
    };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504 || status === 546;
}

function coerceResponse(data: any): DocumentPreviewResponse {
  // Backward compat: older edge function returned { ok:true, html, title }
  if (data?.ok && typeof data?.html === 'string') {
    return {
      ok: true,
      mode: 'html',
      html: data.html,
      title: String(data?.title || 'Preview'),
      url: typeof data?.url === 'string' ? data.url : undefined,
      meta: data?.meta,
    };
  }

  if (data?.ok && data?.mode === 'html' && typeof data?.html === 'string') {
    return {
      ok: true,
      mode: 'html',
      html: data.html,
      title: String(data?.title || 'Preview'),
      url: typeof data?.url === 'string' ? data.url : undefined,
      meta: data?.meta,
    };
  }

  if (data?.ok && data?.mode === 'url' && typeof data?.url === 'string') {
    return {
      ok: true,
      mode: 'url',
      url: data.url,
      office_embed_url: typeof data?.office_embed_url === 'string' ? data.office_embed_url : null,
      title: String(data?.title || 'Attachment'),
      meta: data?.meta,
    };
  }

  throw new Error(data?.error || 'Preview response missing html/url');
}

export async function fetchRemoteDocumentPreview(
  req: DocumentPreviewRequest
): Promise<DocumentPreviewResponse> {
  const { data, error } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) throw new Error('You must be signed in.');

  const baseUrl = (resolvedSupabaseUrl || '').replace(/\/+$/, '');
  if (!baseUrl) throw new Error('Supabase URL missing.');

  const endpoint = `${baseUrl}/functions/v1/document-preview`;

  const body = JSON.stringify({
    kind: req.kind,
    id: req.id,
    max_rows: req.max_rows ?? 60,
    max_cols: req.max_cols ?? 20,
  });

  const maxAttempts = 3;
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');

        if (isRetryableStatus(res.status) && attempt < maxAttempts) {
          await sleep(500 * Math.pow(2, attempt - 1));
          continue;
        }

        throw new Error(`document-preview failed (${res.status}): ${text || 'Unknown error'}`);
      }

      const jsonData = (await res.json()) as any;
      return coerceResponse(jsonData);
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await sleep(500 * Math.pow(2, attempt - 1));
        continue;
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('document-preview failed');
}
