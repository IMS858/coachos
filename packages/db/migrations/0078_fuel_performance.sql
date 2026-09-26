-- Fuel & Performance. REHEARSE FIRST. No seed clients, measurements, prescriptions or payments.
-- Existing clients and body_comp_records remain the durable operational identities.
create table public.fuel_plan_versions(
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete restrict,
 revision integer not null check(revision>0), content jsonb not null check(jsonb_typeof(content)='object'),
 origin text not null check(origin in ('coach_authored','source_transcription','ai_proposed')), source_reference text not null,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default clock_timestamp(),
 unique(client_id,revision), unique(id,client_id)
);
create table public.fuel_plan_releases(
 id uuid primary key default gen_random_uuid(),client_id uuid not null references public.clients(id) on delete restrict,
 version_id uuid,sequence integer not null check(sequence>0),reason text not null,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),
 unique(client_id,sequence),foreign key(version_id,client_id) references public.fuel_plan_versions(id,client_id)
);
create table public.fuel_journal_entries(
 id uuid primary key default gen_random_uuid(),client_id uuid not null references public.clients(id) on delete restrict,
 kind text not null check(kind in ('daily','weekly')),entry_date date not null,revision integer not null check(revision>0),
 plan_version_id uuid,payload jsonb not null check(jsonb_typeof(payload)='object'),
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),
 unique(client_id,kind,entry_date,revision),unique(id,client_id),
 foreign key(plan_version_id,client_id) references public.fuel_plan_versions(id,client_id)
);
create table public.fuel_coach_reviews(
 id uuid primary key default gen_random_uuid(),client_id uuid not null references public.clients(id) on delete restrict,
 entry_id uuid not null unique,note text not null,disposition text not null check(disposition in ('reviewed','contact','referral')),
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),
 foreign key(entry_id,client_id) references public.fuel_journal_entries(id,client_id)
);
create table public.fuel_body_comp_sources(
 id uuid primary key references public.body_comp_records(id) on delete restrict,
 client_id uuid not null references public.clients(id),source_kind text not null check(source_kind in ('coach_measurement','source_transcription')),
 source_reference text not null,protocol text not null,reported_values jsonb not null,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp()
);
create table public.fuel_command_receipts(
 request_id uuid primary key,client_id uuid not null references public.clients(id),actor_id uuid not null references public.profiles(id),
 command jsonb not null,receipt jsonb not null,created_at timestamptz not null default clock_timestamp()
);
create index fuel_releases_client_sequence on public.fuel_plan_releases(client_id,sequence desc);
create index fuel_journal_client_date on public.fuel_journal_entries(client_id,entry_date desc,kind,revision desc);
create index fuel_reviews_client on public.fuel_coach_reviews(client_id,entry_id);

create function public.fuel_can_access(p_client uuid,p_staff_only boolean default false) returns boolean
 language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles actor join public.clients c on c.id=p_client
 join public.profiles subject on subject.id=c.id
 where actor.id=auth.uid() and actor.deleted_at is null and subject.deleted_at is null and subject.role='client'
 and (actor.role='owner' or (actor.role='trainer' and c.primary_trainer_id=actor.id)
 or (not p_staff_only and actor.role='client' and actor.id=c.id))) $$;
