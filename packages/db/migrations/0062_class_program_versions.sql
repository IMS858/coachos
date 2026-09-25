-- Versioned class-program editing. Published/approved delivery plans are never mutated in place.
create table if not exists public.class_program_versions (
 id uuid primary key,
 class_program_id uuid not null references public.class_programs(id) on delete cascade,
 version integer not null check(version>=1),
 snapshot jsonb not null,
 reason text not null check(char_length(reason) between 10 and 1000),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(class_program_id,version)
);
alter table public.class_program_versions enable row level security;revoke all on public.class_program_versions from anon,authenticated;grant select on public.class_program_versions to authenticated;
create policy "staff reads class program versions" on public.class_program_versions for select to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.deleted_at is null and p.role in ('owner','trainer')));
-- Editing commands must snapshot the previous program before changing draft content. Approved programs require a new draft version.
