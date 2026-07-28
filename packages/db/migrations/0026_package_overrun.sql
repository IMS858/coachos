-- =============================================================================
-- 0026 — Flag when a package is used past its total
--
-- increment_session_counter() adds one with no reference to total_sessions, so
-- a 48-pack quietly runs to 49, 50, 51. Nothing breaks — you just give away
-- sessions and find out at reconciliation, if at all.
--
-- This does NOT block the increment. Refusing to log a session that genuinely
-- happened would be worse: the training history has to stay true, and the
-- coach is standing in front of the client. It reports the overrun instead, so
-- the app can say "that was session 49 of 48" at the moment it matters.
-- =============================================================================

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
  plan_total int;
BEGIN
  -- FOR UPDATE serialises concurrent callers on the same plan so a tick can't
  -- be lost to a race.
  SELECT id, total_sessions INTO target_plan_id, plan_total
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
  SET current_session_number = COALESCE(current_session_number, 0) + 1,
      sessions_used = COALESCE(sessions_used, 0) + 1,
      updated_at = now()
  WHERE id = target_plan_id
  RETURNING current_session_number INTO new_count;

  RETURN jsonb_build_object(
    'plan_id', target_plan_id,
    'incremented', true,
    'session_number', new_count,
    'total_sessions', plan_total,
    'sessions_left', GREATEST(0, COALESCE(plan_total, 0) - new_count),
    -- true once the pack is spent, so the UI can prompt a renewal
    'exhausted', plan_total IS NOT NULL AND new_count >= plan_total,
    'over_limit', plan_total IS NOT NULL AND new_count > plan_total
  );
END;
$$;
