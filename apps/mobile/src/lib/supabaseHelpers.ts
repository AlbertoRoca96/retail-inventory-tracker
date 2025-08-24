import { supabase } from './supabase';

export type PhotoLike = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
};

/** (kept) – returns public URLs only */
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

    const res = await fetch(p.uri);
    const blob = await res.blob();

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

/** NEW – returns both the storage path (for DB/signing) and a public URL (for Excel/PDF) */
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

    const res = await fetch(p.uri);
    const blob = await res.blob();

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
