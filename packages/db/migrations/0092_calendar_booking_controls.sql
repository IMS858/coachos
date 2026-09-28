-- Calendar controls: scoped, atomic, retry-safe; no backfill or client data edits.
alter table public.recurring_series add column if not exists end_date date;
alter table public.recurring_series add column if not exists interval_weeks integer not null default 1;
alter table public.recurring_series add column if not exists revision integer not null default 1;
alter table public.recurring_series add column if not exists replaces_series_id uuid references public.recurring_series(id);
alter table public.recurring_series add column if not exists notes text;
alter table public.sessions add column if not exists recurring_original_at timestamptz;

create table if not exists public.booking_command_receipts(
 request_id uuid primary key, actor_id uuid not null references public.profiles(id),
 command jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
alter table public.booking_command_receipts enable row level security;
revoke all on public.booking_command_receipts from public,anon,authenticated;
drop policy if exists booking_receipts_private on public.booking_command_receipts;
create policy booking_receipts_private on public.booking_command_receipts for all to anon,authenticated using(false) with check(false);
create or replace function public.guard_booking_receipt_history() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Booking receipts are append-only' using errcode='42501';end $$;
drop trigger if exists booking_receipts_immutable on public.booking_command_receipts;
create trigger booking_receipts_immutable before update or delete or truncate on public.booking_command_receipts for each statement execute function public.guard_booking_receipt_history();
revoke all on function public.guard_booking_receipt_history() from public,anon,authenticated;

-- Use a single lock for this small facility's scheduling writes, including classes
-- and blocks. The trigger sees every row, not an incomplete caller RLS projection.
create or replace function public.guard_calendar_overlap() returns trigger language plpgsql security definer set search_path='' as $$
declare begins timestamptz;finishes timestamptz;coach uuid;person uuid;ignored uuid;
begin
 if tg_op='UPDATE' then
  if tg_table_name='sessions' then
   if (new.trainer_id,new.client_id,new.scheduled_at,new.duration_minutes) is not distinct from (old.trainer_id,old.client_id,old.scheduled_at,old.duration_minutes)
    and old.status::text not in ('cancelled','late_cancelled','no_show') and new.status::text not in ('cancelled','late_cancelled','no_show') then return new;end if;
  elsif tg_table_name='class_occurrences' then
   if (new.trainer_id,new.starts_at,new.ends_at) is not distinct from (old.trainer_id,old.starts_at,old.ends_at) and old.status<>'cancelled' and new.status<>'cancelled' then return new;end if;
  end if;
 end if;
 if tg_table_name='sessions' then
  if new.status::text in ('cancelled','late_cancelled','no_show') then return new;end if;
  begins:=new.scheduled_at;finishes:=begins+make_interval(mins=>new.duration_minutes);coach:=new.trainer_id;person:=new.client_id;ignored:=new.id;
 elsif tg_table_name='class_occurrences' then
  if new.status='cancelled' then return new;end if;
  begins:=new.starts_at;finishes:=new.ends_at;coach:=new.trainer_id;
 else begins:=new.starts_at;finishes:=new.ends_at;coach:=new.trainer_id;end if;
 if begins is null or finishes is null or finishes<=begins then raise exception 'Invalid booking interval' using errcode='22023';end if;
 perform pg_advisory_xact_lock(90420260928);
 if exists(select 1 from public.sessions s where s.id is distinct from ignored and s.status::text not in ('cancelled','late_cancelled','no_show') and (s.trainer_id=coach or person is not null and s.client_id=person) and s.scheduled_at<finishes and s.scheduled_at+make_interval(mins=>s.duration_minutes)>begins)
 or exists(select 1 from public.class_occurrences c where (tg_table_name<>'class_occurrences' or c.id<>new.id) and c.status<>'cancelled' and c.trainer_id=coach and c.starts_at<finishes and c.ends_at>begins)
 or exists(select 1 from public.trainer_time_blocks b where (tg_table_name<>'trainer_time_blocks' or b.id<>new.id) and b.trainer_id=coach and b.starts_at<finishes and b.ends_at>begins)
 then raise exception 'Trainer, client, class or time-block conflict. Choose a different slot.' using errcode='23P01';end if;
 return new;
end $$;
revoke all on function public.guard_calendar_overlap() from public,anon,authenticated;
drop trigger if exists calendar_overlap_guard on public.sessions;
create trigger calendar_overlap_guard before insert or update of trainer_id,client_id,scheduled_at,duration_minutes,status on public.sessions for each row execute function public.guard_calendar_overlap();
drop trigger if exists calendar_overlap_guard on public.class_occurrences;
create trigger calendar_overlap_guard before insert or update of trainer_id,starts_at,ends_at,status on public.class_occurrences for each row execute function public.guard_calendar_overlap();
drop trigger if exists calendar_overlap_guard on public.trainer_time_blocks;
create trigger calendar_overlap_guard before insert or update of trainer_id,starts_at,ends_at on public.trainer_time_blocks for each row execute function public.guard_calendar_overlap();

-- Match the existing application rule: reject spring gaps, use the earlier
-- instant in the repeated fall-back hour, and never silently shift wall time.
create or replace function public.booking_pacific_instant(p_day date,p_time text) returns timestamptz language plpgsql immutable set search_path='' as $$
declare wall timestamp;candidate timestamptz;n integer;
begin
 if p_day is null or p_time is null or p_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid Pacific time' using errcode='22023';end if;
 wall:=p_day+p_time::time;
 foreach n in array array[7,8] loop candidate:=(wall at time zone 'UTC')+make_interval(hours=>n);if candidate at time zone 'America/Los_Angeles'=wall then return candidate;end if;end loop;
 raise exception 'This Pacific time does not exist during daylight saving changes' using errcode='22023';
end $$;
revoke all on function public.booking_pacific_instant(date,text) from public,anon,authenticated;

create or replace function public.fill_recurring_window(p_series_id uuid,p_until date) returns integer language plpgsql security invoker set search_path='' as $$
declare series public.recurring_series%rowtype;day date;last_day date;slot jsonb;instant timestamptz;made integer:=0;today date:=(now() at time zone 'America/Los_Angeles')::date;anchor date;
begin
 perform pg_advisory_xact_lock(90420260928);
 select * into series from public.recurring_series where id=p_series_id for update;
 if not found then raise exception 'Standing booking not found' using errcode='P0002';end if;
 if series.status::text<>'active' then return 0;end if;
 if not exists(select 1 from public.profiles where id=series.trainer_id and role::text in ('owner','trainer') and deleted_at is null)
 or not exists(select 1 from public.clients c join public.profiles p on p.id=c.id where c.id=series.client_id and p.role::text='client' and p.deleted_at is null) then raise exception 'Standing booking contains an inactive identity' using errcode='42501';end if;
 if p_until is null or p_until>greatest(today,series.start_date)+366 or series.interval_weeks not between 1 and 4 then raise exception 'Invalid rolling window' using errcode='22023';end if;
 last_day:=least(p_until,coalesce(series.end_date,p_until));
 day:=greatest(series.start_date,today,coalesce(series.generated_until+1,series.start_date));
 anchor:=date_trunc('week',series.start_date::timestamp)::date;
 while day<=last_day loop
  if ((date_trunc('week',day::timestamp)::date-anchor)/7)%series.interval_weeks=0 then
   for slot in select value from jsonb_array_elements(series.slots) loop
    if extract(dow from day)::integer=(slot->>'weekday')::integer then
     instant:=public.booking_pacific_instant(day,slot->>'time');
     if instant>now() and not exists(select 1 from public.sessions where recurring_series_id=series.id and (scheduled_at=instant or recurring_original_at=instant)) then
      insert into public.sessions(client_id,trainer_id,scheduled_at,duration_minutes,session_type,service_type,location,status,recurring_series_id,notes_pre)
      values(series.client_id,series.trainer_id,instant,series.duration_minutes,'training','training',series.location,'scheduled',series.id,series.notes);made:=made+1;
     end if;
    end if;
   end loop;
  end if;
  day:=day+1;
 end loop;
 if last_day>=coalesce(series.generated_until,series.start_date-1) then update public.recurring_series set generated_until=last_day where id=series.id;end if;
 if made>0 then insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),auth.uid(),'schedule.recurring_window','recurring_series',series.id,jsonb_build_object('created',made,'through',last_day,'executor',current_user,'billing_changed',false));end if;
 return made;
