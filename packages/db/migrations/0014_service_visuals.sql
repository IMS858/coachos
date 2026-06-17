-- 0014_service_visuals.sql
-- Make services visual: an image and highlight bullets, so the Services page
-- renders as a gallery. Photos are bundled in /public/services.

ALTER TABLE service_catalog
  ADD COLUMN IF NOT EXISTS image_url   text,
  ADD COLUMN IF NOT EXISTS highlights  jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tagline     text;

INSERT INTO service_catalog (slug, name, category, tagline, description, highlights, image_url, active, display_order)
VALUES
  ('facility_training', 'Personal Training', 'training',
   'Coaching built around your body',
   '1-on-1 strength and movement coaching in a private studio.',
   '["FRC-based joint prep","Individualized programming","Private, no gym floor"]'::jsonb,
   '/services/training.jpg', true, 1),
  ('facility_assessment', 'Movement Assessment', 'training',
   'Find the real problem first',
   'A head-to-toe movement screen so every session targets what your body needs.',
   '["Joint-by-joint screen","Plain-language findings","Your program starting point"]'::jsonb,
   '/services/assessment.jpg', true, 2),
  ('facility_gym', 'The Gym', 'training',
   'Premium equipment, zero crowds',
   'Full strength setup with racks, platforms, and conditioning tools.',
   '["Squat racks & platforms","Free weights & machines","Open during your session"]'::jsonb,
   '/services/gym.jpg', true, 3),
  ('facility_cardio', 'Cardio Zone', 'training',
   'Optimize your warm-up + recovery',
   'Bikes, ellipticals, and conditioning machines for warm-ups and energy work.',
   '["Assault bikes & Life Fitness","Warm-up & conditioning","Heart-rate zone training"]'::jsonb,
   '/services/cardio.jpg', true, 4),
  ('facility_pilates', 'Pilates', 'training',
   'Precision movement on the Reformer',
   'Private Reformer sessions for core strength, control, and mobility.',
   '["Private Reformer studio","Deep core & control","Low-impact strength"]'::jsonb,
   '/services/pilates.jpg', true, 5),
  ('facility_massage', 'Massage & Bodywork', 'recovery',
   'Therapeutic recovery',
   'Licensed massage in a calm, dedicated treatment room.',
   '["Licensed therapist","Tissue & soreness work","Members & outside clients"]'::jsonb,
   '/services/massage.jpg', true, 6),
  ('facility_recovery_room', 'Recovery Room', 'recovery',
   'Reset between sessions',
   'NormaTec compression, percussion, and infrared recovery in one space.',
   '["NormaTec 3.0 compression","HyperIce percussion","Infrared PEMF mat"]'::jsonb,
   '/services/recovery.jpg', true, 7)
ON CONFLICT (slug) DO UPDATE
  SET image_url    = EXCLUDED.image_url,
      tagline      = EXCLUDED.tagline,
      description  = EXCLUDED.description,
      highlights   = EXCLUDED.highlights,
      name         = EXCLUDED.name,
      active       = true;
