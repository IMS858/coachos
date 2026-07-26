-- =============================================================================
-- 0011 — Messages: one thread per client, staff <-> client chat
-- Run this in the Supabase SQL Editor like the others.
-- =============================================================================

CREATE TABLE IF NOT EXISTS messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body        text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_messages_thread
  ON messages(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON messages(client_id) WHERE read_at IS NULL;

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Staff (owner/trainer) can do everything
DROP POLICY IF EXISTS messages_staff_all ON messages;
CREATE POLICY messages_staff_all ON messages FOR ALL TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'trainer')
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'trainer')
  );

-- Clients can read their own thread
DROP POLICY IF EXISTS messages_client_read ON messages;
CREATE POLICY messages_client_read ON messages FOR SELECT TO authenticated
  USING (client_id = auth.uid());

-- Clients can send into their own thread, as themselves
DROP POLICY IF EXISTS messages_client_send ON messages;
CREATE POLICY messages_client_send ON messages FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid() AND sender_id = auth.uid());

-- Clients can mark messages in their own thread as read
DROP POLICY IF EXISTS messages_client_mark_read ON messages;
CREATE POLICY messages_client_mark_read ON messages FOR UPDATE TO authenticated
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

-- Realtime: broadcast inserts so threads update live
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
