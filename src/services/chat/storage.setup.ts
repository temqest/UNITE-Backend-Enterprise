import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '../../lib/supabase/supabase.client';

/**
 * Storage Setup for Chat Module
 * This module provides SQL migrations and setup functions for creating
 * the chat storage bucket and related infrastructure
 */

/**
 * SQL migration to create the storage bucket policy infrastructure
 * Run this once during initial deployment
 */
export const CHAT_STORAGE_MIGRATION_SQL = `
-- Create storage bucket for chat files (if not exists)
-- This is a conceptual migration; bucket creation is typically done via Supabase dashboard
-- or the Storage API. Here we define the RLS policies for the bucket.

-- Enable the storage extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Insert the bucket (idempotent - will fail silently if already exists)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('chat-files', 'chat-files', false)
-- ON CONFLICT DO NOTHING;

-- RLS POLICIES FOR STORAGE BUCKET: Allow authenticated users to upload/read/delete their own chat files
-- These assume the bucket follows naming convention: chat-files or uses env variable CHAT_BUCKET_NAME

-- Policy: Allow authenticated users to upload files
-- Files are organized as: chat/{chat_id}/{type}/{timestamp}-{filename}
CREATE POLICY IF NOT EXISTS "Allow authenticated users to upload chat files"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name LIKE 'chat%')
    AND auth.role() = 'authenticated'
  );

-- Policy: Allow users to view their own chat files (based on chat participation)
-- This is a simplified version; in production, add more granular checks
CREATE POLICY IF NOT EXISTS "Allow users to read chat files"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name LIKE 'chat%')
    AND auth.role() = 'authenticated'
  );

-- Policy: Allow users to delete their own chat files
CREATE POLICY IF NOT EXISTS "Allow users to delete their own chat files"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name LIKE 'chat%')
    AND auth.role() = 'authenticated'
  );

-- RLS for storage.buckets (allow public read if bucket is public)
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Allow authenticated users to list buckets"
  ON storage.buckets
  FOR SELECT
  USING (auth.role() = 'authenticated');
`;

/**
 * Setup function to initialize chat storage
 * This creates the storage bucket via the Supabase API
 */
export async function setupChatStorage(
  supabase: SupabaseClient = supabaseServer,
  bucketName: string = process.env.CHAT_BUCKET_NAME || 'chat-files',
  options?: {
    isPublic?: boolean;
    maxFileSize?: number;
  }
): Promise<{ success: boolean; bucketId?: string; error?: string }> {
  try {
    // Check if bucket already exists
    const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
      return {
        success: false,
        error: `Failed to list buckets: ${listError.message}`,
      };
    }

    const bucketExists = existingBuckets?.some((b) => b.name === bucketName);

    if (bucketExists) {
      return {
        success: true,
        bucketId: bucketName,
      };
    }

    // Create bucket
    const { data, error } = await supabase.storage.createBucket(bucketName, {
      public: options?.isPublic ?? false,
      fileSizeLimit: options?.maxFileSize ?? 1024 * 1024 * 50, // 50MB default
    });

    if (error) {
      return {
        success: false,
        error: `Failed to create bucket: ${error.message}`,
      };
    }

    return {
      success: true,
      bucketId: data?.name,
    };
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Unexpected error setting up chat storage: ${errMessage}`,
    };
  }
}

/**
 * Verify that the chat storage bucket exists and is properly configured
 */
export async function verifyChatStorage(
  supabase: SupabaseClient = supabaseServer,
  bucketName: string = process.env.CHAT_BUCKET_NAME || 'chat-files'
): Promise<{ exists: boolean; isPublic?: boolean; error?: string }> {
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();

    if (error) {
      return {
        exists: false,
        error: `Failed to list buckets: ${error.message}`,
      };
    }

    const bucket = buckets?.find((b) => b.name === bucketName);

    if (!bucket) {
      return {
        exists: false,
        error: `Bucket not found: ${bucketName}`,
      };
    }

    return {
      exists: true,
      isPublic: bucket.public,
    };
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    return {
      exists: false,
      error: `Unexpected error verifying chat storage: ${errMessage}`,
    };
  }
}

/**
 * Delete a chat storage bucket (use with caution!)
 */
export async function deleteChatBucket(
  supabase: SupabaseClient = supabaseServer,
  bucketName: string = process.env.CHAT_BUCKET_NAME || 'chat-files'
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.storage.deleteBucket(bucketName);

    if (error) {
      return {
        success: false,
        error: `Failed to delete bucket: ${error.message}`,
      };
    }

    return { success: true };
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Unexpected error deleting chat bucket: ${errMessage}`,
    };
  }
}

