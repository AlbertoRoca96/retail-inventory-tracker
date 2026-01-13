import { supabase } from './supabase';
import { getSignedStorageUrl } from './supabaseHelpers';
import { generateUuid } from './uuid';

export type DirectMessage = {
  id: string;
  created_at: string;
  team_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  attachment_url?: string | null;
  attachment_type?: 'image' | 'csv' | 'pdf' | 'excel' | null;
  attachment_signed_url?: string | null;
};

function participantsFilter(selfId: string, peerId: string) {
  const a = `and(sender_id.eq.${selfId},recipient_id.eq.${peerId})`;
  const b = `and(sender_id.eq.${peerId},recipient_id.eq.${selfId})`;
  return `${a},${b}`;
}

function parseSupabaseStorageUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (!/supabase\.co$/i.test(parsed.hostname)) return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    const objectIndex = parts.indexOf('object');
    if (objectIndex === -1 || parts.length < objectIndex + 3) return null;
    const bucket = parts[objectIndex + 2];
    const key = parts.slice(objectIndex + 3).join('/');
    if (!bucket || !key) return null;
    return { bucket, key, hasToken: parsed.searchParams.has('token') };
  } catch {
    return null;
  }
}

async function resolveDirectAttachment(path?: string | null) {
  if (!path) return null;
  if (/^https?:/i.test(path)) {
    const parsed = parseSupabaseStorageUrl(path);
    if (parsed && !parsed.hasToken) {
      const signed = await getSignedStorageUrl(parsed.bucket, parsed.key, 60 * 60 * 4);
      if (signed) return signed;
    }
    return path;
  }
  const buckets = ['chat', 'submission-csvs'];
  for (const bucket of buckets) {
    const signed = await getSignedStorageUrl(bucket, path, 60 * 60 * 4);
    if (signed) return signed;
  }
  return null;
}

async function hydrateDirectMessage(msg?: DirectMessage | null) {
  if (!msg) return undefined;
  const signed = await resolveDirectAttachment(msg.attachment_url);
  return { ...msg, attachment_signed_url: signed ?? msg.attachment_url ?? null };
}

async function hydrateDirectMessages(list: DirectMessage[]) {
  const hydrated = await Promise.all(list.map((msg) => hydrateDirectMessage(msg)));
  return hydrated.filter(Boolean) as DirectMessage[];
}

export async function fetchDirectMessages(
  teamId: string,
  peerId: string,
  selfId: string,
  limit = 200
): Promise<DirectMessage[]> {
  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .eq('team_id', teamId)
    .or(participantsFilter(selfId, peerId))
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return await hydrateDirectMessages((data as DirectMessage[]) || []);
}

export async function sendDirectMessage(options: {
  id?: string;
  teamId: string;
  recipientId: string;
  body: string;
  attachmentPath?: string | null;
  attachmentUrl?: string | null;
  attachmentType?: 'image' | 'csv' | 'pdf' | 'excel' | null;
}): Promise<{ success: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };
  try {
    const messageId = options.id ?? generateUuid();
    const { error } = await supabase.from('direct_messages').insert({
      id: messageId,
      team_id: options.teamId,
      sender_id: user.id,
      recipient_id: options.recipientId,
      body: options.body,
      attachment_url: options.attachmentPath ?? options.attachmentUrl ?? null,
      attachment_type: options.attachmentType ?? null,
    });
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Unable to send message' };
  }
}

export function subscribeToDirectMessages(
  teamId: string,
  selfId: string,
  peerId: string,
  callback: (payload: {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new?: DirectMessage;
    old?: DirectMessage;
  }) => void
) {
  const channel = supabase
    .channel(`dm-${teamId}-${selfId}-${peerId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'direct_messages',
      filter: `team_id=eq.${teamId}`,
    }, (payload) => {
      const next = payload.new as DirectMessage | undefined;
      const prev = payload.old as DirectMessage | undefined;
      const isParticipant = (msg?: DirectMessage) =>
        !!msg && ((msg.sender_id === selfId && msg.recipient_id === peerId) || (msg.sender_id === peerId && msg.recipient_id === selfId));
      if (payload.eventType === 'INSERT' && !isParticipant(next)) return;
      if (payload.eventType === 'UPDATE' && !isParticipant(next)) return;
      if (payload.eventType === 'DELETE' && !isParticipant(prev)) return;
      (async () => {
        const hydratedNew = await hydrateDirectMessage(next);
        const hydratedOld = await hydrateDirectMessage(prev);
        callback({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          new: hydratedNew,
          old: hydratedOld,
        });
      })();
    })
    .subscribe();
  return channel;
}
