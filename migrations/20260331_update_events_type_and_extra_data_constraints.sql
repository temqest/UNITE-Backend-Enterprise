-- Expand event type support and relax non-blood extra_data checks for campaign UI parity.
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_type_check,
  DROP CONSTRAINT IF EXISTS events_extra_data_shape_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_type_check
    CHECK (type IN ('blood_drive', 'training', 'advocacy', 'assembly')),
  ADD CONSTRAINT events_extra_data_shape_check
    CHECK (
      (type <> 'blood_drive')
      OR (
        type = 'blood_drive'
        AND extra_data ? 'target_donation'
        AND jsonb_typeof(extra_data -> 'target_donation') = 'number'
        AND (
          NOT (extra_data ? 'collected_blood')
          OR jsonb_typeof(extra_data -> 'collected_blood') = 'number'
        )
      )
    );
