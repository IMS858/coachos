-- Owner-declared source coverage; staging is not operational import.
alter table public.migration_batches add column if not exists expected_counts jsonb;
alter table public.migration_batches add column if not exists source_manifest_sha256 text;
alter table public.migration_batches add column if not exists staging_completed_at timestamptz;

create or replace function public.finalize_migration_staging(p_batch_id uuid,p_expected_counts jsonb,p_manifest_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); k text; expected numeric; actual bigint;
 batch public.migration_batches%rowtype;
 kinds text[]:=array['client','appointment','series','package','membership','transaction'];
begin
 if not exists(select 1 from public.profiles where id=actor and role='owner' and deleted_at is null) then
  raise exception 'Owner authorization required' using errcode='42501';
 end if;
 if p_manifest_sha256 is null or p_manifest_sha256 !~ '^[0-9a-f]{64}$' then
  raise exception 'Valid manifest checksum required' using errcode='22023';
 end if;
 if p_expected_counts is null or jsonb_typeof(p_expected_counts) is distinct from 'object' then
  raise exception 'Expected source counts must be an object' using errcode='22023';
 end if;
 if not(p_expected_counts ?& kinds) or exists(select 1 from jsonb_object_keys(p_expected_counts) key where not(key=any(kinds))) then
  raise exception 'All six source counts are required; no extra fields' using errcode='22023';
 end if;
 foreach k in array kinds loop
  if jsonb_typeof(p_expected_counts->k) is distinct from 'number' then
   raise exception 'Source counts must be non-negative whole numbers' using errcode='22023';
  end if;
  expected:=(p_expected_counts->>k)::numeric;
  if expected<0 or expected>2147483647 or expected<>trunc(expected) then
   raise exception 'Source counts must be non-negative whole numbers' using errcode='22023';
  end if;
 end loop;
 -- Source DML takes a row-exclusive table lock before its invalidation trigger.
 -- Match that ordering: freeze source writes, then lock the batch for a consistent receipt.
 lock table public.migration_records in share mode;
 select * into batch from public.migration_batches where id=p_batch_id for update;
 if not found or batch.status<>'draft' then
  raise exception 'Draft migration batch required' using errcode='23514';
 end if;
 foreach k in array kinds loop
  expected:=(p_expected_counts->>k)::numeric;
  select count(*) into actual from public.migration_records where batch_id=p_batch_id and record_type=k;
  if actual<>expected then
   raise exception 'Source count mismatch for %: expected %, staged %',k,expected,actual using errcode='23514';
  end if;
 end loop;
 if batch.staging_completed_at is not null and batch.expected_counts=p_expected_counts and batch.source_manifest_sha256=p_manifest_sha256 then
  return jsonb_build_object('ok',true,'batch_id',p_batch_id,'expected_counts',p_expected_counts,'manifest_sha256',p_manifest_sha256,'deduped',true);
 end if;
 update public.migration_batches set expected_counts=p_expected_counts,source_manifest_sha256=p_manifest_sha256,staging_completed_at=clock_timestamp() where id=p_batch_id;
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes)
 values(gen_random_uuid(),actor,'migration.staging_completed','migration_batch',p_batch_id,jsonb_build_object('expected_counts',p_expected_counts,'manifest_sha256',p_manifest_sha256));
 return jsonb_build_object('ok',true,'batch_id',p_batch_id,'expected_counts',p_expected_counts,'manifest_sha256',p_manifest_sha256,'deduped',false);
end $$;
revoke all on function public.finalize_migration_staging(uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.finalize_migration_staging(uuid,jsonb,text) to authenticated;

-- A receipt is valid only for its source snapshot. Preserve completion audits as history,
-- but invalidate the current receipt on source changes, including unchanged row counts.
create or replace function public.invalidate_migration_staging_receipt()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='TRUNCATE' then
  update public.migration_batches set expected_counts=null,source_manifest_sha256=null,staging_completed_at=null
  where staging_completed_at is not null;
  return null;
 end if;
 if tg_op='UPDATE' then
  if row(new.batch_id,new.record_type,new.source_id,new.source_parent_id,new.source_payload,new.source_hash)
    is not distinct from row(old.batch_id,old.record_type,old.source_id,old.source_parent_id,old.source_payload,old.source_hash) then
   return new;
  end if;
 end if;
 if tg_op in ('UPDATE','DELETE') then
  update public.migration_batches set expected_counts=null,source_manifest_sha256=null,staging_completed_at=null
  where id=old.batch_id and staging_completed_at is not null;
 end if;
 if tg_op in ('UPDATE','INSERT') then
  update public.migration_batches set expected_counts=null,source_manifest_sha256=null,staging_completed_at=null
  where id=new.batch_id and staging_completed_at is not null;
 end if;
 if tg_op='DELETE' then return old;end if;
 return new;
end $$;
revoke all on function public.invalidate_migration_staging_receipt() from public,anon,authenticated,service_role;
create trigger migration_staging_source_changed before insert or update or delete on public.migration_records
 for each row execute function public.invalidate_migration_staging_receipt();
create trigger migration_staging_source_truncated before truncate on public.migration_records
 for each statement execute function public.invalidate_migration_staging_receipt();
