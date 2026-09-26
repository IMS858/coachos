-- Staged rollout: owner review proposals only. No operational import or payment action.
-- Rehearse against 0070 source staging before hosted rollout; leave original source rows unchanged.
create table public.migration_record_reviews (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique,
 record_id uuid not null references public.migration_records(id) on delete restrict,
 revision integer not null check (revision between 1 and 1000001),
 source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
 record_type text not null check (record_type in ('client','appointment','package')),
 decision text not null check (decision in ('hold','reviewed','excluded')),
 proposal jsonb not null check (jsonb_typeof(proposal)='object'),
 reason text not null check (char_length(btrim(reason)) between 10 and 2000),
 owner_confirmed boolean not null,
 reviewed_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp(),
 unique(record_id,revision),
 check (decision='hold' or owner_confirmed)
);
alter table public.migration_record_reviews enable row level security;
revoke all on public.migration_record_reviews from public,anon,authenticated,service_role;
grant select on public.migration_record_reviews to authenticated;
create policy migration_review_owner_read on public.migration_record_reviews for select to authenticated
 using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner' and p.deleted_at is null));

create function public.protect_migration_review_history() returns trigger
 language plpgsql set search_path='' as $$
begin raise exception 'Migration review history is append-only; save a new revision' using errcode='42501'; end $$;
revoke all on function public.protect_migration_review_history() from public,anon,authenticated,service_role;
create trigger migration_reviews_immutable before update or delete on public.migration_record_reviews
 for each row execute function public.protect_migration_review_history();
create trigger migration_reviews_no_truncate before truncate on public.migration_record_reviews
 for each statement execute function public.protect_migration_review_history();

create view public.migration_latest_record_reviews with (security_invoker=true) as
 select distinct on (record_id) * from public.migration_record_reviews order by record_id,revision desc;
revoke all on public.migration_latest_record_reviews from public,anon,authenticated,service_role;
grant select on public.migration_latest_record_reviews to authenticated;

create function public.review_migration_record(p_record_id uuid,p_review jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); r public.migration_records%rowtype; previous public.migration_record_reviews%rowtype;
 saved public.migration_record_reviews%rowtype; batch_status text; req uuid; expected integer; current_revision integer;
 proposed jsonb; reason_text text; decision_text text; confirmed boolean; keys text[]; k text;
 client uuid; trainer uuid; starts timestamptz; opening_date date; duration integer;
