-- Read-only external analytics. No ad activation, consumer import, conversion upload, posts, messages or money writes.
create table public.growth_acquisition_sources (
 connector text primary key check(connector in ('searchconsole','googleanalytics4','google_my_business')),
 account_id text not null check(length(account_id) between 1 and 300), label text not null check(length(label) between 1 and 160),
 hosts text[] not null default '{}', brand_terms text[] not null default '{}', daily_sync boolean not null default false,
 sync_owner_id uuid references public.profiles(id), revision integer not null default 1 check(revision>0), updated_at timestamptz not null default clock_timestamp(),
 check(not daily_sync or sync_owner_id is not null),check(cardinality(hosts)<=20),check(cardinality(brand_terms)<=20)
);
create table public.growth_acquisition_snapshots (
 id uuid primary key, connector text not null references public.growth_acquisition_sources(connector), account_id text not null,
 origin text not null check(origin in ('connector_import','manual_refresh','scheduled_refresh')),
 actor_id uuid references public.profiles(id), payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<1800000),
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'), created_at timestamptz not null default clock_timestamp()
);
create index growth_acquisition_snapshot_latest on public.growth_acquisition_snapshots(connector,created_at desc,id);
create table public.growth_acquisition_refreshes (
 id uuid primary key, connector text not null references public.growth_acquisition_sources(connector), account_id text not null,
 actor_id uuid not null references public.profiles(id), source_revision integer not null, start_on date not null,end_on date not null,
 origin text not null check(origin in ('manual_refresh','scheduled_refresh')), status text not null check(status in ('pending','completed','failed')),
 error_code text, snapshot_id uuid references public.growth_acquisition_snapshots(id), created_at timestamptz not null default clock_timestamp(),finished_at timestamptz,
 check(end_on>=start_on and end_on-start_on<=89)
);
create index growth_acquisition_refresh_window on public.growth_acquisition_refreshes(connector,created_at desc);
create table public.growth_acquisition_tasks (
 id uuid primary key, title text not null check(length(title) between 5 and 160),kind text not null check(kind in ('measurement','seo','local','conversion','campaign_draft')),
 evidence text not null check(length(evidence) between 15 and 2000),snapshot_ids uuid[] not null check(cardinality(snapshot_ids) between 1 and 3),
 status text not null check(status in ('planned','in_progress','done','dismissed')),due_on date,note text not null default '' check(length(note)<=2000),
 actor_id uuid not null references public.profiles(id),revision integer not null default 1 check(revision>0),updated_at timestamptz not null default clock_timestamp()
);
create table public.growth_acquisition_actions (id uuid primary key,actor_id uuid not null references public.profiles(id),command jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp());
do $$declare t text;begin
 foreach t in array array['growth_acquisition_sources','growth_acquisition_snapshots','growth_acquisition_refreshes','growth_acquisition_tasks','growth_acquisition_actions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated,service_role',t);
  execute format('create policy acquisition_owner_read on public.%I for select to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role=''owner'' and p.deleted_at is null))',t);
 end loop;
