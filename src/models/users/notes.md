# users notes

- Purpose: app-level identity and authorization record linked to Supabase `auth.users` by `auth_id`.
- Multi-tenancy: `org_id` is mandatory and used in every users policy.
- One-super-admin rule: enforced by partial unique index `users_one_active_super_admin_per_org_idx` for active users.
- RLS helper functions:
  - `public.current_org_id()`
  - `public.current_user_is_super_admin()`
  - `public.current_user_has_permission(text)`
- Helper functions are `SECURITY DEFINER` to avoid recursive RLS policy checks against `public.users`.
- Permission model:
  - `role.type = "super_admin"` is always privileged.
  - Otherwise, permissions are matched from `role.permissions` array.
- User records are organization-agnostic beyond `org_id`; no organization type field is stored.
- Suggested hardening:
  - Restrict direct updates to `auth_id` in app/service layer.
  - Add audit logging trigger for role or `is_active` changes in regulated environments.
