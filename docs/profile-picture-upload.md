# Profile Picture Upload Security Pipeline

This document describes the security and performance mechanisms implemented for profile picture uploads in UNITE.

## Accepted File Types
* **JPG** (`.jpg`, `.jpeg`)
* **PNG** (`.png`)
* **WebP** (`.webp`)

## Max File Size
* **5 MB** (megabytes).

## Storage Bucket
* **Supabase Bucket:** `profile-pictures`
* **Access Control:** The bucket uses signed URLs or public paths depending on organization requirements. Direct frontend uploads are disabled.

## Storage Path Convention
* **Path:** `orgs/{orgId}/users/{userId}/avatar-{timestamp}-{randomHex}.webp`
* This convention guarantees that the original filename is never persisted in storage, preventing path traversal attacks and ensuring cache uniqueness.

## Security Validation Pipeline
1. **Multer (Memory Storage):** Intercepts the upload, ensures a single file, and enforces a hard size limit of 5 MB.
2. **Rate Limiting:** Protects the endpoint with `express-rate-limit` (max 10 requests per 15 minutes per IP).
3. **MIME Check:** Initial soft-check for allowed image MIME types.
4. **Sharp Processing (Magic Bytes):** 
   - Decodes the buffer. If it's a malicious script disguised as a JPG or a malformed image, `sharp` throws an error.
   - Strips EXIF metadata to protect user privacy (e.g., GPS coordinates).
5. **Re-encoding:** Safely re-encodes the parsed buffer into WebP, completely neutralizing any potential polyglot files.

## Image Optimization Settings
* **Format:** `WebP`
* **Quality:** 80%
* **Dimensions:** Maximum 512x512 pixels (uses `fit: 'cover'` and `withoutEnlargement: true`).

## Backend Env Vars
* `SUPABASE_STORAGE_BUCKET_PROFILE_PICTURES` (Optional, defaults to `profile-pictures`)

## Caching
* Uploaded files are served with `Cache-Control: public, max-age=31536000` (1 year) because each replacement generates a new, unique file path (cache-busting by default).

## Troubleshooting
* **Image Upload Fails Immediately:** The file is likely larger than 5 MB. Check the frontend validation matching the backend limits.
* **Invalid Image Error from Backend:** The file might be a disguised executable, an SVG, or corrupted. `sharp` rejects these.
* **Too Many Requests:** The rate limiter kicks in after 10 uploads in 15 minutes. Wait for the window to expire.
