import { supabase } from './supabase';

export type DirectMessage = {
  id: string;
  created_at: string;
  team_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  attachment_url?: string | null;
  attachment_type?: 'image' | 'csv' | 'pdf' | 'excel' | null;
};

function participantsFilter(selfId: string, peerId: string) {
  const a = `and(sender_id.eq.${selfId},recipient_id.eq.${peerId})`;
  const b = `and(sender_id.eq.${peerId},recipient_id.eq.${selfId})`;
  return `${a},${b}`;
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
  return (data as DirectMessage[]) || [];
}

export async function sendDirectMessage(options: {
  teamId: string;
  recipientId: string;
  body: string;
  attachmentUrl?: string | null;
  attachmentType?: 'image' | 'csv' | 'pdf' | 'excel' | null;
}): Promise<{ success: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };
  try {
    const { error } = await supabase.from('direct_messages').insert({
      team_id: options.teamId,
      sender_id: user.id,
      recipient_id: options.recipientId,
      body: options.body,
      attachment_url: options.attachmentUrl ?? null,
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
      callback({
        eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
        new: next,
        old: prev,
      });
    })
    .subscribe();
  return channel;
}
