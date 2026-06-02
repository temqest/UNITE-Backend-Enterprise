-- migrations/20260603_add_event_map_coordinates.sql
ALTER TABLE public.events
ADD COLUMN latitude NUMERIC(10, 8),
ADD COLUMN longitude NUMERIC(11, 8),
ADD COLUMN map_location_label TEXT,
ADD COLUMN map_place_id TEXT,
ADD COLUMN map_address TEXT;

ALTER TABLE public.events
ADD CONSTRAINT events_latitude_check CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
ADD CONSTRAINT events_longitude_check CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));
