-- Durable coach review for client-submitted form media.
alter table public.client_media add column if not exists review_status text not null default 'not_required' check(review_status in ('not_required','awaiting_review','reviewed'));
alter table public.client_media add column if not exists coach_feedback text check(coach_feedback is null or char_length(coach_feedback)<=2000);
alter table public.client_media add column if not exists reviewed_at timestamptz;
alter table public.client_media add column if not exists reviewed_by uuid references public.profiles(id);
create index if not exists client_media_review_queue on public.client_media(review_status,created_at) where archived_at is null;
update public.client_media set review_status='awaiting_review' where storage_path like '%/from-client-%' and archived_at is null and review_status='not_required';
-- Review writes stay server-authorized; existing RLS reads remain the privacy boundary.
