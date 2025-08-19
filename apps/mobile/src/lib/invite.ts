import { supabase } from './supabase';

const fnBase = process.env.EXPO_PUBLIC_SUPABASE_URL!
  .replace('https://', 'https://')
  .replace('.supabase.co', '.functions.supabase.co');

export async function inviteUserByEmail(email: string, team_id?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  const access_token = session?.access_token;
  if (!access_token) throw new Error('You must be signed in');

  const res = await fetch(`${fnBase}/invite-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${access_token}`,
    },
    body: JSON.stringify({ email, team_id }),
  });

  const body = await res.json();
  if (!res.ok) throw new Error(body?.error || 'Invite failed');
  return body;
}
