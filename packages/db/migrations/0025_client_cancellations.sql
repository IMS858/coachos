-- =============================================================================
-- 0025 — Client-initiated cancellations
--
-- The columns this needs mostly exist already (0002 added cancelled_at,
-- cancelled_by, cancellation_reason, late_cancel_fee_charged; session_status
-- already has 'cancelled' and 'late_cancelled'). Two things are missing:
--
--   1. A link from a make-up session back to the one it replaces, so a
--      rescheduled membership session is traceable rather than looking like an
--      extra booking.
--   2. RLS letting a client cancel their OWN upcoming session. Until now only
--      staff could change a session row.
-- =============================================================================

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS rescheduled_from_session_id uuid REFERENCES sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_rescheduled_from
  ON sessions(rescheduled_from_session_id)
  WHERE rescheduled_from_session_id IS NOT NULL;

-- Clients may update their own sessions. The API is what enforces *what* they
-- can change (cancel only, and only something still upcoming) — this policy
-- just makes sure they can't touch anyone else's row.
DROP POLICY IF EXISTS sessions_client_cancel ON sessions;
CREATE POLICY sessions_client_cancel ON sessions FOR UPDATE TO authenticated
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

-- Cancellations are worth being able to look back on: how often, how late, and
-- whether it cost the client a session.
CREATE OR REPLACE VIEW cancellation_log AS
SELECT
  s.id,
  s.client_id,
  p.full_name,
  s.scheduled_at,
  s.cancelled_at,
  s.status,
  s.cancellation_reason,
  s.late_cancel_fee_charged,
  ROUND(EXTRACT(EPOCH FROM (s.scheduled_at - s.cancelled_at)) / 3600.0, 1) AS hours_notice,
  s.cancelled_by = s.client_id AS cancelled_by_client
FROM sessions s
JOIN profiles p ON p.id = s.client_id
WHERE s.status IN ('cancelled', 'late_cancelled')
  AND s.cancelled_at IS NOT NULL;