end$$;
-- Connector-bootstrap imports are explicitly system-origin (null actor). Never impersonate an owner's JWT.
-- Caller routes do not expose this service-only entry point and always pass a server-observed owner.
create function public.save_acquisition_snapshot(p_request uuid,p_connector text,p_account text,p_payload jsonb,p_origin text,p_actor uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare src public.growth_acquisition_sources%rowtype;old public.growth_acquisition_snapshots%rowtype;r jsonb;item jsonb;k text;start_day date;end_day date;seen text[]:='{}';pair text;answer jsonb;
begin
 if p_request is null or p_origin is null or p_origin not in ('connector_import','manual_refresh','scheduled_refresh') or (p_actor is null and p_origin<>'connector_import') then raise exception 'Invalid analytics origin' using errcode='22023';end if;
 if p_actor is not null then perform 1 from public.profiles where id=p_actor and role='owner' and deleted_at is null for share;if not found then raise exception 'Active owner required' using errcode='42501';end if;end if;
 select * into src from public.growth_acquisition_sources where connector=p_connector for share;
 if not found or src.account_id is distinct from p_account then raise exception 'Analytics source identity changed' using errcode='40001';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or not p_payload ?& array['version','start','end','observed_at','reports'] or exists(select 1 from jsonb_object_keys(p_payload) x where x not in ('version','start','end','observed_at','reports')) or p_payload->'version' is distinct from '1'::jsonb or octet_length(p_payload::text)>1700000 then raise exception 'Invalid snapshot envelope' using errcode='22023';end if;
 start_day:=(p_payload->>'start')::date;end_day:=(p_payload->>'end')::date;
 if start_day is null or end_day is null or end_day<start_day or end_day-start_day>89 or end_day>=(now() at time zone 'America/Los_Angeles')::date or (p_payload->>'observed_at')::timestamptz is null or (p_payload->>'observed_at')::timestamptz>now()+interval '1 minute' or jsonb_typeof(p_payload->'reports') is distinct from 'array' or jsonb_array_length(p_payload->'reports') not between 1 and 8 then raise exception 'Invalid snapshot period' using errcode='22023';end if;
 for r in select * from jsonb_array_elements(p_payload->'reports') loop
  if jsonb_typeof(r)<>'object' or not r ?& array['kind','period','status','fields','rows','note'] or exists(select 1 from jsonb_object_keys(r) x where x not in ('kind','period','status','fields','rows','note')) or r->>'kind' is null or r->>'period' is null or r->>'status' is null or r->>'kind' not in ('overview','queries','pages','hosts','channels','events','profile') or r->>'period' not in ('current','previous','profile') or r->>'status' not in ('available','empty','unavailable','limited') or jsonb_typeof(r->'rows') is distinct from 'array' or jsonb_array_length(r->'rows')>1000 or jsonb_typeof(r->'fields') is distinct from 'array' or jsonb_array_length(r->'fields') not between 1 and 12 or jsonb_typeof(r->'note') is distinct from 'string' or length(r->>'note')>1500 then raise exception 'Invalid report' using errcode='22023';end if;
  pair:=(r->>'kind')||':'||(r->>'period');if pair=any(seen) then raise exception 'Duplicate report grain' using errcode='22023';end if;seen:=array_append(seen,pair);
  if (r->>'status' in ('empty','unavailable') and jsonb_array_length(r->'rows')<>0) or (r->>'status' in ('available','limited') and jsonb_array_length(r->'rows')=0) then raise exception 'Report status conflicts with rows' using errcode='22023';end if;
  for item in select * from jsonb_array_elements(r->'rows') loop
   if jsonb_typeof(item)<>'object' or exists(select 1 from jsonb_each(item) e where not (r->'fields') ? e.key or jsonb_typeof(e.value) not in ('string','number','null') or jsonb_typeof(e.value)='string' and length(e.value#>>'{}')>2048 or jsonb_typeof(e.value)='number' and ((e.value#>>'{}')::numeric<0 or (e.value#>>'{}')::numeric>1000000000000)) then raise exception 'Invalid aggregate row' using errcode='22023';end if;
  end loop;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('ims-acquisition-snapshot:'||p_request::text,0));
 select * into old from public.growth_acquisition_snapshots where id=p_request;
 if found then if old.connector<>p_connector or old.account_id<>p_account or old.origin<>p_origin or old.actor_id is distinct from p_actor or old.payload<>p_payload then raise exception 'Snapshot request reused' using errcode='23505';end if;return jsonb_build_object('ok',true,'id',p_request,'deduped',true);end if;
 insert into public.growth_acquisition_snapshots(id,connector,account_id,origin,actor_id,payload,fingerprint) values(p_request,p_connector,p_account,p_origin,p_actor,p_payload,encode(sha256(convert_to(p_payload::text,'UTF8')),'hex'));
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),p_actor,'growth.acquisition_snapshot_saved','growth_acquisition_snapshot',p_request,jsonb_build_object('connector',p_connector,'origin',p_origin,'start',start_day,'end',end_day,'source_writes',false));
 answer:=jsonb_build_object('ok',true,'id',p_request,'deduped',false);return answer;
