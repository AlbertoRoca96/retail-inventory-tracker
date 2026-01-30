// apps/mobile/src/lib/documentPreviewRemote.ts
// Call the Supabase Edge Function `document-preview` to render an XLSX/CSV preview
// server-side. This avoids parsing huge spreadsheets on-device.

import { supabase, resolvedSupabaseUrl } from './supabase';

export type DocumentPreviewRequest = {
  kind: 'submission_message' | 'direct_message';
  id: string;
  max_rows?: number;
  max_cols?: number;
};

export type DocumentPreviewResponse = {
  ok: true;
  html: string;
  title: string;
  meta?: Record<string, unknown>;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504 || status === 546;
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

      const data = (await res.json()) as any;
      if (!data?.ok || !data?.html) {
        throw new Error(data?.error || 'Preview response missing html');
      }
      return data as DocumentPreviewResponse;
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
