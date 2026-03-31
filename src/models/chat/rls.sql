-- RLS Policies for chat module
-- Enforces multi-tenant isolation and ensures users only access chats they participate in

-- Enable RLS on chats table
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;

-- Enable RLS on messages table
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CHATS TABLE POLICIES
-- ============================================================================

-- Policy: Users can SELECT chats where they are a participant (one-to-one)
CREATE POLICY chats_select_own ON chats
  FOR SELECT
  USING (
    org_id = current_user_org_id()
    AND (
      participant_1_id = auth.uid()
      OR participant_2_id = auth.uid()
    )
  );

-- Policy: Users can INSERT chats (creating a new conversation)
-- Must specify both participants and org_id must match current user's org
CREATE POLICY chats_insert_own ON chats
  FOR INSERT
  WITH CHECK (
    org_id = current_user_org_id()
    AND (
      participant_1_id = auth.uid()
      OR participant_2_id = auth.uid()
    )
  );

-- Policy: Users cannot UPDATE chats (conversations are immutable once created)
-- Updates to media_summary are handled via trigger, not direct update
CREATE POLICY chats_no_update ON chats
  FOR UPDATE
  USING (FALSE);

-- Policy: Users cannot DELETE chats (audit trail preservation)
CREATE POLICY chats_no_delete ON chats
  FOR DELETE
  USING (FALSE);

-- ============================================================================
-- MESSAGES TABLE POLICIES
-- ============================================================================

-- Policy: Users can SELECT messages from chats where they are a participant
CREATE POLICY messages_select_own ON messages
  FOR SELECT
  USING (
    org_id = current_user_org_id()
    AND chat_id IN (
      SELECT id FROM chats
      WHERE (
        participant_1_id = auth.uid()
        OR participant_2_id = auth.uid()
      )
      AND org_id = current_user_org_id()
    )
  );

-- Policy: Users can INSERT messages only if they are a sender in their own org
-- and the recipient is the other participant in the chat
CREATE POLICY messages_insert_own ON messages
  FOR INSERT
  WITH CHECK (
    org_id = current_user_org_id()
    AND sender_id = auth.uid()
    AND chat_id IN (
      SELECT id FROM chats
      WHERE (
        participant_1_id = auth.uid()
        OR participant_2_id = auth.uid()
      )
      AND org_id = current_user_org_id()
    )
  );

-- Policy: Users can UPDATE messages only to mark as read
-- Only the receiver (non-sender) can mark messages as read
CREATE POLICY messages_update_read_status ON messages
  FOR UPDATE
  USING (
    org_id = current_user_org_id()
    AND chat_id IN (
      SELECT id FROM chats
      WHERE org_id = current_user_org_id()
      AND (
        participant_1_id = auth.uid()
        OR participant_2_id = auth.uid()
      )
    )
    -- Only receiver can mark as read (not the sender)
    AND sender_id != auth.uid()
  )
  WITH CHECK (
    org_id = current_user_org_id()
    -- Only is_read and read_at fields can be updated (enforced by app layer)
  );

-- Policy: Users cannot DELETE messages (audit trail preservation)
CREATE POLICY messages_no_delete ON messages
  FOR DELETE
  USING (FALSE);

-- ============================================================================
-- NOTES ON GEO/ROLE BASED ACCESS
-- ============================================================================
-- 
-- Geographic and role-based restrictions are NOT enforced via RLS policies
-- directly because they require joins to user_settings and role_mappings tables
-- that are organization-scoped and complex to query efficiently in RLS.
--
-- IMPLEMENTATION APPROACH:
-- 1. RLS enforces org-isolation and participant validation (above policies)
-- 2. Application layer (API) enforces role/geo restrictions:
--    - Coordinators can chat with stakeholders in the same geographic area
--    - Admins can chat with anyone in their org
--    - Stakeholders can only chat with designated coordinators/admins
--
-- This two-layer approach (RLS + app logic) ensures:
--   - Database security: no cross-org access possible
--   - Performance: role/geo checks in app, not in complex RLS policies
--
-- FUTURE: If RLS geo/role restrictions are needed:
--   - Create indexed views with user_settings pre-joined
--   - Use view-based RLS policies for better performance
--   - Or implement via app-level request context (session org_id, user_id)
-- ============================================================================
