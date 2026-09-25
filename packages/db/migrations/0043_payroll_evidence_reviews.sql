-- Persistent owner payroll review state. Review is evidence acknowledgement only; it is not payroll approval or submission.
create table if not exists public.payroll_evidence_reviews (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  reviewed_by uuid not null references public.profiles(id),
  reviewed_at timestamptz not null default now(),
  note text,
  updated_at timestamptz not null default now()
);
alter table public.payroll_evidence_reviews enable row level security;
revoke all on public.payroll_evidence_reviews from anon, authenticated;
grant select, insert, update, delete on public.payroll_evidence_reviews to authenticated;
create policy "owner reads payroll reviews" on public.payroll_evidence_reviews for select to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner' and p.deleted_at is null));
create policy "owner writes payroll reviews" on public.payroll_evidence_reviews for all to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner' and p.deleted_at is null)) with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner' and p.deleted_at is null));