begin
 if actor is null or not exists(select 1 from public.profiles p where p.id=actor and p.role='owner' and p.deleted_at is null) then
  raise exception 'Active owner authorization required' using errcode='42501';
 end if;
 if p_record_id is null or jsonb_typeof(p_review) is distinct from 'object' then raise exception 'Invalid review request' using errcode='22023';end if;
 keys:=array['request_id','expected_revision','source_hash','record_type','decision','proposal','reason','owner_confirmed'];
 if not (p_review ?& keys) or exists(select 1 from jsonb_object_keys(p_review) x where not (x=any(keys))) then raise exception 'Unsupported review fields' using errcode='22023';end if;
 if jsonb_typeof(p_review->'request_id') is distinct from 'string' or (p_review->>'request_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or jsonb_typeof(p_review->'expected_revision') is distinct from 'number' or (p_review->>'expected_revision') !~ '^[0-9]{1,7}$'
  or (p_review->>'expected_revision')::numeric>1000000
  or jsonb_typeof(p_review->'source_hash') is distinct from 'string' or (p_review->>'source_hash') !~ '^[a-f0-9]{64}$'
  or jsonb_typeof(p_review->'owner_confirmed') is distinct from 'boolean'
  or jsonb_typeof(p_review->'reason') is distinct from 'string' then raise exception 'Invalid review identity or revision' using errcode='22023';end if;
 req:=(p_review->>'request_id')::uuid; expected:=(p_review->>'expected_revision')::integer;
 proposed:=p_review->'proposal'; decision_text:=p_review->>'decision'; reason_text:=btrim(p_review->>'reason'); confirmed:=(p_review->>'owner_confirmed')::boolean;
 if decision_text is null or decision_text not in ('hold','reviewed','excluded') or char_length(reason_text) not between 10 and 2000
  or char_length(p_review->>'reason')>2000 or (decision_text<>'hold' and not confirmed) or jsonb_typeof(proposed) is distinct from 'object' then raise exception 'Invalid review decision, confirmation or reason' using errcode='22023';end if;
 -- Same lock order for all writers in this command: batch -> source row -> review revision.
 select b.status into batch_status from public.migration_batches b join public.migration_records m on m.batch_id=b.id where m.id=p_record_id for update of b;
 if not found then raise exception 'Source record not found' using errcode='P0002';end if;
 select * into r from public.migration_records where id=p_record_id for update;
 if r.source_hash is distinct from p_review->>'source_hash' then raise exception 'Source evidence changed; refresh before review' using errcode='40001';end if;
 if r.record_type not in ('client','appointment','package') or r.record_type is distinct from p_review->>'record_type' then raise exception 'This evidence type is read-only here' using errcode='22023';end if;
 select * into previous from public.migration_record_reviews where request_id=req;
 if found then
  if previous.record_id=r.id and previous.revision=expected+1 and previous.source_hash=r.source_hash
   and previous.record_type=r.record_type and previous.decision=decision_text and previous.proposal=proposed
   and previous.reason=reason_text and previous.owner_confirmed=confirmed and previous.reviewed_by=actor then
   return jsonb_build_object('ok',true,'request_id',req,'record_id',r.id,'revision',previous.revision,'source_hash',r.source_hash,'decision',previous.decision,'deduped',true);
  end if;
  raise exception 'Review request ID does not match its original decision' using errcode='40001';
 end if;
 if batch_status is null or batch_status not in ('draft','review') or r.reconciliation_status='imported' then raise exception 'This migration batch or record is frozen' using errcode='40001';end if;
 select coalesce(max(revision),0) into current_revision from public.migration_record_reviews where record_id=r.id;
 if current_revision<>expected then raise exception 'Another review was saved; refresh before editing' using errcode='40001';end if;
 keys:=case r.record_type
  when 'client' then array['client_id']
  when 'appointment' then array['client_id','trainer_id','starts_at','duration_minutes','session_status']
  when 'package' then array['client_id','as_of_date','sessions_remaining','package_price_cents','amount_paid_cents','amount_owed_cents','credit_cents'] end;
 if not (proposed ?& keys) or exists(select 1 from jsonb_object_keys(proposed) x where not (x=any(keys))) then raise exception 'Unsupported proposal fields' using errcode='22023';end if;
 foreach k in array keys loop
  if proposed->k='null'::jsonb then continue;end if;
  if k in ('client_id','trainer_id') then
   if jsonb_typeof(proposed->k) is distinct from 'string' or proposed->>k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid destination identity' using errcode='22023';end if;
  elsif k in ('duration_minutes','sessions_remaining','package_price_cents','amount_paid_cents','amount_owed_cents','credit_cents') then
   if jsonb_typeof(proposed->k) is distinct from 'number' or proposed->>k !~ '^[0-9]{1,10}$' then raise exception 'Amounts and quantities must be non-negative integers' using errcode='22023';end if;
   if (proposed->>k)::numeric > (case when k like '%_cents' then 1000000000 when k='duration_minutes' then 480 else 10000 end) then raise exception 'Amount or quantity exceeds review limit' using errcode='22023';end if;
   if k='duration_minutes' and (proposed->>k)::integer<15 then raise exception 'Duration must be 15–480 minutes' using errcode='22023';end if;
  elsif k='starts_at' then
   if jsonb_typeof(proposed->k) is distinct from 'string' or proposed->>k !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,3})?(Z|[+-](0[0-9]|1[0-4]):[0-5][0-9])$' or proposed->>k ~ '[+-]14:(0[1-9]|[1-5][0-9])$' then raise exception 'Time requires an explicit valid offset' using errcode='22023';end if;
   begin starts:=(proposed->>k)::timestamptz; exception when others then raise exception 'Invalid appointment date' using errcode='22023';end;
  elsif k='as_of_date' then
   if jsonb_typeof(proposed->k) is distinct from 'string' or proposed->>k !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid opening date' using errcode='22023';end if;
   begin opening_date:=(proposed->>k)::date; exception when others then raise exception 'Invalid opening date' using errcode='22023';end;
   if opening_date>(now() at time zone 'America/Los_Angeles')::date then raise exception 'Opening date cannot be in the future' using errcode='22023';end if;
  elsif k='session_status' then
   if jsonb_typeof(proposed->k) is distinct from 'string' or proposed->>k not in ('scheduled','confirmed','completed') then raise exception 'Invalid appointment status' using errcode='22023';end if;
  end if;
 end loop;
 client:=(proposed->>'client_id')::uuid;
 if client is not null then
  perform c.id from public.clients c join public.profiles p on p.id=c.id where c.id=client and p.role='client' and p.deleted_at is null for share of c,p;
  if not found then raise exception 'An active destination client is required' using errcode='22023';end if;
 end if;
 if r.record_type='appointment' then
  trainer:=(proposed->>'trainer_id')::uuid;duration:=(proposed->>'duration_minutes')::integer;
  if trainer is not null then
   perform id from public.profiles where id=trainer and role in ('owner','trainer') and deleted_at is null for share;
   if not found then raise exception 'An active destination coach is required' using errcode='22023';end if;
  end if;
  if proposed->>'session_status'='completed' and starts+duration*interval '1 minute'>now() then raise exception 'Future or ongoing appointments cannot be completed' using errcode='22023';end if;
 end if;
 if r.record_type='package' and (proposed->>'amount_owed_cents')::numeric>0 and (proposed->>'credit_cents')::numeric>0 then raise exception 'Resolve simultaneous debt and credit first' using errcode='22023';end if;
 if decision_text='reviewed' then
  if client is null then raise exception 'Destination client is required before reviewed' using errcode='22023';end if;
  if r.record_type='appointment' and (trainer is null or starts is null or duration is null or proposed->>'session_status' is null) then raise exception 'Confirm coach, time, duration and status' using errcode='22023';end if;
  if r.record_type='package' and (opening_date is null or proposed->>'sessions_remaining' is null) then raise exception 'Confirm opening date and remaining sessions' using errcode='22023';end if;
 end if;
 insert into public.migration_record_reviews(request_id,record_id,revision,source_hash,record_type,decision,proposal,reason,owner_confirmed,reviewed_by)
 values(req,r.id,expected+1,r.source_hash,r.record_type,decision_text,proposed,reason_text,confirmed,actor) returning * into saved;
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes)
 values(gen_random_uuid(),actor,'migration.owner_review_saved','migration_record',r.id,jsonb_build_object('review_id',saved.id,'request_id',req,'revision',saved.revision,'decision',saved.decision,'source_hash',r.source_hash,'operational_import',false));
 return jsonb_build_object('ok',true,'request_id',req,'record_id',r.id,'revision',saved.revision,'source_hash',r.source_hash,'decision',saved.decision,'deduped',false);
end $$;
revoke all on function public.review_migration_record(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.review_migration_record(uuid,jsonb) to authenticated;
