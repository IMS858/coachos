-- =============================================================================
-- Migration 0009 — Concurrency Fix + Index for Trigger
--
-- Audit 2 findings — fixes things the first audit missed.
--
-- Issue #1: Counter race condition (CRITICAL — real bug)
--   `increment_session_counter` did SELECT-then-UPDATE without a row lock.
--   Two trainers logging sessions for the same client simultaneously could
--   both read current_session_number=24, both write 25, end up at 25 instead
--   of 26 — losing one tick. Adding FOR UPDATE makes the second caller wait
--   for the first transaction to commit, so they read the freshly-updated
--   value (25) and write 26 correctly.
--
-- Issue #2: Trigger performs sequential scan on undo
--   When you undo a session completion, the trigger recomputes
--   clients.last_session_at by querying MAX(scheduled_at) on completed
--   sessions for that client. Without an index, this is a seq scan.
--   Adds a partial index on completed sessions for fast lookup.
-- =============================================================================

-- 1. Fixed increment with row-level lock
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
  -- FOR UPDATE acquires a row lock so concurrent callers serialize on the
  -- same plan rather than racing. Without this we could double-write 25 and
  -- lose a tick. Plain FOR UPDATE (not SKIP LOCKED) is correct here — we
  -- want the second caller to wait and pick up the freshly-incremented value.
  SELECT id INTO target_plan_id
  FROM plans
  WHERE client_id = p_client_id
    AND service_type = p_service_type
    AND kind = 'package'
    AND status = 'active'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF target_plan_id IS NULL THEN
    RETURN jsonb_build_object(
      'plan_id', null,
      'incremented', false,
      'reason', 'no_active_package'
    );
  END IF;

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

-- 2. Decrement also gets the lock for symmetric correctness
CREATE OR REPLACE FUNCTION decrement_session_counter(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count int;
BEGIN
  -- Lock the row before reading + writing
  PERFORM 1 FROM plans WHERE id = p_plan_id FOR UPDATE;

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

-- 3. Index for the trigger's undo recompute query
-- The trigger runs `SELECT MAX(scheduled_at) FROM sessions WHERE client_id = X
-- AND status = 'completed' AND id != Y`. Existing indexes don't cover
-- status='completed', so this was a seq scan. Add a partial index.
CREATE INDEX IF NOT EXISTS idx_sessions_completed_per_client
  ON sessions(client_id, scheduled_at DESC)
  WHERE status = 'completed';

COMMENT ON INDEX idx_sessions_completed_per_client IS
  'Powers the sync_last_session_at trigger when a completion is undone. Also useful for any "show me X completed sessions" queries.';

-- =============================================================================
-- Done. Verify the lock works:
--
--   Terminal 1:
--     BEGIN; SELECT increment_session_counter('<nikki-uuid>', 'training');
--     -- (don't commit yet)
--
--   Terminal 2:
--     SELECT increment_session_counter('<nikki-uuid>', 'training');
--     -- (should hang waiting for Terminal 1)
--
--   Terminal 1:
--     COMMIT;
--
--   Terminal 2 should now return with session_number = (Terminal 1's + 1).
-- =============================================================================
