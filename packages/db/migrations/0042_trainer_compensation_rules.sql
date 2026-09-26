-- Owner-only trainer compensation rules for payroll preparation.
create table if not exists public.trainer_compensation_rules (
  trainer_id uuid primary key references public.profiles(id) on delete cascade,
  compensation_type text not null check (compensation_type in ('hourly','per_session','salary','custom')),
  rate_cents integer check (rate_cents is null or rate_cents >= 0),
  late_cancel_rate_cents integer check (late_cancel_rate_cents is null or late_cancel_rate_cents >= 0),
  no_show_rate_cents integer check (no_show_rate_cents is null or no_show_rate_cents >= 0),
  provider text,
  provider_employee_id text,
  effective_from date not null default current_date,
  notes text,
  active boolean not null default true,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.trainer_compensation_rules enable row level security;
revoke all on public.trainer_compensation_rules from anon, authenticated;
grant select, insert, update on public.trainer_compensation_rules to authenticated;
create policy "owner reads compensation" on public.trainer_compensation_rules for select to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner' and p.deleted_at is null));
create policy "owner writes compensation" on public.trainer_compensation_rules for all to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner' and p.deleted_at is null)) with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner' and p.deleted_at is null));
