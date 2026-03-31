# Chat Module - Implementation Guide

This module manages one-to-one messaging between blood bank users (coordinators, stakeholders, admins) with real-time support, media tracking, and organization-scoped access control.

## Architecture Overview

### Tables

#### `chats`
- **Purpose**: Represents conversation threads between two participants
- **Key Fields**:
  - `org_id`: Multi-tenant isolation (FK to organizations)
  - `participant_1_id`, `participant_2_id`: One-to-one constraints ensure exactly two participants
  - `media_summary` (JSONB): Denormalized media URLs organized by type for fast gallery queries
  - `created_at`, `updated_at`: Audit timestamps
- **Constraints**:
  - Participants must be in the same organization
  - Unique constraint ensures one chat per pair (direction-agnostic)
  - No self-chats allowed

#### `messages`
- **Purpose**: Individual messages within a chat
- **Key Fields**:
  - `chat_id`: Links to parent chat
  - `sender_id`: Who sent the message
  - `message_type`: Enum (text, image, file, video, link)
  - `content`: Text payload or link URL
  - `file_url`: Supabase Storage URL (for media types)
  - `is_read`, `read_at`: Read status tracking
  - `created_at`, `updated_at`: Timestamps
- **Constraints**:
  - Sender must be a participant in the chat
  - Valid message types enforced via CHECK constraint
  - org_id must match parent chat

### Indexes
- `chats`: (org_id, participant_1/2, created_at DESC)
- `messages`: (chat_id, org_id, sender_id, is_read, created_at DESC)
- Composite index on `(chat_id, is_read)` for unread message queries

## RLS Policies

### Chats Table
- **SELECT**: Users can only see chats where they are a participant in their org
- **INSERT**: Users can initiate chats with others in their org
- **UPDATE**: Disabled (immutable conversation threads) - media_summary updated via trigger
- **DELETE**: Disabled (audit trail preservation)

### Messages Table
- **SELECT**: Users see messages only in chats they participate in
- **INSERT**: Users can send messages only to valid chat participants
- **UPDATE**: Limited to receiver only, and only to set `is_read = true` with `read_at = NOW()`
- **DELETE**: Disabled (audit trail preservation)

## Geographic & Role-Based Access Control

⚠️ **RLS does NOT enforce geo/role restrictions directly** - these are application-layer concerns:

### Recommended App-Layer Enforcement

**Coordinators** can chat with:
- Stakeholders in the same geographic area & organization (via `user_settings.geographic_area`)
- Admins in the same organization
- Other coordinators in the same organization

**Stakeholders** can chat with:
- Designated coordinators (via `role_mappings` or relationship table)
- Blood bank admins in their organization

**Admins** can chat with:
- Any user in their organization

### Implementation Pattern
```typescript
// In your API route/handler before creating a chat:
async function validateChatPermission(userId: string, targetId: string, orgId: string) {
  const user = await db.user_settings.findOne({ user_id: userId });
  const target = await db.user_settings.findOne({ user_id: targetId });
  
  if (user.role === 'coordinator') {
    // Must be same org, geographic area, and target is stakeholder or admin
    return user.geographic_area === target.geographic_area;
  }
  // ... other role checks
}
```

**Why not RLS?**
- Joining to `user_settings` and role tables in RLS creates complex policies and query overhead
- Easier to test and audit permission logic in application code
- Performance: app-layer checks run once per operation vs. RLS running per row

## Media Management

### Automatic Media Summary Updates

The `update_chat_media_summary()` trigger automatically populates `chats.media_summary` JSONB:

```json
{
  "images": ["chat-media/org1/abc123.jpg", "chat-media/org1/def456.jpg"],
  "videos": ["chat-media/org1/vid1.mp4"],
  "files": ["chat-media/org1/doc1.pdf"],
  "links": ["https://external-resource.com", "https://web-link.com"]
}
```

### Querying Media Gallery

