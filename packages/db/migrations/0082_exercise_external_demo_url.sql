-- Align the already-shipped external-demo queries with the hosted exercise table.
-- video_guid remains separate and unchanged. No video, approval or client visibility is inferred.
alter table public.exercises add column if not exists video_url text;
comment on column public.exercises.video_url is
  'Optional explicitly supplied external demonstration URL. Null means not supplied; video_guid remains separate. Client delivery still requires exercise visibility and approved safety evidence.';
