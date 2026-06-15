-- 0015_leads.sql
-- Standalone leads pipeline: imported contacts (Vagaro, Jason's phone, etc.)
-- that aren't clients yet. No auth account needed — they're follow-up targets.
-- When a lead books, you convert them to a client.

DO $$ BEGIN
  CREATE TYPE lead_stage AS ENUM (
    'new', 'contacted', 'nurturing', 'booked', 'converted', 'not_interested'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name      text,
  last_name       text,
  full_name       text NOT NULL,
  email           text,
  phone           text,
  -- Interest tag from the source list (Membership Lead, Massage Lead, etc.)
  interest        text,
  stage           lead_stage NOT NULL DEFAULT 'new',
  source          text,                       -- vagaro, marketing, jason_contacts, manual
  appointments_booked int DEFAULT 0,          -- historical, from Vagaro
  last_visited    date,
  prior_trainer   text,
  address         text,
  notes           text,
  last_contacted_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_interest ON leads(interest);
-- Dedupe helper: don't import the same person twice
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_name_phone
  ON leads(lower(full_name), coalesce(phone,''));

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leads_staff_all ON leads;
CREATE POLICY leads_staff_all ON leads FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner','trainer'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner','trainer'));