revoke all on function public.fuel_can_access(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.fuel_can_access(uuid,boolean) to authenticated;

alter table public.fuel_plan_versions enable row level security;
alter table public.fuel_plan_releases enable row level security;
alter table public.fuel_journal_entries enable row level security;
alter table public.fuel_coach_reviews enable row level security;
alter table public.fuel_body_comp_sources enable row level security;
alter table public.fuel_command_receipts enable row level security;
revoke all on public.fuel_plan_versions,public.fuel_plan_releases,public.fuel_journal_entries,public.fuel_coach_reviews,public.fuel_body_comp_sources,public.fuel_command_receipts from public,anon,authenticated,service_role;
grant select on public.fuel_plan_versions,public.fuel_plan_releases,public.fuel_journal_entries,public.fuel_coach_reviews,public.fuel_body_comp_sources to authenticated;
create policy fuel_releases_read on public.fuel_plan_releases for select to authenticated using(public.fuel_can_access(client_id));
create policy fuel_versions_read on public.fuel_plan_versions for select to authenticated using(
 public.fuel_can_access(client_id,true) or (public.fuel_can_access(client_id) and exists(select 1 from public.fuel_plan_releases r where r.client_id=fuel_plan_versions.client_id and r.version_id=fuel_plan_versions.id)));
create policy fuel_journal_read on public.fuel_journal_entries for select to authenticated using(public.fuel_can_access(client_id));
create policy fuel_reviews_read on public.fuel_coach_reviews for select to authenticated using(public.fuel_can_access(client_id));
create policy fuel_body_sources_read on public.fuel_body_comp_sources for select to authenticated using(public.fuel_can_access(client_id,true));

create function public.fuel_immutable() returns trigger language plpgsql set search_path='' as $$
 begin raise exception 'Fuel history is append-only; create a new version or correction' using errcode='42501';end $$;
revoke all on function public.fuel_immutable() from public,anon,authenticated,service_role;
do $$declare name text;begin
 foreach name in array array['fuel_plan_versions','fuel_plan_releases','fuel_journal_entries','fuel_coach_reviews','fuel_body_comp_sources','fuel_command_receipts'] loop
 execute format('create trigger fuel_immutable_rows before update or delete on public.%I for each row execute function public.fuel_immutable()',name);
 execute format('create trigger fuel_immutable_truncate before truncate on public.%I for each statement execute function public.fuel_immutable()',name);
 end loop;end $$;

-- Independent SQL validation: callers cannot bypass the TypeScript schema by invoking RPC directly.
create function public.fuel_assert_keys(p jsonb,keys text[]) returns void language plpgsql set search_path='' as $$
 begin if jsonb_typeof(p) is distinct from 'object' then raise exception 'Invalid fuel object' using errcode='22023';end if;
 if not(p ?& keys) or exists(select 1 from jsonb_object_keys(p) k where not(k=any(keys))) then raise exception 'Unsupported or missing fuel fields' using errcode='22023';end if;end $$;
create function public.fuel_assert_text(v jsonb,low integer,high integer) returns void language plpgsql set search_path='' as $$
 begin if jsonb_typeof(v) is distinct from 'string' or char_length(btrim(v#>>'{}')) not between low and high or char_length(v#>>'{}')>high then raise exception 'Invalid fuel text' using errcode='22023';end if;end $$;
create function public.fuel_assert_number(v jsonb,low numeric,high numeric,whole boolean default false) returns void language plpgsql set search_path='' as $$
 declare n numeric;begin if v='null'::jsonb then return;end if;
 if jsonb_typeof(v) is distinct from 'number' then raise exception 'Invalid fuel number' using errcode='22023';end if;n:=(v#>>'{}')::numeric;
 if n<low or n>high or (whole and trunc(n)<>n) then raise exception 'Fuel number outside input bounds' using errcode='22023';end if;end $$;
create function public.fuel_assert_date(v jsonb) returns date language plpgsql set search_path='' as $$
 declare d date;begin if jsonb_typeof(v) is distinct from 'string' or (v#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid fuel date' using errcode='22023';end if;
 begin d:=(v#>>'{}')::date;exception when others then raise exception 'Invalid fuel date' using errcode='22023';end;return d;end $$;
create function public.fuel_assert_targets(p jsonb) returns void language plpgsql set search_path='' as $$
 begin perform public.fuel_assert_keys(p,array['kcal','protein_g','carbs_g','fat_g']);
 perform public.fuel_assert_number(p->'kcal',0,10000);perform public.fuel_assert_number(p->'protein_g',0,1000);
 perform public.fuel_assert_number(p->'carbs_g',0,2000);perform public.fuel_assert_number(p->'fat_g',0,1000);end $$;
create function public.fuel_assert_plan(p jsonb) returns void language plpgsql set search_path='' as $$
 declare phase jsonb;meal jsonb;v jsonb;first date;last date;a date;b date;previous_end date;
 begin
 perform public.fuel_assert_keys(p,array['schema_version','title','goal','start','end','event_date','mode','habits','phases','meals','grocery','guidance','review_on']);
 if p->'schema_version' is distinct from '1'::jsonb or p->>'mode' is null or p->>'mode' not in ('habits','targets') then raise exception 'Invalid fuel plan version or mode' using errcode='22023';end if;
 perform public.fuel_assert_text(p->'title',3,120);perform public.fuel_assert_text(p->'goal',0,2000);perform public.fuel_assert_text(p->'guidance',0,6000);
 first:=public.fuel_assert_date(p->'start');last:=public.fuel_assert_date(p->'end');if last<first then raise exception 'Invalid fuel plan date range' using errcode='22023';end if;
 if p->'event_date'<>'null'::jsonb then perform public.fuel_assert_date(p->'event_date');end if;
 if p->'review_on'<>'null'::jsonb then perform public.fuel_assert_date(p->'review_on');end if;
 if jsonb_typeof(p->'habits') is distinct from 'array' or jsonb_typeof(p->'phases') is distinct from 'array' or jsonb_typeof(p->'meals') is distinct from 'array' or jsonb_typeof(p->'grocery') is distinct from 'array' then raise exception 'Invalid fuel plan lists' using errcode='22023';end if;
 if jsonb_array_length(p->'habits')>6 or jsonb_array_length(p->'phases') not between 1 and 12 or jsonb_array_length(p->'meals')>30 or jsonb_array_length(p->'grocery')>100 then raise exception 'Fuel plan exceeds list limits' using errcode='22023';end if;
 if (select count(distinct x) from jsonb_array_elements(p->'habits') x)<>jsonb_array_length(p->'habits') then raise exception 'Duplicate fuel habits' using errcode='22023';end if;
 for v in select * from jsonb_array_elements(p->'habits') loop if jsonb_typeof(v)<>'string' or v#>>'{}' not in ('protein','fuel','water','steps','sleep','training') then raise exception 'Invalid fuel habit' using errcode='22023';end if;end loop;
 for phase in select value from jsonb_array_elements(p->'phases') order by value->>'start' loop
 perform public.fuel_assert_keys(phase,array['name','start','end','focus','training','rest']);perform public.fuel_assert_text(phase->'name',1,80);perform public.fuel_assert_text(phase->'focus',0,2000);
 a:=public.fuel_assert_date(phase->'start');b:=public.fuel_assert_date(phase->'end');
 if a<first or b>last or b<a or a<=previous_end then raise exception 'Fuel phases overlap or fall outside plan dates' using errcode='22023';end if;previous_end:=b;
 perform public.fuel_assert_targets(phase->'training');perform public.fuel_assert_targets(phase->'rest');end loop;
 for meal in select * from jsonb_array_elements(p->'meals') loop
 perform public.fuel_assert_keys(meal,array['name','day','serving','ingredients','swaps','targets']);perform public.fuel_assert_text(meal->'name',1,120);perform public.fuel_assert_text(meal->'serving',0,1000);perform public.fuel_assert_text(meal->'swaps',0,1000);
 if meal->>'day' is null or meal->>'day' not in ('training','rest','either') or jsonb_typeof(meal->'ingredients') is distinct from 'array' then raise exception 'Invalid meal context' using errcode='22023';end if;
 if jsonb_array_length(meal->'ingredients')>30 then raise exception 'Too many meal ingredients' using errcode='22023';end if;
 for v in select * from jsonb_array_elements(meal->'ingredients') loop perform public.fuel_assert_text(v,0,200);end loop;perform public.fuel_assert_targets(meal->'targets');end loop;
 for v in select * from jsonb_array_elements(p->'grocery') loop perform public.fuel_assert_text(v,0,200);end loop;
 end $$;
revoke all on function public.fuel_assert_keys(jsonb,text[]),public.fuel_assert_text(jsonb,integer,integer),public.fuel_assert_number(jsonb,numeric,numeric,boolean),public.fuel_assert_date(jsonb),public.fuel_assert_targets(jsonb),public.fuel_assert_plan(jsonb) from public,anon,authenticated,service_role;

create function public.execute_fuel_command(p_client_id uuid,p_command jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
 declare actor uuid:=auth.uid();action text;req uuid;prior public.fuel_command_receipts%rowtype;expected integer;rev integer;
 entity uuid;plan_id uuid;active_plan uuid;day date;k text;payload jsonb;result jsonb;entry public.fuel_journal_entries%rowtype;staff boolean;
 begin
 if actor is null or not public.fuel_can_access(p_client_id) then raise exception 'Fuel access denied' using errcode='42501';end if;
 if jsonb_typeof(p_command) is distinct from 'object' or octet_length(p_command::text)>100000 then raise exception 'Invalid fuel command' using errcode='22023';end if;
 action:=p_command->>'action';staff:=public.fuel_can_access(p_client_id,true);
 if action is null or action not in ('save_plan','release_plan','save_daily','save_checkin','review_checkin','record_body_comp') then raise exception 'Unsupported fuel command' using errcode='22023';end if;
 if (action in ('save_plan','release_plan','review_checkin','record_body_comp') and not staff) or (action in ('save_daily','save_checkin') and (actor<>p_client_id or staff)) then raise exception 'Fuel command role denied' using errcode='42501';end if;
 if jsonb_typeof(p_command->'request_id') is distinct from 'string' then raise exception 'Fuel request identity required' using errcode='22023';end if;req:=(p_command->>'request_id')::uuid;
 -- Serializes revisions and release changes per durable client, without touching client values.
 perform id from public.clients where id=p_client_id for update;
 select * into prior from public.fuel_command_receipts where request_id=req;
 if found then if prior.actor_id=actor and prior.client_id=p_client_id and prior.command=p_command then return prior.receipt||jsonb_build_object('deduped',true);end if;raise exception 'Fuel request ID was reused with different content' using errcode='40001';end if;
 if action='save_plan' then
 perform public.fuel_assert_keys(p_command,array['action','request_id','expected_revision','content','origin','source_reference']);
 perform public.fuel_assert_number(p_command->'expected_revision',0,1000000,true);if p_command->'expected_revision'='null'::jsonb then raise exception 'Revision required' using errcode='22023';end if;
 expected:=(p_command->>'expected_revision')::integer;select coalesce(max(revision),0)+1 into rev from public.fuel_plan_versions where client_id=p_client_id;
 if expected<>rev-1 then raise exception 'Fuel plan changed; refresh before saving' using errcode='40001';end if;
 perform public.fuel_assert_plan(p_command->'content');perform public.fuel_assert_text(p_command->'source_reference',0,500);
 if p_command->>'origin' is null or p_command->>'origin' not in ('coach_authored','source_transcription','ai_proposed') then raise exception 'Plan provenance required' using errcode='22023';end if;
 if p_command->>'origin'='source_transcription' and char_length(btrim(p_command->>'source_reference'))<3 then raise exception 'Transcribed plan needs a source reference' using errcode='22023';end if;
 insert into public.fuel_plan_versions(client_id,revision,content,origin,source_reference,created_by) values(p_client_id,rev,p_command->'content',p_command->>'origin',p_command->>'source_reference',actor) returning id into entity;
 elsif action='release_plan' then
 perform public.fuel_assert_keys(p_command,array['action','request_id','version_id','expected_sequence','confirmed','reason','individual_review_confirmed']);
 if p_command->'confirmed' is distinct from 'true'::jsonb or p_command->'individual_review_confirmed' is distinct from 'true'::jsonb then raise exception 'Explicit individual coach review required' using errcode='22023';end if;
 perform public.fuel_assert_text(p_command->'reason',10,2000);perform public.fuel_assert_number(p_command->'expected_sequence',0,1000000,true);
 if p_command->'expected_sequence'='null'::jsonb then raise exception 'Sequence required' using errcode='22023';end if;
 expected:=(p_command->>'expected_sequence')::integer;select coalesce(max(sequence),0)+1 into rev from public.fuel_plan_releases where client_id=p_client_id;
 if expected<>rev-1 then raise exception 'Active fuel plan changed; refresh' using errcode='40001';end if;
 plan_id:=(p_command->>'version_id')::uuid;
 if plan_id is not null and not exists(select 1 from public.fuel_plan_versions where id=plan_id and client_id=p_client_id) then raise exception 'Fuel plan belongs to a different client' using errcode='42501';end if;
 insert into public.fuel_plan_releases(client_id,version_id,sequence,reason,created_by) values(p_client_id,plan_id,rev,p_command->>'reason',actor) returning id into entity;
 elsif action in ('save_daily','save_checkin') then
 perform public.fuel_assert_keys(p_command,array['action','request_id','date','expected_revision','plan_version_id','payload']);
 day:=public.fuel_assert_date(p_command->'date');if day>(now() at time zone 'America/Los_Angeles')::date then raise exception 'Future entries cannot be reported as done' using errcode='22023';end if;
 perform public.fuel_assert_number(p_command->'expected_revision',0,1000000,true);if p_command->'expected_revision'='null'::jsonb then raise exception 'Revision required' using errcode='22023';end if;expected:=(p_command->>'expected_revision')::integer;
 k:=case when action='save_daily' then 'daily' else 'weekly' end;
 select coalesce(max(revision),0)+1 into rev from public.fuel_journal_entries where client_id=p_client_id and kind=k and entry_date=day;
 if expected<>rev-1 then raise exception 'Journal entry changed; refresh before editing' using errcode='40001';end if;
 plan_id:=(p_command->>'plan_version_id')::uuid;
 select version_id into active_plan from public.fuel_plan_releases where client_id=p_client_id order by sequence desc limit 1;
 if plan_id is not null and plan_id is distinct from active_plan then raise exception 'Fuel plan changed or is not released to this client' using errcode='40001';end if;
 payload:=p_command->'payload';
 if action='save_daily' then
 perform public.fuel_assert_keys(payload,array['day_type','habits','weight_lb','steps','sleep_hours','energy','hunger','note']);
 if payload->>'day_type' is null or payload->>'day_type' not in ('training','rest','unclassified') then raise exception 'Invalid day context' using errcode='22023';end if;
 perform public.fuel_assert_keys(payload->'habits',array['protein','fuel','water','steps','sleep','training']);
 for k in select jsonb_object_keys(payload->'habits') loop if payload->'habits'->k<>'null'::jsonb and (jsonb_typeof(payload->'habits'->k)<>'string' or payload->'habits'->>k not in ('met','missed','not_due')) then raise exception 'Invalid habit evidence' using errcode='22023';end if;end loop;
 perform public.fuel_assert_number(payload->'weight_lb',0.01,999);perform public.fuel_assert_number(payload->'steps',0,200000,true);perform public.fuel_assert_number(payload->'sleep_hours',0,24);perform public.fuel_assert_text(payload->'note',0,2000);
 else
 perform public.fuel_assert_keys(payload,array['hardest_moment','barriers','training','symptoms','upcoming','next_step','contact_requested','energy','hunger','sleep']);
 foreach k in array array['hardest_moment','barriers','symptoms','upcoming','next_step'] loop perform public.fuel_assert_text(payload->k,0,2000);end loop;
 if payload->>'training' is null or payload->>'training' not in ('stronger','same','flat','not_reported') or jsonb_typeof(payload->'contact_requested') is distinct from 'boolean' then raise exception 'Invalid check-in evidence' using errcode='22023';end if;
 perform public.fuel_assert_number(payload->'sleep',1,5,true);
 end if;
 perform public.fuel_assert_number(payload->'energy',1,5,true);perform public.fuel_assert_number(payload->'hunger',1,5,true);
 insert into public.fuel_journal_entries(client_id,kind,entry_date,revision,plan_version_id,payload,created_by) values(p_client_id,case when action='save_daily' then 'daily' else 'weekly' end,day,rev,plan_id,payload,actor) returning id into entity;
 elsif action='review_checkin' then
 perform public.fuel_assert_keys(p_command,array['action','request_id','entry_id','note','disposition','confirmed']);perform public.fuel_assert_text(p_command->'note',10,2000);
 if p_command->'confirmed' is distinct from 'true'::jsonb or p_command->>'disposition' is null or p_command->>'disposition' not in ('reviewed','contact','referral') then raise exception 'Explicit check-in review required' using errcode='22023';end if;
 select * into entry from public.fuel_journal_entries where id=(p_command->>'entry_id')::uuid and client_id=p_client_id and kind='weekly';
 if not found then raise exception 'Weekly check-in not found' using errcode='P0002';end if;
 if exists(select 1 from public.fuel_journal_entries where client_id=p_client_id and kind='weekly' and entry_date=entry.entry_date and revision>entry.revision) then raise exception 'Check-in changed; review the latest entry' using errcode='40001';end if;
 rev:=1;insert into public.fuel_coach_reviews(client_id,entry_id,note,disposition,created_by) values(p_client_id,entry.id,p_command->>'note',p_command->>'disposition',actor) returning id into entity;
 else
 perform public.fuel_assert_keys(p_command,array['action','request_id','date','weight_lb','body_fat_pct','lean_mass_lb','method','source_kind','source_reference','protocol','confirmed']);
 if p_command->'confirmed' is distinct from 'true'::jsonb then raise exception 'Measurement source review required' using errcode='22023';end if;
 day:=public.fuel_assert_date(p_command->'date');if day>(now() at time zone 'America/Los_Angeles')::date then raise exception 'Future measurements are projections, not results' using errcode='22023';end if;
 perform public.fuel_assert_number(p_command->'weight_lb',0.01,999);perform public.fuel_assert_number(p_command->'body_fat_pct',0,99.99);perform public.fuel_assert_number(p_command->'lean_mass_lb',0,999);
 if p_command->'weight_lb'='null'::jsonb or (p_command->>'lean_mass_lb')::numeric>(p_command->>'weight_lb')::numeric then raise exception 'Invalid measured mass' using errcode='22023';end if;
 foreach k in array array['weight_lb','body_fat_pct','lean_mass_lb'] loop if (p_command->>k)::numeric<>round((p_command->>k)::numeric,2) then raise exception 'Source precision exceeds body composition storage; review rounding explicitly' using errcode='22023';end if;end loop;
 if p_command->>'method' is null or p_command->>'method' not in ('bod_pod','dexa','inbody','scale','calipers') or p_command->>'source_kind' is null or p_command->>'source_kind' not in ('coach_measurement','source_transcription') then raise exception 'Measurement provenance required' using errcode='22023';end if;
 perform public.fuel_assert_text(p_command->'source_reference',3,500);perform public.fuel_assert_text(p_command->'protocol',0,2000);
 rev:=1;insert into public.body_comp_records(client_id,recorded_at,weight_lb,body_fat_pct,lean_mass_lb,method) values(p_client_id,day,(p_command->>'weight_lb')::numeric,(p_command->>'body_fat_pct')::numeric,(p_command->>'lean_mass_lb')::numeric,(p_command->>'method')::public.bodycomp_method) returning id into entity;
 insert into public.fuel_body_comp_sources(id,client_id,source_kind,source_reference,protocol,reported_values,created_by) values(entity,p_client_id,p_command->>'source_kind',p_command->>'source_reference',p_command->>'protocol',p_command-'action'-'request_id'-'confirmed',actor);
 end if;
 result:=jsonb_build_object('ok',true,'client_id',p_client_id,'request_id',req,'action',action,'entity_id',entity,'revision',rev,'deduped',false);
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),actor,'fuel.'||action,'fuel',entity,jsonb_build_object('client_id',p_client_id,'request_id',req,'revision',rev));
 insert into public.fuel_command_receipts(request_id,client_id,actor_id,command,receipt) values(req,p_client_id,actor,p_command,result);
 return result;
 end $$;
revoke all on function public.execute_fuel_command(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.execute_fuel_command(uuid,jsonb) to authenticated;
