/**
 * TypeScript types for the chat module
 * Defines interfaces for one-to-one messaging between users
 */

// Database row types
export interface ChatRow {
  id: string;
  org_id: string;
  participant_1_id: string;
  participant_2_id: string;
  media_summary: { images: string[]; videos: string[]; files: string[]; links: string[] };
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  chat_id: string;
  org_id: string;
  sender_id: string;
  message_type: 'text' | 'image' | 'file' | 'video' | 'link';
  content: string | null;
  file_url: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

// Message types enum
export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  VIDEO = 'video',
  LINK = 'link',
}

// ============================================================================
// CHAT REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Input for creating a new chat between two participants
 */
export interface ChatCreateInput {
  org_id: string; // UUID
  participant_1_id: string; // UUID
  participant_2_id: string; // UUID
}

/**
 * Chat with metadata (read status counts, last message preview)
 */
export interface ChatWithMetadata extends ChatRow {
  unread_count?: number;
  last_message?: MessageRow;
  other_participant?: UserMinimal;
}

/**
 * Minimal user info for chat participants
 */
export interface UserMinimal {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
}

/**
 * Media gallery for a chat (organized by type)
 */
export interface MediaSummary {
  images: string[];
  videos: string[];
  files: string[];
  links: string[];
}

// ============================================================================
// MESSAGE REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Input for sending a new message
 */
export interface MessageCreateInput {
  chat_id: string; // UUID
  sender_id?: string; // UUID (optional - defaults to current user)
  message_type: MessageType | keyof typeof MessageType;
  content?: string; // Text content or link URL
  file_url?: string; // Supabase Storage URL for media
}

/**
 * Input for updating message read status
 */
export interface MessageUpdateInput {
  is_read?: boolean;
  read_at?: string; // ISO timestamp
}

/**
 * Message with sender and recipient info
 */
export interface MessageWithDetails extends MessageRow {
  sender?: UserMinimal;
  chat?: ChatRow;
}

/**
 * Paginated message list response
 */
export interface MessageListResponse {
  messages: MessageWithDetails[];
  total_count: number;
  has_more: boolean;
  cursor?: string | null;
}

// ============================================================================
// QUERY OPTIONS
// ============================================================================

/**
 * Options for listing chats
 */
export interface ChatListOptions {
  limit?: number;
  offset?: number;
  order_by?: 'created_at' | 'updated_at';
  order?: 'asc' | 'desc';
  include_unread_count?: boolean;
  include_last_message?: boolean;
}

/**
 * Options for listing messages in a chat
 */
export interface MessageListOptions {
  chat_id: string;
  limit?: number;
  offset?: number;
  order_by?: 'created_at';
  order?: 'asc' | 'desc';
  include_sender?: boolean;
  unmarked_only?: boolean; // Filter to unread messages only
}

// ============================================================================
// REAL-TIME SUBSCRIPTION TYPES
// ============================================================================

/**
 * Event payload for real-time message subscriptions
 */
export interface MessageRealtimePayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: MessageRow;
  old?: MessageRow;
}

/**
 * Event payload for real-time chat subscriptions (media_summary updates)
 */
export interface ChatRealtimePayload {
  type: 'UPDATE';
  new?: ChatRow;
  old?: ChatRow;
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Bulk read status update (mark multiple messages as read)
 */
export interface BulkReadUpdate {
  message_ids: string[]; // Array of message UUIDs
  is_read: boolean;
}

/**
 * Batch insert for multiple messages (rare, but useful for migrations)
 */
export interface BatchMessageInsert {
  chat_id: string;
  messages: Omit<MessageCreateInput, 'chat_id' | 'sender_id'>[];
}
