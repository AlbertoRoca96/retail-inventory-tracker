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
  const blob = photo.blob ?? (await (await fetch(photo.uri!)).blob());
  const guessedType = photo.mimeType || blob.type || guessMimeType(path) || 'application/octet-stream';
  if (__DEV__) {
    console.log('[storage upload]', bucket, path, guessedType);
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
