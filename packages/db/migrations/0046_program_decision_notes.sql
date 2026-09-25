-- Immutable staff coaching decision trail for program changes.
-- These are coach-side records only. They are not client messages or medical diagnoses.
create table if not exists public.program_decision_notes (
  id uuid primary key,
  program_id uuid not null references public.programs(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  category text not null check (category in ('progression','regression','technique','assessment','tolerance','schedule','other')),
  note text not null check (char_length(note) between 10 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists program_decision_notes_program_created on public.program_decision_notes(program_id,created_at desc);
create index if not exists program_decision_notes_client_created on public.program_decision_notes(client_id,created_at desc);
alter table public.program_decision_notes enable row level security;
revoke all on public.program_decision_notes from anon,authenticated;
grant select,insert on public.program_decision_notes to authenticated;

create policy "staff reads scoped program decisions" on public.program_decision_notes
for select to authenticated using (
  exists(
    select 1 from public.profiles me
    where me.id=auth.uid() and me.deleted_at is null and me.role in ('owner','trainer')
  )
  and exists(
    select 1 from public.programs p
    left join public.clients c on c.id=p.client_id
    where p.id=program_decision_notes.program_id
      and p.client_id=program_decision_notes.client_id
      and (
        exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='owner' and me.deleted_at is null)
        or p.trainer_id=auth.uid()
        or c.primary_trainer_id=auth.uid()
      )
  )
);

create policy "staff inserts scoped program decisions" on public.program_decision_notes
for insert to authenticated with check (
  actor_id=auth.uid()
  and exists(
    select 1 from public.profiles me
    where me.id=auth.uid() and me.deleted_at is null and me.role in ('owner','trainer')
  )
  and exists(
    select 1 from public.programs p
    left join public.clients c on c.id=p.client_id
    where p.id=program_decision_notes.program_id
      and p.client_id=program_decision_notes.client_id
      and (
        exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='owner' and me.deleted_at is null)
        or p.trainer_id=auth.uid()
        or c.primary_trainer_id=auth.uid()
      )
  )
);
