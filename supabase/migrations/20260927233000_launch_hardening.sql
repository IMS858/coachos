-- Launch hardening after interactive owner QA.
-- Reconciles hosted authorization, direct-write guards and schema contracts.

create table if not exists public.client_coach_notes (
 client_id uuid primary key references public.clients(id) on delete cascade,
 notes text not null,
 updated_at timestamptz not null default now()
);
alter table public.client_coach_notes enable row level security;
revoke all on public.client_coach_notes from public,anon,authenticated;
grant select,insert,update,delete on public.client_coach_notes to authenticated;
grant all on public.client_coach_notes to service_role;
drop policy if exists client_coach_notes_staff on public.client_coach_notes;
create policy client_coach_notes_staff on public.client_coach_notes for all to authenticated
using (
 public.is_owner() or exists (
   select 1 from public.clients c
   where c.id=client_coach_notes.client_id and c.primary_trainer_id=(select auth.uid())
 )
)
with check (
 public.is_owner() or exists (
   select 1 from public.clients c
   where c.id=client_coach_notes.client_id and c.primary_trainer_id=(select auth.uid())
 )
);

insert into public.client_coach_notes(client_id,notes)
select id,notes_internal from public.clients where notes_internal is not null
on conflict (client_id) do update set notes=excluded.notes,updated_at=now();
update public.clients set notes_internal=null where notes_internal is not null;
alter table public.clients drop constraint if exists clients_internal_notes_moved;
alter table public.clients add constraint clients_internal_notes_moved check(notes_internal is null);

create or replace function public.guard_client_record_updates()
returns trigger language plpgsql security invoker set search_path='' as $$
declare changed text[];
begin
 if current_user in ('postgres','service_role') or public.is_owner() then return new; end if;
 if public.is_trainer() then
   if old.primary_trainer_id is distinct from auth.uid() then
     raise exception 'Assigned coach or owner required' using errcode='42501';
   end if;
   if new.id is distinct from old.id or new.primary_trainer_id is distinct from old.primary_trainer_id
      or new.billing_type is distinct from old.billing_type or new.status is distinct from old.status then
     raise exception 'Owner required for client identity, assignment, billing type or status changes' using errcode='42501';
   end if;
   return new;
 end if;
 if auth.uid() is null or old.id is distinct from auth.uid()
    or not exists(select 1 from public.profiles where id=auth.uid() and deleted_at is null) then
   raise exception 'Active account required' using errcode='42501';
 end if;
 select coalesce(array_agg(k),array[]::text[]) into changed
 from jsonb_each(to_jsonb(new)) e(k,v) where v is distinct from to_jsonb(old)->k;
 if not changed <@ array[
   'date_of_birth','emergency_contact_name','emergency_contact_phone','emergency_contact_relationship',
   'address_line1','address_line2','city','state','zip','medical_conditions','medications','allergies',
   'injury_history','physician_name','physician_phone','updated_at'
 ]::text[] then
   raise exception 'Client billing, assignment and administrative fields are staff-managed' using errcode='42501';
 end if;
 return new;
end $$;
drop trigger if exists guard_client_record_updates on public.clients;
create trigger guard_client_record_updates before update on public.clients
for each row execute function public.guard_client_record_updates();

create or replace function public.guard_message_writes()
returns trigger language plpgsql security invoker set search_path='' as $$
declare changed text[];
begin
 if current_user in ('postgres','service_role') then return new; end if;
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and deleted_at is null) then
   raise exception 'Active account required' using errcode='42501';
 end if;
 if tg_op='INSERT' then
   if new.sender_id is distinct from auth.uid() or new.read_at is not null then
     raise exception 'Invalid message sender or receipt' using errcode='42501';
   end if;
   if not (
     new.client_id=auth.uid()
     or public.is_owner()
     or exists(select 1 from public.clients c where c.id=new.client_id and c.primary_trainer_id=auth.uid())
   ) then
     raise exception 'Assigned coach, client or owner required' using errcode='42501';
   end if;
   new.created_at:=now();
 else
   select coalesce(array_agg(k),array[]::text[]) into changed
   from jsonb_each(to_jsonb(new)) e(k,v) where v is distinct from to_jsonb(old)->k;
   if not changed <@ array['read_at']::text[] or old.sender_id=auth.uid() then
     raise exception 'Messages are immutable; only incoming read receipts may be changed' using errcode='42501';
   end if;
   if new.read_at is null then raise exception 'Cannot clear a read receipt' using errcode='42501'; end if;
   new.read_at:=coalesce(old.read_at,now());
 end if;
 return new;
end $$;
drop trigger if exists guard_message_writes on public.messages;
create trigger guard_message_writes before insert or update on public.messages
for each row execute function public.guard_message_writes();

drop trigger if exists protect_profile_privileged_fields on public.profiles;
drop trigger if exists protect_profile_privileged_fields_trigger on public.profiles;
create trigger protect_profile_privileged_fields before update on public.profiles
for each row execute function public.protect_profile_privileged_fields();

