// apps/mobile/src/lib/invite.ts
import { supabase } from './supabase';
import { webBasePath } from './webBasePath';

const fnBase = process.env.EXPO_PUBLIC_SUPABASE_URL!
  .replace('https://', 'https://')
  .replace('.supabase.co', '.functions.supabase.co');

function computeRedirectTo(): string | undefined {
  // Web only – for native you’ll likely use your custom scheme
  if (typeof window === 'undefined') return undefined;
  const base = `${window.location.origin}${webBasePath()}`; // e.g. https://albertoroca96.github.io/retail-inventory-tracker
  return `${base}/auth/callback`;
}

export async function inviteUserByEmail(email: string, team_id?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  const access_token = session?.access_token;
  if (!access_token) throw new Error('You must be signed in');

  const redirectTo = computeRedirectTo();

  const res = await fetch(`${fnBase}/invite-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${access_token}`,
    },
    body: JSON.stringify({ email, team_id, redirectTo }),
  });

  const body = await res.json();
  if (!res.ok) throw new Error(body?.error || 'Invite failed');
  return body;
}
