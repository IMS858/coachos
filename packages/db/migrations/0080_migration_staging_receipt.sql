-- Batch-level staging receipt closes the gap between saved rows and a declared complete source export.
alter table public.migration_batches add column if not exists expected_counts jsonb;
alter table public.migration_batches add column if not exists source_manifest_sha256 text;
alter table public.migration_batches add column if not exists staging_completed_at timestamptz;
create or replace function public.finalize_migration_staging(p_batch_id uuid,p_expected_counts jsonb,p_manifest_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();k text;expected integer;actual integer;
begin
 if not exists(select 1 from public.profiles where id=actor and role='owner' and deleted_at is null) then raise exception 'Owner authorization required' using errcode='42501';end if;
 if not exists(select 1 from public.migration_batches where id=p_batch_id and status='draft') then raise exception 'Draft migration batch required' using errcode='23514';end if;
 if p_manifest_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Valid manifest checksum required' using errcode='22023';end if;
 for k in select unnest(array['client','appointment','series','package','membership','transaction']) loop
  expected:=coalesce((p_expected_counts->>k)::integer,-1);select count(*) into actual from public.migration_records where batch_id=p_batch_id and record_type=k;
  if expected<0 or actual<>expected then raise exception 'Source count mismatch for %: expected %, staged %',k,expected,actual using errcode='23514';end if;
 end loop;
 update public.migration_batches set expected_counts=p_expected_counts,source_manifest_sha256=p_manifest_sha256,staging_completed_at=clock_timestamp() where id=p_batch_id;
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),actor,'migration.staging_completed','migration_batch',p_batch_id,jsonb_build_object('expected_counts',p_expected_counts,'manifest_sha256',p_manifest_sha256));
 return jsonb_build_object('ok',true,'batch_id',p_batch_id,'expected_counts',p_expected_counts,'manifest_sha256',p_manifest_sha256);
end $$;
revoke all on function public.finalize_migration_staging(uuid,jsonb,text) from public,anon,authenticated,service_role;grant execute on function public.finalize_migration_staging(uuid,jsonb,text) to authenticated;
