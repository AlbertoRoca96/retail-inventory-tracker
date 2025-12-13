// apps/mobile/src/lib/invite.ts
import { supabase } from './supabase';
import { webBasePath } from './webBasePath';

function getFunctionsBase(): string {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('Cannot send invites because EXPO_PUBLIC_SUPABASE_URL is not configured.');
  }
  return supabaseUrl
    .replace('https://', 'https://')
    .replace('.supabase.co', '.functions.supabase.co');
}

function computeRedirectTo(): string | undefined {
  // Web only – for native you’ll likely use your custom scheme
  if (
    typeof window === 'undefined' ||
    typeof window.location === 'undefined' ||
    typeof window.location.origin !== 'string'
  ) {
    return undefined;
  }
  const base = `${window.location.origin}${webBasePath()}`; // e.g. https://albertoroca96.github.io/retail-inventory-tracker
  return `${base}/auth/callback`;
}

export async function inviteUserByEmail(email: string, team_id?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  const access_token = session?.access_token;
  if (!access_token) throw new Error('You must be signed in');

  const redirectTo = computeRedirectTo();

  const res = await fetch(`${getFunctionsBase()}/invite-user`, {
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
