# organizations notes

- Purpose: one row per tenant organization (blood bank, hospital, chapter).
- `organizations.rls.sql` reads membership via `public.users`, so apply `users/schema.sql` before enabling organization RLS in fresh environments.
- INSERT/DELETE is restricted to service role to avoid unsafe self-provisioning paths.
- UPDATE is limited to active `super_admin` users in the same org.
- `code` is unique case-insensitively via `organizations_code_unique_idx`.
- `metadata` is intended for extensible non-critical org attributes; keep regulated fields as explicit columns.
- `updated_at` is auto-maintained by `public.set_updated_at()` trigger.
