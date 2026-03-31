import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '../../lib/supabase/supabase.client';
import type { MessageRow } from '../../models/chat/types';
import {
  type GetMessagesFilter,
  type MarkMessageReadInput,
  type MessageSendInput,
  type MessageWithSender,
  type ServiceResult,
  GetMessagesFilterSchema,
  MarkMessageReadInputSchema,
  MessageSendInputSchema,
  toServiceError,
} from './types';
import { accessService } from './access.service';
import { generateChatFilePath } from './storage.setup';

/**
 * Message service for chat operations
 * Handles sending, fetching, and managing messages
 */
export class MessageService {
  private readonly supabase: SupabaseClient;
  private readonly bucketName: string;

  constructor(
    supabase: SupabaseClient = supabaseServer,
    bucketName: string = process.env.CHAT_BUCKET_NAME || 'chat-files'
  ) {
    this.supabase = supabase;
    this.bucketName = bucketName;
  }

  private getMaxUploadBytes(): number {
    const raw = Number.parseInt(process.env.CHAT_MAX_FILE_SIZE ?? '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 50 * 1024 * 1024;
  }

  private getSignedUrlExpirySeconds(custom?: number): number {
    const envExpiry = Number.parseInt(process.env.CHAT_SIGNED_URL_EXPIRES ?? '', 10);
    const resolved = custom ?? (Number.isFinite(envExpiry) && envExpiry > 0 ? envExpiry : 604800);
    return Math.min(Math.max(resolved, 60), 604800);
  }

  private sanitizeFileName(fileName: string): string {
    const withoutPath = fileName.replace(/[/\\]/g, '').replace(/\.\./g, '');
    return withoutPath.replace(/[^a-zA-Z0-9._-]/g, '-');
  }

  private getFileExtension(fileName: string): string {
    const idx = fileName.lastIndexOf('.');
    if (idx < 0 || idx === fileName.length - 1) {
      return '';
    }
    return fileName.slice(idx + 1).toLowerCase();
  }

  private getAllowedExtensions(fileType: 'image' | 'file' | 'video'): string[] {
    const configured = (process.env.CHAT_ALLOWED_FILE_EXTENSIONS ?? '')
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);

    if (configured.length > 0) {
      return configured;
    }

    if (fileType === 'image') {
      return ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    }
    if (fileType === 'video') {
      return ['mp4', 'mov', 'webm', 'mkv'];
    }
    return ['pdf', 'txt', 'csv', 'doc', 'docx', 'xls', 'xlsx'];
  }

  private getFileSize(file: Buffer | Blob): number {
    if (Buffer.isBuffer(file)) {
      return file.byteLength;
    }
    return file.size;
  }

  private isTrustedStorageUrl(url: string): boolean {
    const base = process.env.SUPABASE_URL ?? '';
    if (!base) {
      return false;
    }
    return url.startsWith(`${base}/storage/v1/`);
  }

