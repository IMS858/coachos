-- =============================================================================
-- 0020 — Fix: "stack depth limit exceeded" when opening a client's messages
--
-- WHAT WENT WRONG
-- Migration 0019 wrote the staff policy as an inline subquery:
--
--   USING ( (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner','trainer') )
--
-- Reading `profiles` triggers profiles' own RLS, which is:
--
--   profiles_self_read: USING ( id = auth.uid() OR is_trainer() )
--
-- and is_trainer() is a plain STABLE SQL function, so it reads `profiles`
-- again — with RLS applied again. Any query that can't satisfy the cheap
-- `id = auth.uid()` branch first recurses until Postgres gives up.
--
-- THE FIX
-- Make the role helpers SECURITY DEFINER. They then run as the function owner
-- and bypass RLS on the tables they read, which breaks the cycle at the source.
-- This is the standard Supabase pattern for exactly this problem, and it also
-- fixes every other policy that leans on these helpers.
--
-- Safe to re-run. Run in the Supabase SQL editor.
-- =============================================================================

-- 1. Role helpers bypass RLS. search_path is pinned so a SECURITY DEFINER
--    function can never be tricked into resolving `profiles` elsewhere.
CREATE OR REPLACE FUNCTION is_trainer() RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('owner', 'trainer')
      AND deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION is_owner() RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'owner'
      AND deleted_at IS NULL
  );
$$;

-- 2. Rebuild the messages policies on the helper instead of an inline subquery,
--    so nothing here reads `profiles` under RLS.
DROP POLICY IF EXISTS messages_staff_all        ON messages;
DROP POLICY IF EXISTS messages_client_read      ON messages;
DROP POLICY IF EXISTS messages_client_send      ON messages;
DROP POLICY IF EXISTS messages_client_mark_read ON messages;
DROP POLICY IF EXISTS msg_participants          ON messages;

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY messages_staff_all ON messages FOR ALL TO authenticated
  USING (is_trainer())
  WITH CHECK (is_trainer());

-- clients.id = profiles.id = auth.uid(), so a client's own id IS the thread key.
CREATE POLICY messages_client_read ON messages FOR SELECT TO authenticated
  USING (client_id = auth.uid());

CREATE POLICY messages_client_send ON messages FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid() AND sender_id = auth.uid());

CREATE POLICY messages_client_mark_read ON messages FOR UPDATE TO authenticated
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

-- 3. Verify — this should return a row, not an error.
-- SELECT count(*) FROM messages;
