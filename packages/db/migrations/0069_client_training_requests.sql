-- Client requests are pending coaching work, not a confirmed reservation or payment.
-- Requires the existing staff-availability migration, class_occurrences and audit_logs.
-- No class booking command, package counter, payment or payroll function is enabled here.
create table if not exists public.client_training_requests (
  id uuid primary key,
  client_id uuid not null references public.clients(id) on delete restrict,
  session_id uuid not null unique references public.sessions(id) on delete restrict,
  requested_start timestamptz not null,
  request_note text not null check (char_length(request_note)<=500),
  created_at timestamptz not null default now()
);
alter table public.client_training_requests enable row level security;
revoke all on public.client_training_requests from public,anon,authenticated;

-- Internal policy shared by discovery and the final write. No caller can invoke this
-- for an arbitrary trainer; only the two scoped commands below can call it.
create or replace function public.client_training_slot_available(p_trainer uuid,p_when timestamptz)
returns boolean language plpgsql security invoker set search_path='' as $$
declare local_start timestamp:=p_when at time zone 'America/Los_Angeles';
  local_end timestamp:=(p_when+interval '60 minutes') at time zone 'America/Los_Angeles';
  v_weekday integer:=extract(dow from local_start); start_min integer:=extract(hour from local_start)*60+extract(minute from local_start);
  end_min integer:=extract(hour from local_end)*60+extract(minute from local_end);
begin
  if p_when is null or not isfinite(p_when) then return false; end if;
  if p_when<now()+interval '60 minutes' or p_when>now()+interval '60 days' then return false; end if;
  if v_weekday=0 or extract(second from local_start)<>0 or extract(minute from local_start)::integer not in (0,30)
    or local_end::date<>local_start::date or start_min<(case when v_weekday=6 then 480 else 360 end)
    or end_min>(case when v_weekday=6 then 780 else 1140 end) then return false; end if;
  if exists(select 1 from public.trainer_availability_rules where trainer_id=p_trainer and active)
    and not exists(select 1 from public.trainer_availability_rules r where r.trainer_id=p_trainer and r.active and r.weekday=v_weekday
      and local_start::time>=r.start_time and local_end::time<=r.end_time) then return false; end if;
  -- An unknown active duration is not a free interval.
  if exists(select 1 from public.sessions s where s.trainer_id=p_trainer and s.status::text in ('requested','scheduled','confirmed')
    and s.scheduled_at<p_when+interval '60 minutes' and (s.duration_minutes is null or s.duration_minutes<1 or s.duration_minutes>480)) then
    raise exception 'Schedule duration evidence requires review' using errcode='23514';
  end if;
  if exists(select 1 from public.sessions s where s.trainer_id=p_trainer and s.status::text in ('requested','scheduled','confirmed')
    and s.scheduled_at<p_when+interval '60 minutes' and s.scheduled_at+make_interval(mins=>s.duration_minutes)>p_when) then return false; end if;
  if exists(select 1 from public.class_occurrences c where c.trainer_id=p_trainer and c.status<>'cancelled'
    and c.starts_at<p_when+interval '60 minutes' and c.ends_at>p_when) then return false; end if;
  if exists(select 1 from public.trainer_time_blocks b where b.trainer_id=p_trainer and b.starts_at<p_when+interval '60 minutes' and b.ends_at>p_when) then return false; end if;
  return true;
end $$;
revoke all on function public.client_training_slot_available(uuid,timestamptz) from public,anon,authenticated;

