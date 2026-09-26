-- Explicit class-program assignment command with immutable assignment history.
create table if not exists public.class_program_assignments (
 id uuid primary key,
 occurrence_id uuid not null references public.class_occurrences(id) on delete cascade,
 class_program_id uuid not null references public.class_programs(id) on delete restrict,
 assigned_by uuid not null references public.profiles(id),
 assigned_at timestamptz not null default now()
);
create index if not exists class_program_assignments_occurrence on public.class_program_assignments(occurrence_id,assigned_at desc);
alter table public.class_program_assignments enable row level security;revoke all on public.class_program_assignments from anon,authenticated;grant select on public.class_program_assignments to authenticated;
create policy "staff reads class program assignments" on public.class_program_assignments for select to authenticated using(exists(select 1 from public.profiles me where me.id=auth.uid() and me.deleted_at is null and me.role in ('owner','trainer')));
-- Assignment writes are server-authorized and audited by immutable rows; no direct authenticated mutation grant.
