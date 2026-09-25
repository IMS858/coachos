-- Owner-only source-evidence staging for controlled Vagaro reconciliation.
-- This does not create clients, sessions, plans, payments, charges or notifications.
create table if not exists public.migration_batches(
 id uuid primary key default gen_random_uuid(),source_system text not null check(source_system in ('vagaro')),label text not null,source_as_of timestamptz,status text not null default 'draft' check(status in ('draft','review','approved','imported','reconciled','cancelled')),created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),approved_by uuid references public.profiles(id),approved_at timestamptz
);
create table if not exists public.migration_records(
 id uuid primary key default gen_random_uuid(),batch_id uuid not null references public.migration_batches(id) on delete cascade,record_type text not null check(record_type in ('client','appointment','series','package','membership','transaction')),source_id text not null,source_parent_id text,source_payload jsonb not null,source_hash text not null,destination_id uuid,reconciliation_status text not null default 'unmatched' check(reconciliation_status in ('unmatched','matched','needs_review','excluded','ready','imported')),review_note text,created_at timestamptz not null default now(),unique(batch_id,record_type,source_id)
);
create index if not exists migration_records_review on public.migration_records(batch_id,record_type,reconciliation_status);
alter table public.migration_batches enable row level security;alter table public.migration_records enable row level security;
revoke all on public.migration_batches,public.migration_records from public,anon,authenticated;grant select on public.migration_batches,public.migration_records to authenticated;
create policy migration_batches_owner_read on public.migration_batches for select to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner' and p.deleted_at is null));
create policy migration_records_owner_read on public.migration_records for select to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner' and p.deleted_at is null));
-- Writes are server-authorized only. Import into operational tables requires a separate reviewed command.
