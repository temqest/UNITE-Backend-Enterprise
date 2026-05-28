# events notes

- Includes five tables in one module: `plotting_calendars`, `events`, `event_staff`, `event_participants`, and deprecated `event_approvals`.
- All module tables are tenant-scoped with mandatory `org_id` and RLS constrained by `current_user_org_id()`.
- Public visibility requires `status = 'published'`, `setup_status = 'complete'`, and `visibility = 'public'` or `is_public = true`:
  - `is_public = false` (default): Event visible only to members of the organization
  - `is_public = true`: Event visible to anyone (authenticated users, public viewers)
  - Draft, plotted, needs-details, scheduled-only, and cancelled events stay internal
- `events.extra_data` is JSONB with strict per-type validation:
  - blood_drive: requires `target_donation`, optional `collected_blood`
  - training: requires `training_type`
  - advocacy: requires `topic`
- Status workflow is constrained by trigger around direct creation and setup:
  - `draft`, `plotted`, and `needs_details` can move to `scheduled`, `published`, or `cancelled`
  - `scheduled` and `published` can move through operational states like `ongoing`, `completed`, or `cancelled`
- The old request/approve/reject/reschedule workflow is deprecated. `event_approvals` remains only for legacy compatibility and should not drive active UI or service reads.
- Future donations integration:
  - `event_participants` supports user and donor identities now.
  - `participant_donor_id` can become a foreign key to future `donors` table.
  - `participant` records can later be linked to `donations` by `(event_id, participant_user_id)` or `(event_id, participant_donor_id)`.
