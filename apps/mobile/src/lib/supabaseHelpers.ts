import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';
import { supabase } from './supabase';

export type PhotoLike = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  assetId?: string | null;
};

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
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
  const lower = path.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.heic')) return 'image/heic';
  return 'image/jpeg';
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
}: {
  bucket?: string;
  path: string;
  uri: string;
  contentType?: string;
}) {
  let bytes: Uint8Array | null = null;

  // Preferred: Expo File API (if available)
  const FileCtor = (FileSystem as any).File;
  if (FileCtor) {
    const file = new FileCtor(uri);
    bytes = await file.bytes();
  } else {
    // Fallback: base64 read
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    bytes = base64 ? new Uint8Array(Buffer.from(base64, 'base64')) : null;
  }

  if (!bytes || bytes.byteLength === 0) {
    throw new Error(`uploadSubmissionPhoto: got 0 bytes from uri=${uri}`);
  }

  const ab = toArrayBuffer(bytes);
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, ab, {
      contentType,
      upsert: true,
      cacheControl: '3600',
    });
  if (error) throw error;
  return data;
}

/**
 * Upload helper that matches the existing codebase signature.
 * Internally uses GPT's ArrayBuffer method.
 */
export async function uploadFileToStorage({
  bucket,
  path,
  photo,
}: {
  bucket: string;
  path: string;
  photo: PhotoLike;
}): Promise<{ path: string; publicUrl: string | null }> {
  if (!photo?.uri) {
    throw new Error('uploadFileToStorage requires a uri');
  }

  const contentType = photo.mimeType || guessMimeType(path);

  // Use GPT's exact method
  const data = await uploadSubmissionPhoto({
    bucket,
    path,
    uri: photo.uri,
    contentType,
  });

  const publicUrl = await getSignedStorageUrl(bucket, path);
  return { path: data.path, publicUrl };
}