  /**
   * Send a message within a chat
   * Validates access, uploads file if needed, and broadcasts via Realtime
   */
  async sendMessage(input: MessageSendInput, currentUserId?: string): Promise<ServiceResult<MessageRow>> {
    const parsed = MessageSendInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        data: null,
        error: toServiceError('MESSAGE_VALIDATION_FAILED', 'Invalid message input', parsed.error.issues),
      };
    }

    const messageInput = parsed.data;
    const senderId = messageInput.sender_id || currentUserId;

    if (!senderId) {
      return {
        data: null,
        error: toServiceError('SENDER_MISSING', 'sender_id must be provided or user must be authenticated'),
      };
    }

    try {
      // Validate sender has access to this chat
      const accessCheck = await accessService.validateChatAccess(messageInput.chat_id, senderId);
      if (accessCheck.error || !accessCheck.data) {
        return {
          data: null,
          error: accessCheck.error || toServiceError('ACCESS_DENIED', 'User does not have access to this chat'),
        };
      }

      // Ensure file_url is set for file/image/video types if content is empty
      if (['image', 'file', 'video'].includes(messageInput.message_type) && !messageInput.file_url && !messageInput.content) {
        return {
          data: null,
          error: toServiceError('INVALID_MESSAGE', `${messageInput.message_type} message requires file_url`),
        };
      }

      if (
        ['image', 'file', 'video', 'link'].includes(messageInput.message_type)
        && messageInput.file_url
        && !this.isTrustedStorageUrl(messageInput.file_url)
      ) {
        return {
          data: null,
          error: toServiceError('UNTRUSTED_FILE_URL', 'file_url must reference trusted Supabase Storage'),
        };
      }

      // Fetch chat to get org_id
      const { data: chatData, error: chatError } = await this.supabase
        .from('chats')
        .select('org_id')
        .eq('id', messageInput.chat_id)
        .single();

      if (chatError || !chatData) {
        return {
          data: null,
          error: toServiceError('CHAT_NOT_FOUND', `Chat not found: ${messageInput.chat_id}`, chatError),
        };
      }

      // Insert message into database
      const { data: messageData, error: insertError } = await this.supabase
        .from('messages')
        .insert([
          {
            chat_id: messageInput.chat_id,
            org_id: chatData.org_id,
            sender_id: senderId,
            message_type: messageInput.message_type,
            content: messageInput.content || null,
            file_url: messageInput.file_url || null,
            is_read: false,
          },
        ])
        .select()
        .single();

      if (insertError) {
        return {
          data: null,
          error: toServiceError('MESSAGE_INSERT_FAILED', `Failed to insert message: ${insertError.message}`, insertError),
        };
      }

      // Update chat's media_summary if file was uploaded
      if (messageInput.file_url && ['image', 'file', 'video', 'link'].includes(messageInput.message_type)) {
        await this.updateChatMediaSummary(messageInput.chat_id, messageInput.message_type, messageInput.file_url);
      }

      return { data: messageData, error: null };
    } catch (err) {
      return {
        data: null,
        error: toServiceError('MESSAGE_SEND_ERROR', 'Unexpected error sending message', err),
      };
    }
  }

  /**
   * Upload a file to Supabase Storage
   * Returns the signed URL if successful
   */
  async uploadFile(
    file: Buffer | Blob,
    fileName: string,
    chatId: string,
    fileType: 'image' | 'file' | 'video',
    options?: { expiresIn?: number; public?: boolean }
  ): Promise<ServiceResult<{ url: string; path: string }>> {
    try {
      const safeFileName = this.sanitizeFileName(fileName);
      const extension = this.getFileExtension(safeFileName);
      const allowedExtensions = this.getAllowedExtensions(fileType);
      const fileSize = this.getFileSize(file);
      const maxSize = this.getMaxUploadBytes();

      if (!extension || !allowedExtensions.includes(extension)) {
        return {
          data: null,
          error: toServiceError('FILE_TYPE_NOT_ALLOWED', 'File extension is not allowed for this upload type'),
        };
      }

      if (fileSize <= 0 || fileSize > maxSize) {
        return {
          data: null,
          error: toServiceError('FILE_SIZE_INVALID', `File size must be between 1 byte and ${maxSize} bytes`),
        };
      }

      // Validate bucket exists
      const { data: buckets, error: listError } = await this.supabase.storage.listBuckets();
      if (listError) {
        return {
          data: null,
          error: toServiceError('BUCKET_CHECK_FAILED', `Failed to list buckets: ${listError.message}`, listError),
        };
      }

      const bucketExists = buckets?.some((b) => b.name === this.bucketName);
      if (!bucketExists) {
        return {
          data: null,
          error: toServiceError('BUCKET_NOT_FOUND', `Storage bucket not found: ${this.bucketName}`),
        };
      }

      const path = generateChatFilePath(chatId, safeFileName, fileType);

      // Upload file
      const { data, error } = await this.supabase.storage.from(this.bucketName).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });

      if (error) {
        return {
          data: null,
          error: toServiceError('FILE_UPLOAD_FAILED', `Failed to upload file: ${error.message}`, error),
        };
      }

      // Generate public URL or signed URL
      const expiresIn = this.getSignedUrlExpirySeconds(options?.expiresIn);
      const isPublic = options?.public ?? false;

      let url = '';
      if (isPublic) {
        const { data: publicData } = this.supabase.storage.from(this.bucketName).getPublicUrl(path);
        url = publicData?.publicUrl || '';
      } else {
        const { data: signedData, error: signError } = await this.supabase.storage
          .from(this.bucketName)
          .createSignedUrl(path, expiresIn);

        if (signError) {
          return {
            data: null,
            error: toServiceError('SIGNED_URL_FAILED', `Failed to create signed URL: ${signError.message}`, signError),
          };
        }

        url = signedData?.signedUrl || '';
      }

      if (!url) {
        return {
          data: null,
          error: toServiceError('URL_GENERATION_FAILED', 'Failed to generate file URL'),
        };
      }

      return {
        data: { url, path },
        error: null,
      };
    } catch (err) {
      return {
        data: null,
        error: toServiceError('FILE_UPLOAD_ERROR', 'Unexpected error uploading file', err),
      };
    }
  }

  /**
   * Get messages in a chat with optional filtering
   */
  async getMessages(filter: GetMessagesFilter, currentUserId?: string): Promise<ServiceResult<MessageRow[]>> {
    const parsed = GetMessagesFilterSchema.safeParse(filter);
    if (!parsed.success) {
      return {
        data: null,
        error: toServiceError('FILTER_VALIDATION_FAILED', 'Invalid filter parameters', parsed.error.issues),
      };
    }

    const filterInput = parsed.data;

    try {
      // Validate user has access to chat
      if (currentUserId) {
        const accessCheck = await accessService.validateChatAccess(filterInput.chat_id, currentUserId);
        if (accessCheck.error || !accessCheck.data) {
          return {
            data: null,
            error: accessCheck.error || toServiceError('ACCESS_DENIED', 'User does not have access to this chat'),
          };
        }
      }

      let query = this.supabase.from('messages').select('*').eq('chat_id', filterInput.chat_id);

      // Filter by message type if specified
      if (filterInput.message_type) {
        query = query.eq('message_type', filterInput.message_type);
      }

      // Filter unread only if requested
      if (filterInput.include_unread) {
        query = query.eq('is_read', false);
      }

      // Order by creation time and apply pagination
      query = query.order('created_at', { ascending: false }).range(filterInput.offset, filterInput.offset + filterInput.limit - 1);

      const { data, error } = await query;

      if (error) {
        return {
          data: null,
          error: toServiceError('MESSAGES_FETCH_FAILED', `Failed to fetch messages: ${error.message}`, error),
        };
      }

      // Return in chronological order (reverse the desc order)
      return { data: (data || []).reverse(), error: null };
    } catch (err) {
      return {
        data: null,
        error: toServiceError('MESSAGES_FETCH_ERROR', 'Unexpected error fetching messages', err),
      };
    }
  }

  /**
   * Mark a single message as read
   */
  async markMessageAsRead(input: MarkMessageReadInput): Promise<ServiceResult<MessageRow>> {
    const parsed = MarkMessageReadInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        data: null,
        error: toServiceError('INPUT_VALIDATION_FAILED', 'Invalid input', parsed.error.issues),
      };
    }

    const readInput = parsed.data;

    try {
      const { data, error } = await this.supabase
        .from('messages')
        .update({
          is_read: true,
          read_at: readInput.read_at || new Date().toISOString(),
        })
        .eq('id', readInput.message_id)
        .select()
        .single();

      if (error) {
        return {
          data: null,
          error: toServiceError('MARK_READ_FAILED', `Failed to mark message as read: ${error.message}`, error),
        };
      }

      return { data, error: null };
    } catch (err) {
      return {
        data: null,
        error: toServiceError('MARK_READ_ERROR', 'Unexpected error marking message as read', err),
      };
    }
  }

  /**
   * Mark all unread messages in a chat as read
   */
  async markChatAsRead(chatId: string): Promise<ServiceResult<{ count: number }>> {
    try {
      // Get count of unread messages
      const { count: unreadCount } = await this.supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('chat_id', chatId)
        .eq('is_read', false);

      // Update unread messages
      const { error } = await this.supabase
        .from('messages')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('chat_id', chatId)
        .eq('is_read', false);

      if (error) {
        return {
          data: null,
          error: toServiceError('MARK_CHAT_READ_FAILED', `Failed to mark chat as read: ${error.message}`, error),
        };
      }

      return { data: { count: unreadCount || 0 }, error: null };
    } catch (err) {
      return {
        data: null,
        error: toServiceError('MARK_CHAT_READ_ERROR', 'Unexpected error marking chat as read', err),
      };
    }
  }

  /**
   * Get unread message count for a chat
   */
  async getUnreadCount(chatId: string): Promise<ServiceResult<number>> {
    try {
      const { count, error } = await this.supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('chat_id', chatId)
        .eq('is_read', false);

      if (error) {
        return {
          data: null,
          error: toServiceError('UNREAD_COUNT_FAILED', `Failed to get unread count: ${error.message}`, error),
        };
      }

      return { data: count || 0, error: null };
    } catch (err) {
      return {
        data: null,
        error: toServiceError('UNREAD_COUNT_ERROR', 'Unexpected error getting unread count', err),
      };
    }
  }

  /**
   * Delete a message (soft delete or hard delete based on org policy)
   */
  async deleteMessage(messageId: string, userId: string): Promise<ServiceResult<boolean>> {
    try {
      // Fetch message to verify sender
      const { data: messageData, error: fetchError } = await this.supabase
        .from('messages')
        .select('sender_id')
        .eq('id', messageId)
        .single();

      if (fetchError || !messageData) {
        return {
          data: null,
          error: toServiceError('MESSAGE_NOT_FOUND', `Message not found: ${messageId}`, fetchError),
        };
      }

      // Only sender can delete their own message
      if (messageData.sender_id !== userId) {
        return {
          data: false,
          error: toServiceError('NOT_MESSAGE_OWNER', 'Only message sender can delete it'),
        };
      }

      // Delete message
      const { error: deleteError, count } = await this.supabase.from('messages').delete().eq('id', messageId);

      if (deleteError) {
        return {
          data: false,
          error: toServiceError('DELETE_FAILED', `Failed to delete message: ${deleteError.message}`, deleteError),
        };
      }

      return { data: (count || 0) > 0, error: null };
    } catch (err) {
      return {
        data: false,
        error: toServiceError('DELETE_ERROR', 'Unexpected error deleting message', err),
      };
    }
  }

  /**
   * Update chat's media_summary when new media is added
   */
  private async updateChatMediaSummary(
    chatId: string,
    messageType: string,
    fileUrl: string
  ): Promise<void> {
    try {
      const { data: chatData } = await this.supabase.from('chats').select('media_summary').eq('id', chatId).single();

      if (!chatData) {
        return;
      }

      const mediaSummary = (chatData.media_summary as Record<string, unknown[]>) || {
        images: [],
        videos: [],
        files: [],
        links: [],
      };

      const typeMap: Record<string, string> = {
        image: 'images',
        video: 'videos',
        file: 'files',
        link: 'links',
      };

      const key = typeMap[messageType];
      if (key) {
        const list = (mediaSummary[key] as string[]) || [];
        if (!list.includes(fileUrl)) {
          list.push(fileUrl);
          mediaSummary[key] = list;

          await this.supabase
            .from('chats')
            .update({ media_summary: mediaSummary })
            .eq('id', chatId);
        }
      }
    } catch (err) {
      // Silently fail - media summary update is not critical
      console.error('[chat] Failed to update media summary:', err);
    }
  }
}

/**
 * Singleton instance
 */
export const messageService = new MessageService();