create or replace function public.get_my_training_availability(p_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); coach uuid; times jsonb:='[]'::jsonb; minute integer; instant timestamptz;
begin
  if actor is null or not exists(select 1 from public.profiles where id=actor and role='client' and deleted_at is null) then
    raise exception 'Active client account required' using errcode='42501'; end if;
  select primary_trainer_id into coach from public.clients where id=actor;
  if coach is null or not exists(select 1 from public.profiles where id=coach and role in ('owner','trainer') and deleted_at is null) then
    raise exception 'An active primary coach is required' using errcode='23514'; end if;
  if p_date is null or not isfinite(p_date) or p_date<(now() at time zone 'America/Los_Angeles')::date or p_date>(now() at time zone 'America/Los_Angeles')::date+60 then
    raise exception 'Choose a date within the next 60 days' using errcode='22023'; end if;
  for minute in 360..1080 by 30 loop
    instant:=(p_date::timestamp+make_interval(mins=>minute)) at time zone 'America/Los_Angeles';
    if public.client_training_slot_available(coach,instant) then times:=times||jsonb_build_array(to_char(p_date::timestamp+make_interval(mins=>minute),'HH24:MI')); end if;
  end loop;
  return jsonb_build_object('ok',true,'date',p_date::text,'duration_minutes',60,'slots',times);
end $$;
revoke all on function public.get_my_training_availability(date) from public,anon,authenticated;
grant execute on function public.get_my_training_availability(date) to authenticated;

create or replace function public.request_client_training_session(p_id uuid,p_when timestamptz,p_note text default '')
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare actor uuid:=auth.uid(); coach uuid; prior public.client_training_requests%rowtype; current_status text; note text:=btrim(coalesce(p_note,''));
begin
  if actor is null or not exists(select 1 from public.profiles where id=actor and role='client' and deleted_at is null) then
    raise exception 'Active client account required' using errcode='42501'; end if;
  if p_id is null or p_when is null or not isfinite(p_when) or char_length(coalesce(p_note,''))>500 then
    raise exception 'Invalid training request' using errcode='22023'; end if;
  -- Short write-only serialization gate for this low-volume studio. Ordinary reads
  -- continue. It covers legacy writers without relying on them to take an advisory lock.
  -- No network/email operation belongs inside this transaction.
  lock table public.sessions,public.class_occurrences,public.trainer_time_blocks,public.trainer_availability_rules in share row exclusive mode;
  select * into prior from public.client_training_requests where id=p_id;
  if found then
    if prior.client_id<>actor or prior.requested_start is distinct from p_when or prior.request_note is distinct from note then
      raise exception 'Request reference does not match the original request' using errcode='23514'; end if;
    select status::text into current_status from public.sessions where id=prior.session_id and client_id=actor;
    if not found then raise exception 'Request history requires reconciliation' using errcode='23514'; end if;
    return jsonb_build_object('ok',true,'id',prior.session_id,'status',current_status,'deduped',true);
  end if;
  select primary_trainer_id into coach from public.clients where id=actor for update;
  if coach is null or not exists(select 1 from public.profiles where id=coach and role in ('owner','trainer') and deleted_at is null) then
    raise exception 'An active primary coach is required' using errcode='23514'; end if;
  if (select count(*) from public.sessions where client_id=actor and status='requested')>=5 then
    raise exception 'You already have five pending requests' using errcode='P0100'; end if;
  if not public.client_training_slot_available(coach,p_when) then
    raise exception 'That time is unavailable. Refresh and choose another slot' using errcode='23514'; end if;
  insert into public.sessions(id,client_id,trainer_id,scheduled_at,duration_minutes,session_type,status,notes_pre)
    values(p_id,actor,coach,p_when,60,'training','requested',nullif(note,''));
  insert into public.client_training_requests(id,client_id,session_id,requested_start,request_note) values(p_id,actor,p_id,p_when,note);
  insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes)
    values(gen_random_uuid(),actor,'session.requested','session',p_id,jsonb_build_object('trainer_id',coach,'scheduled_at',p_when,'status','requested'));
  return jsonb_build_object('ok',true,'id',p_id,'status','requested','deduped',false);
end $$;
revoke all on function public.request_client_training_session(uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.request_client_training_session(uuid,timestamptz,text) to authenticated;