```typescript
// Get all images in a chat
const { images } = chat.media_summary;

// Real-time watch on media updates
supabase
  .from('chats')
  .on('*', (payload: ChatRealtimePayload) => {
    if (payload.type === 'UPDATE') {
      console.log('Media updated:', payload.new.media_summary);
    }
  })
  .subscribe();
```

### Uploading Media to Supabase Storage

```typescript
// Upload to storage with org-scoped path
const bucket = supabase.storage.from('chat-media');
const path = `${orgId}/${chatId}/${fileName}`;
const { error, data } = await bucket.upload(path, file);

// Create message with file_url
await db.messages.insert({
  chat_id: chatId,
  message_type: 'image',
  file_url: bucket.getPublicUrl(path).publicUrl,
});
// Trigger automatically updates media_summary
```

## Real-Time Messaging

### Supabase Realtime Subscriptions

```typescript
// Subscribe to new messages in a chat
const subscription = supabase
  .from('messages')
  .on('INSERT', (payload: MessageRealtimePayload) => {
    console.log('New message:', payload.new);
    // Update UI with new message
  })
  .subscribe();

// Subscribe to read status updates
supabase
  .from('messages')
  .on('UPDATE', (payload: MessageRealtimePayload) => {
    if (payload.new?.is_read && !payload.old?.is_read) {
      console.log('Message was read at', payload.new.read_at);
    }
  })
  .subscribe();
```

### Presences (Optional - for "typing" indicators)

```typescript
// User A typing
supabase.realtime.channel(`chat:${chatId}`).subscribe((status) => {
  if (status === 'SUBSCRIBED') {
    channel.track({
      user_id: userId,
      typing: true,
      updated_at: new Date().toISOString(),
    });
  }
});

// Others see typing status
channel.on('presence', { event: 'sync' }, (state) => {
  console.log('Typing users:', state);
});
```

## Future Enhancements

### Group Chats (Phase 2)
- Convert `participant_1_id`, `participant_2_id` to `participants` (UUID array)
- Add `chat_type` enum ('1v1', 'group')
- Extend RLS to allow group membership checks
- Add user roles within group chats (moderator, member)

### Message Reactions & Threads (Phase 3)
- Add `reactions` table for emoji reactions
- Add `parent_message_id` to enable threaded replies

### Chat Pinning & Organization (Phase 3)
- Add `is_pinned`, `pin_order` for user-level chat sorting
- Add `labels` (JSONB array) for user-defined chat categories

### E2E Encryption (Phase 2 - Security)
- Store encrypted message content; decrypt on client
- Use Supabase Vault or client-side encryption libraries
- Note: media_summary remains unencrypted for efficient queries

### Message Search & Indexing (Phase 2 - Performance)
- Add full-text search index on `messages.content`
- Consider PostgreSQL `tsvector` or external search (e.g., ElasticSearch)

## Deployment Checklist

- [ ] Run `schema.sql` to create tables, triggers, indexes
- [ ] Run `rls.sql` to enable RLS and policies
- [ ] Configure `chat-media` Supabase Storage bucket with:
  - Public read access (for message loading)
  - Organization-scoped upload paths
  - CORS rules for your frontend domain
- [ ] Implement app-layer role/geo validation (see Access Control section)
- [ ] Set up real-time listeners in frontend
- [ ] Test message sending, read status updates, media upload
- [ ] Validate RLS in staging: confirm users cannot see cross-org messages
- [ ] Monitor performance: check index usage, query plans for message list queries

## Database Maintenance

### Cleanup (Optional)
- Archive old chats/messages older than 2 years to separate table (regulatory compliance)
- Purge media_summary URLs when messages deleted (manual process, since DELETE is blocked)

### Monitoring
- Watch `messages` table growth - add data archival if >10M rows
- Monitor `media_summary` JSONB size - aim for <1MB per chat
- Check index fragmentation on `messages(created_at DESC)` - reindex if >30% bloat
