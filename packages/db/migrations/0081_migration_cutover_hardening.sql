-- Forward-only tightening of controlled appointment import.
create or replace function public.import_reviewed_migration_appointment(p_record_id uuid,p_expected_review_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();r public.migration_records%rowtype;v public.migration_record_reviews%rowtype;batch public.migration_batches%rowtype;p jsonb;client uuid;trainer uuid;starts timestamptz;duration integer;status_text text;new_id uuid;ends timestamptz;k text;expected numeric;actual bigint;kinds text[]:=array['client','appointment','series','package','membership','transaction'];
begin
 if not exists(select 1 from public.profiles where id=actor and role='owner' and deleted_at is null) then raise exception 'Owner authorization required' using errcode='42501';end if;
 if p_record_id is null or p_expected_review_revision is null or p_expected_review_revision<1 then raise exception 'Source record and review revision are required' using errcode='22023';end if;
 lock table public.migration_records in share row exclusive mode;
 select b.* into batch from public.migration_batches b join public.migration_records m on m.batch_id=b.id where m.id=p_record_id and m.record_type='appointment' for update of b;
 if not found then raise exception 'Appointment source record not found' using errcode='P0002';end if;
 if batch.source_system is distinct from 'vagaro' or batch.status is distinct from 'approved' or batch.approved_at is null or batch.approved_at>now()
  or not exists(select 1 from public.profiles where id=batch.approved_by and role='owner' and deleted_at is null) then raise exception 'Explicit active-owner batch approval required before calendar import' using errcode='23514';end if;
 if batch.staging_completed_at is null or batch.staging_completed_at>batch.approved_at or batch.source_manifest_sha256 is null or batch.source_manifest_sha256 !~ '^[a-f0-9]{64}$'
  or batch.expected_counts is null or jsonb_typeof(batch.expected_counts) is distinct from 'object' then raise exception 'Complete staging receipt required before calendar import' using errcode='23514';end if;
 if not(batch.expected_counts ?& kinds) or exists(select 1 from jsonb_object_keys(batch.expected_counts) key where not(key=any(kinds))) then raise exception 'All six declared source counts are required before calendar import' using errcode='23514';end if;
 foreach k in array kinds loop
  if jsonb_typeof(batch.expected_counts->k) is distinct from 'number' then raise exception 'Invalid declared source count' using errcode='23514';end if;
  expected:=(batch.expected_counts->>k)::numeric;if expected<0 or expected>2147483647 or expected<>trunc(expected) then raise exception 'Invalid declared source count' using errcode='23514';end if;
  select count(*) into actual from public.migration_records where batch_id=batch.id and record_type=k;if actual<>expected then raise exception 'Staging count changed for %; refresh source receipt',k using errcode='23514';end if;
 end loop;
 select * into r from public.migration_records where id=p_record_id for update;
 select * into v from public.migration_record_reviews where record_id=r.id order by revision desc limit 1;
 if not found or v.revision is distinct from p_expected_review_revision then raise exception 'Current owner review revision required' using errcode='40001';end if;
 if v.record_type is distinct from 'appointment' or v.decision is distinct from 'reviewed' or v.owner_confirmed is distinct from true or v.source_hash is distinct from r.source_hash or r.source_hash !~ '^[a-f0-9]{64}$'
  or v.created_at>batch.approved_at or not exists(select 1 from public.profiles where id=v.reviewed_by and role='owner' and deleted_at is null) then raise exception 'Matching confirmed owner review required before batch approval' using errcode='23514';end if;
 p:=v.proposal;client:=(p->>'client_id')::uuid;trainer:=(p->>'trainer_id')::uuid;starts:=(p->>'starts_at')::timestamptz;duration:=(p->>'duration_minutes')::integer;status_text:=p->>'session_status';
 if client is null or trainer is null or starts is null or duration is null or duration not between 15 and 480 or status_text is null or status_text not in ('scheduled','confirmed') then raise exception 'Complete scheduled or confirmed appointment proposal required' using errcode='23514';end if;
 ends:=starts+duration*interval '1 minute';
 if r.reconciliation_status='imported' then select id into new_id from public.sessions where vagaro_event_id=r.source_id and client_id=client and trainer_id=trainer and scheduled_at=starts and duration_minutes=duration;if new_id is null then raise exception 'Imported source and destination receipt do not agree' using errcode='40001';end if;return jsonb_build_object('ok',true,'deduped',true,'session_id',new_id,'source_id',r.source_id,'review_revision',v.revision);end if;
 if starts<=now() then raise exception 'Historical appointments require separate delivery reconciliation' using errcode='23514';end if;
 if not exists(select 1 from public.clients c join public.profiles pr on pr.id=c.id where c.id=client and pr.role='client' and pr.deleted_at is null) then raise exception 'Active destination client required' using errcode='23514';end if;
 if not exists(select 1 from public.profiles where id=trainer and role in ('owner','trainer') and deleted_at is null) then raise exception 'Active destination coach required' using errcode='23514';end if;
 if exists(select 1 from public.sessions s where s.vagaro_event_id=r.source_id) then raise exception 'Source appointment already exists without imported receipt' using errcode='23505';end if;
 if exists(select 1 from public.sessions s where s.trainer_id=trainer and s.status in ('requested','scheduled','confirmed') and s.scheduled_at<ends and s.scheduled_at+s.duration_minutes*interval '1 minute'>starts) then raise exception 'Trainer session collision' using errcode='23P01';end if;
 if exists(select 1 from public.class_occurrences c where c.trainer_id=trainer and c.status<>'cancelled' and c.starts_at<ends and c.ends_at>starts) then raise exception 'Trainer class collision' using errcode='23P01';end if;
 if exists(select 1 from public.trainer_time_blocks b where b.trainer_id=trainer and b.starts_at<ends and b.ends_at>starts) then raise exception 'Trainer blocked-time collision' using errcode='23P01';end if;
 insert into public.sessions(client_id,trainer_id,scheduled_at,duration_minutes,session_type,service_type,status,vagaro_event_id,notes_pre) values(client,trainer,starts,duration,'training','training',status_text::public.session_status,r.source_id,'Imported from reviewed Vagaro source evidence; payment/package linkage not inferred.') returning id into new_id;
 update public.migration_records set reconciliation_status='imported',destination_id=client,destination_trainer_id=trainer,dry_run_status='ready',dry_run_reason=null where id=r.id;
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),actor,'migration.appointment_imported','session',new_id,jsonb_build_object('migration_record_id',r.id,'source_id',r.source_id,'review_revision',v.revision,'source_hash',r.source_hash,'staging_manifest_sha256',batch.source_manifest_sha256,'batch_approved_at',batch.approved_at,'package_inferred',false,'payment_inferred',false));
 return jsonb_build_object('ok',true,'deduped',false,'session_id',new_id,'source_id',r.source_id,'review_revision',v.revision);
end $$;
revoke all on function public.import_reviewed_migration_appointment(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.import_reviewed_migration_appointment(uuid,integer) to authenticated;
