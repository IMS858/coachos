-- Staff availability and blocked-time foundation for conflict-aware booking.
create table if not exists public.trainer_availability_rules (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time < end_time)
);
create unique index if not exists trainer_availability_rule_unique on public.trainer_availability_rules(trainer_id,weekday,start_time,end_time);

create table if not exists public.trainer_time_blocks (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at)
);
create index if not exists trainer_time_blocks_lookup on public.trainer_time_blocks(trainer_id,starts_at,ends_at);

alter table public.trainer_availability_rules enable row level security;
alter table public.trainer_time_blocks enable row level security;
drop policy if exists trainer_availability_staff on public.trainer_availability_rules;
create policy trainer_availability_staff on public.trainer_availability_rules for all to authenticated using (public.is_owner() or public.is_trainer()) with check (public.is_owner() or public.is_trainer());
drop policy if exists trainer_time_blocks_staff on public.trainer_time_blocks;
create policy trainer_time_blocks_staff on public.trainer_time_blocks for all to authenticated using (public.is_owner() or public.is_trainer()) with check (public.is_owner() or public.is_trainer());
revoke all on public.trainer_availability_rules, public.trainer_time_blocks from anon;
grant select,insert,update,delete on public.trainer_availability_rules, public.trainer_time_blocks to authenticated;
