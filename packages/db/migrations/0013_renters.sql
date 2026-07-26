-- 0013_renters.sql
-- Renters: practitioners (massage, etc.) who pay IMS a fixed monthly rent.
-- Pure recurring income that rolls into MRR alongside memberships.

CREATE TABLE IF NOT EXISTS renters (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  discipline         text,                    -- e.g. "Massage Therapy", "Pilates"
  monthly_rent_cents int NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'active',  -- active, paused, ended
  start_date         date NOT NULL DEFAULT CURRENT_DATE,
  end_date           date,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_renters_status ON renters(status);

ALTER TABLE renters ENABLE ROW LEVEL SECURITY;

-- Owner-only: rent income is sensitive. Trainers don't see it.
DROP POLICY IF EXISTS renters_owner_all ON renters;
CREATE POLICY renters_owner_all ON renters FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'owner')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'owner');
