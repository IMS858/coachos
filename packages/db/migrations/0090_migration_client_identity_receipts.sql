-- Source-backed identity provisioning, separate from invitations and calendar import.
-- The reservation is NOT an auth account, operational client or approval of appointments.
create table if not exists public.migration_client_identity_receipts (
 record_id uuid primary key references public.migration_records(id),
 batch_id uuid not null references public.migration_batches(id),
 source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$'),
 manifest_sha256 text not null check(manifest_sha256 ~ '^[0-9a-f]{64}$'),
 client_id uuid not null unique default gen_random_uuid(),
 email text not null unique,
 full_name text not null,
 phone text,
 trainer_id uuid not null references public.profiles(id),
 status text not null default 'reserved' check(status in ('reserved','finalized')),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 finalized_at timestamptz,
 check((status='reserved' and finalized_at is null) or (status='finalized' and finalized_at is not null))
);
alter table public.migration_client_identity_receipts enable row level security;
revoke all on public.migration_client_identity_receipts from public,anon,authenticated;
grant select on public.migration_client_identity_receipts to authenticated;
drop policy if exists migration_client_identity_receipts_owner_read on public.migration_client_identity_receipts;
create policy migration_client_identity_receipts_owner_read on public.migration_client_identity_receipts for select to authenticated
using(exists(select 1 from public.profiles where id=auth.uid() and role='owner' and deleted_at is null));

