-- Add event setup metadata and relax fields required for quick blood drive drafts.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS setup_status TEXT NOT NULL DEFAULT 'needs_details',
  ADD COLUMN IF NOT EXISTS setup_completed_at TIMESTAMPTZ;

ALTER TABLE public.events
  ALTER COLUMN address DROP NOT NULL,
  ALTER COLUMN start_time DROP NOT NULL,
  ALTER COLUMN end_time DROP NOT NULL;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_setup_status_check,
  ADD CONSTRAINT events_setup_status_check
    CHECK (setup_status IN ('needs_details', 'pending_setup', 'complete'));

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_time_window_check,
  ADD CONSTRAINT events_time_window_check
    CHECK (
      start_time IS NULL
      OR end_time IS NULL
      OR end_time > start_time
    );

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_extra_data_shape_check,
  ADD CONSTRAINT events_extra_data_shape_check CHECK (
    (type <> 'blood_drive')
    OR (
      type = 'blood_drive'
      AND (
        NOT (extra_data ? 'target_donation')
        OR jsonb_typeof(extra_data -> 'target_donation') = 'number'
      )
      AND (
        NOT (extra_data ? 'collected_blood')
        OR jsonb_typeof(extra_data -> 'collected_blood') = 'number'
      )
    )
  );

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_blood_drive_numbers_non_negative,
  ADD CONSTRAINT events_blood_drive_numbers_non_negative CHECK (
    type <> 'blood_drive'
    OR (
      (
        NOT (extra_data ? 'target_donation')
        OR (extra_data ->> 'target_donation')::numeric >= 0
      )
      AND (
        NOT (extra_data ? 'collected_blood')
        OR (extra_data ->> 'collected_blood')::numeric >= 0
      )
    )
  );

CREATE INDEX IF NOT EXISTS events_org_setup_status_date_idx
  ON public.events (org_id, setup_status, event_date);
