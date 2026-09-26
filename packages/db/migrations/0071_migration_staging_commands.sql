-- Owner-authorized migration staging commands. These commands only write source-evidence tables.
create or replace function public.create_migration_batch(p_source_system text,p_label text,p_source_as_of timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();new_id uuid;
begin
 if not exists(select 1 from public.profiles where id=actor and role='owner' and deleted_at is null) then raise exception 'Owner authorization required' using errcode='42501';end if;
 if p_source_system<>'vagaro' or char_length(btrim(coalesce(p_label,''))) not between 3 and 200 then raise exception 'Invalid migration batch' using errcode='22023';end if;
 insert into public.migration_batches(source_system,label,source_as_of,created_by) values(p_source_system,btrim(p_label),p_source_as_of,actor) returning id into new_id;
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),actor,'migration.batch_created','migration_batch',new_id,jsonb_build_object('source_system',p_source_system,'label',p_label));
 return new_id;
end $$;
revoke all on function public.create_migration_batch(text,text,timestamptz) from public,anon,authenticated;grant execute on function public.create_migration_batch(text,text,timestamptz) to authenticated;

create or replace function public.stage_migration_records(p_batch_id uuid,p_records jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();item jsonb;inserted_count integer:=0;deduped_count integer:=0;existing_hash text;
begin
 if not exists(select 1 from public.profiles where id=actor and role='owner' and deleted_at is null) then raise exception 'Owner authorization required' using errcode='42501';end if;
 if not exists(select 1 from public.migration_batches where id=p_batch_id and status='draft') then raise exception 'Draft migration batch required' using errcode='23514';end if;
 if jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records) not between 1 and 100 then raise exception 'Stage 1–100 source records at a time' using errcode='22023';end if;
 for item in select * from jsonb_array_elements(p_records) loop
  if item->>'record_type' not in ('client','appointment','series','package','membership','transaction') or coalesce(char_length(item->>'source_id'),0)=0 or coalesce(char_length(item->>'source_hash'),0)<>64 or jsonb_typeof(item->'source_payload')<>'object' then raise exception 'Invalid source record' using errcode='22023';end if;
  select source_hash into existing_hash from public.migration_records where batch_id=p_batch_id and record_type=item->>'record_type' and source_id=item->>'source_id';
  if found then
   if existing_hash<>item->>'source_hash' then raise exception 'Source record changed for % %',item->>'record_type',item->>'source_id' using errcode='23514';end if;
   deduped_count:=deduped_count+1;
  else
   insert into public.migration_records(batch_id,record_type,source_id,source_payload,source_hash,reconciliation_status)
   values(p_batch_id,item->>'record_type',item->>'source_id',item->'source_payload',item->>'source_hash','unmatched');
   inserted_count:=inserted_count+1;
  end if;
 end loop;
 return jsonb_build_object('ok',true,'inserted',inserted_count,'deduped',deduped_count);
end $$;
revoke all on function public.stage_migration_records(uuid,jsonb) from public,anon,authenticated;grant execute on function public.stage_migration_records(uuid,jsonb) to authenticated;
