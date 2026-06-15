-- models/waitlist/schema.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.waitlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT waitlist_email_basic_format CHECK (position('@' IN email) > 1)
);

CREATE INDEX IF NOT EXISTS waitlist_email_idx ON public.waitlist (lower(email));
