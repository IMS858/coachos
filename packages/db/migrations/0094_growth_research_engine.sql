-- Public organization research only. No outreach, consumer enrichment, money movement or automatic qualification.
-- Both owner settings and the server feature flag default off. A planning reservation is NOT a provider invoice.
create table public.growth_research_settings (
 singleton boolean primary key default true check(singleton), owner_id uuid not null references public.profiles(id),
 revision integer not null check(revision>0), config jsonb not null check(jsonb_typeof(config)='object' and octet_length(config::text)<16000), updated_at timestamptz not null default now()
);
create table public.growth_research_control_receipts (
 id uuid primary key, actor_id uuid not null references public.profiles(id), command jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
create table public.growth_research_runs (
 id uuid primary key, owner_id uuid not null references public.profiles(id), settings_revision integer not null,
 config jsonb not null, environment text not null check(environment in ('preview','production')), origin text not null check(origin in ('manual','radar')),
 status text not null check(status in ('starting','researching','completed','failed','unconfirmed','cancelled')),
 response_id text unique, reserved_cents integer not null default 200 check(reserved_cents=200),
 counts jsonb, usage jsonb, error_code text check(char_length(error_code)<=100), created_at timestamptz not null default now(), finished_at timestamptz,
 check(response_id is null or response_id ~ '^resp_[A-Za-z0-9_-]{1,160}$')
);
create index growth_research_run_window on public.growth_research_runs(created_at desc);
create unique index growth_research_one_pending on public.growth_research_runs((true)) where status in ('starting','researching');
create table public.growth_research_candidates (
 domain text primary key check(domain ~ '^[a-z0-9][a-z0-9.-]+\.[a-z]{2,63}$' and char_length(domain)<=200),
 lead_id uuid unique not null references public.leads(id), run_id uuid not null references public.growth_research_runs(id),
 score integer not null check(score between 0 and 100), lane text not null,
 evidence jsonb not null check(jsonb_typeof(evidence)='object' and octet_length(evidence::text)<=20000), created_at timestamptz not null default now()
);
create index growth_research_candidates_run on public.growth_research_candidates(run_id);
do $$declare t text;begin
 foreach t in array array['growth_research_settings','growth_research_control_receipts','growth_research_runs','growth_research_candidates'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated,service_role',t);
  execute format('create policy owner_research_read on public.%I for select to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role=''owner'' and p.deleted_at is null))',t);
 end loop;
end$$;
create function public.growth_research_config_valid(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare required text[]:=array['enabled','radar_enabled','area','lanes','max_candidates','min_score','daily_runs','monthly_runs','monthly_allowance_cents','blocked_domains','public_research_approved'];k text;
begin
 if p is null or jsonb_typeof(p)<>'object' or not p ?& required or exists(select 1 from jsonb_object_keys(p) x where not x=any(required)) then return false;end if;
 if jsonb_typeof(p->'enabled') is distinct from 'boolean' or jsonb_typeof(p->'radar_enabled') is distinct from 'boolean' or p->'public_research_approved' is distinct from 'true'::jsonb or p->>'area' is null or p->>'area' not in ('nearby','north','sandiego') then return false;end if;
 if p->'radar_enabled'='true'::jsonb and p->'enabled'<>'true'::jsonb then return false;end if;
 foreach k in array array['max_candidates','min_score','daily_runs','monthly_runs','monthly_allowance_cents'] loop
  if jsonb_typeof(p->k) is distinct from 'number' or p->>k !~ '^[0-9]+$' then return false;end if;
 end loop;
 if (p->>'max_candidates')::integer not between 1 and 12 or (p->>'min_score')::integer not between 0 and 100 or (p->>'daily_runs')::integer not between 1 and 3 or (p->>'monthly_runs')::integer not between 1 and 60 or (p->>'monthly_allowance_cents')::integer not between 200 and 20000 then return false;end if;
 if jsonb_typeof(p->'lanes') is distinct from 'array' or jsonb_array_length(p->'lanes') not between 1 and 4 or exists(select 1 from jsonb_array_elements(p->'lanes') x where jsonb_typeof(x)<>'string' or x#>>'{}' not in ('private_coaching','referrals','bod_pod_fuel','workplace','golf_racquet','sports','community','classes')) then return false;end if;
 if (select count(distinct x) from jsonb_array_elements_text(p->'lanes') x)<>jsonb_array_length(p->'lanes') then return false;end if;
 if jsonb_typeof(p->'blocked_domains') is distinct from 'array' or jsonb_array_length(p->'blocked_domains')>50 or exists(select 1 from jsonb_array_elements(p->'blocked_domains') x where jsonb_typeof(x)<>'string' or x#>>'{}' !~ '^[a-z0-9][a-z0-9.-]+\.[a-z]{2,63}$' or length(x#>>'{}')>200) then return false;end if;
 return true;
exception when others then return false;
end$$;
revoke all on function public.growth_research_config_valid(jsonb) from public,anon,authenticated,service_role;
create function public.save_growth_research_settings(p_request uuid,p_expected integer,p_config jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();s public.growth_research_settings%rowtype;r public.growth_research_control_receipts%rowtype;answer jsonb;command jsonb:=jsonb_build_object('expected',p_expected,'config',p_config);
begin
 perform 1 from public.profiles where id=actor and role='owner' and deleted_at is null for share;if not found then raise exception 'Active owner required' using errcode='42501';end if;
 if p_request is null or p_expected is null or p_expected<0 or not public.growth_research_config_valid(p_config) then raise exception 'Invalid research settings' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('ims-growth-research-settings',0));
 select * into r from public.growth_research_control_receipts where id=p_request;
 if found then if r.actor_id<>actor or r.command<>command then raise exception 'Request reused' using errcode='23505';end if;return r.result||jsonb_build_object('deduped',true);end if;
 select * into s from public.growth_research_settings where singleton for update;
 if coalesce(s.revision,0)<>p_expected then raise exception 'Settings changed; reload' using errcode='40001';end if;
 insert into public.growth_research_settings(singleton,owner_id,revision,config) values(true,actor,p_expected+1,p_config)
 on conflict(singleton) do update set owner_id=actor,revision=p_expected+1,config=p_config,updated_at=clock_timestamp();
 answer:=jsonb_build_object('ok',true,'request_id',p_request,'revision',p_expected+1,'deduped',false);
 insert into public.growth_research_control_receipts values(p_request,actor,command,answer,now());
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),actor,'growth.research_settings_saved','growth_research_settings',p_request,jsonb_build_object('revision',p_expected+1,'enabled',p_config->'enabled','radar_enabled',p_config->'radar_enabled','outreach_enabled',false));
 return answer;
end$$;
revoke all on function public.save_growth_research_settings(uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_growth_research_settings(uuid,integer,jsonb) to authenticated;
-- Service-only dispatch. The application supplies only a server-observed, revalidated owner.
create function public.reserve_growth_research(p_actor uuid,p_request uuid,p_revision integer,p_environment text,p_origin text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.growth_research_settings%rowtype;r public.growth_research_runs%rowtype;day_count integer;month_count integer;reserved integer;
begin
 perform 1 from public.profiles where id=p_actor and role='owner' and deleted_at is null for share;if not found then raise exception 'Active owner required' using errcode='42501';end if;
 if p_request is null or p_environment is null or p_origin is null or p_environment not in ('preview','production') or p_origin not in ('manual','radar') then raise exception 'Invalid dispatch' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('ims-growth-research-settings',0));
 select * into r from public.growth_research_runs where id=p_request;
 if found then if r.owner_id<>p_actor or r.settings_revision is distinct from p_revision or r.environment<>p_environment or r.origin<>p_origin then raise exception 'Request reused' using errcode='23505';end if;return jsonb_build_object('ok',true,'id',r.id,'dispatch',false);end if;
 select * into s from public.growth_research_settings where singleton for update;
 if not found or s.revision is distinct from p_revision then raise exception 'Settings changed; reload' using errcode='40001';end if;
 if s.config->'enabled'<>'true'::jsonb or p_origin='radar' and (s.config->'radar_enabled'<>'true'::jsonb or p_environment<>'production' or s.owner_id<>p_actor) then raise exception 'Research not enabled' using errcode='42501';end if;
 update public.growth_research_runs set status='unconfirmed',error_code='stale_dispatch',finished_at=clock_timestamp() where status in ('starting','researching') and created_at<now()-interval '2 hours';
 if exists(select 1 from public.growth_research_runs where status in ('starting','researching')) then raise exception 'Research already running' using errcode='40001';end if;
 select count(*) filter(where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),count(*),coalesce(sum(reserved_cents),0) into day_count,month_count,reserved from public.growth_research_runs where created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
 if day_count>=(s.config->>'daily_runs')::integer or month_count>=(s.config->>'monthly_runs')::integer or reserved+200>(s.config->>'monthly_allowance_cents')::integer then raise exception 'Research allowance reached' using errcode='54000';end if;
 if p_origin='radar' and exists(select 1 from public.growth_research_runs where origin='radar' and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') then raise exception 'Radar already dispatched today' using errcode='54000';end if;
 insert into public.growth_research_runs(id,owner_id,settings_revision,config,environment,origin,status) values(p_request,p_actor,p_revision,s.config,p_environment,p_origin,'starting');
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),p_actor,'growth.research_reserved','growth_research_run',p_request,jsonb_build_object('revision',p_revision,'environment',p_environment,'origin',p_origin,'planning_reserved_cents',200,'is_invoice',false));
 return jsonb_build_object('ok',true,'id',p_request,'dispatch',true);
end$$;
revoke all on function public.reserve_growth_research(uuid,uuid,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function public.reserve_growth_research(uuid,uuid,integer,text,text) to service_role;
create function public.growth_research_legacy_domain(p_notes text) returns text language plpgsql immutable set search_path='' as $$
declare j jsonb;begin j:=p_notes::jsonb;if j->>'type'<>'research_opportunity' then return null;end if;return regexp_replace(lower(substring(j->>'website_url' from '^https://([^/?#:]+)')),'^www\.','');exception when others then return null;end$$;
revoke all on function public.growth_research_legacy_domain(text) from public,anon,authenticated,service_role;
create function public.record_growth_research_result(p_actor uuid,p_run uuid,p_response text,p_status text,p_result jsonb default '{}'::jsonb,p_error text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.growth_research_runs%rowtype;item jsonb;domain_key text;lead_key uuid;inserted integer:=0;dupes integer:=0;result_counts jsonb;answer jsonb;
begin
 perform 1 from public.profiles where id=p_actor and role='owner' and deleted_at is null for share;if not found then raise exception 'Active owner required' using errcode='42501';end if;
 select * into r from public.growth_research_runs where id=p_run for update;
 if not found or r.owner_id<>p_actor then raise exception 'Run not authorized' using errcode='42501';end if;
 if p_status is null or p_status not in ('researching','completed','failed','unconfirmed','cancelled') or p_error is not null and length(p_error)>100 or p_response is not null and p_response !~ '^resp_[A-Za-z0-9_-]{1,160}$' then raise exception 'Invalid result' using errcode='22023';end if;
 if r.response_id is not null and r.response_id is distinct from p_response then raise exception 'Provider identity changed' using errcode='23505';end if;
 if r.status in ('completed','failed','cancelled') then return jsonb_build_object('ok',true,'id',r.id,'status',r.status,'counts',r.counts,'deduped',true);end if;
 if p_status in ('researching','completed') and p_response is null then raise exception 'Provider receipt required' using errcode='22023';end if;
 if p_status='completed' then
  if jsonb_typeof(p_result->'candidates') is distinct from 'array' or jsonb_array_length(p_result->'candidates')>(r.config->>'max_candidates')::integer or coalesce(p_result->>'returned','') !~ '^[0-9]+$' or (p_result->>'returned')::integer>12 or coalesce(p_result->>'rejected','') !~ '^[0-9]+$' or coalesce(p_result->>'duplicates','') !~ '^[0-9]+$' then raise exception 'Invalid candidate result' using errcode='22023';end if;
  for item in select * from jsonb_array_elements(p_result->'candidates') loop
   domain_key:=item->>'domain';
   if domain_key is null or domain_key !~ '^[a-z0-9][a-z0-9.-]+\.[a-z]{2,63}$' or length(domain_key)>200 or item->>'type' is distinct from 'research_opportunity' or item->>'qualification' is distinct from 'unverified' or item->'outreach_sent' is distinct from 'false'::jsonb or item->>'website_url' is distinct from 'https://'||domain_key or coalesce(item->>'evidence_url','') !~ '^https://' or coalesce(char_length(item->>'organization'),0) not between 2 and 160 or item->>'lane' is null or not (r.config->'lanes') ? (item->>'lane') or coalesce(item->>'score','') !~ '^[0-9]+$' or (item->>'score')::integer not between (r.config->>'min_score')::integer and 100 or item->>'checked_on' is null or (item->>'checked_on')::date>current_date or octet_length(item::text)>20000 then raise exception 'Invalid organization evidence' using errcode='22023';end if;
   if exists(select 1 from jsonb_array_elements_text(r.config->'blocked_domains') d where domain_key=d or domain_key like '%.'||d) then raise exception 'Blocked domain in result' using errcode='22023';end if;
   perform pg_advisory_xact_lock(hashtextextended('ims-research-domain:'||domain_key,0));
   if exists(select 1 from public.growth_research_candidates where domain=domain_key) or exists(select 1 from public.leads l where l.source='agent_research' and public.growth_research_legacy_domain(l.notes)=domain_key) then dupes:=dupes+1;continue;end if;
   lead_key:=gen_random_uuid();
   insert into public.leads(id,full_name,email,phone,interest,source,stage,notes) values(lead_key,item->>'organization',null,null,'Organization partnership research','agent_research','new',(item||jsonb_build_object('run_id',p_run,'submitted_by',p_actor))::text);
   insert into public.growth_research_candidates(domain,lead_id,run_id,score,lane,evidence) values(domain_key,lead_key,p_run,(item->>'score')::integer,item->>'lane',item);
   inserted:=inserted+1;
  end loop;
  result_counts:=jsonb_build_object('returned',(p_result->>'returned')::integer,'accepted',inserted,'duplicates',dupes+(p_result->>'duplicates')::integer,'rejected',(p_result->>'rejected')::integer);
  if inserted+dupes+(p_result->>'duplicates')::integer+(p_result->>'rejected')::integer<>(p_result->>'returned')::integer then raise exception 'Research counts do not reconcile' using errcode='22023';end if;
 end if;
 update public.growth_research_runs target set response_id=coalesce(target.response_id,p_response),status=p_status,counts=coalesce(result_counts,target.counts),usage=case when p_status='completed' then p_result->'usage' else target.usage end,error_code=p_error,finished_at=case when p_status='researching' then null else clock_timestamp() end where id=p_run;
 answer:=jsonb_build_object('ok',true,'id',p_run,'status',p_status,'counts',result_counts,'deduped',false);
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),p_actor,'growth.research_'||p_status,'growth_research_run',p_run,jsonb_build_object('counts',result_counts,'error_code',p_error,'outreach_sent',false));
 return answer;
end$$;
revoke all on function public.record_growth_research_result(uuid,uuid,text,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.record_growth_research_result(uuid,uuid,text,text,jsonb,text) to service_role;