create or replace function public.prepare_migration_client_identity(p_record_id uuid,p_source_hash text,p_manifest_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();r public.migration_records%rowtype;b public.migration_batches%rowtype;q public.migration_client_identity_receipts%rowtype;
 email_value text;name_value text;phone_value text;trainer uuid;trainer_ids uuid[];calendar_ids text[];calendar text;kind text;actual bigint;
 kinds text[]:=array['client','appointment','series','package','membership','transaction'];
begin
 if not exists(select 1 from public.profiles where id=actor and role='owner' and deleted_at is null) then raise exception 'Active owner required' using errcode='42501';end if;
 if p_record_id is null or p_source_hash is null or p_source_hash !~ '^[0-9a-f]{64}$' or p_manifest_sha256 is null or p_manifest_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Valid source and manifest hashes required' using errcode='22023';end if;
 lock table public.migration_records in share row exclusive mode;
 select mb.* into b from public.migration_batches mb join public.migration_records mr on mr.batch_id=mb.id where mr.id=p_record_id for update of mb;
 if not found then raise exception 'Source record not found' using errcode='P0002';end if;
 select * into r from public.migration_records where id=p_record_id for update;
 if r.record_type<>'client' or r.source_hash<>p_source_hash or b.source_manifest_sha256 is distinct from p_manifest_sha256 then raise exception 'Source snapshot changed' using errcode='40001';end if;
 if b.source_system<>'vagaro' or b.status<>'approved' or b.staging_completed_at is null or b.approved_at is null or b.approved_at<b.staging_completed_at
   or not exists(select 1 from public.profiles where id=b.approved_by and role='owner' and deleted_at is null)
   or jsonb_typeof(b.expected_counts) is distinct from 'object' or not(b.expected_counts ?& kinds) then raise exception 'Complete owner-approved source batch required' using errcode='23514';end if;
 foreach kind in array kinds loop
  select count(*) into actual from public.migration_records where batch_id=b.id and record_type=kind;
  if jsonb_typeof(b.expected_counts->kind) is distinct from 'number' or (b.expected_counts->>kind)::numeric<>actual then raise exception 'Source coverage changed' using errcode='40001';end if;
 end loop;
 select * into q from public.migration_client_identity_receipts where record_id=r.id for update;
 if found and (q.source_hash<>r.source_hash or q.manifest_sha256<>p_manifest_sha256) then raise exception 'Reservation belongs to a different source snapshot' using errcode='40001';end if;
 if q.status='finalized' then
  if r.destination_id is distinct from q.client_id or r.reconciliation_status<>'imported' or not exists(select 1 from public.clients c join public.profiles p on p.id=c.id where c.id=q.client_id and p.role='client' and p.deleted_at is null) then raise exception 'Finalized identity changed; explicit review required' using errcode='40001';end if;
  return to_jsonb(q)||jsonb_build_object('ok',true,'deduped',true);
 end if;
 if r.destination_id is not null or r.reconciliation_status not in ('unmatched','needs_review') then raise exception 'Source already mapped or excluded; do not create a second identity' using errcode='40001';end if;
 if exists(select 1 from public.migration_latest_record_reviews rv where rv.record_id=r.id and rv.decision in ('hold','excluded')) then raise exception 'Explicit owner hold or exclusion requires resolution' using errcode='23514';end if;
 email_value:=lower(btrim(r.source_payload#>>'{fields,Email}'));
 name_value:=btrim(r.source_payload#>>'{fields,Source Name}');
 -- Contact fields must be present in source; no dummy address, household merge or guessed repair.
 if email_value is null or email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[a-z]{2,63}$' or char_length(email_value)>254 then raise exception 'A valid unique source email is required; no email was invented' using errcode='22023';end if;
 if name_value is null or char_length(name_value) not between 2 and 200 then raise exception 'Valid source name required' using errcode='22023';end if;
 phone_value:=nullif(regexp_replace(coalesce(substring(r.source_payload#>>'{fields,Phones}' from E'Cell Phone\\n([^\\n]+)'),''),'[^0-9]','','g'),'');
 if phone_value is not null and phone_value !~ '^(1)?[0-9]{10}$' then phone_value:=null;end if;
 if length(phone_value)=11 then phone_value:=substr(phone_value,2);end if;
 if exists(select 1 from public.migration_records x where x.batch_id=b.id and x.record_type='client' and x.id<>r.id and lower(btrim(x.source_payload#>>'{fields,Email}'))=email_value) then raise exception 'Shared source email requires separate identity resolution' using errcode='23514';end if;
 if exists(select 1 from public.profiles p where (q.client_id is null or p.id<>q.client_id) and
    (lower(p.email::text)=email_value or lower(btrim(p.full_name))=lower(name_value) or (phone_value is not null and right(regexp_replace(coalesce(p.phone,''),'[^0-9]','','g'),10)=phone_value)))
    or exists(select 1 from auth.users u where lower(u.email)=email_value and (q.client_id is null or u.id<>q.client_id)) then raise exception 'Existing or shared destination identity requires explicit matching, not merging' using errcode='23514';end if;
 if not exists(select 1 from public.migration_records a where a.batch_id=b.id and a.record_type='appointment' and a.source_parent_id=r.source_id
  and case when (a.source_payload#>>'{fields,Raw date}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (a.source_payload#>>'{fields,Raw date}')::date >= (now() at time zone 'America/Los_Angeles')::date else false end) then
  raise exception 'A current or future source appointment is required; historical contacts are not active clients' using errcode='23514';end if;
 -- Reuse only exact calendar-to-staff mappings already evidenced by imported occurrences.
 select array_agg(distinct a.source_payload#>>'{fields,Calendar ID}') into calendar_ids from public.migration_records a
 where a.batch_id=b.id and a.record_type='appointment' and a.source_parent_id=r.source_id;
 if calendar_ids is null or array_position(calendar_ids,null) is not null then raise exception 'Verified source calendar required for staff assignment' using errcode='23514';end if;
 foreach calendar in array calendar_ids loop
  select array_agg(distinct a.destination_trainer_id) into trainer_ids from public.migration_records a
  join public.sessions s on s.vagaro_event_id=a.source_id and s.client_id=a.destination_id and s.trainer_id=a.destination_trainer_id
  where a.batch_id=b.id and a.record_type='appointment' and a.reconciliation_status='imported' and a.source_payload#>>'{fields,Calendar ID}'=calendar;
  if trainer_ids is null or cardinality(trainer_ids)<>1 or trainer_ids[1] is null or (trainer is not null and trainer<>trainer_ids[1]) then raise exception 'Calendar assignment is missing or ambiguous' using errcode='23514';end if;
  trainer:=trainer_ids[1];
 end loop;
 if not exists(select 1 from public.profiles where id=trainer and role in ('owner','trainer') and deleted_at is null) then raise exception 'Active source-mapped coach required' using errcode='23514';end if;
 if q.record_id is not null then
  if row(q.email,q.full_name,q.phone,q.trainer_id) is distinct from row(email_value,name_value,phone_value,trainer) then raise exception 'Reserved identity inputs changed' using errcode='40001';end if;
  return to_jsonb(q)||jsonb_build_object('ok',true,'deduped',true);
 end if;
 insert into public.migration_client_identity_receipts(record_id,batch_id,source_hash,manifest_sha256,email,full_name,phone,trainer_id,created_by)
 values(r.id,b.id,r.source_hash,p_manifest_sha256,email_value,name_value,phone_value,trainer,actor) returning * into q;
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),actor,'migration.client_identity_reserved','migration_record',r.id,
 jsonb_build_object('batch_id',b.id,'source_hash',r.source_hash,'manifest_sha256',p_manifest_sha256,'reserved_client_id',q.client_id,'trainer_id',trainer,'account_created',false,'invitation_sent',false));
 return to_jsonb(q)||jsonb_build_object('ok',true,'deduped',false);
end $$;
revoke all on function public.prepare_migration_client_identity(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_migration_client_identity(uuid,text,text) to authenticated;

create or replace function public.finalize_migration_client_identity(p_record_id uuid,p_source_hash text,p_manifest_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();receipt jsonb;q public.migration_client_identity_receipts%rowtype;u auth.users%rowtype;p public.profiles%rowtype;
begin
 -- Recheck owner, snapshot, source coverage and identity collisions under the same locks.
 receipt:=public.prepare_migration_client_identity(p_record_id,p_source_hash,p_manifest_sha256);
 select * into q from public.migration_client_identity_receipts where record_id=p_record_id for update;
 if q.status='finalized' then return jsonb_build_object('ok',true,'record_id',q.record_id,'client_id',q.client_id,'status','finalized','deduped',true,'invitation_sent',false);end if;
 select * into u from auth.users where id=q.client_id for share;
 if not found or u.deleted_at is not null or u.banned_until>now() or u.role is distinct from 'authenticated' or u.is_super_admin is true or lower(u.email) is distinct from q.email
  or u.raw_app_meta_data->>'ims_migration_record_id' is distinct from q.record_id::text
  or u.raw_app_meta_data->>'ims_migration_source_hash' is distinct from q.source_hash
  or u.raw_app_meta_data->>'ims_migration_manifest_sha256' is distinct from q.manifest_sha256 then
  raise exception 'A real source-bound Auth identity is required; no account is fabricated' using errcode='23514';
 end if;
 if not exists(select 1 from auth.identities i where i.user_id=q.client_id and i.provider='email' and i.provider_id=q.client_id::text and lower(i.identity_data->>'email')=q.email and i.identity_data->>'sub'=q.client_id::text) then raise exception 'Matching email identity is required' using errcode='23514';end if;
 insert into public.profiles(id,email,full_name,role) values(q.client_id,q.email,q.full_name,'client') on conflict(id) do nothing;
 select * into p from public.profiles where id=q.client_id for update;
 if p.role<>'client' or p.deleted_at is not null or lower(p.email::text)<>q.email or p.full_name<>q.full_name or (p.phone is not null and p.phone is distinct from q.phone) then raise exception 'Existing profile differs from reserved source identity' using errcode='40001';end if;
 if exists(select 1 from public.clients where id=q.client_id) then raise exception 'Client exists without finalization receipt; explicit review required' using errcode='40001';end if;
 update public.profiles set phone=q.phone where id=q.client_id and phone is null and q.phone is not null;
 insert into public.clients(id,status,billing_type,primary_trainer_id,joined_at,last_session_at) values(q.client_id,'active','unset',q.trainer_id,null,null);
 update public.migration_records set destination_id=q.client_id,reconciliation_status='imported',review_note='Owner-verified source identity created without invitation; calendar, balances and billing remain separate.' where id=q.record_id;
 update public.migration_client_identity_receipts set status='finalized',finalized_at=clock_timestamp() where record_id=q.record_id;
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),actor,'migration.client_identity_imported','migration_record',q.record_id,
 jsonb_build_object('batch_id',q.batch_id,'source_hash',q.source_hash,'manifest_sha256',q.manifest_sha256,'client_id',q.client_id,'trainer_id',q.trainer_id,'invitation_sent',false,'billing_created',false));
 return jsonb_build_object('ok',true,'record_id',q.record_id,'client_id',q.client_id,'status','finalized','deduped',false,'invitation_sent',false);
end $$;
revoke all on function public.finalize_migration_client_identity(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.finalize_migration_client_identity(uuid,text,text) to authenticated;