end $$;
revoke all on function public.fill_recurring_window(uuid,date) from public,anon,authenticated;
grant execute on function public.fill_recurring_window(uuid,date),public.booking_pacific_instant(date,text) to service_role;

create or replace function public.execute_booking_command(p_request_id uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();actor_role text;action text;receipt public.booking_command_receipts%rowtype;
 old_series public.recurring_series%rowtype;occurrence public.sessions%rowtype;client_id uuid;trainer_id uuid;
 series_id uuid;effective date;last_day date;duration integer;frequency integer;slots jsonb;slot jsonb;reason text;note text;place text;made integer:=0;cancelled integer:=0;result jsonb;new_time timestamptz;today date:=(now() at time zone 'America/Los_Angeles')::date;
begin
 select role::text into actor_role from public.profiles where id=actor and deleted_at is null;
 if actor is null or actor_role is null or actor_role not in ('owner','trainer') then raise exception 'Active staff required' using errcode='42501';end if;
 if p_request_id is null or jsonb_typeof(p_command) is distinct from 'object' or p_command->'confirmed' is distinct from 'true'::jsonb then raise exception 'Explicit booking confirmation required' using errcode='22023';end if;
 action:=p_command->>'action';reason:=btrim(coalesce(p_command->>'reason',''));
 if action is null or action not in ('create_series','replace_series','cancel_series','reschedule','cancel_occurrence') or length(reason)<5 or length(reason)>1000 then raise exception 'Valid action and reason required' using errcode='22023';end if;
 if exists(select 1 from jsonb_object_keys(p_command) k where k not in ('action','confirmed','reason','series_id','session_id','expected_revision','expected_updated_at','client_id','trainer_id','start_date','end_date','interval_weeks','duration_minutes','slots','location','notes','scheduled_at')) then raise exception 'Unsupported booking fields' using errcode='22023';end if;
 perform pg_advisory_xact_lock(90420260928);
 if action in ('replace_series','cancel_series') then
  select * into old_series from public.recurring_series where id=(p_command->>'series_id')::uuid for update;
  if not found then raise exception 'Standing booking not found' using errcode='P0002';end if;
  client_id:=old_series.client_id;trainer_id:=old_series.trainer_id;
 elsif action in ('reschedule','cancel_occurrence') then
  select * into occurrence from public.sessions where id=(p_command->>'session_id')::uuid for update;
  if not found then raise exception 'Session not found' using errcode='P0002';end if;
  client_id:=occurrence.client_id;trainer_id:=occurrence.trainer_id;
 else client_id:=(p_command->>'client_id')::uuid;trainer_id:=(p_command->>'trainer_id')::uuid;end if;
 if client_id is null or trainer_id is null or not exists(select 1 from public.clients c join public.profiles p on p.id=c.id where c.id=client_id and p.role::text='client' and p.deleted_at is null)
 or not exists(select 1 from public.profiles p where p.id=trainer_id and p.role::text in ('owner','trainer') and p.deleted_at is null) then raise exception 'Active client and trainer required' using errcode='42501';end if;
 if actor_role<>'owner' and (trainer_id<>actor or not exists(select 1 from public.clients c where c.id=client_id and c.primary_trainer_id=actor)) then raise exception 'Assigned coach or owner required' using errcode='42501';end if;
 select * into receipt from public.booking_command_receipts where request_id=p_request_id;
 if found then
  if receipt.actor_id is distinct from actor or receipt.command is distinct from p_command then raise exception 'Request ID already belongs to different work' using errcode='22023';end if;
  return receipt.result||jsonb_build_object('deduped',true);
 end if;
 if action in ('reschedule','cancel_occurrence') then
  if occurrence.updated_at is distinct from (p_command->>'expected_updated_at')::timestamptz then raise exception 'Session changed. Refresh before editing.' using errcode='40001';end if;
  if occurrence.status::text not in ('scheduled','confirmed') or occurrence.scheduled_at<=now() or occurrence.completed_at is not null then raise exception 'Only future scheduled or confirmed sessions may be changed here' using errcode='22023';end if;
  if action='cancel_occurrence' then
   if actor_role<>'owner' then raise exception 'Owner required for a no-charge administrative cancellation' using errcode='42501';end if;
   update public.sessions set status='cancelled',cancelled_at=clock_timestamp(),cancelled_by=actor,cancellation_reason=reason where id=occurrence.id;
  else
   new_time:=(p_command->>'scheduled_at')::timestamptz;duration:=(p_command->>'duration_minutes')::integer;
   if new_time is null or not isfinite(new_time) or new_time<=now() or duration is null or duration not between 1 and 480 then raise exception 'Choose a future time and valid duration' using errcode='22023';end if;
   update public.sessions set scheduled_at=new_time,duration_minutes=duration,recurring_original_at=case when recurring_series_id is not null then coalesce(recurring_original_at,occurrence.scheduled_at) else recurring_original_at end where id=occurrence.id;
  end if;
  result:=jsonb_build_object('ok',true,'request_id',p_request_id,'action',action,'session_id',occurrence.id,'deduped',false,'charged',false);
  insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),actor,'schedule.'||action,'session',occurrence.id,jsonb_build_object('request_id',p_request_id,'before_time',occurrence.scheduled_at,'before_duration',occurrence.duration_minutes,'after_time',new_time,'reason',reason,'billing_changed',false));
 else
  if action<>'create_series' and (old_series.revision is distinct from (p_command->>'expected_revision')::integer or old_series.status::text='cancelled') then raise exception 'Standing booking changed. Refresh before editing.' using errcode='40001';end if;
  if action='cancel_series' then
   update public.sessions set status='cancelled',cancelled_at=clock_timestamp(),cancelled_by=actor,cancellation_reason='standing_series_cancelled: '||reason where recurring_series_id=old_series.id and scheduled_at>now() and status::text in ('scheduled','confirmed') and completed_at is null;get diagnostics cancelled=row_count;
   update public.recurring_series set status='cancelled',revision=revision+1,updated_at=clock_timestamp() where id=old_series.id;series_id:=old_series.id;
  else
   if coalesce(p_command->>'start_date','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or p_command->>'end_date' is not null and (p_command->>'end_date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Use explicit calendar dates' using errcode='22023';end if;
   effective:=(p_command->>'start_date')::date;last_day:=nullif(p_command->>'end_date','')::date;duration:=(p_command->>'duration_minutes')::integer;frequency:=(p_command->>'interval_weeks')::integer;slots:=p_command->'slots';note:=nullif(btrim(p_command->>'notes'),'');place:=nullif(btrim(p_command->>'location'),'');
   if effective is null or effective<today or effective>today+730 or last_day<effective or last_day>effective+730 or duration is null or duration not between 15 and 180 or frequency is null or frequency not between 1 and 4 then raise exception 'Invalid recurring dates, interval or duration' using errcode='22023';end if;
   if jsonb_typeof(slots) is distinct from 'array' or jsonb_array_length(slots) not between 1 and 4 or length(coalesce(note,''))>4000 or length(coalesce(place,''))>200 then raise exception 'Choose 1–4 weekly slots and bounded notes' using errcode='22023';end if;
   for slot in select value from jsonb_array_elements(slots) loop
    if jsonb_typeof(slot) is distinct from 'object' or jsonb_typeof(slot->'weekday') is distinct from 'number' or (slot->>'weekday')!~'^[0-6]$' or coalesce(slot->>'time','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or (select count(*) from jsonb_object_keys(slot))<>2 then raise exception 'Invalid weekly slot' using errcode='22023';end if;
   end loop;
   if (select count(distinct (value->>'weekday',value->>'time')) from jsonb_array_elements(slots))<>jsonb_array_length(slots) then raise exception 'Duplicate weekly slots' using errcode='22023';end if;
   if action='replace_series' then
    if (p_command->>'client_id')::uuid is distinct from client_id or (p_command->>'trainer_id')::uuid is distinct from trainer_id then raise exception 'Changing series identities is not supported' using errcode='22023';end if;
    -- Do not silently erase a one-occurrence exception or regenerate attendance.
    if exists(select 1 from public.sessions s where s.recurring_series_id=old_series.id and s.scheduled_at>now() and (s.scheduled_at at time zone 'America/Los_Angeles')::date>=effective and (s.status::text not in ('scheduled','confirmed') or s.recurring_original_at is not null or s.completed_at is not null)) then raise exception 'Future exceptions exist. Preserve them by editing individual occurrences or choosing a later effective date.' using errcode='22023';end if;
    perform public.fill_recurring_window(old_series.id,effective-1);
    update public.sessions set status='cancelled',cancelled_at=clock_timestamp(),cancelled_by=actor,cancellation_reason='standing_series_replaced: '||reason where recurring_series_id=old_series.id and scheduled_at>now() and (scheduled_at at time zone 'America/Los_Angeles')::date>=effective and status::text in ('scheduled','confirmed');get diagnostics cancelled=row_count;
    update public.recurring_series set status='cancelled',revision=revision+1,updated_at=clock_timestamp() where id=old_series.id;
   end if;
   series_id:=gen_random_uuid();
   insert into public.recurring_series(id,client_id,trainer_id,session_type,duration_minutes,location,slots,status,start_date,end_date,interval_weeks,created_by,replaces_series_id,notes)
   values(series_id,client_id,trainer_id,'training',duration,place,slots,'active',effective,last_day,frequency,actor,case when action='replace_series' then old_series.id else null end,note);
   made:=public.fill_recurring_window(series_id,effective+56);
   if made=0 then raise exception 'No future occurrences fall inside this date range. Choose another start or end date.' using errcode='22023';end if;
  end if;
  result:=jsonb_build_object('ok',true,'request_id',p_request_id,'action',action,'series_id',series_id,'created',made,'cancelled',cancelled,'deduped',false,'charged',false);
  insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),actor,'schedule.'||action,'recurring_series',series_id,jsonb_build_object('request_id',p_request_id,'previous_series_id',old_series.id,'created',made,'cancelled',cancelled,'reason',reason,'billing_changed',false));
 end if;
 insert into public.booking_command_receipts(request_id,actor_id,command,result) values(p_request_id,actor,p_command,result);
 return result;
