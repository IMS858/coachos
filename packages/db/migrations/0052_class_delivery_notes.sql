-- Per-occurrence class delivery notes. Keeps class plan separate from what the coach actually delivered.
create table if not exists public.class_delivery_notes (
 id uuid primary key,
 occurrence_id uuid not null references public.class_occurrences(id) on delete cascade,
 class_program_id uuid references public.class_programs(id) on delete set null,
 coach_id uuid not null references public.profiles(id),
 note text not null check(char_length(note) between 10 and 3000),
 created_at timestamptz not null default now()
);
create index if not exists class_delivery_notes_occurrence on public.class_delivery_notes(occurrence_id,created_at desc);
alter table public.class_delivery_notes enable row level security;
revoke all on public.class_delivery_notes from anon,authenticated;grant select,insert on public.class_delivery_notes to authenticated;
create policy "staff reads class delivery notes" on public.class_delivery_notes for select to authenticated using(exists(select 1 from public.profiles me where me.id=auth.uid() and me.deleted_at is null and me.role in ('owner','trainer')));
create policy "assigned coach records class delivery" on public.class_delivery_notes for insert to authenticated with check(coach_id=auth.uid() and exists(select 1 from public.class_occurrences o where o.id=occurrence_id and (o.trainer_id=auth.uid() or exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='owner' and me.deleted_at is null))));
