// apps/mobile/src/lib/attachmentViewer.ts
// Centralized attachment handling:
// - builds in-app preview URL
// - downloads to a temp file
// - reuses shareFileNative for "download/share" behavior
//
// Keep this file small and boring. Slack can be fancy; we can be reliable.

import * as FileSystem from 'expo-file-system/legacy';

import { shareFileNative } from './shareFile.native';

export type AttachmentKind = 'image' | 'pdf' | 'excel' | 'word' | 'powerpoint' | 'csv' | 'file';

export type AttachmentMeta = {
  url: string;
  kind: AttachmentKind;
  /** Suggested filename, no path. */
  name: string;
};

const MIME_BY_KIND: Record<AttachmentKind, string> = {
  image: 'image/jpeg',
  pdf: 'application/pdf',
  csv: 'text/csv',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  powerpoint: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  file: 'application/octet-stream',
};

const UTI_BY_KIND: Partial<Record<AttachmentKind, string>> = {
  pdf: 'com.adobe.pdf',
  excel: 'org.openxmlformats.spreadsheetml.sheet',
  // Word/Powerpoint UTI not strictly required; iOS can infer.
};

export function guessKindFromNameOrType(
  attachmentType?: string | null,
  name?: string | null
): AttachmentKind {
  const t = (attachmentType || '').toLowerCase();
  if (t === 'image') return 'image';
  if (t === 'pdf') return 'pdf';
  if (t === 'csv') return 'csv';
  if (t === 'excel') return 'excel';

  const n = (name || '').toLowerCase();
  if (n.endsWith('.pdf')) return 'pdf';
  if (n.endsWith('.csv')) return 'csv';
  if (n.endsWith('.xlsx') || n.endsWith('.xls')) return 'excel';
  if (n.endsWith('.docx') || n.endsWith('.doc')) return 'word';
  if (n.endsWith('.pptx') || n.endsWith('.ppt')) return 'powerpoint';
  if (n.match(/\.(png|jpe?g|gif|webp)$/)) return 'image';
  return 'file';
}

export function guessFileNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() || 'attachment';
    return decodeURIComponent(last).split('?')[0] || 'attachment';
  } catch {
    const last = (url || '').split('/').pop() || 'attachment';
    return last.split('?')[0] || 'attachment';
  }
}

function normalizeDir(dir: string) {
  return dir.endsWith('/') ? dir : `${dir}/`;
}

function tempDir(): string {
  const t = (FileSystem as any).temporaryDirectory as string | undefined;
  const c = FileSystem.cacheDirectory as string | null | undefined;
  return normalizeDir(t || c || 'file:///tmp/');
}

function sanitizeFileName(name: string): string {
  const n = (name || '').trim() || 'attachment';
  return n.replace(/[^a-z0-9_.-]+/gi, '-').slice(0, 120);
}

export function buildViewerUrl(meta: AttachmentMeta): string {
  // Images can be rendered directly.
  if (meta.kind === 'image') return meta.url;

  // PDFs usually render fine in WebView.
  if (meta.kind === 'pdf') return meta.url;

  // Office docs: use Office Online viewer inside our WebView.
  // This is still an external service, but NOT Safari, and it previews like Slack.
  if (meta.kind === 'excel' || meta.kind === 'word' || meta.kind === 'powerpoint') {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(meta.url)}`;
  }

  // CSV/text: just load URL.
  return meta.url;
}

export async function downloadToTemp(meta: AttachmentMeta): Promise<string> {
  const safeName = sanitizeFileName(meta.name);
  const dest = `${tempDir()}${Date.now()}-${safeName}`;
  const res = await FileSystem.downloadAsync(meta.url, dest);
  return res.uri;
}

export async function shareAttachment(meta: AttachmentMeta): Promise<void> {
  const localUri = await downloadToTemp(meta);
  const mimeType = MIME_BY_KIND[meta.kind] ?? MIME_BY_KIND.file;
  const uti = UTI_BY_KIND[meta.kind];
  await shareFileNative(localUri, {
    mimeType,
    uti,
    dialogTitle: `Share ${meta.name}`,
    message: meta.name,
  });
}