end$$;
revoke all on function public.save_acquisition_snapshot(uuid,text,text,jsonb,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_acquisition_snapshot(uuid,text,text,jsonb,text,uuid) to service_role;
create function public.reserve_acquisition_refresh(p_actor uuid,p_request uuid,p_connector text,p_start date,p_end date,p_origin text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.growth_acquisition_sources%rowtype;r public.growth_acquisition_refreshes%rowtype;
begin
 perform 1 from public.profiles where id=p_actor and role='owner' and deleted_at is null for share;if not found then raise exception 'Active owner required' using errcode='42501';end if;
 if p_request is null or p_start is null or p_end is null or p_origin is null or p_origin not in ('manual_refresh','scheduled_refresh') or p_end<p_start or p_end-p_start>89 or p_end>=(now() at time zone 'America/Los_Angeles')::date then raise exception 'Invalid refresh request' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('ims-acquisition-source:'||p_connector,0));
 select * into s from public.growth_acquisition_sources where connector=p_connector for share;if not found then raise exception 'Source not configured' using errcode='22023';end if;
 select * into r from public.growth_acquisition_refreshes where id=p_request;
 if found then if r.connector<>p_connector or r.account_id<>s.account_id or r.actor_id<>p_actor or r.start_on<>p_start or r.end_on<>p_end or r.origin<>p_origin then raise exception 'Refresh identity changed' using errcode='23505';end if;return jsonb_build_object('ok',true,'id',p_request,'dispatch',false,'status',r.status);end if;
 if p_origin='scheduled_refresh' and (not s.daily_sync or s.sync_owner_id<>p_actor) then raise exception 'Scheduled refresh not approved' using errcode='42501';end if;
 update public.growth_acquisition_refreshes set status='failed',error_code='interrupted_refresh',finished_at=clock_timestamp() where connector=p_connector and status='pending' and created_at<now()-interval '3 minutes';
 if exists(select 1 from public.growth_acquisition_refreshes where connector=p_connector and status='pending') then raise exception 'Refresh already running' using errcode='40001';end if;
 if (select count(*) from public.growth_acquisition_refreshes where connector=p_connector and created_at>now()-interval '24 hours')>=8 then raise exception 'Refresh allowance reached' using errcode='54000';end if;
 insert into public.growth_acquisition_refreshes(id,connector,account_id,actor_id,source_revision,start_on,end_on,origin,status) values(p_request,p_connector,s.account_id,p_actor,s.revision,p_start,p_end,p_origin,'pending');
 return jsonb_build_object('ok',true,'id',p_request,'dispatch',true,'status','pending');
end$$;
revoke all on function public.reserve_acquisition_refresh(uuid,uuid,text,date,date,text) from public,anon,authenticated,service_role;
grant execute on function public.reserve_acquisition_refresh(uuid,uuid,text,date,date,text) to service_role;
create function public.finish_acquisition_refresh(p_actor uuid,p_request uuid,p_payload jsonb,p_error text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.growth_acquisition_refreshes%rowtype;s public.growth_acquisition_sources%rowtype;answer jsonb;
begin
 perform 1 from public.profiles where id=p_actor and role='owner' and deleted_at is null for share;if not found then raise exception 'Active owner required' using errcode='42501';end if;
 select * into r from public.growth_acquisition_refreshes where id=p_request for update;if not found or r.actor_id<>p_actor then raise exception 'Refresh not authorized' using errcode='42501';end if;
 if r.status<>'pending' then return jsonb_build_object('ok',true,'id',r.id,'status',r.status,'snapshot_id',r.snapshot_id,'deduped',true);end if;
 select * into s from public.growth_acquisition_sources where connector=r.connector for share;
 if s.account_id is distinct from r.account_id or s.revision is distinct from r.source_revision then raise exception 'Source settings changed during refresh' using errcode='40001';end if;
 if p_error is not null then if p_error not in ('provider_read_failed','invalid_source_evidence','runtime_not_configured') then raise exception 'Invalid error category' using errcode='22023';end if;
  update public.growth_acquisition_refreshes set status='failed',error_code=p_error,finished_at=clock_timestamp() where id=p_request;
 else
  if (p_payload->>'start')::date is distinct from r.start_on or (p_payload->>'end')::date is distinct from r.end_on then raise exception 'Source period changed' using errcode='22023';end if;
  answer:=public.save_acquisition_snapshot(p_request,r.connector,r.account_id,p_payload,r.origin,p_actor);
  update public.growth_acquisition_refreshes set status='completed',snapshot_id=p_request,finished_at=clock_timestamp() where id=p_request;
 end if;
 return jsonb_build_object('ok',true,'id',p_request,'status',case when p_error is null then 'completed' else 'failed' end,'snapshot_id',case when p_error is null then p_request else null end,'deduped',false);
end$$;
revoke all on function public.finish_acquisition_refresh(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.finish_acquisition_refresh(uuid,uuid,jsonb,text) to service_role;
create function public.execute_acquisition_command(p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();req uuid;act text;keys text[];s public.growth_acquisition_sources%rowtype;t public.growth_acquisition_tasks%rowtype;r public.growth_acquisition_actions%rowtype;entity uuid;version integer;answer jsonb;
begin
 perform 1 from public.profiles where id=actor and role='owner' and deleted_at is null for share;if not found then raise exception 'Active owner required' using errcode='42501';end if;
 if p_command is null or jsonb_typeof(p_command)<>'object' or octet_length(p_command::text)>12000 then raise exception 'Invalid analytics action' using errcode='22023';end if;
 req:=(p_command->>'request_id')::uuid;act:=p_command->>'action';
 keys:=case act when 'source_options' then array['action','request_id','connector','expected_revision','daily_sync','brand_terms','confirmed'] when 'save_task' then array['action','request_id','task_id','expected_revision','title','kind','evidence','snapshot_ids','status','due_on','note'] end;
 if req is null or keys is null or not p_command ?& keys or exists(select 1 from jsonb_object_keys(p_command) k where not k=any(keys)) or jsonb_typeof(p_command->'expected_revision') is distinct from 'number' or p_command->>'expected_revision' !~ '^[0-9]+$' then raise exception 'Invalid analytics action fields' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('ims-acquisition-action:'||req::text,0));
 select * into r from public.growth_acquisition_actions where id=req;if found then if r.actor_id<>actor or r.command<>p_command then raise exception 'Action identity reused' using errcode='23505';end if;return r.result||jsonb_build_object('deduped',true);end if;
 if act='source_options' then
  select * into s from public.growth_acquisition_sources where connector=p_command->>'connector' for update;
  if not found or s.revision<>(p_command->>'expected_revision')::integer then raise exception 'Source options changed' using errcode='40001';end if;
  if p_command->'confirmed' is distinct from 'true'::jsonb or jsonb_typeof(p_command->'daily_sync') is distinct from 'boolean' or jsonb_typeof(p_command->'brand_terms') is distinct from 'array' or jsonb_array_length(p_command->'brand_terms') not between 1 and 20 or exists(select 1 from jsonb_array_elements(p_command->'brand_terms') x where jsonb_typeof(x)<>'string' or length(btrim(x#>>'{}')) not between 3 and 80) then raise exception 'Invalid approved source options' using errcode='22023';end if;
  version:=s.revision+1;update public.growth_acquisition_sources set daily_sync=(p_command->>'daily_sync')::boolean,sync_owner_id=actor,brand_terms=array(select jsonb_array_elements_text(p_command->'brand_terms')),revision=version,updated_at=clock_timestamp() where connector=s.connector;
  entity:=req;
 else
  entity:=coalesce((p_command->>'task_id')::uuid,req);perform pg_advisory_xact_lock(hashtextextended('ims-acquisition-task:'||entity::text,0));select * into t from public.growth_acquisition_tasks where id=entity for update;
  if coalesce(t.revision,0)<>(p_command->>'expected_revision')::integer then raise exception 'Task changed' using errcode='40001';end if;
  if jsonb_typeof(p_command->'snapshot_ids') is distinct from 'array' or jsonb_array_length(p_command->'snapshot_ids') not between 1 and 3 or exists(select 1 from jsonb_array_elements_text(p_command->'snapshot_ids') sid where not exists(select 1 from public.growth_acquisition_snapshots where id=sid::uuid)) then raise exception 'Snapshot evidence required' using errcode='22023';end if;
  if p_command->>'status'='done' and length(btrim(coalesce(p_command->>'note','')))<10 then raise exception 'Record the completed outcome' using errcode='22023';end if;
  version:=coalesce(t.revision,0)+1;
  insert into public.growth_acquisition_tasks(id,title,kind,evidence,snapshot_ids,status,due_on,note,actor_id,revision) values(entity,btrim(p_command->>'title'),p_command->>'kind',btrim(p_command->>'evidence'),array(select jsonb_array_elements_text(p_command->'snapshot_ids'))::uuid[],p_command->>'status',(p_command->>'due_on')::date,p_command->>'note',actor,version)
  on conflict(id) do update set title=excluded.title,kind=excluded.kind,evidence=excluded.evidence,snapshot_ids=excluded.snapshot_ids,status=excluded.status,due_on=excluded.due_on,note=excluded.note,actor_id=actor,revision=version,updated_at=clock_timestamp();
 end if;
 answer:=jsonb_build_object('ok',true,'request_id',req,'id',entity,'action',act,'revision',version,'deduped',false);
 insert into public.growth_acquisition_actions values(req,actor,p_command,answer,clock_timestamp());
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),actor,'growth.acquisition_'||act,'growth_acquisition',entity,jsonb_build_object('request_id',req,'revision',version,'external_write',false));return answer;
end$$;
revoke all on function public.execute_acquisition_command(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.execute_acquisition_command(jsonb) to authenticated;
