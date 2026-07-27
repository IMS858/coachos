-- =============================================================================
-- 0019 — Repair: messaging (clients couldn't see their thread)
--
-- WHAT WENT WRONG
-- Two migrations define a `messages` table with different shapes:
--   0001 → messages(conversation_id …)  + policy `msg_participants`
--   0011 → messages(client_id …)        + policies `messages_*`
-- Because 0011 uses CREATE TABLE IF NOT EXISTS, whichever ran first wins and
-- the other is silently skipped — but its POLICIES still get created.
--
-- The stale 0001 policy is the actual bug:
--
--   USING ( is_trainer() OR EXISTS (SELECT 1 FROM conversations c
--           WHERE c.id = messages.conversation_id AND c.client_id = auth.uid()) )
--
-- Postgres short-circuits the OR. For staff, is_trainer() is true and the
-- broken half is never evaluated — messaging looks fine. For a client,
-- is_trainer() is false, so it evaluates a reference to a column/table that may
-- not exist, the SELECT errors, and the thread comes back empty. Exactly the
-- "shows on my end, not theirs" symptom.
--
-- This migration is idempotent and safe to run whatever state you're in.
-- Run it in the Supabase SQL editor.
-- =============================================================================

-- 1. Make sure the table exists in the shape the app expects.
CREATE TABLE IF NOT EXISTS messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid REFERENCES clients(id) ON DELETE CASCADE,
  sender_id   uuid REFERENCES profiles(id) ON DELETE CASCADE,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz
);

-- 2. If the table came from 0001, it has conversation_id and no client_id.
--    Add the column, then backfill it from conversations where possible so no
--    existing message is orphaned.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_id uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'conversation_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'conversations'
  ) THEN
    EXECUTE '
      UPDATE messages m
         SET client_id = c.client_id
        FROM conversations c
       WHERE c.id = m.conversation_id
         AND m.client_id IS NULL';
  END IF;
END $$;

-- 3. Drop every historical policy on messages, including the broken one.
DROP POLICY IF EXISTS msg_participants        ON messages;
DROP POLICY IF EXISTS messages_staff_all      ON messages;
DROP POLICY IF EXISTS messages_client_read    ON messages;
DROP POLICY IF EXISTS messages_client_send    ON messages;
DROP POLICY IF EXISTS messages_client_mark_read ON messages;

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 4. Recreate one clean set. These only reference client_id, so there is no
--    column that can go missing and no short-circuit trap.

-- Staff (owner/trainer) can do everything.
CREATE POLICY messages_staff_all ON messages FOR ALL TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'trainer')
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'trainer')
  );

-- clients.id = profiles.id = auth.uid(), so a client's own id IS the thread key.
CREATE POLICY messages_client_read ON messages FOR SELECT TO authenticated
  USING (client_id = auth.uid());

CREATE POLICY messages_client_send ON messages FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid() AND sender_id = auth.uid());

CREATE POLICY messages_client_mark_read ON messages FOR UPDATE TO authenticated
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

-- 5. Indexes the thread view relies on.
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(client_id) WHERE read_at IS NULL;

-- 6. Live updates so a thread refreshes without a reload.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7. Verify. Both should return rows after this runs.
-- SELECT policyname FROM pg_policies WHERE tablename = 'messages';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'messages';
