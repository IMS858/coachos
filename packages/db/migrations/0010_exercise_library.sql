-- =============================================================================
-- Migration 0010 — Exercise Library + Program Integration
--
-- Establishes the canonical exercise library powering:
--   - /library (trainer-facing browse + filter)
--   - Program assembly (assign exercises to programs with sets/reps)
--   - Client dashboard ("today's workout")
--   - Future mobility-aware programming (filter by joint restrictions)
--
-- Design notes:
--   - Pain-friendly tags are DESCRIPTIVE (anatomical load), not prescriptive
--     (medical). e.g. 'low_lumbar_load' not 'back_friendly'.
--   - Trainer-scoped favorites; separate client_visible flag gates what shows
--     up on the client dashboard.
--   - Video stored as Bunny Stream GUID (not URL) — embedded via iframe.
-- =============================================================================

-- 1. Enums for filterable, structured fields

DO $$ BEGIN
  CREATE TYPE exercise_category AS ENUM (
    'mobility', 'strength', 'corrective', 'conditioning', 'recovery'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE movement_pattern AS ENUM (
    'squat', 'hinge', 'lunge', 'push_horizontal', 'push_vertical',
    'pull_horizontal', 'pull_vertical', 'carry', 'rotation',
    'anti_rotation', 'anti_extension', 'anti_lateral_flexion',
    'gait', 'isolated_joint', 'breathing', 'none'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE exercise_level AS ENUM ('beginner', 'intermediate', 'advanced');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE joint AS ENUM (
    'cervical_spine', 'thoracic_spine', 'lumbar_spine',
    'shoulder', 'scapula', 'elbow', 'wrist',
    'hip', 'knee', 'ankle', 'foot'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Main exercises table
CREATE TABLE IF NOT EXISTS exercises (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Naming
  name                  text NOT NULL,                  -- "Goblet Squat"
  ims_label             text,                           -- "IMS Goblet Squat" (Jason's coached name)
  slug                  text UNIQUE NOT NULL,           -- url-safe id

  -- Classification
  category              exercise_category NOT NULL,
  movement_pattern      movement_pattern NOT NULL DEFAULT 'none',
  level                 exercise_level NOT NULL DEFAULT 'intermediate',

  -- Anatomy
  primary_joints        joint[] NOT NULL DEFAULT '{}',
  primary_muscles       text[] NOT NULL DEFAULT '{}',   -- "glute_max", "quad", etc.

  -- Equipment + setup
  equipment             text[] NOT NULL DEFAULT '{}',   -- "dumbbell", "kettlebell", "bodyweight"

  -- Coaching content (the real value)
  coaching_cues         text[] NOT NULL DEFAULT '{}',   -- ["Drive knees out", "Spread the floor"]
  common_mistakes       text[] NOT NULL DEFAULT '{}',
  programming_notes     text,                           -- free-form for trainer
  contraindications     text,                           -- free-form, deliberate

  -- Pain-load descriptors (anatomical, not medical advice)
  load_descriptors      text[] NOT NULL DEFAULT '{}',   -- "low_lumbar_load", "shoulder_friendly_pressing"

  -- Variations linked by id (same library, different rows)
  regression_ids        uuid[] NOT NULL DEFAULT '{}',
  progression_ids       uuid[] NOT NULL DEFAULT '{}',

  -- Mobility/system tags
  system_tags           text[] NOT NULL DEFAULT '{}',   -- "warm_up", "mobility_prep", "end_range_control", "cars"

  -- Open tagging
  tags                  text[] NOT NULL DEFAULT '{}',

  -- Media
  video_provider        text DEFAULT 'bunny',           -- 'bunny' | 'placeholder' | 'youtube'
  video_id              text,                           -- Bunny Stream GUID
  video_url             text,                           -- fallback for placeholder/yt
  thumbnail_url         text,

  -- Visibility
  client_visible        boolean NOT NULL DEFAULT false, -- gate: Jason curates client-facing
  status                text NOT NULL DEFAULT 'draft',  -- 'draft' | 'published' | 'archived'

  -- Audit
  created_by            uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Indexes for filter queries
CREATE INDEX IF NOT EXISTS idx_exercises_category ON exercises(category) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_exercises_pattern ON exercises(movement_pattern) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_exercises_level ON exercises(level) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_exercises_client_visible ON exercises(client_visible) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_exercises_joints ON exercises USING gin (primary_joints);
CREATE INDEX IF NOT EXISTS idx_exercises_equipment ON exercises USING gin (equipment);
CREATE INDEX IF NOT EXISTS idx_exercises_system_tags ON exercises USING gin (system_tags);
CREATE INDEX IF NOT EXISTS idx_exercises_tags ON exercises USING gin (tags);
-- Full-text search on name + ims_label + cues
CREATE INDEX IF NOT EXISTS idx_exercises_search ON exercises
  USING gin (to_tsvector('english',
    coalesce(name, '') || ' ' ||
    coalesce(ims_label, '') || ' ' ||
    coalesce(array_to_string(coaching_cues, ' '), '') || ' ' ||
    coalesce(array_to_string(tags, ' '), '')
  ));

-- 3. RLS — trainers/owner see all (incl draft). Clients see only published + client_visible.
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exercises_trainer_all ON exercises;
CREATE POLICY exercises_trainer_all ON exercises FOR ALL TO authenticated
  USING (is_trainer() OR is_owner());

DROP POLICY IF EXISTS exercises_client_read ON exercises;
CREATE POLICY exercises_client_read ON exercises FOR SELECT TO authenticated
  USING (status = 'published' AND client_visible = true);

-- 4. updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at_exercises ON exercises;
CREATE TRIGGER set_updated_at_exercises
  BEFORE UPDATE ON exercises
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5. Trainer favorites (per-trainer go-to lists)
CREATE TABLE IF NOT EXISTS exercise_favorites (
  trainer_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  exercise_id   uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trainer_id, exercise_id)
);

ALTER TABLE exercise_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS favorites_self ON exercise_favorites;
CREATE POLICY favorites_self ON exercise_favorites FOR ALL TO authenticated
  USING (trainer_id = auth.uid())
  WITH CHECK (trainer_id = auth.uid());

-- 6. Program exercise assignments
-- (programs table already exists from 0001; we link exercises to it)
CREATE TABLE IF NOT EXISTS program_exercises (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id          uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  exercise_id         uuid NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,

  -- Ordering within the program
  block               text NOT NULL DEFAULT 'main',     -- 'warmup' | 'main' | 'finisher' | 'cooldown'
  sort_order          int NOT NULL DEFAULT 0,

  -- Prescription
  sets                int,
  reps                text,                              -- text so "8-12" or "30s" works
  load                text,                              -- "RPE 7", "70% 1RM", "moderate"
  rest_seconds        int,
  tempo               text,                              -- "3-1-1-0"
  duration_seconds    int,                               -- for time-based work

  -- Notes — trainer-facing default, can be marked client-visible
  notes_trainer       text,
  notes_client        text,

  -- Substitution chain — what to swap to if equipment unavailable / pain flares
  substitute_ids      uuid[] NOT NULL DEFAULT '{}',

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_program_exercises_program
  ON program_exercises(program_id, block, sort_order);
CREATE INDEX IF NOT EXISTS idx_program_exercises_exercise
  ON program_exercises(exercise_id);

ALTER TABLE program_exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS program_exercises_trainer ON program_exercises;
CREATE POLICY program_exercises_trainer ON program_exercises FOR ALL TO authenticated
  USING (is_trainer() OR is_owner());

-- Clients can read program_exercises for their own programs (programs.client_id = auth.uid())
DROP POLICY IF EXISTS program_exercises_client_read ON program_exercises;
CREATE POLICY program_exercises_client_read ON program_exercises FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM programs p
      WHERE p.id = program_exercises.program_id
        AND p.client_id = auth.uid()
        AND p.status = 'published'
    )
  );

DROP TRIGGER IF EXISTS set_updated_at_program_exercises ON program_exercises;
CREATE TRIGGER set_updated_at_program_exercises
  BEFORE UPDATE ON program_exercises
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 7. Helper view — exercises with favorite flag for the calling trainer
-- security_invoker so per-caller RLS applies
CREATE OR REPLACE VIEW exercises_with_favorite AS
SELECT
  e.*,
  EXISTS (
    SELECT 1 FROM exercise_favorites f
    WHERE f.exercise_id = e.id AND f.trainer_id = auth.uid()
  ) AS is_favorite
FROM exercises e;

ALTER VIEW exercises_with_favorite SET (security_invoker = on);

COMMENT ON VIEW exercises_with_favorite IS
  'Exercises with a per-caller is_favorite flag. Use in /library list views.';

-- =============================================================================
-- Done.
--
-- After running:
--   - exercises table is the canonical library
--   - program_exercises links exercises to programs with full prescription
--   - favorites are trainer-scoped
--   - RLS gates client visibility per-exercise (default hidden) and per-program
--   - Full-text search ready on name/label/cues/tags
-- =============================================================================
