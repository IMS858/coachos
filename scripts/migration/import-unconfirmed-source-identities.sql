-- ADMINISTRATIVE DATA MIGRATION, NOT A PUBLIC RPC OR A SIGN-IN BYPASS.
-- Supabase's documented Auth migration pattern supports database inserts:
-- https://supabase.com/docs/guides/platform/migrating-to-supabase/firebase-auth
-- Unlike that provider migration, this roster does NOT establish verified contact ownership.
-- Therefore no passwords, confirmation timestamps, invitations, sessions or tokens are created.
-- Required transaction-local settings (provided by an authorized administrator, never a browser):
-- request.jwt.claim.sub = the authorizing active owner ID;
-- ims.migration_identity_records = JSON array of reviewed source record UUIDs (1..25).
-- Requires schema 0090 and the inspected auth.users/auth.identities contract.
-- Use inside BEGIN/COMMIT; first rehearse with ROLLBACK. No credential or PII is embedded here.
DO $$
declare selected jsonb;source_ids uuid[];source_count integer;item public.migration_records%rowtype;
 q public.migration_client_identity_receipts%rowtype;receipt jsonb;actor uuid:=auth.uid();created boolean;stamp timestamptz;
begin
 if current_user<>'postgres' or not exists(select 1 from public.profiles where id=actor and role='owner' and deleted_at is null) then
  raise exception 'Authorized database administrator and active owner attestation required' using errcode='42501';
 end if;
 selected:=nullif(current_setting('ims.migration_identity_records',true),'')::jsonb;
 if jsonb_typeof(selected) is distinct from 'array' or jsonb_array_length(selected) not between 1 and 25 then raise exception 'Select 1-25 source identity records' using errcode='22023';end if;
 select array_agg(value::uuid order by value) into source_ids from jsonb_array_elements_text(selected) value;
 if cardinality(source_ids)<>(select count(distinct id) from unnest(source_ids) id) then raise exception 'Duplicate source IDs are not permitted' using errcode='22023';end if;
 select count(*) into source_count from public.migration_records where id=any(source_ids) and record_type='client';
 if source_count<>cardinality(source_ids) then raise exception 'Every selected source client must exist' using errcode='22023';end if;
 for item in select * from public.migration_records where id=any(source_ids) order by id loop
  receipt:=public.prepare_migration_client_identity(item.id,item.source_hash,(select source_manifest_sha256 from public.migration_batches where id=item.batch_id));
  select * into q from public.migration_client_identity_receipts where record_id=item.id;
  if q.status='finalized' then continue;end if;
  created:=false;
  if not exists(select 1 from auth.users where id=q.client_id) then
   stamp:=clock_timestamp();
   insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,invited_at,
    confirmation_token,confirmation_sent_at,recovery_token,recovery_sent_at,email_change_token_new,email_change,email_change_sent_at,last_sign_in_at,
    raw_app_meta_data,raw_user_meta_data,is_super_admin,created_at,updated_at,phone,phone_confirmed_at,phone_change,phone_change_token,phone_change_sent_at,
    email_change_token_current,email_change_confirm_status,reauthentication_token,reauthentication_sent_at,is_sso_user,is_anonymous)
   values('00000000-0000-0000-0000-000000000000',q.client_id,'authenticated','authenticated',q.email,'',null,null,
    '',null,'',null,'','',null,null,
    jsonb_build_object('provider','email','providers',jsonb_build_array('email'),'ims_migration_record_id',q.record_id::text,'ims_migration_source_hash',q.source_hash,'ims_migration_manifest_sha256',q.manifest_sha256,'ims_migration_provisioning_method','authorized_database_import'),
    jsonb_build_object('full_name',q.full_name),false,stamp,stamp,null,null,'','',null,'',0,'',null,false,false);
   insert into auth.identities(user_id,provider,provider_id,identity_data,last_sign_in_at,created_at,updated_at)
   values(q.client_id,'email',q.client_id::text,jsonb_build_object('sub',q.client_id::text,'email',q.email,'email_verified',false,'phone_verified',false),null,stamp,stamp);
   created:=true;
  end if;
  -- Existing accounts are never rewritten. This verifies trusted source markers and email identity,
  -- then finalizes profile/client/mapping/receipt/audit in the same transaction.
  receipt:=public.finalize_migration_client_identity(item.id,item.source_hash,q.manifest_sha256);
  if receipt->>'status'<>'finalized' or (receipt->>'client_id')::uuid<>q.client_id then raise exception 'Identity finalization was not confirmed';end if;
  if created then
   if exists(select 1 from auth.users where id=q.client_id and (coalesce(encrypted_password,'')<>'' or email_confirmed_at is not null or phone_confirmed_at is not null or invited_at is not null or last_sign_in_at is not null)) then raise exception 'Import must not create credentials, verification or invitation evidence';end if;
   insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),actor,'migration.auth_identity_created','migration_record',item.id,
    jsonb_build_object('execution_channel','authorized_database_migration','client_id',q.client_id,'batch_id',q.batch_id,'source_hash',q.source_hash,'manifest_sha256',q.manifest_sha256,'password_created',false,'email_verified',false,'invitation_sent',false));
  end if;
 end loop;
end $$;
