-- Close nested-table and soft-deleted-account paths found after launch QA.
-- No source records, operational rows, approvals or package counters are changed.
create schema if not exists ims_private;
revoke all on schema ims_private from public, anon;
grant usage on schema ims_private to authenticated;

-- These narrow boolean lookups run with a fixed path to avoid profiles/client RLS
-- recursion. They never accept an actor ID or return a client/profile payload.
create or replace function ims_private.active_account()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.deleted_at is null);
$$;
create or replace function ims_private.client_access(p_client_id uuid, p_allow_self boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.deleted_at is null and (
      p.role = 'owner'
      or (p.role = 'trainer' and exists(select 1 from public.clients c
          where c.id = p_client_id and c.primary_trainer_id = p.id))
      or (p_allow_self and p.role = 'client' and p.id = p_client_id)
    ));
$$;
create or replace function ims_private.program_staff_access(p_program_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles actor
    where actor.id = (select auth.uid()) and actor.deleted_at is null
      and actor.role in ('owner','trainer') and exists (
        select 1 from public.programs p join public.clients c on c.id = p.client_id
        where p.id = p_program_id
          and (actor.role = 'owner' or c.primary_trainer_id = actor.id)
      ));
$$;
revoke all on function ims_private.active_account() from public, anon, authenticated;
revoke all on function ims_private.client_access(uuid,boolean) from public, anon, authenticated;
revoke all on function ims_private.program_staff_access(uuid) from public, anon, authenticated;
grant execute on function ims_private.active_account() to authenticated;
grant execute on function ims_private.client_access(uuid,boolean) to authenticated;
grant execute on function ims_private.program_staff_access(uuid) to authenticated;

-- Restrictive policies also constrain any permissive legacy policy still present.
-- Existing publication, immutable-field and client self-service guards remain.
drop policy if exists clients_active_scope_guard on public.clients;
create policy clients_active_scope_guard on public.clients as restrictive for all to authenticated
using (ims_private.client_access(id,true)) with check (ims_private.client_access(id,true));
drop policy if exists plans_active_scope_guard on public.plans;
create policy plans_active_scope_guard on public.plans as restrictive for all to authenticated
using (ims_private.client_access(client_id,true)) with check (ims_private.client_access(client_id,false));
drop policy if exists programs_active_scope_guard on public.programs;
create policy programs_active_scope_guard on public.programs as restrictive for all to authenticated
using (ims_private.client_access(client_id,true)) with check (ims_private.client_access(client_id,false));
drop policy if exists messages_active_scope_guard on public.messages;
create policy messages_active_scope_guard on public.messages as restrictive for all to authenticated
using (ims_private.client_access(client_id,true)) with check (ims_private.client_access(client_id,true));
drop policy if exists sessions_active_account_guard on public.sessions;
create policy sessions_active_account_guard on public.sessions as restrictive for all to authenticated
using (ims_private.active_account()) with check (ims_private.active_account());

-- The old child-table policy allowed every trainer to read/change every workout.
-- Do not introduce new client visibility or bypass exercise publication checks.
-- The private lookup avoids a programs <-> program_exercises policy recursion.
alter table public.program_exercises enable row level security;
drop policy if exists program_exercises_trainer on public.program_exercises;
drop policy if exists program_exercises_scoped_staff on public.program_exercises;
create policy program_exercises_scoped_staff on public.program_exercises for all to authenticated
using (ims_private.program_staff_access(program_id))
with check (ims_private.program_staff_access(program_id));
drop policy if exists program_exercises_scope_guard on public.program_exercises;
create policy program_exercises_scope_guard on public.program_exercises as restrictive for all to authenticated
using (ims_private.program_staff_access(program_id))
with check (ims_private.program_staff_access(program_id));

-- RLS does not govern TRUNCATE. Ordinary app users do not need table-level DDL
-- privileges; communication history also must not be deleted through the Data API.
revoke truncate, references, trigger on public.clients, public.plans, public.sessions,
  public.programs, public.program_exercises, public.messages from public, anon, authenticated;
revoke delete on public.messages from public, anon, authenticated;
