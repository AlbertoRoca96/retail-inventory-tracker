// Chat/messaging functionality for submissions

export const MESSAGE_COLUMNS = 'id, team_id, submission_id, sender_id, body, is_internal, attachment_path, attachment_type, is_revised, created_at';

// Types for submission messages
export interface SubmissionMessage {
  id: string;
  team_id: string;
  submission_id: string;
  sender_id: string;
  body: string;
  is_internal: boolean;
  attachment_path?: string;
  attachment_type?: string;
  is_revised: boolean;
  created_at: string;
}

// TODO: Add chat functionality here when needed
// This file is prepared for future messaging features
// The MESSAGE_COLUMNS constant explicitly excludes 'updated_at' as that column doesn't exist in the submission_messages table
