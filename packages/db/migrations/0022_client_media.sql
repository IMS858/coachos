-- =============================================================================
-- 0022 — Client media: video homework, and client profile photos
--
-- Two buckets, deliberately different:
--   client-media  PRIVATE — coaching videos sent to one client. Served through
--                 short-lived signed URLs so a link can't be forwarded and
--                 replayed indefinitely.
--   avatars       PUBLIC  — profile photos. Already visible to anyone in the
--                 studio, and public URLs avoid re-signing on every render.
--
-- Uploads go browser → Supabase Storage directly via signed upload URLs, not
-- through the app's API routes: Vercel caps a serverless request body at ~4.5MB
-- and a phone video clears that in a few seconds of footage.
-- =============================================================================

-- 1. What was sent, to whom, and why. The file itself lives in Storage; this is
--    the record the app reads.
CREATE TABLE IF NOT EXISTS client_media (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  uploaded_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  kind          text NOT NULL DEFAULT 'video' CHECK (kind IN ('video', 'image')),
  category      text NOT NULL DEFAULT 'mobility'
                CHECK (category IN ('mobility', 'strength', 'conditioning', 'general')),
  title         text NOT NULL,
  note          text,
  storage_path  text NOT NULL,
  duration_seconds int,
  created_at    timestamptz NOT NULL DEFAULT now(),
  viewed_at     timestamptz,          -- set the first time the client opens it
  archived_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_client_media_client
  ON client_media(client_id, created_at DESC)
  WHERE archived_at IS NULL;

ALTER TABLE client_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_media_staff_all  ON client_media;
DROP POLICY IF EXISTS client_media_client_read ON client_media;
DROP POLICY IF EXISTS client_media_client_seen ON client_media;

-- is_trainer() is SECURITY DEFINER (migration 0020), so this can't recurse.
CREATE POLICY client_media_staff_all ON client_media FOR ALL TO authenticated
  USING (is_trainer())
  WITH CHECK (is_trainer());

CREATE POLICY client_media_client_read ON client_media FOR SELECT TO authenticated
  USING (client_id = auth.uid() AND archived_at IS NULL);

-- Clients may only mark their own item as viewed.
CREATE POLICY client_media_client_seen ON client_media FOR UPDATE TO authenticated
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

-- 2. Buckets.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-media', 'client-media', false,
  524288000,  -- 500MB, comfortably above a few minutes of phone video
  ARRAY['video/mp4','video/quicktime','video/webm','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars', 'avatars', true,
  5242880,  -- 5MB
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3. Storage access.
--    Paths are "<client_id>/<file>", so the first path segment is the owner and
--    can be compared straight against auth.uid().

DROP POLICY IF EXISTS client_media_staff_write ON storage.objects;
DROP POLICY IF EXISTS client_media_staff_read  ON storage.objects;
DROP POLICY IF EXISTS client_media_owner_read  ON storage.objects;

CREATE POLICY client_media_staff_write ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'client-media' AND is_trainer())
  WITH CHECK (bucket_id = 'client-media' AND is_trainer());

CREATE POLICY client_media_owner_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Avatars: anyone signed in can look, you can only write your own folder.
DROP POLICY IF EXISTS avatars_read       ON storage.objects;
DROP POLICY IF EXISTS avatars_self_write ON storage.objects;
DROP POLICY IF EXISTS avatars_staff_write ON storage.objects;

CREATE POLICY avatars_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY avatars_self_write ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY avatars_staff_write ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'avatars' AND is_trainer())
  WITH CHECK (bucket_id = 'avatars' AND is_trainer());
