-- =====================================================
-- SYSTEM LOGS - Immutable Audit Trail for Multi-Tenant Blood Bank SaaS
-- =====================================================
-- Purpose: Track all critical actions across the platform for compliance, auditing, and troubleshooting
-- Immutability: No UPDATE or DELETE allowed (except admin purge via RLS-protected procedures)
-- Multi-tenant: org_id enforced, RLS protects cross-org access

-- Prerequisites: Ensure uuid-ossp extension is enabled
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE: system_logs
-- =====================================================

CREATE TABLE system_logs (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Multi-tenant Isolation
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Actor (who performed the action)
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- NULL if user deleted but log preserved
    
    -- Action Classification
    category TEXT NOT NULL CHECK (category IN ('events', 'users', 'staff', 'participants', 'donations', 'inventory', 'system', 'auth')),
    action_type TEXT NOT NULL CHECK (
        action_type IN (
            -- Events
            'event_created', 'event_updated', 'event_deleted', 
            'event_approved', 'event_rejected', 'event_rescheduled', 'event_cancelled',
            -- Participants
            'participant_joined', 'participant_left', 'participant_approved', 'participant_rejected',
            -- Staff
            'staff_signup', 'staff_approved', 'staff_rejected', 'staff_removed',
            -- Users
            'user_created', 'user_updated', 'user_deactivated', 'user_reactivated',
            'role_changed', 'permissions_updated',
            -- Donations (future)
            'donation_recorded', 'donation_updated', 'donation_cancelled',
            -- Inventory (future)
            'inventory_added', 'inventory_removed', 'inventory_transferred',
            -- System
            'settings_updated', 'bulk_import', 'bulk_export', 'data_purge',
            -- Auth
            'login', 'logout', 'password_reset', 'mfa_enabled', 'mfa_disabled'
        )
    ),
    
    -- Entity Reference (what was acted upon)
    entity_type TEXT, -- 'event', 'user', 'donation', 'inventory_item', etc.
    entity_id UUID, -- ID of the affected entity
    
    -- Action Details (flexible JSONB for before/after state, metadata)
    payload JSONB DEFAULT '{}'::jsonb,
    -- Example payload structures:
    -- Event approval: { "before": { "status": "pending" }, "after": { "status": "approved" }, "reason": "Meets all requirements" }
    -- Staff signup: { "user_id": "...", "role": "volunteer", "approved_by": "..." }
    -- Event reschedule: { "old_date": "2026-03-15", "new_date": "2026-03-20", "reason": "Venue unavailable" }
    
    -- Human-readable notes (optional)
    notes TEXT,
    
    -- Status/Outcome (for approval workflows)
    status TEXT, -- 'approved', 'rejected', 'pending', 'completed', 'failed', etc.
    
    -- IP Address & User Agent (for security auditing)
    ip_address INET,
    user_agent TEXT,
    
    -- Timestamps (immutable, created_at only)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    
    -- NOTE: No updated_at since logs are immutable
);

-- =====================================================
-- INDEXES for Query Performance
-- =====================================================

-- Core lookup indexes
CREATE INDEX idx_system_logs_org_id ON system_logs(org_id);
CREATE INDEX idx_system_logs_user_id ON system_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_system_logs_created_at ON system_logs(created_at DESC);

-- Filtering indexes
CREATE INDEX idx_system_logs_category ON system_logs(category);
CREATE INDEX idx_system_logs_action_type ON system_logs(action_type);
CREATE INDEX idx_system_logs_entity ON system_logs(entity_type, entity_id) WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL;

-- Composite index for common queries (org + date range + category)
CREATE INDEX idx_system_logs_org_created_category ON system_logs(org_id, created_at DESC, category);

-- JSONB gin index for flexible payload queries
CREATE INDEX idx_system_logs_payload_gin ON system_logs USING gin(payload);

-- =====================================================
-- EXAMPLE TRIGGERS FOR AUTO-LOGGING
-- =====================================================

