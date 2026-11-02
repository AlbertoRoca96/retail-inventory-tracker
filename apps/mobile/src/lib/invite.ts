// apps/mobile/src/lib/invite.ts
import { resolvedSupabaseUrl, supabase } from './supabase';
import { webAuthCallbackUrl } from './webBasePath';

function getFunctionsBase(): string {
  if (!resolvedSupabaseUrl) {
    throw new Error('Cannot send invites because Supabase is not configured.');
  }
  return `${resolvedSupabaseUrl}/functions/v1`;
}

export async function inviteUserByEmail(email: string, team_id?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  const access_token = session?.access_token;
  if (!access_token) throw new Error('You must be signed in');

  const redirectTo = webAuthCallbackUrl('invite');

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
