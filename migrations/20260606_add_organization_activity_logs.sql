-- Migration: Add Organization Activity Logs
-- Purpose: Create a flat, UI-friendly table for organization-scoped activity logs.

CREATE TABLE organization_activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_name TEXT,
    actor_email TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    entity_label TEXT,
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Performance Indexes
CREATE INDEX idx_org_activity_logs_org_id ON organization_activity_logs(org_id);
CREATE INDEX idx_org_activity_logs_created_at ON organization_activity_logs(created_at DESC);
CREATE INDEX idx_org_activity_logs_action ON organization_activity_logs(action);
CREATE INDEX idx_org_activity_logs_entity_type ON organization_activity_logs(entity_type);
CREATE INDEX idx_org_activity_logs_actor ON organization_activity_logs(actor_user_id) WHERE actor_user_id IS NOT NULL;
CREATE INDEX idx_org_activity_logs_org_created ON organization_activity_logs(org_id, created_at DESC);

-- RLS Policies
ALTER TABLE organization_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_activity_logs_select_policy ON organization_activity_logs
    FOR SELECT
    USING (
        org_id = current_user_org_id()
    );

-- Only allowing inserts from backend service role or triggers, generally bypassing RLS via service key or security definer functions, but just in case:
CREATE POLICY organization_activity_logs_insert_policy ON organization_activity_logs
    FOR INSERT
    WITH CHECK (
        org_id = current_user_org_id()
    );