-- -----------------------------------------------------
-- 1. Auto-log Event Creation
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION log_event_created()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO system_logs (
        org_id,
        user_id,
        category,
        action_type,
        entity_type,
        entity_id,
        payload,
        notes
    ) VALUES (
        NEW.org_id,
        NEW.created_by, -- Assuming events table has created_by field
        'events',
        'event_created',
        'event',
        NEW.id,
        jsonb_build_object(
            'event_name', NEW.name,
            'event_date', NEW.event_date,
            'location', NEW.location,
            'status', NEW.status
        ),
        'Event created: ' || NEW.name
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- CREATE TRIGGER trigger_log_event_created
-- AFTER INSERT ON events
-- FOR EACH ROW EXECUTE FUNCTION log_event_created();

-- -----------------------------------------------------
-- 2. Auto-log Event Status Changes (Approval/Rejection)
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION log_event_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO system_logs (
            org_id,
            user_id,
            category,
            action_type,
            entity_type,
            entity_id,
            payload,
            status,
            notes
        ) VALUES (
            NEW.org_id,
            auth.uid(), -- Current user making the change
            'events',
            CASE 
                WHEN NEW.status = 'approved' THEN 'event_approved'
                WHEN NEW.status = 'rejected' THEN 'event_rejected'
                WHEN NEW.status = 'cancelled' THEN 'event_cancelled'
                ELSE 'event_updated'
            END,
            'event',
            NEW.id,
            jsonb_build_object(
                'before', jsonb_build_object('status', OLD.status),
                'after', jsonb_build_object('status', NEW.status),
                'event_name', NEW.name
            ),
            NEW.status,
            'Event status changed from ' || OLD.status || ' to ' || NEW.status
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- CREATE TRIGGER trigger_log_event_status_change
-- AFTER UPDATE ON events
-- FOR EACH ROW 
-- WHEN (OLD.status IS DISTINCT FROM NEW.status)
-- EXECUTE FUNCTION log_event_status_change();

-- -----------------------------------------------------
-- 3. Auto-log Participant Joins
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION log_participant_joined()
RETURNS TRIGGER AS $$
DECLARE
    v_org_id UUID;
BEGIN
    -- Get org_id from event
    SELECT org_id INTO v_org_id FROM events WHERE id = NEW.event_id;
    
    INSERT INTO system_logs (
        org_id,
        user_id,
        category,
        action_type,
        entity_type,
        entity_id,
        payload,
        status,
        notes
    ) VALUES (
        v_org_id,
        NEW.user_id,
        'participants',
        'participant_joined',
        'event_participant',
        NEW.id,
        jsonb_build_object(
            'event_id', NEW.event_id,
            'user_id', NEW.user_id,
            'status', NEW.status
        ),
        NEW.status,
        'User joined event'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- CREATE TRIGGER trigger_log_participant_joined
-- AFTER INSERT ON event_participants
-- FOR EACH ROW EXECUTE FUNCTION log_participant_joined();

-- -----------------------------------------------------
-- 4. Auto-log Staff Approval Changes
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION log_staff_approval()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_approved IS DISTINCT FROM NEW.is_approved THEN
        INSERT INTO system_logs (
            org_id,
            user_id,
            category,
            action_type,
            entity_type,
            entity_id,
            payload,
            status,
            notes
        ) VALUES (
            NEW.org_id,
            NEW.approved_by, -- Assuming users table has approved_by field
            'staff',
            CASE 
                WHEN NEW.is_approved = TRUE THEN 'staff_approved'
                WHEN NEW.is_approved = FALSE THEN 'staff_rejected'
                ELSE 'staff_updated'
            END,
            'user',
            NEW.id,
            jsonb_build_object(
                'before', jsonb_build_object('is_approved', OLD.is_approved),
                'after', jsonb_build_object('is_approved', NEW.is_approved),
                'role', NEW.role
            ),
            CASE 
                WHEN NEW.is_approved = TRUE THEN 'approved'
                WHEN NEW.is_approved = FALSE THEN 'rejected'
                ELSE 'pending'
            END,
            'Staff approval status changed'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- CREATE TRIGGER trigger_log_staff_approval
-- AFTER UPDATE ON users
-- FOR EACH ROW 
-- WHEN (OLD.is_approved IS DISTINCT FROM NEW.is_approved)
-- EXECUTE FUNCTION log_staff_approval();

-- =====================================================
-- MANUAL LOG INSERTION FUNCTION (for app-level logging)
-- =====================================================

CREATE OR REPLACE FUNCTION create_system_log(
    p_org_id UUID,
    p_user_id UUID,
    p_category TEXT,
    p_action_type TEXT,
    p_entity_type TEXT DEFAULT NULL,
    p_entity_id UUID DEFAULT NULL,
    p_payload JSONB DEFAULT '{}'::jsonb,
    p_notes TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO system_logs (
        org_id,
        user_id,
        category,
        action_type,
        entity_type,
        entity_id,
        payload,
        notes,
        status,
        ip_address,
        user_agent
    ) VALUES (
        p_org_id,
        p_user_id,
        p_category,
        p_action_type,
        p_entity_type,
        p_entity_id,
        p_payload,
        p_notes,
        p_status,
        p_ip_address,
        p_user_agent
    ) RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- DATA RETENTION / PURGE FUNCTION (Admin only, via RLS)
-- =====================================================

CREATE OR REPLACE FUNCTION purge_old_system_logs(
    p_org_id UUID,
    p_older_than_days INTEGER DEFAULT 365
)
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Only allow if user has super_admin role (enforced in RLS)
    DELETE FROM system_logs
    WHERE org_id = p_org_id
      AND created_at < NOW() - (p_older_than_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    -- Log the purge action
    INSERT INTO system_logs (
        org_id,
        user_id,
        category,
        action_type,
        payload,
        notes
    ) VALUES (
        p_org_id,
        auth.uid(),
        'system',
        'data_purge',
        jsonb_build_object(
            'deleted_count', v_deleted_count,
            'older_than_days', p_older_than_days
        ),
        'Purged ' || v_deleted_count || ' system logs older than ' || p_older_than_days || ' days'
    );
    
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
