-- Targeted indexes for high-traffic dashboard, event, participant, and staff list paths.
-- Keep these additive so existing constraints and query contracts remain unchanged.

CREATE INDEX IF NOT EXISTS events_org_date_start_idx
  ON public.events (org_id, event_date, start_time);

CREATE INDEX IF NOT EXISTS events_org_status_type_date_start_idx
  ON public.events (org_id, status, type, event_date, start_time);

CREATE INDEX IF NOT EXISTS event_participants_org_event_status_idx
  ON public.event_participants (org_id, event_id, status);

CREATE INDEX IF NOT EXISTS event_participants_org_user_event_idx
  ON public.event_participants (org_id, participant_user_id, event_id)
  WHERE participant_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_participants_org_donor_event_idx
  ON public.event_participants (org_id, participant_donor_id, event_id)
  WHERE participant_donor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_staff_org_user_event_idx
  ON public.event_staff (org_id, user_id, event_id);

CREATE INDEX IF NOT EXISTS users_org_created_idx
  ON public.users (org_id, created_at DESC);
