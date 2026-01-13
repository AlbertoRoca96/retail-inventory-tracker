import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';

export type PhotoLike = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  blob?: Blob | null;
};

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
    if (__DEV__) {
      console.warn('[storage] signed url failed', bucket, path, error);
    }
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl ?? null;
}



/** Upload a single avatar image and return a public URL */
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

async function blobFromUri(uri: string, mimeType?: string | null) {
  try {
    const response = await fetch(uri);
    const fetchedBlob = await response.blob();
    if (fetchedBlob && fetchedBlob.size > 0) {
      return fetchedBlob;
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[storage upload] fetch fallback', error);
    }
  }

  // Fallback to reading via FileSystem (needed on some iOS builds when fetch returns empty)
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const buffer = Buffer.from(base64, 'base64');
    return new Blob([buffer], { type: mimeType || 'application/octet-stream' });
  } catch (fsError) {
    if (__DEV__) {
      console.warn('[storage upload] filesystem fallback failed', fsError);
    }
    throw fsError;
  }
}

export async function uploadFileToStorage({
  bucket,
  path,
  photo,
}: {
  bucket: string;
  path: string;
  photo: PhotoLike;
}): Promise<{ path: string; publicUrl: string | null }> {
  if (!photo?.uri && !photo?.blob) {
    throw new Error('uploadFileToStorage requires a uri or blob');
  }
  const blob = photo.blob ?? (await blobFromUri(photo.uri!, photo.mimeType));
  const guessedType = photo.mimeType || blob.type || guessMimeType(path) || 'application/octet-stream';
  if (__DEV__) {
    console.log('[storage upload]', bucket, path, guessedType, blob.size);
  }
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    upsert: true,
    contentType: guessedType,
  });
  if (error) {
    if (__DEV__) {
      console.warn('[storage upload] failed', bucket, path, error);
    }
    throw error;
  }
  const publicUrl = await getSignedStorageUrl(bucket, path);
  return { path, publicUrl };
}

function guessMimeType(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return null;
}