/**
 * Empty (delete all files) from a chat storage bucket
 * Use before deleting the bucket
 */
export async function emptyChatBucket(
  supabase: SupabaseClient = supabaseServer,
  bucketName: string = process.env.CHAT_BUCKET_NAME || 'chat-files'
): Promise<{ filesDeleted: number; error?: string }> {
  try {
    // List all files in bucket
    const { data: files, error: listError } = await supabase.storage.from(bucketName).list();

    if (listError) {
      return {
        filesDeleted: 0,
        error: `Failed to list files: ${listError.message}`,
      };
    }

    if (!files || files.length === 0) {
      return { filesDeleted: 0 };
    }

    // Delete all files
    const filePaths = files
      .filter((f) => f.name !== '.emptyFolderPlaceholder')
      .map((f) => f.name);

    if (filePaths.length === 0) {
      return { filesDeleted: 0 };
    }

    const { error: deleteError } = await supabase.storage.from(bucketName).remove(filePaths);

    if (deleteError) {
      return {
        filesDeleted: 0,
        error: `Failed to delete files: ${deleteError.message}`,
      };
    }

    return { filesDeleted: filePaths.length };
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    return {
      filesDeleted: 0,
      error: `Unexpected error emptying bucket: ${errMessage}`,
    };
  }
}

/**
 * Initialize chat storage on application startup
 * Call this during app initialization to ensure bucket exists
 */
export async function initializeChatStorage(
  supabase: SupabaseClient = supabaseServer,
  bucketName: string = process.env.CHAT_BUCKET_NAME || 'chat-files'
): Promise<void> {
  try {
    const setupResult = await setupChatStorage(supabase, bucketName);
    if (!setupResult.success) {
      console.error('[chat-storage] Setup failed:', setupResult.error);
      throw new Error(`Chat storage setup failed: ${setupResult.error}`);
    }

    const verifyResult = await verifyChatStorage(supabase, bucketName);
    if (!verifyResult.exists) {
      console.error('[chat-storage] Verification failed:', verifyResult.error);
      throw new Error(`Chat storage verification failed: ${verifyResult.error}`);
    }

    console.log(`[chat-storage] Successfully initialized bucket: ${bucketName}`);
  } catch (err) {
    console.error('[chat-storage] Initialization error:', err);
    throw err;
  }
}

/**
 * Generate configuration for chat file uploads
 * Returns paths, URLs, and limits for file operations
 */
export function getChatStorageConfig(bucketName: string = process.env.CHAT_BUCKET_NAME || 'chat-files') {
  return {
    bucketName,
    maxFileSize: parseInt(process.env.CHAT_MAX_FILE_SIZE || '104857600', 10), // 100MB default
    allowedMimeTypes: (process.env.CHAT_ALLOWED_MIME_TYPES || 'image/*,video/*,application/pdf').split(','),
    pathTemplate: (chatId: string, fileType: string) => `chat/${chatId}/${fileType}/${Date.now()}-{filename}`,
    signedUrlExpires: parseInt(process.env.CHAT_SIGNED_URL_EXPIRES || '604800', 10), // 7 days default
  };
}

/**
 * Helper to generate a safe file path for chat uploads
 */
export function generateChatFilePath(chatId: string, fileName: string, fileType: 'image' | 'file' | 'video'): string {
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9\-_.]/g, '-');
  const timestamp = Date.now();
  return `chat/${chatId}/${fileType}/${timestamp}-${sanitizedName}`;
}
