import { createClient } from '@supabase/supabase-js';
import { resolvedSupabaseUrl } from './supabase';

const sanitize = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return undefined;
  return trimmed;
};

const serviceRoleKey = sanitize(process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY);

export const hasSupabaseAdmin = Boolean(resolvedSupabaseUrl && serviceRoleKey);

export const supabaseAdmin = hasSupabaseAdmin
  ? createClient(resolvedSupabaseUrl!, serviceRoleKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

export async function adminUserExists(email: string): Promise<boolean | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserByEmail(email);
    return !!data?.user;
  } catch (error: any) {
    if (error?.status === 404) return false;
    throw error;
  }
}
