-- Add photo originals without changing existing PDF paths, RLS or publication rules.
alter table public.fuel_source_documents add column if not exists content_type text not null default 'application/pdf' check(content_type in ('application/pdf','image/jpeg','image/png'));
update storage.buckets set allowed_mime_types=array['application/pdf','image/jpeg','image/png'] where id='fuel-sources' and public=false;
create or replace function public.register_fuel_report_source(p_actor uuid,p_client uuid,p_id uuid,p_name text,p_sha256 text,p_bytes integer,p_mime text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare path text; prior public.fuel_source_documents%rowtype; ext text;
begin
 if p_actor is null or not exists(select 1 from public.profiles a join public.clients c on c.id=p_client join public.profiles s on s.id=c.id where a.id=p_actor and a.deleted_at is null and s.deleted_at is null and s.role='client' and (a.role='owner' or (a.role='trainer' and c.primary_trainer_id=a.id))) then raise exception 'Assigned active coach required' using errcode='42501';end if;
 if p_id is null or p_name is null or char_length(btrim(p_name)) not between 1 and 160 or p_name ~ '[[:cntrl:]]' or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_bytes is null or p_bytes not between 8 and 3145728 or p_mime is null or p_mime not in ('application/pdf','image/jpeg','image/png') then raise exception 'Invalid report original' using errcode='22023';end if;
 ext:=case p_mime when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' else 'png' end;
 perform id from public.clients where id=p_client for update;
 path:=p_client::text||'/'||p_actor::text||'/'||p_id::text||'.'||ext;
 select * into prior from public.fuel_source_documents where id=p_id;
 if found then
  if prior.client_id=p_client and prior.created_by=p_actor and prior.sha256=p_sha256 and prior.byte_size=p_bytes and prior.original_name=p_name and prior.content_type=p_mime then return jsonb_build_object('ok',true,'id',p_id,'client_id',p_client,'sha256',p_sha256,'byte_size',p_bytes,'deduped',true);end if;
  raise exception 'Source identity reused for changed content' using errcode='40001';
 end if;
 if not exists(select 1 from storage.objects where bucket_id='fuel-sources' and name=path) then raise exception 'Original not uploaded' using errcode='P0002';end if;
 insert into public.fuel_source_documents(id,client_id,created_by,original_name,sha256,byte_size,storage_path,content_type) values(p_id,p_client,p_actor,p_name,p_sha256,p_bytes,path,p_mime);
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),p_actor,'fuel.report_original_registered','fuel_source',p_id,jsonb_build_object('client_id',p_client,'sha256',p_sha256,'byte_size',p_bytes,'content_type',p_mime));
 return jsonb_build_object('ok',true,'id',p_id,'client_id',p_client,'sha256',p_sha256,'byte_size',p_bytes,'deduped',false);
