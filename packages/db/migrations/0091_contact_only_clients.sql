-- Coaching clients may exist before portal accounts. Existing logins retain
-- their exact same-ID foreign key and deletion behavior. No Auth rows are written.
alter table public.profiles add column if not exists contact_only boolean not null default false;
alter table public.profiles add column if not exists auth_user_id uuid
 generated always as (case when contact_only then null::uuid else id end) stored;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_auth_user_id_fkey') then
  alter table public.profiles add constraint profiles_auth_user_id_fkey foreign key(auth_user_id) references auth.users(id) on delete cascade;
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_contact_only_client') then
  alter table public.profiles add constraint profiles_contact_only_client check(not contact_only or role::text='client');
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_portal_email_required') then
  alter table public.profiles add constraint profiles_portal_email_required check(contact_only or email is not null);
 end if;
end $$;
alter table public.profiles alter column email drop not null;
-- The replacement FK is validated before removing the old unconditional one.
alter table public.profiles drop constraint if exists profiles_id_fkey;

create or replace function public.guard_profile_contact_boundary()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.id is distinct from old.id then raise exception 'Profile identity is immutable' using errcode='42501';end if;
  if new.contact_only is distinct from old.contact_only then
   -- Never detach an existing login. Activation needs trusted, same-ID Auth setup.
   if not old.contact_only or current_user not in ('postgres','service_role') then
    raise exception 'Portal activation requires separate trusted account setup' using errcode='42501';
   end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_profile_contact_boundary() from public,anon,authenticated;
drop trigger if exists guard_profile_contact_boundary on public.profiles;
create trigger guard_profile_contact_boundary before update on public.profiles
for each row execute function public.guard_profile_contact_boundary();

