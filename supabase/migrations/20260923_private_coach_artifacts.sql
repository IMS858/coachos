-- Private coach source for published IMS generator plans.
-- Client-readable public.programs must contain only a sanitized projection.
create table if not exists public.program_coach_artifacts (
  program_id uuid primary key references public.programs(id) on delete cascade,
  structured_program jsonb not null,
  assessment_summary jsonb not null default '{}'::jsonb,
  request_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.program_coach_artifacts enable row level security;
revoke all on public.program_coach_artifacts from anon;
grant select on public.program_coach_artifacts to authenticated;
drop policy if exists coach_artifacts_staff_read on public.program_coach_artifacts;
create policy coach_artifacts_staff_read on public.program_coach_artifacts
  for select to authenticated using (public.is_trainer());
-- Inserts and updates are service-role only after the application checks staff identity.
