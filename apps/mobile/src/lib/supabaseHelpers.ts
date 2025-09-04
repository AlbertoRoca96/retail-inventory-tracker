// apps/mobile/src/lib/supabaseHelpers.ts
import { supabase } from './supabase';
import type { Template, TemplateData } from '../types';

export type PhotoLike = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
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

/** Upload a single avatar image and return a public URL */
export async function uploadAvatarAndGetPublicUrl(
  uid: string,
  file: PhotoLike,
  bucket = 'avatars'
): Promise<string | null> {
  if (!file?.uri) return null;

  const ext = (file.fileName?.split('.').pop() || 'jpg').toLowerCase();
  const path = `${uid}/avatar.${ext}`;

  const res = await fetch(file.uri);
  const blob = await res.blob();

  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    upsert: true,
    contentType: file.mimeType || blob.type || 'image/jpeg',
  });
  if (error) return null;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl || null;
}

/* =========================================
   NEW: Submission Templates (Supabase CRUD)
   ========================================= */

/** List the current user's templates. Optionally filter by a team. */
export async function listSubmissionTemplates(userId: string, teamId: string | null): Promise<Template[]> {
  const q = supabase.from('submission_templates').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  const { data, error } = teamId ? await q.eq('team_id', teamId) : await q;
  if (error) throw error;
  return (data || []) as Template[];
}

/** Create a new template for the user. */
export async function createSubmissionTemplate(
  userId: string,
  teamId: string | null,
  name: string,
  data: TemplateData,
  isDefault = false
): Promise<Template> {
  const payload: Omit<Template, 'id' | 'created_at' | 'updated_at'> = {
    user_id: userId,
    team_id: teamId,
    name,
    is_default: !!isDefault,
    data,
  } as any;
  const { data: rows, error } = await supabase.from('submission_templates').insert(payload as any).select('*').limit(1);
  if (error) throw error;
  return (rows?.[0] as Template) as Template;
}

/** Delete a template (must belong to current user per RLS). */
export async function deleteSubmissionTemplate(userId: string, templateId: string): Promise<void> {
  const { error } = await supabase.from('submission_templates').delete().eq('id', templateId).eq('user_id', userId);
  if (error) throw error;
}

/** Set one template as default for this user (clears others). */
export async function setDefaultSubmissionTemplate(userId: string, templateId: string): Promise<void> {
  // Clear current defaults
  const { error: e1 } = await supabase.from('submission_templates').update({ is_default: false }).eq('user_id', userId);
  if (e1) throw e1;
  // Set new default
  const { error: e2 } = await supabase.from('submission_templates').update({ is_default: true }).eq('id', templateId).eq('user_id', userId);
  if (e2) throw e2;
}
