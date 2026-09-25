-- Structured programming for group classes.
create table if not exists public.class_programs (
 id uuid primary key default gen_random_uuid(),
 template_id uuid not null references public.class_templates(id) on delete cascade,
 name text not null check(char_length(name) between 2 and 160),
 objective text not null default '' check(char_length(objective)<=1200),
 status text not null default 'draft' check(status in ('draft','approved','retired')),
 version integer not null default 1 check(version>=1),
 created_by uuid not null references public.profiles(id),
 approved_by uuid references public.profiles(id),
 approved_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.class_program_exercises (
 id uuid primary key default gen_random_uuid(),
 class_program_id uuid not null references public.class_programs(id) on delete cascade,
 exercise_id uuid references public.exercises(id) on delete restrict,
 exercise_name text not null check(char_length(exercise_name) between 1 and 200),
 block text not null default 'training' check(char_length(block)<=80),
 position integer not null check(position between 0 and 500),
 sets integer check(sets is null or sets between 1 and 30),
 reps text not null default '' check(char_length(reps)<=80),
 load_prescription text not null default '' check(char_length(load_prescription)<=160),
 rpe numeric(3,1) check(rpe is null or (rpe>=1 and rpe<=10)),
 rest_seconds integer check(rest_seconds is null or rest_seconds between 0 and 1800),
 tempo text not null default '' check(char_length(tempo)<=80),
 coach_cue text not null default '' check(char_length(coach_cue)<=1000),
 created_at timestamptz not null default now(),
 unique(class_program_id,position)
);
alter table public.class_occurrences add column if not exists class_program_id uuid references public.class_programs(id) on delete set null;
alter table public.class_programs enable row level security;alter table public.class_program_exercises enable row level security;
revoke all on public.class_programs,public.class_program_exercises from anon,authenticated;grant select on public.class_programs,public.class_program_exercises to authenticated;
create policy "staff reads class programs" on public.class_programs for select to authenticated using(exists(select 1 from public.profiles me where me.id=auth.uid() and me.deleted_at is null and me.role in ('owner','trainer')));
create policy "staff reads class program exercises" on public.class_program_exercises for select to authenticated using(exists(select 1 from public.profiles me where me.id=auth.uid() and me.deleted_at is null and me.role in ('owner','trainer')));
-- Client class booking does not expose class programming. Class programming is coach delivery IP.
