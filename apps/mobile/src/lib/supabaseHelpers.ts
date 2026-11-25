import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { Buffer } from 'buffer';
import { supabase } from './supabase';

export type PhotoLike = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  assetId?: string | null;
};

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return Uint8Array.from(u8).buffer;
}

function safeExtFromUri(uri: string): string {
  const clean = (uri || '').split('?')[0];
  const last = clean.split('/').pop() || '';
  const ext = (last.includes('.') ? last.split('.').pop() : '') || '';
  const normalized = ext.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return normalized || 'jpg';
}

async function ensureFileUri(uri: string): Promise<string> {
  // Expo ImagePicker can return `content://` on Android.
  // Supabase upload needs real bytes; the most reliable approach is copying
  // the content URI into our cache so we can read it as a normal file.
  if (!uri) throw new Error('ensureFileUri requires a uri');

  if (uri.startsWith('file://')) return uri;

  if (uri.startsWith('content://')) {
    const ext = safeExtFromUri(uri);
    const dest = `${FileSystem.cacheDirectory}rit-upload-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}.${ext}`;

    try {
      await FileSystem.copyAsync({ from: uri, to: dest });
      return dest;
    } catch (e) {
      // If copy fails, we fall back to the original uri and let the read step throw.
      console.warn('[upload] Failed to copy content uri to cache', { uri, dest, error: e });
      return uri;
    }
  }

  return uri;
}

export async function getSignedStorageUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 60 * 60 * 24 * 7
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds, { download: false });
    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
  } catch (error) {
    console.warn('[storage] signed url failed', bucket, path, error);
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

export async function uploadAvatarAndGetPublicUrl(
  uid: string,
  file: PhotoLike,
  bucket = 'avatars'
): Promise<{ path: string; publicUrl: string | null } | null> {
  if (!file?.uri) return null;
  if (!uid) throw new Error('uploadAvatar requires a user id');

  const ext = (file.fileName?.split('.').pop() || 'jpg').toLowerCase();
  const path = `${uid}/avatar.${ext}`;
  return uploadFileToStorage({
    bucket: bucket || 'avatars',
    path,
    photo: file,
  });
}

function guessMimeType(path: string): string {
  const lower = (path || '').toLowerCase();

  // Images
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.heic')) return 'image/heic';

  // Docs
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.pptx')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

  return 'application/octet-stream';
}

/**
 * GPT's EXACT code for ArrayBuffer upload.
 * This fixes the 0-byte file issue.
 */
export async function uploadSubmissionPhoto({
  bucket = 'submissions',
  path,
  uri,
  contentType = 'image/jpeg',
  upsert = true,
}: {
  bucket?: string;
  path: string;
  uri: string;
  contentType?: string;
  upsert?: boolean;
}) {
  let bytes: Uint8Array | null = null;

  if (Platform.OS === 'web') {
    // Browser blob URLs are not Expo filesystem paths.
    const response = await fetch(uri);
    if (!response.ok) throw new Error('Could not read the selected browser file. Reattach it and retry.');
    bytes = new Uint8Array(await response.arrayBuffer());
  } else {
    const safeUri = await ensureFileUri(uri);
    const base64 = await FileSystem.readAsStringAsync(safeUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    bytes = base64 ? new Uint8Array(Buffer.from(base64, 'base64')) : null;
  }

  if (!bytes || bytes.byteLength === 0) {
    throw new Error('Selected file is empty or unavailable. Reattach it and retry.');
  }

  const ab = toArrayBuffer(bytes);
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, ab, {
      contentType,
      upsert,
      cacheControl: '3600',
    });
  if (error) throw error;
  return data;
}

/**
 * Upload any local file URI into Supabase Storage.
 * Uses the same 0-byte-safe ArrayBuffer pipeline.
 */
export async function uploadLocalFileToStorage({
  bucket,
  path,
  uri,
  contentType,
  upsert = true,
}: {
  bucket: string;
  path: string;
  uri: string;
  contentType?: string;
  upsert?: boolean;
}): Promise<{ path: string; publicUrl: string | null }> {
  if (!uri) throw new Error('uploadLocalFileToStorage requires a uri');
  const ct = contentType || guessMimeType(path);

  const data = await uploadSubmissionPhoto({
    bucket,
    path,
    uri,
    contentType: ct,
    upsert,
  });

  const publicUrl = await getSignedStorageUrl(bucket, path);
  return { path: data.path, publicUrl };
}

/**
 * Upload helper that matches the existing codebase signature.
 * Internally uses the same ArrayBuffer method.
 */
export async function uploadFileToStorage({
  bucket,
  path,
  photo,
  upsert = true,
}: {
  bucket: string;
  path: string;
  photo: PhotoLike;
  upsert?: boolean;
}): Promise<{ path: string; publicUrl: string | null }> {
  if (!photo?.uri) {
    throw new Error('uploadFileToStorage requires a uri');
  }

  return uploadLocalFileToStorage({
    bucket,
    path,
    uri: photo.uri,
    contentType: photo.mimeType || undefined,
    upsert,
  });
}
