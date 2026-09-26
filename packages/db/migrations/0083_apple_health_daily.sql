-- Optional Apple Health evidence. Client-controlled, append-only daily summaries.
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
 workout_minutes numeric check(workout_minutes is null or workout_minutes between 0 and 1440),
 workout_count integer check(workout_count is null or workout_count between 0 and 100),
 available_types text[] not null default '{}',
 authorization_window_start date,
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
declare actor uuid:=auth.uid(); prior public.client_health_daily%rowtype; rid uuid; types text[]; window_start date;
begin
 if actor is null or not exists(select 1 from public.clients c join public.profiles p on p.id=c.id where c.id=actor and c.status='active' and p.role='client' and p.deleted_at is null) then raise exception 'Active client authorization required' using errcode='42501';end if;
 if p_day is null or p_day>(now() at time zone 'America/Los_Angeles')::date or p_day<(now() at time zone 'America/Los_Angeles')::date-90 then raise exception 'Health sync day outside allowed window' using errcode='22023';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('steps','active_energy_kcal','exercise_minutes','sleep_hours','weight_lb','workout_minutes','workout_count','available_types','authorization_window_start')) then raise exception 'Unsupported health summary field' using errcode='22023';end if;
 if jsonb_typeof(coalesce(p_payload->'available_types','[]'::jsonb)) is distinct from 'array' then raise exception 'Invalid available health types' using errcode='22023';end if;
 select coalesce(array_agg(v order by v),'{}') into types from jsonb_array_elements_text(coalesce(p_payload->'available_types','[]'::jsonb)) v;
 if exists(select 1 from unnest(types) v where v not in ('steps','active_energy','exercise_minutes','sleep','weight','workouts')) then raise exception 'Unsupported available health type' using errcode='22023';end if;
 begin window_start:=nullif(p_payload->>'authorization_window_start','')::date; exception when others then raise exception 'Invalid authorization window' using errcode='22023';end;
 if window_start is not null and window_start>p_day then raise exception 'Authorization window starts after summary day' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_day::text,0));
 select * into prior from public.client_health_daily where client_id=actor and day=p_day and source='apple_health' for update;
 if found then
  update public.client_health_daily set
   steps=case when 'steps'=any(types) then nullif(p_payload->>'steps','')::integer else null end,
   active_energy_kcal=case when 'active_energy'=any(types) then nullif(p_payload->>'active_energy_kcal','')::numeric else null end,
   exercise_minutes=case when 'exercise_minutes'=any(types) then nullif(p_payload->>'exercise_minutes','')::numeric else null end,
   sleep_hours=case when 'sleep'=any(types) then nullif(p_payload->>'sleep_hours','')::numeric else null end,
   weight_lb=case when 'weight'=any(types) then nullif(p_payload->>'weight_lb','')::numeric else null end,
   workout_minutes=case when 'workouts'=any(types) then nullif(p_payload->>'workout_minutes','')::numeric else null end,
   workout_count=case when 'workouts'=any(types) then nullif(p_payload->>'workout_count','')::integer else null end,
   available_types=types,authorization_window_start=window_start,synced_at=clock_timestamp()
  where id=prior.id returning id into rid;
 else
  insert into public.client_health_daily(client_id,day,source,steps,active_energy_kcal,exercise_minutes,sleep_hours,weight_lb,workout_minutes,workout_count,available_types,authorization_window_start)
  values(actor,p_day,'apple_health',
   case when 'steps'=any(types) then nullif(p_payload->>'steps','')::integer end,
   case when 'active_energy'=any(types) then nullif(p_payload->>'active_energy_kcal','')::numeric end,
   case when 'exercise_minutes'=any(types) then nullif(p_payload->>'exercise_minutes','')::numeric end,
   case when 'sleep'=any(types) then nullif(p_payload->>'sleep_hours','')::numeric end,
   case when 'weight'=any(types) then nullif(p_payload->>'weight_lb','')::numeric end,
   case when 'workouts'=any(types) then nullif(p_payload->>'workout_minutes','')::numeric end,
   case when 'workouts'=any(types) then nullif(p_payload->>'workout_count','')::integer end,
   types,window_start) returning id into rid;
 end if;
 return jsonb_build_object('ok',true,'id',rid,'client_id',actor,'day',p_day,'available_types',types);
exception when numeric_value_out_of_range or check_violation or invalid_text_representation then raise exception 'Health summary value outside allowed bounds' using errcode='22023';
end $$;
revoke all on function public.sync_client_health_day(date,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.sync_client_health_day(date,jsonb) to authenticated;
