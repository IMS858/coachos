-- =============================================================================
-- Migration 0004 — Package session counter + billing type clarity
--
-- Two changes:
--   1. Add `current_session_number` column to memberships — tracks the running
--      session count for package clients (Nikki at 24, then 25, then 26...)
--   2. Add `billing_type` enum on clients — clarifies whether this client is on
--      a recurring membership or a session-package model
-- =============================================================================

-- 1. Billing type enum on clients
DO $$ BEGIN
  CREATE TYPE billing_type AS ENUM ('membership', 'package', 'unset');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS billing_type billing_type NOT NULL DEFAULT 'unset';

CREATE INDEX IF NOT EXISTS idx_clients_billing_type
  ON clients(billing_type);

-- 2. Running session counter on memberships
ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS current_session_number int;

COMMENT ON COLUMN memberships.current_session_number IS
  'For package clients: the most recent session number completed. Increments by 1 after each completed session. NULL for membership-tier clients.';

-- 3. Helper view: easy querying of who is on what
CREATE OR REPLACE VIEW client_billing_summary AS
SELECT
  c.id AS client_id,
  p.full_name,
  p.email,
  c.status,
  c.billing_type,
  c.primary_trainer_id,
  c.last_session_at,
  m.id AS membership_id,
  m.tier,
  m.status AS membership_status,
  m.current_session_number,
  m.total_sessions,
  m.sessions_used,
  m.monthly_rate_cents,
  m.start_date,
  m.created_at AS membership_created_at
FROM clients c
JOIN profiles p ON p.id = c.id
LEFT JOIN LATERAL (
  SELECT *
  FROM memberships m
  WHERE m.client_id = c.id
    AND m.status = 'active'
  ORDER BY m.created_at DESC
  LIMIT 1
) m ON true;

-- The view is read-only and inherits RLS from underlying tables
COMMENT ON VIEW client_billing_summary IS
  'One row per client with their currently active membership (if any). Use this
  in the Owner clients list and dashboard rather than re-joining everywhere.';

-- 4. Function to atomically increment session count when session is completed.
-- Trainer dashboard or session detail page should call this when marking a
-- session 'completed' for a package client.
CREATE OR REPLACE FUNCTION increment_session_counter(p_client_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count int;
BEGIN
  -- Update the most recently active membership for this client
  UPDATE memberships
  SET
    current_session_number = COALESCE(current_session_number, 0) + 1,
    sessions_used = COALESCE(sessions_used, 0) + 1,
    updated_at = now()
  WHERE id = (
    SELECT id FROM memberships
    WHERE client_id = p_client_id
      AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
  )
  RETURNING current_session_number INTO new_count;

  RETURN new_count;
END;
$$;

COMMENT ON FUNCTION increment_session_counter IS
  'Atomically increments current_session_number and sessions_used for a client active membership. Returns the new session number.';

-- =============================================================================
-- Done. After running:
--   - clients.billing_type lets you filter "show me all package clients"
--   - memberships.current_session_number holds Nikki at 24, Will at 12, etc.
--   - client_billing_summary view consolidates the data for list/profile screens
--   - increment_session_counter() is called from session-complete actions
-- =============================================================================
