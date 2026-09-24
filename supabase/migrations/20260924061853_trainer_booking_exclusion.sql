-- Stage after reviewing existing overlaps. Never delete or move appointments to satisfy this constraint.
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
-- Fixed UTC arithmetic is immutable across database TimeZone settings.
create or replace function public.session_time_range(p_start timestamptz,p_minutes integer)
returns tstzrange language sql immutable strict set search_path='' set timezone='UTC'
as $$select tstzrange(p_start,p_start+p_minutes*interval '1 minute','[)')$$;
alter table public.sessions add constraint sessions_valid_duration check(duration_minutes between 1 and 480);
alter table public.sessions add constraint sessions_trainer_no_overlap
exclude using gist (trainer_id with =,public.session_time_range(scheduled_at,duration_minutes) with &&)
where (status in ('scheduled','confirmed') and trainer_id is not null);
-- Rooms/group capacity require an explicit business rule before a separate constraint.
