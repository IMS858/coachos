-- =============================================================================
-- IMS Coach OS — Supabase Database Schema
-- =============================================================================
-- Run this entire file in the Supabase SQL editor (or via supabase CLI)
-- after creating a new project. Order matters: extensions → enums → tables →
-- indexes → RLS policies → triggers → seed.
--
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE everywhere possible.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. EXTENSIONS
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- -----------------------------------------------------------------------------
-- 2. ENUMS
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('owner', 'trainer', 'client');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE client_status AS ENUM (
    'lead', 'assessment_booked', 'assessment_completed',
    'active', 'paused', 'churned'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE waiver_type AS ENUM (
    'liability', 'photo_release', 'telehealth', 'minor_consent'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE assessment_status AS ENUM ('draft', 'in_progress', 'complete');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE program_status AS ENUM (
    'draft', 'published', 'active', 'completed', 'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE session_type AS ENUM (
    'assessment', 'training', 'mobility', 'pilates', 'recovery', 'body_comp'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE session_status AS ENUM (
    'scheduled', 'confirmed', 'completed', 'no_show', 'cancelled', 'late_cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE membership_tier AS ENUM (
    'essentials_2x', 'standard_3x', 'premium_4x',
    'package_6', 'package_12', 'package_24'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE membership_status AS ENUM (
    'active', 'paused', 'cancelled', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM (
    'pending', 'succeeded', 'failed', 'refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_source AS ENUM ('stripe', 'vagaro', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE document_type AS ENUM (
    'waiver', 'intake', 'program', 'body_comp_report', 'invoice', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bodycomp_method AS ENUM (
    'bod_pod', 'dexa', 'inbody', 'scale', 'calipers'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE workflow_status AS ENUM (
    'pending', 'running', 'completed', 'failed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- 3. CORE TABLES — IDENTITY
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           citext NOT NULL UNIQUE,
  full_name       text NOT NULL,
  phone           text,
  role            user_role NOT NULL DEFAULT 'client',
  avatar_url      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email) WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 4. CLIENTS (extends profiles with client-only data)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id                              uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  date_of_birth                   date,
  emergency_contact_name          text,
  emergency_contact_phone         text,
  emergency_contact_relationship  text,
  address_line1                   text,
  address_line2                   text,
  city                            text,
  state                           text,
  zip                             text,
  medical_conditions              jsonb DEFAULT '[]'::jsonb,
  medications                     jsonb DEFAULT '[]'::jsonb,
  allergies                       jsonb DEFAULT '[]'::jsonb,
  injury_history                  jsonb DEFAULT '[]'::jsonb,
  physician_name                  text,
  physician_phone                 text,
  lead_source                     text,
  referred_by_client_id           uuid REFERENCES clients(id) ON DELETE SET NULL,
  status                          client_status NOT NULL DEFAULT 'lead',
  joined_at                       timestamptz,
  last_session_at                 timestamptz,
  notes_internal                  text,
  primary_trainer_id              uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_primary_trainer ON clients(primary_trainer_id);
CREATE INDEX IF NOT EXISTS idx_clients_last_session ON clients(last_session_at DESC NULLS LAST);

-- -----------------------------------------------------------------------------
-- 5. INTAKE FORMS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS intake_forms (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  form_version    text NOT NULL DEFAULT '1.0',
  responses       jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at    timestamptz,
  pdf_url         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intake_client ON intake_forms(client_id);
CREATE INDEX IF NOT EXISTS idx_intake_completed ON intake_forms(completed_at) WHERE completed_at IS NOT NULL;

-- Public intake tokens — for leads who haven't created an account yet
CREATE TABLE IF NOT EXISTS intake_tokens (
  token           text PRIMARY KEY,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  used_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intake_tokens_client ON intake_tokens(client_id);

-- -----------------------------------------------------------------------------
-- 6. WAIVERS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS waivers (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id           uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  waiver_type         waiver_type NOT NULL,
  waiver_version      text NOT NULL,
  signed_at           timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz,
  ip_address          inet,
  user_agent          text,
  signature_data_url  text,
  pdf_url             text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waivers_client ON waivers(client_id);
CREATE INDEX IF NOT EXISTS idx_waivers_type_version ON waivers(waiver_type, waiver_version);

-- -----------------------------------------------------------------------------
-- 7. ASSESSMENTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessments (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id           uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  trainer_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  assessment_date     date NOT NULL DEFAULT current_date,
  status              assessment_status NOT NULL DEFAULT 'draft',
  data                jsonb NOT NULL DEFAULT '{}'::jsonb,
  section_status      jsonb DEFAULT '{}'::jsonb,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assessments_client ON assessments(client_id);
CREATE INDEX IF NOT EXISTS idx_assessments_trainer ON assessments(trainer_id);
CREATE INDEX IF NOT EXISTS idx_assessments_date ON assessments(assessment_date DESC);

-- -----------------------------------------------------------------------------
-- 8. PROGRAMS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS programs (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id           uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  assessment_id       uuid REFERENCES assessments(id) ON DELETE SET NULL,
  trainer_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  name                text NOT NULL,
  start_date          date,
  end_date            date,
  weeks               int NOT NULL DEFAULT 4,
  status              program_status NOT NULL DEFAULT 'draft',
  data                jsonb NOT NULL DEFAULT '{}'::jsonb,
  coach_edits         jsonb DEFAULT '{}'::jsonb,
  pdf_client_url      text,
  pdf_coach_url       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  published_at        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_programs_client ON programs(client_id);
CREATE INDEX IF NOT EXISTS idx_programs_status ON programs(status);
CREATE INDEX IF NOT EXISTS idx_programs_trainer ON programs(trainer_id);

-- -----------------------------------------------------------------------------
-- 9. SESSIONS (Calendar Events)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id               uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  trainer_id              uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  program_id              uuid REFERENCES programs(id) ON DELETE SET NULL,
  program_session_index   int,
  scheduled_at            timestamptz NOT NULL,
  duration_minutes        int NOT NULL DEFAULT 60,
  session_type            session_type NOT NULL DEFAULT 'training',
  status                  session_status NOT NULL DEFAULT 'scheduled',
  vagaro_event_id         text UNIQUE,
  location                text DEFAULT 'IMS Studio',
  notes_pre               text,
  notes_post              text,
  client_rpe              int CHECK (client_rpe BETWEEN 1 AND 10),
  client_notes            text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  completed_at            timestamptz
);

CREATE INDEX IF NOT EXISTS idx_sessions_client ON sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_sessions_trainer ON sessions(trainer_id);
CREATE INDEX IF NOT EXISTS idx_sessions_scheduled ON sessions(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_today
  ON sessions(scheduled_at, trainer_id)
  WHERE status IN ('scheduled', 'confirmed');

-- -----------------------------------------------------------------------------
-- 10. WORKOUT LOGS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workout_logs (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id          uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  client_id           uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  exercise_name       text NOT NULL,
  exercise_id         text,
  block               text,
  set_number          int,
  prescribed_reps     text,
  prescribed_load     text,
  actual_reps         int,
  actual_load_lb      numeric(6,2),
  actual_rpe          numeric(3,1),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workouts_session ON workout_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_workouts_client ON workout_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_workouts_exercise ON workout_logs(exercise_name, client_id);

-- -----------------------------------------------------------------------------
-- 11. MOBILITY HOMEWORK
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mobility_assignments (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id           uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  trainer_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  name                text NOT NULL,
  description         text,
  exercises           jsonb NOT NULL DEFAULT '[]'::jsonb,
  frequency           text NOT NULL DEFAULT 'daily',
  duration_minutes    int DEFAULT 10,
  video_url           text,
  start_date          date NOT NULL DEFAULT current_date,
  end_date            date,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mobility_client ON mobility_assignments(client_id) WHERE active = true;

CREATE TABLE IF NOT EXISTS mobility_completions (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id       uuid NOT NULL REFERENCES mobility_assignments(id) ON DELETE CASCADE,
  client_id           uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  completed_on        date NOT NULL DEFAULT current_date,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, completed_on)
);

CREATE INDEX IF NOT EXISTS idx_mobility_completions_client ON mobility_completions(client_id, completed_on DESC);

-- -----------------------------------------------------------------------------
-- 12. BODY COMPOSITION
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS body_comp_records (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id           uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  recorded_at         date NOT NULL DEFAULT current_date,
  weight_lb           numeric(5,2),
  body_fat_pct        numeric(4,2),
  lean_mass_lb        numeric(5,2),
  method              bodycomp_method NOT NULL DEFAULT 'scale',
  circumferences      jsonb,
  notes               text,
  photo_urls          jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bodycomp_client ON body_comp_records(client_id, recorded_at DESC);

-- -----------------------------------------------------------------------------
-- 13. MESSAGING
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id           uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  trainer_id          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  last_message_at     timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_client ON conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_conversations_trainer ON conversations(trainer_id);

CREATE TABLE IF NOT EXISTS messages (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id     uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  body                text NOT NULL,
  attachments         jsonb DEFAULT '[]'::jsonb,
  read_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(conversation_id) WHERE read_at IS NULL;

-- -----------------------------------------------------------------------------
-- 14. MEMBERSHIPS & PAYMENTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memberships (
  id                          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id                   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tier                        membership_tier NOT NULL,
  status                      membership_status NOT NULL DEFAULT 'active',
  sessions_per_week           int,
  total_sessions              int,
  sessions_used               int NOT NULL DEFAULT 0,
  monthly_rate_cents          int,
  package_total_cents         int,
  start_date                  date NOT NULL DEFAULT current_date,
  end_date                    date,
  stripe_subscription_id      text UNIQUE,
  vagaro_membership_id        text UNIQUE,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memberships_client ON memberships(client_id);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships(status);

CREATE TABLE IF NOT EXISTS payments (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id           uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  membership_id       uuid REFERENCES memberships(id) ON DELETE SET NULL,
  amount_cents        int NOT NULL,
  currency            text NOT NULL DEFAULT 'usd',
  status              payment_status NOT NULL DEFAULT 'pending',
  source              payment_source NOT NULL,
  source_id           text,
  description         text,
  paid_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_client ON payments(client_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_source ON payments(source, source_id);

-- -----------------------------------------------------------------------------
-- 15. DOCUMENTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id           uuid REFERENCES clients(id) ON DELETE CASCADE,
  document_type       document_type NOT NULL,
  name                text NOT NULL,
  storage_path        text NOT NULL,
  mime_type           text,
  size_bytes          int,
  uploaded_by         uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_client ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);

-- -----------------------------------------------------------------------------
-- 16. AUDIT LOG
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id            uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action              text NOT NULL,
  entity_type         text NOT NULL,
  entity_id           uuid,
  changes             jsonb DEFAULT '{}'::jsonb,
  ip_address          inet,
  user_agent          text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);

-- -----------------------------------------------------------------------------
-- 17. WORKFLOW STATE (Inngest mirror)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_runs (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_name       text NOT NULL,
  client_id           uuid REFERENCES clients(id) ON DELETE CASCADE,
  status              workflow_status NOT NULL DEFAULT 'pending',
  current_step        text,
  data                jsonb DEFAULT '{}'::jsonb,
  scheduled_for       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflows_client ON workflow_runs(client_id);
CREATE INDEX IF NOT EXISTS idx_workflows_pending ON workflow_runs(scheduled_for) WHERE status = 'pending';

-- =============================================================================
-- 18. UPDATED_AT TRIGGERS
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'updated_at'
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS set_updated_at_%I ON %I;
      CREATE TRIGGER set_updated_at_%I
      BEFORE UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    ', t, t, t, t);
  END LOOP;
END $$;

-- =============================================================================
-- 19. AUTO-CREATE PROFILE ON SIGNUP
-- =============================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'client')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================================================
-- 20. ROW-LEVEL SECURITY
-- =============================================================================

-- Enable RLS on every table
ALTER TABLE profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_forms            ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_tokens           ENABLE ROW LEVEL SECURITY;
ALTER TABLE waivers                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions                ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobility_assignments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobility_completions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_comp_records       ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages                ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships             ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents               ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs           ENABLE ROW LEVEL SECURITY;

-- ----- helper: check role
CREATE OR REPLACE FUNCTION is_owner() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'owner' AND deleted_at IS NULL
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION is_trainer() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('owner', 'trainer') AND deleted_at IS NULL
  );
$$ LANGUAGE sql STABLE;

-- ----- profiles policies
DROP POLICY IF EXISTS profiles_self_read ON profiles;
CREATE POLICY profiles_self_read ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR is_trainer());

DROP POLICY IF EXISTS profiles_self_update ON profiles;
CREATE POLICY profiles_self_update ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR is_owner());

DROP POLICY IF EXISTS profiles_owner_all ON profiles;
CREATE POLICY profiles_owner_all ON profiles FOR ALL TO authenticated
  USING (is_owner());

-- ----- clients policies
DROP POLICY IF EXISTS clients_owner_all ON clients;
CREATE POLICY clients_owner_all ON clients FOR ALL TO authenticated
  USING (is_owner());

DROP POLICY IF EXISTS clients_trainer_read ON clients;
CREATE POLICY clients_trainer_read ON clients FOR SELECT TO authenticated
  USING (is_trainer());

DROP POLICY IF EXISTS clients_trainer_update ON clients;
CREATE POLICY clients_trainer_update ON clients FOR UPDATE TO authenticated
  USING (is_trainer());

DROP POLICY IF EXISTS clients_self_read ON clients;
CREATE POLICY clients_self_read ON clients FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS clients_self_update ON clients;
CREATE POLICY clients_self_update ON clients FOR UPDATE TO authenticated
  USING (id = auth.uid());

-- ----- intake_forms policies
DROP POLICY IF EXISTS intake_owner_all ON intake_forms;
CREATE POLICY intake_owner_all ON intake_forms FOR ALL TO authenticated
  USING (is_owner());

DROP POLICY IF EXISTS intake_trainer_read ON intake_forms;
CREATE POLICY intake_trainer_read ON intake_forms FOR SELECT TO authenticated
  USING (is_trainer());

DROP POLICY IF EXISTS intake_self_all ON intake_forms;
CREATE POLICY intake_self_all ON intake_forms FOR ALL TO authenticated
  USING (client_id = auth.uid());

-- ----- waivers policies (immutable once signed; insert/select only)
DROP POLICY IF EXISTS waivers_trainer_read ON waivers;
CREATE POLICY waivers_trainer_read ON waivers FOR SELECT TO authenticated
  USING (is_trainer());

DROP POLICY IF EXISTS waivers_self_read ON waivers;
CREATE POLICY waivers_self_read ON waivers FOR SELECT TO authenticated
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS waivers_self_insert ON waivers;
CREATE POLICY waivers_self_insert ON waivers FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid());

DROP POLICY IF EXISTS waivers_owner_all ON waivers;
CREATE POLICY waivers_owner_all ON waivers FOR ALL TO authenticated
  USING (is_owner());

-- ----- assessments policies
DROP POLICY IF EXISTS assessments_trainer_all ON assessments;
CREATE POLICY assessments_trainer_all ON assessments FOR ALL TO authenticated
  USING (is_trainer());

DROP POLICY IF EXISTS assessments_self_read ON assessments;
CREATE POLICY assessments_self_read ON assessments FOR SELECT TO authenticated
  USING (client_id = auth.uid() AND status = 'complete');

-- ----- programs policies
DROP POLICY IF EXISTS programs_trainer_all ON programs;
CREATE POLICY programs_trainer_all ON programs FOR ALL TO authenticated
  USING (is_trainer());

DROP POLICY IF EXISTS programs_self_read ON programs;
CREATE POLICY programs_self_read ON programs FOR SELECT TO authenticated
  USING (client_id = auth.uid() AND status IN ('published', 'active', 'completed'));

-- ----- sessions policies
DROP POLICY IF EXISTS sessions_trainer_all ON sessions;
CREATE POLICY sessions_trainer_all ON sessions FOR ALL TO authenticated
  USING (is_trainer());

DROP POLICY IF EXISTS sessions_self_read ON sessions;
CREATE POLICY sessions_self_read ON sessions FOR SELECT TO authenticated
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS sessions_self_update_clientfields ON sessions;
CREATE POLICY sessions_self_update_clientfields ON sessions FOR UPDATE TO authenticated
  USING (client_id = auth.uid());

-- ----- workout_logs policies
DROP POLICY IF EXISTS workouts_trainer_all ON workout_logs;
CREATE POLICY workouts_trainer_all ON workout_logs FOR ALL TO authenticated
  USING (is_trainer());

DROP POLICY IF EXISTS workouts_self_read ON workout_logs;
CREATE POLICY workouts_self_read ON workout_logs FOR SELECT TO authenticated
  USING (client_id = auth.uid());

-- ----- mobility policies
DROP POLICY IF EXISTS mobility_trainer_all ON mobility_assignments;
CREATE POLICY mobility_trainer_all ON mobility_assignments FOR ALL TO authenticated
  USING (is_trainer());

DROP POLICY IF EXISTS mobility_self_read ON mobility_assignments;
CREATE POLICY mobility_self_read ON mobility_assignments FOR SELECT TO authenticated
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS mobility_completions_trainer_read ON mobility_completions;
CREATE POLICY mobility_completions_trainer_read ON mobility_completions FOR SELECT TO authenticated
  USING (is_trainer());

DROP POLICY IF EXISTS mobility_completions_self_all ON mobility_completions;
CREATE POLICY mobility_completions_self_all ON mobility_completions FOR ALL TO authenticated
  USING (client_id = auth.uid());

-- ----- body_comp policies
DROP POLICY IF EXISTS bodycomp_trainer_all ON body_comp_records;
CREATE POLICY bodycomp_trainer_all ON body_comp_records FOR ALL TO authenticated
  USING (is_trainer());

DROP POLICY IF EXISTS bodycomp_self_read ON body_comp_records;
CREATE POLICY bodycomp_self_read ON body_comp_records FOR SELECT TO authenticated
  USING (client_id = auth.uid());

-- ----- conversations / messages
DROP POLICY IF EXISTS conv_trainer_all ON conversations;
CREATE POLICY conv_trainer_all ON conversations FOR ALL TO authenticated
  USING (is_trainer());

DROP POLICY IF EXISTS conv_self_all ON conversations;
CREATE POLICY conv_self_all ON conversations FOR ALL TO authenticated
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS msg_participants ON messages;
CREATE POLICY msg_participants ON messages FOR ALL TO authenticated
  USING (
    is_trainer()
    OR EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id AND c.client_id = auth.uid()
    )
  );

-- ----- memberships / payments
DROP POLICY IF EXISTS memberships_owner_all ON memberships;
CREATE POLICY memberships_owner_all ON memberships FOR ALL TO authenticated
  USING (is_owner());

DROP POLICY IF EXISTS memberships_trainer_read ON memberships;
CREATE POLICY memberships_trainer_read ON memberships FOR SELECT TO authenticated
  USING (is_trainer());

DROP POLICY IF EXISTS memberships_self_read ON memberships;
CREATE POLICY memberships_self_read ON memberships FOR SELECT TO authenticated
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS payments_owner_all ON payments;
CREATE POLICY payments_owner_all ON payments FOR ALL TO authenticated
  USING (is_owner());

DROP POLICY IF EXISTS payments_self_read ON payments;
CREATE POLICY payments_self_read ON payments FOR SELECT TO authenticated
  USING (client_id = auth.uid());

-- ----- documents
DROP POLICY IF EXISTS documents_trainer_all ON documents;
CREATE POLICY documents_trainer_all ON documents FOR ALL TO authenticated
  USING (is_trainer());

DROP POLICY IF EXISTS documents_self_read ON documents;
CREATE POLICY documents_self_read ON documents FOR SELECT TO authenticated
  USING (client_id = auth.uid());

-- ----- audit_logs (owners only)
DROP POLICY IF EXISTS audit_owner_all ON audit_logs;
CREATE POLICY audit_owner_all ON audit_logs FOR ALL TO authenticated
  USING (is_owner());

-- ----- workflow_runs (trainer/owner read; service role writes)
DROP POLICY IF EXISTS workflow_trainer_read ON workflow_runs;
CREATE POLICY workflow_trainer_read ON workflow_runs FOR SELECT TO authenticated
  USING (is_trainer());

-- ----- intake_tokens (service role only — public access via API endpoint)

-- =============================================================================
-- 21. STORAGE BUCKETS (run separately in Supabase dashboard or via supabase CLI)
-- =============================================================================
-- Buckets to create:
--   - waivers          (private, signed-PDF storage)
--   - intakes          (private, intake-PDF storage)
--   - programs         (private, generated program PDFs)
--   - bodycomp-photos  (private)
--   - exercise-videos  (public — demo videos for client viewing)
--   - avatars          (public — profile pictures)

-- =============================================================================
-- DONE.
--
-- Next steps:
--   1. Run this file in Supabase SQL editor
--   2. Create the storage buckets listed above
--   3. Manually promote the bootstrap user to 'owner' role:
--        UPDATE profiles SET role = 'owner' WHERE email = 'jason@imsfitnesscenter.com';
--   4. Generate TS types:  supabase gen types typescript --project-id YOUR_ID > types.ts
-- =============================================================================
