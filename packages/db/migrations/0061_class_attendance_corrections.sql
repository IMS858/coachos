-- Reasoned attendance corrections are append-audited and owner-only.
create table if not exists public.class_attendance_corrections (
 id uuid primary key,
 enrollment_id uuid not null references public.class_enrollments(id) on delete restrict,
 from_status text not null check(from_status in ('attended','no_show')),
 to_status text not null check(to_status in ('attended','no_show') and to_status<>from_status),
 reason text not null check(char_length(reason) between 10 and 1000),
 corrected_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
create index if not exists class_attendance_corrections_enrollment on public.class_attendance_corrections(enrollment_id,created_at desc);
alter table public.class_attendance_corrections enable row level security;revoke all on public.class_attendance_corrections from anon,authenticated;grant select on public.class_attendance_corrections to authenticated;
create policy "owner reads attendance corrections" on public.class_attendance_corrections for select to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner' and p.deleted_at is null));
-- No correction command or direct write grant is active during prelaunch.
