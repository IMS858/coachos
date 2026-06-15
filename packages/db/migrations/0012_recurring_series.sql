-- 0012_recurring_series.sql
-- Standing appointments: a client booked into the same weekly slot(s)
-- that auto-fill the calendar indefinitely until the series is cancelled.

DO $$ BEGIN
  CREATE TYPE recurring_status AS ENUM ('active', 'paused', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS recurring_series (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  trainer_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  session_type      session_type NOT NULL DEFAULT 'training',
  duration_minutes  int NOT NULL DEFAULT 60,
  location          text DEFAULT 'IMS Studio',
  -- The weekly pattern: one row per slot in `slots`, each { weekday 0-6, time "HH:MM" }
  -- 0 = Sunday … 6 = Saturday (matches JS getDay()).
  slots             jsonb NOT NULL,
  status            recurring_status NOT NULL DEFAULT 'active',
  -- How far ahead we've already generated sessions (rolling horizon).
  generated_until   date,
  start_date        date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Los_Angeles')::date,
  created_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_client ON recurring_series(client_id);
CREATE INDEX IF NOT EXISTS idx_recurring_active ON recurring_series(status) WHERE status = 'active';

-- Link generated sessions back to their series (so cancelling a series can
-- clean up its future sessions, and we never double-book the same slot).
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS recurring_series_id uuid
  REFERENCES recurring_series(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_series ON sessions(recurring_series_id);

-- Prevent duplicate generation of the same slot instance.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_series_slot
  ON sessions(recurring_series_id, scheduled_at)
  WHERE recurring_series_id IS NOT NULL;

ALTER TABLE recurring_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recurring_staff_all ON recurring_series;
CREATE POLICY recurring_staff_all ON recurring_series FOR ALL TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'trainer')
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'trainer')
  );

DROP POLICY IF EXISTS recurring_client_read ON recurring_series;
CREATE POLICY recurring_client_read ON recurring_series FOR SELECT TO authenticated
  USING (client_id = auth.uid());
