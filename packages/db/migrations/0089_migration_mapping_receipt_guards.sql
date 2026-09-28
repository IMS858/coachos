-- Protect completed import receipts from legacy matching/dry-run commands.
-- These helpers never create operational records or approve a batch.
create or replace function public.reconcile_migration_record(p_record_id uuid,p_destination_id uuid,p_status text,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();r public.migration_records%rowtype;batch_state text;clean_note text:=nullif(btrim(p_note),'');
begin
 if not exists(select 1 from public.profiles where id=actor and role='owner' and deleted_at is null) then raise exception 'Owner authorization required' using errcode='42501';end if;
 if p_record_id is null or p_status is null or p_status not in ('matched','needs_review','excluded','ready') or coalesce(char_length(p_note),0)>1000 then raise exception 'Invalid reconciliation state' using errcode='22023';end if;
 -- Match the importer's lock order: source table -> batch -> source row.
 lock table public.migration_records in share row exclusive mode;
 select b.status into batch_state from public.migration_batches b join public.migration_records m on m.batch_id=b.id where m.id=p_record_id for update of b;
 if not found then raise exception 'Migration record not found' using errcode='P0002';end if;
 select * into r from public.migration_records where id=p_record_id for update;
 if r.reconciliation_status='imported' then raise exception 'Imported mapping is immutable; use a separately audited correction' using errcode='40001';end if;
 if batch_state not in ('draft','review','approved') then raise exception 'Migration batch is closed' using errcode='40001';end if;
 if p_status in ('matched','ready') and p_destination_id is null then raise exception 'Destination identity required' using errcode='22023';end if;
 if r.record_type in ('client','appointment') and p_destination_id is not null and not exists(select 1 from public.clients c join public.profiles p on p.id=c.id where c.id=p_destination_id and p.role='client' and p.deleted_at is null) then raise exception 'Active destination client required' using errcode='22023';end if;
 if r.destination_id is not distinct from p_destination_id and r.reconciliation_status=p_status and r.review_note is not distinct from clean_note then return jsonb_build_object('ok',true,'id',r.id,'status',p_status,'deduped',true);end if;
 update public.migration_records set destination_id=p_destination_id,reconciliation_status=p_status,review_note=clean_note where id=r.id;
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),actor,'migration.record_reconciled','migration_record',r.id,jsonb_build_object('record_type',r.record_type,'source_id',r.source_id,'source_hash',r.source_hash,'before_destination_id',r.destination_id,'before_status',r.reconciliation_status,'destination_id',p_destination_id,'status',p_status,'note',clean_note));
 return jsonb_build_object('ok',true,'id',r.id,'status',p_status,'deduped',false);
end $$;
revoke all on function public.reconcile_migration_record(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.reconcile_migration_record(uuid,uuid,text,text) to authenticated;

create or replace function public.record_migration_schedule_dry_run(p_record_id uuid,p_status text,p_reason text,p_client_id uuid,p_trainer_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();r public.migration_records%rowtype;batch_state text;clean_reason text:=nullif(btrim(p_reason),'');
begin
 if not exists(select 1 from public.profiles where id=actor and role='owner' and deleted_at is null) then raise exception 'Owner authorization required' using errcode='42501';end if;
 if p_record_id is null or p_status is null or p_status not in ('ready','hold') or coalesce(char_length(p_reason),0)>500 then raise exception 'Invalid dry-run result' using errcode='22023';end if;
 lock table public.migration_records in share row exclusive mode;
 select b.status into batch_state from public.migration_batches b join public.migration_records m on m.batch_id=b.id where m.id=p_record_id and m.record_type='appointment' for update of b;
 if not found then raise exception 'Appointment source record not found' using errcode='P0002';end if;
 select * into r from public.migration_records where id=p_record_id for update;
 if r.reconciliation_status='imported' then
  if p_status=r.dry_run_status and p_client_id is not distinct from r.destination_id and p_trainer_id is not distinct from r.destination_trainer_id and clean_reason is not distinct from r.dry_run_reason then return jsonb_build_object('ok',true,'id',r.id,'dry_run_status',r.dry_run_status,'deduped',true);end if;
  raise exception 'Imported mapping is immutable; use a separately audited correction' using errcode='40001';
 end if;
 if batch_state not in ('draft','review','approved') then raise exception 'Migration batch is closed' using errcode='40001';end if;
 if p_status='ready' and (p_client_id is null or p_trainer_id is null or p_reason is not null) then raise exception 'Ready appointments require resolved identities and no hold reason' using errcode='22023';end if;
 if p_status='hold' and clean_reason is null then raise exception 'Held appointments require an explicit reason' using errcode='22023';end if;
 if p_client_id is not null and not exists(select 1 from public.clients c join public.profiles p on p.id=c.id where c.id=p_client_id and p.role='client' and p.deleted_at is null) then raise exception 'Active destination client required' using errcode='22023';end if;
 if p_trainer_id is not null and not exists(select 1 from public.profiles where id=p_trainer_id and role in ('owner','trainer') and deleted_at is null) then raise exception 'Active destination coach required' using errcode='22023';end if;
 if r.destination_id is not distinct from p_client_id and r.destination_trainer_id is not distinct from p_trainer_id and r.dry_run_status is not distinct from p_status and r.dry_run_reason is not distinct from clean_reason then return jsonb_build_object('ok',true,'id',r.id,'dry_run_status',p_status,'deduped',true);end if;
 update public.migration_records set destination_id=p_client_id,destination_trainer_id=p_trainer_id,dry_run_status=p_status,dry_run_reason=clean_reason where id=r.id;
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),actor,'migration.schedule_dry_run_recorded','migration_record',r.id,jsonb_build_object('source_hash',r.source_hash,'before_client_id',r.destination_id,'before_trainer_id',r.destination_trainer_id,'client_id',p_client_id,'trainer_id',p_trainer_id,'status',p_status,'reason',clean_reason));
 return jsonb_build_object('ok',true,'id',r.id,'dry_run_status',p_status,'deduped',false);
end $$;
revoke all on function public.record_migration_schedule_dry_run(uuid,text,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.record_migration_schedule_dry_run(uuid,text,text,uuid,uuid) to authenticated;