end $$;
revoke all on function public.execute_booking_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.execute_booking_command(uuid,jsonb) to authenticated;

-- No direct series edits can bypass receipt, scope and occurrence reconciliation.
drop policy if exists recurring_staff_all on public.recurring_series;
drop policy if exists recurring_client_read on public.recurring_series;
drop policy if exists recurring_scoped_read on public.recurring_series;
create policy recurring_scoped_read on public.recurring_series for select to authenticated using(
 exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.deleted_at is null and (me.role::text='owner' or me.role::text='trainer' and trainer_id=me.id or me.role::text='client' and client_id=me.id))
);
revoke all on public.recurring_series from public,anon,authenticated;
grant select on public.recurring_series to authenticated;
grant select,insert,update on public.recurring_series to service_role;

-- Keep the legacy cancellation URL fail-closed instead of relying on an absent function.
create or replace function public.cancel_recurring_series(p_series_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception 'Use the reviewed booking command with request identity and expected revision' using errcode='22023';end $$;
revoke all on function public.cancel_recurring_series(uuid) from public,anon,authenticated;

-- One-time creation shares the same serialized conflict checks and immutable
-- request receipts. Closing the old OR-assignment bypass does not broaden RLS.
create or replace function public.create_staff_session(p_id uuid,p_body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();actor_role text;assigned uuid;requested_client uuid;requested_trainer uuid;requested_at timestamptz;duration integer;kind text;service text;mode text;result jsonb;completion jsonb;prior public.booking_command_receipts%rowtype;
begin
 select role::text into actor_role from public.profiles where id=actor and deleted_at is null;
 if actor is null or actor_role is null or actor_role not in ('owner','trainer') then raise exception 'Staff authorization required' using errcode='42501';end if;
 if p_id is null or jsonb_typeof(p_body) is distinct from 'object' or (p_body->>'request_id')::uuid is distinct from p_id then raise exception 'Invalid session request identity' using errcode='22023';end if;
 if exists(select 1 from jsonb_object_keys(p_body) k where k not in ('mode','client_id','trainer_id','scheduled_at','duration_minutes','session_type','service_type','notes_pre','notes_post','request_id')) then raise exception 'Unsupported session field' using errcode='22023';end if;
 mode:=p_body->>'mode';kind:=p_body->>'session_type';service:=p_body->>'service_type';
 requested_client:=(p_body->>'client_id')::uuid;requested_trainer:=(p_body->>'trainer_id')::uuid;requested_at:=(p_body->>'scheduled_at')::timestamptz;duration:=(p_body->>'duration_minutes')::integer;
 if mode is null or mode not in ('schedule','log') or kind is null or kind not in ('training','assessment') or requested_client is null or requested_trainer is null or requested_at is null or not isfinite(requested_at) or duration is null or duration not between 1 and 480 then raise exception 'Invalid session details' using errcode='22023';end if;
 if kind='training' and service is distinct from 'training' or kind='assessment' and service is not null then raise exception 'Service does not match session type' using errcode='22023';end if;
 if (p_body->'notes_pre' is not null and jsonb_typeof(p_body->'notes_pre') not in ('string','null')) or (p_body->'notes_post' is not null and jsonb_typeof(p_body->'notes_post') not in ('string','null')) then raise exception 'Notes must be text or null' using errcode='22023';end if;
 if coalesce(length(p_body->>'notes_pre'),0)>4000 or coalesce(length(p_body->>'notes_post'),0)>4000 then raise exception 'Session notes are too long' using errcode='22023';end if;
 select c.primary_trainer_id into assigned from public.clients c join public.profiles p on p.id=c.id where c.id=requested_client and p.role::text='client' and p.deleted_at is null;
 if not found or not exists(select 1 from public.profiles where id=requested_trainer and role::text in ('owner','trainer') and deleted_at is null) then raise exception 'Active client and trainer required' using errcode='42501';end if;
 if actor_role<>'owner' and (requested_trainer is distinct from actor or assigned is distinct from actor) then raise exception 'Assigned coach or owner required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(90420260928);
 select * into prior from public.booking_command_receipts where request_id=p_id;
 if found then
  if prior.actor_id is distinct from actor or prior.command is distinct from p_body then raise exception 'Session retry does not match original request' using errcode='22023';end if;
  return prior.result||jsonb_build_object('deduped',true);
 end if;
 if exists(select 1 from public.sessions where id=p_id) then raise exception 'Original request receipt unavailable. Open the existing session before retrying.' using errcode='22023';end if;
 if mode='schedule' and requested_at<=now() or mode='log' and requested_at>now() then raise exception 'Scheduled work must be future; completed work cannot be future' using errcode='22023';end if;
 insert into public.sessions(id,client_id,trainer_id,scheduled_at,duration_minutes,session_type,service_type,status,notes_pre,notes_post)
 values(p_id,requested_client,requested_trainer,requested_at,duration,kind::public.session_type,service::public.service_type,'scheduled',p_body->>'notes_pre',p_body->>'notes_post');
 if mode='log' then completion:=public.set_session_completion(p_id,true,service);end if;
 result:=jsonb_build_object('ok',true,'session_id',p_id,'deduped',false,'counter',completion->'counter');
 insert into public.audit_logs(id,actor_id,action,entity_type,entity_id,changes) values(gen_random_uuid(),actor,'schedule.create_session','session',p_id,jsonb_build_object('request_id',p_id,'mode',mode,'completed',mode='log'));
 insert into public.booking_command_receipts(request_id,actor_id,command,result) values(p_id,actor,p_body,result);
 return result;
end $$;
revoke all on function public.create_staff_session(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_staff_session(uuid,jsonb) to authenticated;
