-- Read-only catalog inspection 2026-09-24: relevant live policies/helper semantics.
-- This is a focused synthetic fixture, not a full production backup.
alter table public.profiles add column email text;
alter table public.profiles add column full_name text;
alter table public.profiles add column phone text;
alter table public.clients add column notes_internal text;
alter table public.clients add column primary_trainer_id uuid;
alter table public.clients add column emergency_contact_name text;
alter table public.sessions add column client_notes text;
alter table public.sessions add column client_rpe integer;
create table public.messages(id uuid primary key default gen_random_uuid(),client_id uuid not null,sender_id uuid not null,body text not null,created_at timestamptz default now(),read_at timestamptz);
-- Existing production role helpers use definer scope to avoid profiles-policy recursion.
create or replace function public.is_trainer() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and role in ('owner','trainer') and deleted_at is null)$$;
create function public.is_owner() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and role='owner' and deleted_at is null)$$;
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.messages enable row level security;
grant select,insert,update,delete on public.profiles,public.clients,public.messages to authenticated;
grant all on public.profiles,public.messages to service_role;
create policy profiles_owner_all on public.profiles for all to authenticated using(public.is_owner());
create policy profiles_self_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_trainer());
create policy profiles_self_update on public.profiles for update to authenticated using(id=auth.uid() or public.is_owner());
create policy clients_owner_all on public.clients for all to authenticated using(public.is_owner());
create policy clients_self_read on public.clients for select to authenticated using(id=auth.uid());
create policy clients_self_update on public.clients for update to authenticated using(id=auth.uid());
create policy clients_trainer_read on public.clients for select to authenticated using(public.is_trainer());
create policy clients_trainer_update on public.clients for update to authenticated using(public.is_trainer());
create policy messages_client_read on public.messages for select to authenticated using(client_id=auth.uid());
create policy messages_client_send on public.messages for insert to authenticated with check(client_id=auth.uid() and sender_id=auth.uid());
create policy messages_client_mark_read on public.messages for update to authenticated using(client_id=auth.uid()) with check(client_id=auth.uid());
create policy messages_staff_all on public.messages for all to authenticated using(public.is_trainer()) with check(public.is_trainer());
create policy sessions_self_read on public.sessions for select to authenticated using(client_id=auth.uid());
create policy sessions_client_feedback_or_cancel on public.sessions for update to authenticated using(client_id=auth.uid()) with check(client_id=auth.uid());
create policy plans_self_read on public.plans for select to authenticated using(client_id=auth.uid());