create table if not exists public.migration_contact_client_receipts (
 record_id uuid primary key references public.migration_records(id),
 batch_id uuid not null references public.migration_batches(id),
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 manifest_sha256 text not null check(manifest_sha256 ~ '^[a-f0-9]{64}$'),
 client_id uuid not null unique references public.clients(id),
 trainer_id uuid not null references public.profiles(id),
 confirmed_separate_person boolean not null check(confirmed_separate_person),
 reason text not null check(char_length(reason) between 20 and 1000),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
alter table public.migration_contact_client_receipts enable row level security;
revoke all on public.migration_contact_client_receipts from public,anon,authenticated;
grant select on public.migration_contact_client_receipts to authenticated;
drop policy if exists migration_contact_client_receipts_owner_read on public.migration_contact_client_receipts;
create policy migration_contact_client_receipts_owner_read on public.migration_contact_client_receipts
for select to authenticated using(public.is_owner());

create or replace function public.import_migration_contact_client(
 p_record_id uuid,p_source_hash text,p_manifest_sha256 text,p_separate_person_confirmed boolean,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid();r public.migration_records%rowtype;b public.migration_batches%rowtype;
 q public.migration_contact_client_receipts%rowtype;client uuid;trainer uuid;
 name_value text;phone_value text;calendar_ids text[];trainer_ids uuid[];calendar text;kind text;actual bigint;
 kinds text[]:=array['client','appointment','series','package','membership','transaction'];
begin
 if not exists(select 1 from public.profiles where id=actor and role='owner' and deleted_at is null and not contact_only) then
  raise exception 'Active owner required' using errcode='42501';
 end if;
 if p_record_id is null or p_source_hash is null or p_source_hash !~ '^[a-f0-9]{64}$'
  or p_manifest_sha256 is null or p_manifest_sha256 !~ '^[a-f0-9]{64}$'
  or p_separate_person_confirmed is distinct from true or p_reason is null or char_length(btrim(p_reason)) not between 20 and 1000 then
  raise exception 'Source snapshot and explicit separate-person confirmation required' using errcode='22023';
 end if;
 lock table public.migration_records in share row exclusive mode;
 select mb.* into b from public.migration_batches mb join public.migration_records mr on mr.batch_id=mb.id where mr.id=p_record_id for update of mb;
 if not found then raise exception 'Source record not found' using errcode='P0002';end if;
 select * into r from public.migration_records where id=p_record_id for update;
 if r.record_type<>'client' or r.source_hash is distinct from p_source_hash or b.source_manifest_sha256 is distinct from p_manifest_sha256 then
  raise exception 'Source snapshot changed' using errcode='40001';
 end if;
 if b.source_system<>'vagaro' or b.status<>'approved' or b.staging_completed_at is null or b.approved_at is null
  or b.approved_at<b.staging_completed_at or b.approved_at>now()
  or not exists(select 1 from public.profiles where id=b.approved_by and role='owner' and deleted_at is null)
  or jsonb_typeof(b.expected_counts) is distinct from 'object' or not(b.expected_counts ?& kinds)
  or exists(select 1 from jsonb_object_keys(b.expected_counts) k where not(k=any(kinds))) then
  raise exception 'Complete owner-approved source batch required' using errcode='23514';
 end if;
 foreach kind in array kinds loop
  select count(*) into actual from public.migration_records where batch_id=b.id and record_type=kind;
  if jsonb_typeof(b.expected_counts->kind) is distinct from 'number' or (b.expected_counts->>kind)::numeric<>actual then
   raise exception 'Source coverage changed' using errcode='40001';
  end if;
 end loop;
 select * into q from public.migration_contact_client_receipts where record_id=r.id;
 if found then
  if q.source_hash is distinct from p_source_hash or q.manifest_sha256 is distinct from p_manifest_sha256
   or r.destination_id is distinct from q.client_id or r.reconciliation_status<>'imported'
   or not exists(select 1 from public.clients c join public.profiles p on p.id=c.id where c.id=q.client_id and p.role='client' and p.deleted_at is null) then
   raise exception 'Source identity receipt changed; explicit correction required' using errcode='40001';
  end if;
  return jsonb_build_object('ok',true,'client_id',q.client_id,'record_id',q.record_id,'deduped',true,'account_created',false,'invitation_sent',false);
 end if;
 if r.destination_id is not null or r.reconciliation_status not in ('unmatched','needs_review')
  or exists(select 1 from public.migration_client_identity_receipts where record_id=r.id) then
  raise exception 'Existing mapping or portal reservation must not be duplicated' using errcode='40001';
 end if;
 if exists(select 1 from public.migration_latest_record_reviews rv where rv.record_id=r.id and rv.decision in ('hold','excluded')) then
  raise exception 'Resolve the explicit owner hold or exclusion first' using errcode='23514';
 end if;
 name_value:=btrim(r.source_payload#>>'{fields,Source Name}');
 if name_value is null or char_length(name_value) not between 2 and 200 then raise exception 'Valid source name required' using errcode='22023';end if;
 -- Shared contact details do not identify a person. Email is deferred, never guessed.
 -- An identical existing full name remains ambiguous and is not duplicated.
 if exists(select 1 from public.profiles where lower(btrim(full_name))=lower(name_value)) then
  raise exception 'Same-name profile already exists; use explicit identity reconciliation' using errcode='23514';
 end if;
 phone_value:=nullif(regexp_replace(coalesce(substring(r.source_payload#>>'{fields,Phones}' from E'Cell Phone\\n([^\\n]+)'),''),'[^0-9]','','g'),'');
 if phone_value is not null and phone_value !~ '^(1)?[0-9]{10}$' then phone_value:=null;end if;
 if length(phone_value)=11 then phone_value:=substr(phone_value,2);end if;
 if not exists(select 1 from public.migration_records a where a.batch_id=b.id and a.record_type='appointment' and a.source_parent_id=r.source_id
  and case when a.source_payload#>>'{fields,Raw date}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (a.source_payload#>>'{fields,Raw date}')::date >= (now() at time zone 'America/Los_Angeles')::date else false end) then
  raise exception 'Current or future source appointment required; historical contacts are not activated' using errcode='23514';
 end if;
 select array_agg(distinct a.source_payload#>>'{fields,Calendar ID}') into calendar_ids from public.migration_records a
 where a.batch_id=b.id and a.record_type='appointment' and a.source_parent_id=r.source_id;
 if calendar_ids is null or array_position(calendar_ids,null) is not null then raise exception 'Verified calendar identity required' using errcode='23514';end if;
 foreach calendar in array calendar_ids loop
  select array_agg(distinct a.destination_trainer_id) into trainer_ids from public.migration_records a
  join public.sessions s on s.vagaro_event_id=a.source_id and s.client_id=a.destination_id and s.trainer_id=a.destination_trainer_id
  where a.batch_id=b.id and a.record_type='appointment' and a.reconciliation_status='imported' and a.source_payload#>>'{fields,Calendar ID}'=calendar;
  if trainer_ids is null or cardinality(trainer_ids)<>1 or trainer_ids[1] is null or (trainer is not null and trainer<>trainer_ids[1]) then
   raise exception 'Calendar-to-coach mapping missing or ambiguous' using errcode='23514';
  end if;
  trainer:=trainer_ids[1];
 end loop;
 if not exists(select 1 from public.profiles where id=trainer and role in ('owner','trainer') and deleted_at is null and not contact_only) then
  raise exception 'Active source-mapped coach required' using errcode='23514';
 end if;
 client:=gen_random_uuid();
 insert into public.profiles(id,email,full_name,phone,role,contact_only) values(client,null,name_value,phone_value,'client',true);
 insert into public.clients(id,status,billing_type,primary_trainer_id,joined_at,last_session_at) values(client,'active','unset',trainer,null,null);
 insert into public.migration_contact_client_receipts(record_id,batch_id,source_hash,manifest_sha256,client_id,trainer_id,confirmed_separate_person,reason,created_by)
 values(r.id,b.id,r.source_hash,p_manifest_sha256,client,trainer,true,btrim(p_reason),actor);
 update public.migration_records set destination_id=client,reconciliation_status='imported',
 review_note='Owner-verified separate client record. Email deferred; no portal account or invitation. Original contact evidence retained in source.' where id=r.id;
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),actor,'migration.contact_client_imported','migration_record',r.id,
 jsonb_build_object('batch_id',b.id,'source_id',r.source_id,'source_hash',r.source_hash,'manifest_sha256',p_manifest_sha256,
 'client_id',client,'trainer_id',trainer,'email_deferred',true,'separate_person_confirmed',true,'reason',btrim(p_reason),
 'account_created',false,'invitation_sent',false,'billing_created',false,'execution_session_user',session_user));
 return jsonb_build_object('ok',true,'client_id',client,'record_id',r.id,'deduped',false,'account_created',false,'invitation_sent',false);
end $$;
revoke all on function public.import_migration_contact_client(uuid,text,text,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.import_migration_contact_client(uuid,text,text,boolean,text) to authenticated;
