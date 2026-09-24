-- Preserve internal client notes in a staff-only table before clearing the client-readable field.
create table public.client_coach_notes (
 client_id uuid primary key references public.clients(id) on delete cascade,
 notes text not null,
 updated_at timestamptz not null default now()
);
alter table public.client_coach_notes enable row level security;
revoke all on public.client_coach_notes from public,anon,authenticated;
grant select,insert,update,delete on public.client_coach_notes to authenticated;
grant all on public.client_coach_notes to service_role;
create policy client_coach_notes_staff on public.client_coach_notes for all to authenticated
using(public.is_trainer()) with check(public.is_trainer());
insert into public.client_coach_notes(client_id,notes)
select id,notes_internal from public.clients where notes_internal is not null;
update public.clients set notes_internal=null where notes_internal is not null;
alter table public.clients add constraint clients_internal_notes_moved check(notes_internal is null);

-- Stage with the atomic session migration. Direct Data API writes must not bypass server rules.
create or replace function public.protect_profile_privileged_fields()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user='service_role' then return new;end if;
 if (new.id is distinct from old.id or new.role is distinct from old.role or new.deleted_at is distinct from old.deleted_at or new.email is distinct from old.email)
 and not public.is_owner() then
   raise exception 'Only an IMS owner may change account identity, email, role or deletion status' using errcode='42501';
 end if;
 return new;
end $$;
drop trigger if exists protect_profile_privileged_fields on public.profiles;
drop trigger if exists protect_profile_privileged_fields_trigger on public.profiles;
create trigger protect_profile_privileged_fields before update on public.profiles for each row execute function public.protect_profile_privileged_fields();

create or replace function public.guard_client_record_updates()
returns trigger language plpgsql security invoker set search_path='' as $$
declare changed text[];
begin
 if current_user='service_role' or public.is_trainer() then return new;end if;
 if auth.uid() is null or old.id is distinct from auth.uid() or not exists(select 1 from public.profiles where id=auth.uid() and deleted_at is null) then
   raise exception 'Active account required' using errcode='42501';
 end if;
 select coalesce(array_agg(k),array[]::text[]) into changed from jsonb_each(to_jsonb(new)) e(k,v) where v is distinct from to_jsonb(old)->k;
 if not changed <@ array['date_of_birth','emergency_contact_name','emergency_contact_phone','emergency_contact_relationship','address_line1','address_line2','city','state','zip','medical_conditions','medications','allergies','injury_history','physician_name','physician_phone','updated_at']::text[] then
   raise exception 'Client billing, staff notes and administrative fields are staff-managed' using errcode='42501';
 end if;
 return new;
end $$;
create trigger guard_client_record_updates before update on public.clients for each row execute function public.guard_client_record_updates();

create or replace function public.guard_message_writes()
returns trigger language plpgsql security invoker set search_path='' as $$
declare changed text[];
begin
 if current_user='service_role' then return new;end if;
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and deleted_at is null) then
   raise exception 'Active account required' using errcode='42501';
 end if;
 if tg_op='INSERT' then
   if new.sender_id is distinct from auth.uid() or new.read_at is not null then raise exception 'Invalid message sender or receipt' using errcode='42501';end if;
   new.created_at:=now();
 else
   select coalesce(array_agg(k),array[]::text[]) into changed from jsonb_each(to_jsonb(new)) e(k,v) where v is distinct from to_jsonb(old)->k;
   if not changed <@ array['read_at']::text[] or old.sender_id=auth.uid() then
     raise exception 'Messages are immutable; only incoming read receipts may be changed' using errcode='42501';
   end if;
   if new.read_at is null then raise exception 'Cannot clear a read receipt' using errcode='42501';end if;
   new.read_at:=coalesce(old.read_at,now());
 end if;
 return new;
end $$;
create trigger guard_message_writes before insert or update on public.messages for each row execute function public.guard_message_writes();

create or replace function public.guard_client_session_updates()
returns trigger language plpgsql security invoker set search_path='' as $$
declare changed text[];
begin
 if current_user='service_role' or public.is_trainer() then return new;end if;
 if auth.uid() is null or old.client_id is distinct from auth.uid() or not exists(select 1 from public.profiles where id=auth.uid() and deleted_at is null) then
   raise exception 'Active account required' using errcode='42501';
 end if;
 select coalesce(array_agg(k),array[]::text[]) into changed from jsonb_each(to_jsonb(new)) e(k,v) where v is distinct from to_jsonb(old)->k;
 if not changed <@ array['client_notes','client_rpe','updated_at']::text[] then
   raise exception 'Use the authorized session action; clients may directly edit only feedback' using errcode='42501';
 end if;
 return new;
end $$;
drop trigger if exists guard_client_session_updates_trigger on public.sessions;
create trigger guard_client_session_updates_trigger before update on public.sessions for each row execute function public.guard_client_session_updates();
revoke all on function public.protect_profile_privileged_fields() from public,anon,authenticated;
revoke all on function public.guard_client_record_updates() from public,anon,authenticated;
revoke all on function public.guard_message_writes() from public,anon,authenticated;
revoke all on function public.guard_client_session_updates() from public,anon,authenticated;