drop policy if exists clients_trainer_read on public.clients;
drop policy if exists clients_trainer_update on public.clients;
create policy clients_trainer_read on public.clients for select to authenticated
using (public.is_owner() or (public.is_trainer() and primary_trainer_id=(select auth.uid())));
create policy clients_trainer_update on public.clients for update to authenticated
using (public.is_owner() or (public.is_trainer() and primary_trainer_id=(select auth.uid())))
with check (public.is_owner() or (public.is_trainer() and primary_trainer_id=(select auth.uid())));

drop policy if exists plans_trainer_all on public.plans;
create policy plans_trainer_all on public.plans for all to authenticated
using (
 public.is_owner() or (
   public.is_trainer() and exists (
     select 1 from public.clients c where c.id=plans.client_id and c.primary_trainer_id=(select auth.uid())
   )
 )
)
with check (
 public.is_owner() or (
   public.is_trainer() and exists (
     select 1 from public.clients c where c.id=plans.client_id and c.primary_trainer_id=(select auth.uid())
   )
 )
);

drop policy if exists sessions_trainer_all on public.sessions;
create policy sessions_trainer_all on public.sessions for all to authenticated
using (
 public.is_owner() or (
   public.is_trainer() and (
     trainer_id=(select auth.uid())
     or exists(select 1 from public.clients c where c.id=sessions.client_id and c.primary_trainer_id=(select auth.uid()))
   )
 )
)
with check (
 public.is_owner() or (
   public.is_trainer() and (
     trainer_id=(select auth.uid())
     or exists(select 1 from public.clients c where c.id=sessions.client_id and c.primary_trainer_id=(select auth.uid()))
   )
 )
);

drop policy if exists programs_staff_all on public.programs;
drop policy if exists programs_assigned_staff_all on public.programs;
create policy programs_assigned_staff_all on public.programs for all to authenticated
using (
 public.is_owner() or (
   public.is_trainer() and (
     trainer_id=(select auth.uid())
     or exists(select 1 from public.clients c where c.id=programs.client_id and c.primary_trainer_id=(select auth.uid()))
   )
 )
)
with check (
 public.is_owner() or (
   public.is_trainer() and (
     trainer_id=(select auth.uid())
     or exists(select 1 from public.clients c where c.id=programs.client_id and c.primary_trainer_id=(select auth.uid()))
   )
 )
);

drop policy if exists messages_staff_all on public.messages;
create policy messages_staff_all on public.messages for all to authenticated
using (
 public.is_owner() or (
   public.is_trainer() and exists(select 1 from public.clients c where c.id=messages.client_id and c.primary_trainer_id=(select auth.uid()))
 )
)
with check (
 public.is_owner() or (
   public.is_trainer() and exists(select 1 from public.clients c where c.id=messages.client_id and c.primary_trainer_id=(select auth.uid()))
 )
);

revoke all on function public.increment_session_counter(uuid,public.service_type) from public,anon,authenticated;
revoke all on function public.decrement_session_counter(uuid) from public,anon,authenticated;
revoke all on function public.guard_client_record_updates() from public,anon,authenticated;
revoke all on function public.guard_message_writes() from public,anon,authenticated;

create table if not exists public.trainer_availability_rules (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time < end_time)
);
create unique index if not exists trainer_availability_rule_unique
on public.trainer_availability_rules(trainer_id,weekday,start_time,end_time);

create table if not exists public.trainer_time_blocks (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at)
);
create index if not exists trainer_time_blocks_lookup
on public.trainer_time_blocks(trainer_id,starts_at,ends_at);
alter table public.trainer_availability_rules enable row level security;
alter table public.trainer_time_blocks enable row level security;
drop policy if exists trainer_availability_staff on public.trainer_availability_rules;
create policy trainer_availability_staff on public.trainer_availability_rules for all to authenticated
using (public.is_owner() or trainer_id=(select auth.uid()))
with check (public.is_owner() or trainer_id=(select auth.uid()));
drop policy if exists trainer_time_blocks_staff on public.trainer_time_blocks;
create policy trainer_time_blocks_staff on public.trainer_time_blocks for all to authenticated
using (public.is_owner() or trainer_id=(select auth.uid()))
with check (public.is_owner() or trainer_id=(select auth.uid()));
revoke all on public.trainer_availability_rules,public.trainer_time_blocks from anon;
grant select,insert,update,delete on public.trainer_availability_rules,public.trainer_time_blocks to authenticated;

create or replace view public.exercises_with_favorite
with (security_invoker=true) as
select e.*,
       exists(
         select 1 from public.exercise_favorites f
         where f.exercise_id=e.id and f.trainer_id=(select auth.uid())
       ) as is_favorite
from public.exercises e;
revoke all on public.exercises_with_favorite from anon;
grant select on public.exercises_with_favorite to authenticated;

drop policy if exists programs_self_read on public.programs;
create policy programs_self_read on public.programs for select to authenticated
using (
 client_id=(select auth.uid())
 and status in ('published','active','completed')
 and (
   nullif(pdf_client_url,'') is not null
   or (data ? 'structured_program' and jsonb_typeof(data->'structured_program') in ('object','array'))
   or (jsonb_typeof(data->'weekly_structure')='array' and jsonb_array_length(data->'weekly_structure')>0)
   or exists(select 1 from public.program_exercises pe where pe.program_id=programs.id)
 )
);
