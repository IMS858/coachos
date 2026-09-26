-- Original PDFs are private coaching evidence, never auto-published client plans.
create table public.fuel_source_documents(
 id uuid primary key,client_id uuid not null references public.clients(id),created_by uuid not null references public.profiles(id),
 original_name text not null,sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),byte_size integer not null check(byte_size between 8 and 8388608),
 storage_path text not null unique,created_at timestamptz not null default clock_timestamp()
);
alter table public.fuel_source_documents enable row level security;
revoke all on public.fuel_source_documents from public,anon,authenticated,service_role;
grant select on public.fuel_source_documents to authenticated;
create policy fuel_sources_coach_read on public.fuel_source_documents for select to authenticated using(public.fuel_can_access(client_id,true));
create trigger fuel_sources_immutable before update or delete on public.fuel_source_documents for each row execute function public.fuel_immutable();
create trigger fuel_sources_no_truncate before truncate on public.fuel_source_documents for each statement execute function public.fuel_immutable();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('fuel-sources','fuel-sources',false,8388608,array['application/pdf']);
-- Survives legacy permissive storage policies. Service access is behind active assigned-coach/owner authorization.
create policy fuel_sources_server_only on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id<>'fuel-sources') with check(bucket_id<>'fuel-sources');
create function public.register_fuel_source(p_actor uuid,p_client uuid,p_id uuid,p_name text,p_sha256 text,p_bytes integer)
 returns jsonb language plpgsql security definer set search_path='' as $$
 declare path text;prior public.fuel_source_documents%rowtype;
 begin
 if p_actor is null or not exists(select 1 from public.profiles a join public.clients c on c.id=p_client join public.profiles s on s.id=c.id
 where a.id=p_actor and a.deleted_at is null and s.deleted_at is null and s.role='client' and (a.role='owner' or (a.role='trainer' and c.primary_trainer_id=a.id))) then raise exception 'Source coach authorization required' using errcode='42501';end if;
 if p_id is null or p_name is null or char_length(btrim(p_name)) not between 1 and 160 or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_bytes is null or p_bytes not between 8 and 8388608 then raise exception 'Invalid source metadata' using errcode='22023';end if;
 perform id from public.clients where id=p_client for update;
 path:=p_client::text||'/'||p_actor::text||'/'||p_id::text||'.pdf';
 select * into prior from public.fuel_source_documents where id=p_id;
 if found then if prior.client_id=p_client and prior.created_by=p_actor and prior.sha256=p_sha256 and prior.byte_size=p_bytes and prior.original_name=p_name then return jsonb_build_object('ok',true,'id',p_id,'client_id',p_client,'sha256',p_sha256,'byte_size',p_bytes,'deduped',true);end if;raise exception 'Source identity reused for changed content' using errcode='40001';end if;
 if not exists(select 1 from storage.objects where bucket_id='fuel-sources' and name=path) then raise exception 'Original source upload not found' using errcode='P0002';end if;
 insert into public.fuel_source_documents(id,client_id,created_by,original_name,sha256,byte_size,storage_path) values(p_id,p_client,p_actor,p_name,p_sha256,p_bytes,path);
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),p_actor,'fuel.source_registered','fuel_source',p_id,jsonb_build_object('client_id',p_client,'sha256',p_sha256,'byte_size',p_bytes));
 return jsonb_build_object('ok',true,'id',p_id,'client_id',p_client,'sha256',p_sha256,'byte_size',p_bytes,'deduped',false);
 end $$;
revoke all on function public.register_fuel_source(uuid,uuid,uuid,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.register_fuel_source(uuid,uuid,uuid,text,text,integer) to service_role;
