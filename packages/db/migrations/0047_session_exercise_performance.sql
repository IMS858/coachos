-- Staff-recorded exercise performance for a specific training session.
-- Links planned prescription evidence to what was actually performed without changing the program itself.
create table if not exists public.session_exercise_performance (
  id uuid primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete restrict,
  prescription_key text not null check (char_length(prescription_key) between 1 and 180),
  exercise_id uuid references public.exercises(id) on delete set null,
  exercise_name text not null check (char_length(exercise_name) between 1 and 200),
  prescription_snapshot jsonb not null default '{}'::jsonb,
  sets_completed integer check (sets_completed is null or sets_completed between 0 and 30),
  reps_completed text not null default '' check (char_length(reps_completed) <= 80),
  load_performed text not null default '' check (char_length(load_performed) <= 160),
  rpe_actual numeric(3,1) check (rpe_actual is null or (rpe_actual >= 1 and rpe_actual <= 10)),
  coach_note text not null default '' check (char_length(coach_note) <= 1000),
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id,prescription_key)
);
create index if not exists session_exercise_performance_client on public.session_exercise_performance(client_id,created_at desc);
create index if not exists session_exercise_performance_exercise on public.session_exercise_performance(exercise_id,created_at desc) where exercise_id is not null;
alter table public.session_exercise_performance enable row level security;
revoke all on public.session_exercise_performance from anon,authenticated;
grant select,insert,update on public.session_exercise_performance to authenticated;

create policy "staff reads scoped session performance" on public.session_exercise_performance
for select to authenticated using (
  exists(select 1 from public.profiles me where me.id=auth.uid() and me.deleted_at is null and me.role in ('owner','trainer'))
  and exists(
    select 1 from public.sessions s
    left join public.clients c on c.id=s.client_id
    where s.id=session_exercise_performance.session_id
      and s.client_id=session_exercise_performance.client_id
      and (
        exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='owner' and me.deleted_at is null)
        or s.trainer_id=auth.uid()
        or c.primary_trainer_id=auth.uid()
      )
  )
);

create policy "staff inserts scoped session performance" on public.session_exercise_performance
for insert to authenticated with check (
  recorded_by=auth.uid()
  and exists(select 1 from public.profiles me where me.id=auth.uid() and me.deleted_at is null and me.role in ('owner','trainer'))
  and exists(
    select 1 from public.sessions s
    left join public.clients c on c.id=s.client_id
    where s.id=session_exercise_performance.session_id
      and s.client_id=session_exercise_performance.client_id
      and s.program_id=session_exercise_performance.program_id
      and s.status not in ('cancelled','late_cancelled','no_show')
      and (
        exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='owner' and me.deleted_at is null)
        or s.trainer_id=auth.uid()
        or c.primary_trainer_id=auth.uid()
      )
  )
);

create policy "staff updates scoped session performance" on public.session_exercise_performance
for update to authenticated using (
  exists(select 1 from public.profiles me where me.id=auth.uid() and me.deleted_at is null and me.role in ('owner','trainer'))
  and exists(
    select 1 from public.sessions s
    left join public.clients c on c.id=s.client_id
    where s.id=session_exercise_performance.session_id
      and s.client_id=session_exercise_performance.client_id
      and s.program_id=session_exercise_performance.program_id
      and s.status not in ('cancelled','late_cancelled','no_show')
      and (
        exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='owner' and me.deleted_at is null)
        or s.trainer_id=auth.uid()
        or c.primary_trainer_id=auth.uid()
      )
  )
) with check (
  exists(select 1 from public.profiles me where me.id=auth.uid() and me.deleted_at is null and me.role in ('owner','trainer'))
  and exists(
    select 1 from public.sessions s
    left join public.clients c on c.id=s.client_id
    where s.id=session_exercise_performance.session_id
      and s.client_id=session_exercise_performance.client_id
      and s.program_id=session_exercise_performance.program_id
      and s.status not in ('cancelled','late_cancelled','no_show')
      and (
        exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='owner' and me.deleted_at is null)
        or s.trainer_id=auth.uid()
        or c.primary_trainer_id=auth.uid()
      )
  )
);

create or replace function public.protect_session_exercise_performance_identity() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.id is distinct from old.id
    or new.session_id is distinct from old.session_id
    or new.client_id is distinct from old.client_id
    or new.program_id is distinct from old.program_id
    or new.prescription_key is distinct from old.prescription_key
    or new.exercise_id is distinct from old.exercise_id
    or new.exercise_name is distinct from old.exercise_name
    or new.prescription_snapshot is distinct from old.prescription_snapshot
    or new.recorded_by is distinct from old.recorded_by
    or new.created_at is distinct from old.created_at then
      raise exception 'Session exercise identity and prescription evidence are immutable' using errcode='42501';
  end if;
  new.updated_at=clock_timestamp();
  return new;
end $$;
revoke all on function public.protect_session_exercise_performance_identity() from public,anon,authenticated;
drop trigger if exists protect_session_exercise_performance_identity on public.session_exercise_performance;
create trigger protect_session_exercise_performance_identity
before update on public.session_exercise_performance
for each row execute function public.protect_session_exercise_performance_identity();
