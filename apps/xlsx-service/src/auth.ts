import type { SupabaseClient } from '@supabase/supabase-js';

export type AuthedUser = {
  id: string;
  email?: string | null;
};

export function getBearerToken(req: { headers: Record<string, unknown> }): string | null {
  const raw = (req.headers['authorization'] ?? req.headers['Authorization']) as string | undefined;
  if (!raw) return null;
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export async function getUserFromSupabaseJwt(
  admin: SupabaseClient,
  jwt: string
): Promise<AuthedUser | null> {
  try {
    const { data, error } = await admin.auth.getUser(jwt);
    if (error) return null;
    const u = data?.user;
    if (!u?.id) return null;
    return { id: u.id, email: u.email };
  } catch {
    return null;
  }
}
