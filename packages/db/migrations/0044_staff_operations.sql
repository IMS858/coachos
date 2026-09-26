-- Owner-managed staff operating state, separate from authentication role and compensation.
create table if not exists public.staff_operations (
  staff_id uuid primary key references public.profiles(id) on delete cascade,
  staff_status text not null default 'active' check (staff_status in ('active','onboarding','leave','inactive')),
  operational_owner text,
  responsibilities text[] not null default '{}',
  notes text,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.staff_operations enable row level security;
revoke all on public.staff_operations from anon, authenticated;
grant select, insert, update on public.staff_operations to authenticated;
create policy "owner reads staff operations" on public.staff_operations for select to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner' and p.deleted_at is null));
create policy "owner writes staff operations" on public.staff_operations for all to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner' and p.deleted_at is null)) with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner' and p.deleted_at is null));
