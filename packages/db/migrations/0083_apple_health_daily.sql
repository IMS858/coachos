-- Optional Apple Health evidence. Client-controlled latest daily snapshots with sync timestamps.
-- No clinical records, diagnoses, nutrition intake, raw heart-rate streams or automatic prescriptions.
create table if not exists public.client_health_daily(
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete restrict,
 day date not null,
 source text not null check(source in ('apple_health')),
 steps integer check(steps is null or steps between 0 and 200000),
 active_energy_kcal numeric check(active_energy_kcal is null or active_energy_kcal between 0 and 20000),
 exercise_minutes numeric check(exercise_minutes is null or exercise_minutes between 0 and 1440),
 sleep_hours numeric check(sleep_hours is null or sleep_hours between 0 and 24),
 weight_lb numeric check(weight_lb is null or weight_lb between 1 and 999),
 weight_source text check(weight_source is null or char_length(weight_source)<=160),
 workout_minutes numeric check(workout_minutes is null or workout_minutes between 0 and 1440),
 workout_count integer check(workout_count is null or workout_count between 0 and 100),
 observed_types text[] not null default '{}',
 time_zone text check(time_zone is null or char_length(time_zone)<=100),
 utc_offset_minutes integer check(utc_offset_minutes is null or utc_offset_minutes between -840 and 840),
 synced_at timestamptz not null default clock_timestamp(),
 created_at timestamptz not null default clock_timestamp(),
 unique(client_id,day,source)
);
alter table public.client_health_daily enable row level security;
revoke all on public.client_health_daily from public,anon,authenticated,service_role;
grant select on public.client_health_daily to authenticated;
drop policy if exists client_health_daily_read on public.client_health_daily;
create policy client_health_daily_read on public.client_health_daily for select to authenticated using(
 exists(select 1 from public.profiles actor join public.clients c on c.id=client_health_daily.client_id join public.profiles subject on subject.id=c.id
 where actor.id=auth.uid() and actor.deleted_at is null and subject.deleted_at is null
 and (actor.role='owner' or (actor.role='trainer' and c.primary_trainer_id=actor.id) or (actor.role='client' and actor.id=client_health_daily.client_id)))
);
create or replace function public.sync_client_health_day(p_day date,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); prior public.client_health_daily%rowtype; rid uuid; types text[];
begin
 if actor is null or not exists(select 1 from public.clients c join public.profiles p on p.id=c.id where c.id=actor and c.status='active' and p.role='client' and p.deleted_at is null) then raise exception 'Active client authorization required' using errcode='42501';end if;
 if p_day is null or p_day>(now() at time zone 'America/Los_Angeles')::date+1 or p_day<(now() at time zone 'America/Los_Angeles')::date-90 then raise exception 'Health sync day outside allowed window' using errcode='22023';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('steps','active_energy_kcal','exercise_minutes','sleep_hours','weight_lb','workout_minutes','workout_count','observed_types','weight_source','time_zone','utc_offset_minutes')) then raise exception 'Unsupported health summary field' using errcode='22023';end if;
 if jsonb_typeof(coalesce(p_payload->'observed_types','[]'::jsonb)) is distinct from 'array' then raise exception 'Invalid observed health types' using errcode='22023';end if;
 select coalesce(array_agg(distinct v order by v),'{}') into types from jsonb_array_elements_text(coalesce(p_payload->'observed_types','[]'::jsonb)) v;
 if cardinality(types)=0 then raise exception 'Empty Health summaries are not evidence' using errcode='22023';end if;
 if octet_length(p_payload::text)>10000 then raise exception 'Health summary exceeds size limit' using errcode='22023';end if;
 if exists(select 1 from unnest(types) v where v not in ('steps','active_energy','exercise_minutes','sleep','weight','workouts')) then raise exception 'Unsupported observed health type' using errcode='22023';end if;
 if ('steps'=any(types)) is distinct from (p_payload ? 'steps')
  or ('active_energy'=any(types)) is distinct from (p_payload ? 'active_energy_kcal')
  or ('exercise_minutes'=any(types)) is distinct from (p_payload ? 'exercise_minutes')
  or ('sleep'=any(types)) is distinct from (p_payload ? 'sleep_hours')
  or ('weight'=any(types)) is distinct from (p_payload ? 'weight_lb')
  or ('workouts'=any(types)) is distinct from ((p_payload ? 'workout_minutes') and (p_payload ? 'workout_count'))
  or ((p_payload ? 'weight_source') and not('weight'=any(types)))
  or ('steps'=any(types) and jsonb_typeof(p_payload->'steps') is distinct from 'number')
  or ('active_energy'=any(types) and jsonb_typeof(p_payload->'active_energy_kcal') is distinct from 'number')
  or ('exercise_minutes'=any(types) and jsonb_typeof(p_payload->'exercise_minutes') is distinct from 'number')
  or ('sleep'=any(types) and jsonb_typeof(p_payload->'sleep_hours') is distinct from 'number')
  or ('weight'=any(types) and jsonb_typeof(p_payload->'weight_lb') is distinct from 'number')
  or ('workouts'=any(types) and (jsonb_typeof(p_payload->'workout_minutes') is distinct from 'number' or jsonb_typeof(p_payload->'workout_count') is distinct from 'number')) then
  raise exception 'Observed Health types and submitted values do not agree' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_day::text,0));
 select * into prior from public.client_health_daily where client_id=actor and day=p_day and source='apple_health' for update;
 if found then
  update public.client_health_daily set
   steps=case when 'steps'=any(types) then nullif(p_payload->>'steps','')::integer else null end,
   active_energy_kcal=case when 'active_energy'=any(types) then nullif(p_payload->>'active_energy_kcal','')::numeric else null end,
   exercise_minutes=case when 'exercise_minutes'=any(types) then nullif(p_payload->>'exercise_minutes','')::numeric else null end,
   sleep_hours=case when 'sleep'=any(types) then nullif(p_payload->>'sleep_hours','')::numeric else null end,
   weight_lb=case when 'weight'=any(types) then nullif(p_payload->>'weight_lb','')::numeric else null end,
   weight_source=case when 'weight'=any(types) then nullif(left(p_payload->>'weight_source',160),'') else null end,
   workout_minutes=case when 'workouts'=any(types) then nullif(p_payload->>'workout_minutes','')::numeric else null end,
   workout_count=case when 'workouts'=any(types) then nullif(p_payload->>'workout_count','')::integer else null end,
   observed_types=types,time_zone=nullif(left(p_payload->>'time_zone',100),''),utc_offset_minutes=nullif(p_payload->>'utc_offset_minutes','')::integer,synced_at=clock_timestamp()
  where id=prior.id returning id into rid;
 else
  insert into public.client_health_daily(client_id,day,source,steps,active_energy_kcal,exercise_minutes,sleep_hours,weight_lb,weight_source,workout_minutes,workout_count,observed_types,time_zone,utc_offset_minutes)
  values(actor,p_day,'apple_health',
   case when 'steps'=any(types) then nullif(p_payload->>'steps','')::integer end,
   case when 'active_energy'=any(types) then nullif(p_payload->>'active_energy_kcal','')::numeric end,
   case when 'exercise_minutes'=any(types) then nullif(p_payload->>'exercise_minutes','')::numeric end,
   case when 'sleep'=any(types) then nullif(p_payload->>'sleep_hours','')::numeric end,
   case when 'weight'=any(types) then nullif(p_payload->>'weight_lb','')::numeric end,
   case when 'weight'=any(types) then nullif(left(p_payload->>'weight_source',160),'') end,
   case when 'workouts'=any(types) then nullif(p_payload->>'workout_minutes','')::numeric end,
   case when 'workouts'=any(types) then nullif(p_payload->>'workout_count','')::integer end,
   types,nullif(left(p_payload->>'time_zone',100),''),nullif(p_payload->>'utc_offset_minutes','')::integer) returning id into rid;
 end if;
 return jsonb_build_object('ok',true,'id',rid,'client_id',actor,'day',p_day,'observed_types',types);
exception when numeric_value_out_of_range or check_violation or invalid_text_representation then raise exception 'Health summary value outside allowed bounds' using errcode='22023';
end $$;
revoke all on function public.sync_client_health_day(date,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.sync_client_health_day(date,jsonb) to authenticated;


create or replace function public.clear_my_client_health_data() returns jsonb
 language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); removed integer;
begin
 if actor is null or not exists(select 1 from public.profiles p where p.id=actor and p.role='client' and p.deleted_at is null) then raise exception 'Client authorization required' using errcode='42501';end if;
 delete from public.client_health_daily where client_id=actor;get diagnostics removed=row_count;
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),actor,'health.apple_data_cleared','client',actor,jsonb_build_object('removed_daily_summaries',removed));
 return jsonb_build_object('ok',true,'client_id',actor,'removed_daily_summaries',removed);
end $$;
revoke all on function public.clear_my_client_health_data() from public,anon,authenticated,service_role;
grant execute on function public.clear_my_client_health_data() to authenticated;
