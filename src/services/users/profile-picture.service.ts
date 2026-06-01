import { supabaseServer } from '../../lib/supabase/supabase.client';
import crypto from 'crypto';
import sharp from 'sharp';

export async function uploadProfilePictureService(
  userId: string,
  fileBuffer: Buffer,
  mimetype: string,
  originalName: string
) {
  try {
    // 1. Get current user profile to find existing picture path
    const { data: user, error: userError } = await supabaseServer
      .from('users')
      .select('profile_picture_path, org_id')
      .eq('id', userId)
      .single<any>();

    if (userError || !user) {
      console.error('USER FETCH ERROR:', userError);
      return { success: false, error: { code: 'USER_NOT_FOUND', message: userError ? userError.message : 'User not found or access denied.' } };
    }

    const orgId = user.org_id;

    // Process image with Sharp
    let processedBuffer: Buffer;
    try {
      processedBuffer = await sharp(fileBuffer)
        .resize(512, 512, { fit: 'cover', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
    } catch (sharpError) {
      console.error('Sharp processing error:', sharpError);
      return { success: false, error: { code: 'INVALID_IMAGE', message: 'The provided file is not a valid image or could not be processed.' } };
    }

    const bucketName = process.env.SUPABASE_STORAGE_BUCKET_PROFILE_PICTURES || 'profile-pictures';
    const timestamp = Date.now();
    const randomHex = crypto.randomBytes(4).toString('hex');
    // Path structure: orgs/{orgId}/users/{userId}/avatar-{timestamp}-{random}.webp
    const newPath = `orgs/${orgId}/users/${userId}/avatar-${timestamp}-${randomHex}.webp`;

    // 2. Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseServer
      .storage
      .from(bucketName)
      .upload(newPath, processedBuffer, {
        contentType: 'image/webp',
        cacheControl: '31536000',
        upsert: false
      });

    if (uploadError) {
      console.error('Supabase storage upload error:', uploadError);
      return { success: false, error: { code: 'UPLOAD_FAILED', message: 'Failed to upload image to storage.' } };
    }

    // 3. Skip getPublicUrl, we use dynamic signed URLs instead.
    
    // 4. Update Database
    const { data: updatedUser, error: updateError } = await (supabaseServer
      .from('users') as any)
      .update({
        profile_picture_path: newPath,
        profile_picture_url: null // Clear out any public URLs
      })
      .eq('id', userId)
      .select('*')
      .single();

    if (updateError || !updatedUser) {
      return { success: false, error: { code: 'DB_UPDATE_FAILED', message: 'Failed to update user profile.' } };
    }

    // 5. Cleanup old picture (fire and forget)
    if (user.profile_picture_path) {
      supabaseServer.storage.from(bucketName).remove([user.profile_picture_path]).catch(err => {
        console.error('Failed to delete old profile picture:', err);
      });
    }

    return { success: true, data: updatedUser };

  } catch (err) {
    console.error('uploadProfilePictureService unexpected error:', err);
    return { success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } };
  }
}

export async function deleteProfilePictureService(userId: string) {
  try {
    const { data: user, error: userError } = await supabaseServer
      .from('users')
      .select('profile_picture_path, org_id')
      .eq('id', userId)
      .single<any>();

    if (userError || !user) {
      return { success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found or access denied.' } };
    }

    if (!user.profile_picture_path) {
      return { success: true, data: null }; // Nothing to delete
    }

    const bucketName = process.env.SUPABASE_STORAGE_BUCKET_PROFILE_PICTURES || 'profile-pictures';

    // Delete from storage
    const { error: removeError } = await supabaseServer
      .storage
      .from(bucketName)
      .remove([user.profile_picture_path]);

    if (removeError) {
      console.error('Supabase storage delete error:', removeError);
      return { success: false, error: { code: 'DELETE_FAILED', message: 'Failed to delete image from storage.' } };
    }

    // Update database
    const { data: updatedUser, error: updateError } = await (supabaseServer
      .from('users') as any)
      .update({
        profile_picture_path: null,
        profile_picture_url: null
      })
      .eq('id', userId)
      .select('*')
      .single();

    if (updateError || !updatedUser) {
      return { success: false, error: { code: 'DB_UPDATE_FAILED', message: 'Failed to update user profile.' } };
    }

    return { success: true, data: updatedUser };
  } catch (err) {
    console.error('deleteProfilePictureService unexpected error:', err);
    return { success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } };
  }
}

/**
 * Attaches 1-hour signed URLs to a list of user objects that have a `profile_picture_path`.
 * Modifies and returns a new array/object with `profile_picture_url` set to the signed URL.
 */
export async function attachSignedProfileUrls<T extends { profile_picture_path?: string | null, profile_picture_url?: string | null }>(users: T | T[]): Promise<T | T[]> {
  const isArray = Array.isArray(users);
  const userList = isArray ? users : [users];
  if (!userList.length) return users;

  const bucketName = process.env.SUPABASE_STORAGE_BUCKET_PROFILE_PICTURES || 'profile-pictures';
  const paths = userList
    .map(u => u.profile_picture_path)
    .filter((path): path is string => typeof path === 'string' && path.trim().length > 0);

  if (paths.length === 0) {
    return users;
  }

  // Create signed URLs for all paths at once (valid for 1 hour)
  const expiresIn = 60 * 60; 
  const { data: signedUrls, error } = await supabaseServer
    .storage
    .from(bucketName)
    .createSignedUrls(paths, expiresIn);

  if (error || !signedUrls) {
    console.error('Failed to generate signed URLs:', error);
    return users;
  }

  // Map paths to signed URLs
  const urlMap = new Map<string, string>();
  for (const item of signedUrls) {
    if (item.path && item.signedUrl) {
      urlMap.set(item.path, item.signedUrl);
    }
  }

  const updatedUsers = userList.map(user => {
    if (user.profile_picture_path && urlMap.has(user.profile_picture_path)) {
      return { ...user, profile_picture_url: urlMap.get(user.profile_picture_path) };
    }
    return user;
  });

  return isArray ? updatedUsers : updatedUsers[0];
}
