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
  reply_to_id?: string | null;
  deleted_at?: string | null;
  // Optional joined data
  sender_name?: string;
  sender_email?: string;
  submission_date?: string;
  submission_location?: string;
};

export type ChatRoom = {
  team_id: string;
  team_name: string;
  submission_id?: string;
  submission_date?: string;
  submission_location?: string;
  last_message?: SubmissionMessage;
  unread_count: number;
  last_activity: string;
};

export type NewMessage = {
  team_id: string;
  submission_id?: string;
  body: string;
  is_internal?: boolean;
  attachment_path?: string;
  attachment_type?: 'csv' | 'image' | 'pdf' | 'excel';
  is_revised?: boolean;
  reply_to_id?: string;
};

// Fetch messages for a specific submission
export async function fetchSubmissionMessages(
  submissionId: string,
  options: {
    limit?: number;
    offset?: number;
    includeDeleted?: boolean;
  } = {}
): Promise<{ messages: SubmissionMessage[]; error?: string }> {
  try {
    const { limit = 50, offset = 0, includeDeleted = false } = options;

    let query = supabase
      .from('submission_messages')
      .select(`
        *,
        sender:auth.users!sender_id(
          id,
          raw_user_meta_data->>'display_name' as display_name,
          email
        ),
        submission:submissions(
          id,
          date,
          store_location
        )
      `)
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (!includeDeleted) {
      query = query.is('deleted_at', null);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Transform the data to match the expected types
    const messages: SubmissionMessage[] = (data || []).map((msg: any) => ({
      id: msg.id,
      created_at: msg.created_at,
      updated_at: msg.updated_at,
      team_id: msg.team_id,
      submission_id: msg.submission_id,
      sender_id: msg.sender_id,
      body: msg.body,
      is_internal: msg.is_internal,
      attachment_path: msg.attachment_path,
      attachment_type: msg.attachment_type,
      is_revised: msg.is_revised,
      reply_to_id: msg.reply_to_id,
      deleted_at: msg.deleted_at,
      sender_name: msg.sender?.display_name,
      sender_email: msg.sender?.email,
      submission_date: msg.submission?.date,
      submission_location: msg.submission?.store_location,
    }));

    return { messages };
  } catch (error) {
    console.error('Error fetching submission messages:', error);
    return { messages: [], error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Fetch team messages (including internal and submission-specific)
export async function fetchTeamMessages(
  teamId: string,
  options: {
    limit?: number;
    offset?: number;
    includeInternal?: boolean;
    includeDeleted?: boolean;
  } = {}
): Promise<{ messages: SubmissionMessage[]; error?: string }> {
  try {
    const { limit = 50, offset = 0, includeInternal = true, includeDeleted = false } = options;

    let query = supabase
      .from('submission_messages')
      .select(`
        *,
        sender:auth.users!sender_id(
          id,
          raw_user_meta_data->>'display_name' as display_name,
          email
        ),
        submission:submissions(
          id,
          date,
          store_location,
          store_site
        )
      `)
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (!includeInternal) {
      query = query.is('is_internal', false);
    }

    if (!includeDeleted) {
      query = query.is('deleted_at', null);
    }

    const { data, error } = await query;

    if (error) throw error;

    const messages: SubmissionMessage[] = (data || []).map((msg: any) => ({
      id: msg.id,
      created_at: msg.created_at,
      updated_at: msg.updated_at,
      team_id: msg.team_id,
      submission_id: msg.submission_id,
      sender_id: msg.sender_id,
      body: msg.body,
      is_internal: msg.is_internal,
      attachment_path: msg.attachment_path,
      attachment_type: msg.attachment_type,
      is_revised: msg.is_revised,
      reply_to_id: msg.reply_to_id,
      deleted_at: msg.deleted_at,
      sender_name: msg.sender?.display_name,
      sender_email: msg.sender?.email,
      submission_date: msg.submission?.date,
      submission_location: msg.submission?.store_location,
    }));

    return { messages };
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
    const { data, error } = await supabase
      .from('submission_messages')
      .insert({
        ...message,
        sender_id: (await supabase.auth.getUser()).data.user?.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Fetch the complete message with sender info
    const { data: fullMessage, error: fetchError } = await supabase
      .from('submission_messages')
      .select(`
        *,
        sender:auth.users!sender_id(
          id,
          raw_user_meta_data->>'display_name' as display_name,
          email
        )
      `)
      .eq('id', data.id)
      .single();

    if (fetchError) throw fetchError;

    const result: SubmissionMessage = {
      id: fullMessage.id,
      created_at: fullMessage.created_at,
      updated_at: fullMessage.updated_at,
      team_id: fullMessage.team_id,
      submission_id: fullMessage.submission_id,
      sender_id: fullMessage.sender_id,
      body: fullMessage.body,
      is_internal: fullMessage.is_internal,
      attachment_path: fullMessage.attachment_path,
      attachment_type: fullMessage.attachment_type,
      is_revised: fullMessage.is_revised,
      reply_to_id: fullMessage.reply_to_id,
      deleted_at: fullMessage.deleted_at,
      sender_name: fullMessage.sender?.display_name,
      sender_email: fullMessage.sender?.email,
    };

    return { success: true, message: result };
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
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

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
      submission_id: submissionId || undefined,
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
      async (payload) => {
        // Transform payload to include sender info if needed
        if (payload.eventType === 'INSERT' && payload.new) {
          const { data: fullMessage } = await supabase
            .from('submission_messages')
            .select(`
              *,
              sender:auth.users!sender_id(
                id,
                raw_user_meta_data->>'display_name' as display_name,
                email
              )
            `)
            .eq('id', (payload.new as any).id)
            .single();

          const message: SubmissionMessage = {
            ...(payload.new as any),
            sender_name: fullMessage?.sender?.display_name,
            sender_email: fullMessage?.sender?.email,
          };

          callback({
            eventType: payload.eventType,
            new: message,
          });
        } else {
          callback({
            eventType: payload.eventType,
            new: payload.new as SubmissionMessage,
            old: payload.old as SubmissionMessage,
          });
        }
      }
    )
    .subscribe();

  return subscription;
}

// Subscribe to real-time updates for all team messages (for global notifications)
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
        filter: `team_id=eq.${teamId}`,
      },
      async (payload) => {
        // Similar transformation as above
        if (payload.eventType === 'INSERT' && payload.new) {
          const { data: fullMessage } = await supabase
            .from('submission_messages')
            .select(`
              *,
              sender:auth.users!sender_id(
                id,
                raw_user_meta_data->>'display_name' as display_name,
                email
              ),
              submission:submissions(
                id,
                date,
                store_location,
                store_site
              )
            `)
            .eq('id', (payload.new as any).id)
            .single();

          const message: SubmissionMessage = {
            ...(payload.new as any),
            sender_name: fullMessage?.sender?.display_name,
            sender_email: fullMessage?.sender?.email,
            submission_date: fullMessage?.submission?.date,
            submission_location: fullMessage?.submission?.store_location,
          };

          callback({
            eventType: payload.eventType,
            new: message,
          });
        } else {
          callback({
            eventType: payload.eventType,
            new: payload.new as SubmissionMessage,
            old: payload.old as SubmissionMessage,
          });
        }
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

// Get unread message count for a team
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
      .eq('team_id', teamId);

    if (submissionId) {
      query = query.eq('submission_id', submissionId);
    }

    if (lastRead) {
      query = query.gt('created_at', lastRead);
    }

    query = query.neq('sender_id', user.id).is('deleted_at', null);

    const { count, error } = await query;

    if (error) throw error;

    return { count: count || 0 };
  } catch (error) {
    console.error('Error getting unread count:', error);
    return { count: 0, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Delete a message (soft delete)
export async function deleteMessage(
  messageId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('submission_messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', messageId);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Error deleting message:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}