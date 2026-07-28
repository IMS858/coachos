-- =============================================================================
-- 0024 — Usage analytics + assigning library exercises as homework
--
-- TWO THINGS
--
-- 1. app_events: who opens the app and when. The point isn't vanity metrics —
--    it's spotting the client who stopped opening it three weeks ago, which is
--    the earliest churn signal a studio gets.
--
-- 2. client_media.exercise_id: homework can now point at a library exercise
--    instead of carrying its own upload. Record "Hip 90/90 PAILs" once, assign
--    it to twenty clients. Cheaper, consistent coaching, and the library
--    becomes the asset rather than a pile of one-off clips.
-- =============================================================================

-- ---------- 1. Usage events ----------
CREATE TABLE IF NOT EXISTS app_events (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,
  role        text,
  event       text NOT NULL,      -- 'open' | 'view' | 'watch' | 'book' | 'message'
  path        text,
  meta        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Queries are always "recent activity, by person" — index for exactly that.
CREATE INDEX IF NOT EXISTS idx_app_events_user_time
  ON app_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_events_time
  ON app_events(created_at DESC);

ALTER TABLE app_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_events_insert_self ON app_events;
DROP POLICY IF EXISTS app_events_owner_read  ON app_events;

-- Anyone signed in can record their own activity...
CREATE POLICY app_events_insert_self ON app_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ...but only the owner can read it. Trainers don't need to see who's been
-- opening the app, and clients certainly shouldn't see each other.
CREATE POLICY app_events_owner_read ON app_events FOR SELECT TO authenticated
  USING (is_owner());

-- ---------- 2. Library exercises as homework ----------
ALTER TABLE client_media
  ADD COLUMN IF NOT EXISTS exercise_id uuid REFERENCES exercises(id) ON DELETE SET NULL;

-- storage_path is required for uploads but meaningless for a library
-- assignment, so relax it and enforce "one or the other" instead.
ALTER TABLE client_media ALTER COLUMN storage_path DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE client_media ADD CONSTRAINT client_media_source_present
    CHECK (storage_path IS NOT NULL OR exercise_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_client_media_exercise
  ON client_media(exercise_id) WHERE exercise_id IS NOT NULL;

-- Assigned library exercises must be readable by the client they're assigned
-- to, even when the exercise itself isn't published to the whole roster.
DROP POLICY IF EXISTS exercises_assigned_read ON exercises;
CREATE POLICY exercises_assigned_read ON exercises FOR SELECT TO authenticated
  USING (
    is_trainer()
    OR (client_visible = true AND status = 'published')
    OR EXISTS (
      SELECT 1 FROM client_media cm
      WHERE cm.exercise_id = exercises.id
        AND cm.client_id = auth.uid()
        AND cm.archived_at IS NULL
    )
  );

-- ---------- 3. Rollup for the usage dashboard ----------
-- A view keeps the "who's gone quiet" logic in one place instead of
-- reimplementing the date maths in every query.
CREATE OR REPLACE VIEW client_engagement AS
SELECT
  p.id,
  p.full_name,
  p.email,
  MAX(e.created_at)                                   AS last_active_at,
  COUNT(e.id) FILTER (WHERE e.created_at > now() - interval '30 days') AS events_30d,
  COUNT(e.id) FILTER (WHERE e.created_at > now() - interval '7 days')  AS events_7d,
  COUNT(e.id) FILTER (WHERE e.event = 'watch')        AS videos_watched
FROM profiles p
LEFT JOIN app_events e ON e.user_id = p.id
WHERE p.role = 'client' AND p.deleted_at IS NULL
GROUP BY p.id, p.full_name, p.email;
