-- Chat module schema for multi-tenant blood bank messaging
-- Supports one-to-one conversations with message threading and media tracking

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CHATS TABLE: Represents conversation threads between two participants
CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  participant_1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- JSONB to track organized media for quick gallery-like access
  -- Structure: { "images": ["url1", "url2"], "videos": ["url1"], "files": ["url1"], "links": ["url1"] }
  media_summary JSONB DEFAULT '{"images": [], "videos": [], "files": [], "links": []}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Prevent self-chat
  CONSTRAINT no_self_chat CHECK (participant_1_id != participant_2_id)
);

-- MESSAGES TABLE: Individual messages within a chat
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL DEFAULT 'text',
  -- Content payload
  content TEXT,
  file_url TEXT,
  -- Read status tracking
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Constraint: valid message types
  CONSTRAINT valid_message_type CHECK (
    message_type IN ('text', 'image', 'file', 'video', 'link')
  )
);

-- INDEXES for performance
CREATE INDEX idx_chats_org_id ON chats(org_id);
CREATE INDEX idx_chats_participant_1 ON chats(participant_1_id);
CREATE INDEX idx_chats_participant_2 ON chats(participant_2_id);
CREATE INDEX idx_chats_created_at ON chats(created_at DESC);

CREATE INDEX idx_messages_chat_id ON messages(chat_id);
CREATE INDEX idx_messages_org_id ON messages(org_id);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_is_read ON messages(is_read);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_chat_is_read ON messages(chat_id, is_read);

-- UPDATED_AT TRIGGER for chats
CREATE OR REPLACE FUNCTION update_chats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chats_updated_at_trigger
BEFORE UPDATE ON chats
FOR EACH ROW
EXECUTE FUNCTION update_chats_updated_at();

-- TRIGGER: Enforce one-to-one uniqueness (prevent duplicate chats between same participants)
CREATE OR REPLACE FUNCTION check_chat_uniqueness()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if a chat already exists between these two participants (in any direction)
  IF EXISTS (
    SELECT 1 FROM chats
    WHERE org_id = NEW.org_id
    AND id != NEW.id
    AND (
      (participant_1_id = NEW.participant_1_id AND participant_2_id = NEW.participant_2_id)
      OR (participant_1_id = NEW.participant_2_id AND participant_2_id = NEW.participant_1_id)
    )
  ) THEN
    RAISE EXCEPTION 'A chat between these two participants already exists in this organization';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chats_unique_participants_trigger
BEFORE INSERT OR UPDATE ON chats
FOR EACH ROW
EXECUTE FUNCTION check_chat_uniqueness();

-- TRIGGER: Validate participants are in the same organization
CREATE OR REPLACE FUNCTION validate_chat_participants_org()
RETURNS TRIGGER AS $$
DECLARE
  p1_org_id UUID;
  p2_org_id UUID;
BEGIN
  SELECT org_id INTO p1_org_id FROM users WHERE id = NEW.participant_1_id;
  SELECT org_id INTO p2_org_id FROM users WHERE id = NEW.participant_2_id;
  
  IF p1_org_id IS NULL OR p2_org_id IS NULL THEN
    RAISE EXCEPTION 'One or both participants do not exist';
  END IF;
  
  IF p1_org_id != NEW.org_id OR p2_org_id != NEW.org_id THEN
    RAISE EXCEPTION 'Both participants must be in the same organization as the chat';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chats_validate_participants_org_trigger
BEFORE INSERT OR UPDATE ON chats
FOR EACH ROW
EXECUTE FUNCTION validate_chat_participants_org();

-- UPDATED_AT TRIGGER for messages
CREATE OR REPLACE FUNCTION update_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_updated_at_trigger
BEFORE UPDATE ON messages
FOR EACH ROW
EXECUTE FUNCTION update_messages_updated_at();

-- TRIGGER: Validate message sender and org
CREATE OR REPLACE FUNCTION validate_message_constraints()
RETURNS TRIGGER AS $$
DECLARE
  chat_org_id UUID;
  p1_id UUID;
  p2_id UUID;
BEGIN
  -- Get chat details
  SELECT org_id, participant_1_id, participant_2_id INTO chat_org_id, p1_id, p2_id
  FROM chats WHERE id = NEW.chat_id;
  
  IF chat_org_id IS NULL THEN
    RAISE EXCEPTION 'Chat does not exist';
  END IF;
  
  -- Verify org_id matches
  IF NEW.org_id != chat_org_id THEN
    RAISE EXCEPTION 'Message org_id must match chat org_id';
  END IF;
  
  -- Verify sender is a participant
  IF NEW.sender_id != p1_id AND NEW.sender_id != p2_id THEN
    RAISE EXCEPTION 'Sender must be a participant in the chat';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_validate_constraints_trigger
BEFORE INSERT OR UPDATE ON messages
FOR EACH ROW
EXECUTE FUNCTION validate_message_constraints();

-- HELPER FUNCTION: Get current user's organization ID
CREATE OR REPLACE FUNCTION current_user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM users WHERE auth_id = auth.uid()
$$ LANGUAGE SQL STABLE;

-- HELPER FUNCTION: Update media_summary in chats when messages are added
CREATE OR REPLACE FUNCTION update_chat_media_summary()
RETURNS TRIGGER AS $$
DECLARE
  media_object JSONB;
BEGIN
  -- Update media_summary based on message type
  IF NEW.message_type = 'image' AND NEW.file_url IS NOT NULL THEN
    UPDATE chats
    SET media_summary = jsonb_set(
      media_summary,
      '{images}',
      COALESCE(media_summary->'images', '[]'::jsonb) || jsonb_build_array(NEW.file_url)
    )
    WHERE id = NEW.chat_id;
  ELSIF NEW.message_type = 'video' AND NEW.file_url IS NOT NULL THEN
    UPDATE chats
    SET media_summary = jsonb_set(
      media_summary,
      '{videos}',
      COALESCE(media_summary->'videos', '[]'::jsonb) || jsonb_build_array(NEW.file_url)
    )
    WHERE id = NEW.chat_id;
  ELSIF NEW.message_type = 'file' AND NEW.file_url IS NOT NULL THEN
    UPDATE chats
    SET media_summary = jsonb_set(
      media_summary,
      '{files}',
      COALESCE(media_summary->'files', '[]'::jsonb) || jsonb_build_array(NEW.file_url)
    )
    WHERE id = NEW.chat_id;
  ELSIF NEW.message_type = 'link' AND NEW.content IS NOT NULL THEN
    UPDATE chats
    SET media_summary = jsonb_set(
      media_summary,
      '{links}',
      COALESCE(media_summary->'links', '[]'::jsonb) || jsonb_build_array(NEW.content)
    )
    WHERE id = NEW.chat_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_chat_media_on_message
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION update_chat_media_summary();
