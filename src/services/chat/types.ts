import { z } from 'zod';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { ChatRow, MessageRow, UserMinimal } from '../../models/chat/types';

/**
 * Service error structure
 */
export interface ServiceError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Standard service result wrapper
 */
export interface ServiceResult<T> {
  data: T | null;
  error: ServiceError | null;
}

/**
 * Chat with metadata (unread count, last message, other participant)
 */
export interface ChatWithMetadata extends ChatRow {
  unread_count?: number;
  last_message?: MessageRow;
  other_participant?: UserMinimal;
}

/**
 * Message with sender info
 */
export interface MessageWithSender extends MessageRow {
  sender?: UserMinimal;
}

/**
 * Chat creation input
 */
export interface ChatCreateInput {
  org_id: string;
  participant_1_id: string;
  participant_2_id: string;
}

/**
 * Send message input
 */
export interface MessageSendInput {
  chat_id: string;
  sender_id?: string;
  message_type: 'text' | 'image' | 'file' | 'video' | 'link';
  content?: string;
  file_url?: string;
}

/**
 * Get messages filter
 */
export interface GetMessagesFilter {
  chat_id: string;
  message_type?: 'text' | 'image' | 'file' | 'video' | 'link';
  limit?: number;
  offset?: number;
  include_unread?: boolean;
}

/**
 * Mark message as read input
 */
export interface MarkMessageReadInput {
  message_id: string;
  read_at?: string;
}

/**
 * File upload config
 */
export interface FileUploadConfig {
  bucketName: string;
  maxFileSize: number;
  allowedMimeTypes: string[];
}

/**
 * Access check context
 */
export interface AccessCheckContext {
  user_id: string;
  org_id: string;
  role: Record<string, unknown>;
  geographic_area: Record<string, unknown> | null;
}

/**
 * Chat subscription handlers
 */
export interface ChatSubscriptionHandlers {
  onMessageInsert?: (message: MessageRow) => void | Promise<void>;
  onMessageUpdate?: (message: MessageRow) => void | Promise<void>;
  onMessageDelete?: (messageId: string) => void | Promise<void>;
  onError?: (error: ServiceError) => void;
}

/**
 * Active subscription tracker
 */
export interface ActiveSubscription {
  channel: RealtimeChannel;
  handlers: ChatSubscriptionHandlers;
  chatId: string;
}

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

export const ChatCreateInputSchema = z.object({
  org_id: z.string().uuid(),
  participant_1_id: z.string().uuid(),
  participant_2_id: z.string().uuid(),
});

export const MessageSendInputSchema = z.object({
  chat_id: z.string().uuid(),
  sender_id: z.string().uuid().optional(),
  message_type: z.enum(['text', 'image', 'file', 'video', 'link']),
  content: z.string().trim().optional(),
  file_url: z.string().url().optional(),
});

export const GetMessagesFilterSchema = z.object({
  chat_id: z.string().uuid(),
  message_type: z.enum(['text', 'image', 'file', 'video', 'link']).optional(),
  limit: z.number().int().min(1).max(500).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
  include_unread: z.boolean().optional().default(false),
});

export const MarkMessageReadInputSchema = z.object({
  message_id: z.string().uuid(),
  read_at: z.string().datetime().optional(),
});

export const AccessCheckContextSchema = z.object({
  user_id: z.string().uuid(),
  org_id: z.string().uuid(),
  role: z.record(z.string(), z.unknown()),
  geographic_area: z.record(z.string(), z.unknown()).nullable(),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert Zod errors to ServiceError details
 */
export function toServiceError(
  code: string,
  message: string,
  details?: unknown
): ServiceError {
  return {
    code,
    message,
    details,
  };
}

/**
 * Validate geography areas match
 */
export function isGeoAreaMatch(geoA: Record<string, unknown> | null, geoB: Record<string, unknown> | null): boolean {
  if (!geoA || !geoB) {
    return true;
  }

  const levelA = geoA.level as string;
  const levelB = geoB.level as string;

  if (!levelA || !levelB) {
    return true;
  }

  // Same level and same location
  if (levelA === levelB) {
    const locationA = geoA.location as Record<string, unknown>;
    const locationB = geoB.location as Record<string, unknown>;
    if (locationA && locationB) {
      return JSON.stringify(locationA) === JSON.stringify(locationB);
    }
  }

  // One contains the other
  const parentA = geoA.parent as Record<string, unknown>;
  const parentB = geoB.parent as Record<string, unknown>;

  if (parentA && JSON.stringify(parentA) === JSON.stringify(geoB)) {
    return true;
  }

  if (parentB && JSON.stringify(parentB) === JSON.stringify(geoA)) {
    return true;
  }

  return false;
}
