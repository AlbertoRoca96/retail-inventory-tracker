import { supabase } from './supabase';

export type PhotoLike = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  blob?: Blob | null;
};

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
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      urls.push(data.publicUrl);
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
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      out.push({ path, publicUrl: data.publicUrl });
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

  const ext = (file.fileName?.split('.').pop() || 'jpg').toLowerCase();
  const path = `${uid}/avatar.${ext}`;
  const blob = file.blob ?? (await (await fetch(file.uri)).blob());
  const mimeType = file.mimeType || blob.type || 'image/jpeg';

  const candidates = Array.from(
    new Set(
      [bucket, 'avatars', 'profile-photos', 'photos']
        .filter(Boolean)
    )
  );

  let lastError: any = null;

  for (const target of candidates) {
    try {
      const { error } = await supabase.storage.from(target).upload(path, blob, {
        upsert: true,
        contentType: mimeType,
      });
      if (error) throw error;
      const { data } = supabase.storage.from(target).getPublicUrl(path);
      if (data?.publicUrl) {
        return data.publicUrl;
      }
    } catch (error) {
      lastError = error;
      if (__DEV__) {
        console.warn('[avatar upload]', target, error);
      }
    }
  }

  if (lastError) {
    throw lastError;
  }
  return null;
}
