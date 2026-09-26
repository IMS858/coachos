-- Immutable class credit ledger. This migration creates accounting evidence but does not activate automatic consumption.
create table if not exists public.class_credit_ledger (
 id uuid primary key,
 access_id uuid not null references public.client_class_access(id) on delete restrict,
 client_id uuid not null references public.clients(id) on delete cascade,
 enrollment_id uuid references public.class_enrollments(id) on delete restrict,
 delta integer not null check(delta<>0 and abs(delta)<=200),
 reason text not null check(reason in ('grant','attendance','refund','adjustment','migration')),
 source_reference text,
 recorded_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
create unique index if not exists class_credit_ledger_enrollment_attendance on public.class_credit_ledger(enrollment_id) where enrollment_id is not null and reason='attendance';
create index if not exists class_credit_ledger_access on public.class_credit_ledger(access_id,created_at);
alter table public.class_credit_ledger enable row level security;
revoke all on public.class_credit_ledger from anon,authenticated;
grant select on public.class_credit_ledger to authenticated;
create policy "staff reads class credit ledger" on public.class_credit_ledger for select to authenticated using(exists(select 1 from public.profiles me where me.id=auth.uid() and me.deleted_at is null and me.role in ('owner','trainer')));
create policy "clients read own class credit ledger" on public.class_credit_ledger for select to authenticated using(client_id=auth.uid());

-- No authenticated INSERT/UPDATE/DELETE grant is provided. Future entitlement commands must transact ledger + balance + attendance together.
