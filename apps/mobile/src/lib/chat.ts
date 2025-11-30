// apps/mobile/src/lib/chat.ts
import { supabase } from './supabase';

// Types for chat functionality
export type SubmissionMessage = {
  id: string;
  created_at: string;
  updated_at: string;
  team_id: string;
  submission_id?: string | null;
  sender_id: string;
  body: string;
  is_internal: boolean;
  attachment_path?: string | null;
  attachment_type?: 'csv' | 'image' | 'pdf' | 'excel' | null;
  is_revised: boolean;
};

// Fixed message columns - no auth.users joins to avoid PGRST100 errors
const MESSAGE_COLUMNS = 'id, team_id, submission_id, sender_id, body, is_internal, attachment_path, attachment_type, is_revised, created_at, updated_at';

export type ChatRoom = {
  team_id: string;
  team_name: string;
  submission_id?: string;
  last_message?: SubmissionMessage;
  unread_count: number;
  last_activity: string;
};

export type NewMessage = {
  team_id: string;
  submission_id?: string | null;
  body: string;
  is_internal?: boolean;
  attachment_path?: string;
  attachment_type?: 'csv' | 'image' | 'pdf' | 'excel';
  is_revised?: boolean;
};

// Fetch messages for a specific submission
export async function fetchSubmissionMessages(
  submissionId: string,
  options: {
    limit?: number;
  } = {}
): Promise<{ messages: SubmissionMessage[]; error?: string }> {
  try {
    const { limit = 50 } = options;

    const { data, error } = await supabase
      .from('submission_messages')
      .select(MESSAGE_COLUMNS)
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return { messages: data || [] };
  } catch (error) {
    console.error('Error fetching submission messages:', error);
    return { messages: [], error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Fetch team messages for team chat (internal messages only, no submission_id)
export async function fetchTeamMessages(
  teamId: string,
  options: {
    limit?: number;
  } = {}
): Promise<{ messages: SubmissionMessage[]; error?: string }> {
  try {
    const { limit = 100 } = options;

    const { data, error } = await supabase
      .from('submission_messages')
      .select(MESSAGE_COLUMNS)
      .eq('team_id', teamId)
      .eq('is_internal', true)
      .is('submission_id', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return { messages: data || [] };
  } catch (error) {
    console.error('Error fetching team messages:', error);
    return { messages: [], error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Send a message (with optional attachment)
export async function sendSubmissionMessage(
  message: NewMessage
): Promise<{ success: boolean; error?: string; message?: SubmissionMessage }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('submission_messages')
      .insert({
        ...message,
        sender_id: user.id,
      })
      .select(MESSAGE_COLUMNS)
      .single();

    if (error) throw error;

    return { success: true, message: data };
  } catch (error) {
    console.error('Error sending message:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Upload CSV and send it as a chat message
export async function sendCsvAttachmentMessage(
  teamId: string,
  submissionId: string | null,
  file: File,
  message: string,
  options: {
    is_internal?: boolean;
    is_revised?: boolean;
  } = {}
): Promise<{ success: boolean; error?: string; message?: SubmissionMessage }> {
  try {
    const { is_internal = false, is_revised = false } = options;

    // Upload CSV file to storage
    const fileName = `${Date.now()}-${file.name}`;
    const filePath = `${teamId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('submission-csvs')
      .upload(filePath, file, {
        contentType: 'text/csv',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('submission-csvs')
      .getPublicUrl(filePath);

    // Send the chat message with attachment
    const result = await sendSubmissionMessage({
      team_id: teamId,
      submission_id: submissionId,
      body: message,
      is_internal,
      is_revised,
      attachment_path: publicUrl,
      attachment_type: 'csv',
    });

    return result;
  } catch (error) {
    console.error('Error sending CSV attachment message:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Subscribe to real-time updates for a specific submission
export function subscribeToSubmissionMessages(
  submissionId: string,
  callback: (payload: { 
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new?: SubmissionMessage;
    old?: SubmissionMessage;
  }) => void
) {
  const subscription = supabase
    .channel(`submission-${submissionId}-messages`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'submission_messages',
        filter: `submission_id=eq.${submissionId}`,
      },
      (payload) => {
        callback({
          eventType: payload.eventType,
          new: payload.new as SubmissionMessage,
          old: payload.old as SubmissionMessage,
        });
      }
    )
    .subscribe();

  return subscription;
}

// Subscribe to real-time updates for team messages
export function subscribeToTeamMessages(
  teamId: string,
  callback: (payload: { 
    eventType: 'INSERT' | 'UPDATE' | 'DELETE'; 
    new?: SubmissionMessage;
    old?: SubmissionMessage;
  }) => void
) {
  const subscription = supabase
    .channel(`team-${teamId}-messages`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'submission_messages',
        filter: `team_id=eq.${teamId},is_internal=eq.true`,
      },
      (payload) => {
        callback({
          eventType: payload.eventType,
          new: payload.new as SubmissionMessage,
          old: payload.old as SubmissionMessage,
        });
      }
    )
    .subscribe();

  return subscription;
}

// Mark messages as read (update user preferences)
export async function markMessagesAsRead(
  teamId: string,
  submissionId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // This would typically update a user_preferences table or similar
    // For now, we'll store in user metadata
    const preferencesKey = `chat_last_read_${teamId}${submissionId ? '_' + submissionId : ''}`;
    
    const { error } = await supabase.auth.updateUser({
      data: {
        [preferencesKey]: new Date().toISOString(),
      },
    });

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Error marking messages as read:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Get unread message count for a team (removed soft-delete filtering)
export async function getUnreadMessageCount(
  teamId: string,
  submissionId?: string
): Promise<{ count: number; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const preferencesKey = `chat_last_read_${teamId}${submissionId ? '_' + submissionId : ''}`;
    const lastRead = user.user_metadata?.[preferencesKey];

    let query = supabase
      .from('submission_messages')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .neq('sender_id', user.id);

    if (submissionId) {
      query = query.eq('submission_id', submissionId);
    }

    if (lastRead) {
      query = query.gt('created_at', lastRead);
    }

    const { count, error } = await query;

    if (error) throw error;

    return { count: count || 0 };
  } catch (error) {
    console.error('Error getting unread count:', error);
    return { count: 0, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Delete messages functionality removed - soft deletes disabled for now