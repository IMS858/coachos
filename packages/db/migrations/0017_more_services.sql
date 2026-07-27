-- 0017_more_services.sql
-- Add Sauna, Bod Pod (body composition), NormaTec compression, and Red Light therapy
-- to the visual services catalog.

INSERT INTO service_catalog (slug, name, category, tagline, description, highlights, image_url, active, display_order)
VALUES
  ('facility_sauna', 'Sauna', 'recovery',
   'Heat therapy for recovery',
   'Infrared and traditional heat to relax muscles, support circulation, and aid recovery between sessions.',
   '["Muscle relaxation","Circulation & cardiovascular support","Stress relief"]'::jsonb,
   '/services/sauna.jpg', true, 8),
  ('facility_bodpod', 'Bod Pod', 'recovery',
   'Know what''s actually changing',
   'Gold-standard body composition testing — accurate muscle mass and body fat percentage, no guesswork.',
   '["Accurate body fat %","Lean muscle tracking","Re-test every 8-12 weeks"]'::jsonb,
   '/services/bodpod.jpg', true, 9),
  ('facility_normatec', 'NormaTec Compression', 'recovery',
   'Flush, recover, repeat',
   'Pneumatic compression boots speed circulation, reduce soreness, and accelerate recovery between training days.',
   '["Faster recovery","Reduced soreness","Standalone or add-on"]'::jsonb,
   '/services/normatec.jpg', true, 10),
  ('facility_redlight', 'Red Light Therapy', 'recovery',
   'Cellular recovery support',
   'Full-body red light mat to support tissue recovery, reduce inflammation, and aid muscle repair.',
   '["Tissue recovery","Inflammation support","Relaxing & passive"]'::jsonb,
   '/services/redlight.jpg', true, 11)
ON CONFLICT (slug) DO UPDATE
  SET image_url    = EXCLUDED.image_url,
      tagline      = EXCLUDED.tagline,
      description  = EXCLUDED.description,
      highlights   = EXCLUDED.highlights,
      name         = EXCLUDED.name,
      active       = true;
