-- Owner reconciliation command for staged records. Matching does not import operational data.
create or replace function public.reconcile_migration_record(p_record_id uuid,p_destination_id uuid,p_status text,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();r public.migration_records%rowtype;
begin
 if not exists(select 1 from public.profiles where id=actor and role='owner' and deleted_at is null) then raise exception 'Owner authorization required' using errcode='42501';end if;
 if p_status not in ('matched','needs_review','excluded','ready') or coalesce(char_length(p_note),0)>1000 then raise exception 'Invalid reconciliation state' using errcode='22023';end if;
 select * into r from public.migration_records where id=p_record_id for update;if not found then raise exception 'Migration record not found' using errcode='P0002';end if;
 if p_status in ('matched','ready') and p_destination_id is null then raise exception 'Destination identity required' using errcode='22023';end if;
 if r.record_type='client' and p_destination_id is not null and not exists(select 1 from public.clients where id=p_destination_id) then raise exception 'Destination client not found' using errcode='22023';end if;
 update public.migration_records set destination_id=p_destination_id,reconciliation_status=p_status,review_note=nullif(btrim(p_note),'') where id=r.id;
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),actor,'migration.record_reconciled','migration_record',r.id,jsonb_build_object('record_type',r.record_type,'source_id',r.source_id,'destination_id',p_destination_id,'status',p_status));
 return jsonb_build_object('ok',true,'id',r.id,'status',p_status);
end $$;
revoke all on function public.reconcile_migration_record(uuid,uuid,text,text) from public,anon,authenticated;grant execute on function public.reconcile_migration_record(uuid,uuid,text,text) to authenticated;
