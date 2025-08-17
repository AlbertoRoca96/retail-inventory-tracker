// apps/mobile/src/lib/supabaseHelpers.ts
import { supabase } from './supabase';

export type FormValues = {
  date: string;
  store_location: string;
  conditions: string;
  price_per_unit: string;
  shelf_space: string;
  on_shelf: string;
  tags: string;
  notes: string;
};

export async function uploadPhotosToBucket(
  files: { uri: string; name?: string; type?: string }[],
  folder: string,
  bucket = 'form-photos'
) {
  const urls: string[] = [];

  for (const [idx, f] of files.entries()) {
    // Convert the URI to a Blob / File for upload
    const res = await fetch(f.uri);
    const blob = await res.blob();

    const ext =
      f.type?.split('/').pop() ||
      (blob.type.includes('jpeg') ? 'jpg' : blob.type.split('/').pop() || 'bin');

    const path = `${folder}/photo-${idx + 1}.${ext}`;

    const { error } = await supabase.storage.from(bucket).upload(path, blob, {
      contentType: blob.type,
      upsert: true
    });
    if (error) throw error;

    // Build a public URL (assuming bucket is public)
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  return urls;
}

export async function insertSubmission(
  values: FormValues,
  photo_urls: string[],
  status: 'draft' | 'submitted'
) {
  // Insert main row
  const { data, error } = await supabase
    .from('submissions')
    .insert({
      status,
      date: values.date,
      store_location: values.store_location,
      conditions: values.conditions,
      price_per_unit: values.price_per_unit,
      shelf_space: values.shelf_space,
      on_shelf: values.on_shelf,
      tags: values.tags,
      notes: values.notes
    })
    .select('id')
    .single();

  if (error) throw error;

  // Optional: store photos in a separate table if you created it
  if (photo_urls.length) {
    const rows = photo_urls.map((url) => ({
      submission_id: data.id,
      url
    }));
    const { error: pErr } = await supabase.from('submission_photos').insert(rows);
    if (pErr) throw pErr;
  }

  return data.id as string;
}
