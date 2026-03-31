# notifications notes

- Scope and visibility:
  - `org_id` is mandatory and all notification access is tenant-scoped by RLS with `current_user_org_id()`.
  - Direct notifications use `user_id = <target_user_id>` and are visible only to that user in the org.
  - Broadcast notifications use `user_id = NULL` and are visible to all users in the org.

- Broadcast read status:
  - `notifications.is_read/read_at` are used for direct notifications.
  - For broadcasts, track per-user read state in `notification_reads` (one row per `notification_id + user_id`).
  - Mark broadcast as read by upserting into `notification_reads` with `is_read = true` and `read_at = NOW()`.

- Unread count query approach:
  - Direct unread: `notifications.user_id = current_user_profile_id() AND notifications.is_read = false`.
  - Broadcast unread: `notifications.user_id IS NULL` LEFT JOIN `notification_reads` on current user and count where read row is missing.
  - Total unread = direct unread + broadcast unread.

- Integration patterns:
  - Event approvals (`event_approved`, `approval_request`) should create notifications in the same transaction as status changes when possible.
  - Participant workflow (`new_participant`) can notify coordinators/managers directly or as org broadcast based on app role logic.
  - Inventory monitoring (`low_stock`) should usually create high/urgent org broadcast notifications.

- Future push/email:
  - Keep canonical in-app notification row in `notifications` first.
  - Add async delivery pipeline that consumes notification events and writes delivery attempts/outcomes (email/push/SMS) in separate tables.
  - Keep retries/idempotency outside this table to preserve core notification read model simplicity.