end $$;
revoke all on function public.register_fuel_report_source(uuid,uuid,uuid,text,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.register_fuel_report_source(uuid,uuid,uuid,text,text,integer,text) to service_role;

-- Durable rate control for paid document reading, not a fabricated assessment or extracted result.
create table if not exists public.fuel_report_read_attempts(id uuid primary key,actor_id uuid not null references public.profiles(id),source_id uuid not null references public.fuel_source_documents(id),client_id uuid not null references public.clients(id),created_at timestamptz not null default clock_timestamp());
alter table public.fuel_report_read_attempts enable row level security;
revoke all on public.fuel_report_read_attempts from public,anon,authenticated,service_role;
grant select on public.fuel_report_read_attempts to authenticated;
create policy fuel_report_attempts_coach_read on public.fuel_report_read_attempts for select to authenticated using(public.fuel_can_access(client_id,true));
create index if not exists fuel_report_attempts_actor_time on public.fuel_report_read_attempts(actor_id,created_at);
create trigger fuel_report_attempts_immutable before update or delete on public.fuel_report_read_attempts for each row execute function public.fuel_immutable();
create trigger fuel_report_attempts_no_truncate before truncate on public.fuel_report_read_attempts for each statement execute function public.fuel_immutable();
create or replace function public.reserve_fuel_report_read(p_actor uuid,p_client uuid,p_source uuid,p_request uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_request is null or p_actor is null or not exists(select 1 from public.profiles a join public.clients c on c.id=p_client join public.profiles s on s.id=c.id where a.id=p_actor and a.deleted_at is null and s.deleted_at is null and s.role='client' and (a.role='owner' or (a.role='trainer' and c.primary_trainer_id=a.id))) then raise exception 'Assigned active coach required' using errcode='42501';end if;
 if not exists(select 1 from public.fuel_source_documents where id=p_source and client_id=p_client) then raise exception 'Source not found' using errcode='P0002';end if;
 perform id from public.profiles where id=p_actor for update;
 if exists(select 1 from public.fuel_report_read_attempts where id=p_request) then raise exception 'Read already attempted; use manual entry or explicitly start a new read' using errcode='40001';end if;
 if (select count(*) from public.fuel_report_read_attempts where actor_id=p_actor and created_at>clock_timestamp()-interval '1 hour')>=30 then raise exception 'Report reading hourly limit reached' using errcode='54000';end if;
 insert into public.fuel_report_read_attempts(id,actor_id,source_id,client_id) values(p_request,p_actor,p_source,p_client);return true;
end $$;
revoke all on function public.reserve_fuel_report_read(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.reserve_fuel_report_read(uuid,uuid,uuid,uuid) to service_role;

-- Both writes commit together or neither does. Existing per-client commands own all validation,
-- authorization, optimistic revisions and replay receipts. This function never releases a strategy.
create or replace function public.save_fuel_nutrition_draft(p_client uuid,p_measure jsonb,p_plan jsonb,p_sources jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare source jsonb; refs text:=''; measured jsonb; saved jsonb;
begin
 if public.fuel_can_access(p_client,true) is distinct from true then raise exception 'Assigned active coach required' using errcode='42501';end if;
 if p_measure->>'action' is distinct from 'record_body_comp' or p_plan->>'action' is distinct from 'save_plan' or p_measure->>'source_kind' is distinct from 'source_transcription' or p_measure->>'method' is distinct from 'bod_pod' then raise exception 'Only private nutrition drafting is allowed' using errcode='22023';end if;
 if jsonb_typeof(p_sources) is distinct from 'array' or jsonb_array_length(p_sources) not between 1 and 3 then raise exception 'Confirmed original sources required' using errcode='22023';end if;
 for source in select value from jsonb_array_elements(p_sources) order by value->>'id' loop
  if not exists(select 1 from public.fuel_source_documents d where d.id=(source->>'id')::uuid and d.client_id=p_client and d.sha256=source->>'sha256') then raise exception 'Report source mismatch' using errcode='42501';end if;
  refs:=refs||case when refs='' then '' else ',' end||(source->>'id');
 end loop;
 measured:=public.execute_fuel_command(p_client,jsonb_set(p_measure,'{source_reference}',to_jsonb('documents:'||refs)));
 -- A reload/new request must not record the same baseline again. An exact retry
 -- returns the original entity and remains valid; a new duplicate rolls back in full.
 if exists(select 1 from public.fuel_body_comp_sources b where b.client_id=p_client and b.id<>(measured->>'entity_id')::uuid and b.source_reference='documents:'||refs and b.reported_values->>'date'=p_measure->>'date') then raise exception 'This source test is already recorded. Use its existing baseline from Build Fuel; no duplicate saved.' using errcode='23505';end if;
 saved:=public.execute_fuel_command(p_client,jsonb_set(p_plan,'{source_reference}',to_jsonb('ims-adult-nutrition-draft-v1; body_comp:'||(measured->>'entity_id')||'; documents:'||refs)));
 return jsonb_build_object('ok',true,'client_id',p_client,'measurement',measured,'strategy',saved);
end $$;
revoke all on function public.save_fuel_nutrition_draft(uuid,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_fuel_nutrition_draft(uuid,jsonb,jsonb,jsonb) to authenticated;
