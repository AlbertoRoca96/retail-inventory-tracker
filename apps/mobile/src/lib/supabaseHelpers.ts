import { Platform } from 'react-native';
import { supabase } from './supabase';

type Picked = { uri: string; mimeType?: string | null };

async function uriToBlobWeb(uri: string): Promise<Blob> {
  const r = await fetch(uri);
  return await r.blob();
}

export async function uploadPhotosAndGetUrls(
  userId: string,
  photos: Picked[]
): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const { uri, mimeType } = photos[i];
    const ext =
      (mimeType && mimeType.split('/')[1]) ||
      uri.split('?')[0].split('#')[0].split('.').pop() ||
      'jpg';

    const path = `${userId}/${Date.now()}-${i}.${ext}`;

    // Prepare file data per platform
    let fileBody: any;
    let contentType = mimeType || `image/${ext}`;

    if (Platform.OS === 'web') {
      fileBody = await uriToBlobWeb(uri);
    } else {
      // Native — Supabase accepts a File/Blob or Uint8Array; RN fetch->blob works too
      const res = await fetch(uri);
      fileBody = await res.blob();
    }

    const { error } = await supabase.storage
      .from('photos')
      .upload(path, fileBody, { contentType, upsert: false });

    if (error) throw error;

    const { data } = supabase.storage.from('photos').getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}
