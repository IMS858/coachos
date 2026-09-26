-- Controlled import of one owner-reviewed Vagaro appointment.
-- Review != import. This command revalidates source, identities and collisions at write time.
create or replace function public.import_reviewed_migration_appointment(p_record_id uuid,p_expected_review_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();r public.migration_records%rowtype;v public.migration_record_reviews%rowtype;p jsonb;client uuid;trainer uuid;starts timestamptz;duration integer;status_text text;new_id uuid;ends timestamptz;
begin
 if not exists(select 1 from public.profiles where id=actor and role='owner' and deleted_at is null) then raise exception 'Owner authorization required' using errcode='42501';end if;
 select * into r from public.migration_records where id=p_record_id and record_type='appointment' for update;if not found then raise exception 'Appointment source record not found' using errcode='P0002';end if;
 if r.reconciliation_status='imported' then select id into new_id from public.sessions where vagaro_event_id=r.source_id;return jsonb_build_object('ok',new_id is not null,'deduped',true,'session_id',new_id,'source_id',r.source_id);end if;
 select * into v from public.migration_record_reviews where record_id=r.id and revision=p_expected_review_revision order by revision desc limit 1;
 if not found or v.decision<>'reviewed' or v.source_hash<>r.source_hash then raise exception 'Current owner review required' using errcode='23514';end if;
 if exists(select 1 from public.migration_record_reviews newer where newer.record_id=r.id and newer.revision>v.revision) then raise exception 'A newer owner review exists' using errcode='40001';end if;
 p:=v.proposal;client:=(p->>'client_id')::uuid;trainer:=(p->>'trainer_id')::uuid;starts:=(p->>'starts_at')::timestamptz;duration:=(p->>'duration_minutes')::integer;status_text:=p->>'session_status';ends:=starts+duration*interval '1 minute';
 if status_text not in ('scheduled','confirmed') then raise exception 'Calendar cutover imports only scheduled or confirmed appointments' using errcode='23514';end if;
 if starts<=now() then raise exception 'Historical appointments require separate delivery reconciliation' using errcode='23514';end if;
 if duration not between 15 and 480 then raise exception 'Invalid duration' using errcode='22023';end if;
 if not exists(select 1 from public.clients c join public.profiles pr on pr.id=c.id where c.id=client and pr.role='client' and pr.deleted_at is null) then raise exception 'Active destination client required' using errcode='23514';end if;
 if not exists(select 1 from public.profiles where id=trainer and role in ('owner','trainer') and deleted_at is null) then raise exception 'Active destination coach required' using errcode='23514';end if;
 if exists(select 1 from public.sessions s where s.vagaro_event_id=r.source_id) then raise exception 'Source appointment already exists without imported receipt' using errcode='23505';end if;
 if exists(select 1 from public.sessions s where s.trainer_id=trainer and s.status in ('requested','scheduled','confirmed') and s.scheduled_at<ends and s.scheduled_at+s.duration_minutes*interval '1 minute'>starts) then raise exception 'Trainer session collision' using errcode='23P01';end if;
 if exists(select 1 from public.class_occurrences c where c.trainer_id=trainer and c.status<>'cancelled' and c.starts_at<ends and c.ends_at>starts) then raise exception 'Trainer class collision' using errcode='23P01';end if;
 if exists(select 1 from public.trainer_time_blocks b where b.trainer_id=trainer and b.starts_at<ends and b.ends_at>starts) then raise exception 'Trainer blocked-time collision' using errcode='23P01';end if;
 insert into public.sessions(client_id,trainer_id,scheduled_at,duration_minutes,session_type,service_type,status,vagaro_event_id,notes_pre)
 values(client,trainer,starts,duration,'training','training',status_text::public.session_status,r.source_id,'Imported from reviewed Vagaro source evidence; payment/package linkage not inferred.') returning id into new_id;
 update public.migration_records set reconciliation_status='imported',destination_id=client,destination_trainer_id=trainer,dry_run_status='ready',dry_run_reason=null where id=r.id;
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),actor,'migration.appointment_imported','session',new_id,jsonb_build_object('migration_record_id',r.id,'source_id',r.source_id,'review_revision',v.revision,'source_hash',r.source_hash,'package_inferred',false,'payment_inferred',false));
 return jsonb_build_object('ok',true,'deduped',false,'session_id',new_id,'source_id',r.source_id,'review_revision',v.revision);
end $$;
revoke all on function public.import_reviewed_migration_appointment(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.import_reviewed_migration_appointment(uuid,integer) to authenticated;
