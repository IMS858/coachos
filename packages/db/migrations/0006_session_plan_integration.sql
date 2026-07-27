-- =============================================================================
-- Migration 0006 — Session-Plan integration + integrity fixes
--
-- Wires sessions to plans so the counter increments when sessions complete.
-- Fixes three integrity bugs found during the audit:
--   1. clients.last_session_at was never updated → at-risk list always wrong
--   2. No audit trail linking session → which plan it billed against
--   3. increment_session_counter auto-expired packages, but Jason uses
--      perpetual counters (Nikki at 24, going to 25, 26... 344). Removed
--      auto-expire; counter now ticks up indefinitely.
-- =============================================================================

-- 1. Add service_type to sessions (which plan type this session bills against)
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS service_type service_type;

-- For sessions where session_type already implies the service type, backfill
UPDATE sessions
SET service_type = 'training'
WHERE service_type IS NULL
  AND session_type::text = 'training';

-- 2. Audit trail — which plan was decremented when this session completed
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_plan
  ON sessions(plan_id) WHERE plan_id IS NOT NULL;

-- 3. Track when a session was actually completed (not just scheduled)
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- 4. Trigger to keep clients.last_session_at in sync with completed sessions
CREATE OR REPLACE FUNCTION sync_last_session_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'completed') OR
     (TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed') THEN
    UPDATE clients
    SET last_session_at = NEW.scheduled_at
    WHERE id = NEW.client_id
      AND (last_session_at IS NULL OR last_session_at < NEW.scheduled_at);
  END IF;

  -- If a completion was undone, recompute from remaining completed sessions
  IF (TG_OP = 'UPDATE' AND OLD.status = 'completed' AND NEW.status IS DISTINCT FROM 'completed') THEN
    UPDATE clients
    SET last_session_at = (
      SELECT MAX(scheduled_at) FROM sessions
      WHERE client_id = NEW.client_id AND status = 'completed' AND id != NEW.id
    )
    WHERE id = NEW.client_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sessions_sync_last_session_at ON sessions;
CREATE TRIGGER sessions_sync_last_session_at
  AFTER INSERT OR UPDATE OF status ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION sync_last_session_at();

-- 5. Simplify increment_session_counter — drop auto-expire, perpetual counter
CREATE OR REPLACE FUNCTION increment_session_counter(
  p_client_id uuid,
  p_service_type service_type
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_plan_id uuid;
  new_count int;
BEGIN
  -- Find the oldest active package for this client + service type (FIFO)
  SELECT id INTO target_plan_id
  FROM plans
  WHERE client_id = p_client_id
    AND service_type = p_service_type
    AND kind = 'package'
    AND status = 'active'
  ORDER BY created_at ASC
  LIMIT 1;

  IF target_plan_id IS NULL THEN
    RETURN jsonb_build_object(
      'plan_id', null,
      'incremented', false,
      'reason', 'no_active_package'
    );
  END IF;

  -- Increment the perpetual counter (no auto-expire — Jason manually
  -- cancels old packs and adds new ones when selling fresh batches)
  UPDATE plans
  SET
    current_session_number = COALESCE(current_session_number, 0) + 1,
    sessions_used = COALESCE(sessions_used, 0) + 1,
    updated_at = now()
  WHERE id = target_plan_id
  RETURNING current_session_number INTO new_count;

  RETURN jsonb_build_object(
    'plan_id', target_plan_id,
    'incremented', true,
    'session_number', new_count
  );
END;
$$;

-- 6. Decrement function — for undoing a session completion
CREATE OR REPLACE FUNCTION decrement_session_counter(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count int;
BEGIN
  UPDATE plans
  SET
    current_session_number = GREATEST(0, COALESCE(current_session_number, 0) - 1),
    sessions_used = GREATEST(0, COALESCE(sessions_used, 0) - 1),
    updated_at = now()
  WHERE id = p_plan_id
  RETURNING current_session_number INTO new_count;

  RETURN jsonb_build_object(
    'plan_id', p_plan_id,
    'session_number', new_count
  );
END;
$$;

COMMENT ON FUNCTION decrement_session_counter IS
  'Reverse of increment_session_counter. Used when a session completion is undone (e.g. mistakenly marked complete).';

-- =============================================================================
-- Done. After running:
--   - sessions.service_type maps to which plan to decrement
--   - sessions.plan_id tracks which specific plan was decremented (audit)
--   - sessions.completed_at + completed_by track who/when
--   - clients.last_session_at auto-updates via trigger (fixes at-risk list)
--   - increment_session_counter no longer auto-expires (perpetual counters)
--   - decrement_session_counter exists for undo flow
-- =============================================================================
