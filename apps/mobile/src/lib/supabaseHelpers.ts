import { supabase } from './supabase';

export type PhotoLike = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  blob?: Blob | null;
};

async function getPublicOrSignedUrl(bucket: string, path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60 * 24 * 7, { download: false });
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

/** Returns public URLs for up to 2 uploaded photos */
export async function uploadPhotosAndGetUrls(
  uid: string,
  photos: PhotoLike[],
  bucket = 'photos'
): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    if (!p?.uri) continue;

    const ext = (p.fileName?.split('.').pop() || 'jpg').toLowerCase();
    const path = `${uid}/${Date.now()}-${i}.${ext}`;

    const blob = p.blob ?? (await (await fetch(p.uri)).blob());

    const { error } = await supabase.storage.from(bucket).upload(path, blob, {
      upsert: true,
      contentType: p.mimeType || blob.type || 'image/jpeg',
    });
    if (!error) {
      const accessible = await getPublicOrSignedUrl(bucket, path);
      if (accessible) {
        urls.push(accessible);
      }
    }
  }
  return urls.slice(0, 2);
}

/** Returns both storage path and public URL for up to 2 uploaded photos */
export async function uploadPhotosAndGetPathsAndUrls(
  uid: string,
  photos: PhotoLike[],
  bucket = 'photos'
): Promise<{ path: string; publicUrl: string }[]> {
  const out: { path: string; publicUrl: string }[] = [];
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    if (!p?.uri) continue;

    const ext = (p.fileName?.split('.').pop() || 'jpg').toLowerCase();
    const path = `${uid}/${Date.now()}-${i}.${ext}`;

    const blob = p.blob ?? (await (await fetch(p.uri)).blob());

    const { error } = await supabase.storage.from(bucket).upload(path, blob, {
      upsert: true,
      contentType: p.mimeType || blob.type || 'image/jpeg',
    });
    if (!error) {
      const accessible = await getPublicOrSignedUrl(bucket, path);
      if (accessible) {
        out.push({ path, publicUrl: accessible });
      }
    }
  }
  return out.slice(0, 2);
}

/** Upload a single avatar image and return a public URL */
export async function uploadAvatarAndGetPublicUrl(
  uid: string,
  file: PhotoLike,
  bucket = 'avatars'
): Promise<string | null> {
  if (!file?.uri) return null;
  if (!uid) throw new Error('uploadAvatar requires a user id');

  const ext = (file.fileName?.split('.').pop() || 'jpg').toLowerCase();
  const path = `${uid}/avatar.${ext}`;
  const blob = file.blob ?? (await (await fetch(file.uri)).blob());
  const mimeType = file.mimeType || blob.type || 'image/jpeg';
  const targetBucket = bucket || 'avatars';

  if (__DEV__) {
    console.log('[avatar upload] bucket', targetBucket, 'path', path, 'mime', mimeType);
  }

  const { error } = await supabase.storage.from(targetBucket).upload(path, blob, {
    upsert: true,
    contentType: mimeType,
  });

  if (error) {
    if (__DEV__) {
      console.warn('[avatar upload] failed', { bucket: targetBucket, path, error });
    }
    throw error;
  }

  const accessible = await getPublicOrSignedUrl(targetBucket, path);
  return accessible;
}
