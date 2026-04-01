ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_collected_bags INTEGER,
  ADD COLUMN IF NOT EXISTS actual_donors INTEGER,
  ADD COLUMN IF NOT EXISTS wastage_units INTEGER,
  ADD COLUMN IF NOT EXISTS post_event_notes TEXT,
  ADD COLUMN IF NOT EXISTS post_event_attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_status_check,
  DROP CONSTRAINT IF EXISTS events_post_event_attachments_is_array,
  DROP CONSTRAINT IF EXISTS events_post_event_metrics_non_negative;

ALTER TABLE public.events
  ADD CONSTRAINT events_status_check
    CHECK (status IN ('requested', 'pending', 'approved', 'rejected', 'rescheduled', 'completed')),
  ADD CONSTRAINT events_post_event_attachments_is_array
    CHECK (jsonb_typeof(post_event_attachments) = 'array'),
  ADD CONSTRAINT events_post_event_metrics_non_negative
    CHECK (
      (actual_collected_bags IS NULL OR actual_collected_bags >= 0)
      AND (actual_donors IS NULL OR actual_donors >= 0)
      AND (wastage_units IS NULL OR wastage_units >= 0)
    );

ALTER TABLE public.event_participants
  DROP CONSTRAINT IF EXISTS event_participants_status_check;

ALTER TABLE public.event_participants
  ADD CONSTRAINT event_participants_status_check
    CHECK (status IN ('applied', 'confirmed', 'participated', 'donated', 'no_show'));

ALTER TABLE public.event_approvals
  DROP CONSTRAINT IF EXISTS event_approvals_from_status_check,
  DROP CONSTRAINT IF EXISTS event_approvals_to_status_check;

ALTER TABLE public.event_approvals
  ADD CONSTRAINT event_approvals_from_status_check
    CHECK (from_status IS NULL OR from_status IN ('requested', 'pending', 'approved', 'rejected', 'rescheduled', 'completed')),
  ADD CONSTRAINT event_approvals_to_status_check
    CHECK (to_status IN ('requested', 'pending', 'approved', 'rejected', 'rescheduled', 'completed'));

CREATE OR REPLACE FUNCTION public.validate_event_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'requested' AND NEW.status IN ('pending', 'approved', 'rejected', 'rescheduled'))
      OR (OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected', 'rescheduled'))
      OR (OLD.status = 'rescheduled' AND NEW.status IN ('pending', 'approved', 'rejected', 'completed'))
      OR (OLD.status = 'approved' AND NEW.status IN ('approved', 'pending', 'rescheduled', 'rejected', 'completed'))
      OR (OLD.status = 'rejected' AND NEW.status = 'rejected')
      OR (OLD.status = 'completed' AND NEW.status = 'completed')
    ) THEN
      RAISE EXCEPTION 'Invalid event status transition: % -> %', OLD.status, NEW.status;
    END IF;

    IF NEW.status = 'approved' THEN
      NEW.approved_at = NOW();
    ELSIF NEW.status = 'rejected' THEN
      NEW.rejected_at = NOW();
    ELSIF NEW.status = 'rescheduled' THEN
      NEW.rescheduled_at = NOW();
    ELSIF NEW.status = 'completed' THEN
      NEW.completed_at = NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
