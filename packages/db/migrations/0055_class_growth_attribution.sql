-- Class source attribution for future growth/revenue analysis.
alter table public.class_enrollments add column if not exists source_type text check(source_type is null or source_type in ('direct','research','referral','campaign','event','other'));
alter table public.class_enrollments add column if not exists source_reference text;
create index if not exists class_enrollments_source on public.class_enrollments(source_type,source_reference) where source_type is not null;
-- Booking does not invent attribution. Source is null unless an explicit, auditable workflow sets it later.
